console.log("path.js loaded")
const urlParams = {}
const loadURLParams = () => {
  window.location.search.slice(1).split('&').forEach(param => {
    const [key, value] = param.split('=')
    urlParams[key] = value
  })
}

const hashParams = {}
const loadHashParams = () => {
  if (window.location.hash.includes("=")) {
    window.location.hash.slice(1).split('&').forEach(param => {
      let [key, value] = param.split('=')
      value.replace(/['"]+/g, "")
      value = decodeURIComponent(value)
      if (key === "extModules" && (value.indexOf("[") < value.indexOf("]")) ){
        try {
          hashParams[key] = eval(value)
        } catch (e) {
          console.warn("The extModules parameter should be either be a URL without quotes or a proper array containing URL(s) each inside quotes!", e)
          hashParams[key] = value
        }
      } else {
        hashParams[key] = value
      }
    })
  }
}

const defaultImg = "images/OFB_023_2_003_1_13_03.jpg"

const utils = {
  request: (url, opts) => fetch(url, opts)
  .then(res => res.json())
  .catch(e => console.error(`Error fetching ${url}`, e)),
}

const path = async () => {
  loadURLParams()
  loadHashParams()
  path.loadModules()
  path.root = document.getElementById("tmaPath")
  path.imageDiv = document.getElementById("imageDiv")
  path.tmaCanvas = document.getElementById("tmaCanvas")
  path.outputCanvas = document.getElementById("outputCanvas")
  path.toolsDiv = document.getElementById("toolsDiv")
  path.tmaImage = new Image()
  path.tmaImage.src = defaultImg
  path.setupEventListeners()
  
  await box()
  path.getManifest()
  
}

path.loadModules = async (modules) => {
  modules = modules || hashParams["extModules"]
  
  const loadModule = (modulePath) => {
    console.log(`Loading external module at ${modulePath}`)
    const scriptElement = document.createElement('script')
    scriptElement.src = modulePath
    scriptElement.async = ""
    scriptElement.type = "text/javascript"
    document.head.appendChild(scriptElement)
  }
  
  if (modules) {
    if (Array.isArray(modules)) {
      modules.forEach(modulePath => loadModule(modulePath) )
    } else if (typeof(modules) === "string") {
      loadModule(modules)
    }
  }
  
  window.onhashchange = () => {
    loadHashParams()
    path.loadModules()
  }
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

path.getManifest = async () => {
  const manifest = await box.getData("83472473960", "folder")
  console.log(manifest)
}

path.loadCanvas = () => {
  path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width)
  path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
  path.outputCanvas.setAttribute("width", path.outputCanvas.parentElement.getBoundingClientRect().width)
  path.outputCanvas.setAttribute("height", path.outputCanvas.width * path.tmaImage.height / path.tmaImage.width)
  path.outputCanvas.style.border = "1px solid red"
  const tmaContext = path.tmaCanvas.getContext('2d')
  const outputContext = path.outputCanvas.getContext('2d')
  tmaContext.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
  outputContext.drawImage(path.tmaImage, 0, 0, path.outputCanvas.width, path.outputCanvas.height)
  if (!path.options) {
    path.loadOptions()
  }
}

path.loadOptions = () => {
  path.options = true
  segmentButton()
  zoomInButton()
}

const segmentButton = () => {
  const segmentDiv = document.createElement("div")
  const segmentBtn = document.createElement("input")
  segmentBtn.setAttribute("type", "checkbox")
  // segmentBtn.setAttribute("class", "checkbox")
  segmentBtn.onchange = () => watershedSegment(path.tmaCanvas, path.outputCanvas, segmentBtn.checked)
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
  zoomInBtn.setAttribute("title", "Zoom In")
  zoomInBtn.onclick = () => {
    let selected = true
    if (zoomInBtn.classList.contains("active")) {
      selected = false
      zoomInBtn.classList.remove("active")
    } else {
      selected = true
      zoomInBtn.classList.add("active")
    }
    zoomInHandler(path.tmaCanvas, path.outputCanvas, selected)
  }
  const zoomInIcon = document.createElement("i")
  zoomInIcon.setAttribute("class", "fas fa-search-plus")
  zoomInBtn.appendChild(zoomInIcon)
  zoomInDiv.appendChild(zoomInBtn)
  path.toolsDiv.appendChild(zoomInDiv)
}

window.onload = path