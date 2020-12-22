const models = {}

models.getTMAPrediction = (annotationId, annotationType, imageId=hashParams.image, forceModel=false) => new Promise(async (resolve) => {
  const metadata = imageId === hashParams.image ? JSON.parse(window.localStorage.fileMetadata) :  await box.getMetadata(imageId, "file")
  const annotations = metadata[annotationType] ? JSON.parse(metadata[annotationType]) : {}

  const updatePredictionInBox = (imageId, modelPrediction, annotationName) => {
    if (annotations["model"]) {
      if (!annotations["model"][0]?.modelId) {
        // To fix earlier values where model ID and version were not stored in Box.
        annotations["model"] = [{
          modelId: 9999999,
          modelVersion: 0,
          prediction: annotations["model"]
        }]
      }
      annotations["model"].push(modelPrediction)
    } else {
      annotations["model"] = [modelPrediction]
    }
    const boxMetadataPath = `/${annotationName}`
    box.updateMetadata(imageId, boxMetadataPath, JSON.stringify(annotations)).then(newMetadata => {
      window.localStorage.fileMetadata = JSON.stringify(newMetadata)
    })
  }
  
  if (!forceModel && annotations["model"]) {
    if (!annotations["model"][0].modelId) {
      const prediction = await models.getTMAPrediction(annotationId, annotationType, imageId, true)
      resolve(prediction)
    } else {
      const latestModel = annotations["model"].reduce((latest, model) => latest.modelVersion <= model.modelVersion ? model : latest, {modelVersion: -1})
      resolve(latestModel.prediction)
    }
  } else if (dataset.predictionWorkers[annotationId] && dataset.modelsLoaded[annotationId]) {
    let imageBitmap = null
    if (imageId === hashParams.image) {
      const offscreenCV = new OffscreenCanvas(path.tmaImage.width, path.tmaImage.height)
      const offscreenCtx = offscreenCV.getContext('2d')
      offscreenCtx.drawImage(path.tmaImage, 0, 0, path.tmaImage.width, path.tmaImage.height)
      imageBitmap = offscreenCV.transferToImageBitmap()
    }
    dataset.predictionWorkers[annotationId].postMessage({
      'op': "predict",
      'body': {
        'annotationId': annotationId,
        'imageData': {
          imageId,
          imageBitmap,
          'width': path.tmaImage.width,
          'height': path.tmaImage.height
        }
      }
    }, [imageBitmap])
    
    document.addEventListener("tmaPrediction", (e) => {
      updatePredictionInBox(imageId, e.detail, annotationType)
      resolve(e.detail?.prediction)
    }, {
      once: true
    })
  } else {
    resolve(null)
  }

})


  // const getBase64FromImage = (image) => {
  //   const tmpCanvas = document.createElement("canvas")
  //   tmpCanvas.width = image.width
  //   tmpCanvas.height = image.height
  //   const tmpCtx = tmpCanvas.getContext("2d")
  //   tmpCtx.drawImage(image, 0, 0, image.width, image.height)
  //   return tmpCanvas.toDataURL().split("base64,")[1]
  // }

models.getWSIPrediction = (annotationId, imageId=hashParams.image, imageInfo={}, predictionBounds={}, wsiPredsFileId, forceModel=false) => {
  if (dataset.predictionWorkers[annotationId] && dataset.modelsLoaded[annotationId])  {
    dataset.predictionWorkers[annotationId].postMessage({
      'op': "predictWSI",
      'body': {
        annotationId,
        'imageData': {
          imageId,
          imageInfo,
          predictionBounds,
          wsiPredsFileId
        }
      }
    })
    return true
  } else {
    return false
  }
}

models.getPreviousWSIPredsFromBox = (imageId, annotationId, modelId, datasetConfig, wsiPredsFiles) => {
  if (dataset.predictionWorkers[annotationId]) {
    dataset.predictionWorkers[annotationId].postMessage({
      'op': "getPreviousPreds",
      'body': {
        annotationId,
        modelId,
        datasetConfig,
        'imageData': {
          imageId,
          wsiPredsFiles
        }
      }
    })
    return true
  } else {
    return false
  }
}

models.stopWSIWorkers = (annotationId) => {
  if (dataset.predictionWorkers[annotationId])  {
    dataset.predictionWorkers[annotationId].postMessage({
      'op': "stop",
      'body': {
        annotationId
      }
    })
  }
}