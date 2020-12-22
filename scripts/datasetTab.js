const dataset = {}
dataset.predictionWorkers = {}

dataset.loadModels = (modelsConfig) => {
  Object.values(dataset.predictionWorkers).forEach((predictionWorker) => predictionWorker.terminate())
  dataset.modelsLoaded = {}
  modelsConfig.trainedModels.forEach(modelConfig => {
    dataset.predictionWorkers[modelConfig.correspondingAnnotation] = new Worker(`${basePath}/scripts/modelPrediction.js`, {
      name: path.datasetConfig.annotations.find(annot => annot.annotationId === modelConfig.correspondingAnnotation).annotationName
    })
    dataset.predictionWorkers[modelConfig.correspondingAnnotation].onmessage = (e) => {
      const {op, ...dataFromWorker} = e.data
      switch(op) {
        case 'loadModel': 
          const { annotationId, modelLoaded } = dataFromWorker
          if (modelLoaded) {
            const annotationConfig = path.datasetConfig.annotations.find(annot => annot.annotationId === annotationId)
            dataset.modelsLoaded[dataFromWorker.annotationId] = true
            utils.showToast(`Model Loaded for ${annotationConfig.displayName}`)
          }
          break
    
        case 'predict':
          const predictionEvent = new CustomEvent("tmaPrediction", {
            detail: dataFromWorker
          })
          document.dispatchEvent(predictionEvent)
          break

        case 'predictWSI':
        case 'getPreviousPreds':
        case 'stop':
          const { body } = dataFromWorker
          wsi.handleMessage(body, op)
      }
    }
    dataset.predictionWorkers[modelConfig.correspondingAnnotation].postMessage({
      "op": "loadModel",
      "body": {
        modelConfig
      }
    })

  })
}

dataset.populateAccordion = (modelsConfig, forceRedraw=false) => {
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
        classificationsCardDiv.insertAdjacentHTML("beforeend", classificationCard)
        modelsAccordion.appendChild(classificationsCardDiv)
        new BSN.Collapse(document.getElementById(`${annotationName}ModelsToggle`))
      }
    })
  }
}