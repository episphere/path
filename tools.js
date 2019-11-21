const watershedSegment = (inputCanvas, outputCanvas, checked) => {
  let src = cv.imread(inputCanvas)
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

const zoomInHandler = (inputCanvas, outputCanvas, selected) => {
  const zoomLens = document.getElementById("img-zoom-lens") || document.createElement("div")
  
  if (!selected) {
    zoomLens.style.display = "none"
    return
  }
  zoomLens.setAttribute("id", "img-zoom-lens")
  zoomLens.style.cursor = "zoom-in"
  inputCanvas.parentElement.insertBefore(zoomLens, inputCanvas)

  const [lensX, lensY] = [outputCanvas.offsetWidth/zoomLens.offsetWidth, outputCanvas.offsetHeight/zoomLens.offsetHeight]
  
  const renderLens = (moveEvent, zoomHandler) => {
    moveEvent.preventDefault()
    const pos = {
      x: moveEvent.pageX - inputCanvas.getBoundingClientRect().left - window.pageXOffset,
      y: moveEvent.pageY - inputCanvas.getBoundingClientRect().top - window.pageYOffset,
    }
    let x = pos.x - (zoomLens.offsetWidth/2)
    let y = pos.y - (zoomLens.offsetHeight/2)
    if (x > inputCanvas.width - zoomLens.offsetWidth) {
      x = inputCanvas.width - zoomLens.offsetWidth
    } else if (x < 0) {
      x = 0
    }
    if (y > inputCanvas.height - zoomLens.offsetHeight) {
      y = inputCanvas.height - zoomLens.offsetHeight
    } else if (y < 0) {
      y = 0
    }
    zoomLens.style.left = `${x}px`
    zoomLens.style.top = `${y}px`
    zoomLens.onclick = zoomHandler
  }

  const zoomIn = (clickEvent) => {
    // console.log(clickEvent.x, clickEvent.y)
    // const div = document.createElement("div")
    // div.style['position'] = "absolute"
    // div.style["top"]= clickEvent.pageX + inputCanvas.getBoundingClientRect().left
    // div.style["left"]= clickEvent.pageY + inputCanvas.getBoundingClientRect().top
    // div.style['width']= "10px"
    // div.style["height"]= "10px"
    // div.style["background-color"]= "red"
    // document.body.appendChild(div)
  }
  
  zoomLens.onmousemove = (e) => renderLens(e, zoomIn)
  inputCanvas.onmousemove = (e) => renderLens(e, zoomIn)
}