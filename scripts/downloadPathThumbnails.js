// RUN AS NODE.JS SCRIPT WITH BOX ACCESS TOKEN AS COMMAND LINE ARGUMENT.

const axios = require('axios')
const sharp = require('sharp')
const fs = require('fs')

const boxAccessToken = process.argv[2]
const boxFolderId = 97077691060
const annotationTypes = ["tissueAdequacy_annotations", "stainingAdequacy_annotations"]
const downloadToFolder = "./pathImages"
const downloadImageWidth = 1000
const downloadImageHeight = 1000
const GCSBucket = "epipath_qcimages"
const trainValidationTestSplit = {
  "TRAIN": 0.9,
  "VALIDATION": 0.95,
  "TEST": 1.0
}

const boxRequest = (url, opts) => axios.get(url, {
  headers: {
    'Authorization': `Bearer ${boxAccessToken}`
  }, 
  ...opts
})

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

const getImage = (id) => {

  const contentEndpoint = `https://api.box.com/2.0/files/${id}/content`
  return boxRequest(contentEndpoint, {responseType: 'stream'})

}

const downloadImage = async (image) => {
  
  const filePath = `${downloadToFolder}/resized_${image.name}`
  const resizeAndSave = sharp().resize(downloadImageWidth, downloadImageHeight).toFile(filePath, (err, info) => {})
  
  const imageData = await getImage(image.id)
  imageData.data.pipe(resizeAndSave)

}

const selectImageSet = (annotationType) => {
  
  const randVar = Math.random()
  const set = Object.keys(trainValidationTestSplit).find(key => randVar <= trainValidationTestSplit[key])
  return set

}

const getModeOfAnnotations = (annotations) => {

  const { model, ...manualAnnotations} = JSON.parse(annotations)
  const numAnnotationsPerLabel = {}
  let maxNumAnnotations = 0

  for (annotation of Object.values(manualAnnotations)) {
    numAnnotationsPerLabel[annotation.value] = numAnnotationsPerLabel[annotation.value] ? numAnnotationsPerLabel[annotation.value] + 1 : 1
    maxNumAnnotations = maxNumAnnotations < numAnnotationsPerLabel[annotation.value] ? numAnnotationsPerLabel[annotation.value] : maxNumAnnotations
  }

  const labelsWithMaxAnnotations = Object.keys(numAnnotationsPerLabel).filter(key => numAnnotationsPerLabel[key] === maxNumAnnotations)

  if (labelsWithMaxAnnotations.length === 1) {
    return labelsWithMaxAnnotations[0]
  } else {
    // Return a randomly selected label from the ones with the most annotations. Best strategy? Probably not.
    return labelsWithMaxAnnotations[Math.floor(Math.random() * labelsWithMaxAnnotations.length)]
  }
}

const main = async () => {

  const labelsCSVForAutoML = {}
  annotationTypes.forEach(annotationType => labelsCSVForAutoML[annotationType] = "set,image_path,label\n" )

  const folderContents = await getFolderContents(boxFolderId)
  if (folderContents && folderContents.length > 0) {
    folderContents.forEach(async (image) => {
      if (image.type === "file" && (image.name.endsWith(".jpg") || image.name.endsWith(".png"))) {
        annotationTypes.forEach(annotationType => {
          labelsCSVForAutoML[annotationType] += `${selectImageSet(annotationType)},gs://${GCSBucket}/resized_${image.name},${getModeOfAnnotations(image.metadata.global.properties[annotationType])}\n`
        })
        await downloadImage(image)
      }
    })

    annotationTypes.forEach(annotationType => {
      const csvPath = `${downloadToFolder}/${boxFolderId}_${annotationType}.csv`
      fs.writeFile(csvPath, labelsCSVForAutoML[annotationType], (err) => {
        console.log(`${annotationType} data written to ${csvPath}`, err)
      })
    })

  }
}

main()