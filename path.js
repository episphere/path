console.log("path.js loaded")

const urlParams = {}
window.location.search.slice(1).split('&').forEach(param => {
  const [key, value] = param.split('=')
  urlParams[key] = value
})

const defaultImg = "images/OFB_023_2_003_1_13_03.jpg"

const utils = {
  request: (url, opts) => fetch(url, opts).then(res => res.json()),
}

const path = async () => {
  path.root = document.getElementById("tmaPath")
  path.imageDiv = document.getElementById("imageDiv")
  path.tmaCanvas = document.getElementById("tmaCanvas")
  path.outputCanvas = document.getElementById("outputCanvas")
  path.toolsDiv = document.getElementById("toolsDiv")
  path.tmaImage = new Image()
  path.tmaImage.src = defaultImg
  path.setupEventListeners()
  
  await box()
  
}

path.setupEventListeners = () => {
  
  document.addEventListener("boxLoggedIn", () => {
    const boxPopup = new BoxSelect()
    boxPopup.success((response) => {
      document.getElementById("imgHeader").innerText = response[0].name
      path.tmaImage.setAttribute("src", response[0].url)
      path.tmaImage.setAttribute("crossorigin", "Anonymous")
    });
    boxPopup.cancel(() => {
      console.log("The user clicked cancel or closed the popup");
    });
    document.getElementById("boxLoginBtn").style = "display: none"
    document.getElementById("username").appendChild(document.createTextNode(`Welcome ${window.localStorage.username.split(" ")[0]}!`))
    document.getElementById("filePickers_or").style.display = "block"
  })
  
  const fileInput = document.getElementById("imgInput")
  fileInput.onchange = ({ target: { files }}) => {
    document.getElementById("imgHeader").innerText = files[0].name
    path.tmaImage.setAttribute("src", URL.createObjectURL(files[0]))
    path.tmaImage.setAttribute("crossorigin", "Anonymous")
  }
  
  path.tmaImage.onload = path.loadCanvas

}

path.loadCanvas = () => {
  path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width)
  path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
  path.outputCanvas.setAttribute("width", path.outputCanvas.parentElement.getBoundingClientRect().width)
  path.outputCanvas.setAttribute("height", path.outputCanvas.width * path.tmaImage.height / path.tmaImage.width)
  path.outputCanvas.style.border = "1px solid red"
  const context = path.tmaCanvas.getContext('2d')
  context.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
  path.loadOptions()
}

path.loadOptions = () => {
  segmentButton()
  zoomInButton()
}

const segmentButton = () => {
  const segmentDiv = document.createElement("div")
  const segmentBtn = document.createElement("input")
  segmentBtn.setAttribute("type", "checkbox")
  segmentBtn.setAttribute("class", "checkbox")
  segmentBtn.onchange = () => segmentBtn.checked && watershedSegment(path.tmaCanvas, path.outputCanvas)
  const segmentLabel = document.createElement("label")
  segmentLabel.appendChild(document.createTextNode(`Segment Image`))
  segmentDiv.appendChild(segmentBtn)
  segmentDiv.appendChild(segmentLabel)
  path.toolsDiv.appendChild(segmentDiv)
}

const zoomInButton = () => {
  const zoomInDiv = document.createElement("div")
  const zoomInBtn = document.createElement("button")
  zoomInBtn.setAttribute("class", "btn btn-outline-primary")
  zoomInBtn.onclick = () => {
    let selected = true
    if (zoomInBtn.classList.contains("active")) {
      selected = false
      zoomInBtn.classList.remove("active")
    } else {
      selected = true
      zoomInBtn.classList.add("active")
    }
    zoomIn(path.tmaCanvas, path.outputCanvas, selected)
  }
  const zoomInIcon = document.createElement("i")
  zoomInIcon.setAttribute("class", "fas fa-search-plus")
  zoomInBtn.appendChild(zoomInIcon)
  zoomInDiv.appendChild(zoomInBtn)
  path.toolsDiv.appendChild(zoomInDiv)
}

