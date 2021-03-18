const wsi = {}
const EPSILON = Math.pow(10, -11)
wsi.defaultLabelOverlayColors = ['#33a02c99','#e31a1c99','#1f78b499','#6a3d9a99','#ff7f0099','#b1592899','#a6cee399','#b2df8a99','#fb9a9999','#fdbf6f99','#cab2d699','#ffff9999']

wsi.metadataPathPrefix = "wsi"
wsi.customMetadataPathPrefix = "wsi_customAnnotation_0"
wsi.tileServerBasePath = "https://dl-test-tma.uc.r.appspot.com/iiif"

const reloadImageAfterURLTimeout = (id) => wsi.loadImage(id)

wsi.checkServiceWorkerRegistration = async () => {
  const addedServiceWorkers = await window.navigator.serviceWorker.getRegistrations()
  let addedServiceWorker = addedServiceWorkers.find(sw => sw.scope.includes(window.location.hostname))
  if (!addedServiceWorker) {
    addedServiceWorker = await wsi.registerServiceWorker()
  }
  wsi.tileServerBasePath = `${addedServiceWorker.scope}/iiif`
}

wsi.registerServiceWorker = () => new Promise((resolve, reject) => {
  window.navigator.serviceWorker.register('/wsiServiceWorker.js')
  .then((reg) => {
    // registration worked
    console.log('SW Registration succeeded. Scope is ' + reg.scope);
    resolve(reg)
  }).catch((error) => {
    // registration failed
    console.log('SW Registration failed with ' + error);
    reject(error)
  });
})

wsi.loadImage = async (id, fileMetadata={}) => {
  if (!path.wsiOptions) {
    path.loadWSIOptions()
  }
  // path.toolsDiv.parentElement.style.display = "none"
  // path.tmaOptions = false
  path.tmaCanvas.parentElement.style.display = "none"
  path.wsiViewerDiv.style.display = "block"
  path.imageDiv.style["pointer-events"] = "auto"
  path.isImageFromBox = true

  const loaderElementId = "imgLoaderDiv"
  showLoader(loaderElementId, path.wsiViewerDiv)
  // await wsi.checkServiceWorkerRegistration()
  const url = await box.getFileContent(id, false, true)
  
  const tileServerRequestURL = `${wsi.tileServerBasePath}/?iiif=${url}`;
  const infoURL = `${tileServerRequestURL}/info.json`
  let imageInfo = fileMetadata.wsiInfo ? JSON.parse(fileMetadata.wsiInfo) : undefined
  if (!imageInfo) {
    try {
      imageInfo = await utils.request(infoURL, {}, true)
    } catch (e) {
      alert("An error occurred retrieving the image information. Please try again later.")
      hideLoader(loaderElementId)
      return
    }
  }
  
  console.log("Image Info : ", imageInfo)
  const tileSources = {
    "@context": imageInfo["@context"],
    "@id": tileServerRequestURL,
    "height": parseInt(imageInfo.height),
    "width": parseInt(imageInfo.width),
    "profile": ["http://iiif.io/api/image/2/level2.json"],
    "protocol": "http://iiif.io/api/image",
    "tiles": [{
      "scaleFactors": [1, 4, 16, 64, 256, 1024],
      "width": 256
    }]
  }
  
  
  if (!path.wsiViewer.canvas) {
    path.tmaCanvas.parentElement.style.backgroundColor = "black"
    path.wsiViewer = OpenSeadragon({
      id: "wsiCanvasParent",
      visibilityRatio: 1,
      minZoomImageRatio: 1,
      prefixUrl: "https://episphere.github.io/svs/openseadragon/images/images_new/",
      tileSources,
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: true
      },
      crossOriginPolicy: "Anonymous",
      showNavigator: false,
      showZoomControl: false,
      navigationControlAnchor: OpenSeadragon.ControlAnchor["TOP_RIGHT"],
      // debugMode: true,
      immediateRender: false,
      // imageLoaderLimit: 5,
      timeout: 60*1000
    });

    path.wsiViewer.imageLoadedAtTime = Date.now()
    
    path.wsiViewer.buttons.buttons.forEach(button => {
      // Make interface consistent for all control buttons.
      button.imgGroup.style.display = "none"
      button.element.style.cursor = "pointer"
    })

    const createAddAnnotationsButton = () => {
      const annotateWSIButtonDiv = document.createElement("div")
      annotateWSIButtonDiv.className = "wsiControlBtnParent"
      const annotateWSIButton = document.createElement("button")
      annotateWSIButton.id = "wsiAnnotateBtn"
      annotateWSIButton.className = "btn wsiControlBtn"
      annotateWSIButton.setAttribute("type", "button")
      annotateWSIButton.setAttribute("disabled", "true")
      annotateWSIButton.innerHTML = `<i class="far fa-edit"></i>`
      annotateWSIButtonDiv.appendChild(annotateWSIButton)
      annotateWSIButtonDiv.title = "Annotate Image"
  
      annotateWSIButton.onclick = (e) => {
        const { annotationId, displayName, metaName, labels } = path.datasetConfig.annotations[0]
        annotateWSIButtonDiv.selected = !annotateWSIButtonDiv.selected
        if (annotateWSIButtonDiv.selected) {
          annotateWSIButtonDiv.classList.add("active")
          path.wsiViewer.element.style.cursor = "crosshair"
          path.wsiViewer.addHandler('canvas-click', (e) => {
            e.preventDefaultAction = true
            const pos = path.wsiViewer.viewport.pointFromPixel(e.position)
            const tiledImage = path.wsiViewer.world.getItemAt(0)
            if (tiledImage) {
              const tilesClicked = tiledImage.lastDrawn.filter((tile) => tile.bounds.containsPoint(pos))
              const smallestTileClicked = tilesClicked.reduce((minTile, tile) => tile.level > minTile.level ? tile : minTile, {
                level: 0
              })
              const isOverlayPresent = (tileClicked) => {
                let isOverlayPresent = false
                if (path.wsiViewer.currentOverlays.length > 0) {
                  path.wsiViewer.currentOverlays.forEach(overlay => {
                    if (Object.entries(tileClicked.bounds).every(([key,val]) => val === overlay.bounds[key])) {
                      isOverlayPresent = true
                    }
                  })
                }
                return isOverlayPresent
              }

              if (!isOverlayPresent(smallestTileClicked)) {
                wsi.createOverlayRect({
                  "type": "user",
                  "rectBounds": smallestTileClicked.bounds,
                  annotationId
                })
                
                const wsiAnnotations = JSON.parse(window.localStorage.fileMetadata)[`${wsi.metadataPathPrefix}_${metaName}`] ? JSON.parse(JSON.parse(window.localStorage.fileMetadata)[`${wsi.metadataPathPrefix}_${metaName}`]) : {}
                wsiAnnotations[window.localStorage.userId] = wsiAnnotations[window.localStorage.userId] || []

                const newAnnotation = {
                  annotationId,
                  'userId': window.localStorage.userId,
                  'username': window.localStorage.username,
                  'rectBounds': path.wsiViewer.viewport.viewportToImageRectangle(smallestTileClicked.bounds),
                  'createdAt': Date.now()
                }
      
                wsiAnnotations[window.localStorage.userId].push(newAnnotation)
          
                box.updateMetadata(id, `/${`${wsi.metadataPathPrefix}_${metaName}`}`, JSON.stringify(wsiAnnotations)).then(newMetadata => {
                  fileMetadata = JSON.stringify(newMetadata)
                  window.localStorage.fileMetadata = JSON.stringify(newMetadata)
                  const annotationOverlayData = {
                    ...newAnnotation.rectBounds,
                    'label': newAnnotation.label || `${displayName} ${labels[0].displayText}`,
                    'createdAt': newAnnotation.createdAt
                  }
                  annotations.createWSIAnnotationElement(annotationId, displayName, metaName, annotationOverlayData, {modelAnnotation: true, selectedLabels: wsi.defaultSelectedLabels, requestedTileSize: wsi.defaultTileSize, addToParent: true})
                })
              }
            }
          })
        } else {
          annotateWSIButtonDiv.classList.remove("active")
          path.wsiViewer.element.style.cursor = ""
          path.wsiViewer.removeAllHandlers('canvas-click')
        }
      }
      
      return annotateWSIButtonDiv
    }
  
    const createRunModelButton = () => {
      const runModelWSIHandler = (e) => {
        const regionSelected = document.getElementById("runModelWSIDropdownDiv").querySelector(`input[type=radio]:checked`)?.value
        const currentLevel = path.wsiViewer.world.getItemAt(0).lastDrawn.reduce((maxLevel, current) => maxLevel < current.level ? current.level : maxLevel, 0)
        const tileSizeAtCurrentLevel = Math.pow(2, 8 + path.wsiViewer.source.maxLevel - currentLevel) // Start at 2^8 because 256 is the smallest tile size we consider.
        if (regionSelected === "currentRegion") {
          const currentBounds = path.wsiViewer.viewport.getBounds()
          const { x: topLeftX, y: topLeftY } = path.wsiViewer.source.getTileAtPoint(currentLevel, new OpenSeadragon.Point(currentBounds.x, currentBounds.y))
          const { x: bottomRightX, y: bottomRightY } = path.wsiViewer.source.getTileAtPoint(currentLevel, new OpenSeadragon.Point(currentBounds.x + currentBounds.width, currentBounds.y + currentBounds.height))
          
          const startX = topLeftX * tileSizeAtCurrentLevel
          const startY = topLeftY * tileSizeAtCurrentLevel
          const endX = (bottomRightX * tileSizeAtCurrentLevel) + tileSizeAtCurrentLevel < imageInfo.width ? (bottomRightX * tileSizeAtCurrentLevel) + tileSizeAtCurrentLevel : imageInfo.width
          const endY = (bottomRightY * tileSizeAtCurrentLevel) + tileSizeAtCurrentLevel < imageInfo.height ? (bottomRightY * tileSizeAtCurrentLevel) + tileSizeAtCurrentLevel : imageInfo.height
          runModelWSI(startX, startY, endX, endY, tileSizeAtCurrentLevel)

        } else if (regionSelected === "wholeImage") {
          const startX = 0
          const startY = 0
          const {width: endX, height: endY } = imageInfo
          runModelWSI(startX, startY, endX, endY, tileSizeAtCurrentLevel)
        }
      }

      const runModelWSI = (startX, startY, endX, endY, tileDimensions) => {
        runModelWSIButtonDiv.selected = !runModelWSIButtonDiv.selected
        if (runModelWSIButtonDiv.selected) {
          runModelWSIButtonDiv.classList.add("active")
          runModelWSIButton.innerHTML = `<i class="fas fa-cog fa-spin"></i>`
          const dropdownDiv = document.getElementById("runModelWSIDropdownDiv")
          dropdownDiv.querySelectorAll("input[type=radio]").forEach(element => element.setAttribute("disabled", "true"))
          const stopWSIModelButtonDiv = dropdownDiv.querySelector("div#stopWSIModelButtonDiv")
          stopWSIModelButtonDiv.style.display = "block"
          stopWSIModelButtonDiv.onclick = runModelWSI

          const predictionBounds = {
            startX,
            startY,
            endX,
            endY,
            tileDimensions
          }

          const annotationId = path.datasetConfig?.annotations[0]?.annotationId
          if (!annotationId) {
            utils.showToast("No annotation definition found!")
            return
          }
          
          const imageId = hashParams.image
          const { width, height } = path.wsiViewer.source
          const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
          const modelId = path.datasetConfig.models.trainedModels.filter(x => x.correspondingAnnotation === annotationId).reduce((maxVersion, current) => maxVersion.version < current.version ? current : maxVersion, {version: -1}).id
          let wsiPredsFileId
          if (fileMetadata.wsiPredsFiles) {
            wsiPredsFileId = JSON.parse(fileMetadata.wsiPredsFiles).find(file => file.annotationId === annotationId && file.modelId === modelId).fileId
          } 
          if (!wsiPredsFileId)  {
            wsi.getPreviousPredsFromBox(fileMetadata)
            document.addEventListener("previousPredsReady", (e) => {
              e.preventDefault()
              wsiPredsFileId = e.detail.wsiPredsFileId
              wsi.startPrediction(annotationId, imageId, width, height, predictionBounds, wsiPredsFileId)
            }, {once: true})
          } else {
            wsi.startPrediction(annotationId, imageId, width, height, predictionBounds, wsiPredsFileId)
          }
          
        } else {
          const runModelWSIButton = document.getElementById("wsiRunModelBtn")
          runModelWSIButton.innerHTML = `<i class="fas fa-microchip"></i>`
          runModelWSIButton.parentElement.classList.remove("active")
          runModelWSIButton.parentElement.selected = false
          wsi.stopModel()
        }
      }
      
      const runModelWSIButtonDiv = document.createElement("div")
      runModelWSIButtonDiv.className = "dropdown wsiControlBtnParent"
      const runModelWSIButton = document.createElement("button")
      runModelWSIButton.id = "wsiRunModelBtn"
      runModelWSIButton.className = "btn wsiControlBtn"
      runModelWSIButton.setAttribute("type", "button")
      runModelWSIButton.setAttribute("disabled", "true")
      runModelWSIButton.setAttribute("data-toggle", "dropdown")
      runModelWSIButton.innerHTML = `<i class="fas fa-microchip"></i>`
      runModelWSIButtonDiv.appendChild(runModelWSIButton)
      runModelWSIButtonDiv.title = "Run Model"

      const runModelWSIDropdownDiv = document.createElement("div")
      runModelWSIDropdownDiv.id = "runModelWSIDropdownDiv"
      runModelWSIDropdownDiv.className = "dropdown-menu"
      runModelWSIDropdownDiv.innerHTML = `
        <div id="stopWSIModelButtonDiv">
          <button id="stopWSIModelBtn" type="button" class="btn btn-outline-danger">Stop Model</button>
          <hr>
        </div>
        <div><b>Run Model On</b></div>
        <hr/>
      `

      const runModelWSI_wholeImageDiv = document.createElement("div")
      runModelWSI_wholeImageDiv.className = "form-check"
      const runModelWSI_wholeImageInput = document.createElement("input")
      runModelWSI_wholeImageInput.id = "runModelWSI_wholeImage"
      runModelWSI_wholeImageInput.className = "form-check-input"
      runModelWSI_wholeImageInput.setAttribute("type", "radio")
      runModelWSI_wholeImageInput.setAttribute("name", "runModelWSIOnArea")
      runModelWSI_wholeImageInput.setAttribute("value", "wholeImage")
      runModelWSI_wholeImageDiv.appendChild(runModelWSI_wholeImageInput)
      runModelWSI_wholeImageDiv.insertAdjacentHTML('beforeend', `<label class="form-check-label" for="runModelWSI_wholeImage">Entire Image</label>`)
      runModelWSI_wholeImageInput.onchange = runModelWSIHandler
      runModelWSI_wholeImageDiv.onclick = () => runModelWSI_wholeImageInput.click()
      
      const runModelWSI_visibleRegionDiv = document.createElement("div")
      runModelWSI_visibleRegionDiv.className = "form-check"
      const runModelWSI_visibleRegionInput = document.createElement("input")
      runModelWSI_visibleRegionInput.id = "runModelWSI_visibleRegion"
      runModelWSI_visibleRegionInput.className = "form-check-input"
      runModelWSI_visibleRegionInput.setAttribute("type", "radio")
      runModelWSI_visibleRegionInput.setAttribute("name", "runModelWSIOnArea")
      runModelWSI_visibleRegionInput.setAttribute("value", "currentRegion")
      runModelWSI_visibleRegionDiv.appendChild(runModelWSI_visibleRegionInput)
      runModelWSI_visibleRegionDiv.insertAdjacentHTML('beforeend', `<label class="form-check-label" for="runModelWSI_visibleRegion">Visible Region</label>`)
      runModelWSI_visibleRegionInput.onchange = runModelWSIHandler
      runModelWSI_visibleRegionDiv.onclick = () => runModelWSI_visibleRegionInput.click()

      const runModelWSI_moreOptionsDiv = document.createElement("div")
      const runModelWSI_moreOptionsButton = document.createElement("button")
      runModelWSI_moreOptionsButton.id = "runModelWSI_moreOptions"
      runModelWSI_moreOptionsButton.className = "btn btn-link"
      runModelWSI_moreOptionsButton.setAttribute("type", "button")
      runModelWSI_moreOptionsButton.setAttribute("disabled", "true")
      runModelWSI_moreOptionsButton.setAttribute("title", "Under development")
      runModelWSI_moreOptionsButton.innerText = "+ More Options"
      runModelWSI_moreOptionsDiv.appendChild(runModelWSI_moreOptionsButton)


      runModelWSIDropdownDiv.appendChild(runModelWSI_wholeImageDiv)
      runModelWSIDropdownDiv.appendChild(runModelWSI_visibleRegionDiv)
      runModelWSIDropdownDiv.insertAdjacentHTML('beforeend', "<hr>")
      runModelWSIDropdownDiv.appendChild(runModelWSI_moreOptionsDiv)

      runModelWSIButtonDiv.appendChild(runModelWSIDropdownDiv)

      return runModelWSIButtonDiv
    }

    const createVisibilitySettingsButton = () => {
      const visibilitySettingsWSIButtonDiv = document.createElement("div")
      visibilitySettingsWSIButtonDiv.className = "wsiControlBtnParent"
      const visibilitySettingsWSIButton = document.createElement("button")
      visibilitySettingsWSIButton.id = "wsiVisibilitySettingsBtn"
      visibilitySettingsWSIButton.className = "btn wsiControlBtn"
      visibilitySettingsWSIButton.setAttribute("type", "button")
      visibilitySettingsWSIButton.setAttribute("disabled", "true")
      visibilitySettingsWSIButton.setAttribute("data-toggle", "dropdown")
      visibilitySettingsWSIButton.innerHTML = `<i class="fas fa-sliders-h"></i>`
      visibilitySettingsWSIButtonDiv.appendChild(visibilitySettingsWSIButton)
      visibilitySettingsWSIButtonDiv.title = "Overlay Settings"

      const visibilitySettingsControl = (show=true) => {
        let visibilitySettingsControlDiv = document.getElementById("wsiVisibilitySettingsControl")
        if (visibilitySettingsControlDiv) {
          visibilitySettingsControlDiv.style.display = show ? "grid" : "none"
        } else {
          visibilitySettingsControlDiv = document.createElement("div")
          visibilitySettingsControlDiv.id = "wsiVisibilitySettingsControl"
          visibilitySettingsControlDiv.style.color = "white"
          visibilitySettingsControlDiv.style.width = path.wsiViewer.canvas.offsetWidth
          visibilitySettingsControlDiv.style.height = path.wsiViewer.controls[0].element.clientHeight* 1.5
          visibilitySettingsControlDiv.style.backgroundColor = "rgba(0, 0, 0, 0.5)"
          visibilitySettingsControlDiv.style.zIndex = (10**6)
  
          const selectPredictionLabelsBtnDiv = document.createElement("div")
          selectPredictionLabelsBtnDiv.className = "dropup"
          selectPredictionLabelsBtnDiv.style.padding = "1rem";
          const selectPredictionLabelsBtn = document.createElement("button")
          selectPredictionLabelsBtn.className = "btn btn-outline-dark wsiVisibilitySettingsBtn"
          selectPredictionLabelsBtn.id = "wsiSettingsLabelOptionsBtn"
          selectPredictionLabelsBtn.setAttribute("type", "button")
          selectPredictionLabelsBtn.setAttribute("data-toggle", "dropdown")
          selectPredictionLabelsBtn.innerText = "Show Predictions For..."
          selectPredictionLabelsBtn.style.color = "white"
          if (path.datasetConfig?.annotations.length === 0) {
            selectPredictionLabelsBtn.setAttribute("disabled", "true")
          }
          selectPredictionLabelsBtnDiv.appendChild(selectPredictionLabelsBtn)
          
          const selectPredictionLabelsDropdownDiv = document.createElement("div")
          selectPredictionLabelsDropdownDiv.setAttribute("id", "selectPredictionLabelsDropdownDiv")
          selectPredictionLabelsDropdownDiv.className = "dropdown-menu"
          
          path.datasetConfig.annotations.forEach((annot, ind) => {
            const annotationSection = document.createElement("div")
            const annotationHeader = document.createElement("b")
            annotationHeader.innerText = annot.displayName
            annotationSection.appendChild(annotationHeader)
            annotationSection.insertAdjacentHTML('beforeend', `<hr style="margin: 0.2rem 0;">`)
            annot.labels.forEach(label => {
              const labelIdentifier = `${annot.annotationId}_${label.label}`
              const predictionLabelOptionsDiv = document.createElement("div")
              predictionLabelOptionsDiv.className = "wsiSettings_selectLabelParent"            
              
              const hideLabelBtn = document.createElement("button")
              hideLabelBtn.id = `hdieLabelBtn_${labelIdentifier}`
              hideLabelBtn.className = "btn btn-outline-danger btn-sm wsiSettings_hideLabelBtn"
              hideLabelBtn.setAttribute("type", "button")
              hideLabelBtn.innerHTML = `<i class="fas fa-eye-slash"></i>`
  
              if (!wsi.defaultSelectedLabels.find(selectedLabel => selectedLabel.label === label.label)) {
                hideLabelBtn.classList.add("active")
              }
  
              hideLabelBtn.setAttribute("name", `${annot.metaName}_${label.label}`)
              hideLabelBtn.setAttribute("value", labelIdentifier)
              
              const labelColorInput = document.createElement("input")
              labelColorInput.setAttribute("type", "color")
              labelColorInput.setAttribute("value", wsi.activeLabelOverlayColors[labelIdentifier].slice(0, -2))
              if (hideLabelBtn.classList.contains("active")) {
                labelColorInput.setAttribute("disabled", "true")
              }
              labelColorInput.style.width = "2rem"
              labelColorInput.style.marginRight = "0.4rem"
              
              hideLabelBtn.onclick = () => {
                if (hideLabelBtn.classList.contains("active")) {
                  hideLabelBtn.classList.remove("active")
                  wsi.defaultSelectedLabels.push({
                    'label': label.label,
                    'threshold': 0.5
                  })
                  wsi.overlayPreviousPredictions(wsi.defaultSelectedLabels, parseInt(document.getElementById(`wsiVisibilitySettings_tileSizeSelect`).value))
                  annotations.populateWSIAnnotations(document.getElementById("wsiAnnotationTypeModel"), true)
                  labelColorInput.removeAttribute("disabled")
                  labelOpacitySlider.removeAttribute("disabled")
                } else {
                  hideLabelBtn.classList.add("active")
                  wsi.defaultSelectedLabels = wsi.defaultSelectedLabels.filter(selectedLabel => selectedLabel.label !== label.label)
                  path.wsiViewer.currentOverlays.forEach(overlay => {
                    if (overlay.element.getAttribute("descriptor") === hideLabelBtn.getAttribute("value")) {
                      requestAnimationFrame(() => path.wsiViewer.removeOverlay(overlay.element))
                    }
                  })
                  labelColorInput.setAttribute("disabled", "true")
                  labelOpacitySlider.setAttribute("disabled", "true")
                  annotations.populateWSIAnnotations(document.getElementById("wsiAnnotationTypeModel"), true)
                }
              }
  
              labelColorInput.oninput = (e) => {
                wsi.activeLabelOverlayColors[labelIdentifier] = e.target.value + wsi.activeLabelOverlayColors[labelIdentifier].slice(-2)
                document.documentElement.style.setProperty(`--${labelIdentifier}`, wsi.activeLabelOverlayColors[labelIdentifier])
              }
  
              const labelOpacitySlider = document.createElement("input")
              labelOpacitySlider.setAttribute("type", "range")
              labelOpacitySlider.setAttribute("min", 20)
              labelOpacitySlider.setAttribute("max", 255)
              labelOpacitySlider.setAttribute("step", 5)
              labelOpacitySlider.setAttribute("value", parseInt(wsi.activeLabelOverlayColors[labelIdentifier].slice(-2), 16) || 255*0.6)
              if (hideLabelBtn.classList.contains("active")) {
                labelOpacitySlider.setAttribute("disabled", "true")
              }
              labelOpacitySlider.onchange = (e) => {
                wsi.activeLabelOverlayColors[labelIdentifier] = wsi.activeLabelOverlayColors[labelIdentifier].slice(0,-2) + (parseInt(e.target.value).toString(16) || "99")
                document.documentElement.style.setProperty(`--${labelIdentifier}`, wsi.activeLabelOverlayColors[labelIdentifier])
              }
          
              predictionLabelOptionsDiv.appendChild(hideLabelBtn)
              predictionLabelOptionsDiv.appendChild(labelColorInput)
              predictionLabelOptionsDiv.insertAdjacentHTML('beforeend', `<label class="form-check-label" for=hdieLabelBtn_${annot.annotationId}_${label.label}>${label.displayText}</label><br>`)
              predictionLabelOptionsDiv.appendChild(labelOpacitySlider)
              annotationSection.appendChild(predictionLabelOptionsDiv)
            })
            if (ind !== path.datasetConfig.annotations.length - 1) {
              annotationSection.insertAdjacentHTML('beforeend', "<br>")
            }
            selectPredictionLabelsDropdownDiv.appendChild(annotationSection)
          })
          selectPredictionLabelsBtnDiv.appendChild(selectPredictionLabelsDropdownDiv)

          const predictionTileSizeSelectDiv = document.createElement("div")
          predictionTileSizeSelectDiv.style.margin = "auto 0"
          const predictionTileSizeSelect = document.createElement("select")
          predictionTileSizeSelect.id = `wsiVisibilitySettings_tileSizeSelect`
          predictionTileSizeSelect.className = "wsiVisibilitySettingsBtn"
          let tileSizes = [2048,1024,512,256]
          tileSizes.forEach((value, ind) => {
            const predictionTileSizeSelectOption = document.createElement("option")
            predictionTileSizeSelectOption.setAttribute("value", value)
            if (value === wsi.defaultTileSize) {
              predictionTileSizeSelectOption.setAttribute("selected", "true")
            }
            predictionTileSizeSelectOption.innerText = `${10*(ind+1)}x`
            predictionTileSizeSelect.appendChild(predictionTileSizeSelectOption)
          })

          predictionTileSizeSelect.onchange = (e) => {
            path.wsiViewer.currentOverlays.forEach(overlay => {
              if (overlay.element.classList.contains("wsiModelAnnotation") && !overlay.element.id.endsWith(`${e.target.value}_${e.target.value}`)) {
                requestAnimationFrame(() => path.wsiViewer.removeOverlay(overlay.element))
              }
            })
            wsi.defaultTileSize = parseInt(e.target.value)
            wsi.overlayPreviousPredictions(wsi.defaultSelectedLabels, wsi.defaultTileSize)
            annotations.populateWSIAnnotations(document.getElementById("wsiAnnotationTypeModel"), true)
          }

          const predictionTileSizeSelectLabel = `<label class="form-check-label" for="wsiVisibilitySettings_tileSizeSelect">Predictions Zoom Level: &nbsp</label>`
          predictionTileSizeSelectDiv.insertAdjacentHTML('beforeend', predictionTileSizeSelectLabel)
          predictionTileSizeSelectDiv.appendChild(predictionTileSizeSelect)

          visibilitySettingsControlDiv.appendChild(selectPredictionLabelsBtnDiv)
          visibilitySettingsControlDiv.appendChild(predictionTileSizeSelectDiv)
  
          path.wsiViewer.addControl(visibilitySettingsControlDiv, {
            anchor: OpenSeadragon.ControlAnchor["BOTTOM_LEFT"]
          }, path.wsiViewer.controls.bottomLeft)
          path.wsiViewer.controls[2].element.style.display = "grid"
          path.wsiViewer.controls[2].element.style.gridTemplateColumns = "300px 400px"
          new BSN.Dropdown(selectPredictionLabelsBtn, true)
        }

      }

      visibilitySettingsWSIButton.onclick = () => {
        if (visibilitySettingsWSIButtonDiv.classList.contains("active")) {
          visibilitySettingsControl(false)
          visibilitySettingsWSIButtonDiv.classList.remove("active")
        } else {
          visibilitySettingsWSIButtonDiv.classList.add("active")
          visibilitySettingsControl(true)
        }
      }
      return visibilitySettingsWSIButtonDiv
    }
    
    const annotateWSIButtonDiv = createAddAnnotationsButton()
    const runModelWSIButtonDiv = createRunModelButton()
    const visibilitySettingsButton = createVisibilitySettingsButton()
    
    const newControlButtonsDiv = document.createElement("div")
    newControlButtonsDiv.appendChild(annotateWSIButtonDiv)
    newControlButtonsDiv.appendChild(runModelWSIButtonDiv)
    newControlButtonsDiv.appendChild(visibilitySettingsButton)
    path.wsiViewer.addControl(newControlButtonsDiv, {
      anchor: OpenSeadragon.ControlAnchor["TOP_LEFT"]
    }, path.wsiViewer.controls.topLeft)
      
    newControlButtonsDiv.style.display = "flex"
    newControlButtonsDiv.style.flexDirection = "row"
    path.wsiViewer.controls.forEach(control => control.element.style.zIndex = 10**6)
    
    new BSN.Tooltip(annotateWSIButtonDiv, {
      'placement': "top",
      'animation': "slideNfade",
      'delay': 50
    })
    new BSN.Tooltip(runModelWSIButtonDiv, {
      'placement': "top",
      'animation': "slideNfade",
      'delay': 50
    })
    new BSN.Tooltip(visibilitySettingsButton, {
      'placement': "top",
      'animation': "slideNfade",
      'delay': 50
    })
    new BSN.Dropdown(runModelWSIButtonDiv.querySelector("button#wsiRunModelBtn"), false)
    runModelWSIButtonDiv.addEventListener('show.bs.dropdown', (e) => {
      runModelWSIButtonDiv.Tooltip.hide()
    })

    // path.wsiViewer.addHandler('canvas-key', (e) => {
    //   // e.preventDefaultAction = true
    //   console.log(e)
    // })

    // path.wsiViewer.addHandler('canvas-nonprimary-press', (e) => {
    //   console.log(e.position, path.wsiViewer.viewport.pointFromPixel(e.position), e.insideElementPressed, e.insideElementReleased)
    //   // console.log(pos)
    // })
    
    // path.wsiViewer.addHandler('canvas-nonprimary-release', (e) => {
    //   console.log(e.position, path.wsiViewer.viewport.pointFromPixel(e.position), e.insideElementPressed, e.insideElementReleased)
    //   // console.log(pos)
    // })

    path.wsiViewer.addHandler('animation-finish', (e) => {
      const center = path.wsiViewer.viewport.getCenter()
      const zoom = path.wsiViewer.viewport.getZoom()

      if (center.x !== parseFloat(hashParams.wsiCenterX) || center.y !== parseFloat(hashParams.wsiCenterY) || zoom !== parseFloat(hashParams.wsiZoom)) {
        path.modifyHashString({
          'wsiCenterX': center.x,
          'wsiCenterY': center.y,
          'wsiZoom': zoom
        })
      }
      if (wsi.predsDB) {
        wsi.overlayPreviousPredictions()
      }
    })
    path.onCanvasLoaded(true, true)
    
    // path.wsiViewer.addHandler("tile-drawn", (e) => {
      // console.log(e)
      // })
  } else {
    showLoader(loaderElementId, path.wsiViewerDiv)
    const wsiCanvas = path.wsiViewer.canvas.querySelector("canvas")
    const wsiCtx = wsiCanvas.getContext("2d")
    wsiCtx.clearRect(0, 0, wsiCanvas.width, wsiCanvas.height)
    path.wsiViewer.open(tileSources)
    path.wsiViewer.imageLoadedAtTime = Date.now()
    wsi.removePanAndZoomFromHash()
    wsi.clearIndexedDB().then(() => {
      annotations.populateWSIAnnotations(document.querySelector(`.wsiAnnotationType.active`), true)
    })
  }
  
  path.wsiViewer.removeAllHandlers('open')
  path.wsiViewer.addOnceHandler('open', (e) => {
    path.wsiViewer.element.querySelectorAll(".wsiControlBtn").forEach(element => {
      element.setAttribute("disabled", "true")
      element.style.cursor = "not-allowed"
    })
    path.wsiViewer.element.querySelectorAll(".wsiVisibilitySettingsBtn").forEach(element => {
      element.setAttribute("disabled", "true")
      if (element.Dropdown) {
        element.Dropdown.hide()
      }
      element.style.cursor = "not-allowed"
    })
    
    wsi.stopModel()
    
    path.wsiViewer.world.getItemAt(0).addOnceHandler('fully-loaded-change', async (e) => {
      path.wsiCanvasLoaded = true
      wsi.handlePanAndZoom()
      wsi.setDefaultOverlayOptions()
      utils.showToast("Loading Predictions...")
      document.removeEventListener("datasetConfigSet", wsi.datasetChangeHandler)
      wsi.datasetChangeHandler = () => {
        wsi.stopModel()
        wsi.removeOverlays(true)
        enableOptions()
        wsi.setDefaultOverlayOptions(true)
        wsi.getPreviousPredsFromBox()
        wsi.overlayPreviousAnnotations()
      }
      document.addEventListener("datasetConfigSet", wsi.datasetChangeHandler)
      wsi.overlayPreviousAnnotations()
      
      const enableOptions = () => {
        path.wsiViewer.element.querySelectorAll("button.wsiControlBtn").forEach(element => {
          if (element.id === "wsiRunModelBtn" && path.datasetConfig?.models?.trainedModels?.length === 0) {
            return
          }
          element.removeAttribute("disabled")
          element.style.cursor = "pointer"
        })
        path.wsiViewer.element.querySelectorAll(".wsiVisibilitySettingsBtn").forEach(element => {
          element.removeAttribute("disabled")
          element.style.cursor = "auto"
        })
      }
      enableOptions()
      
      if (!fileMetadata.wsiInfo) {
        const imageInfoForMetadata = {
          '@context': imageInfo["@context"],
          'width': imageInfo.width,
          'height': imageInfo.height,
        }
        fileMetadata = await box.updateMetadata(id, "/wsiInfo", JSON.stringify(imageInfoForMetadata))
        window.localStorage.fileMetadata = JSON.stringify(metadata)
      }
      wsi.getPreviousPredsFromBox(fileMetadata)
    })
    path.onCanvasLoaded(false)
  })

  path.wsiViewer.removeAllHandlers('open-failed')
  path.wsiViewer.addOnceHandler('open-failed', (e) => {
    console.error("Error opening Tile Source", e)
  })

  // const handleBoxURLExpiry = () => {
  //   path.wsiViewer.removeAllHandlers("tile-load-failed")
  //   clearTimeout(wsi.failedTileHandlerTimeout)
  //   // Handle Box URL expiry. Get new URL and replace the tile source.
  //   wsi.failedTileHandlerTimeout = setTimeout(() => path.wsiViewer.addOnceHandler("tile-load-failed", async (e) => {
  //     console.log("Tile Load Failed, trying to reset URL!!!!!!!", e)
  //     // Box URLs expire in 15 mins, so checking to see if enough time has elapsed for the load failure reason to be URL expiry.
  //     if (Date.now() > path.wsiViewer.imageLoadedAtTime + (14*60*1000)) {
  //       showLoader(loaderElementId, path.wsiViewer.element)
  //       const oldImage = path.wsiViewer.world.getItemAt(0)
  //       const oldBounds = oldImage.getBounds()
  //       const oldTileSource = oldImage.source
        
  //       const refreshedFileURL = await box.getFileContent(id, false, true)
  //       const newTileSourceURL = `${wsi.tileServerBasePath}/?iiif=${refreshedFileURL}`
  //       const newTileSource = {
  //         ...oldTileSource,
  //         "@id": newTileSourceURL
  //       }

  //       path.wsiViewer.addTiledImage({
  //         tileSource: newTileSource,
  //         x: oldBounds.x,
  //         y: oldBounds.y,
  //         width: oldBounds.width,
  //         success: () => {
  //           path.wsiViewer.world.removeItem(oldImage)
  //           hideLoader(loaderElementId)
  //           handleBoxURLExpiry()
  //         }
  //       })
  //     }
  //   }), 2*60*1000)
  // }
  // handleBoxURLExpiry()

  path.tmaCanvasLoaded = false
  path.isImageFromBox = true
  path.isThumbnail = false

}

wsi.startPrediction = (annotationId, imageId, width, height, predictionBounds, wsiPredsFileId) => {
  const predicting = models.getWSIPrediction(annotationId, imageId, { width, height }, predictionBounds, wsiPredsFileId)
  wsi.modelRunning = true
  if (!predicting) {
    wsi.stopModel()
    utils.showToast("Model not ready yet, please try again in a few seconds!")
  }

  const processOverlayRect = path.wsiViewer.viewport.imageToViewportRectangle(predictionBounds.startX, predictionBounds.startY, predictionBounds.endX - predictionBounds.startX, predictionBounds.endY - predictionBounds.startY)
  wsi.createOverlayRect({
    "type": "wsiProcessing",
    "rectBounds": processOverlayRect,
    "tooltipText": "Running Model over this region"
  })
  path.wsiViewer.controls[path.wsiViewer.controls.length - 1].autoFade = false
}

wsi.handlePanAndZoom = (centerX=hashParams?.wsiCenterX, centerY=hashParams?.wsiCenterY, zoomLevel=hashParams?.wsiZoom) => {
  if (path.isWSI) {
    
    if (path?.wsiViewer?.viewport) {
      centerX = parseFloat(centerX)
      centerY = parseFloat(centerY)
      zoomLevel = parseFloat(zoomLevel)
      
      const { x: currentX, y: currentY } = path.wsiViewer.viewport.getCenter()
      const currentZoom = path.wsiViewer.viewport.getZoom()
      
      if (centerX && centerY && zoomLevel && (centerX !== currentX || centerY !== currentY || zoomLevel !== currentZoom)) {
        path.wsiViewer.viewport.zoomTo(zoomLevel)
        path.wsiViewer.viewport.panTo(new OpenSeadragon.Point(centerX, centerY))
      }
    }
  } else if (path.tmaCanvasLoaded) {
    wsi.removePanAndZoomFromHash()
  }
}

wsi.removePanAndZoomFromHash = () => {
  path.modifyHashString({
    'wsiCenterX': undefined,
    'wsiCenterY': undefined,
    'wsiZoom': undefined
  })
}

wsi.setDefaultOverlayOptions = (forceReload=false) => {
  if (forceReload) {
    wsi.activeLabelOverlayColors = wsi.userPreferences?.labelOverlayColors || {}
    wsi.defaultSelectedLabels = wsi.userPreferences?.selectedLabels || undefined
  }
  
  wsi.activeLabelOverlayColors = wsi.activeLabelOverlayColors || wsi.userPreferences?.labelOverlayColors || {}
  
  if (Object.values(wsi.activeLabelOverlayColors).length !== path.datasetConfig.annotations.reduce((sum, curr) => sum += curr.labels.length, 0)) {
    path.datasetConfig.annotations.forEach(annot => {
      annot.labels.forEach(label => {``
        const labelIdentifier = `${annot.annotationId}_${label.label}`
        if (!wsi.activeLabelOverlayColors[labelIdentifier]) {
          wsi.activeLabelOverlayColors[labelIdentifier] = wsi.defaultLabelOverlayColors.find(overlayColor => !Object.values(wsi.activeLabelOverlayColors).includes(overlayColor)) || "#00000099"
          document.documentElement.style.setProperty(`--${labelIdentifier}`, wsi.activeLabelOverlayColors[labelIdentifier])
        }
      })
    })
  }
  
  wsi.defaultSelectedLabels = wsi.defaultSelectedLabels || wsi.userPreferences?.selectedLabels || undefined
  if (!wsi.defaultSelectedLabels && path.datasetConfig?.annotations?.length > 0) {
    wsi.defaultSelectedLabels = []
    wsi.defaultSelectedLabels.push({
      'label': path.datasetConfig.annotations[0].labels[0].label,
      'threshold': 0.5
      // 'threshold': 1/path.datasetConfig.annotations[0].labels.length
    })
  }
  
  wsi.defaultTileSize = wsi.defaultTileSize || 512
}

wsi.createOverlayRect = (opts) => {
  const { 
    type="user",
    rectBounds,
    tooltipText,
    annotationId=path.datasetConfig.annotations[0].annotationId,
    hidden=false,
    processing=false,
    showAsTooltip=false,
    descriptor 
  } = opts

  const classNamesToTypeMap = {
    'user': "wsiUserAnnotation wsiOverlay",
    'model': "wsiModelAnnotation wsiOverlay",
    'wsiProcessing': "wsiProcessing wsiOverlay",
    'tileProcessing': "tileProcessing wsiOverlay"
  }

  const rectBoundValues = Object.values(path.wsiViewer.viewport.viewportToImageRectangle(...Object.values(rectBounds)))
  const rectBoundsInImageCoordsForId = rectBoundValues.splice(0, rectBoundValues.length - 1).map(v => Math.round(v)).join("_")
  const elementId = `wsiAnnotation_${annotationId}_${rectBoundsInImageCoordsForId}`
  if (path.wsiViewer.getOverlayById(elementId)) {
    return
  }
  const rect = document.createElement("div")
  rect.setAttribute("id", elementId)
  rect.setAttribute("class", classNamesToTypeMap[type])
  rect.setAttribute("tabindex", "0")
  rect.tileX = rectBounds.x
  rect.tileY = rectBounds.y
  rect.tileWidth = rectBounds.width
  rect.tileHeight = rectBounds.height
  rect.style.zIndex = Math.floor((1 - (rectBounds.width * rectBounds.height)) * (10**5))
  
  if (hidden) {
    rect.style.display = "none"
  } else {
    rect.style.display = "block"
  }
 
  if (tooltipText) {
    rect.setAttribute("data-toggle", "tooltip")
    rect.setAttribute("title", tooltipText)
  }

  if (descriptor) {
    rect.setAttribute("descriptor", descriptor)
    rect.style.outlineColor = `var(--${descriptor})`
  }
  
  const shiftKeyUpListener = (e) => {
    if (!e.shiftKey) {
      rect.style.cursor = "auto"
      document.addEventListener("keydown", shiftKeyDownListener, {once: true})
    } else {
      document.addEventListener("keyup", shiftKeyUpListener, {once: true})
    }
  }

  const shiftKeyDownListener = (e) => {
    if (e.shiftKey) {
      rect.style.cursor = "zoom-in"
      document.addEventListener("keyup", shiftKeyUpListener, {once: true})
    } else {
      document.addEventListener("keydown", shiftKeyDownListener, {once: true})
    }
  }

  rect.onmouseover = (e) => {
    if (e.shiftKey) {
      rect.style.cursor = "zoom-in"
      document.removeEventListener("keydown", shiftKeyDownListener)
      document.addEventListener("keyup", shiftKeyUpListener, {once: true})
    } else {
      document.removeEventListener("keyup", shiftKeyUpListener)
      document.addEventListener("keydown", shiftKeyDownListener, {once: true})
    }
  }

  rect.onmouseleave = (e) => {
    rect.style.cursor = "auto"
    document.removeEventListener("keyup", shiftKeyUpListener)
    document.removeEventListener("keydown", shiftKeyDownListener)
  }

  rect.onclick = (e) => {
    if (e.shiftKey) {
      path.wsiViewer.viewport.fitBoundsWithConstraints(rectBounds)
      rect.style.cursor = "auto"
    }
    
    if (type === "user" || type === "model") {
      const annotationsTab = document.getElementById("annotations-tab")
      const annotationCard = document.getElementById(`annotation_${annotationId}Card`)
      const annotationTypeBtn = type === "user" ? annotationCard.querySelectorAll(".wsiAnnotationType")[0] : annotationCard.querySelectorAll(".wsiAnnotationType")[1]

      const findAndFocusWSIAnnotation = () => {
        // console.log('annotation type button clicked')
        const wsiAnnotationDetailsElement = document.getElementById(`wsiAnnotationDetails_${type}_${annotationId}_${rectBoundsInImageCoordsForId}`)
        if (wsiAnnotationDetailsElement) {
          wsiAnnotationDetailsElement.scrollIntoView({block: 'center'})
          wsiAnnotationDetailsElement.classList.add("highlightedAnnotation")
          setTimeout(() => wsiAnnotationDetailsElement.classList.remove("highlightedAnnotation"), 2000)
        }
      }

      const openAnnotationCard = () => {
        const annotationDropdownBtn = annotationCard.querySelector("button[data-toggle=collapse]")
        if (annotationDropdownBtn.getAttribute("aria-expanded") === "false") {
          document.querySelector(annotationDropdownBtn.getAttribute("data-target")).addEventListener("shown.bs.collapse", () => {
            // console.log("annotatioin card shown")
            findAndFocusWSIAnnotation()
          }, {once: true})
          annotationTypeBtn.click()
          annotationDropdownBtn.Collapse.show()
          
        } else {
          annotationTypeBtn.click()
          findAndFocusWSIAnnotation()
        }
      }
      
      if (!annotationsTab.classList.contains("active")) {
        annotationsTab.Tab.show()
        annotationsTab.addEventListener("shown.bs.tab", () => {
          // console.log("annotatioin tab shown")
          openAnnotationCard()
        }, {once: true})
      } else {
        openAnnotationCard()
      }
    }
    rect.focus()
  }

  path.wsiViewer.addOverlay({
    element: rect,
    location: rectBounds
  })

  if (showAsTooltip) {
    new BSN.Tooltip(rect, {
      'placement': "bottom",
      'animation': "slidenfade",
      'delay': 50
    })
  }

  if (processing) {
    const addAndRemoveClass = () => {
      rect.classList.add("transition")
      setTimeout(() => rect.classList.remove("transition"), 500)
    }
    const changeClassPeriodically = setInterval(addAndRemoveClass, 1000)

    const handleOverlayRemoval = () => {
      path.wsiViewer.addOnceHandler('remove-overlay', (e) => {
        if (e.element.id === elementId) {
          clearInterval(changeClassPeriodically)
        } else {
          handleOverlayRemoval()
        }
      })
    }
    handleOverlayRemoval()
  }
  
}

wsi.getPreviousPredsFromBox = (fileMetadata=JSON.parse(window.localStorage.fileMetadata)) => {
  const annotationId = path.datasetConfig?.annotations[0]?.annotationId
  if (!annotationId) {
    return
  }

  const imageId = hashParams.image
  const modelId = path.datasetConfig.models.trainedModels.filter(x => x.correspondingAnnotation === annotationId).reduce((maxVersion, current) => maxVersion.version < current.version ? current : maxVersion, {version: -1}).id
  const wsiPredsFiles = fileMetadata.wsiPredsFiles ? JSON.parse(fileMetadata.wsiPredsFiles) : undefined
  const datasetConfig = {
    ...path.datasetConfig,
    'datasetConfigFileId': box.currentDatasetConfigFileId
  }

  models.getPreviousWSIPredsFromBox(imageId, annotationId, modelId, datasetConfig, wsiPredsFiles)
}

wsi.handleMessage = (data, op) => {
  if (op === "getPreviousPreds") {
    if (data.datasetConfigChanged && data.newDatasetConfig) {
      path.datasetConfig = data.newDatasetConfig
    }
    
    if (data.fileMetadataChanged && data.newFileMetadata) {
      window.localStorage.fileMetadata = JSON.stringify(data.newFileMetadata)
      const previousPredsReadyEvent = new CustomEvent("previousPredsReady", {
        detail: {
          'wsiPredsFileId': JSON.parse(data.newFileMetadata.wsiPredsFiles).find(file => file.annotationId === data.annotationId && file.modelId === data.modelId).fileId
        }
      })
      document.dispatchEvent(previousPredsReadyEvent)
    }
    wsi.overlayPreviousPredictions()

    return
  } else if (op === "stop") {
    if (data.success) {
      utils.showToast("Stopping Model...")
      wsi.stopModel()
    }
  } else if (data.imageId === hashParams.image) {
    if (data.message) {
      utils.showToast(data.message)
      if (data.completed) {
        wsi.stopModel()
      } else if (data.error) {
        wsi.stopModel()
      }
    } else if (data.success) {
      const osdRect = path.wsiViewer.viewport.imageToViewportRectangle(data.x, data.y, data.width, data.height)
      path.wsiViewer.removeOverlay(path.wsiViewer.currentOverlays.find(({element}) => element.tileX === osdRect.x && element.tileY === osdRect.y && element.tileWidth === osdRect.width && element.tileHeight === osdRect.height)?.element)

      if (data.prediction) {
        const highestValuePrediction = data.prediction.reduce((maxPred, current) => maxPred.prob > current.prob ? maxPred : current, {prob: 0})
        const annotation = path.datasetConfig.annotations.find(annot => annot.annotationId === data.annotationId)
        annotations.createWSIAnnotationElement(annotation.annotationId, annotation.displayName, annotation.metaName, data, {modelAnnotation: true, selectedLabels: wsi.defaultSelectedLabels, addToParent:true})
        
        if (wsi.defaultSelectedLabels.find(selectedLabel => selectedLabel.label === highestValuePrediction.label) ) {
          const tooltip = `${annotation.displayName}\n${annotation.labels.find(definedLabel => definedLabel.label === highestValuePrediction.label).displayText}: ${Math.round((highestValuePrediction.prob + Number.EPSILON) * 1000) / 1000 }`
          wsi.createOverlayRect({
            "type": "model",
            "rectBounds": osdRect,
            "tooltipText": tooltip,
            "annotationId": data.annotationId,
            "showAsTooltip": true,
            "descriptor": `${data.annotationId}_${highestValuePrediction.label}`
          })
        }
      }
    } else if (data.processing) {
      const { x, y, width, height } = data
      const osdRect = path.wsiViewer.viewport.imageToViewportRectangle(x, y, width, height)
      wsi.createOverlayRect({
        "type": "tileProcessing",
        "rectBounds": osdRect,
        "tooltipText": "Analyzing...",
        "processing": true
      })
      // console.log("processing overlay added", Object.values(osdRect))
    }
  }
}

wsi.stopModel = () => {
  if (wsi.modelRunning) {
    wsi.removeOverlays(false, "wsiProcessing")
    wsi.removeOverlays(false, "tileProcessing")
    path.wsiViewer.removeAllHandlers('remove-overlay')
    
    const dropdownDiv = document.getElementById("runModelWSIDropdownDiv")
    dropdownDiv.querySelectorAll("input[type=radio]").forEach(element => {
      element.removeAttribute("disabled") 
      element.checked = false
    })
    dropdownDiv.parentElement.classList.remove("active")
    dropdownDiv.parentElement.selected = false
    dropdownDiv.previousElementSibling.innerHTML = `<i class="fas fa-microchip"></i>`
    dropdownDiv.querySelector("#stopWSIModelButtonDiv").style.display = "none"
    // dropdownDiv.querySelectorAll("button").forEach(element => element.removeAttribute("disabled"))
    
    path.wsiViewer.controls[path.wsiViewer.controls.length - 1].autoFade = true
    wsi.stopWorkers()
    wsi.modelRunning = false
  }
}

wsi.stopWorkers = () => {
  const annotationId = path.datasetConfig?.annotations[0]?.annotationId
  models.stopWSIWorkers(annotationId)
}

wsi.removeOverlays = (removeAll, className="") => {
  if (removeAll) {
    path.wsiViewer.currentOverlays.forEach(overlay => requestAnimationFrame(() => path.wsiViewer.removeOverlay(overlay.element)))
  } else if (className) {
    path.wsiViewer.currentOverlays.forEach(overlay => {
      if (overlay.element.classList.contains(className)) {
        requestAnimationFrame(() => path.wsiViewer.removeOverlay(overlay.element))
      }
    })
  }
}

wsi.setupIndexedDB = (forceCreateNewVersion=false) => new Promise (async resolve => {
  const { dbName, objectStoreOpts, objectStoreIndexes } = indexedDBConfig['wsi']
  const objectStoreNames = path.datasetConfig.models.trainedModels.map(model => `${indexedDBConfig['wsi'].objectStoreNamePrefix}_${model.correspondingAnnotation}`)
  let dbRequest
  if (forceCreateNewVersion) {
    const currentDBInstances = await window.indexedDB.databases()
    const existingWSIDBInstance = currentDBInstances.find(db => db.name === dbName)
    if (existingWSIDBInstance) {
      dbRequest = window.indexedDB.open(dbName, existingWSIDBInstance.version + 1)
    }
  } else {
    dbRequest = window.indexedDB.open(dbName)
  }

  dbRequest.onupgradeneeded = () => {
    const db = dbRequest.result
    objectStoreNames.forEach(objectStoreName => {
      if (!db.objectStoreNames.contains(objectStoreName)) {
        const objectStore = db.createObjectStore(objectStoreName, objectStoreOpts)
        objectStoreIndexes.forEach(objectStoreIndex => objectStore.createIndex(objectStoreIndex.name, objectStoreIndex.keyPath, objectStoreIndex.objectParameters))
      }
    })
  }

  dbRequest.onsuccess = async () => {
    if (objectStoreNames.every(objectStoreName => dbRequest.result.objectStoreNames.contains(objectStoreName))) {
      wsi.predsDB = dbRequest.result
      resolve()
    } else {
      dbRequest.result.onversionchange = () => {
        dbRequest.result.close()
      }
      await wsi.setupIndexedDB(true)
      resolve()
      // dbRequest.result.onerror = console.log
      // dbRequest.result.close()
    }
  }

  dbRequest.onblocked = (evt) => console.log("IDB Open Request BLOCKED", evt)
  dbRequest.onerror = (evt) => console.log("IDB Open Request ERROR", evt)
})

wsi.getFromIndexedDB = (objectStore, queryOpts={}) => new Promise((resolve, reject) => {
  const objectStoreTransaction = wsi.predsDB.transaction(objectStore, "readonly").objectStore(objectStore)
  const queryResult = []
  let offset = typeof(queryOpts.offset) === "number" && queryOpts.offset >= 0 ? queryOpts.offset : 0 
  queryOpts.limit = typeof(queryOpts.limit) === "number" && queryOpts.limit > 0 ? queryOpts.limit : 25

  if (queryOpts.query === "all") {
    objectStoreTransaction.getAll().onsuccess = (e) => {
      resolve({result: e.target.result})
    }
  } else if (Array.isArray(queryOpts.query) || typeof(queryOpts.query) === "string" || typeof(queryOpts.query) === "number") {
    const attemptGet = objectStoreTransaction.get(key)
    attemptGet.onsuccess = (e) => {
      resolve({result: e.target.result})
    }
    attemptGet.onerror = (e) => {
      reject(e.target.result)
    }
  } else {
    // let numRecords = 0
    objectStoreTransaction.count(queryOpts.query).onsuccess = (e) => {
      // numRecords = e.target.result
    
      let cursorSource = objectStoreTransaction
      if (queryOpts.index) {
        cursorSource = objectStoreTransaction.index(queryOpts.index)
      }
      
      let pagesSkippedFlag = queryOpts.pageNum && queryOpts.pageNum > 0
      
      const cursorRequest = cursorSource.openCursor(queryOpts.query, queryOpts.direction)
      cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result
        if (!cursor) {
          // console.log(`No cursor, found ${queryResult.length} items for query`, queryOpts)
          resolve({result: queryResult, offset})
          return
        }

        if (queryOpts.offset > 0 && !pagesSkippedFlag) {
          // console.log("Advancing by ", queryOpts.offset, numRecords)
          pagesSkippedFlag = true
          cursor.advance(queryOpts.offset)
          return
        }

        if (queryResult.length < queryOpts.limit) {
          if (queryOpts?.query?.lower && Array.isArray(queryOpts?.query?.lower) && queryOpts?.query?.upper && Array.isArray(queryOpts?.query?.upper)) {
            for (let i = 1; i < queryOpts.query.lower.length; i++) {
              if (window.indexedDB.cmp(cursor.key.slice(i, queryOpts.query.lower.length), queryOpts.query.lower.slice(i)) < 0) {
                // console.log("Skipping Because low", cursor.key.slice(0, queryOpts.query.lower.length), queryOpts.query.lower)
                cursor.continue([
                  ...cursor.key.slice(0, i),
                  ...queryOpts.query.lower.slice(i),
                  ...cursor.key.slice(queryOpts.query.lower.length)
                ])
                offset++
                return
              } 
              if (window.indexedDB.cmp(cursor.key.slice(i, queryOpts.query.upper.length), queryOpts.query.upper.slice(i)) > 0) {
                // console.log("Skipping Because high", cursor.key.slice(0, queryOpts.query.lower.length), queryOpts.query.upper)
                cursor.continue([
                  ...cursor.key.slice(0, i),
                  cursor.key[i] + EPSILON,
                  ...queryOpts.query.upper.slice(i+1),
                  ...cursor.key.slice(queryOpts.query.upper.length)
                ])
                offset++
                return
              }
            }
          }
          // console.log("FOUND!")
          queryResult.push(cursor.value)
          offset++
          cursor.continue()
        } else {
          resolve({result: queryResult, offset})
        }
      }
      cursorRequest.onerror = (e) => {
        console.log(e)
      }
    }
  }
   
})

wsi.clearIndexedDB = () => new Promise (resolveAll => {
  Promise.all(Object.values(wsi.predsDB.objectStoreNames).map(objectStoreName => {
    const objectStore = wsi.predsDB.transaction(objectStoreName, "readwrite").objectStore(objectStoreName)
    return objectStore.clear()
  })).then(() => {
    wsi.predsDB.transaction(wsi.predsDB.objectStoreNames[0], "readonly").objectStore(wsi.predsDB.objectStoreNames[0]).count().onsuccess = (e)=> console.log(e.target)
    resolveAll()
  })
})

wsi.overlayPreviousPredictions = (labelsToDisplay=wsi.defaultSelectedLabels, requestedTileSize=wsi.defaultTileSize, bounds=[]) => {
  if (!Array.isArray(labelsToDisplay)) {
    labelsToDisplay = [labelsToDisplay]
  }
  labelsToDisplay.forEach(label => {
    const { label: labelToDisplay, threshold } = label
    Object.values(wsi.predsDB.objectStoreNames).forEach(async objectStore => {
      const annotation = path.datasetConfig.annotations.find(annot => annot.annotationId === parseInt(objectStore.split(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_`)[1]))
      if (annotation && annotation.labels.find(label => label.label === labelToDisplay)) {
        const currentViewportBounds = path.wsiViewer.viewport.viewportToImageRectangle(path.wsiViewer.viewport.getBounds(true))
        const limit = 100
        let offset = 0
        const topXBounds = currentViewportBounds.x > 0 ? currentViewportBounds.x : 0
        const topYBounds = currentViewportBounds.y > 0 ? currentViewportBounds.y : 0
        const bottomXBounds = currentViewportBounds.x + currentViewportBounds.width > 0 ? currentViewportBounds.x + currentViewportBounds.width: 0
        const bottomYBounds = currentViewportBounds.y + currentViewportBounds.height > 0 ? currentViewportBounds.y + currentViewportBounds.height : 0
        const indexedDBQueryOpts = {
          'index': indexedDBConfig['wsi'].objectStoreIndexes[0].name,
          'query': IDBKeyRange.bound([topXBounds, topYBounds], [bottomXBounds, bottomYBounds], true, true),
          offset,
          limit
        }
        
        let finishedIndexedDBParsing = false
        while (!finishedIndexedDBParsing) {
          indexedDBQueryOpts.offset = offset
          const { result: dataInIndexedDB, offset: newOffset } = await wsi.getFromIndexedDB(objectStore, indexedDBQueryOpts)
          dataInIndexedDB.forEach(({x, y, width, height, prediction}) => {
            const positivePrediction = prediction.find(pred => pred.label === labelToDisplay)
            if (width === requestedTileSize) {
              
              if (positivePrediction && positivePrediction.prob >= threshold) {
                const osdRect = path.wsiViewer.viewport.imageToViewportRectangle(x, y, width, height, 0)
                const predictionText = `${labelToDisplay}: ${Math.round((positivePrediction.prob + Number.EPSILON) * 1000) / 1000 }`
                const tooltipText = `${annotation.displayName}\n${predictionText}`
                wsi.createOverlayRect({
                  'type': "model",
                  'rectBounds': osdRect,
                  'tooltipText': tooltipText,
                  'annotationId': annotation.annotationId,
                  'showAsTooltip': true,
                  'positivePrediction': true,
                  'descriptor': `${annotation.annotationId}_${positivePrediction.label}`
                })
             
              }
              //  else if (!positivePrediction) {
              //   const highestValuePrediction = prediction.reduce((maxPred, current) => maxPred.prob > current.prob ? maxPred : current, {prob: 0})
              //   const osdRect = path.wsiViewer.viewport.imageToViewportRectangle(x, y, width, height, 0)
              //   const predictionText = `${highestValuePrediction.displayText}: ${Math.round((highestValuePrediction.prob + Number.EPSILON) * 1000) / 1000 }`
              //   const tooltipText = `${annotation.displayName}\n${predictionText}`
              //   wsi.createOverlayRect({
              //     "type": "model",
              //     "rectBounds": osdRect,
              //     "tooltipText": tooltipText,
              //     "annotationId": annotation.annotationId,
              //     "showAsTooltip": true,
              //     "positivePrediction": highestValuePrediction.prob === prediction[0].prob,
              //     "descriptor": `${annotation.annotationId}_${highestValuePrediction.label}`
              //   })
              // }
           
            } 
          }) 
          
          if (dataInIndexedDB.length < limit) {
            finishedIndexedDBParsing = true
          } else {
            offset = newOffset
          }
        
        }
  
      }
    })
  })
}

wsi.overlayPreviousAnnotations = () => {
  path.datasetConfig.annotations.forEach(({ annotationId, metaName }) => {
    const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
    if (fileMetadata[`${wsi.metadataPathPrefix}_${metaName}`]) {
      const userAnnotations = JSON.parse(fileMetadata[`${wsi.metadataPathPrefix}_${metaName}`])[window.localStorage.userId]
      if (userAnnotations) {
        const annotationsToOverlay = userAnnotations.filter(annot => annot.annotationId === annotationId)
        annotationsToOverlay.forEach(annot => {
          const { x, y, width, height, degrees } = annot.rectBounds
          const osdRect = new OpenSeadragon.Rect(x, y, width, height, degrees)
          wsi.createOverlayRect({
            "type": "user",
            "rectBounds": path.wsiViewer.viewport.imageToViewportRectangle(osdRect),
            annotationId
          })
        })
      }
    }
  })
}