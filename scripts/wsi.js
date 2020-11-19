const wsi = {}

wsi.tileServerBasePath = "https://dl-test-tma.uc.r.appspot.com/iiif"

const reloadImageAfterURLTimeout = (id) => wsi.loadImage(id)

wsi.loadImage = async (id, fileMetadata) => {
  
  // if (url.substr(url.length - 4, 4) === "ndpi") {
    // 	alert("NDPI Images not yet supported!")
    // 	return
    // }
  const metadataPath = "wsiAnnotation"
  
  const loaderElementId = "imgLoaderDiv"
  showLoader(loaderElementId, path.wsiViewer.element)
  const url = await box.getFileContent(id, false, true)
  
  if (wsi.reloadTimeout) {
    clearTimeout(wsi.reloadTimeout)
  }
  wsi.reloadTimeout = setTimeout(() => reloadImageAfterURLTimeout(id), 13*60*1000)

  const p = `${wsi.tileServerBasePath}/?iiif=${url}`;
  const infoURL = `${p}/info.json`
  let imageInfo
  try {
    imageInfo = await (await fetch(infoURL)).json()
  } catch (e) {
    alert("An error occurred retrieving the image information. Please try again later.")
    // window.history.back()
    // setTimeout(() => {
    // 	document.getElementById("imageSelectName").value = hashParams.imageTag
    // 	document.getElementById("imageSelectId").value = hashParams.imageNslcId
    // }, 1000)
    hideLoader(loaderElementId)
  }
  
  console.log("image Info : ", imageInfo)
  const tileSources = {
    "@context": imageInfo["@context"],
    "@id": p,
    "height": parseInt(imageInfo.height),
    "width": parseInt(imageInfo.width),
    "profile": ["http://iiif.io/api/image/2/level2.json"],
    "protocol": "http://iiif.io/api/image",
    "tiles": [{
      "scaleFactors": [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576],
      "width": 256
    }]
  }
  
  path.tmaCanvas.parentElement.style.display = "none"
  path.wsiViewerDiv.style.display = "block"
  
  if (!path.wsiViewer.canvas) {
    path.tmaCanvas.parentElement.style.background = "black"
    path.wsiViewer = OpenSeadragon({
      id: "wsiCanvasParent",
      // element: path.tmaCanvas,
      preserveViewport: true,
      visibilityRatio: 1,
      minZoomLevel: 1,
      defaultZoomLevel: 1,
      prefixUrl: "https://episphere.github.io/svs/openseadragon/images/",
      tileSources,
      gestureSettings: {
        clickToZoom: false
      }
    });

    path.wsiViewer.addHandler("canvas-click", (e) => {
      e.preventDefaultAction = true
      const pos = path.wsiViewer.viewport.pointFromPixel(e.position)
      const tiledImage = path.wsiViewer.world.getItemAt(0)
      if (tiledImage) {
        const tilesClicked = tiledImage.lastDrawn.filter((tile) => tile.bounds.containsPoint(pos))
        const smallestTileClicked = tilesClicked.reduce((minTile, tile) => tile.level > minTile.level ? tile : minTile, {
          level: 0
        })
        const isOverlaySelected = () => {
          let preSelectedOverlay
          if (path.wsiViewer.currentOverlays.length > 0) {
            path.wsiViewer.currentOverlays.forEach(overlay => {
              if (Object.entries(smallestTileClicked.bounds).every(([key,val]) => val === overlay[key])) {
                preSelectedOverlay = overlay
              }
            })
          }
          return preSelectedOverlay
        }
        if (!isOverlaySelected()) {
          const rect = document.createElement("div")
          rect.setAttribute("id", `wsiAnnotation_${Date.now()}`)
          rect.setAttribute("class", "wsiAnnotation")
          path.wsiViewer.addOverlay({
            element: rect,
            location: smallestTileClicked.bounds
          })
          
          const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
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
    const wsiCanvas = path.wsiViewer.canvas.querySelector("canvas")
    const wsiCtx = wsiCanvas.getContext("2d")
    wsiCtx.clearRect(0, 0, wsiCanvas.width, wsiCanvas.height)
    path.wsiViewer.open(tileSources)
  }
  
  path.tmaCanvasLoaded = false
  path.isImageFromBox = true
  path.isThumbnail = false
  path.onCanvasLoaded()
  
  if (fileMetadata[metadataPath]) {
    const userAnnotations = JSON.parse(fileMetadata[metadataPath])[window.localStorage.userId]
    if (userAnnotations) {
      userAnnotations.forEach(annot => {
        const { x, y, width, height, degrees } = annot.rectBounds
        setTimeout(() => {
          const rect = document.createElement("div")
          rect.setAttribute("id", `wsiAnnotation_${Date.now()}`)
          rect.setAttribute("class", "wsiAnnotation")
          path.wsiViewer.addOverlay({
            element: rect,
            location: new OpenSeadragon.Rect(x, y, width, height, degrees)
          })
        }, 10000)
      })
    }
  }

  // setTimeout(() => document.getElementById("loadingText").style.display = "none", 5000)
}