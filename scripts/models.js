const models = {}
models.getModelPrediction = (annotationId, annotationType, imageId=hashParams.image, forceModel=false) => {
    return new Promise(async (resolve) => {
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
          const prediction = await models.getModelPrediction(annotationId, annotationType, imageId, true)
          resolve(prediction)
        } else {
          const latestModel = annotations["model"].reduce((latest, model) => latest.modelVersion <= model.modelVersion ? model : latest, {modelVersion: -1})
          resolve(latestModel.prediction)
        }
      } else if (dataset.predictionWorkers[annotationId] && dataset.modelsLoaded[annotationId]) {
        let imageBitmap = []
        if (imageId === hashParams.image) {
          const offscreenCV = new OffscreenCanvas(path.tmaImage.width, path.tmaImage.height)
          const offscreenCtx = offscreenCV.getContext('2d')
          offscreenCtx.drawImage(path.tmaImage, 0, 0, path.tmaImage.width, path.tmaImage.height)
          imageBitmap = offscreenCV.transferToImageBitmap()
          dataset.predictionWorkers[annotationId].postMessage({
            'op': "predict",
            'body': {
              'annotationId': annotationId,
              'tmaImageData': {
                imageBitmap,
                'width': path.tmaImage.width,
                'height': path.tmaImage.height
              }
            }
          }, [imageBitmap])
        } else {
          const fileContent = await box.getFileContent(imageId)
          const tempImage = new Image()
          tempImage.crossOrigin = "anonymous"
          tempImage.src = fileContent.url
          tempImage.onload = (() => {
            const offscreenCV = new OffscreenCanvas(tempImage.width, tempImage.height)
            const offscreenCtx = offscreenCV.getContext('2d')
            offscreenCtx.drawImage(tempImage, 0, 0, tempImage.width, tempImage.height)
            imageBitmap = offscreenCV.transferToImageBitmap()
            dataset.predictionWorkers[annotationId].postMessage({
              'op': "predict",
              'body': {
                'annotationId': annotationId,
                'tmaImageData': {
                  imageBitmap,
                  'width': tempImage.width,
                  'height': tempImage.height
                }
              }
            }, [imageBitmap])
          })
        }
        
    
        // path.predictionWorker.onmessage = (e) => {
        document.addEventListener("modelPrediction", (e) => {
          updatePredictionInBox(imageId, e.detail, annotationType)
          resolve(e.detail?.prediction)
        }, {
          once: true
        })
      } else {
        resolve(null)
        // const payload = {
        //   annotationType,
        //   "image": path.tmaCanvas.toDataURL().split("base64,")[1]
        // }
        
        // prediction = await utils.request("https://us-central1-nih-nci-dceg-episphere-dev.cloudfunctions.net/getPathPrediction", {
        //   method: "POST",
        //   headers: {
        //     "Content-Type": "application/json"
        //   },
        //   body: JSON.stringify(payload)
        // }, false)
        // .then(res => {
        //   return res.json()
        // })
        // .catch(err => {})
    
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
  
    
  }