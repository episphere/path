console.log("path.js loaded")
const urlParams = {}
const BCAST_root_folder_id = "83472473960"
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
    loadImageFromBox(hashParams['image'])
  }
}

const defaultImg = "images/OFB_023_2_003_1_13_03.jpg"

const utils = {
  request: (url, opts, returnJson = true) => 
    fetch(url, opts)
    .then(res => res.ok ? (returnJson ? res.json() : res) : res)
    .catch(e => console.log(`Error fetching ${url}`, e))
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
  await path.getDatasetSubfolders()

  loadHashParams()
  loadDefaultImage()
  path.loadModules()

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
    document.getElementById("filePickers_or_box").style.display = "block"
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
    if (hashParams["image"]) {
      window.location.hash = window.location.hash.replace(`image=${hashParams['image']}`, "")
      window.localStorage.currentImage = ""
      window.localStorage.currentFolder = ""
    }
    path.tmaImage.setAttribute("src", URL.createObjectURL(files[0]))
    path.tmaImage.setAttribute("crossorigin", "Anonymous")
    document.getElementById("qualitySelect").style.display = "none"
    document.getElementById("imagePicker").style.display = "none"
  }

  path.tmaImage.onload = path.loadCanvas
}

const loadDefaultImage = async () => {
  if (!hashParams['image']) {
    path.tmaImage.src = defaultImg
    document.getElementById("imgHeader").innerText = "Test Image"
  } else {
    loadImageFromBox(hashParams['image'])
  }
}

const loadImageFromBox = async (id) => {
    const {
      type,
      name,
      parent,
      metadata
    } = await box.getData(id, "file")
    
    if (!metadata) {
      box.createMetadata(id, "file").then(res => {
        window.localStorage.fileMetadata = JSON.stringify(res)
        showQualitySelectors()
      })
    }
    
    if (type === "file" && (name.endsWith(".jpg") || name.endsWith(".png"))) {
      window.localStorage.currentFolder = parent.id
      window.localStorage.fileMetadata = metadata && JSON.stringify(metadata.global.properties)
      path.tmaImage.alt = name
      const {
        url
      } = await box.getFileContent(id)
      path.tmaImage.src = url
      document.getElementById("imgHeader").innerText = name      
      return
    } else {
      alert("The ID in the URL does not point to a valid image file in Box.")
    }
}

path.getDatasetSubfolders = async () => {
  const manifest = await box.getData(BCAST_root_folder_id, "folder")
  if (manifest && manifest.item_status === "active") {
    path.isBCASTMember = true
    // document.getElementById("selectMarkersOuterDiv").style.display = "flex"
    
    console.log(manifest.item_collection.entries)
    // manifest.item
  }
}

path.loadCanvas = () => {
  console.log("LOADING CAVAS")
  // if (path.tmaCanvas.parentElement.getBoundingClientRect().width < path.tmaImage.width * 0.4) {
  //   document.getElementById("canvasWithPickers").style.width = path.tmaImage.width*0.4
  // }
  path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width*0.9)
  path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
  // path.outputCanvas.setAttribute("width", path.outputCanvas.parentElement.getBoundingClientRect().width)
  // path.outputCanvas.setAttribute("height", path.outputCanvas.width * path.tmaImage.height / path.tmaImage.width)
  // path.outputCanvas.style.border = "1px solid red"
  const tmaContext = path.tmaCanvas.getContext('2d')
  // const outputContext = path.outputCanvas.getContext('2d')

  tmaContext.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
  // outputContext.drawImage(path.tmaImage, 0, 0, path.outputCanvas.width, path.outputCanvas.height)
  if (path.tmaImage.src.includes("boxcloud.com")) {
    document.getElementById("canvasWithPickers").style["border-right"] = "1px solid lightgray"
    // console.log("CALLED!!!")
    showThumbnailPicker(20,0)
    showQualitySelectors()
  }
  if (!path.options) {
    path.loadOptions()
  }
}

path.loadOptions = () => {
  path.options = true
  document.getElementById("toolsOuterDiv").style.visibility = "visible"
  zoomInButton()
  segmentButton()
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
    activateQualitySelector(JSON.parse(newMetadata.qualityAnnotations))
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
  const segmentBtn = document.createElement("button")
  segmentBtn.setAttribute("class", "btn btn-outline-primary")
  segmentBtn.setAttribute("disabled", "")
  const segmentIcon = document.createElement("i")
  segmentIcon.setAttribute("class", "fas fa-qrcode")
  segmentBtn.onchange = () => watershedSegment(path.tmaCanvas, path.tmaCanvas, segmentBtn.checked)
  // const segmentLabel = document.createElement("label")
  // segmentLabel.appendChild(document.createTextNode(`Segment Image`))
  segmentBtn.appendChild(segmentIcon)
  segmentDiv.appendChild(segmentBtn)
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
  qualitySelectDiv.style.display = "flex"
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
  }
    qualitySelectDiv.style.display = "flex"
    activateQualitySelector(qualityAnnotations)
}

const showThumbnailPicker = async (limit, offset) => {
  const thumbnailPicker = document.getElementById("thumbnailPicker")
  if (thumbnailPicker.childElementCount === 0) {
    const { currentFolder } = window.localStorage
    const { entries: thumbnails } = await box.getFolderContents(currentFolder, limit, offset)
    thumbnailPicker.style.display = "flex"
    thumbnailPicker.style["flex-direction"] = "column"
    thumbnailPicker.style.height = path.tmaCanvas.height
    thumbnails.forEach(async (thumbnail) => {
      if (thumbnail.type === "file") {
        const { id: thumbnailId } = thumbnail
        const thumbnailDiv = document.createElement("div")
        const thumbnailImg = document.createElement("img")
        thumbnailImg.setAttribute("class", "imagePickerThumbnail")
        thumbnailImg.setAttribute("loading", "lazy")
        thumbnailDiv.appendChild(thumbnailImg)
        thumbnailPicker.appendChild(thumbnailDiv)
        thumbnailDiv.onclick = () => {
          if (hashParams['image']) {
            window.location.hash = window.location.hash.replace(`image=${hashParams['image']}`, `image=${thumbnailId}`)
          } else {
            window.location.hash = window.location.hash ? window.location.hash + `&image=${thumbnailId}` : `image=${thumbnailId}`
          }
        }
        thumbnailImg.src = await box.getThumbnail(thumbnailId)
      }
    })
  }
}

const activateQualitySelector = (qualityAnnotations) => {
  const qualitySelectDiv = document.getElementById("qualitySelect")
  const currentlyActiveButton = qualitySelectDiv.querySelector("button.active")
  if (currentlyActiveButton) {
    currentlyActiveButton.classList.remove("active")
  }
  if (qualityAnnotations && qualityAnnotations[window.localStorage.userId]) {
    const userQualityAnnotation = qualityAnnotations[window.localStorage.userId].value
    qualitySelectDiv.querySelector(`button[value='${userQualityAnnotation}']`).classList.add("active")
  }
}

window.onload = path
window.onresize = path.loadCanvas