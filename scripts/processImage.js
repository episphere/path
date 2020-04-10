const JPEG_REPRESENTATIONS_FOLDER_ID = 108721514647

const getFileContentsFromBox = (token, id) => {
  const contentEndpoint = `https://api.box.com/2.0/files/${id}/content`
  return fetch(contentEndpoint, {
    'headers': {
      'Authorization': `Bearer ${token}`
    }
  })
}

const uploadFile = (token, updateData) => {
	// If id is present, the file needs to be updated, otherwise create a new file.
	const uploadEndpoint = "https://upload.box.com/api/2.0/files/content"
	return fetch(uploadEndpoint, {
    'method': "POST",
    'headers': {
      'Authorization': `Bearer ${token}`
    },
	  'body': updateData
	})
}

const updateMetadata = (token, id, path, updateData) => {
	const updatePatch = [{
	  'op': "add",
	  path,
	  'value': updateData
	}]
  
	return fetch(`https://api.box.com/2.0/files/${id}/metadata/global/properties`, {
	  'method': "PUT",
	  'headers': {
      'Content-Type': "application/json-patch+json",
      'Authorization': `Bearer ${token}`
	  },
	  'body': JSON.stringify(updatePatch)
	})
}

onerror = (err) => {
  console.log("Error occurred converting TIFF in worker", err)
  err.preventDefault()
}

onmessage = async (evt) => {
  importScripts("../external/tiff.min.js")
  const { boxAccessToken, imageId, name, size } = evt.data

  if (size) {
    Tiff.initialize({
      'TOTAL_MEMORY': size * 2
    })
  }

  console.log("Downloading the Tiff from Box to start conversion", new Date())
  console.time("TIFF Image Conversion and Storage in Box via Worker")
  const resp = await getFileContentsFromBox(boxAccessToken, imageId)
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
      'id': JPEG_REPRESENTATIONS_FOLDER_ID
    }
  }

  uploadImgFormData.append("attributes", JSON.stringify(fileAttributes))
  uploadImgFormData.append("file", imgBlob)

  console.log("Uploading JPEG Representation to Box", new Date())
  const uploadResp = await (await uploadFile(boxAccessToken, uploadImgFormData)).json()
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
  const newMetadata = await (await updateMetadata(boxAccessToken, imageId, metadataPath, JSON.stringify(jpegRepresentation))).json()
  console.timeEnd("TIFF Image Conversion and Storage in Box via Worker")
  postMessage({
    originalImageId: imageId,
    representationFileId: jpegImageId,
    metadataWithRepresentation: newMetadata
  })
}