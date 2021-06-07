const epiPathBasePath = "https://episphere.github.io/path"
const tileServerBasePath = "https://dl-test-tma.uc.r.appspot.com/iiif"
const wsiFileTypes = [".svs", ".ndpi"]
const validFileTypes = [".jpg", ".jpeg", ".png", ".tiff", ...wsiFileTypes]

const indexedDBConfig = {
  dbName: "boxCreds",
  objectStoreName: "oauth"
}
let workerDB

const fetchIndexedDBInstance = () => new Promise(resolve => {
  indexedDB.open(indexedDBConfig.dbName).onsuccess = (evt) => {
    resolve(evt.target.result)
  }
})

const isValidImage = (name) => {
  let isValid = false
  
  validFileTypes.forEach(fileType => {
    if (name.endsWith(fileType)) {
      isValid = true
    }
  })
  
  return isValid
}

const getBoxFolderContents = (folderId, limit=1000, offset=0, opts={}) => new Promise(resolve => {
  const contentEndpoint = `https://api.box.com/2.0/folders/${folderId}/items?limit=${limit}&offset=${offset}&fields=id,type,name,metadata.global.properties`
  workerDB.transaction("oauth", "readwrite").objectStore("oauth").get(1).onsuccess = (evt) => {
    const { access_token: accessToken } = evt.target.result
    opts['headers'] = {
      'Authorization': `Bearer ${accessToken}`
    }
    resolve(fetch(contentEndpoint, opts))
  }
})

const getFileContentsFromBox = (id, opts={}) => new Promise(resolve => {
  const contentEndpoint = `https://api.box.com/2.0/files/${id}/content`
  workerDB.transaction("oauth", "readwrite").objectStore("oauth").get(1).onsuccess = (evt) => {
    const { access_token: accessToken } = evt.target.result
    opts['headers'] = {
      'Authorization': `Bearer ${accessToken}`
    }
    resolve(fetch(contentEndpoint, opts))
  }
})

const uploadFile = (updateData) => new Promise(resolve => {
  const uploadEndpoint = "https://upload.box.com/api/2.0/files/content"
  workerDB.transaction("oauth", "readwrite").objectStore("oauth").get(1).onsuccess = (evt) => {
    const { access_token: accessToken } = evt.target.result
    resolve(fetch(uploadEndpoint, {
      'method': "POST",
      'headers': {
        'Authorization': `Bearer ${accessToken}`
      },
      'body': updateData
    }))
  }
})

const createMetadata = (id, body) => new Promise(resolve => {
  const metadataAPI = `https://api.box.com/2.0/files/${id}/metadata/global/properties`
  workerDB.transaction("oauth", "readwrite").objectStore("oauth").get(1).onsuccess = (evt) => {
    const { access_token: accessToken } = evt.target.result
    resolve(fetch(metadataAPI, {
      'method': "POST",
      'headers': {
        'Content-Type': "application/json",
        'Authorization': `Bearer ${accessToken}`
      },
      'body': JSON.stringify(body)
    }))
  }
})

const updateMetadata = (id, path, updateData) => new Promise(resolve => {
	const updatePatch = [{
	  'op': "add",
	  path,
	  'value': updateData
  }]
  
  workerDB.transaction("oauth", "readwrite").objectStore("oauth").get(1).onsuccess = (evt) => {
    const { access_token: accessToken } = evt.target.result
    resolve(fetch(`https://api.box.com/2.0/files/${id}/metadata/global/properties`, {
      'method': "PUT",
      'headers': {
        'Content-Type': "application/json-patch+json",
        'Authorization': `Bearer ${accessToken}`
      },
      'body': JSON.stringify(updatePatch)
    }))
  }
})

const handleTIFFConversion = async (op, imageId, jpegRepresentationsFolderId, name, size) => {
  importScripts("../external/tiff.min.js")
  if (size) {
    Tiff.initialize({
      'TOTAL_MEMORY': size * 2
    })
  }

  console.log("Downloading the Tiff from Box to start conversion", new Date())
  console.time("TIFF Image Conversion and Storage in Box via Worker")
  const resp = await getFileContentsFromBox(imageId)
  const fileContent = await resp.arrayBuffer()
  let tiff 
  try {
    tiff = new Tiff({buffer:fileContent})
  } catch (e) {
    return
  }
  
  const canvas = tiff.toCanvas()
  const imgBlob = await canvas.convertToBlob({
    type: "image/jpeg",
    quality: 1.0
  })

  const uploadImgFormData = new FormData()
  const fileAttributes = {
    'name': name.split(".tiff")[0].trim() + `_${Date.now()}` + ".jpg",
    'parent': {
      'id': jpegRepresentationsFolderId
    }
  }

  uploadImgFormData.append("attributes", JSON.stringify(fileAttributes))
  uploadImgFormData.append("file", imgBlob)

  console.log("Uploading JPEG Representation to Box", new Date())
  const uploadResp = await (await uploadFile(uploadImgFormData)).json()
  if (uploadResp.type && uploadResp.type === "error") {
    console.error(uploadResp)
    return
  }
  
  const { 
    id: jpegImageId,
    created_at: createdAt,
    created_by: createdBy
  } = uploadResp.entries[0]

  const jpegRepresentation = {
    'representationFileId': jpegImageId,
    'createdAt': new Date(createdAt).toISOString(),
    'createdBy': {
      userId: createdBy.id,
      username: createdBy.name
    }
  }
  console.log("Updating metadata in Box", new Date())
  const metadataPath = "/jpegRepresentation"
  const newMetadata = await (await updateMetadata(imageId, metadataPath, JSON.stringify(jpegRepresentation))).json()
  console.timeEnd("TIFF Image Conversion and Storage in Box via Worker")
  postMessage({
    op,
    'originalImageId': imageId,
    'representationFileId': jpegImageId,
    'metadataWithRepresentation': newMetadata
  })
}

const getWSIInfo = async (url) => {
  const infoURL = `${tileServerBasePath}?iiif=${url}/info.json`
  const imageInfo =  await fetch(infoURL)
  return imageInfo.json()
}

const getWSIThumbnail = async (url, width, height) => {
  const thumbnailURL = `${tileServerBasePath}?iiif=${url}/0,0,${width},${height}/256,/0/default.jpg`
  const thumbnailImage = await fetch(thumbnailURL)
  return thumbnailImage.blob()
}

const handleWSIThumbnailCreation = async (op, imageId, name, wsiThumbnailsFolderId) => {
  const getImageDownloadURL = async (id) => {
    const ac = new AbortController()
    const signal = ac.signal
    const { url } = await getFileContentsFromBox(id, { signal })
    ac.abort()
    return url
  }
  
  const url = await getImageDownloadURL(imageId)
  const { width, height } = await getWSIInfo(url)
  const thumbnailImage = await getWSIThumbnail(url, width, height)
  const thumbnailURL = await URL.createObjectURL(thumbnailImage)
  let thumbnailSavedToBox = false

  if (wsiThumbnailsFolderId) {
    thumbnailSavedToBox = await saveThumbnailToBox(imageId, thumbnailImage, name, wsiThumbnailsFolderId)
  }

  postMessage({
    op,
    'data': {
      imageId,
      thumbnailURL,
      thumbnailSavedToBox
    }
  })
  
}

const saveThumbnailToBox = async (imageId, thumbnailImage, name, wsiThumbnailsFolderId) => {
  try {
    
    const uploadImgFormData = new FormData()
      
    const fileAttributes = {
      'name': `${name}_thumbnail_${Date.now()}.jpg`,
      'parent': {
        'id': wsiThumbnailsFolderId
      }
    }
  
    uploadImgFormData.append("attributes", JSON.stringify(fileAttributes))
    uploadImgFormData.append("file", thumbnailImage)
  
    console.log("Uploading WSI thumbnail to Box", new Date())
    const uploadResp = await (await uploadFile(uploadImgFormData)).json()
    if (uploadResp.type && uploadResp.type === "error") {
      console.error(uploadResp)
      return
    }
    
    const { 
      id: thumbnailImageId,
      created_at: createdAt,
      created_by: createdBy
    } = uploadResp.entries[0]
  
    const wsiThumbnailRepresentation = {
      thumbnailImageId,
      'createdAt': new Date(createdAt).toISOString(),
      'createdBy': {
        userId: createdBy.id,
        username: createdBy.name
      }
    }
  
    console.log("Updating metadata in Box", new Date())
    const metadataKey = "wsiThumbnail"
    const metadataPath = `/${metadataKey}`
    const newMetadata = await updateMetadata(imageId, metadataPath, JSON.stringify(wsiThumbnailRepresentation))
    if (newMetadata.status === 404) {
      const newMetadata = {}
      newMetadata[metadataKey] = JSON.stringify(wsiThumbnailRepresentation)
      await createMetadata(imageId, newMetadata)
    }
    return true

  } catch (e) {
    console.error("Failed to save thumbnail to Box", e)
    return false
  }
}

const retriveTMAAnnotations = async (op, folderId, annotations, format) => {
  const limit = 1000
  let offset = 0
  let annotationsObj = []
  const folderContents = await (await getBoxFolderContents(folderId, limit, offset)).json()
  if (folderContents.total_count > limit) {
    while (true) {
      offset += limit
      const remainingFiles = await (await getBoxFolderContents(folderId, limit, offset)).json()
      folderContents.entries = folderContents.entries.concat(remainingFiles.entries)
      if (remainingFiles.entries.length < limit) {
        break
      }
    }
  }
  folderContents.entries.forEach(entry => {
    if (entry.type === "file" && isValidImage(entry.name) && entry?.metadata?.global?.properties) {
      const { id, name, metadata:{global:{properties: fileMetadata}} } = entry
      annotations.forEach(annot => {
        const { displayName, metaName, labels } = annot
        const annotationsOnFile = fileMetadata[metaName] ? Object.entries(JSON.parse(fileMetadata[metaName])).reduce((obj, [key, current]) => {
          if (key === "model") {
            current.forEach(model => {
              const highestValuePrediction = model.prediction.reduce((max, current) => current.prob > max.prob ? current : max, {prob: 0})
              const selectedLabel = labels.find(label => label.label === highestValuePrediction.label)
              if (selectedLabel) {
                obj[`model_${model.modelId}_prediction`] = selectedLabel.displayText
                obj[`model_${model.modelId}_score`] = highestValuePrediction.prob
              }
            })
          } else {
            const selectedLabel = labels.find(label => label.label === current.value)
            if (selectedLabel) {
              obj[current.username] = selectedLabel.displayText
            }
          }
          return obj
        }, {}) : {}
        
        if (Object.keys(annotationsOnFile).length > 0) {
          let rowInAnnotationObj = {
            'Image ID': id,
            'Image Name': name,
            'Image In EpiPath': `${epiPathBasePath}#image=${id}`,
            'Annotation Type': displayName,
            ...annotationsOnFile
          }
          annotationsObj.push(rowInAnnotationObj)
        }
      })
    }
  })
  if (annotationsObj.length > 0) {
    const convertedAnnotations = convertAnnotations(annotationsObj, format)
    postMessage({
      op,
      convertedAnnotations
    })
  } else {
    postMessage({
      op,
      'annotations': ""
    })
  }
}

const convertAnnotations = (annotationsObj, format="json") => {
  let delimiter = ""
  if (format === "json") {
    return JSON.stringify(annotationsObj)
  } else {
    if (format === "csv") {
      delimiter = ","
    } else if (format === "tsv") {
      delimiter = "\t"
    }
  }
  
  let allColumns = []
  annotationsObj.forEach(annot => allColumns = allColumns.concat(Object.keys(annot)))
  const fileHeaders = [...new Set(allColumns)]
  const result = [
    fileHeaders.join(delimiter),
    ...annotationsObj.map(annot => fileHeaders.map(header => annot[header] || "-99999999").join(delimiter))
  ].join("\r\n")
  
  return result
}

onerror = (err) => {
  console.error("Error occurred in processImage worker", err)
  err.preventDefault()
}

onmessage = async (evt) => {
  const { op, data } = evt.data
  const { imageId, name } = data

  switch(op) {
    
    case "tiffConvert": 
      const { jpegRepresentationsFolderId, size } = data
      await handleTIFFConversion(op, imageId, jpegRepresentationsFolderId, name, size)
      break
    
    case "wsiThumbnail":
      const { wsiThumbnailsFolderId } = data
      await handleWSIThumbnailCreation(op, imageId, name, wsiThumbnailsFolderId)
      break

    case "retrySaveThumbnail":
      const { imageURL, wsiThumbnailsFolderId: folderId } = data
      try {
        const thumbnailImage = await (await fetch(imageURL)).blob()
        saveThumbnailToBox(imageId, thumbnailImage, name, folderId)
      } catch (e) {
        console.log("Error saving thumbnail to Box", e)
      }

    case "getTMAAnnotations":
      const { folderToGetFrom, annotations, format } = data
      await retriveTMAAnnotations(op, folderToGetFrom, annotations, format)
  }
}

main = async () => {
  workerDB = await fetchIndexedDBInstance()
}

main()