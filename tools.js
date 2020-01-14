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
    cv.threshold(distTrans, foreground, 0.05 * 1, 255, cv.THRESH_BINARY)
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
          src.ucharPtr(i, j)[0] = 255 // R
          src.ucharPtr(i, j)[1] = 0 // G
          src.ucharPtr(i, j)[2] = 0 // B
        }
      }
    }
    cv.imshow(outputCanvas, src)
  }
  
  src.delete(); dst.delete(); gray.delete(); opening.delete(); background.delete();
  foreground.delete(); distTrans.delete(); unknown.delete(); markers.delete(); M.delete();

}

const zoomHandler = (canvas, image, magnification=2, scrollToZoom=true, selected) => {
  let zoomLens = document.getElementById("zoomLens")
  if (!zoomLens) {
    zoomLens = document.createElement("canvas")
    zoomLens.setAttribute("id", "zoomLens")
    canvas.parentElement.appendChild(zoomLens)
  }

  const zoomBlockSize = [200, 200]
  zoomLens.setAttribute("scrolltozoom", scrollToZoom)
  zoomLens.style.width = `${zoomBlockSize[0]}px`
  zoomLens.style.height = `${zoomBlockSize[1]}px`
  zoomLens.style.cursor = "zoom-in"
  zoomLens.style.left = zoomLens.style.left || 0
  zoomLens.style.top = zoomLens.style.top || 0
  zoomLens.style.display = "block"

  const minMagnification = canvas.width/image.width
  let scaleFactor = magnification * minMagnification
  const zoomStepSize = 0.02
  const zoomCtx = zoomLens.getContext("2d")
  let lensPosition = {
    x: parseInt(zoomLens.style.left),
    y: parseInt(zoomLens.style.top)
  }
  
  zoomHandler.moveLens = (moveEvent) => {
    moveEvent.preventDefault()
    
    lensPosition = {
      x: moveEvent.pageX - canvas.getBoundingClientRect().left - window.pageXOffset,
      y: moveEvent.pageY - canvas.getBoundingClientRect().top - window.pageYOffset,
    }
    let x = lensPosition.x - (zoomLens.offsetWidth/2)
    let y = lensPosition.y - (zoomLens.offsetHeight/2)

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
    return { xInImage, yInImage }
  }

  const renderZoomedImage = (lensPosition) => {
    const { xInImage, yInImage } = getLensPositionInImage(canvas, image, lensPosition)
    const zoomFactor = 1/scaleFactor
    zoomCtx.drawImage(path.tmaImage, xInImage-(zoomBlockSize[0]*zoomFactor/2), yInImage-(zoomBlockSize[1]*zoomFactor/2), zoomBlockSize[0]*zoomFactor, zoomBlockSize[1]*zoomFactor, 0, 0, zoomLens.width, zoomLens.height)
  }

  zoomHandler.changeScale = (scrolledUp) => {
    if (scrolledUp && scaleFactor <=5) {
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
  if (!selected) {
    zoomLens.style.display = "none"
    zoomLens.removeEventListener("mousemove", mouseMoveHandler)
    canvas.removeEventListener("mousemove", mouseMoveHandler)
    zoomLens.removeEventListener("wheel", scrollHandler)
    return
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
    zoomHandler.changeScale(wheelEvent.deltaY>=0)
}