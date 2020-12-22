const tools = {}

tools.addLocalFileButton = async () => {
  const addFileBtnDiv = document.createElement("div")
  const addFileBtn = document.createElement("button")
  addFileBtn.setAttribute("class", "btn btn-outline-primary")
  addFileBtn.setAttribute("id", "localFileInputBtn")

  const addFileIcon = `
    <i  class="fas fa-file-import"></i>
  `
  addFileBtn.innerHTML = addFileIcon

  const addFileInputElement = document.createElement("input")
  addFileInputElement.setAttribute("type", "file")
  addFileInputElement.setAttribute("id", "localFileInput")
  addFileInputElement.style.display = "none"

  addFileBtn.onclick = () => addFileInputElement.click()

  addFileBtnDiv.appendChild(addFileBtn)
  addFileBtnDiv.appendChild(addFileInputElement)

  addFileInputElement.onchange = ({
    target: {
      files
    }
  }) => {
    if (files) {
      document.getElementById("imgHeader").innerHTML = `<h5>${files[0].name}</h5>`
      if (hashParams.image) {
        path.selectImage(null)
        window.localStorage.currentFolder = ""
      }
      path.isImageFromBox = false
      path.tmaImage.setAttribute("src", "") // Unsetting src because Firefox does not update image otherwise.
      path.tmaImage.setAttribute("src", URL.createObjectURL(files[0]))
      path.tmaImage.setAttribute("crossorigin", "Anonymous")
      document.getElementById("annotationsDiv").style.display = "none"
      document.getElementById("thumbnailPicker").style.display = "none"
    }
  }

  addFileBtn.setAttribute("title", "Add Local File")
  new BSN.Tooltip(addFileBtn, {
    'placement': "bottom",
    'animation': "slideNfade",
    'delay': 50
  })

  path.toolsDiv.appendChild(addFileBtnDiv)
}

tools.segmentButton = () => {
  let clicked = false
  const segmentDiv = document.createElement("div")
  segmentDiv.setAttribute("class", "tool")
  segmentDiv.setAttribute("title", "Under Development!")

  const segmentBtn = document.createElement("button")
  segmentBtn.setAttribute("class", "btn btn-outline-primary")
  // segmentBtn.setAttribute("disabled", "")

  const segmentIcon = document.createElement("i")
  segmentIcon.setAttribute("class", "fas fa-qrcode")
  segmentBtn.onclick = () => {
    clicked = !clicked
    if (clicked) {
      segmentBtn.classList.replace("btn-outline-primary", "btn-primary")
    } else {
      segmentBtn.classList.replace("btn-primary", "btn-outline-primary")
    }
    const currentlyVisibleCanvas = path.isWSI ? path.wsiViewer.canvas.firstElementChild : path.tmaCanvas
    watershedSegment(currentlyVisibleCanvas, currentlyVisibleCanvas, clicked)
  }
  // const segmentLabel = document.createElement("label")
  // segmentLabel.appendChild(document.createTextNode(`Segment Image`))
  segmentBtn.appendChild(segmentIcon)
  segmentDiv.appendChild(segmentBtn)
  path.toolsDiv.appendChild(segmentDiv)

  new BSN.Tooltip(segmentDiv, {
    'placement': "bottom",
    'animation': "slideNfade",
    'delay': 50
  })
}

const watershedSegment = (canvas, outputCanvas, checked) => {
  let src = cv.imread(canvas)
  let dst = new cv.Mat()
  let gray = new cv.Mat()
  let opening = new cv.Mat()
  let background = new cv.Mat()
  let foreground = new cv.Mat()
  let distTrans = new cv.Mat()
  let unknown = new cv.Mat()
  let markers = new cv.Mat()
  let M = cv.Mat.ones(3, 3, cv.CV_8U)

  if (!checked) {
    cv.imshow(outputCanvas, src)
  } else {
    // gray and threshold image
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0)
    cv.threshold(gray, gray, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU)
    // cv.threshold(gray, gray, 0, 255, 11)
    // get background
    cv.erode(gray, gray, M)
    cv.dilate(gray, opening, M)
    cv.dilate(opening, background, M, new cv.Point(-1, -1), 1)
    // distance transform
    cv.distanceTransform(opening, distTrans, cv.DIST_L2, 5)
    cv.normalize(distTrans, distTrans, 1, 0, cv.NORM_INF)
    // get foreground
    cv.threshold(distTrans, foreground, 0.0005 * 1, 255, cv.THRESH_BINARY)
    foreground.convertTo(foreground, cv.CV_8U, 1, 0)
    cv.subtract(background, foreground, unknown)

    // get connected components markers
    cv.connectedComponents(foreground, markers)
    for (let i = 0; i < markers.rows; i++) {
      for (let j = 0; j < markers.cols; j++) {
        markers.intPtr(i, j)[0] = markers.ucharPtr(i, j)[0] + 1
        if (unknown.ucharPtr(i, j)[0] == 255) {
          markers.intPtr(i, j)[0] = 0
        }
      }
    }
    let srcNew = new cv.Mat()
    cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0)
    cv.watershed(src, markers)
    // // draw barriers
    for (let i = 0; i < markers.rows; i++) {
      for (let j = 0; j < markers.cols; j++) {
        if (markers.ucharPtr(i, j)[0] == 255) {
          src.ucharPtr(i, j)[0] = 0 // R
          src.ucharPtr(i, j)[1] = 0 // G
          src.ucharPtr(i, j)[2] = 255 // B
        }
      }
    }
    cv.imshow(outputCanvas, src)
  }

  src.delete();
  dst.delete();
  gray.delete();
  opening.delete();
  background.delete();
  foreground.delete();
  distTrans.delete();
  unknown.delete();
  markers.delete();
  M.delete();

}

tools.zoomButton = () => {
  let magnification = 2
  let scrollToZoom = true
  let toolSelected = false

  const zoomToolDiv = document.createElement("div")
  zoomToolDiv.setAttribute("id", "zoomWithDropdown")
  zoomToolDiv.setAttribute("class", "tool")

  const zoomBtnDiv = document.createElement("div")
  const zoomBtn = document.createElement("button")
  zoomBtn.setAttribute("id", "zoomButton")
  zoomBtn.setAttribute("class", "btn btn-outline-primary")
  zoomBtn.setAttribute("title", "Zoom In")
  
  document.onkeydown = (keyEvent) => {
    if (keyEvent.key === "Escape" && toolSelected) {
      zoomBtn.click()
    }
  }
  
  zoomBtn.onclick = () => {
    if (zoomBtn.classList.contains("active")) {
      toolSelected = false
      zoomBtn.classList.remove("active")
    } else {
      toolSelected = true
      zoomBtn.classList.add("active")
    }
    zoomHandler(path.tmaCanvas, path.tmaImage, magnification, scrollToZoom, [200, 200], toolSelected)
  }

  const zoomInIcon = document.createElement("i")
  zoomInIcon.setAttribute("class", "fas fa-search-plus")
  zoomBtn.appendChild(zoomInIcon)
  zoomBtnDiv.appendChild(zoomBtn)

  const zoomOptionsDiv = document.createElement("div")
  zoomOptionsDiv.setAttribute("class", "dropdown")

  const zoomOptionsBtn = document.createElement("button")
  zoomOptionsBtn.setAttribute("class", "btn btn-outline-link dropdown-toggle")
  zoomOptionsBtn.setAttribute("type", "button")
  zoomOptionsBtn.setAttribute("data-toggle", "dropdown")
  zoomOptionsBtn.innerText = ""

  const zoomOptionsDropdown = document.createElement("div")
  zoomOptionsDropdown.setAttribute("class", "dropdown-menu")

  const magnificationSelectorParentDiv = document.createElement("div")
  magnificationSelectorParentDiv.innerHTML = "<b>Magnification:</b>"
  
  const magnificationSelector = document.createElement("div")
  magnificationSelector.setAttribute("id", "magnificationSelectors")
  magnificationSelector.setAttribute("class", "btn-group btn-group-sm")
  magnificationSelector.setAttribute("role", "group")

  const magnifications = [{
    "displayText": "2x",
    "value": 2
  }, {
    "displayText": "5x",
    "value": 5
  }, {
    "displayText": "10x",
    "value": 10
  }, {
    "displayText": "20x",
    "value": 20
  }, {
    "displayText": "40x",
    "value": 40
  }]

  magnifications.forEach(mag => {
    const selectMagnificationBtn = document.createElement("button")
    selectMagnificationBtn.setAttribute("type", "button")
    selectMagnificationBtn.setAttribute("class", "btn btn-outline-info")
   
    if (magnification === mag.value) {
      selectMagnificationBtn.classList.add("active")
    }
   
    selectMagnificationBtn.setAttribute("value", mag.value)
    selectMagnificationBtn.innerText = mag.displayText
  
    selectMagnificationBtn.onclick = (_) => {
      magnification = mag.value
      const previouslySelectedMagnification = selectMagnificationBtn.parentElement.querySelector("button.active")
    
      if (toolSelected) {
        zoomHandler(path.tmaCanvas, path.tmaImage, magnification, scrollToZoom, [200, 200], toolSelected)
      }
  
      if (previouslySelectedMagnification && previouslySelectedMagnification !== selectMagnificationBtn) {
        previouslySelectedMagnification.classList.remove("active")
      }
  
      selectMagnificationBtn.classList.add("active")
    }
    magnificationSelector.appendChild(selectMagnificationBtn)
  })

  const scrollToZoomDiv = document.createElement("div")
  const scrollToZoomLabel = document.createElement("label")
  scrollToZoomLabel.setAttribute("for", "scrollToZoom")
  scrollToZoomLabel.style.margin = 0
  scrollToZoomLabel.innerHTML = "<b>Scroll To Zoom  <b>"
 
  const scrollToZoomCheckbox = document.createElement("input")
  scrollToZoomCheckbox.setAttribute("type", "checkbox")
  scrollToZoomCheckbox.setAttribute("id", "scrollToZoom")
  scrollToZoomCheckbox.setAttribute("class", "form-check-input")
 
  scrollToZoomCheckbox.onchange = ({
    target
  }) => {
    scrollToZoom = target.checked
    if (toolSelected) {
      zoomHandler(path.tmaCanvas, path.tmaImage, magnification, scrollToZoom, [200, 200], toolSelected)
    }
  }
 
  if (scrollToZoom) {
    scrollToZoomCheckbox.setAttribute("checked", "true")
  }

  scrollToZoomDiv.appendChild(scrollToZoomLabel)
  scrollToZoomDiv.appendChild(scrollToZoomCheckbox)

  magnificationSelectorParentDiv.appendChild(magnificationSelector)
  zoomOptionsDropdown.appendChild(magnificationSelectorParentDiv)
  zoomOptionsDropdown.appendChild(document.createElement("br"))
  zoomOptionsDropdown.appendChild(scrollToZoomDiv)

  zoomOptionsDiv.appendChild(zoomOptionsBtn)
  zoomOptionsDiv.appendChild(zoomOptionsDropdown)

  zoomToolDiv.appendChild(zoomBtnDiv)
  zoomToolDiv.appendChild(zoomOptionsDiv)

  new BSN.Dropdown(zoomOptionsBtn, true);

  path.toolsDiv.appendChild(zoomToolDiv)
}

const zoomHandler = (canvas, image, magnification = 2, scrollToZoom = true, lensSize, selected) => {
  let zoomLens = document.getElementById("zoomLens")

  if (!selected) {
    zoomLens.style.display = "none"
    zoomLens.removeEventListener("mousemove", mouseMoveHandler)
    canvas.removeEventListener("mousemove", mouseMoveHandler)
    zoomLens.removeEventListener("wheel", scrollHandler)
    return
  }

  if (!zoomLens) {
    zoomLens = document.createElement("canvas")
    zoomLens.setAttribute("id", "zoomLens")
    canvas.parentElement.appendChild(zoomLens)
  }

  lensSize = lensSize || [path.tmaCanvas.width * 0.2, path.tmaCanvas.height * 0.2]
 
  zoomLens.setAttribute("scrolltozoom", scrollToZoom)
  zoomLens.style.width = `${lensSize[0]}px`
  zoomLens.style.height = `${lensSize[1]}px`
  zoomLens.style.cursor = "zoom-in"
  zoomLens.style.left = zoomLens.style.left || 0
  zoomLens.style.top = zoomLens.style.top || 0
  zoomLens.style.display = "block"

  const minMagnification = canvas.width / image.width
  let scaleFactor = magnification * minMagnification
  const zoomStepSize = 0.02
  const zoomCtx = zoomLens.getContext("2d")
  zoomCtx.fillStyle = "white"

  // let lensPosition = {
  //   x: parseInt(zoomLens.style.left),
  //   y: parseInt(zoomLens.style.top)
  // }
  let lensPosition = {
    x: zoomLens.offsetWidth / 2,
    y: zoomLens.offsetHeight / 2
  }

  zoomHandler.moveLens = (moveEvent) => {
    moveEvent.preventDefault()

    lensPosition = {
      x: moveEvent.pageX - canvas.getBoundingClientRect().left - window.pageXOffset,
      y: moveEvent.pageY - canvas.getBoundingClientRect().top - window.pageYOffset,
    }

    let x = lensPosition.x - (zoomLens.offsetWidth / 2)
    let y = lensPosition.y - (zoomLens.offsetHeight / 2)

    if (x > canvas.width - zoomLens.offsetWidth) {
      x = canvas.width - zoomLens.offsetWidth
    } else if (x < 0) {
      x = 0
    }
 
    if (y > canvas.height - zoomLens.offsetHeight) {
      y = canvas.height - zoomLens.offsetHeight
    } else if (y < 0) {
      y = 0
    }

    zoomLens.style.left = `${x}px`
    zoomLens.style.top = `${y}px`

    renderZoomedImage(lensPosition)
  }

  const getLensPositionInImage = (canvas, image, lensPosition) => {
    const xInImage = lensPosition.x * (image.width / canvas.width)
    const yInImage = lensPosition.y * (image.height / canvas.height)

    return {
      xInImage,
      yInImage
    }
  }

  const renderZoomedImage = (lensPosition) => {
    const {
      xInImage,
      yInImage
    } = getLensPositionInImage(canvas, image, lensPosition)
    const zoomFactor = 1 / scaleFactor
    zoomCtx.fillRect(0, 0, zoomLens.width, zoomLens.height)
    
    let startX = xInImage - (lensSize[0] * zoomFactor / 2) > 0 ? xInImage - (lensSize[0] * zoomFactor / 2) : 0
    let startY = yInImage - (lensSize[1] * zoomFactor / 2) > 0 ? yInImage - (lensSize[1] * zoomFactor / 2) : 0
    const endX = lensSize[0] * zoomFactor
    const endY = lensSize[1] * zoomFactor

    if (startX + endX > image.width) {
      startX = image.width - endX
    }
    if (startY + endY > image.height) {
      startY = image.height - endY
    }
    
    zoomCtx.drawImage(image, startX, startY, endX, endY, 0, 0, zoomLens.width, zoomLens.height)

  }

  zoomHandler.changeScale = (scrolledUp) => {
    if (scrolledUp && scaleFactor <= 5) {
      scaleFactor += zoomStepSize
    } else if (scaleFactor >= minMagnification) {
      scaleFactor -= zoomStepSize
    }
    renderZoomedImage(lensPosition)
  }

  zoomLens.onmousemove = mouseMoveHandler
  canvas.onmousemove = mouseMoveHandler

  if (scrollToZoom) {
    zoomLens.addEventListener("wheel", scrollHandler)
  } else {
    zoomLens.removeEventListener("wheel", scrollHandler)
  }

  renderZoomedImage(lensPosition)
}

const mouseMoveHandler = (moveEvent) => {
  if (moveEvent.target === document.getElementById("zoomLens")) {
    moveEvent.stopPropagation()
  }
  zoomHandler.moveLens(moveEvent)
}

const scrollHandler = (wheelEvent) => {
  wheelEvent.preventDefault()
  const activeMagnificationSelector = document.getElementById("magnificationSelectors").querySelector("button.active")
  if (activeMagnificationSelector) {
    activeMagnificationSelector.classList.remove("active")
  }
  zoomHandler.changeScale(wheelEvent.deltaY >= 0)
}