const models = {}

models.loadWorker = () => {
  models.predictionWorker = new Worker(`${basePath}/scripts/modelPrediction.js`)
  models.modelsLoaded = {}
  models.predictionWorker.onmessage = (e) => {
    const {op, ...dataFromWorker} = e.data
    switch(op) {
      case 'loadModel': 
        const { annotationId, modelLoaded } = dataFromWorker
        if (modelLoaded) {
          const annotationConfig = path.datasetConfig.annotations.find(annot => annot.annotationId === annotationId)
          models.modelsLoaded[dataFromWorker.annotationId] = true
          utils.showToast(`Model Loaded for ${annotationConfig.displayName}`)
        }
        break
  
      case 'predict':
        const predictionEvent = new CustomEvent("modelPrediction", {
          detail: dataFromWorker
        })
        document.dispatchEvent(predictionEvent)
        break
    }
  }
}


models.loadModels = (modelsConfig) => {
  // models.predictionWorker.onMessage
  modelsConfig.trainedModels.forEach(modelConfig => {
    models.predictionWorker.postMessage({
      "op": "loadModel",
      "body": {
        "modelConfig": modelConfig
      }
    })

  })
}

models.populateAccordion = (modelsConfig, forceRedraw=false) => {
  if (modelsConfig.trainedModels && modelsConfig.trainedModels.length > 0) {
    const modelsPerClassification = modelsConfig.trainedModels.reduce((obj, current) => {
      const classificationId = current.correspondingAnnotation
      if (!obj[classificationId]) {
        obj[classificationId] = []
      }
      obj[classificationId].push(current)
      return obj
    }, {})

    const modelsAccordion = document.getElementById("modelsAccordion")
    modelsAccordion.style.height = "auto"
    
    if (forceRedraw) {
      modelsAccordion.innerHTML = ""
    }

    Object.entries(modelsPerClassification).forEach(([classificationId, modelsConfig]) => {
      const classificationConfig = path.datasetConfig.annotations.find(classification => classification.annotationId === parseInt(classificationId))
      const {
        displayName,
        annotationName,
        metaName
      } = classificationConfig
  
      let classificationCard = modelsAccordion.querySelector(`#classification_${classificationId}Card`)
    
      if (classificationCard && forceRedraw) {
        classificationCard.parentElement.removeChild(classificationCard)
        classificationCard = undefined
      }

      if (!classificationCard || classificationCard.childElementCount === 0) {
        const classificationsCardDiv = document.createElement("div")
        classificationsCardDiv.setAttribute("class", "card classificationsModelCard")
        classificationsCardDiv.setAttribute("id", `classificationModel_${classificationId}Card`)
        classificationsCardDiv.style.overflow = "visible"
        const modelRows = modelsConfig.sort((a,b) => parseInt(b.version) - parseInt(a.version)).map(model => {
          const modelTableRow = `
            <tr>
              <td>${model.version}</td>
              <td>
                <div class="text-center col">
                  <button class="btn btn-outline-primary" disabled>Get Predictions</button>
                </div>
              </td>
              <td>
              <div class="text-center col">
                <button class="btn btn-outline-primary" disabled>Details</button>
              </div>
              </td>
            </tr>
          `
          return modelTableRow
        }).join("")
        classificationCard = `
          <div class="card-header">
            <div class="classificationWithMenuHeader">
              <h2 class="mb-0">
                <button class="btn btn-link classCardHeader" type="button" data-toggle="collapse"
                  data-target="#${annotationName}Models" id="${annotationName}ModelsToggle">
                  ${displayName}
                </button>
              </h2>
            </div>
            </div>
          <div id="${annotationName}Models" class="collapse qualityModels" data-parent="#modelsAccordion">
            <div class="card-body modelsCardBody" name="${displayName}">
              <table id="${annotationName}ModelVersions" class="table table-bordered qualitySelect">
                <thead>
                  <tr>
                    <th scope="col" style="border-right: none; padding-left: 0; padding-right: 0;">
                      <div class="text-left col">Model Version</div>
                    </th>
                    <th scope="col" style="border-left: none;"></th>
                    <th scope="col" style="border-left: none;"></th>
                  </tr>
                </thead>
                <tbody>
                  ${modelRows}
                </tbody>
              </table>
            </div>
          </div>
        `
        classificationsCardDiv.innerHTML += classificationCard
        modelsAccordion.appendChild(classificationsCardDiv)
        new Collapse(document.getElementById(`${annotationName}ModelsToggle`))
      }
    })
  }
}

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
    } else if (models.predictionWorker && models.modelsLoaded[annotationId]) {
      let imageBitmap = []
      if (imageId === hashParams.image) {
        const offscreenCV = new OffscreenCanvas(path.tmaImage.width, path.tmaImage.height)
        const offscreenCtx = offscreenCV.getContext('2d')
        offscreenCtx.drawImage(path.tmaImage, 0, 0, path.tmaImage.width, path.tmaImage.height)
        imageBitmap = offscreenCV.transferToImageBitmap()
        models.predictionWorker.postMessage({
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
          models.predictionWorker.postMessage({
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