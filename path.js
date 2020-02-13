const boxRootFolderId = "0"
var currentThumbnailsList = []

const urlParams = {}
const loadURLParams = () => {
  window.location.search.slice(1).split('&').forEach(param => {
    const [key, value] = param.split('=')
    urlParams[key] = value
  })
}

var hashParams
const loadHashParams = async () => {
  hashParams = {} 
  if (window.location.hash.includes("=")) {
    window.location.hash.slice(1).split('&').forEach(param => {
      let [key, value] = param.split('=')
      value = value.replace(/['"]+/g, "") // for when the hash parameter contains quotes.
      value = decodeURIComponent(value)
      if (key === "extModules") {
        try {
          window.localStorage.extModules = value
          hashParams[key] = eval(value) // for when the extModules parameter is an array/object.
        } catch (e) {  // If eval doesn't work, just add the value as a string.
          console.warn("The extModules parameter should be either be a URL without quotes or a proper array containing individual URL(s) inside quotes!", e)
          hashParams[key] = value
        }
      } else {
        hashParams[key] = value
      }
    })
  }
  window.localStorage.hashParams = JSON.stringify(hashParams)
  if (hashParams["extModules"]) {
    path.loadModules()
  }
  if (hashParams.image && hashParams.image !== window.localStorage.currentImage) {
    await loadImageFromBox(hashParams.image)
  }
  if (hashParams.folder) {
    window.localStorage.currentFolder = hashParams.folder
    window.localStorage.allFilesInFolder[hashParams.folder] = {}
    loadBoxFileManager(hashParams.folder)
  } else if (!hashParams.folder && await box.isLoggedIn()) {
    selectFolder(boxRootFolderId)
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

const annotationTypes = [ "tissueAdequacy", "stainingAdequacy" ]

const qualityEnum = [{
  "label": "O",
  "displayText": "👍",
  "tooltip": "Satisfactory"
}, {
  "label": "M",
  "displayText": "🤞",
  "tooltip": "Suboptimal"
}, {
  "label": "S",
  "displayText": "👎",
  "tooltip": "Unsatisfactory"
}]

const path = async () => {
  window.localStorage.currentImage = ""
  window.localStorage.currentFolder = ""
  window.localStorage.allFilesInFolder = window.localStorage.allFilesInFolder || JSON.stringify({})
  window.localStorage.currentThumbnailsOffset = window.localStorage.currentThumbnailsOffset || "0"
  window.localStorage.fileMetadata = JSON.stringify({})

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
}

path.setupEventListeners = () => {
  document.addEventListener("boxLoggedIn", async (e) => {
    box.getUserProfile()
  })
  
  
  const fileInput = document.getElementById("imgInput")
  fileInput.onchange = ({
    target: {
      files
    }
  }) => {
    document.getElementById("imgHeader").innerHTML = `<h5>${files[0].name}</h5>`
    if (hashParams.image) {
      window.location.hash = window.location.hash.replace(`image=${hashParams.image}`, "")
      hashParams.image = ""
      window.localStorage.currentFolder = ""
    }
    path.tmaImage.setAttribute("src", "") // Unsetting src because Firefox does not update image otherwise.
    path.tmaImage.setAttribute("src", URL.createObjectURL(files[0]))
    path.tmaImage.setAttribute("crossorigin", "Anonymous")
    document.getElementById("annotations").style.display = "none"
    document.getElementById("thumbnailPicker").style.display = "none"
  }

  path.tmaImage.onload = async () => {
    path.loadCanvas()
    if (path.tmaImage.src.includes("boxcloud.com")) {
      await showThumbnailPicker(defaultThumbnailsListLength, window.localStorage.currentThumbnailsOffset)
      showNextImageButton()
    }
  }
}

const loadDefaultImage = async () => {
  if (!hashParams.image || !await box.isLoggedIn()) {
    path.tmaImage.src = defaultImg
    document.getElementById("imgHeader").innerHTML = `<h5>Test Image</h5>`
  }
}

const loadImageFromBox = async (id, url) => {
  if (await utils.boxRequest) {
    const imageData = await box.getData(id, "file") || {}
    if (imageData.status === 404) {
      console.log(`Can't fetch data for image ID ${id} from Box`)
      alert("The image ID in the URL does not point to a file in Box!")
      selectImage()
      loadDefaultImage()
      return
    }
    
    const { type, name, parent, metadata, path_collection: {entries: filePathInBox} } = imageData
  
    if (type === "file" && (name.endsWith(".jpg") || name.endsWith(".png"))) {
      showLoader("imgLoaderDiv", path.tmaCanvas)
      const allFilesInFolderObj = JSON.parse(window.localStorage.allFilesInFolder) || {}
      allFilesInFolderObj[parent.id] = parent.id in allFilesInFolderObj && allFilesInFolderObj[parent.id].length > 0 ? allFilesInFolderObj[parent.id] : []
      window.localStorage.allFilesInFolder = JSON.stringify(allFilesInFolderObj)
      window.localStorage.currentThumbnailsFolder = parent.id

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
      window.localStorage.currentImage = id
      
      if (metadata) {
        window.localStorage.fileMetadata = metadata && JSON.stringify(metadata.global.properties)
      } else {
        box.createMetadata(id, "file").then(res => {
          window.localStorage.fileMetadata = JSON.stringify(res)
        })
      }
      
      highlightThumbnail(id)
      if(!hashParams.folder) {
        selectFolder(parent.id)
      }
      highlightInBoxFileMgr(id)
    } else {
      alert("The ID in the URL does not point to a valid image file (.jpg/.png) in Box.")
    }
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

const loadBoxFileManager = async (id=boxRootFolderId) => {
  const boxFileMgrHeaderDiv = document.getElementById("boxFileMgrHeader")
  const [fileMgrTools, fileMgrNav] = boxFileMgrHeaderDiv.children
  fileMgrTools.style.display = "flex"
  fileMgrTools.style["flex-direction"] = "row"
  fileMgrTools.style.margin = "auto 0"

  const folderData = await box.getData(id, "folder")
  if (folderData) {
    let backBtnSpan = document.getElementById("fileMgrBackBtn") 
    if (!backBtnSpan) {
      backBtnSpan = document.createElement("span")
      backBtnSpan.setAttribute("id", "fileMgrBackBtn")
      backBtnSpan.setAttribute("class", "boxFileMgrHeaderBtn")
      const backButton = 
        `<button type="button" class="btn" style="background-color: rgba(255, 255, 255); border: 1px solid lightgray;">
          <i style="font-size:25px; color: royalblue;" class="fas fa-caret-left"></i>
        </button>`
      backBtnSpan.innerHTML = backButton
      fileMgrTools.appendChild(backBtnSpan)
    }
    backBtnSpan.onclick = id === boxRootFolderId ? () => {} : (e) => {
      console.log(folderData.path_collection.entries)
      selectFolder(folderData.path_collection.entries[folderData.path_collection.entries.length - 1].id)
    }
    
    let homeBtnSpan = document.getElementById("fileMgrHomeBtn")
    if (!homeBtnSpan) {
      homeBtnSpan = document.createElement("span")
      homeBtnSpan.setAttribute("id", "fileMgrHomeBtn")
      homeBtnSpan.setAttribute("class", "boxFileMgrHeaderBtn")
      const homeButton = 
        `<button type="button" class="btn" style="background-color: rgba(255, 255, 255); border: 1px solid lightgray;">
          <i style="font-size:25px; color: royalblue;" class="fas fa-home"></i>
        </button>`
      homeBtnSpan.innerHTML = homeButton
      fileMgrTools.appendChild(homeBtnSpan)
    }
    homeBtnSpan.onclick = id === boxRootFolderId ? () => {} : (e) => {
      selectFolder(boxRootFolderId)
    }

    fileMgrNav.setAttribute("id", "boxFileMgrNav")
    fileMgrNav.style.width = "100%"
    fileMgrNav.style.margin = "auto 15%"
    // fileMgrNav.style["text-align"] = "center"
    fileMgrNav.innerHTML = 
      `<strong style="font-size: 18px;">
        <a href="${box.appBasePath}/${folderData.type}/${folderData.id}" target="_blank">
          ${folderData.name}
        </a>
      </strong>`

    boxFileMgrHeaderDiv.style.height = "4rem";
    boxFileMgrHeaderDiv.style["background-color"] = "rgba(210, 210, 210, 0.2)";
    if (!boxFileMgrHeaderDiv.parentElement.querySelector("hr")) {
      boxFileMgrHeaderDiv.parentElement.insertBefore(document.createElement("hr"), boxFileMgrHeaderDiv.nextElementSibling)

    }
  
    loadBoxFolderTree(folderData)

  } else if (folderData.status === 404) {
    alert("The folder ID in the URL does not point to a valid folder in your Box account!")
    selectFolder(boxRootFolderId)
  }

  // const forwardBtnSpan = document.getElementById("fileMgrForwardBtn") || document.createElement("span")
  // forwardBtnSpan.setAttribute("id", "fileMgrForwardBtn")
  // forwardBtnSpan.setAttribute("class", "boxFileMgrBtn")
  // const forwardButton = 
  //   `<button type="button" class="btn btn-light">
  //     <i class="fas fa-caret-right"></i>
  //   </button>`
  // forwardBtnSpan.innerHTML = forwardButton
}

const loadBoxFolderTree = (folderData) => {
  const { id } = folderData
  const loaderElementId = "fileMgrLoaderDiv"
  if (folderData && folderData.item_status === "active") {
    const { item_collection: { entries }} = folderData
    const parentElement = document.getElementById("boxFolderTree")
    if (entries.length !== 0) {
      if (parentElement.childElementCount > 0) {
        const overlayOn = document.getElementById("boxFolderTree")
        showLoader(loaderElementId, overlayOn)
      }
      parentElement.firstChild && parentElement.removeChild(parentElement.firstChild)
      const folderSubDiv = populateBoxfolderTree(entries, id)
      parentElement.style.height = path.tmaCanvas.height > window.innerHeight - parentElement.getBoundingClientRect().y - (16 * 4) ? path.tmaCanvas.height - (16 * 4) : window.innerHeight - parentElement.getBoundingClientRect().y - (16 * 4)
      // folderSubDiv.style.border = "1px solid lightgray"
      // folderSubDiv.style.backgroundColor = "rgba(200, 200, 200, 0.1)"
      folderSubDiv.style.height = "100%"
      folderSubDiv.style.width = "100%"
      folderSubDiv.style.overflowY = "scroll"
      parentElement.appendChild(folderSubDiv)
    } else if (entries.length === 0) {
      parentElement.style.textAlign = "center"
      parentElement.innerText = "-- Empty Folder --"
    }
  }
  hideLoader(loaderElementId)
}

const populateBoxfolderTree = (entries, id) => {
  const currentFolderDiv = document.createElement("div")
  currentFolderDiv.setAttribute("class", `boxFileMgr_folderTree`)
  currentFolderDiv.setAttribute("id", `boxFileMgr_folderTree_${id}`)
  entries.forEach(entry => {
    const entryBtnDiv = document.createElement("div")
    entryBtnDiv.setAttribute("id", `boxFileMgr_subFolder_${entry.id}`)
    entryBtnDiv.setAttribute("class", `boxFileMgr_subFolder`)
    const entryBtn = document.createElement("button")
    entryBtn.setAttribute("class", "btn btn-link")
    entryBtn.setAttribute("type", "button")
    const entryIcon = document.createElement("i")
    if (entry.type === "folder") {
      entryIcon.setAttribute("class", "fas fa-folder")
    } else if (entry.type === "file") {
      if (entry.name.endsWith(".jpg") || entry.name.endsWith(".jpeg") || entry.name.endsWith(".png")) {
        entryIcon.setAttribute("class", "fas fa-file-image")
      } else {
        entryIcon.setAttribute("class", "fas fa-file")
      }
      if (entry.id === hashParams.image) {
        entryBtnDiv.classList.add("selectedImage")
      }
    }
    entryIcon.innerHTML = "&nbsp&nbsp"
    entryBtn.appendChild(entryIcon)
    entryBtn.innerHTML += entry.name
    // const loaderImage = document.createElement("img")
    // loaderImage.setAttribute("src", `${window.location.origin}${window.location.pathname}/images/loader_sm.gif`)
    // loaderImage.setAttribute("class", "boxFileMgr_loader")
    // entryBtnSubfolders.appendChild(loaderImage)
    // entryBtnSubfolders.style.display = "none"
    // entryBtnDiv.appendChild(entryBtnSubfolders)
    entryBtnDiv.appendChild(entryBtn)
    entryBtnDiv.appendChild(document.createElement("hr"))

    entryBtn.onclick = async () => {
      if (entry.type === "folder") {
        selectFolder(entry.id)
      } else if (entry.type === "file" && (entry.name.endsWith(".jpg") || entry.name.endsWith(".png"))) {
        if (entry.id !== hashParams.image) {
          selectImage(entry.id)
          highlightInBoxFileMgr(entry.id)
        }
      }
    }
    // const folderTree = document.createElement("div")
    // folderTree.setAttribute("class", `boxFileMgr_folderTree_${id}`)
    currentFolderDiv.appendChild(entryBtnDiv)
  })
  // currentFolderDiv.appendChild(folderTree)
  return currentFolderDiv
}

const highlightInBoxFileMgr = (id) => {
  const previouslySelectedImage = document.getElementById("boxFileManager").querySelector("div.selectedImage")
  const newlySelectedImage = document.getElementById(`boxFileMgr_subFolder_${id}`)
  if (previouslySelectedImage) {
    previouslySelectedImage.classList.remove("selectedImage")
  }
  if (newlySelectedImage) {
    newlySelectedImage.classList.add("selectedImage")
  }
 
}

const showLoader = (id, overlayOnElement) => {
  const loaderDiv = document.getElementById(id)
  const { width, height } = overlayOnElement.getBoundingClientRect()
  loaderDiv.style.width = width
  loaderDiv.style.height = height
  loaderDiv.style.display = "inline-block";
}

const hideLoader = (id) => {
  document.getElementById(id).style.display = "none";
}

path.loadCanvas = () => {

  if (path.tmaImage.src.length > 0) {
    // if (path.tmaCanvas.parentElement.getBoundingClientRect().width < path.tmaImage.width * 0.4) {
    //   document.getElementById("canvasWithPickers").style.width = path.tmaImage.width*0.4
    // }
    path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width)
    path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
    // showLoader()
    // path.outputCanvas.setAttribute("width", path.outputCanvas.parentElement.getBoundingClientRect().width)
    // path.outputCanvas.setAttribute("height", path.outputCanvas.width * path.tmaImage.height / path.tmaImage.width)
    // path.outputCanvas.style.border = "1px solid red"
    const tmaContext = path.tmaCanvas.getContext('2d')
    // const outputContext = path.outputCanvas.getContext('2d')
    tmaContext.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
    hideLoader("imgLoaderDiv")
    // outputContext.drawImage(path.tmaImage, 0, 0, path.outputCanvas.width, path.outputCanvas.height)
    document.getElementById("canvasWithPickers").style.borderRight = "1px solid lightgray"
    if (!path.options) {
      path.loadOptions()
    }
    if (path.tmaImage.src.includes("boxcloud.com")) {
      annotationTypes.forEach(showQualitySelectors)
    }
  }
}

path.loadOptions = () => {
  path.options = true
  document.getElementById("toolsOuterDiv").style.visibility = "visible"
  zoomButton()
  segmentButton()
  addAnnotationsTooltip()
}

path.qualityAnnotate = async (annotationType, qualitySelected) => {
  if (await box.isLoggedIn()) {
    const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
    const annotations = fileMetadata[`${annotationType}_annotations`] ? JSON.parse(fileMetadata[`${annotationType}_annotations`]) : {}

    const newAnnotation = {
      'userId': window.localStorage.userId,
      'email': window.localStorage.email,
      'username': window.localStorage.username,
      'value': qualitySelected,
      'createdAt': Date.now()
    }

    const previousAnnotation = annotations[window.localStorage.userId]
    if (previousAnnotation && previousAnnotation.value != newAnnotation.value) {
      const {
        displayText: previousValue
      } = qualityEnum.find(quality => quality.label === previousAnnotation.value)
      const {
        displayText: newValue
      } = qualityEnum.find(quality => quality.label === newAnnotation.value)
      if (!confirm(`You previously annotated this image to be of ${previousValue} quality. Do you wish to change your annotation to ${newValue} quality?`)) {
        return
      } else {
        annotations[window.localStorage.userId].value = newAnnotation.value
        annotations[window.localStorage.userId].createdAt = Date.now()
      }
    } else if (previousAnnotation && previousAnnotation.value == newAnnotation.value) {
      return
    } else {
      annotations[window.localStorage.userId] = newAnnotation
    }
    const path = `/${annotationType}_annotations`
    const newMetadata = await box.updateMetadata(hashParams.image, "file", path, JSON.stringify(annotations))
    
    if (!newMetadata.status) { // status is returned only on error, check for errors properly later
      window.localStorage.fileMetadata = JSON.stringify(newMetadata)
      activateQualitySelector(annotationType, annotations)
      showToast(`Annotation Successful!`)
      borderByAnnotations(hashParams.image, newMetadata)
      showNextImageButton(newMetadata)
    } else {
      showToast("Error occurred during annotation, please try again later!")
    }
  }
}

const showNextImageButton = (metadata) => {
  metadata = metadata || JSON.parse(window.localStorage.fileMetadata)
  const numAnnotationsCompleted = Object.keys(metadata).reduce((total, key) => {
    if (key.includes("_annotations")) {
      const annotationMade = JSON.parse(metadata[key])
      if (annotationTypes.includes(key.split("_annotations")[0]) && window.localStorage.userId in annotationMade) {
        total += 1
      }
    }
    return total
  }, 0)

  const nextImageMessage = document.getElementById("nextImageMessage")
  const nextImageText = `<b style='padding-bottom:.75rem;'><span style='color:darkorchid'>${numAnnotationsCompleted}</span> / ${annotationTypes.length} Annotations Completed!</b>`
  nextImageMessage.innerHTML = nextImageText

  const nextImageButton = document.getElementById("nextImageBtn") || document.createElement("button")
  nextImageButton.setAttribute("type", "button")
  nextImageButton.setAttribute("id", "nextImageBtn")
  nextImageButton.setAttribute("class", "btn btn-link")
  nextImageButton.innerHTML = "Next Image >>"
  const allFilesInCurrentFolder = JSON.parse(window.localStorage.allFilesInFolder)[window.localStorage.currentFolder] || []
  if (allFilesInCurrentFolder.length > 0) {
    const currentImageIndex = allFilesInCurrentFolder.indexOf(hashParams.image.toString())
    if (currentImageIndex === allFilesInCurrentFolder.length - 1) {
      return
    }
    nextImageButton.onclick = async (_) => {
      if (hashParams.image === currentThumbnailsList[currentThumbnailsList.length - 1]) {
        const thumbnailCurrentPageText = document.getElementById("thumbnailPageSelector_currentPage")
        thumbnailCurrentPageText.stepUp()
        thumbnailCurrentPageText.dispatchEvent(new Event("change"))
      }
      selectImage(allFilesInCurrentFolder[currentImageIndex + 1])
    }
  } else {
    // Fallback for first load where allFilesInFolder is yet to be populated, since doing that takes a lot of time.
    const currentImageIndex = currentThumbnailsList.indexOf(hashParams.image.toString())
    if (currentImageIndex === currentThumbnailsList.length - 1 && isThumbnailsLastPage()) {
      return
    }
    nextImageButton.onclick = async (_) => {
      if (hashParams.image === currentThumbnailsList[currentThumbnailsList.length - 1]) {
        const thumbnailCurrentPageText = document.getElementById("thumbnailPageSelector_currentPage")
        thumbnailCurrentPageText.stepUp()
        thumbnailCurrentPageText.dispatchEvent(new Event("change"))
        setTimeout(() => { // Needs to wait for new thumbnails list to be loaded. Very ugly, need rethinking later.
          selectImage(currentThumbnailsList[0])
        }, 3000)
      } else {
        selectImage(currentThumbnailsList[currentImageIndex + 1])
      }
    }
  }
  nextImageMessage.appendChild(nextImageButton)
}

let toastTimeout = {}
const showToast = (message) => {
  // toastTimeout && clearTimeout(toastTimeout)
  document.getElementById("toastMessage").innerText = message
  document.getElementById("toastClose").Toast.show()
  toastTimeout = setTimeout(() => {
    if(document.getElementById("toast").classList.contains("showing")){
      document.getElementById("toast").dispatchEvent(new Event("webkitTransitionEnd"))
    }
  }, 3000) //For bug where toast doesn't go away the second time an annotation is made.
}
clicked = false
const segmentButton = () => {
  const segmentDiv = document.createElement("div")
  segmentDiv.setAttribute("class", "tool")
  // segmentDiv.setAttribute("title", "Under Development!")
  // new Tooltip(segmentDiv, {
  //   'placement': "bottom",
  //   'animation': "slideNfade",
  //   'delay': 250
  // })
  const segmentBtn = document.createElement("button")
  segmentBtn.setAttribute("class", "btn btn-outline-primary")
  // segmentBtn.setAttribute("disabled", "")
  const segmentIcon = document.createElement("i")
  segmentIcon.setAttribute("class", "fas fa-qrcode")
  segmentBtn.onclick = () => {
    clicked = !clicked
    watershedSegment(path.tmaCanvas, path.tmaCanvas, clicked) }
  // const segmentLabel = document.createElement("label")
  // segmentLabel.appendChild(document.createTextNode(`Segment Image`))
  segmentBtn.appendChild(segmentIcon)
  segmentDiv.appendChild(segmentBtn)
  path.toolsDiv.appendChild(segmentDiv)
}

const zoomButton = () => {
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
    if(keyEvent.key === "Escape" && toolSelected) {
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
    zoomHandler(path.tmaCanvas, path.tmaImage, magnification, scrollToZoom, toolSelected)
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
        zoomHandler(path.tmaCanvas, path.tmaImage, magnification, scrollToZoom, toolSelected)
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
  scrollToZoomCheckbox.onchange = ({target}) => {
    scrollToZoom = target.checked
    if (toolSelected) {
      zoomHandler(path.tmaCanvas, path.tmaImage, magnification, scrollToZoom, toolSelected)
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

  new Dropdown(zoomOptionsBtn, true);

  path.toolsDiv.appendChild(zoomToolDiv)
}

const showQualitySelectors = async (annotationType) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const annotationsAccordion = document.getElementById("annotationsAccordion")
  const annotations = fileMetadata[`${annotationType}_annotations`] && JSON.parse(fileMetadata[`${annotationType}_annotations`])
  const annotationsDiv = document.getElementById(`${annotationType}Annotations`)
  const selectTable = document.getElementById(`${annotationType}Select`)
  const selectTableBody = selectTable.querySelector("tbody")
  
  // const qualitySelectorsDiv = document.createElement("div")
  // qualitySelectorsDiv.setAttribute("id", "qualitySelectors")
  // qualitySelectorsDiv.style.display = "flex"
  // qualitySelectorsDiv.style.flexDirection = "column"
  if (selectTableBody.childElementCount === 0) {
    qualityEnum.forEach((quality) => {
      const {
        label,
        displayText,
        tooltip
      } = quality
      const tableRow = document.createElement("tr")
      const tableAnnotationData = document.createElement("td")
      const annotationDiv = document.createElement("div")
      annotationDiv.setAttribute("class", "qualitySelectorDiv")
      
      const qualityButton = document.createElement("button")
      qualityButton.setAttribute("class", "btn btn-outline-info")
      qualityButton.setAttribute("id", `${annotationType}_${label}`)
      qualityButton.setAttribute("value", label)
      qualityButton.setAttribute("onclick", `path.qualityAnnotate("${annotationType}", "${label}")`)
      qualityButton.innerText = displayText
      qualityButton.setAttribute("title", tooltip)
      new Tooltip(qualityButton, {
        'placement': "right",
        'animation': "slideNfade",
        'delay': 100,
        'html': true
      })
      
      annotationDiv.appendChild(qualityButton)
      tableAnnotationData.style.borderRight = "none"

      tableAnnotationData.appendChild(annotationDiv)
      tableRow.appendChild(tableAnnotationData)
      
      const tablePredictionData = document.createElement("td")
      tablePredictionData.setAttribute("id", `prediction_${label}`)
      tablePredictionData.setAttribute("align", "center")
      tablePredictionData.style.verticalAlign = "middle"
      tablePredictionData.style.borderLeft = "none"
      tableRow.appendChild(tablePredictionData)
      selectTableBody.appendChild(tableRow)
    })
  }
  const modelQualityPrediction = await getModelPrediction(annotationType)
  qualityEnum.forEach(({label}) => {
    const labelPrediction = modelQualityPrediction.find(pred => pred.displayName === label)
    const labelScore = labelPrediction ? Number.parseFloat(labelPrediction.classification.score).toPrecision(3) : "--"
    const tablePredictionData = selectTableBody.querySelector(`td#prediction_${label}`)
    tablePredictionData.innerHTML = labelScore
    if (labelScore > 0.5) {
      // selectTableBody.querySelector(`tr[style="border:3px solid lightgreen]"`).style.border = "none"
      const previousPrediction = selectTableBody.querySelector("tr.modelPrediction")
      if (previousPrediction) {
        previousPrediction.classList.remove("modelPrediction")
      }
      tablePredictionData.parentElement.classList.add("modelPrediction")
    }
  })
  activateQualitySelector(annotationType, annotations)
  getOthersAnnotations(annotationType, annotations)
  annotationsAccordion.style.display = "flex"
  annotationsDiv.style.borderBottom = "1px solid rgba(0,0,0,.125)"
}

const getOthersAnnotations = (annotationType, annotations) => {
  let othersAnnotationsText = ""
  const othersAnnotationsDiv = document.getElementById(`${annotationType}_othersAnnotations`)
  const annotationName = othersAnnotationsDiv.parentElement.getAttribute("name")
  if (annotations) {
    const othersAnnotations = Object.values(annotations).filter(annotation => annotation && annotation.userId !== window.localStorage.userId)
    if (othersAnnotations.length > 0) {
      const othersAnnotationsUsernames = othersAnnotations.map(annotation => annotation.username)
      const othersAnnotationsUsernamesText = othersAnnotationsUsernames.length === 1 
      ? 
      othersAnnotationsUsernames[0]
      :
      othersAnnotationsUsernames.slice(0, othersAnnotationsUsernames.length - 1).join(", ") +  " and " + othersAnnotationsUsernames[othersAnnotationsUsernames.length - 1]
      othersAnnotationsText = `-- ${othersAnnotationsUsernamesText} annotated this image for ${annotationName}.`
    }
  }
  
  othersAnnotationsDiv.innerHTML = othersAnnotationsText
}

const getModelPrediction = async (annotationType) => {
  console.log(annotationType)
  const payload = {
    annotationType,
    "image": path.tmaCanvas.toDataURL().split("base64,")[1]
  }
  const prediction =  await utils.request("https://us-central1-nih-nci-dceg-episphere-dev.cloudfunctions.net/getPathPrediction", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, false).then(res => res.json())
  
  console.log("getting preds", prediction)
  return prediction
}

const activateQualitySelector = (annotationType, annotations) => {
  const selectTable = document.getElementById(`${annotationType}Select`)
  const currentlyActiveButton = selectTable.querySelector("button.active")
  if (currentlyActiveButton) {
    currentlyActiveButton.classList.remove("active")
  }
  if (annotations && annotations[window.localStorage.userId]) {
    const userAnnotation = annotations[window.localStorage.userId].value
    selectTable.querySelector(`button[value='${userAnnotation}']`).classList.add("active")
  }
}

showThumbnailPicker = async (limit, offset=0) => {
  const thumbnailPicker = document.getElementById("thumbnailPicker")
  if (thumbnailPicker.childElementCount === 0 || thumbnailPicker.getAttribute("folder") !== window.localStorage.currentThumbnailsFolder || window.localStorage.currentThumbnailsOffset !== offset) {
    thumbnailPicker.setAttribute("folder", window.localStorage.currentThumbnailsFolder)
    thumbnailPicker.style.display = "flex"
    thumbnailPicker.style["flex-direction"] = "column"
    thumbnailPicker.style.height = path.tmaCanvas.height
    
    window.localStorage.currentThumbnailsOffset = offset
    const { currentThumbnailsFolder } = window.localStorage
    var { total_count, entries: thumbnails } = await box.getFolderContents(currentThumbnailsFolder, limit, offset)
    currentThumbnailsList = thumbnails.map(t => t.id)
    if (thumbnails) {
      addThumbnails(thumbnailPicker, thumbnails)
      addThumbnailPageSelector(thumbnailPicker, total_count, limit, offset)
    }
  }
  let allFilesInFolder = JSON.parse(window.localStorage.allFilesInFolder)
  if (allFilesInFolder[window.localStorage.currentThumbnailsFolder] && allFilesInFolder[window.localStorage.currentThumbnailsFolder].length === 0) {
    box.getFolderContents(window.localStorage.currentThumbnailsFolder, total_count, 0).then(({entries}) => {
      const onlyFiles = []
      entries.forEach(entry => {
        if (entry.type === "file" && (entry.name.endsWith(".jpg") || entry.name.endsWith(".png"))) {
          onlyFiles.push(entry.id)
        }
      })
      const allFilesInFolderObj = allFilesInFolder
      allFilesInFolderObj[window.localStorage.currentThumbnailsFolder] = onlyFiles
      window.localStorage.allFilesInFolder = JSON.stringify(allFilesInFolderObj)
    })
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
  
  thumbnails.forEach((thumbnail) => {
    if (thumbnail.type === "file" && (thumbnail.name.endsWith(".jpg") || thumbnail.name.endsWith(".png"))) {
      const { id: thumbnailId, name } = thumbnail
      const thumbnailDiv = document.createElement("div")
      thumbnailDiv.setAttribute("class", "thumbnailDiv")
      const thumbnailImg = document.createElement("img")
      thumbnailImg.setAttribute("id", `thumbnail_${thumbnailId}`)
      thumbnailImg.setAttribute("class", "imagePickerThumbnail")
      if (thumbnailId === hashParams.image) {
        thumbnailImg.classList.add("selectedThumbnail")
      }
      thumbnailImg.setAttribute("loading", "lazy")

      const thumbnailNameText = document.createElement("span")
      thumbnailNameText.setAttribute("class", "imagePickerThumbnailText")
      const thumbnailName = name.trim().split(".")[0]
      thumbnailNameText.innerText = thumbnailName
      thumbnailDiv.appendChild(thumbnailImg)
      thumbnailDiv.appendChild(thumbnailNameText)
      thumbnailsListDiv.appendChild(thumbnailDiv)
      thumbnailDiv.onclick = () => selectImage(thumbnailId)
      box.getThumbnail(thumbnailId).then(res => thumbnailImg.setAttribute("src", res))
      getAnnotationsForBorder(thumbnailId)
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
    thumbnailCurrentPageText.style.width = "30px";
  
    const outOfTotalPagesText = document.createElement("span")
    outOfTotalPagesText.setAttribute("id", "thumbnailPageSelector_totalPages")
    outOfTotalPagesText.innerText = ` / ${totalPages}`
    
    const thumbnailNextPageBtn = document.createElement("button")
    thumbnailNextPageBtn.setAttribute("class", "btn btn-sm btn-light")
  
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

    checkAndDisableButtons(currentPageNum, totalPages)
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

const getAnnotationsForBorder = (thumbnailId) => {
  box.getData(thumbnailId, "file").then(resp => {
    if (resp && resp.metadata && resp.metadata.global && resp.metadata.global.properties) {
      metadata = resp.metadata.global.properties
      borderByAnnotations(thumbnailId, metadata)
    }
  })
}

const borderByAnnotations = (thumbnailId, metadata) => {
  let numAnnotationsCompleted = 0
  annotationTypes.forEach(annotationType => {
    if (`${annotationType}_annotations` in metadata && window.localStorage.userId in JSON.parse(metadata[`${annotationType}_annotations`])) {
      numAnnotationsCompleted += 1
    }
  })
  const thumbnailImg = document.getElementById(`thumbnail_${thumbnailId}`)
  if (numAnnotationsCompleted === annotationTypes.length) {
    thumbnailImg.classList.add("annotationsCompletedThumbnail")
  } else if (numAnnotationsCompleted > 0) {
    thumbnailImg.classList.add("annotationsPartlyCompletedThumbnail")
  }
}

const isThumbnailsFirstPage = () => {
  // For use when changing thumbnails list from elsewhere, for instance showNextImageButton().
  const [ thumbnailPrevPageBtn, _ ] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  return thumbnailPrevPageBtn.getAttribute("disabled") === "true"
}

const isThumbnailsLastPage = () => {
  // For use when changing thumbnails list from elsewhere, for instance showNextImageButton().
  const [ _, thumbnailNextPageBtn ] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  return thumbnailNextPageBtn.getAttribute("disabled") === "true"
}

const checkAndDisableButtons = (pageNum, totalPages) => {
  const [ thumbnailPrevPageBtn, thumbnailNextPageBtn ] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  if (pageNum === 1) {
    thumbnailPrevPageBtn.setAttribute("disabled", "true")
    thumbnailNextPageBtn.removeAttribute("disabled")
  } else if (pageNum === totalPages) {
    thumbnailNextPageBtn.setAttribute("disabled", "true")
    thumbnailPrevPageBtn.removeAttribute("disabled")
  } else {
    thumbnailPrevPageBtn.removeAttribute("disabled")
    thumbnailNextPageBtn.removeAttribute("disabled")
  }
}

const selectImage = (imageId) => {
  if (imageId && imageId !== hashParams.image) {
    if (hashParams.image) {
      window.location.hash = window.location.hash.replace(`image=${hashParams.image}`, `image=${imageId}`)
    } else {
      window.location.hash += window.location.hash.length > 0 ? "&" : "" 
      window.location.hash += `image=${imageId}`
    }
  } else if (!imageId) {
    window.location.hash = window.location.hash.replace(`image=${hashParams.image}`, "")
  }
}

const selectFolder = (folderId) => {
  const loaderElementId = "fileMgrLoaderDiv"
  const overlayOn = document.getElementById("boxFolderTree")
  if (folderId && folderId !== hashParams.folder) {
    showLoader(loaderElementId, overlayOn)
    if (hashParams.folder) {
      window.location.hash = window.location.hash.replace(`folder=${hashParams.folder}`, `folder=${folderId}`)
    } else {
      window.location.hash += window.location.hash.length > 0 ? "&" : ""
      window.location.hash += `folder=${folderId}`
    }
  } else if (!folderId) {
    window.location.hash = window.location.hash.replace(`folder=${hashParams.folder}`, "")
  }
  hideLoader(loaderElementId)
}

const highlightThumbnail = (id) => {
  const prevSelectedThumbnail = document.getElementsByClassName("selectedThumbnail")
  if (prevSelectedThumbnail.length > 0) {
    prevSelectedThumbnail[0].classList.remove("selectedThumbnail")
  }
  const thumbnailToSelect = document.getElementById(`thumbnail_${id}`)
  if (thumbnailToSelect){
    thumbnailToSelect.classList.add("selectedThumbnail")
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
window.onresize = path.loadCanvas
window.onhashchange = loadHashParams