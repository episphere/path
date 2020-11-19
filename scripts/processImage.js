const tileServerBasePath = "https://dl-test-tma.uc.r.appspot.com/iiif"

const boxCreds = {}

const indexedDBConfig = {
  dbName: "boxCreds",
  objectStoreName: "oauth"
}
let workerDB = {}

const fetchIndexedDBInstance = () => new Promise(resolve => {
  indexedDB.open(indexedDBConfig.dbName).onsuccess = (evt) => {
    workerDB = evt.target.result
    resolve()
    // console.log(workerDB)
  }
})

const getFileContentsFromBox = (id, opts={}) => {
  const contentEndpoint = `https://api.box.com/2.0/files/${id}/content`
  opts['headers'] = {
    'Authorization': `Bearer ${boxCreds.accessToken}`
  }
  return fetch(contentEndpoint, opts)
}

const uploadFile = (updateData) => {
	const uploadEndpoint = "https://upload.box.com/api/2.0/files/content"
	return fetch(uploadEndpoint, {
    'method': "POST",
    'headers': {
      'Authorization': `Bearer ${boxCreds.accessToken}`
    },
	  'body': updateData
	})
}

const createMetadata = (id, body) => {
  const metadataAPI = `https://api.box.com/2.0/files/${id}/metadata/global/properties`
  return fetch(metadataAPI, {
    'method': "POST",
    'headers': {
      'Content-Type': "application/json",
      'Authorization': `Bearer ${boxCreds.accessToken}`
    },
    'body': JSON.stringify(body)
  })
}

const updateMetadata = (id, path, updateData) => {
	const updatePatch = [{
	  'op': "add",
	  path,
	  'value': updateData
	}]

	return fetch(`https://api.box.com/2.0/files/${id}/metadata/global/properties`, {
	  'method': "PUT",
	  'headers': {
      'Content-Type': "application/json-patch+json",
      'Authorization': `Bearer ${boxCreds.accessToken}`
	  },
	  'body': JSON.stringify(updatePatch)
	})
}

const handleTIFFConversion = async (imageId, jpegRepresentationsFolderId, name, size) => {
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

const handleWSIThumbnailCreation = async (imageId, name, wsiThumbnailsFolderId) => {
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
    'op': "wsiThumbnail",
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
      await handleTIFFConversion(imageId, jpegRepresentationsFolderId, name, size)
      break
    
    case "wsiThumbnail":
      const { wsiThumbnailsFolderId } = data
      await handleWSIThumbnailCreation(imageId, name, wsiThumbnailsFolderId)
      break

    case "retrySaveThumbnail":
      const { imageURL, wsiThumbnailsFolderId: folderId } = data
      try {
        const thumbnailImage = await (await fetch(imageURL)).blob()
        saveThumbnailToBox(imageId, thumbnailImage, name, folderId)
      } catch (e) {
        console.log("Error saving thumbnail to Box", e)
      }
  }
}

main = async () => {
  await fetchIndexedDBInstance()
  workerDB.transaction("oauth", "readwrite").objectStore("oauth").get(1).onsuccess = async (evt) => {
    boxCreds.accessToken = evt.target.result.access_token
  }
}

main()