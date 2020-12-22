const indexedDBConfig = {
  'box': {
    'dbName': "boxCreds",
    'objectStoreName': "oauth"
  },
  'wsi': {
    'dbName': "wsiPreds",
    'objectStoreNamePrefix': "tilePredictions",
    'objectStoreOpts': {
      'keyPath': ["x", "y", "width", "height"]
    }
  }
}

let boxCredsDB, wsiPredsDB

utils = {
  request: (url, opts) => 
    fetch(url, opts)
    .then(res => {
      if (res.ok) {
        return res
      } else {
        throw Error(res.status)
      }
    })
}

const fetchIndexedDBInstance = (key) => new Promise(resolve => {
  indexedDB.open(indexedDBConfig[key].dbName).onsuccess = (evt) => {
    dbInstance = evt.target.result
    resolve(dbInstance)
  }
})

const createFolderInBox = (folderName, parentFolderId=0) => new Promise(resolve => {
  const createFolderEndpoint = "https://api.box.com/2.0/folders"
  const folderDetails = {
    'name': folderName,
    'parent': {
      'id': parentFolderId
    }
  }
  boxCredsDB.transaction(indexedDBConfig['box'].objectStoreName, "readonly").objectStore(indexedDBConfig['box'].objectStoreName).get(1).onsuccess = async (evt) => {
    const accessToken = evt.target.result.access_token
    const requestOpts = {
      'method': "POST",
      'headers': {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      'body': JSON.stringify(folderDetails)
    }
    const resp = await utils.request(createFolderEndpoint, requestOpts)
    resolve(await resp.json())
  }
})

const getDataFromBox = (id, type="file", fields=[]) => {
  return new Promise(resolve => {
    boxCredsDB.transaction(indexedDBConfig['box'].objectStoreName, "readonly").objectStore(indexedDBConfig['box'].objectStoreName).get(1).onsuccess = async (evt) => {
      const accessToken = evt.target.result.access_token
      const defaultFields = ["id", "type", "name"]
      const fieldsToRequest = [... new Set(defaultFields.concat(fields)) ].join(",")
      const fieldsParam = `fields=${fieldsToRequest}`
      let dataEndpoint = `https://api.box.com/2.0/${type}s/${id}?${fieldsParam}`
      const resp = await utils.request(dataEndpoint, {
        'headers': {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      resolve(await resp.json())
    }
  })
}

const getFileContentFromBox = (id, urlOnly=false, responseType="json") => {
  const contentEndpoint = `https://api.box.com/2.0/files/${id}/content`
  
  return new Promise(async (resolve) => {
    boxCredsDB = await fetchIndexedDBInstance('box')
    boxCredsDB.transaction(indexedDBConfig['box'].objectStoreName, "readonly").objectStore(indexedDBConfig['box'].objectStoreName).get(1).onsuccess = async (evt) => {
      const { access_token: accessToken } = evt.target.result
      const requestOpts = {
        'headers': {
          'Authorization': `Bearer ${accessToken}`
        }
      }
      let resp = undefined

      try {
        if (urlOnly) {
          const ac = new AbortController()
          requestOpts['signal'] = ac.signal
          resp = await utils.request(contentEndpoint, requestOpts)
          ac.abort()
          resolve(resp.url)
        } else {
          resp = await utils.request(contentEndpoint, requestOpts)
    
          if (responseType === "json") {
            resp = await resp.json()
          } else if (responseType === "buffer") {
            resp = await resp.arrayBuffer()
          } else if (responseType === "blob") {
            resp = await resp.blob()
          } else {
            resp = await resp.text()
          }
          resolve(resp)
        }
      } catch (e) {
        if (e.message === "404") {
          throw Error(e.message)
        }
      }
    }
  })
}

const uploadFileToBox = (data, id) => {
  const uploadEndpoint = id ? `https://upload.box.com/api/2.0/files/${id}/content` : `https://upload.box.com/api/2.0/files/content`

  return new Promise (async (resolve) => {
    boxCredsDB.transaction(indexedDBConfig['box'].objectStoreName, "readonly").objectStore(indexedDBConfig['box'].objectStoreName).get(1).onsuccess = async (evt) => {
      const { access_token: accessToken } = evt.target.result

      const requestOpts = {
        'method': "POST",
        'body': data,
        'headers': {
          'Authorization': `Bearer ${accessToken}`
        }
      }
      const resp = await utils.request(uploadEndpoint, requestOpts)
      resolve(await resp.json())
    }
  })
}

const updateMetadataInBox = (id, path, updateData) => new Promise(resolve => {
  const updateMetadataEndpoint = `https://api.box.com/2.0/files/${id}/metadata/global/properties`
	const updatePatch = [{
	  'op': "add",
	  path,
	  'value': updateData
  }]
  
  boxCredsDB.transaction(indexedDBConfig['box'].objectStoreName, "readonly").objectStore(indexedDBConfig['box'].objectStoreName).get(1).onsuccess = async (evt) => {
    const { access_token: accessToken } = evt.target.result
    const requestOpts = {
      'method': "PUT",
      'headers': {
        'Content-Type': "application/json-patch+json",
        'Authorization': `Bearer ${accessToken}`
      },
      'body': JSON.stringify(updatePatch)
    }
    const resp = await utils.request(updateMetadataEndpoint, requestOpts)
    resolve(await resp.json())
  }
})

const getPredsFromBox = async (imageId, annotationId, modelId, datasetConfig, wsiPredsFiles=[]) => {
  let datasetConfigChanged = false
  let fileMetadataChanged = false

  let wsiPredsFileId = wsiPredsFiles.find(file => file.annotationId === annotationId && file.modelId === modelId)?.fileId || undefined
  
  if (wsiPredsFileId) {
    try {
      const previousPredictions = await getFileContentFromBox(wsiPredsFileId, false, "json")
      return {
        datasetConfigChanged,
        fileMetadataChanged,
        previousPredictions
      }
    } catch (e) {
      console.log("Error getting previously made predictions from Box!", e.message)
      if (e.message === "404") {
        const predsFilesWithoutCurrentId = wsiPredsFiles.filter(file => file.fileId !== wsiPredsFileId)
        return getPredsFromBox(imageId, annotationId, modelId, predsFilesWithoutCurrentId, datasetConfig)
      }
    }

  } else {
    const { datasetConfigFolderId } = datasetConfig
    let { wsiPredsFolderId } = datasetConfig
 
    if (!wsiPredsFolderId) {
      const wsiPredsFolderEntry = await createFolderInBox("wsiPreds", datasetConfigFolderId)
      datasetConfig.wsiPredsFolderId = wsiPredsFolderEntry.id

      const { datasetConfigFileId, ...newDatasetConfig } = datasetConfig
      const formData = new FormData()
      const dataBlob = new Blob([JSON.stringify(newDatasetConfig)], {
        type: "application/json"
      })
      formData.append("file", dataBlob)
      await uploadFileToBox(formData, datasetConfigFileId)

      datasetConfigChanged = true
    }

    const formData = new FormData()
    const dataBlob = new Blob([JSON.stringify([])], {
      type: "application/json"
    })
    const fileAttributes = {
      'name': `${imageId}_${annotationId}_${modelId}.json`,
      'parent': {
        'id': wsiPredsFolderId
      }
    }
    formData.append("attributes", JSON.stringify(fileAttributes))
    formData.append("file", dataBlob)
    let wsiPredsFileReq = await uploadFileToBox(formData)

    wsiPredsFiles = wsiPredsFiles || []
    const newPredFileMetadata = {
      'fileId': wsiPredsFileReq.entries[0].id,
      annotationId,
      modelId
    }
    wsiPredsFiles.push(newPredFileMetadata)

    const metadataPath = "/wsiPredsFiles"
    const newMetadata = await updateMetadataInBox(imageId, metadataPath, JSON.stringify(wsiPredsFiles))
    
    const returnObj = {
      'previousPredictions': [],
      datasetConfigChanged,
      fileMetadataChanged
    }
    if (datasetConfigChanged) {
      const { datasetConfigFileId, ...newDatasetConfig } = datasetConfig
      returnObj['newDatasetConfig'] = newDatasetConfig
    }
    if (fileMetadataChanged) {
      returnObj['newFileMetadata'] = newMetadata
    }

    return returnObj
  }
}

const insertWSIDataToIndexedDB = (data, annotationId) => new Promise (async resolve => {
  if (indexedDBConfig['wsi'].objectStoreOpts.keyPath.every(key => data[key])) {
    wsiPredsDB = wsiPredsDB || await fetchIndexedDBInstance('wsi')
    const objectStore = wsiPredsDB.transaction(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`, "readwrite").objectStore(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`)
    objectStore.put(data).onsuccess = ({target}) => resolve(target.result)
  }
})

const getWSIDataFromIndexedDB = (query, annotationId) => new Promise (async resolve => {
  if (indexedDBConfig['wsi'].objectStoreOpts.keyPath.every(key => query[key])) {
    wsiPredsDB = wsiPredsDB || await fetchIndexedDBInstance('wsi')
    const objectStore = wsiPredsDB.transaction(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`, "readonly").objectStore(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`)
    objectStore.get(Object.values(query)).onsuccess = ({target}) => resolve(target.result)
  }
})

const getAllWSIDataFromIndexedDB = (annotationId) => new Promise (async resolve => {
  wsiPredsDB = wsiPredsDB || await fetchIndexedDBInstance('wsi')
  const objectStore = wsiPredsDB.transaction(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`, "readonly").objectStore(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`)
  objectStore.getAll().onsuccess = ({target}) => resolve(target.result)
})

const clearWSIDataFromIndexedDB = () => new Promise (async resolve => {
  wsiPredsDB = wsiPredsDB || await fetchIndexedDBInstance('wsi')
  Object.values(wsiPredsDB.objectStoreNames).forEach(objectStoreName => {
    const objectStore = wsiPredsDB.transaction(objectStoreName, "readwrite").objectStore(objectStoreName)
    objectStore.clear().onsuccess = ({target}) => resolve(target.result)
  })
})


class BoxHandler {
  constructor (configJSON, weightFiles) {
    this.configJSON = configJSON
    this.weightFiles = weightFiles
  }
  
  async load() {
    // Returns a ModelArtifacts Object. https://github.com/tensorflow/tfjs/blob/81225adc2fcf6fcf633b4119e4b89a3bf55be824/tfjs-core/src/io/types.ts#L226
    let weightData = new ArrayBuffer()
    for (const file of this.configJSON.weightsManifest[0].paths) {
      const fileIdInBox = this.weightFiles[file]
      const weightsBinary = await getFileContentFromBox(fileIdInBox, false, "buffer")
      const tempWeightData = new Uint8Array(weightData.byteLength + weightsBinary.byteLength)
      tempWeightData.set(new Uint8Array(weightData), 0)
      tempWeightData.set(new Uint8Array(weightsBinary), weightData.byteLength)
      weightData = tempWeightData.buffer
    }
    
    const modelArtifacts = {
      modelTopology: this.configJSON.modelTopology,
      format: this.configJSON.format,
      generatedBy: this.configJSON.generatedBy,
      convertedBy: this.configJSON.convertedBy,
      userDefinedMetadata: this.configJSON.userDefinedMetadata,
      weightSpecs: this.configJSON.weightsManifest[0].weights,
      weightData
    }
    
    return modelArtifacts
  }
  
  async save() {
    // Returns a ModelArtifactsInfo Object. https://github.com/tensorflow/tfjs/blob/81225adc2fcf6fcf633b4119e4b89a3bf55be824/tfjs-core/src/io/types.ts#L150
    return {
      dateSaved: new Date(),
      modelTopologyType: 'JSON'
    }
  }
}