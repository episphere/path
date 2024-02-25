const dataset = {}
dataset.predictionWorkers = {}

dataset.loadModels = (modelsConfig=[]) => {
  Object.values(dataset.predictionWorkers).forEach((predictionWorker) => predictionWorker.terminate())
  dataset.modelsLoaded = {}
  
  const selectedModelPerAnnotation = modelsConfig.reduce((modelsPerAnnot, current) => {
    if (!modelsPerAnnot[current.correspondingAnnotation] || modelsPerAnnot[current.correspondingAnnotation].version < current.version) {
      modelsPerAnnot[current.correspondingAnnotation] = current
    }
    return modelsPerAnnot
  }, {})
  
  Object.values(selectedModelPerAnnotation).forEach(modelConfig => {
    dataset.predictionWorkers[modelConfig.correspondingAnnotation] = new Worker(`${basePath}scripts/modelPrediction.js`, {
      name: path.datasetConfig.annotations.find(annot => annot.annotationId === modelConfig.correspondingAnnotation).annotationName,
      type: 'module'
    })
    dataset.predictionWorkers[modelConfig.correspondingAnnotation].onmessage = (e) => {
      const {op, ...dataFromWorker} = e.data
      switch(op) {
        case 'loadModel': 
          const { annotationId, modelId, modelLoaded } = dataFromWorker
          if (modelLoaded) {
            const annotationConfig = path.datasetConfig.annotations.find(annot => annot.annotationId === annotationId)
            dataset.modelsLoaded[dataFromWorker.annotationId] = modelId
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
        basePath,
        modelConfig
      }
    })

  })
}

dataset.populateInfo = (datasetConfig, forceRedraw=false) => {
  const datasetInfoDiv = document.getElementById("datasetInfo")
  if (!datasetConfig) {
    datasetConfig.innerHTML = ""
    return
  }
  
  const { datasetFolderId, datasetFolderName, annotations, models: modelsConfig } = datasetConfig
  datasetInfoDiv.innerHTML = ""
  datasetInfoDiv.setAttribute("class", "card")
  const infoContentDiv = datasetInfoDiv.firstElementChild || document.createElement("div")
  infoContentDiv.setAttribute("class", "card-body")
  infoContentDiv.innerHTML = ""
  infoContentDiv.insertAdjacentHTML('afterbegin', `
      <h5 class="card-title">Overview</h5>
      <hr class="dropdown-divider">
      <p class="card-text">Dataset Folder: <a href="https://nih.app.box.com/folder/${datasetFolderId}">${datasetFolderName}</a></p>
  `)
  datasetInfoDiv.insertAdjacentElement('afterbegin', infoContentDiv)

  if (annotations && annotations.length > 0) {
    const downloadButtonSpan = document.createElement("span")
    const downloadAnnotationsBtn = document.createElement("button")
    downloadAnnotationsBtn.setAttribute("class", "btn btn-outline-primary downloadAnnotations")
    downloadAnnotationsBtn.innerText = "Download Annotations"
    downloadAnnotationsBtn.onclick = (e) => dataset.getTMAAnnotations(document.getElementById("annotationsFileTypeDropdownBtn").getAttribute("value"), e.target, path.datasetConfig.datasetFolderId, datasetFolderName)
    downloadButtonSpan.appendChild(downloadAnnotationsBtn)
    downloadButtonSpan.insertAdjacentHTML('beforeend', "&nbsp as ")

    downloadButtonSpan.insertAdjacentHTML('beforeend', `
      <span id="annotationsFileTypeDropdown" class="dropdown">
        <button id="annotationsFileTypeDropdownBtn" class="btn btn-link" style="padding: 0;" type="button" data-toggle="dropdown" value="csv"><span>CSV</span> <i class="fas fa-caret-down"></i></button>
        <div class="dropdown-menu" style="padding: 0;">
          <button class="dropdown-item annotationFormat selected" style="padding: 0.5rem 0 0.5rem 1rem;" value="csv">CSV</button>
          <hr style="margin:0">
          <button class="dropdown-item annotationFormat" style="padding: 0.5rem 0 0.5rem 1rem;" value="tsv">TSV</button>
          <hr style="margin:0">
          <button class="dropdown-item annotationFormat" style="padding: 0.5rem 0 0.5rem 1rem;" value="json">JSON</button>
        </ul>
      </span>
    `)
    
    infoContentDiv.appendChild(downloadButtonSpan)
    const annotationsFileTypeDropdownBtn = document.getElementById("annotationsFileTypeDropdownBtn")
    downloadButtonSpan.querySelectorAll("button.dropdown-item").forEach(element => {
      element.onclick = (e) => {
        if (annotationsFileTypeDropdownBtn.nextElementSibling.querySelector("button.selected") !== e.target) {
          annotationsFileTypeDropdownBtn.nextElementSibling.querySelector("button.selected").classList.remove("selected")
          e.target.classList.add("selected")
          annotationsFileTypeDropdownBtn.firstElementChild.innerText = e.target.innerText
          annotationsFileTypeDropdownBtn.setAttribute("value", e.target.getAttribute("value"))
        }
      }
    })
    new BSN.Dropdown(annotationsFileTypeDropdownBtn)
  }
  
  if (modelsConfig.trainedModels && modelsConfig.trainedModels.length > 0) {
    const modelsPerClassification = modelsConfig.trainedModels.reduce((obj, current) => {
      const classificationId = current.correspondingAnnotation
      if (!obj[classificationId]) {
        obj[classificationId] = []
      }
      obj[classificationId].push(current)
      return obj
    }, {})
    
    const modelsAccordion = document.createElement("div")
    modelsAccordion.setAttribute("id", "modelsAccordion")
    // modelsAccordion.setAttribute("class", "card-body")
    modelsAccordion.style.height = "auto"
    modelsAccordion.innerHTML = `
      <h5 class="card-title" style="padding-left:1.25rem;">Models</h5>
    `
    datasetInfoDiv.insertAdjacentHTML('beforeend', `<hr>`) 
    datasetInfoDiv.appendChild(modelsAccordion)
    
    Object.entries(modelsPerClassification).forEach(([classificationId, modelsConfig]) => {
      const classificationConfig = annotations.find(classification => classification.annotationId === parseInt(classificationId))
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
                  <i class="fas fa-caret-right">&nbsp&nbsp</i>${displayName}
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
        const modelsToggleElement = document.getElementById(`${annotationName}ModelsToggle`)
        const modelsDropdownElement = document.getElementById(modelsToggleElement.getAttribute("data-target").replace("#", ""))
        new BSN.Collapse(modelsToggleElement)
        modelsDropdownElement.addEventListener("show.bs.collapse", () => {
          modelsToggleElement.firstElementChild.classList.replace("fa-caret-right", "fa-caret-down")
        })
        modelsDropdownElement.addEventListener("hide.bs.collapse", () => {
          modelsToggleElement.firstElementChild.classList.replace("fa-caret-down", "fa-caret-right")
        })
      }
    })
  }
}

dataset.getTMAAnnotations = async (requestedFormat="json", targetElement, folderId=path.datasetConfig.datasetFolderId, datasetFolderName) => {
  targetElement?.insertAdjacentHTML('beforeend', `<span>&nbsp&nbsp<i class="fas fa-spinner fa-spin"></i></span>`)
  utils.showToast("Retrieving Annotations...")
  targetElement?.setAttribute("disabled", "true")
  
  const op = "getTMAAnnotations"
  path.miscProcessingWorker.postMessage({
    op,
    'data': {
      'folderToGetFrom': folderId,
      'annotations': path.datasetConfig.annotations,
      'format': requestedFormat
    }
  })
  
  path.miscProcessingWorker.addEventListener('message', (evt) => {
    if (evt.data.op === op) {
      const tempAnchorElement = document.createElement('a');
      tempAnchorElement.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(evt.data.convertedAnnotations));
      tempAnchorElement.setAttribute('download', `${datasetFolderName}_Annotations.${requestedFormat}`);
      tempAnchorElement.click();
      utils.showToast("Annotations Downloaded!")
      targetElement?.removeChild(targetElement.lastElementChild)
      targetElement?.removeAttribute("disabled")
    }
  }, {once: true})
}