// RUN AS NODE.JS SCRIPT WITH BOX ACCESS TOKEN AS COMMAND LINE ARGUMENT.
// node downloadPathThumbnails.js <boxAccessToken> <boxFolderId>

const axios = require('axios')
const axiosRL = require('axios-rate-limit')
const sharp = require('sharp')
const fs = require('fs')

const validFileTypes = [".jpg", ".jpeg", ".png", ".tiff"]
const boxAccessToken = process.argv[2]
const boxFolderId = process.argv[3] || 97077691060
const annotationTypes = ["stainingAdequacy_annotations"]
const downloadToFolder = "./pathImages"
const downloadImageWidth = 1000
const downloadImageHeight = 1000
const GCSBucket = "epipath_qcimages"
const GCSFolder = "IHC_QC"
const trainValidationTestSplit = {
  "TRAIN": 0.8,
  "VALIDATION": 0.9,
  "TEST": 1.0
}

const http = axiosRL(axios.create(), {maxRequests: 75, perMilliseconds: 1000})

const boxRequest = async (url, opts) => http.get(url, {
  headers: {
    'Authorization': `Bearer ${boxAccessToken}`
  }, 
  ...opts
}).catch(e => console.log(e))

const getFolderContents = async (folderId, limit=1000, offset=0, allFiles=[]) => {

  const fieldsParam = "fields=id,name,metadata.global.properties"
  let itemsEndpoint = `https://api.box.com/2.0/folders/${folderId}/items`
  itemsEndpoint += `?${fieldsParam}&limit=${limit}&offset=${offset}`

  const { status, data: {total_count, entries: folderContents }} = await boxRequest(itemsEndpoint)

  allFiles = allFiles.concat(folderContents)
  if (allFiles.length < total_count) {
    // Go again to get the remaining files
    allFiles = await getFolderContents(folderId, limit, folderContents.length, allFiles)
  }

  return allFiles
}

const getFileInfo = (id) => {
  const fileEndpoint = `https://api.box.com/2.0/files/${id}`
  return boxRequest(fileEndpoint)
}

const getImage = (id) => {

  const contentEndpoint = `https://api.box.com/2.0/files/${id}/content`
  return boxRequest(contentEndpoint, {responseType: 'stream'})

}

const downloadImage = async (image) => {
  
  const filePath = `${downloadToFolder}/${image.name}`
  // const resizeAndSave = sharp().resize(downloadImageWidth, downloadImageHeight).toFile(filePath, (err, info) => {})
  const resizeAndSave = sharp().toFile(filePath, (err, info) => {})
  
  const imageData = await getImage(image.id)
  imageData.data.pipe(resizeAndSave)

}

const selectImageSet = (annotationType) => {
  
  const randVar = Math.random()
  const set = Object.keys(trainValidationTestSplit).find(key => randVar <= trainValidationTestSplit[key])
  return set

}

const getModeOfAnnotations = (annotations) => {

  const { model, ...manualAnnotations } = JSON.parse(annotations)
  const numAnnotationsPerLabel = {}
  let maxNumAnnotations = 0

  for (annotation of Object.values(manualAnnotations)) {
    annotation.value = annotation.value === "S" ? "U" : annotation.value
    numAnnotationsPerLabel[annotation.value] = numAnnotationsPerLabel[annotation.value] ? numAnnotationsPerLabel[annotation.value] + 1 : 1
    maxNumAnnotations = maxNumAnnotations < numAnnotationsPerLabel[annotation.value] ? numAnnotationsPerLabel[annotation.value] : maxNumAnnotations
  }

  const labelsWithMaxAnnotations = Object.keys(numAnnotationsPerLabel).filter(key => numAnnotationsPerLabel[key] === maxNumAnnotations)

  if (labelsWithMaxAnnotations.length === 1) {
    return labelsWithMaxAnnotations[0]
  } else {
    // Return a randomly selected label from the ones with the most annotations. Best strategy? Probably not.
    // return labelsWithMaxAnnotations[Math.floor(Math.random() * labelsWithMaxAnnotations.length)]
    return "U"
  }
}

const isValidImage = (fileName) => {
  let isValid = false
  
  validFileTypes.forEach(fileType => {
    if (fileName.endsWith(fileType)) {
      isValid = true
    }
  })
    
  return isValid
}

const main = async () => {

  const labelsCSVForAutoML = {}
  annotationTypes.forEach(annotationType => labelsCSVForAutoML[annotationType] = "set,image_path,label\n" )

  const folderContents = await getFolderContents(boxFolderId)
  if (folderContents && folderContents.length > 0) {
    for (let image of folderContents) {
      if (image.type === "file" && isValidImage(image.name)) {
        // For TIFF images, get the converted filename.
        if (image.name.endsWith(".tiff")) { 
          if (image.metadata.global.properties["jpegRepresentation"]) {
            const { representationFileId } = JSON.parse(image.metadata.global.properties["jpegRepresentation"])
            const representation = await getFileInfo(representationFileId)
            if (representation) {
              image.id = representation.data.id
              image.name = representation.data.name
            } else {
              continue
            }
          } else {
            continue
          }
        }

        if (image.metadata && image.metadata.global && image.metadata.global.properties) {
          annotationTypes.forEach(annotationType => {
            const filePathInGCS = `gs://${GCSBucket}/${GCSFolder}/${image.name}`
            labelsCSVForAutoML[annotationType] += `${selectImageSet(annotationType)},${filePathInGCS},${getModeOfAnnotations(image.metadata.global.properties[annotationType])}\n`
          })
          await downloadImage(image)
        } else {
          return
        }
      }
    }

    annotationTypes.forEach(annotationType => {
      const csvPath = `${downloadToFolder}/${boxFolderId}_${annotationType}.csv`
      fs.writeFile(csvPath, labelsCSVForAutoML[annotationType], (err) => {
        console.log(`${annotationType} data written to ${csvPath}`, err)
      })
    })

  }
}

main()