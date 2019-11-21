console.log("path.js loaded")
const urlParams = {}
const loadURLParams = () => {
  window.location.search.slice(1).split('&').forEach(param => {
    const [key, value] = param.split('=')
    urlParams[key] = value
  })
}

const hashParams = {}
const loadHashParams = async () => {
  if (window.location.hash.includes("=")) {
    window.location.hash.slice(1).split('&').forEach(param => {
      let [key, value] = param.split('=')
      value.replace(/['"]+/g, "")
      value = decodeURIComponent(value)
      if (key === "extModules" && (value.indexOf("[") < value.indexOf("]"))) {
        try {
          window.localStorage.extModules = value
          hashParams[key] = eval(value)
        } catch (e) {
          console.warn("The extModules parameter should be either be a URL without quotes or a proper array containing individual URL(s) inside quotes!", e)
          hashParams[key] = value
        }
      } else {
        hashParams[key] = value
      }
    })
  }
  if (hashParams['image'] && hashParams['image'] !== window.localStorage.currentImage) {
    window.localStorage.currentImage = hashParams['image']
    loadDefaultImage()
  }
}

const defaultImg = "images/OFB_023_2_003_1_13_03.jpg"

const utils = {
  request: (url, opts, returnJson = true) => fetch(url, opts).then(res => res.ok ? (returnJson ? res.json() : res) : res).catch(e => console.log(`Error fetching ${url}`, e))
}

const qualityEnum = [{
  "numValue": 1,
  "displayText": "👍"
}, {
  "numValue": 0.5,
  "displayText": "🤞"
}, {
  "numValue": 0,
  "displayText": "👎"
}]

const path = async () => {
  loadURLParams()
  path.root = document.getElementById("tmaPath")
  path.imageDiv = document.getElementById("imageDiv")
  path.tmaCanvas = document.getElementById("tmaCanvas")
  // path.outputCanvas = document.getElementById("outputCanvas")
  path.toolsDiv = document.getElementById("toolsDiv")
  path.tmaImage = new Image()
  path.setupEventListeners()

  await box()

  loadHashParams()
  loadDefaultImage()
  path.loadModules()

  path.getDatasetSubfolders()

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
      modules.forEach(modulePath => loadModule(modulePath))
    } else if (typeof (modules) === "string") {
      loadModule(modules)
    }
  }

  window.onhashchange = () => {
    loadHashParams()
    path.loadModules()
  }
}

path.setupEventListeners = () => {
  document.addEventListener("boxLoggedIn", async (e) => {
    await box.getUserProfile()
    document.getElementById("boxLoginBtn").style = "display: none"
    document.getElementById("filePickers_or").style.display = "block"
    document.getElementById("username").appendChild(document.createTextNode(`Welcome ${window.localStorage.username.split(" ")[0]}!`))
    // await box.makeSelections()
    box.setupFilePicker()
  })

  const fileInput = document.getElementById("imgInput")
  fileInput.onchange = ({
    target: {
      files
    }
  }) => {
    document.getElementById("imgHeader").innerText = files[0].name
    path.tmaImage.setAttribute("src", URL.createObjectURL(files[0]))
    path.tmaImage.setAttribute("crossorigin", "Anonymous")
    document.getElementById("qualitySelect").style.display = "none"
  }

  path.tmaImage.onload = path.loadCanvas
}

const loadDefaultImage = async () => {
  if (hashParams['image'] && await box.isLoggedIn()) {
    const {
      id,
      type,
      name
    } = await box.getData(hashParams['image'], "file")
    if (type === "file" && (name.endsWith(".jpg") || name.endsWith(".jpeg"))) {
      const {
        url
      } = await box.getFileContent(id)
      path.tmaImage.src = url
    }
    // try {
    // } catch (e) {
    //   alert("Image could not be loaded from hash!", e)
    //   path.tmaImage.src = defaultImg
    // }
  } else {
    path.tmaImage.src = defaultImg
  }
}

path.getDatasetSubfolders = async () => {
  const manifest = await box.getData("83472473960", "folder")
  if (manifest && manifest.item_status === "active") {
    path.isBCASTMember = true
    console.log(manifest.item_collection.entries)

  }
}

path.loadCanvas = () => {
  path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width)
  path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
  // path.outputCanvas.setAttribute("width", path.outputCanvas.parentElement.getBoundingClientRect().width)
  // path.outputCanvas.setAttribute("height", path.outputCanvas.width * path.tmaImage.height / path.tmaImage.width)
  // path.outputCanvas.style.border = "1px solid red"
  const tmaContext = path.tmaCanvas.getContext('2d')
  // const outputContext = path.outputCanvas.getContext('2d')
  tmaContext.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
  // outputContext.drawImage(path.tmaImage, 0, 0, path.outputCanvas.width, path.outputCanvas.height)
  if (path.tmaImage.src.includes("boxcloud.com")) {
    showQualitySelectors()
  }
  if (!path.options) {
    path.loadOptions()
  }
}

path.loadOptions = () => {
  path.options = true
  segmentButton()
  zoomInButton()
}

path.qualityAnnotate = async (qualitySelected) => {
  if (await box.isLoggedIn()) {
    const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
    fileMetadata.qualityAnnotations = fileMetadata.qualityAnnotations ? JSON.parse(fileMetadata.qualityAnnotations) : {}

    const newAnnotation = {
      'email': window.localStorage.email,
      'username': window.localStorage.username,
      'value': qualitySelected,
      'createdAt': Date.now()
    }

    const previousAnnotation = fileMetadata.qualityAnnotations[window.localStorage.userId]
    if (previousAnnotation && previousAnnotation.value != newAnnotation.value) {
      const {
        displayText: previousValue
      } = qualityEnum.find(quality => quality.numValue === previousAnnotation.value)
      const {
        displayText: newValue
      } = qualityEnum.find(quality => quality.numValue === newAnnotation.value)
      if (!confirm(`You previously annotated this image to be of ${previousValue} quality. Do you wish to change your annotation to ${newValue} quality?`)) {
        return
      } else {
        fileMetadata.qualityAnnotations[window.localStorage.userId].value = newAnnotation.value
        fileMetadata.qualityAnnotations[window.localStorage.userId].createdAt = Date.now()
      }
    } else if (previousAnnotation && previousAnnotation.value == newAnnotation.value) {
      const {
        displayText: previousValue
      } = qualityEnum.find(quality => quality.numValue === previousAnnotation.value)
      alert(`You've already annotated this image to be of ${previousValue} quality before!`)
      return
    } else {
      fileMetadata.qualityAnnotations[window.localStorage.userId] = newAnnotation
    }

    const path = "/qualityAnnotations"
    const newMetadata = await box.updateMetadata(window.localStorage.currentImage, "file", path, JSON.stringify(fileMetadata.qualityAnnotations))

    window.localStorage.fileMetadata = JSON.stringify(newMetadata)
    console.log(window.localStorage.fileMetadata)
    activateQualitySelector(qualitySelected)
    alert("Image Annotated Successfully!")

  }
}

const segmentButton = () => {
  const segmentDiv = document.createElement("div")
  segmentDiv.setAttribute("title", "Under Development!")
  new Tooltip(segmentDiv, {
    'placement': "bottom",
    'animation': "slideNfade",
    'delay': 150
  })
  const segmentBtn = document.createElement("input")
  segmentBtn.setAttribute("type", "checkbox")
  segmentBtn.setAttribute("disabled", "")
  segmentBtn.onchange = () => watershedSegment(path.tmaCanvas, path.tmaCanvas, segmentBtn.checked)
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
    zoomInHandler(path.tmaCanvas, path.tmaCanvas, selected)
  }
  const zoomInIcon = document.createElement("i")
  zoomInIcon.setAttribute("class", "fas fa-search-plus")
  zoomInBtn.appendChild(zoomInIcon)
  zoomInDiv.appendChild(zoomInBtn)
  path.toolsDiv.appendChild(zoomInDiv)
}

const showQualitySelectors = () => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const qualityAnnotations = fileMetadata.qualityAnnotations && JSON.parse(fileMetadata.qualityAnnotations)

  const qualitySelectDiv = document.getElementById("qualitySelect")
  if (qualitySelectDiv.childElementCount === 1) {
    qualityEnum.forEach((quality) => {
      const {
        numValue,
        displayText
      } = quality
      const qualityButton = document.createElement("button")
      qualityButton.setAttribute("class", "btn btn-outline-info")
      qualityButton.setAttribute("id", `quality_${numValue}`)
      qualityButton.setAttribute("value", numValue)
      qualityButton.setAttribute("onclick", `path.qualityAnnotate(${numValue})`)
      const qualityText = document.createTextNode(displayText)
      qualityButton.appendChild(qualityText)
      qualitySelectDiv.appendChild(qualityButton)
    })
    qualitySelectDiv.style.display = "flex"
  }
  qualityAnnotations && qualityAnnotations[window.localStorage.userId] && activateQualitySelector(qualityAnnotations[window.localStorage.userId].value)
}

const activateQualitySelector = (value) => {
  const qualitySelectDiv = document.getElementById("qualitySelect")
  const currentlyActiveButton = qualitySelectDiv.querySelector("button.active")
  if (currentlyActiveButton) {
    currentlyActiveButton.classList.remove("active")
  }
  qualitySelectDiv.querySelector(`button[value='${value}']`).classList.add("active")
}

window.onload = path