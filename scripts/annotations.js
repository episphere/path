const annotations = {}

annotations.showAnnotationOptions = async (annotationsConfig=path?.datasetConfig?.annotations, isImageFromBox=false, forceRedraw=false) => {
  const annotationsAccordion = document.getElementById("annotationsAccordion")
 
  if (annotationsConfig && isImageFromBox) {
    await annotations.createTables(annotationsConfig, forceRedraw)

  } else if (!annotationsConfig) {
    let messageHTMLString = ``
    if (document.getElementById("datasetSelectDropdownDiv").querySelectorAll("button").length > 1) {
      messageHTMLString = `-- Please </i><a href="#" onclick="document.getElementById('datasetSelectDropdownBtn').Dropdown.show(); return false;">Select a Dataset</a><i> first! --`
    } else {
      messageHTMLString = `-- Please </i><a href="#" onclick="document.getElementById('addDatasetDropdownBtn').Modal.show(); return false;">Create a Dataset</a><i> first! --`
    }
    annotationsAccordion.innerHTML = `
      <span id="localImageAnnotationsMsg" style="margin: 0 auto; color: gray;">
        <i style="text-align: center;">${messageHTMLString}</i>
      </span>
    `
  } else if (!isImageFromBox) {
    annotationsAccordion.innerHTML = `
      <span id="localImageAnnotationsMsg" style="margin: 0 auto; color: gray;">
        <i style="text-align: center;">-- Please select an image from </i><a href="#" onclick="document.getElementById('box-tab').click(); return false;">My Box</a><i> first! --</i>
      </span>
    `
  }
}

annotations.createTables = async (annotationsConfig, forceRedraw = false) => {
  
  const annotationsAccordion = document.getElementById("annotationsAccordion")
  annotationsAccordion.style.height = "auto"

  if (forceRedraw || annotationsAccordion.querySelector("span#localImageAnnotationsMsg")) {
    annotationsAccordion.innerHTML = ""
  }
  
  annotationsConfig.forEach(async (annotation) => {
    const {
      annotationId,
      displayName,
      annotationName,
      metaName,
      definition,
      enableComments,
      labels
    } = annotation
    
    let annotationCard = annotationsAccordion.querySelector(`#annotation_${annotationId}Card`)
    
    if (annotationCard && forceRedraw) {
      annotationCard.parentElement.removeChild(annotationCard)
      annotationCard = undefined
    }
    
    if (!annotationCard || annotationCard.childElementCount === 0) {
      const annotationCardDiv = document.createElement("div")
      annotationCardDiv.setAttribute("class", "card annotationsCard")
      annotationCardDiv.setAttribute("id", `annotation_${annotationId}Card`)
      annotationCardDiv.style.overflow = "visible"
      annotationsAccordion.appendChild(annotationCardDiv)

      let annotationCardHeader = `
        <div class="card-header">
          <div class="annotationWithMenuHeader">
            <div class="classWithDefinition">
              <h2 class="mb-0">
                <button class="btn btn-link classCardHeader" type="button" data-toggle="collapse"
                  data-target="#${annotationName}Annotations" id="${annotationName}Toggle" aria-expanded="false">
                  <i class="fas fa-caret-right" style="width:18px;">&nbsp&nbsp</i>${displayName}
                </button>
              </h2>
      `
  
      if (definition) {
        annotationCardHeader += `
              <button class="btn btn-light classDefinitionPopup" id="${annotationName}_definitionPopup" type="button" data-toggle="popover">
                <i class="fas fa-info-circle"></i>
              </button>
        `
      }
  
      annotationCardHeader += `
            </div>
            <div class="dropdown dropleft classificationMenu" id="${annotationName}_classificationMenu">
              <button class="btn btn-light dropdown-toggle classificationMenuToggle" role="button" id="${annotationName}_classificationMenuToggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                <i class="fas fa-ellipsis-v"></i>
              </button>
              <div class="dropdown-menu classificationMenuDropdown">
                <div class="classificationMenuButtons">
                  <button class="btn btn-light classificationMenuOption" role="button" id="${annotationName}_editClassification" title="Edit" onclick="editClassificationConfig(${annotationId})"  aria-haspopup="true" aria-expanded="false">
                    <i class="fas fa-pencil-alt"></i> &nbsp;Edit Config
                  </button>
                  <hr/>
                  <button class="btn btn-light classificationMenuOption" role="button" id="${annotationName}_deleteClassification" title="Delete" onclick="deleteClassificationConfig(${annotationId})" aria-haspopup="true" aria-expanded="false">
                    <i class="fas fa-trash-alt"></i> &nbsp;Delete Class
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `
    
      annotationCardDiv.insertAdjacentHTML('beforeend', annotationCardHeader)
      const annotationCardContentDiv = document.createElement("div")
      annotationCardContentDiv.setAttribute("id", `${annotationName}Annotations`)
      annotationCardContentDiv.setAttribute("class", "collapse qualityAnnotations")
      annotationCardContentDiv.setAttribute("data-parent", "#annotationsAccordion")
      annotationCardDiv.insertAdjacentElement('beforeend', annotationCardContentDiv)
      annotations.populateAnnotationCard(annotationCardContentDiv, annotationId, annotationName, displayName, metaName, labels, path.isWSI, enableComments)
      new BSN.Collapse(document.getElementById(`${annotationName}Toggle`))
      const annotationCollapseDiv = document.getElementById(`${annotationName}Annotations`)
      annotationCollapseDiv.addEventListener("show.bs.collapse", (evt) => {
        const annotationToggleBtn = document.getElementById(`${annotationName}Toggle`)
        annotationToggleBtn.firstElementChild.classList.replace("fa-caret-right", "fa-caret-down")
      })
      annotationCollapseDiv.addEventListener("hide.bs.collapse", (evt) => {
        const annotationToggleBtn = document.getElementById(`${annotationName}Toggle`)
        annotationToggleBtn.firstElementChild.classList.replace("fa-caret-down", "fa-caret-right")
      })
      new BSN.Dropdown(document.getElementById(`${annotationName}_classificationMenu`))
  
      if (definition) {
        new BSN.Popover(document.getElementById(`${annotationName}_definitionPopup`), {
          placement: "right",
          animation: "slidenfade",
          delay: 100,
          dismissible: false,
          trigger: "hover",
          content: definition
        })
      }
  
      if (enableComments && !path.isWSI) {
  
        new BSN.Collapse(document.getElementById(`${annotationName}_commentsToggle`))
        const commentsCollapseDiv = document.getElementById(`${annotationName}_allComments`)
        commentsCollapseDiv.addEventListener("show.bs.collapse", (evt) => {
          const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
          toggleCommentsButton.innerHTML = "- Hide All Comments"
        })
        commentsCollapseDiv.addEventListener("hide.bs.collapse", (evt) => {
          const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
          toggleCommentsButton.innerHTML = "+ Show All Comments"
        })
  
        document.getElementById(`${annotationName}_commentsTextField`).oninput = (evt) => {
          const commentsTextField = evt.target
          const commentsSubmitButton = document.getElementById(`${annotationName}_submitComment`)
          if (commentsTextField.value.length > 0) {
            commentsSubmitButton.removeAttribute("disabled")
          } else {
            commentsSubmitButton.setAttribute("disabled", "true")
          }
        }

        document.getElementById(`${annotationName}_commentsTextField`).onkeydown = (evt) => {
          const commentsSubmitButton = document.getElementById(`${annotationName}_submitComment`)
          if (evt.shiftKey && (evt.key === "Enter" || evt.key === "NumpadEnter")) {
            evt.preventDefault()
            commentsSubmitButton.click()
          }
        }
        annotations.populateComments(annotationName)
      }
    }
    if (!path.isWSI) {
      annotations.showQualitySelectors(annotation)
    }
  })
  annotations.loadModelPredictions()
  annotations.showNextImageButton()
  document.getElementById("addClassificationBtn").removeAttribute("disabled")
}

annotations.populateAnnotationCard = async (annotationCardContentDiv, annotationId, annotationName, displayName, metaName, labels, isWSI=path.isWSI, enableComments=false) => {
  annotations.populateWSIAnnotations = async (clickedButton, showModelPredictions=false, forceReload=false) => {
    const positiveLabel = labels[0]
    if (!forceReload && clickedButton.classList.contains("active")) {
      return
    } else {
      clickedButton.parentElement.querySelector(".active").classList.remove("active")
      clickedButton.classList.add("active")

      if (showModelPredictions) {
        const annotationsContainerElement = document.getElementById(`wsiAnnotations_${annotationId}_model`)
        annotationsContainerElement.previousElementSibling.style.display = "none"
        annotationsContainerElement.style.display = "flex"

        const indexedDBQueryOpts = {
          'index': indexedDBConfig['wsi'].objectStoreIndexes[1].name,
          'query': "all",
          'direction': "prev",
          'offset': 0,
          'limit': 25
        }
        const { result: modelPredictions, offset } = await wsi.getFromIndexedDB(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_${annotationId}`, indexedDBQueryOpts)

        if (modelPredictions && modelPredictions.length !== 0 && modelPredictions.length !== Math.ceil(annotationsContainerElement.childElementCount/2)) {
          annotationsContainerElement.innerHTML = ""
          const tempDocumentFragment = document.createDocumentFragment()

          modelPredictions.forEach(({x, y, width, height, prediction}, ind) => {
            const { label, prob } = prediction.reduce((max, current) => current.prob > max.prob ? current : max, {prob: 0})
            const annotationElement = document.createElement("div")
            annotationElement.setAttribute("class", "wsiAnnotationElement")
            annotationElement.setAttribute("id", `wsiAnnotationDetails_model_${annotationId}_${x}_${y}_${width}_${height}`)
            annotationElement.innerHTML = `
              <div>
                <i style="color:gray">Prediction:</i> ${displayName} ${label}<br/>
                <i style="color:gray">Score:</i> ${Math.round((prob + Number.EPSILON) * 10000) / 10000}<br/>
              </div>
              <div style="display: flex; flex-direction: row; margin: auto;">
              </div>
            `
            // <i>Position in Image:</i> ${x}, ${y}, ${x+width}, ${y+height}<br/>
            annotationElement.onclick = () => {
              path.wsiViewer.viewport.fitBoundsWithConstraints(path.wsiViewer.viewport.imageToViewportRectangle(new OpenSeadragon.Rect(x, y, width, height, 0)))
            }
            tempDocumentFragment.appendChild(annotationElement)
            if (ind !== modelPredictions.length - 1) {
              tempDocumentFragment.appendChild(document.createElement("hr"))
            }
            
            const approveButton = document.createElement("button")
            approveButton.setAttribute("type", "button")
            approveButton.setAttribute("class", "btn btn-light")
            approveButton.setAttribute("disabled", "true")
            approveButton.style.fontSize = "18px"
            approveButton.innerText = "👍"
            
            const rejectButton = document.createElement("button")
            rejectButton.setAttribute("type", "button")
            rejectButton.setAttribute("class", "btn btn-light")
            rejectButton.setAttribute("disabled", "true")
            rejectButton.style.fontSize = "18px"
            rejectButton.innerText = "👎"
            
            annotationElement.lastElementChild.appendChild(approveButton)
            annotationElement.lastElementChild.appendChild(rejectButton)

            annotationElement.onmouseover = () => {
              if (annotationElement.getAttribute("overlay_element_id")) {
                document.getElementById(annotationElement.getAttribute("overlay_element_id")).classList.add("hover")
              } else {
                const overlayElement = path.wsiViewer.currentOverlays.find(overlay => overlay.element.classList.contains("wsiUserAnnotation") && overlay.bounds.x === x && overlay.bounds.y === y && overlay.bounds.width === width && overlay.bounds.height === height)?.element
                if (overlayElement) {
                  overlayElement.classList.add("hover")
                  annotationElement.setAttribute("overlay_element_id", overlayElement.id)
                }
              }
            }
            
            annotationElement.onmouseleave = () => {
              if (annotationElement.getAttribute("overlay_element_id")) {
                document.getElementById(annotationElement.getAttribute("overlay_element_id")).classList.remove("hover")
              } else {
                const overlayElement = path.wsiViewer.currentOverlays.find(overlay => overlay.element.classList.contains("wsiUserAnnotation") && overlay.bounds.x === x && overlay.bounds.y === y && overlay.bounds.width === width && overlay.bounds.height === height)?.element
                if (overlayElement) {
                  overlayElement.classList.remove("hover")
                  annotationElement.setAttribute("overlay_element_id", overlayElement.id)
                }
              }
            }
          }) 
          annotationsContainerElement.appendChild(tempDocumentFragment)
        } else if (annotationsContainerElement.querySelectorAll("div.wsiAnnotationElement").length === 0) {
          annotationsContainerElement.innerHTML = `<div style="display:flex; align-items:center; width:100%; height:20vh;"><i style="color:slategray; margin:auto; font-size:18px">-- Nothing to show --</i></div>`
        }
      } else {
        const annotationsContainerElement = document.getElementById(`wsiAnnotations_${annotationId}_user`)
        annotationsContainerElement.nextElementSibling.style.display = "none"
        annotationsContainerElement.style.display = "flex"

        const userAnnotationsMetadata = window.localStorage.fileMetadata ? JSON.parse(window.localStorage.fileMetadata)[`${wsi.metadataPathPrefix}_${annotationId}`] : undefined
        const userAnnotations = userAnnotationsMetadata ? JSON.parse(userAnnotationsMetadata)?.[window.localStorage.userId] : undefined

        if (userAnnotations && userAnnotations.length !== 0 && userAnnotations.length !== Math.ceil(annotationsContainerElement.childElementCount/2)) {
          annotationsContainerElement.innerHTML = ""
          const tempDocumentFragment = document.createDocumentFragment()

          userAnnotations.forEach(({rectBounds, label, createdAt, comment}, ind) => {
            label = label || `${displayName} ${labels[0].displayText}`
            const positionInImage = path.wsiViewer.viewport.viewportToImageRectangle(...Object.values(rectBounds))
            const positionInImageForElementId = Object.values(positionInImage).splice(0, Object.values(positionInImage).length - 1).map(v => Math.round(v)).join("_")
            const xPos = Math.round(positionInImage.x)
            const yPos = Math.round(positionInImage.y)
            const createdAtTime = new Date(createdAt)
            const createdAtTimeString = createdAtTime.toLocaleString('default', {year: 'numeric', month: 'long', day: 'numeric', hour:'numeric', minute: 'numeric'})
      
            const annotationElement = document.createElement("div")
            annotationElement.setAttribute("class", "wsiAnnotationElement")
            annotationElement.setAttribute("id", `wsiAnnotationDetails_user_${positionInImageForElementId}`)
            let annotationElementHTMLString = `
              <div>
                <i style="color:gray">Annotation:</i> ${label}<br>
                <i style="color:gray">Created at:</i> ${createdAtTimeString}<br>
            ` 
                // <i style="color:gray">Position in Image:</i> (${xPos}, ${yPos}, ${xPos+positionInImage.width}, ${yPos+positionInImage.height})
            if (comment) {
              annotationElementHTMLString += `
                <br/><i>Comments:</i> ${comment}
              `
            }
            annotationElementHTMLString += `
              </div>
              <div style="margin: auto;">
              </div>
            `
            annotationElement.innerHTML = annotationElementHTMLString

            annotationElement.onclick = () => path.wsiViewer.viewport.fitBoundsWithConstraints(new OpenSeadragon.Rect(...Object.values(rectBounds)))
            tempDocumentFragment.appendChild(annotationElement)
            if (ind !== userAnnotations.length - 1) {
              tempDocumentFragment.appendChild(document.createElement("hr"))
            }
            const deleteAnnotationBtn = document.createElement("button")
            deleteAnnotationBtn.setAttribute("type", "button")
            deleteAnnotationBtn.setAttribute("class", "btn btn-light")
            deleteAnnotationBtn.innerHTML = `<i class="fas fa-trash"></i>`  
            deleteAnnotationBtn.onclick = async (e) => {
              e.preventDefault()
              e.stopPropagation()
              const userAnnotationsMetadataNew = JSON.parse(window.localStorage.fileMetadata)?.[`${wsi.metadataPathPrefix}_${annotationId}`] ? JSON.parse(JSON.parse(window.localStorage.fileMetadata)?.[`${wsi.metadataPathPrefix}_${annotationId}`]) : {}
              userAnnotationsMetadataNew[window.localStorage.userId] = userAnnotationsMetadataNew[window.localStorage.userId] ? userAnnotationsMetadataNew[window.localStorage.userId].filter((annot, ind2) => ind !== ind2 ) : []
              const newMetadata = await box.updateMetadata(hashParams.image, `/wsiAnnotation_${annotationId}`, JSON.stringify(userAnnotationsMetadataNew))
              path.wsiViewer.removeOverlay(`wsiAnnotation_${annotationId}_${positionInImageForElementId}`)
              annotationElement.parentElement.removeChild(annotationElement)
              window.localStorage.fileMetadata = JSON.stringify(newMetadata)
              utils.showToast("Annotation Deleted!")
            }
            annotationElement.lastElementChild.appendChild(deleteAnnotationBtn)
            
            annotationElement.onmouseover = () => {
              if (annotationElement.getAttribute("overlay_element_id")) {
                document.getElementById(annotationElement.getAttribute("overlay_element_id")).classList.add("hover")
              } else {
                const overlayElement = path.wsiViewer.currentOverlays.find(overlay => overlay.element.classList.contains("wsiUserAnnotation") && overlay.bounds.x === rectBounds.x && overlay.bounds.y === rectBounds.y && overlay.bounds.width === rectBounds.width && overlay.bounds.height === rectBounds.height)?.element
                if (overlayElement) {
                  overlayElement.classList.add("hover")
                  annotationElement.setAttribute("overlay_element_id", overlayElement.id)
                }
              }
            }
            annotationElement.onmouseleave = () => {
              if (annotationElement.getAttribute("overlay_element_id")) {
                document.getElementById(annotationElement.getAttribute("overlay_element_id")).classList.remove("hover")
              } else {
                const overlayElement = path.wsiViewer.currentOverlays.find(overlay => overlay.element.classList.contains("wsiUserAnnotation") && overlay.bounds.x === rectBounds.x && overlay.bounds.y === rectBounds.y && overlay.bounds.width === rectBounds.width && overlay.bounds.height === rectBounds.height)?.element
                if (overlayElement) {
                  overlayElement.classList.remove("hover")
                  annotationElement.setAttribute("overlay_element_id", overlayElement.id)
                }
              }
            }
          })
          annotationsContainerElement.appendChild(tempDocumentFragment)
        } else if (annotationsContainerElement.querySelectorAll("div.wsiAnnotationElement").length === 0) {
          annotationsContainerElement.innerHTML = `<div style="display:flex; align-items:center; width:100%; height:20vh;"><i style="color:slategray; margin:auto; font-size:18px">-- Nothing to show --</i></div>`
        }
      }
    }

  }

  if (isWSI) {
    
    const parentContentDiv = document.createElement("div")
    parentContentDiv.style.display = "flex"
    parentContentDiv.style.flexDirection = "column"
    
    const annotationTypesBtnGrp = document.createElement("div")
    annotationTypesBtnGrp.setAttribute("class", "btn-group btn-group-toggle wsiAnnotationTypesBtnGrp")
    annotationTypesBtnGrp.setAttribute("data-toggle", "buttons")
    
    const userAnnotationsBtn = document.createElement("button")
    userAnnotationsBtn.setAttribute("class", "btn btn-outline-secondary active wsiAnnotationType")
    userAnnotationsBtn.insertAdjacentHTML('beforeend', `<i class="fas fa-edit"></i>`)
    userAnnotationsBtn.onclick = (e) => annotations.populateWSIAnnotations(e.currentTarget, false)
    
    const modelPredictionsBtn = document.createElement("button")
    modelPredictionsBtn.setAttribute("class", "btn btn-outline-secondary wsiAnnotationType")
    modelPredictionsBtn.insertAdjacentHTML('beforeend', `<i class="fas fa-microchip"></i>`)
    modelPredictionsBtn.onclick = (e) => annotations.populateWSIAnnotations(e.currentTarget, true)
    
    annotationTypesBtnGrp.appendChild(userAnnotationsBtn)
    annotationTypesBtnGrp.appendChild(modelPredictionsBtn)
    parentContentDiv.appendChild(annotationTypesBtnGrp)
    
    const annotationsParentElement = document.createElement("div")
    annotationsParentElement.setAttribute("id", `wsiAnnotations_${annotationId}_parent`)
    annotationsParentElement.setAttribute("class", "wsiAnnotationsParent")
    annotationsParentElement.style.position = "relative"
    annotationsParentElement.style.flex = "1"

    const userAnnotationsDiv = document.createElement("div")
    userAnnotationsDiv.setAttribute("id", `wsiAnnotations_${annotationId}_user`)
    userAnnotationsDiv.setAttribute("class", "wsiAnnotationsList")
    userAnnotationsDiv.style.display = "none"
    
    const modelPredictionsDiv = document.createElement("div")
    modelPredictionsDiv.setAttribute("id", `wsiAnnotations_${annotationId}_model`)
    modelPredictionsDiv.setAttribute("class", "wsiAnnotationsList")
    modelPredictionsDiv.style.display = "none"

    annotationsParentElement.appendChild(userAnnotationsDiv)
    annotationsParentElement.appendChild(modelPredictionsDiv)

    parentContentDiv.appendChild(annotationsParentElement)
    annotationCardContentDiv.insertAdjacentElement('beforeend', parentContentDiv)
    annotations.populateWSIAnnotations(userAnnotationsBtn, false, true)
    // annotationsElement.style.contentVisibility = "auto"

  } else {
    annotationCardContentDiv.innerHTML = `
        <div class="card-body annotationsCardBody" name="${displayName}">
          <table id="${annotationName}Select" class="table qualitySelect">
            <thead>
              <tr>
                <th scope="col" style="border: none;">
                  <div class="text-left col">Label</div>
                </th>
                <th scope="col" style="border: none;">
                  <div class="text-center col">Model Score</div>
                </th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          </table>
          <div id="${annotationName}_othersAnnotations" class="quality_othersAnnotations"></div>
      `
    if (enableComments) {
      annotationCardContentDiv.innerHTML += `
          <div class="commentsToggleDiv">
            <button id="${annotationName}_commentsToggle" type="button" data-toggle="collapse" data-target="#${annotationName}_allComments" role="button" class="btn btn-link collapsed" disabled style="padding-left: 0;"></button>
          </div>
          <div class="collapse" id="${annotationName}_allComments">
            <div class="allCommentsCard card card-body" id="${annotationName}_allCommentsCard">
            </div>
          </div>
          <div id="${annotationName}_comments" class="quality_addComment form-group">
            <textarea class="form-control" id="${annotationName}_commentsTextField" rows="2" placeholder="Add your comments here..."></textarea>
            <div class="quality_commentOptions">
              <div>
                <label for="${annotationName}_commentsPublic" style="margin-right: 0.5rem;">Private</label>
                <div class="custom-control custom-switch">
                  <input type="checkbox" class="custom-control-input" id="${annotationName}_commentsPublic">
                  <label class="custom-control-label" for="${annotationName}_commentsPublic">Public</label>
                </div>
              </div>
              <div>
                <button type="button" onclick=cancelEditComment("${annotationName}") id="${annotationName}_cancelEditComment" class="btn btn-link">Cancel</button>
                <button type="submit" onclick="submitAnnotationComment('${annotationName}', '${metaName}')" id="${annotationName}_submitComment" class="btn btn-info" disabled>Submit</button>
              </div>
            </div>
          </div>
        `
    }
    annotationCardContentDiv.innerHTML += `
        </div>
      </div>
    `
  }
}

annotations.showQualitySelectors = async (annotation) => {
  const {
    annotationName,
    metaName,
    labels,
  } = annotation
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  
  const fileAnnotations = fileMetadata[metaName] ? JSON.parse(fileMetadata[metaName]) : {}
  const annotationDiv = document.getElementById(`${annotationName}Annotations`)
  const selectTable = document.getElementById(`${annotationName}Select`)
  const selectTableBody = selectTable.querySelector("tbody")

  // const qualitySelectorsDiv = document.createElement("div")
  // qualitySelectorsDiv.setAttribute("id", "qualitySelectors")
  // qualitySelectorsDiv.style.display = "flex"
  // qualitySelectorsDiv.style.flexDirection = "column"
  if (selectTableBody.childElementCount === 0) {
    labels.forEach((labelConfig) => {
      const {
        label,
        displayText,
        tooltip
      } = labelConfig
      const tableRow = document.createElement("tr")
      const tableAnnotationData = document.createElement("td")
      const annotationDiv = document.createElement("div")
      annotationDiv.setAttribute("class", "qualitySelectorDiv")

      const qualityButton = document.createElement("button")
      let qualityButtonClass = "btn btn-outline-info labelText"
      if (containsEmojiRegex.test(displayText)) {
        qualityButtonClass += " emojiText"
      } else {
        qualityButtonClass += " normalText"
      }
      qualityButton.setAttribute("class", qualityButtonClass)
      qualityButton.setAttribute("id", `${annotationName}_${label}`)
      qualityButton.setAttribute("value", label)
      qualityButton.onclick = () => selectQuality(annotation, label)
      qualityButton.innerText = displayText
      if (tooltip) {
        qualityButton.setAttribute("title", tooltip)
        new BSN.Tooltip(qualityButton, {
          'placement': "right",
          'animation': "slideNfade",
          'delay': 100,
          'html': true
        })
      }

      annotationDiv.appendChild(qualityButton)
      tableAnnotationData.style.borderRight = "none"
      tableAnnotationData.appendChild(annotationDiv)
      tableRow.appendChild(tableAnnotationData)

      const predictionTableData = document.createElement("td")
      predictionTableData.setAttribute("id", `${annotationName}_prediction_${label}`)
      predictionTableData.setAttribute("class", `predictionScore`)
      predictionTableData.setAttribute("align", "center")
      predictionTableData.style.verticalAlign = "middle"
      predictionTableData.style.borderLeft = "none"
      predictionTableData.innerHTML = "--"
      tableRow.appendChild(predictionTableData)
      selectTableBody.appendChild(tableRow)
    })
  }
  
  const previousPrediction = selectTableBody.querySelector("tr.modelPrediction")
  if (previousPrediction) {
    previousPrediction.classList.remove("modelPrediction")
  }
  const previousPredictionScores = selectTableBody.querySelectorAll("td.predictionScore")
  previousPredictionScores.forEach(el => el.innerText = "--")

  annotations.activateQualitySelector(annotationName, fileAnnotations)
  getOthersAnnotations(annotationName, fileAnnotations)
  annotationDiv.style.borderBottom = "1px solid rgba(0,0,0,.125)"
}

annotations.loadModelPredictions = async () => {
  for (const annotation of path.datasetConfig.annotations) {
    const modelQualityPrediction = !path.isWSI && await models.getTMAPrediction(annotation.annotationId, annotation.metaName)
    if (modelQualityPrediction) {
      displayModelPrediction(modelQualityPrediction, annotation)
    }
  }
}

const displayModelPrediction = (modelQualityPrediction, annotation) => {
  const { annotationName } = annotation
  const tableBodyElement = document.getElementById(`${annotationName}Select`)
  annotation.labels.forEach(({
    label
  }) => {
    const labelPrediction = modelQualityPrediction.find(pred => pred.label === label || pred.displayName === label) // pred.label is what local model sets, pred.displayName is what the getPathPrediction cloud function sends, so handling both.
    const labelScore = labelPrediction ? (labelPrediction.classification?.score ? Number.parseFloat(labelPrediction.classification.score).toPrecision(2) : Number.parseFloat(labelPrediction.prob).toPrecision(3)) : "--"
    const tablePredictionData = tableBodyElement.querySelector(`td#${annotationName}_prediction_${label}`)
    tablePredictionData.innerHTML = labelScore
    if (labelScore > 0.5) {
      tablePredictionData.parentElement.classList.add("modelPrediction")
    }
  })
}

const getOthersAnnotations = (annotationName, fileAnnotations) => {
  let othersAnnotationsText = ""
  const othersAnnotationsDiv = document.getElementById(`${annotationName}_othersAnnotations`)
  const annotationDisplayName = othersAnnotationsDiv.parentElement.getAttribute("name")
  if (fileAnnotations) {
    const {
      model,
      ...nonModelAnnotations
    } = fileAnnotations
    let othersAnnotations = Object.values(nonModelAnnotations).filter(annotation => annotation && annotation.userId !== window.localStorage.userId)
    if (othersAnnotations.length > 0) {
      const othersAnnotationsUsernames = othersAnnotations.map(annotation => annotation.username)
      const othersAnnotationsUsernamesText = othersAnnotationsUsernames.length === 1 ?
        othersAnnotationsUsernames[0] :
        othersAnnotationsUsernames.slice(0, othersAnnotationsUsernames.length - 1).join(", ") + " and " + othersAnnotationsUsernames[othersAnnotationsUsernames.length - 1]
      othersAnnotationsText = `-- ${othersAnnotationsUsernamesText} annotated this image for ${annotationDisplayName}.`
    }
  }

  othersAnnotationsDiv.innerHTML = othersAnnotationsText
}

annotations.getNumCompletedAnnotations = (metadata) => {
  let numAnnotationsCompleted = 0
  if (path.datasetConfig && path.datasetConfig.annotations) {
    numAnnotationsCompleted = path.datasetConfig.annotations.reduce((total, {
      metaName
    }) => {
      if (metadata[metaName] && window.localStorage.userId in JSON.parse(metadata[metaName])) {
        total += 1
      }
      return total
    }, 0)
  }
  return numAnnotationsCompleted
}

annotations.showNextImageButton = (metadata) => {
  const areThumbnailsLoaded = !!document.getElementById("thumbnailsList")
  if (areThumbnailsLoaded) { // Check for when path.selectDataset completes before canvas is loaded, and thumbnails don't exist yet.
    const nextImageMessage = document.getElementById("nextImageMessage")
    nextImageMessage.innerHTML = ``
   
    if (path.datasetConfig.annotations.length > 0) {
      metadata = metadata || JSON.parse(window.localStorage.fileMetadata)
      const numAnnotationsCompleted = annotations.getNumCompletedAnnotations(metadata)
      const nextImageText = `<b><span style='color:darkorchid'>${numAnnotationsCompleted}</span> / ${path.datasetConfig.annotations.length} Annotations Completed!</b>`
      nextImageMessage.innerHTML = nextImageText
    
      const nextImageButton = document.getElementById("nextImageBtn") || document.createElement("button")
      nextImageButton.setAttribute("type", "button")
      nextImageButton.setAttribute("id", "nextImageBtn")
      nextImageButton.setAttribute("class", "btn btn-link")
      nextImageButton.innerHTML = "Next Image >>"
    
      const isLastImageInThumbnailsList = (imageId=hashParams.image.toString()) => document.querySelector("div.thumbnailDiv:last-of-type>img.imagePickerThumbnail").getAttribute("entry_id") === imageId
      
      nextImageButton.onclick = async (_) => {
       
        if (isLastImageInThumbnailsList(hashParams.image.toString())) {
          const thumbnailCurrentPageText = document.getElementById("thumbnailPageSelector_currentPage")
          thumbnailCurrentPageText.stepUp()
          thumbnailCurrentPageText.dispatchEvent(new Event("change"))
          
          setTimeout(() => { // Needs to wait for new thumbnails list to be loaded. Very ugly, need rethinking later.
            path.selectImage(document.querySelector("img.imagePickerThumbnail").getAttribute("entry_id"))
          }, 1000)     
       
        } else {
          const thumbnailElements = document.querySelectorAll("img.imagePickerThumbnail")
          let nextImageIndex = -1
          thumbnailElements.forEach((el,ind) => {
            if (el.classList.contains("selectedThumbnail")) {
              nextImageIndex = ind + 1
            }
          })
        
          path.selectImage(thumbnailElements[nextImageIndex].getAttribute("entry_id"))
        }
      }
  
      nextImageMessage.appendChild(nextImageButton)
    
      if (isLastImageInThumbnailsList(hashParams.image.toString()) && thumbnails.isThumbnailsLastPage()) {
        nextImageButton.setAttribute("disabled", "true")
      }
    }
  }
}

const selectQuality = async (annotation, qualitySelected) => {
  const { annotationName, metaName } = annotation
  if (await box.isLoggedIn()) {
    const imageId = hashParams.image
    const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
    const fileAnnotations = fileMetadata[metaName] ? JSON.parse(fileMetadata[metaName]) : {}

    const newAnnotation = {
      'userId': window.localStorage.userId,
      'email': window.localStorage.email,
      'username': window.localStorage.username,
      'value': qualitySelected,
      'createdAt': Date.now()
    }

    const previousAnnotation = fileAnnotations[window.localStorage.userId]
    if (previousAnnotation && previousAnnotation.value != newAnnotation.value) {
      const {
        displayText: previousValue
      } = annotation.labels.find(quality => quality.label === previousAnnotation.value)
      const {
        displayText: newValue
      } = annotation.labels.find(quality => quality.label === newAnnotation.value)
      if (!confirm(`You previously annotated this image to be of ${previousValue} quality. Do you wish to change your annotation to ${newValue} quality?`)) {
        return
      } else {
        fileAnnotations[window.localStorage.userId].value = newAnnotation.value
        fileAnnotations[window.localStorage.userId].createdAt = Date.now()
      }
    } else if (previousAnnotation && previousAnnotation.value == newAnnotation.value) {
      return
    } else {
      fileAnnotations[window.localStorage.userId] = newAnnotation
    }
    const boxMetadataPath = `/${metaName}`
    const newMetadata = await box.updateMetadata(imageId, boxMetadataPath, JSON.stringify(fileAnnotations))

    if (!newMetadata.status) { // status is returned only on error, check for errors properly later
      window.localStorage.fileMetadata = JSON.stringify(newMetadata)
      utils.showToast(`Annotation Successful!`)
      thumbnails.borderByAnnotations(hashParams.image, newMetadata)

      if (imageId === hashParams.image) {
        annotations.activateQualitySelector(annotationName, fileAnnotations)
        annotations.showNextImageButton(newMetadata)
      }
    } else {
      utils.showToast("Error occurred during annotation, please try again later!")
    }
  }
}

const submitAnnotationComment = (annotationName) => {
  const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
  const commentText = commentsTextField.value.trim()

  if (commentText.length === 0) {
    return
  }

  const newCommentMetadata = {
    "commentId": Math.floor(1000000 + Math.random() * 9000000),
    "userId": window.localStorage.userId,
    "createdBy": window.localStorage.username,
    "text": commentText,
    "isPrivate": !(document.getElementById(`${annotationName}_commentsPublic`).checked)
  }

  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const annotationComments = fileMetadata[`${annotationName}_comments`] ? JSON.parse(fileMetadata[`${annotationName}_comments`]) : []
  const editingCommentId = parseInt(commentsTextField.getAttribute("editingCommentId"))
  // If comment is an edit of a previously submitted comment, replace it, otherwise add a new one.
  if (editingCommentId) {
    newCommentMetadata["modifiedAt"] = Date.now()
    const editingCommentIndex = annotationComments.findIndex(comment => comment["commentId"] === editingCommentId)
    annotationComments[editingCommentIndex] = newCommentMetadata
  } else {
    newCommentMetadata["createdAt"] = Date.now()
    annotationComments.push(newCommentMetadata)
  }

  annotations.updateCommentsInBox(annotationName, annotationComments, true)
}

annotations.updateCommentsInBox = async (annotationName, annotationComments, newComment=false) => {
  const boxMetadataPath = `/${annotationName}_comments`
  try {
    const newMetadata = await box.updateMetadata(hashParams.image, boxMetadataPath, JSON.stringify(annotationComments))
    const localFileMetadata = JSON.parse(window.localStorage.fileMetadata)
    
    if (localFileMetadata[`${annotationName}_comments`] && JSON.parse(newMetadata[`${annotationName}_comments`]).length < JSON.parse(localFileMetadata[`${annotationName}_comments`]).length ) {
      utils.showToast("Comment Deleted Successfully!")
    } else if (newComment) {
      utils.showToast("Comment Added Successfully!")
    }

    window.localStorage.fileMetadata = JSON.stringify(newMetadata)
    annotations.populateComments(annotationName)

    const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
    if (toggleCommentsButton.classList.contains("collapsed") && newComment) {
      toggleCommentsButton.click()
    }
    document.getElementById(`${annotationName}_allCommentsCard`).scrollTop = document.getElementById(`${annotationName}_allCommentsCard`).scrollHeight

    cancelEditComment(annotationName)
    return newMetadata
  } catch (e) {
    utils.showToast("Some error occurred adding your comment. Please try later!")
    console.log(e)
  }
}

annotations.populateComments = (annotationName) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
  const commentsCard = document.getElementById(`${annotationName}_allCommentsCard`)

  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments.length > 0) {
      let commentsSortedByTime = annotationComments.sort((prevComment, currentComment) => prevComment.createdAt - currentComment.createdAt)
      // To resolve breaking change of comments not having the ID field before. Assign old comments IDs and store them back in Box.
      commentsSortedByTime = commentsSortedByTime.map(comment => {
        const commentWithId = {
          ...comment
        }
        if (!commentWithId["commentId"]) {
          commentWithId["commentId"] = Math.floor(1000000 + Math.random() * 9000000)
        }
        return commentWithId
      })
      if (JSON.stringify(annotationComments) !== JSON.stringify(commentsSortedByTime)) {
        annotations.updateCommentsInBox(annotationName, commentsSortedByTime)
      }

      const visibleComments = commentsSortedByTime.filter(comment => comment.userId === window.localStorage.userId || !comment.isPrivate)
      if (visibleComments.length > 0) {
        const userCommentIds = []

        const commentsHTML = visibleComments.map((comment, index) => {
          const {
            commentId
          } = comment
          let commentElement = `
            <span class="annotationComment" id="${annotationName}_comment_${commentId}">
              <span class="annotationCommentText">
                <b>
                <u style="color: dodgerblue;">${comment.createdBy.trim()}</u>
                </b>
          `
          if (!comment.isPrivate) {
            commentElement += `
                <i class="fas fa-globe" title="This comment is public"></i>
            `
          }

          commentElement += `
          :
                <strong style="color: rgb(85, 85, 85);">
                  ${comment.text}
                </strong>
              </span>
          `

          if (comment.userId === window.localStorage.userId) {
            const commentDropdownMenu = `
              <div class="dropleft dropdown commentMenu" id="${annotationName}_commentMenu_${commentId}">
                <button class="btn btn-light dropdown-toggle commentMenuToggle" role="button" id="${annotationName}_commentMenuToggle_${commentId}" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                  <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="dropdown-menu commentMenuDropdown" style="top: -10px;">
                  <div class="commentMenuButtons">
                    <button class="btn btn-light commentMenuOption" role="button" id="${annotationName}_editComment_${commentId}" title="Edit" onclick="editAnnotationComment('${annotationName}', ${commentId})"  aria-haspopup="true" aria-expanded="false">
                      <i class="fas fa-pencil-alt"></i>
                    </button>
                    <div style="border-left: 1px solid lightgray; height: auto;"></div>
                    <button class="btn btn-light commentMenuOption" role="button" id="${annotationName}_deleteComment_${commentId}" title="Delete" onclick="deleteAnnotationComment('${annotationName}', ${commentId})" aria-haspopup="true" aria-expanded="false">
                      <i class="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              </div>
            `
            commentElement += commentDropdownMenu
            userCommentIds.push(commentId)
          }

          commentElement += "</span>"
          commentElement += (index !== commentsSortedByTime.length - 1) ? "<hr/>" : ""
          return commentElement
        }).join("")

        commentsCard.innerHTML = commentsHTML

        userCommentIds.forEach(commentId => {
          const commentMenu = document.getElementById(`${annotationName}_commentMenu_${commentId}`)
          new BSN.Dropdown(commentMenu)

          new BSN.Tooltip(document.getElementById(`${annotationName}_editComment_${commentId}`), {
            'placement': "bottom",
            'animation': "slideNfade",
            'delay': 50
          })
          new BSN.Tooltip(document.getElementById(`${annotationName}_deleteComment_${commentId}`), {
            'placement': "bottom",
            'animation': "slideNfade",
            'delay': 50
          })
          const commentSpan = document.getElementById(`${annotationName}_comment_${commentId}`)
          commentSpan.onmouseover = () => {
            document.getElementById(`${annotationName}_commentMenu_${commentId}`).style.display = "block"
          }
          commentSpan.onmouseleave = () => {
            const commentMenuIsOpen = commentMenu.querySelector("div.commentMenuDropdown").classList.contains("show")
            if (!commentMenuIsOpen) {
              document.getElementById(`${annotationName}_commentMenu_${commentId}`).style.display = "none"
            }
          }
        })

        toggleCommentsButton.innerHTML = "+ Show All Comments"
        toggleCommentsButton.parentElement.style["text-align"] = "left"
        toggleCommentsButton.removeAttribute("disabled")

        return
      }
    }
  }

  commentsCard.innerHTML = ""
  if (!(toggleCommentsButton.classList.contains("collapsed"))) {
    toggleCommentsButton.Collapse.hide()
  }
  toggleCommentsButton.parentElement.style["text-align"] = "center"
  toggleCommentsButton.setAttribute("disabled", "true")
  toggleCommentsButton.innerHTML = "-- No Comments To Show --"

}

const editAnnotationComment = async (annotationName, commentId) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments) {
      const commentToEdit = annotationComments.find(comment => comment["commentId"] === commentId)
      if (commentToEdit) {
        const {
          userId,
          text,
          isPrivate
        } = commentToEdit
        if (userId === window.localStorage.userId) {
          const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
          commentsTextField.setAttribute("editingCommentId", commentId)
          commentsTextField.value = text
          document.getElementById(`${annotationName}_commentsPublic`).checked = !isPrivate
          commentsTextField.focus()
          if (text.trim().length > 0) {
            document.getElementById(`${annotationName}_submitComment`).removeAttribute("disabled")
          }
        }
      }
    }
  }
}

const deleteAnnotationComment = async (annotationName, commentId) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments) {
      const commentsAfterDelete = annotationComments.filter(comment => comment["commentId"] !== commentId)
      if (commentsAfterDelete.length !== annotationComments.length) {
        annotations.updateCommentsInBox(annotationName, commentsAfterDelete)
      }
    }
  }
}

const cancelEditComment = async (annotationName) => {
  document.getElementById(`${annotationName}_commentsTextField`).value = ""
  document.getElementById(`${annotationName}_commentsTextField`).removeAttribute("editingCommentId")
  document.getElementById(`${annotationName}_commentsPublic`).checked = false
  document.getElementById(`${annotationName}_submitComment`).setAttribute("disabled", "true")
}

annotations.activateQualitySelector = (annotationName, fileAnnotations) => {
  const selectTable = document.getElementById(`${annotationName}Select`)
  const currentlyActiveButton = selectTable.querySelector("button.active")
  if (currentlyActiveButton) {
    currentlyActiveButton.classList.remove("active")
  }
  if (fileAnnotations && fileAnnotations[window.localStorage.userId]) {
    let userAnnotation = fileAnnotations[window.localStorage.userId].value
    // Temporary fix for problem of label mismatch due to AutoML (they were 0, 0.5, 1 before, had to be changed to 
    // O, M, S for AutoML training). Need to change the metadata of all annotated files to solve the problem properly. 
    // if (annotationConfig.labels.find(q => q.label === )) {
    //   userAnnotation = qualityEnum.find(quality => quality.label === fileAnnotations[window.localStorage.userId].value).label
    // }
    const newActiveButton = selectTable.querySelector(`button[value='${userAnnotation}']`)
    if (newActiveButton) {
      newActiveButton.classList.add("active")
    }
  }
}

annotations.deactivateQualitySelectors = () => {
  const activeQualitySelector = document.querySelectorAll("button.labelText.active")
  activeQualitySelector.forEach(element => element.classList.remove("active"))
}


const addClassificationToConfig = () => {
  let formIsValid = true
  let alertMessage = ""
  let newAnnotation = {}
  let isEditing = false
  let oldAnnotation = {} // To compare if anything changed when an edit was made
  
  const annotationForm = document.getElementById("createClassificationForm")

  const annotationIdToEdit = parseInt(annotationForm.getAttribute("annotationId"))
  if (annotationIdToEdit) {
    const annotationConfig = path.datasetConfig.annotations.find(a => a.annotationId === annotationIdToEdit)
    isEditing = true
    oldAnnotation = JSON.parse(JSON.stringify(annotationConfig))
    newAnnotation = JSON.parse(JSON.stringify(annotationConfig))
  } else {
    newAnnotation = {
      "annotationId": annotationIdToEdit || Math.floor(1000000 + Math.random() * 9000000), //random 7 digit annotation ID
      "displayName": "",
      "annotationName": "",
      "definition": "",
      "enableComments": false,
      "labelType": "",
      "labels": [],
      "createdBy": "",
      "private": false,
    }
  }


  annotationForm.querySelectorAll(".form-control").forEach(element => {
    if (element.name) {
      switch (element.name) {
        case "datasetFolderId":
          // Check if dataset folder exists in Box and if it has a config. Fetch it if it does.
          break

        case "displayName":
          if (!element.value) {
            formIsValid = false
            alertMessage = "Please enter values for the missing fields!"

            element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
            element.oninput = element.oninput ? element.oninput : () => {
              if (element.value) {
                element.style.boxShadow = "none"
              } else {
                element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              }
            }

            break
          }
          
          newAnnotation["displayName"] = element.value

          newAnnotation["annotationName"] = element.value.split(" ").map((word, ind) => {
            if (ind === 0) {
              return word.toLowerCase()
            } else {
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            }
          }).join("")
          newAnnotation["annotationName"] += `_${newAnnotation["annotationId"]}`

          break

        case "labelDisplayText":
          if (!element.value) {
            formIsValid = false
            alertMessage = "Please enter values for the missing fields!"

            element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
            element.oninput = element.oninput ? element.oninput : () => {
              if (element.value) {
                element.style.boxShadow = "none"
              } else {
                element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              }
            }
          } else {
            const alreadyDefinedLabels = newAnnotation.labels.map(label => label.displayText)
            if (alreadyDefinedLabels.indexOf(element.value) != -1 && !isEditing) {
              formIsValid = false
              alertMessage = alertMessage || "Labels must have unique values!"
              element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              document.getElementById(`labelDisplayText_${alreadyDefinedLabels.indexOf(element.value)}`).style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)"
              break
            }
            
            const labelTextIndex = parseInt(element.id.split("_")[1])
            newAnnotation.labels[labelTextIndex] = newAnnotation.labels[labelTextIndex] ? {
              ...newAnnotation.labels[labelTextIndex],
              "displayText": element.value
            } : {
              "displayText": element.value
            }
          }

          break

        case "labelValue":
          if (!element.value) {
            formIsValid = false
            alertMessage = "Please enter values for the missing fields!"

            element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
            element.oninput = element.oninput ? element.oninput : () => {
              if (element.value) {
                element.style.boxShadow = "none"
              } else {
                element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              }
            }

          } else {
            const alreadyDefinedLabels = newAnnotation.labels.map(label => label.label)
            if (alreadyDefinedLabels.indexOf(element.value) != -1 && !isEditing) {
              formIsValid = false
              alertMessage = alertMessage || "Labels must have unique values!"
              element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              document.getElementById(`labelValue_${alreadyDefinedLabels.indexOf(element.value)}`).style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)"
              break
            }

            const labelValueIndex = parseInt(element.id.split("_")[1])
            newAnnotation.labels[labelValueIndex] = newAnnotation.labels[labelValueIndex] ? {
              ...newAnnotation.labels[labelValueIndex],
              "label": element.value
            } : {
              "label": element.value
            }
          }

          break

        default:
          if (element.type === "checkbox") {
            newAnnotation[element.name] = element.checked
          } else {
            if (element.name === "labelType" && !element.value) {
              formIsValid = false
              alertMessage = "Please enter values for the missing fields!"

              element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              element.oninput = element.oninput ? element.oninput : () => {
                if (element.value) {
                  element.style.boxShadow = "none"
                } else {
                  element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
                }
              }

              break
            }
            newAnnotation[element.name] = element.value
          }
      }
    }
  })

  if (isEditing) {
    const labelDisplayTexts = newAnnotation.labels.map(label => label.displayText)
    const labelValues = newAnnotation.labels.map(label => label.label)
    if (labelDisplayTexts.length > (new Set(labelDisplayTexts)).size || labelValues.length > (new Set(labelValues)).size) {
      formIsValid = false
      alertMessage = alertMessage || "Labels must have unique values!"
    }
  }

  if (!formIsValid) {
    alert(alertMessage)
    return
  }

  if (isEditing) {
    let formHasChanged = false
    Object.keys(oldAnnotation).forEach(key => {
      if (key !== "labels") {
        formHasChanged = formHasChanged || oldAnnotation[key] !== newAnnotation[key]
      } else {
        formHasChanged = formHasChanged || oldAnnotation[key].length !== newAnnotation[key].length || oldAnnotation[key].filter(oldLabel => newAnnotation[key].findIndex(newLabel => newLabel.displayText === oldLabel.displayText && newLabel.label === oldLabel.label) === -1).length > 0
      }
    })
    if (!formHasChanged) {
      return
    }
  }

  if (annotationIdToEdit) {
    newAnnotation["modifiedAt"] = Date.now()
    newAnnotation["lastModifiedByUserId"] = window.localStorage.userId
    newAnnotation["lastModifiedByUsername"] = window.localStorage.username
    updateConfigInBox("annotations", "modify", newAnnotation, "annotationId")
  } else {
    newAnnotation["createdAt"] = Date.now()
    newAnnotation["createdByUserId"] = window.localStorage.userId
    newAnnotation["createdByUsername"] = window.localStorage.userId
    newAnnotation["metaName"] = `${newAnnotation["displayName"]}_${newAnnotation["annotationId"]}_annotations`
    updateConfigInBox("annotations", "append", newAnnotation)
  }

  const modalCloseBtn = document.getElementsByClassName("modal-footer")[0].querySelector("button[data-dismiss=modal]")
  modalCloseBtn.click()
}

const editClassificationConfig = (annotationId) => {
  const annotationForm = document.getElementById("createClassificationForm")
  annotationForm.setAttribute("annotationId", annotationId) // Used after submit to know if the form was used to add a new class or update an old one.

  const annotationToEdit = path.datasetConfig.annotations.filter(annotation => annotation["annotationId"] === annotationId)[0]
  if (annotationToEdit) {
    document.getElementById("addClassificationBtn").Modal.show()
    document.getElementById("addClassificationModal").querySelector("button[type=submit]").innerHTML = "Update Class"

    annotationForm.querySelectorAll(".form-control").forEach(element => {

      if (element.name && !element.classList.contains("classLabelField")) {

        switch (element.name) {
          case "datasetFolderId":
            break

          case "displayName":
          case "definition":
            element.value = annotationToEdit[element.name]
            break

          case "labelType":
            element.value = annotationToEdit[element.name]
            displayLabelsSectionInModal(element)

          // case "label":


          case "enableComments":
            element.checked = annotationToEdit.enableComments
            break

          default:
        }
      }
    })

    annotationForm.querySelector("div#modalLabelsList").innerHTML = ""
    annotationToEdit.labels.forEach(label => {
      const newLabelRow = annotations.addLabelToModal()
      newLabelRow.querySelector("input[name=labelDisplayText]").value = label.displayText
      newLabelRow.querySelector("input[name=labelValue]").value = label.label
    })

  }
}

const deleteClassificationConfig = async (annotationId) => {
  if (confirm("This will delete this classification for everyone with access to this dataset. Are you sure you want to continue?")) {
    const annotationToDelete = path.datasetConfig.annotations.filter(annotation => annotation["annotationId"] === annotationId)[0]
    if (annotationToDelete) {
      updateConfigInBox("annotations", "remove", annotationToDelete, "annotationId")
    }
  }
}

const updateConfigInBox = async (changedProperty = "annotations", operation, deltaData, identifier) => {
  let toastMessage = ""
  if (deltaData) {
    const isFileJSON = true
    const datasetConfig = { ...path.datasetConfig }
    if (datasetConfig) {

      if (operation === "append") {

        if (Array.isArray(datasetConfig[changedProperty])) {
          datasetConfig[changedProperty].push(deltaData)
        } else if (typeof (datasetConfig[changedProperty]) === "object") {
          datasetConfig[changedProperty] = {
            ...deltaData,
            ...datasetConfig[changedProperty]
          }
        }

        toastMessage = "New Class Added Successfully!"

      } else if (operation === "remove") {

        if (Array.isArray(datasetConfig[changedProperty])) {
          datasetConfig[changedProperty] = datasetConfig[changedProperty].filter(val => {
            if (typeof (val) === "object" && val[identifier]) {
              return val[identifier] !== deltaData[identifier]
            } else {
              return val !== deltaData
            }
          })
        } else if (typeof (datasetConfig[changedProperty]) === "object" && datasetConfig[changedProperty][deltaData]) {
          delete datasetConfig[changedProperty][deltaData]
        }

        toastMessage = "Class Removed From Config!"

      } else if (operation === "modify") {

        if (Array.isArray(datasetConfig[changedProperty])) {

          const indexToChangeAt = datasetConfig[changedProperty].findIndex(val => {
            if (typeof (val) === "object" && val[identifier]) {
              return val[identifier] === deltaData[identifier]
            } else {
              return val === deltaData
            }
          })

          if (indexToChangeAt !== -1) {
            datasetConfig[changedProperty][indexToChangeAt] = deltaData
          }

        } else if (typeof (datasetConfig[changedProperty]) === "object") {
          datasetConfig[changedProperty] = deltaData
        }
        toastMessage = "Class Updated Successfully!"
      }
    } else {
      console.log("UPDATE CONFIG OPERATION FAILED!")
      return
    }

    const newConfigFormData = new FormData()
    const configFileAttributes = {
      "name": datasetConfigFileName
    }
    const newConfigBlob = new Blob([JSON.stringify(datasetConfig)], {
      type: "application/json"
    })
    newConfigFormData.append("attributes", JSON.stringify(configFileAttributes))
    newConfigFormData.append("file", newConfigBlob)

    try {
      await box.uploadFile(newConfigFormData, box.currentDatasetConfigFileId)
      utils.showToast(toastMessage)
      
      path.datasetConfig = datasetConfig
      annotations.showAnnotationOptions(path.datasetConfig.annotations, true, true)
      // path.datasetConfig.annotations.forEach((annotationConfig) => annotations.createTables(annotationConfig, annotationConfig[identifier] === deltaData[identifier]))

      thumbnails.reBorderThumbnails()

    } catch (e) {
      console.log("Couldn't upload new config to Box!", e)
      utils.showToast("Some error occurred while adding the annotation. Please try again!")
    }
  }
}

annotations.addLabelToModal = () => {
  const modalLabelsList = document.getElementById("modalLabelsList")
  const numLabelsAdded = modalLabelsList.childElementCount
  const newLabelRow = document.createElement("div")
  newLabelRow.setAttribute("class", "row")
  newLabelRow.innerHTML = `
    <div class="form-group row addedLabel">
      <div class="col">
        <input type="text" class="form-control" placeholder="Display Name*" name="labelDisplayText" id="labelDisplayText_${numLabelsAdded}" oninput="annotations.prefillLabelValueInModal(${numLabelsAdded})" required="true"></input>
      </div>
    </div>
    <div class="form-group row addedLabel">
      <div class="col">
        <input type="text" class="form-control" placeholder="Label Value*" name="labelValue" id="labelValue_${numLabelsAdded}" oninput="this.setAttribute('userInput', true)" required="true"></input>
      </div>
    </div>
    <div class="col-sm-1">
    <button type="button" class="close" aria-label="Close" style="margin-top: 50%" onclick="removeLabelFromModal(this);">
      <span aria-hidden="true">&times;</span>
    </button>
    </div>
  `
  modalLabelsList.appendChild(newLabelRow)
  return newLabelRow
}

annotations.prefillLabelValueInModal = (labelInputIndex) => {
  const elementToPrefillFrom = document.getElementById(`labelDisplayText_${labelInputIndex}`)
  const elementToPrefillInto = document.getElementById(`labelValue_${labelInputIndex}`)
  if (elementToPrefillFrom && elementToPrefillInto && !elementToPrefillInto.getAttribute("userInput")) {
    elementToPrefillInto.value = elementToPrefillFrom.value
  }
}

const removeLabelFromModal = (target) => {
  const modalLabelsList = document.getElementById("modalLabelsList")
  modalLabelsList.removeChild(target.parentElement.parentElement)
}

const displayLabelsSectionInModal = (selectElement) => {
  if (selectElement.value) {
    document.getElementById("addLabelsToModal").style.display = "flex"
  } else {
    document.getElementById("addLabelsToModal").style.display = "none"
  }
}

annotations.resetAddClassificationModal = () => {
  const annotationForm = document.getElementById("createClassificationForm")
  annotationForm.removeAttribute("annotationId")
  annotationForm.querySelectorAll(".form-control").forEach(element => {
    if (element.type === "checkbox") {
      element.checked = false
    } else {
      element.value = ""
    }
  })

  const modalLabelsList = document.getElementById("modalLabelsList")
  while (modalLabelsList.firstElementChild !== modalLabelsList.lastElementChild) {
    modalLabelsList.removeChild(modalLabelsList.lastElementChild)
  }
  modalLabelsList.parentElement.style.display = "none"

  document.getElementById("addClassificationModal").querySelector("button[type=submit]").innerHTML = "Create Class"
}