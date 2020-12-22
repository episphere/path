const wsi = {}

wsi.tileServerBasePath = "https://dl-test-tma.uc.r.appspot.com/iiif"

const reloadImageAfterURLTimeout = (id) => wsi.loadImage(id)

wsi.loadImage = async (id, fileMetadata={}) => {
  
  path.tmaCanvas.parentElement.style.display = "none"
  path.wsiViewerDiv.style.display = "block"

  const metadataPath = "wsiAnnotation"
  
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
    path.tmaCanvas.parentElement.style.background = "black"
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
                wsi.createOverlayRect("user", smallestTileClicked.bounds, "", false, false, false)
                
                const wsiAnnotations = fileMetadata[metadataPath] ? JSON.parse(fileMetadata[metadataPath]) : {}
                wsiAnnotations[window.localStorage.userId] = wsiAnnotations[window.localStorage.userId] || []
      
                const newAnnotation = {
                  'userId': window.localStorage.userId,
                  'email': window.localStorage.email,
                  'username': window.localStorage.username,
                  'rectBounds': smallestTileClicked.bounds,
                  'createdAt': Date.now()
                }
      
                wsiAnnotations[window.localStorage.userId] = [...wsiAnnotations[window.localStorage.userId], newAnnotation]
          
                box.updateMetadata(id, `/${metadataPath}`, JSON.stringify(wsiAnnotations))
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
        if (regionSelected === "currentRegion") {
          const currentLevel = path.wsiViewer.world.getItemAt(0).lastDrawn.reduce((maxLevel, current) => maxLevel < current.level ? current.level : maxLevel, 0)
          const tileSizeAtCurrentLevel = Math.pow(2, 8 + path.wsiViewer.source.maxLevel - currentLevel) // Start at 2^8 because 256 is the smallest tile size we consider.
          const currentBounds = path.wsiViewer.viewport.getBounds()
          const { x: topLeftX, y: topLeftY } = path.wsiViewer.source.getTileAtPoint(currentLevel, new OpenSeadragon.Point(currentBounds.x, currentBounds.y))
          const { x: bottomRightX, y: bottomRightY } = path.wsiViewer.source.getTileAtPoint(currentLevel, new OpenSeadragon.Point(currentBounds.x + currentBounds.width, currentBounds.y + currentBounds.height))
          
          const startX = topLeftX * tileSizeAtCurrentLevel
          const startY = topLeftY * tileSizeAtCurrentLevel
          const endX = (bottomRightX * tileSizeAtCurrentLevel) + tileSizeAtCurrentLevel
          const endY = (bottomRightY * tileSizeAtCurrentLevel) + tileSizeAtCurrentLevel
          runModelWSI(startX, startY, endX, endY, tileSizeAtCurrentLevel)

        } else if (regionSelected === "wholeImage") {
          const startX = 0
          const startY = 0
          const {width: endX, height: endY } = path.wsiViewer.source
          runModelWSI(startX, startY, endX, endY)
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
      if (fileMetadata[metadataPath]) {
        const hideUserAnnotations = document.getElementById("hideAnnotationsOption_byMe").checked
        const hideModelAnnotations = document.getElementById("hideAnnotationsOption_byModel").checked
        const userAnnotations = JSON.parse(fileMetadata[metadataPath])[window.localStorage.userId]
        if (userAnnotations) {
          userAnnotations.sort((a,b) => (b.width*b.height) - (a.width*a.height))
          userAnnotations.forEach(annot => {
            const { x, y, width, height, degrees } = annot.rectBounds
            const osdRect = new OpenSeadragon.Rect(x, y, width, height, degrees)
            wsi.createOverlayRect("user", osdRect, "", hideUserAnnotations, false, false)
          })
        }
      }

      
      path.wsiViewer.element.querySelectorAll("button.wsiControlBtn").forEach(element => {
        if (element.id === "wsiRunModelBtn" && path.datasetConfig?.models?.trainedModels?.length === 0) {
          return
        }
        element.removeAttribute("disabled")
        element.style.cursor = "pointer"
      })
      
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
    console.log(e)
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
  if (!predicting) {
    wsi.stopModel()
    utils.showToast("Model not ready yet, please try again in a few seconds!")
  }
  
  const processOverlayRect = path.wsiViewer.viewport.imageToViewportRectangle(predictionBounds.startX, predictionBounds.startY, predictionBounds.endX - predictionBounds.startX, predictionBounds.endY - predictionBounds.startY)
  wsi.createOverlayRect("wsiProcessing", processOverlayRect, "Running Model over this region", false, false, false)
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

wsi.createOverlayRect = (type="user", rectBounds, tooltipText, hidden=false, processing=false, showAsTooltip=false) => {
  const classNamesToTypeMap = {
    'user': "wsiUserAnnotation",
    'model': "wsiModelAnnotation",
    'wsiProcessing': "wsiProcessing",
    'tileProcessing': "tileProcessing"
  }
  const elementId = `wsiAnnotation_${Date.now()}`
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
  
  rect.onkeyup = (e) => {
    if (!e.shiftKey) {
      rect.style.cursor = "auto"
    }
  }
  rect.onmousemove = (e) => {
    if (e.shiftKey) {
      rect.style.cursor = "zoom-in"
    } else {
      rect.style.cursor = "auto"
    }
  }
  rect.onclick = (e) => {
    if (e.shiftKey) {
      path.wsiViewer.viewport.fitBoundsWithConstraints(rectBounds)
      rect.style.cursor = "auto"
    }
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

wsi.getPreviousPredsFromBox = (fileMetadata) => {
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
          'wsiPredsFileId': data.newFileMetadata.wsiPredsFiles.find(file => file.annotationId === data.annotationId && file.modelId === data.modelId).fileId
        }
      })
      document.dispatchEvent(previousPredsReadyEvent)
    }
    wsi.overlayPreviousPredictions()
    return
  } 
  if (data.imageId === hashParams.image) {
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
          wsi.createOverlayRect("model", osdRect, tooltip, false, false, true)
        }
      }
    } else if (data.processing) {
      const { x, y, width, height } = data
      const osdRect = path.wsiViewer.viewport.imageToViewportRectangle(x, y, width, height)
      wsi.createOverlayRect("tileProcessing", osdRect, "Analyzing...", false, true, false)
      // console.log("processing overlay added", Object.values(osdRect))
    }
  }
}

wsi.stopModel = () => {
  path.wsiViewer.currentOverlays.forEach(overlay => {
    if (overlay.element.classList.contains("wsiProcessing") || overlay.element.classList.contains("tileProcessing")) {
      path.wsiViewer.removeOverlay(overlay.element)
    }
  })
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

wsi.stopWorkers = () => {
  const annotationId = path.datasetConfig?.annotations[0]?.annotationId
  models.stopWSIWorkers(annotationId)
  utils.showToast("Stopping Model...")
}

wsi.setupIndexedDB = async () => {
  const { dbName, objectStoreOpts, objectStoreIndex } = indexedDBConfig['wsi']
  const objectStoreNames = path.datasetConfig.models.trainedModels.map(model => `${indexedDBConfig['wsi'].objectStoreNamePrefix}_${model.correspondingAnnotation}`)
  const currentDBInstances = await window.indexedDB.databases()
  const existingWSIDBInstance = currentDBInstances.find(db => db.name === dbName)
  let dbRequest
  if (existingWSIDBInstance) {
    dbRequest = window.indexedDB.open(dbName, existingWSIDBInstance.version + 1)
  } else {
    dbRequest = window.indexedDB.open(dbName)
  }

  dbRequest.onupgradeneeded = () => {
    const db = dbRequest.result
    objectStoreNames.forEach(objectStoreName => {
      if (!db.objectStoreNames.contains(objectStoreName)) {
        const objectStore = db.createObjectStore(objectStoreName, objectStoreOpts)
        objectStore.createIndex(objectStoreIndex.name, objectStoreIndex.keyPath, objectStoreIndex.objectParameters)
      }
    })    
  }
  dbRequest.onsuccess = (evt) => {
    wsi.predsDB = evt.target.result
  }
}

wsi.overlayPreviousPredictions = () => {
  Object.values(wsi.predsDB.objectStoreNames).forEach(objectStore => {
    const annotation = path.datasetConfig.annotations.find(annot => annot.annotationId === parseInt(objectStore.split(`${indexedDBConfig['wsi'].objectStoreNamePrefix}_`)[1]))
    if (annotation) {
      const objectStoreTransaction = wsi.predsDB.transaction(objectStore, "readonly").objectStore(objectStore)
      objectStoreTransaction.getAll().onsuccess = (e) => {
        e.target.result.forEach(({x, y, width, height, prediction}) => {
          if (prediction[0].prob === prediction.reduce((max, current) => max < current.prob ? current.prob : max, 0)) {
            const osdRect = path.wsiViewer.viewport.imageToViewportRectangle(x, y, width, height, 0)
            const predictionText = `${prediction[0].label}: ${prediction[0].prob}`
            const tooltipText = `${annotation.displayName}\n${predictionText}`
            wsi.createOverlayRect("model", osdRect, tooltipText, false, false, true)
          }
        })
      }
    }
  })
}