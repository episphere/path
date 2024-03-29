export const indexedDBConfig = {
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

const utils = {
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
    const dbInstance = evt.target.result
    resolve(dbInstance)
  }
})

const getBoxUserId = () => new Promise(async resolve => {
  boxCredsDB = boxCredsDB || await fetchIndexedDBInstance('box')
  boxCredsDB.transaction(indexedDBConfig['box'].objectStoreName, "readonly").objectStore(indexedDBConfig['box'].objectStoreName).get(1).onsuccess = async (evt) => {
    resolve(evt.target.result.userId)
  }
})

const createFolderInBox = (folderName, parentFolderId=0) => new Promise(async resolve => {
  const createFolderEndpoint = "https://api.box.com/2.0/folders"
  const folderDetails = {
    'name': folderName,
    'parent': {
      'id': parentFolderId
    }
  }
  boxCredsDB = boxCredsDB || await fetchIndexedDBInstance('box')
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

export const getDataFromBox = (id, type="file", fields=[]) => {
  return new Promise(async resolve => {
    boxCredsDB = boxCredsDB || await fetchIndexedDBInstance('box')
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

export const getFileContentFromBox = (id, urlOnly=false, responseType="json") => {
  const contentEndpoint = `https://api.box.com/2.0/files/${id}/content`
  
  return new Promise(async (resolve) => {
    boxCredsDB = boxCredsDB || await fetchIndexedDBInstance('box')
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

export const uploadFileToBox = (data, id) => {
  const uploadEndpoint = id ? `https://upload.box.com/api/2.0/files/${id}/content` : `https://upload.box.com/api/2.0/files/content`

  return new Promise (async (resolve) => {
    boxCredsDB = boxCredsDB || await fetchIndexedDBInstance('box')
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

const updateMetadataInBox = (id, path, updateData) => new Promise(async resolve => {
  const updateMetadataEndpoint = `https://api.box.com/2.0/files/${id}/metadata/global/properties`
	const updatePatch = [{
	  'op': "add",
	  path,
	  'value': updateData
  }]
  boxCredsDB = boxCredsDB || await fetchIndexedDBInstance('box')
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

export const getPredsFromBox = async (imageId, annotationId, modelId, datasetConfig, wsiPredsFiles=[]) => {
  const userId = await getBoxUserId()
  let { wsiPredsFolderId } = datasetConfig

  let datasetConfigChanged = false
  let fileMetadataChanged = false

  let returnObj = {}

  let wsiPredsFile = wsiPredsFiles.find(file => file.annotationId === annotationId && file.modelId === modelId) || undefined
  if (wsiPredsFile?.fileId) {
    
    try {
      let wsiPredsUserFeedback = {}
      
      if (wsiPredsFile.userFeedbackFiles?.[userId]) {
        wsiPredsUserFeedback = await getFileContentFromBox(wsiPredsFile.userFeedbackFiles[userId], false, "json")     
      } else {
        wsiPredsFile.userFeedbackFiles = wsiPredsFile.userFeedbackFiles || {}
        
        const dataBlob = new Blob([JSON.stringify({})], {
          type: "application/json"
        })
        let fileAttributes = {
          'name': `${imageId}_${annotationId}_${modelId}_${userId}_feedback.json`,
          'parent': {
            'id': wsiPredsFolderId
          }
        }
        
        let formData = new FormData()
        formData.append("attributes", JSON.stringify(fileAttributes))
        formData.append("file", dataBlob)
        
        const wsiPredsUserFeedbackFileReq = await uploadFileToBox(formData)
        wsiPredsFile.userFeedbackFiles[userId] = wsiPredsUserFeedbackFileReq.entries[0].id
        
        const metadataIndexToUpdate = wsiPredsFiles.findIndex(file => file.annotationId === annotationId && file.modelId === modelId)
        wsiPredsFiles[metadataIndexToUpdate] = wsiPredsFile

        const metadataPath = "/wsiPredsFiles"
        const newFileMetadata = await updateMetadataInBox(imageId, metadataPath, JSON.stringify(wsiPredsFiles))
        fileMetadataChanged = true

        returnObj = {
          fileMetadataChanged,
          newFileMetadata,
          ...returnObj
        }
      }
      const previousPredictions = await getFileContentFromBox(wsiPredsFile.fileId, false, "json")
      previousPredictions.forEach((prediction, index) => {
        prediction = {
          modelId,
          ...prediction
        }
        if (Object.keys(wsiPredsUserFeedback).length > 0) {
          const tileKey = `${prediction.x}_${prediction.y}_${prediction.width}_${prediction.height}`
          if (wsiPredsUserFeedback[tileKey]) {
            prediction = {
              userFeedback: wsiPredsUserFeedback[tileKey].userFeedback,
              ...prediction
            }
          }
        }
        previousPredictions[index] = prediction
      })

      returnObj = {
        datasetConfigChanged,
        previousPredictions,
        ...returnObj
      }
      return returnObj
    } catch (e) {
      console.log("Error getting previously made predictions from Box!", e.message)
      if (e.message === "404") {
        const predsFilesWithoutCurrentId = wsiPredsFiles.filter(file => file.fileId !== wsiPredsFile.fileId)
        return getPredsFromBox(imageId, annotationId, modelId, datasetConfig, predsFilesWithoutCurrentId)
      }
    }

  } else {
    const { datasetConfigFolderId } = datasetConfig
 
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

    const dataBlob = new Blob([JSON.stringify({})], {
      type: "application/json"
    })
    let fileAttributes = {
      'name': `${imageId}_${annotationId}_${modelId}.json`,
      'parent': {
        'id': wsiPredsFolderId
      }
    }
    
    let formData = new FormData()
    formData.append("attributes", JSON.stringify(fileAttributes))
    formData.append("file", dataBlob)
    const wsiPredsFileReq = await uploadFileToBox(formData)

    fileAttributes = {
      'name': `${imageId}_${annotationId}_${modelId}_${userId}_feedback.json`,
      'parent': {
        'id': wsiPredsFolderId
      }
    }
    formData = new FormData()
    formData.append("attributes", JSON.stringify(fileAttributes))
    formData.append("file", dataBlob)
    const wsiPredsUserFeedbackFileReq = await uploadFileToBox(formData)
    const userFeedbackFiles = {}
    userFeedbackFiles[userId] = wsiPredsUserFeedbackFileReq.entries[0].id

    wsiPredsFiles = wsiPredsFiles || []
    const newPredFileMetadata = {
      'fileId': wsiPredsFileReq.entries[0].id,
      annotationId,
      modelId,
      userFeedbackFiles
    }
    wsiPredsFiles.push(newPredFileMetadata)

    const metadataPath = "/wsiPredsFiles"
    const newFileMetadata = await updateMetadataInBox(imageId, metadataPath, JSON.stringify(wsiPredsFiles))
    fileMetadataChanged = true
    
    returnObj = {
      'previousPredictions': [],
      datasetConfigChanged,
      fileMetadataChanged
    }
    if (datasetConfigChanged) {
      const { datasetConfigFileId, ...newDatasetConfig } = datasetConfig
      returnObj['newDatasetConfig'] = newDatasetConfig
    }
    if (fileMetadataChanged) {
      returnObj['newFileMetadata'] = newFileMetadata
    }

    return returnObj
  }
}

export const insertWSIDataToIndexedDB = (data, annotationId) => new Promise (async resolve => {
  let dataValidated = false
  if (Array.isArray(data)) {
    // Check if all relevant keys of all rows are non-negative.
    dataValidated = data.every(row => indexedDBConfig['wsi'].objectStoreOpts.keyPath.every(key => row[key] >= 0))
  } else if (typeof(data) === 'object') {
    dataValidated = indexedDBConfig['wsi'].objectStoreOpts.keyPath.every(key => data[key] >= 0)
  } else {
    console.error("Data to be inserted into IDB out of range of possible values", data)
  }
  if (dataValidated) {
    wsiPredsDB = wsiPredsDB || await fetchIndexedDBInstance('wsi')
    const transaction = wsiPredsDB.transaction(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`, "readwrite")
    if (Array.isArray(data)) {
      data.forEach(row => {
        transaction.objectStore(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`).put(row)
      })
      transaction.oncomplete = ({target}) => resolve(target.result)
    } else {
      transaction.objectStore(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`).put(data).onsuccess = ({target}) => resolve(target.result)
    }
  }
})

export const getWSIDataFromIndexedDB = (query, annotationId) => new Promise (async resolve => {
  if (indexedDBConfig['wsi'].objectStoreOpts.keyPath.every(key => query[key] >= 0)) {
    wsiPredsDB = wsiPredsDB || await fetchIndexedDBInstance('wsi')
    const objectStore = wsiPredsDB.transaction(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`, "readonly").objectStore(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`)
    objectStore.get(Object.values(query)).onsuccess = ({target}) => resolve(target.result)
  }
})

export const getAllWSIDataFromIndexedDB = (annotationId, opts={}) => new Promise (async resolve => {
  const { removeKeys=[] } = opts
  wsiPredsDB = wsiPredsDB || await fetchIndexedDBInstance('wsi')
  const objectStore = wsiPredsDB.transaction(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`, "readonly").objectStore(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`)
  objectStore.getAll().onsuccess = ({target}) => {
    let { result } = target
    if (removeKeys.length > 0) {
      result = result.map(row => {
        removeKeys.forEach(key => {
          delete row[key]
        })
        return row
      })
    }
    resolve(target.result)
  }
})

export const clearWSIDataFromIndexedDB = () => new Promise (async resolve => {
  wsiPredsDB = wsiPredsDB || await fetchIndexedDBInstance('wsi')
  Object.values(wsiPredsDB.objectStoreNames).forEach(objectStoreName => {
    const objectStore = wsiPredsDB.transaction(objectStoreName, "readwrite").objectStore(objectStoreName)
    objectStore.clear().onsuccess = ({target}) => resolve(target.result)
  })
})


export class BoxHandler {
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