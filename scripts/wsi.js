const wsi = {}
const EPSILON = Math.pow(10, -11)

wsi.metadataPathPrefix = "wsiAnnotation"
wsi.tileServerBasePath = "https://dl-test-tma.uc.r.appspot.com/iiif"

const reloadImageAfterURLTimeout = (id) => wsi.loadImage(id)

wsi.loadImage = async (id, fileMetadata={}) => {
  
  path.tmaCanvas.parentElement.style.display = "none"
  path.wsiViewerDiv.style.display = "block"

  
  const loaderElementId = "imgLoaderDiv"
  showLoader(loaderElementId, path.wsiViewerDiv)
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
      "scaleFactors": [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576],
      "width": 256
    }]
  }
  
  
  if (!path.wsiViewer.canvas) {
    path.tmaCanvas.parentElement.style.backgroundColor = "black"
    path.wsiViewer = OpenSeadragon({
      id: "wsiCanvasParent",
      visibilityRatio: 1,
      minZoomLevel: 1,
      defaultZoomLevel: 1,
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
      timeout: 60*1000
    });

    path.wsiViewer.imageLoadedAtTime = Date.now()
    
    path.wsiViewer.buttons.buttons.forEach(button => {
      // Make interface consistent for all control buttons.
      button.imgGroup.style.display = "none"
      button.element.style.cursor = "pointer"
    })

    const createAnnotationButton = () => {
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
        const annotationId = path.datasetConfig.annotations[0].annotationId
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
                wsi.createOverlayRect("user", smallestTileClicked.bounds, "", annotationId, false, false, false)
                
                const wsiAnnotations = JSON.parse(window.localStorage.fileMetadata)[`${wsi.metadataPathPrefix}_${annotationId}`] ? JSON.parse(JSON.parse(window.localStorage.fileMetadata)[`${wsi.metadataPathPrefix}_${annotationId}`]) : {}
                wsiAnnotations[window.localStorage.userId] = wsiAnnotations[window.localStorage.userId] || []

                const newAnnotation = {
                  annotationId,
                  'userId': window.localStorage.userId,
                  'username': window.localStorage.username,
                  'rectBounds': smallestTileClicked.bounds,
                  'createdAt': Date.now()
                }
      
                wsiAnnotations[window.localStorage.userId].push(newAnnotation)
          
                box.updateMetadata(id, `/${`${wsi.metadataPathPrefix}_${annotationId}`}`, JSON.stringify(wsiAnnotations)).then(newMetadata => {
                  fileMetadata = JSON.stringify(newMetadata)
                  window.localStorage.fileMetadata = JSON.stringify(newMetadata)
                  annotations.populateWSIAnnotations(document.querySelectorAll('.wsiAnnotationType')[0], false, true)
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
    
    const createHideAnnotationsButton = () => {
      const hideAnnotationsButtonDiv = document.createElement("div")
      hideAnnotationsButtonDiv.className = "dropdown wsiControlBtnParent"
      const hideAnnotationsButton = document.createElement("button")
      hideAnnotationsButton.id = "wsiHideAnnotationsBtn"
      hideAnnotationsButton.className = "btn wsiControlBtn"
      hideAnnotationsButton.setAttribute("type", "button")
      hideAnnotationsButton.setAttribute("disabled", "true")
      hideAnnotationsButton.setAttribute("data-toggle", "dropdown")
      hideAnnotationsButton.innerHTML = `<i class="far fa-eye-slash"></i>`
      hideAnnotationsButtonDiv.appendChild(hideAnnotationsButton)
      hideAnnotationsButtonDiv.title = "Hide Annotations"
      
      const hideAnnotationsDropdownDiv = document.createElement("div")
      hideAnnotationsDropdownDiv.id = "hideAnnotationsDropdownDiv"
      hideAnnotationsDropdownDiv.className = "dropdown-menu"
      hideAnnotationsDropdownDiv.innerHTML = `
        <div><b>Hide Annotations</b></div>
        <hr/>
      `
      
      const hideAnnotationsOption_byMeDiv = document.createElement("div")
      hideAnnotationsOption_byMeDiv.className = "form-check"
      const hideAnnotationsOption_byMeInput = document.createElement("input")
      hideAnnotationsOption_byMeInput.id = "hideAnnotationsOption_byMe"
      hideAnnotationsOption_byMeInput.className = "form-check-input"
      hideAnnotationsOption_byMeInput.setAttribute("type", "checkbox")
      hideAnnotationsOption_byMeInput.onclick = (e) => {
        if (hideAnnotationsOption_byMeInput.checked) {
          hideAnnotationsButtonDiv.classList.add("active")
          path.wsiViewer.currentOverlays.forEach(overlay => {
            if (overlay.element.classList.contains(`wsiUserAnnotation`)) {
              overlay.element.style.display = "none"
            }
          })
        } else {
          if (!hideAnnotationsOption_byModel.checked) {
            hideAnnotationsButtonDiv.classList.remove("active")
          }
          path.wsiViewer.currentOverlays.forEach(overlay => {
            if (overlay.element.classList.contains(`wsiUserAnnotation`)) {
              overlay.element.style.display = "block"
            }
          })
        }
      }
      hideAnnotationsOption_byMeDiv.appendChild(hideAnnotationsOption_byMeInput)
      hideAnnotationsOption_byMeDiv.insertAdjacentHTML('beforeend', `<label class="form-check-label" for="hideAnnotationsOption_byMe">Made by me</label>`)
      
      const hideAnnotationsOption_byModelDiv = document.createElement("div")
      hideAnnotationsOption_byModelDiv.className = "form-check"
      const hideAnnotationsOption_byModelInput = document.createElement("input")
      hideAnnotationsOption_byModelInput.id = "hideAnnotationsOption_byModel"
      hideAnnotationsOption_byModelInput.className = "form-check-input"
      hideAnnotationsOption_byModelInput.setAttribute("type", "checkbox")
      hideAnnotationsOption_byModelInput.onclick = (e) => {
        if (hideAnnotationsOption_byModelInput.checked) {
          hideAnnotationsButtonDiv.classList.add("active")
          path.wsiViewer.currentOverlays.forEach(overlay => {
            if (overlay.element.classList.contains(`wsiModelAnnotation`)) {
              overlay.element.style.display = "none"
            }
          })
        } else {
          if (!hideAnnotationsOption_byMeInput.checked) {
            hideAnnotationsButtonDiv.classList.remove("active")
          }
          path.wsiViewer.currentOverlays.forEach(overlay => {
            if (overlay.element.classList.contains(`wsiModelAnnotation`)) {
              overlay.element.style.display = "block"
            }
          })
        }
      }
      hideAnnotationsOption_byModelDiv.appendChild(hideAnnotationsOption_byModelInput)
      hideAnnotationsOption_byModelDiv.insertAdjacentHTML('beforeend', `<label class="form-check-label" for="hideAnnotationsOption_byModel">Model Predictions</label>`)
      
      hideAnnotationsDropdownDiv.appendChild(hideAnnotationsOption_byMeDiv)
      hideAnnotationsDropdownDiv.appendChild(hideAnnotationsOption_byModelDiv)

      hideAnnotationsButtonDiv.appendChild(hideAnnotationsDropdownDiv)

      return hideAnnotationsButtonDiv
    }
    
    
    const annotateWSIButtonDiv = createAnnotationButton()
    const runModelWSIButtonDiv = createRunModelButton()
    const hideAnnotationsButtonDiv = createHideAnnotationsButton()
    
    const newControlButtonsDiv = document.createElement("div")
    newControlButtonsDiv.appendChild(annotateWSIButtonDiv)
    newControlButtonsDiv.appendChild(runModelWSIButtonDiv)
    newControlButtonsDiv.appendChild(hideAnnotationsButtonDiv)
    path.wsiViewer.addControl(newControlButtonsDiv, {
      anchor: OpenSeadragon.ControlAnchor["TOP_LEFT"]
    }, path.wsiViewer.controls.bottomLeft)
    
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
    new BSN.Dropdown(runModelWSIButtonDiv.querySelector("button#wsiRunModelBtn"), false)
    runModelWSIButtonDiv.addEventListener('show.bs.dropdown', (e) => {
      runModelWSIButtonDiv.Tooltip.hide()
    })
    new BSN.Dropdown(hideAnnotationsButtonDiv.querySelector("button#wsiHideAnnotationsBtn"), true)

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
      
      wsi.overlayPreviousPredictions()
    })
    
    // path.wsiViewer.addHandler("tile-drawn", (e) => {
      // console.log(e)
      // })
      
  } else {
    showLoader(loaderElementId, path.wsiViewerDiv)
    const wsiCanvas = path.wsiViewer.canvas.querySelector("canvas")
    const wsiCtx = wsiCanvas.getContext("2d")
    wsiCtx.clearRect(0, 0, wsiCanvas.width, wsiCanvas.height)
    // path.wsiViewer.world.getItemAt(0).reset()
    // path.wsiViewer.removeControl(path.wsiViewer.controls[1].element)
    path.wsiViewer.open(tileSources)
    path.wsiViewer.imageLoadedAtTime = Date.now()
    wsi.removePanAndZoomFromHash()
  }
  
  path.wsiViewer.removeAllHandlers('open')
  path.wsiViewer.addOnceHandler('open', (e) => {
    path.wsiViewer.element.querySelectorAll("button.wsiControlBtn").forEach(element => {
      element.setAttribute("disabled", "true")
      element.style.cursor = "not-allowed"
    })
    
    wsi.stopModel()
    
    path.wsiViewer.world.getItemAt(0).addOnceHandler('fully-loaded-change', async (e) => {
      path.wsiCanvasLoaded = true
      wsi.handlePanAndZoom()
      document.removeEventListener("datasetConfigSet", wsi.datasetChangeHandler)
      wsi.datasetChangeHandler = () => {
        wsi.stopModel()
        wsi.removeOverlays(true)
        enableOptions()
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
    path.onCanvasLoaded()
  })

  path.wsiViewer.removeAllHandlers('open-failed')
  path.wsiViewer.addOnceHandler('open-failed', (e) => {
    console.error("Error opening Tile Source", e)
  })

  const handleBoxURLExpiry = () => {
    path.wsiViewer.removeAllHandlers("tile-load-failed")
    clearTimeout(wsi.failedTileHandlerTimeout)
    // Handle Box URL expiry. Get new URL and replace the tile source.
    wsi.failedTileHandlerTimeout = setTimeout(() => path.wsiViewer.addOnceHandler("tile-load-failed", async (e) => {
      console.log("Tile Load Failed, trying to reset URL!!!!!!!", e)
      // Box URLs expire in 15 mins, so checking to see if enough time has elapsed for the load failure reason to be URL expiry.
      if (Date.now() > path.wsiViewer.imageLoadedAtTime + (14*60*1000)) {
        showLoader(loaderElementId, path.wsiViewer.element)
        const oldImage = path.wsiViewer.world.getItemAt(0)
        const oldBounds = oldImage.getBounds()
        const oldTileSource = oldImage.source
        
        const refreshedFileURL = await box.getFileContent(id, false, true)
        const newTileSourceURL = `${wsi.tileServerBasePath}/?iiif=${refreshedFileURL}`
        const newTileSource = {
          ...oldTileSource,
          "@id": newTileSourceURL
        }

        path.wsiViewer.addTiledImage({
          tileSource: newTileSource,
          x: oldBounds.x,
          y: oldBounds.y,
          width: oldBounds.width,
          success: () => {
            path.wsiViewer.world.removeItem(oldImage)
            hideLoader(loaderElementId)
            handleBoxURLExpiry()
          }
        })
      }
    }), 2*60*1000)
  }
  handleBoxURLExpiry()

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
  wsi.createOverlayRect("wsiProcessing", processOverlayRect, "Running Model over this region", undefined, false, false, false)
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

wsi.createOverlayRect = (type="user", rectBounds, tooltipText, annotationId=path.datasetConfig.annotations[0].annotationId, hidden=false, processing=false, showAsTooltip=false, withOptions=true) => {
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

  if (withOptions) {
    // const optionsDiv = createOverlayOptions(rect)
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
          wsiAnnotationDetailsElement.scrollIntoViewIfNeeded({block: 'center'})
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
      wsi.modelRunning = false
      utils.showToast("Stopping Model...")
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
        if (highestValuePrediction.label === annotation.labels[0].label) {
          const tooltip = `${annotation.displayName}\n${annotation.labels[0].displayText || annotation.labels[0].label}: ${Math.round((highestValuePrediction.prob + Number.EPSILON) * 1000) / 1000 }`
          wsi.createOverlayRect("model", osdRect, tooltip, data.annotationId, false, false, true)
        }
      }
    } else if (data.processing) {
      const { x, y, width, height } = data
      const osdRect = path.wsiViewer.viewport.imageToViewportRectangle(x, y, width, height)
      wsi.createOverlayRect("tileProcessing", osdRect, "Analyzing...", undefined, false, true, false)
      // console.log("processing overlay added", Object.values(osdRect))
    }
  }
}

wsi.stopModel = () => {
  if (wsi.modelRunning) {
    wsi.removeOverlays(false, "wsiProcessing")
    wsi.removeOverlays(false, "tileProcessing")
    path.wsiViewer.removeAllHandlers('remove-overlay')
    
    const runModelWSIButton = document.getElementById("wsiRunModelBtn")
    runModelWSIButton.innerHTML = `<i class="fas fa-microchip"></i>`
    runModelWSIButton.parentElement.classList.remove("active")
    runModelWSIButton.parentElement.selected = false
    
    const dropdownDiv = document.getElementById("runModelWSIDropdownDiv")
    dropdownDiv.querySelectorAll("input[type=radio]").forEach(element => {
      element.removeAttribute("disabled") 
      element.checked = false
    })
    dropdownDiv.querySelector("#stopWSIModelButtonDiv").style.display = "none"
    // dropdownDiv.querySelectorAll("button").forEach(element => element.removeAttribute("disabled"))
    
    path.wsiViewer.controls[path.wsiViewer.controls.length - 1].autoFade = true
    wsi.stopWorkers()
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
    let numRecords = 0
    objectStoreTransaction.count(queryOpts.query).onsuccess = (e) => {
      numRecords = e.target.result
    
      let cursorSource = objectStoreTransaction
      if (queryOpts.index) {
        cursorSource = objectStoreTransaction.index(queryOpts.index)
      }
      
      let pagesSkippedFlag = queryOpts.pageNum && queryOpts.pageNum > 0
      
      const cursorRequest = cursorSource.openCursor(queryOpts.query, queryOpts.direction)
      cursorRequest.onsuccess = (e) => {
        const cursor = e.target.result
        if (!cursor) {
          console.log("No cursor", queryOpts)
          resolve({result: []})
          return
        }

        if (queryOpts.offset > 0 && !pagesSkippedFlag) {
          // console.log("Advancing by ", queryOpts.offset, numRecords)
          pagesSkippedFlag = true
          cursor.advance(queryOpts.offset)
          return
        }
        
        if (cursor && queryResult.length < queryOpts.limit) {
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
          // console.log(queryResult, offset)
          resolve({result: queryResult, offset})
        }
      }
      cursorRequest.onerror = (e) => {
        console.log(e)
      }
    }
  }
   
})

wsi.overlayPreviousPredictions = () => {
  const hideModelAnnotations = document.getElementById("hideAnnotationsOption_byModel").checked
  Object.values(wsi.predsDB.objectStoreNames).forEach(async objectStore => {
    const annotation = path.datasetConfig.annotations.find(annot => annot.annotationId === parseInt(objectStore.split(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_`)[1]))
    if (annotation) {
      const currentViewportBounds = path.wsiViewer.viewport.viewportToImageRectangle(path.wsiViewer.viewport.getBounds(true))
      
      const limit = 100
      let offset = 0
      let finishedIndexedDBParsing = false
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
      while (!finishedIndexedDBParsing) {
        indexedDBQueryOpts.offset = offset
        const { result: dataInIndexedDB, offset: newOffset } = await wsi.getFromIndexedDB(objectStore, indexedDBQueryOpts)
        dataInIndexedDB.forEach(({x, y, width, height, prediction}) => {
          if (prediction[0].prob === prediction.reduce((max, current) => max < current.prob ? current.prob : max, 0)) {
            const osdRect = path.wsiViewer.viewport.imageToViewportRectangle(x, y, width, height, 0)
            const predictionText = `${prediction[0].label}: ${Math.round((prediction[0].prob + Number.EPSILON) * 1000) / 1000 }`
            const tooltipText = `${annotation.displayName}\n${predictionText}`
            wsi.createOverlayRect("model", osdRect, tooltipText, annotation.annotationId, hideModelAnnotations, false, true)
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
}

wsi.overlayPreviousAnnotations = () => {
  path.datasetConfig.annotations.forEach(({ annotationId }) => {
    const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
    if (fileMetadata[`${wsi.metadataPathPrefix}_${annotationId}`]) {
      const hideUserAnnotations = document.getElementById("hideAnnotationsOption_byMe").checked
      const userAnnotations = JSON.parse(fileMetadata[`${wsi.metadataPathPrefix}_${annotationId}`])[window.localStorage.userId]
      if (userAnnotations) {
        const annotationsToOverlay = userAnnotations.filter(annot => annot.annotationId === annotationId)
        annotationsToOverlay.forEach(annot => {
          const { x, y, width, height, degrees } = annot.rectBounds
          const osdRect = new OpenSeadragon.Rect(x, y, width, height, degrees)
          wsi.createOverlayRect("user", osdRect, "", annotationId, hideUserAnnotations, false, false)
        })
      }
    }
  })
}
