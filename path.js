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
      if (key === "extModules") {
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
    loadImageFromBox(hashParams['image'])
  }
}

const defaultImg = window.location.origin + window.location.pathname + "images/OFB_023_2_003_1_13_03.jpg"

const defaultThumbnailsListLength = 20

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
  window.localStorage.currentImage = ""
  window.localStorage.currentFolder = ""
  window.localStorage.fileMetadata = ""

  await box()
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
    box.getUserProfile()
    // await box.makeSelections()
    path.getDatasetSubfolders()
    box.setupFilePicker()
  })

  const fileInput = document.getElementById("imgInput")
  fileInput.onchange = ({
    target: {
      files
    }
  }) => {
    document.getElementById("imgHeader").innerHTML = `<h5>${files[0].name}</h5>`
    if (hashParams["image"]) {
      window.location.hash = window.location.hash.replace(`image=${hashParams['image']}`, "")
      window.localStorage.currentImage = ""
      window.localStorage.currentFolder = ""
    }
    path.tmaImage.setAttribute("src", "") // Unsetting src because Firefox does not update image otherwise.
    path.tmaImage.setAttribute("src", URL.createObjectURL(files[0]))
    path.tmaImage.setAttribute("crossorigin", "Anonymous")
    document.getElementById("qualitySelect").style.display = "none"
    document.getElementById("thumbnailPicker").style.display = "none"
  }

  path.tmaImage.onload = () => {
    path.loadCanvas()
    if (path.tmaImage.src.includes("boxcloud.com")) {
      showThumbnailPicker(defaultThumbnailsListLength, window.localStorage.currentThumbnailsOffset)
    }
  }
}

const loadDefaultImage = async () => {
  if (!hashParams['image']) {
    path.tmaImage.src = defaultImg
    document.getElementById("imgHeader").innerHTML = `<h5>Test Image</h5>`
  }
}

const loadImageFromBox = async (id, url) => {
  window.localStorage.currentImage = id
  
  if (hashParams['image'] && hashParams['image'] !== id) {
    window.location.hash = window.location.hash.replace(`image=${hashParams['image']}`, `image=${id}`)
  } else if (!hashParams['image']) {
    window.location.hash = window.location.hash ? window.location.hash + `&image=${id}` : `image=${id}`
  }

  if (url) {
    path.tmaImage.setAttribute("src", "")
    path.tmaImage.setAttribute("src", url)
    path.tmaImage.setAttribute("crossorigin", "Anonymous")
  }
  
  const imageData = await box.getData(id, "file")
  if (!imageData) {
    return
  }
  const { type, name, parent, metadata, path_collection: {entries: filePathInBox} } = imageData

  if (type === "file" && (name.endsWith(".jpg") || name.endsWith(".png"))) {
    window.localStorage.currentFolder = parent.id
    path.tmaImage.setAttribute("alt", name)
    if (!url) {
      const fileContent = await box.getFileContent(id)
      url = fileContent.url
      path.tmaImage.setAttribute("src", "")
      path.tmaImage.setAttribute("src", url)
      path.tmaImage.setAttribute("crossorigin", "Anonymous")
    }
    path.tmaImage.setAttribute("alt", name)
    addImageHeader(filePathInBox, id, name)
    
    if (metadata) {
      window.localStorage.fileMetadata = metadata && JSON.stringify(metadata.global.properties)
      showQualitySelectors()
    } else {
      box.createMetadata(id, "file").then(res => {
        window.localStorage.fileMetadata = JSON.stringify(res)
        showQualitySelectors()
      })
    }
  } else {
    alert("The ID in the URL does not point to a valid image file (.jpg/.png) in Box.")
  }
}

const addImageHeader = (filePathInBox, id, name) => {
  const imgHeader = document.getElementById("imgHeader")
  imgHeader.innerHTML = ""
  const folderStructure = document.createElement("ol")
  folderStructure.setAttribute("class", "breadcrumb")
  folderStructure.style.background = "none"
  folderStructure.style.margin = "0 0 0.5rem 0"
  folderStructure.style.padding = 0
  folderStructure.style.whiteSpace = "nowrap"
  folderStructure.style.textOverflow = "ellipsis"
  folderStructure.style.overflow = "hidden"
  filePathInBox.forEach(folder => {
    if (folder.id !== "0") {
      const folderItem = document.createElement("li")
      folderItem.setAttribute("class", "breadcrumb-item")
      const folderLink = document.createElement("a")
      folderLink.setAttribute("href", `${box.appBasePath}/${folder.type}/${folder.id}`)
      folderLink.setAttribute("target", "_blank")
      folderLink.innerText = path.tmaCanvas.parentElement.offsetWidth < 550 ? folder.name.trim().slice(0,7) + "..." : folder.name.trim()
      folderLink.title = folder.name
      folderItem.appendChild(folderLink)
      folderStructure.appendChild(folderItem)
    }
  })
  const fileItem = document.createElement("li")
  fileItem.setAttribute("class", "breadcrumb-item")
  const fileLink = document.createElement("a")
  fileLink.setAttribute("href", `${box.appBasePath}/file/${id}`)
  fileLink.setAttribute("target", "_blank")
  fileLink.innerText = name
  fileItem.appendChild(fileLink)

  folderStructure.appendChild(fileItem)
  imgHeader.appendChild(folderStructure)
}

path.getDatasetSubfolders = async () => {
  const manifest = await box.getData(BCAST_root_folder_id, "folder")
  if (manifest && manifest.item_status === "active") {
    path.isBCASTMember = true
    // document.getElementById("selectMarkersOuterDiv").style.display = "flex"

    // console.log(manifest.item_collection.entries)
    // manifest.item
  }
}

const showLoader = () => {
  const loaderDiv = document.getElementById("loaderDiv")
  const { width, height, top, left } = path.tmaCanvas.getBoundingClientRect()
  loaderDiv.style.width = width
  loaderDiv.style.height = height
  loaderDiv.style.top = top
  loaderDiv.style.left = left
  loaderDiv.style.display = "inline-block";
}

const hideLoader = () => {
  document.getElementById("loaderDiv").style.display = "none";
}

path.loadCanvas = () => {
  console.log("LOADING CANVAS!", )
  if (path.tmaImage.src.length > 0) {
    // if (path.tmaCanvas.parentElement.getBoundingClientRect().width < path.tmaImage.width * 0.4) {
    //   document.getElementById("canvasWithPickers").style.width = path.tmaImage.width*0.4
    // }
    path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width)
    path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
    showLoader()
    // path.outputCanvas.setAttribute("width", path.outputCanvas.parentElement.getBoundingClientRect().width)
    // path.outputCanvas.setAttribute("height", path.outputCanvas.width * path.tmaImage.height / path.tmaImage.width)
    // path.outputCanvas.style.border = "1px solid red"
    const tmaContext = path.tmaCanvas.getContext('2d')
    // const outputContext = path.outputCanvas.getContext('2d')
  
    tmaContext.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
    hideLoader()
    // outputContext.drawImage(path.tmaImage, 0, 0, path.outputCanvas.width, path.outputCanvas.height)
    
    if (!path.options) {
      path.loadOptions()
    }
  }
}

path.loadOptions = () => {
  path.options = true
  document.getElementById("toolsOuterDiv").style.visibility = "visible"
  zoomInButton()
  segmentButton()
  addAnnotationsTooltip()
}

path.qualityAnnotate = async (qualitySelected) => {
  if (await box.isLoggedIn()) {
    const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
    fileMetadata.qualityAnnotations = fileMetadata.qualityAnnotations ? JSON.parse(fileMetadata.qualityAnnotations) : {}

    const newAnnotation = {
      'userId': window.localStorage.userId,
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
  const qualityAnnotationsDiv = document.getElementById("qualityAnnotations")
  const qualitySelectTable = document.getElementById("qualitySelect")
  const qualitySelectTableBody = qualitySelectTable.querySelector("tbody")
  // const qualitySelectorsDiv = document.createElement("div")
  // qualitySelectorsDiv.setAttribute("id", "qualitySelectors")
  // qualitySelectorsDiv.style.display = "flex"
  // qualitySelectorsDiv.style.flexDirection = "column"
  if (qualitySelectTableBody.childElementCount === 0) {
    qualityEnum.forEach((quality) => {
      const {
        numValue,
        displayText
      } = quality
      const qualityTableRow = document.createElement("tr")
      const qualityTableAnnotationData = document.createElement("td")
      const qualityAnnotationSpan = document.createElement("span")
      qualityAnnotationSpan.setAttribute("class", "qualitySelectorSpan")
      qualityAnnotationSpan.style.display = "flex"
      qualityAnnotationSpan.style.flexDirection = "row"
      qualityAnnotationSpan.style.paddingLeft = "0"
      qualityAnnotationSpan.style.flex = "1"
      const qualityButton = document.createElement("button")
      qualityButton.setAttribute("class", "btn btn-outline-info")
      qualityButton.setAttribute("id", `quality_${numValue}`)
      qualityButton.setAttribute("value", numValue)
      qualityButton.setAttribute("onclick", `path.qualityAnnotate(${numValue})`)
      const qualityText = document.createTextNode(displayText)
      qualityButton.appendChild(qualityText)
      qualityAnnotationSpan.appendChild(qualityButton)

      const othersAnnotationsSpan = document.getElementById(`othersAnnotations_quality_${numValue}`) || document.createElement("span")
      othersAnnotationsSpan.setAttribute("id", `othersAnnotations_quality_${numValue}`)
      qualityAnnotationSpan.appendChild(othersAnnotationsSpan)
      qualityTableAnnotationData.appendChild(qualityAnnotationSpan)
      qualityTableRow.appendChild(qualityTableAnnotationData)
      
      const qualityTablePredictionData = document.createElement("td")
      qualityTablePredictionData.setAttribute("align", "center")
      qualityTablePredictionData.style.verticalAlign = "middle"
      const modelQualityPredictions = getModelPrediction(numValue) || "--"
      qualityTablePredictionData.innerHTML = modelQualityPredictions
      qualityTableRow.appendChild(qualityTablePredictionData)
      qualitySelectTableBody.appendChild(qualityTableRow)
    })
  }
  getOthersAnnotations(qualityAnnotations)
  qualityAnnotationsDiv.style.display = "flex"
  qualityAnnotationsDiv.style.border = "1px solid rgba(0,0,0,.125)"
  activateQualitySelector(qualityAnnotations)
}

const getOthersAnnotations = (qualityAnnotations) => {
  qualityEnum.forEach(quality => {
    const { numValue } = quality
    const othersAnnotationsSpan = document.getElementById(`othersAnnotations_quality_${numValue}`)
    othersAnnotationsSpan.innerHTML = ""
    if (qualityAnnotations) {
      const othersAnnotations = Object.values(qualityAnnotations).filter(annotation => annotation && annotation.value === numValue && annotation.userId !== window.localStorage.userId)
      if (othersAnnotations.length > 0) {
        othersAnnotationsSpan.setAttribute("class", "othersAnnotations_quality")
        const othersAnnotationsUsernames = othersAnnotations.map(annotation => annotation.username)
        
        let othersAnnotationsText = `--- &nbsp Selected by ${othersAnnotationsUsernames[0]}`
        othersAnnotationsText += othersAnnotations.length > 1 ? " and " : ""
        if (othersAnnotations.length === 2) {
          othersAnnotationsText += othersAnnotationsUsernames[1]
        }
        const othersAnnotationsTextElement = document.createElement("span")
        othersAnnotationsTextElement.setAttribute("class", "othersAnnotations_quality_text")
        othersAnnotationsTextElement.innerHTML = othersAnnotationsText
        othersAnnotationsSpan.appendChild(othersAnnotationsTextElement)
        if (othersAnnotations.length > 2) {
          const moreNamesElement = document.createElement("u")
          moreNamesElement.setAttribute("id", `moreNamesElement_${numValue}`)
          moreNamesElement.style.color = "cornflowerblue"
          const moreNamesText = document.createTextNode(`${othersAnnotations.length - 1} others`)
          moreNamesElement.appendChild(moreNamesText)
          moreNamesElement.setAttribute("title", othersAnnotationsUsernames.filter((_,ind) => ind !== 0).join("<br/>"))
          new Tooltip(moreNamesElement, {
            'placement': "bottom",
            'animation': "slidenfade",
            'delay': "400",
            'html': true
          })
          othersAnnotationsSpan.appendChild(moreNamesElement)
    
        }
      }
    }
  })
}

const getModelPrediction = (numValue) => {
  return null
}

const activateQualitySelector = (qualityAnnotations) => {
  const qualitySelectTable = document.getElementById("qualitySelect")
  const currentlyActiveButton = qualitySelectTable.querySelector("button.active")
  if (currentlyActiveButton) {
    currentlyActiveButton.classList.remove("active")
  }
  if (qualityAnnotations && qualityAnnotations[window.localStorage.userId]) {
    const userQualityAnnotation = qualityAnnotations[window.localStorage.userId].value
    qualitySelectTable.querySelector(`button[value='${userQualityAnnotation}']`).classList.add("active")
    // qualitySelectTable.
  }
}

const showThumbnailPicker = async (limit, offset=0) => {
  const thumbnailPicker = document.getElementById("thumbnailPicker")
  if (thumbnailPicker.childElementCount === 0 || thumbnailPicker.getAttribute("folder") !== window.localStorage.currentFolder || window.localStorage.currentThumbnailsOffset !== offset) {
    thumbnailPicker.setAttribute("folder", window.localStorage.currentFolder)
    thumbnailPicker.style.display = "flex"
    thumbnailPicker.style["flex-direction"] = "column"
    thumbnailPicker.style.height = path.tmaCanvas.height
    
    window.localStorage.currentThumbnailsOffset = offset
    const { currentFolder } = window.localStorage
    var { total_count, entries: thumbnails } = await box.getFolderContents(currentFolder, limit, offset)
    addThumbnails(thumbnailPicker, thumbnails)
    addThumbnailPageSelector(thumbnailPicker, total_count, limit, offset)
  } else {
    highlightThumbnail(window.localStorage.currentImage)
  }
}

const addThumbnails = (thumbnailPicker, thumbnails) => {
  let thumbnailsListDiv = document.getElementById("thumbnailsList")
  
  if (thumbnailsListDiv) {
    thumbnailPicker.removeChild(thumbnailsListDiv)
    while(thumbnailsListDiv.firstElementChild) {
      thumbnailsListDiv.removeChild(thumbnailsListDiv.firstElementChild)
    }
  } else {
    thumbnailsListDiv = document.createElement("div")
    thumbnailsListDiv.setAttribute("id", "thumbnailsList")
  }
  thumbnailsListDiv.scrollTop = 0
  
  thumbnails.forEach(async (thumbnail) => {
    if (thumbnail.type === "file") {
      const { id: thumbnailId } = thumbnail
      const thumbnailDiv = document.createElement("div")
      const thumbnailImg = document.createElement("img")
      thumbnailImg.setAttribute("id", `thumbnail_${thumbnailId}`)
      thumbnailImg.setAttribute("class", "imagePickerThumbnail")
      if (thumbnailId === window.localStorage.currentImage) {
        thumbnailImg.classList.add("selectedThumbnail")
      }
      thumbnailImg.setAttribute("loading", "lazy")
      thumbnailDiv.appendChild(thumbnailImg)
      thumbnailsListDiv.appendChild(thumbnailDiv)
      thumbnailDiv.onclick = () => selectThumbnail(thumbnailId)
      thumbnailImg.src = await box.getThumbnail(thumbnailId)
    }
  })
  
  thumbnailPicker.insertBefore(thumbnailsListDiv, thumbnailPicker.firstElementChild)
}

const addThumbnailPageSelector = (thumbnailPicker, totalCount, limit, offset) => {
  const currentPageNum = Math.floor(offset / limit) + 1
  const totalPages = Math.floor(totalCount / limit) + 1
  const thumbnailPageSelector = document.getElementById("thumbnailPageSelector")
  if (!thumbnailPageSelector) {
    const thumbnailPageNumSpan = document.createElement("span")
    thumbnailPageNumSpan.setAttribute("id", "thumbnailPageSelector")
  
    const thumbnailPrevPageBtn = document.createElement("button")
    thumbnailPrevPageBtn.setAttribute("class", "btn btn-sm btn-light")
    if (currentPageNum === 1) {
      thumbnailPrevPageBtn.setAttribute("disabled", "")
    }
    const prevBtnText = document.createTextNode("<")
    thumbnailPrevPageBtn.style["font-size"] = "9px"
    thumbnailPrevPageBtn.style["margin-right"] = "0.18rem"
    thumbnailPrevPageBtn.style["padding"] = "0.2rem 0.3rem 0.2rem 0.3rem"
    thumbnailPrevPageBtn.appendChild(prevBtnText)
  
    const thumbnailCurrentPageText = document.createElement("input")
    thumbnailCurrentPageText.setAttribute("id", "thumbnailPageSelector_currentPage")
    thumbnailCurrentPageText.setAttribute("type", "number")
    thumbnailCurrentPageText.setAttribute("min", "1")
    thumbnailCurrentPageText.setAttribute("max", totalPages)
    thumbnailCurrentPageText.setAttribute("value", currentPageNum)
    thumbnailCurrentPageText.style.width = "35px";
  
    const outOfTotalPagesText = document.createElement("span")
    outOfTotalPagesText.setAttribute("id", "thumbnailPageSelector_totalPages")
    outOfTotalPagesText.innerText = ` / ${totalPages}`
    
    const thumbnailNextPageBtn = document.createElement("button")
    thumbnailNextPageBtn.setAttribute("class", "btn btn-sm btn-light")
    if (currentPageNum === totalPages) {
      thumbnailNextPageBtn.setAttribute("disabled", "")
    }
  
    const nextBtnText = document.createTextNode(">")
    thumbnailNextPageBtn.style["font-size"] = "9px"
    thumbnailNextPageBtn.style["margin-left"] = "0.18rem"
    thumbnailNextPageBtn.style["padding"] = "0.2rem 0.3rem 0.2rem 0.3rem"
    thumbnailNextPageBtn.appendChild(nextBtnText)
  
    thumbnailPrevPageBtn.onclick = (e) => {
      thumbnailCurrentPageText.stepDown()
      thumbnailCurrentPageText.dispatchEvent(new Event("change"))
    }
    thumbnailNextPageBtn.onclick = (e) => {
      thumbnailCurrentPageText.stepUp()
      thumbnailCurrentPageText.dispatchEvent(new Event("change"))
    }
    
    thumbnailCurrentPageText.onchange = ({target: {value}}) => {
      value = parseInt(value)
      changeThumbnails(value)
    }
    
    thumbnailPageNumSpan.appendChild(thumbnailPrevPageBtn)
    thumbnailPageNumSpan.appendChild(thumbnailCurrentPageText)
    thumbnailPageNumSpan.appendChild(outOfTotalPagesText)
    thumbnailPageNumSpan.appendChild(thumbnailNextPageBtn)
    
    thumbnailPicker.appendChild(thumbnailPageNumSpan)
  } else {
    const thumbnailCurrentPageText = document.getElementById("thumbnailPageSelector_currentPage")
    thumbnailCurrentPageText.setAttribute("max", totalPages)
    const outOfTotalPagesText = document.getElementById("thumbnailPageSelector_totalPages")
    thumbnailCurrentPageText.value = currentPageNum
    outOfTotalPagesText.innerText = ` / ${totalPages}`
    checkAndDisableButtons(currentPageNum, totalPages)
  }
  const changeThumbnails = (value) => {
    if (1 <= value && value <= totalPages) {
      checkAndDisableButtons(value, totalPages)
      showThumbnailPicker(defaultThumbnailsListLength, (value - 1)*defaultThumbnailsListLength)
    }
  }
}

const checkAndDisableButtons = (pageNum, totalPages) => {
  const [ thumbnailPrevPageBtn, thumbnailNextPageBtn ] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  if (pageNum === 1) {
    thumbnailPrevPageBtn.setAttribute("disabled", "")
    thumbnailNextPageBtn.removeAttribute("disabled")
  } else if (pageNum === totalPages) {
    thumbnailNextPageBtn.setAttribute("disabled", "")
    thumbnailPrevPageBtn.removeAttribute("disabled")
  } else {
    thumbnailPrevPageBtn.removeAttribute("disabled")
    thumbnailNextPageBtn.removeAttribute("disabled")
  }
}

const selectThumbnail = (id) => {
  if (id !== hashParams['image']) {
    showLoader()
    loadImageFromBox(id)
  }
}

const highlightThumbnail = (id) => {
  const prevSelectedThumbnail = document.getElementsByClassName("selectedThumbnail")
  if (prevSelectedThumbnail.length > 0) {
    prevSelectedThumbnail[0].classList.remove("selectedThumbnail")
  }
  const thumbnailToSelect = document.getElementById(`thumbnail_${id}`)
  if (thumbnailToSelect){
    thumbnailToSelect .classList.add("selectedThumbnail")
  }
}

const startCollaboration = () => {
  const collaborateBtn = document.getElementById("collaborateBtn")
  if (collaborateBtn.classList.contains("active")) {
    collaborateBtn.classList.remove("active")
    collaborateBtn.classList.remove("btn-danger")
    collaborateBtn.classList.add("btn-success")
    collaborateBtn.innerHTML = "Start Session!"
  } else {
    collaborateBtn.classList.remove("btn-success")
    collaborateBtn.classList.add("btn-danger")
    collaborateBtn.classList.add("active")
    collaborateBtn.innerHTML = "End Session"
  }
  TogetherJS(this)
  return false
}

const addAnnotationsTooltip = () => {
  const addAnnotationsBtn = document.getElementById("addAnnotationsBtn")
  addAnnotationsBtn.setAttribute("title", "Under Development!")
  new Tooltip(addAnnotationsBtn, {
    'placement': "bottom",
    'animation': "slideNfade",
    'delay': 150
  })
}

window.onload = path
window.onresize = () => path.loadCanvas()