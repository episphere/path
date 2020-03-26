const boxRootFolderId = "0"
const configFileId = 627997326641
var currentThumbnailsList = []
const containsEmojiRegex = new RegExp("(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])")

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
        } catch (e) { // If eval doesn't work, just add the value as a string.
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
  if (await box.isLoggedIn()) {
    if (hashParams.image && hashParams.image !== window.localStorage.currentImage) {
      await loadImageFromBox(hashParams.image)
    }
    if (hashParams.folder) {
      window.localStorage.currentFolder = hashParams.folder
      window.localStorage.allFilesInFolder[hashParams.folder] = {}
      loadBoxFileManager(hashParams.folder)
    } else {
      selectFolder(boxRootFolderId)
    }
  }
}

const defaultImg = window.location.origin + window.location.pathname + "images/OFB_023_2_003_1_13_03.jpg"

const defaultThumbnailsListLength = 20

const utils = {
  request: (url, opts, returnJson = true) =>
    fetch(url, opts)
    .then(res => res.ok ? (returnJson ? res.json() : res) : res)
    .catch(e => {
      throw new Error("HTTP Request failed!", e)
    })
}

const annotationTypes = ["tissueAdequacy", "stainingAdequacy"]

const qualityEnum = [{
  "label": "O",
  "numValue": 1,
  "displayText": "👍",
  "tooltip": "Satisfactory"
}, {
  "label": "S",
  "numValue": 0.5,
  "displayText": "🤞",
  "tooltip": "Suboptimal"
}, {
  "label": "U",
  "numValue": 0,
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

  if ("useWorker" in hashParams) {
    path.worker = new Worker('modelPrediction.js')
  }
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
    path.getAppConfig()
    box.getUserProfile()
    loadLocalModel()
  })

  const addAnnotationsModal = document.getElementById("addAnnotationsModal")
  addAnnotationsModal.addEventListener("show.bs.modal", (evt) => {
    document.getElementById("datasetFolderId").value = path.appConfig.datasetFolderId ? path.appConfig.datasetFolderId : "INVALID"
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
      path.appConfig.annotations.forEach(createAnnotationTables)
      if (path.worker) {
        path.worker.postMessage(await tf.browser.fromPixels(path.tmaImage).array())
        path.worker.onmessage = (e) => {
          console.log("Message received from worker!", e.data)
        }
      } else {
        // setTimeout(() => {
        //   path.model.classify(path.tmaImage).then(preds => console.log("Local Model Prediction", preds))
        // }, 3000)
      }
    }
  }
}

path.getAppConfig = async () => {
  const isFileJSON = true
  path.appConfig = await box.getFileContent(configFileId, isFileJSON)
  const annotations = path.appConfig.annotations.filter(annotation => !annotation.private || (annotation.private && annotation.createdBy === window.localStorage.userId))
  path.appConfig.annotations = annotations
}

const loadDefaultImage = async () => {
  if (!hashParams.image || !await box.isLoggedIn()) {
    path.tmaImage.src = defaultImg
    document.getElementById("imgHeader").innerHTML = `<h5>Test Image</h5>`
  }
}

const loadImageFromBox = async (id, url) => {
  if (await utils.boxRequest) {
    const thumbnailImage = document.getElementById(`thumbnail_${id}`)
    if (thumbnailImage) {
      path.tmaImage.src = thumbnailImage.src
      highlightThumbnail(id)
      highlightInBoxFileMgr(id)
    }
    const imageData = await box.getData(id, "file") || {}
    if (imageData.status === 404) {
      console.log(`Can't fetch data for image ID ${id} from Box`)
      alert("The image ID in the URL does not point to a file in Box!")
      selectImage()
      loadDefaultImage()
      return
    }

    const {
      type,
      name,
      parent,
      metadata,
      path_collection: {
        entries: filePathInBox
      }
    } = imageData

    if (type === "file" && (name.endsWith(".jpg") || name.endsWith(".png"))) {
      // showLoader("imgLoaderDiv", path.tmaCanvas)
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

      if (!hashParams.folder) {
        selectFolder(parent.id)
      }
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
      folderLink.innerText = path.tmaCanvas.parentElement.offsetWidth < 550 ? folder.name.trim().slice(0, 7) + "..." : folder.name.trim()
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

const loadBoxFileManager = async (id = boxRootFolderId) => {
  const boxFileMgrHeaderDiv = document.getElementById("boxFileMgrHeader")
  if (boxFileMgrHeaderDiv.parentElement.getAttribute("folderId") === hashParams.folder) {
    return
  }
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
    boxFileMgrHeaderDiv.parentElement.setAttribute("folderId", id)

  } else if (folderData && folderData.status === 404) {
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
  const {
    id
  } = folderData
  const loaderElementId = "fileMgrLoaderDiv"
  if (folderData && folderData.item_status === "active") {
    const {
      item_collection: {
        entries
      }
    } = folderData
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
  const {
    width,
    height
  } = overlayOnElement.getBoundingClientRect()
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
  }
}

path.loadOptions = () => {
  path.options = true
  document.getElementById("toolsOuterDiv").style.visibility = "visible"
  zoomButton()
  segmentButton()
  // addAnnotationsTooltip()
}

path.qualityAnnotate = async (annotationName, qualitySelected) => {
  if (await box.isLoggedIn()) {
    const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
    const annotations = fileMetadata[`${annotationName}_annotations`] ? JSON.parse(fileMetadata[`${annotationName}_annotations`]) : {}

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
    const boxMetadataPath = `/${annotationName}_annotations`
    const newMetadata = await box.updateMetadata(hashParams.image, boxMetadataPath, JSON.stringify(annotations))

    if (!newMetadata.status) { // status is returned only on error, check for errors properly later
      window.localStorage.fileMetadata = JSON.stringify(newMetadata)
      activateQualitySelector(annotationName, annotations)
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
  const annotationTypes = path.appConfig.annotations.map(x => x.metaName)
  const numAnnotationsCompleted = Object.keys(metadata).reduce((total, key) => {
    if (key.includes("_annotations")) {
      const annotationMade = JSON.parse(metadata[key])
      if (annotationTypes.includes(key) && window.localStorage.userId in annotationMade) {
        total += 1
      }
    }
    return total
  }, 0)

  const nextImageMessage = document.getElementById("nextImageMessage")
  const nextImageText = `<b style='padding-bottom:.75rem;'><span style='color:darkorchid'>${numAnnotationsCompleted}</span> / ${path.appConfig.annotations.length} Annotations Completed!</b>`
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
    if (document.getElementById("toast").classList.contains("showing")) {
      document.getElementById("toast").dispatchEvent(new Event("webkitTransitionEnd"))
    }
  }, 3000) //For bug where toast doesn't go away the second time an annotation is made.
}
let clicked = false
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
    watershedSegment(path.tmaCanvas, path.tmaCanvas, clicked)
  }
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

  new Dropdown(zoomOptionsBtn, true);

  path.toolsDiv.appendChild(zoomToolDiv)
}

const createAnnotationTables = async (annotation) => {
  // return
  const annotationsAccordion = document.getElementById("annotationsAccordion")
  const {
    displayName,
    annotationName,
    definition,
    enableComments
  } = annotation
  if (!annotationsAccordion.querySelector(`#${annotationName}Card`)) {
    const annotationCardDiv = document.createElement("div")
    annotationCardDiv.setAttribute("class", "card annotationsCard")
    annotationCardDiv.setAttribute("id", `${annotationName}Card`)
    let annotationCard = `
      <div class="card-header">
        <h2 class="mb-0">
          <button class="btn btn-link" type="button" data-toggle="collapse"
            data-target="#${annotationName}Annotations" id="${annotationName}Toggle">
            ${displayName}
          </button>
        </h2>
      </div>
  
      <div id="${annotationName}Annotations" class="collapse qualityAnnotations" data-parent="#annotationsAccordion">
        <div class="card-body annotationsCardBody" name="${displayName}">
          <table id="${annotationName}Select" class="table table-bordered qualitySelect">
            <thead>
              <tr>
                <th scope="col" style="border-right: none; padding-left: 0; padding-right: 0;">
                  <div class="text-left col">Label</div>
                </th>
                <th scope="col" style="border-left: none;">
                  <div class="text-center col">Model Score</div>
                </th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          </table>
          <div id="${annotationName}_othersAnnotations" class="quality_othersAnnotations"></div>
      `
    if (enableComments) {
      annotationCard += `
          <div class="commentsToggleDiv">
            <button id="${annotationName}_commentsToggle" type="button" data-toggle="collapse" data-target="#${annotationName}_allComments" role="button" class="btn btn-link collapsed" disabled style="padding-left: 0;"></button>
          </div>
          <div class="collapse" id="${annotationName}_allComments">
            <div class="allCommentsCard card card-body" id="${annotationName}_allCommentsCard">
            </div>
          </div>
          <div id="${annotationName}_comments" class="quality_comments form-group">
            <textarea class="form-control" id="${annotationName}_commentsTextField" rows="2" placeholder="Add your comments here..."></textarea>
            <div style="display: flex; flex-direction: row; justify-content: space-between; margin-top: 0.5rem; margin-left: 0.1rem;">
              <div style="display: flex; flex-direction: row; style="margin: auto 0;">
                <label for="${annotationName}_commentsPublic" style="margin-right: 0.5rem;">Private</label>
                <div class="custom-control custom-switch">
                  <input type="checkbox" class="custom-control-input" id="${annotationName}_commentsPublic">
                  <label class="custom-control-label" for="${annotationName}_commentsPublic">Public</label>
                </div>
              </div>
              <div>
                <button type="submit" onclick=submitAnnotationComments("${annotationName}") id="${annotationName}_submitComments" class="btn btn-info" disabled>Submit</button>
              </div>
            </div>
          </div>
        `
    }
    annotationCard += `
        </div>
      </div>
      `
    annotationCardDiv.innerHTML += annotationCard
    annotationsAccordion.appendChild(annotationCardDiv)
    new Collapse(document.getElementById(`${annotationName}Toggle`))
    if (enableComments) {
      populateComments(annotationName)
      
      const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
      new Collapse(toggleCommentsButton)
      toggleCommentsButton.addEventListener("shown.bs.collapse", (evt) => {
        toggleCommentsButton.innerHTML = "- Hide All Comments"
      })
      toggleCommentsButton.addEventListener("hidden.bs.collapse", (evt) => {
        toggleCommentsButton.innerHTML = "+ Show All Comments"
      })

      const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
      const commentsSubmitButton = document.getElementById(`${annotationName}_submitComments`)
      commentsTextField.oninput = (evt) => {
        if (commentsTextField.value.length > 0) {
          commentsSubmitButton.removeAttribute("disabled")
        } else {
          commentsSubmitButton.setAttribute("disabled", "true")
        }
      }
    }
  }
  showQualitySelectors(annotation)
  showNextImageButton()
  annotationsAccordion.parentElement.style.display = "block"
}

const showQualitySelectors = async (annotation) => {
  const {
    annotationName,
    metaName,
    labels,
  } = annotation
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const fileAnnotations = fileMetadata[metaName] && JSON.parse(fileMetadata[metaName])
  const annotationDiv = document.getElementById(`${annotationName}Annotations`)
  const selectTable = document.getElementById(`${annotationName}Select`)
  const selectTableBody = selectTable.querySelector("tbody")

  // const qualitySelectorsDiv = document.createElement("div")
  // qualitySelectorsDiv.setAttribute("id", "qualitySelectors")
  // qualitySelectorsDiv.style.display = "flex"
  // qualitySelectorsDiv.style.flexDirection = "column"
  if (selectTableBody.childElementCount === 0) {
    labels.forEach((labelConfig) => {
      const {
        label,
        displayText,
        tooltip
      } = labelConfig
      const tableRow = document.createElement("tr")
      const tableAnnotationData = document.createElement("td")
      const annotationDiv = document.createElement("div")
      annotationDiv.setAttribute("class", "qualitySelectorDiv")

      const qualityButton = document.createElement("button")
      let qualityButtonClass = "btn btn-outline-info"
      if (containsEmojiRegex.test(displayText)) {
        qualityButtonClass += " qualityTextEmoji"
      } else {
        qualityButtonClass += " qualityTextNormal"
      }
      qualityButton.setAttribute("class", qualityButtonClass)
      qualityButton.setAttribute("id", `${annotationName}_${label}`)
      qualityButton.setAttribute("value", label)
      qualityButton.setAttribute("onclick", `path.qualityAnnotate("${annotationName}", "${label}")`)
      qualityButton.innerText = displayText
      if (tooltip) {
        qualityButton.setAttribute("title", tooltip)
        new Tooltip(qualityButton, {
          'placement': "right",
          'animation': "slideNfade",
          'delay': 100,
          'html': true
        })
      }

      annotationDiv.appendChild(qualityButton)
      tableAnnotationData.style.borderRight = "none"
      tableAnnotationData.appendChild(annotationDiv)
      tableRow.appendChild(tableAnnotationData)

      const predictionTableData = document.createElement("td")
      predictionTableData.setAttribute("id", `${annotationName}_prediction_${label}`)
      predictionTableData.setAttribute("class", `predictionScore`)
      predictionTableData.setAttribute("align", "center")
      predictionTableData.style.verticalAlign = "middle"
      predictionTableData.style.borderLeft = "none"
      tableRow.appendChild(predictionTableData)
      selectTableBody.appendChild(tableRow)
    })
  }
  const previousPrediction = selectTableBody.querySelector("tr.modelPrediction")
  if (previousPrediction) {
    previousPrediction.classList.remove("modelPrediction")
    const previousPredictionTD = previousPrediction.querySelector("td.predictionScore")
    previousPredictionTD.innerHTML = "--"
  }
  activateQualitySelector(annotationName, fileAnnotations)
  getOthersAnnotations(annotationName, fileAnnotations)
  loadModelPrediction(annotationName, selectTableBody)
  annotationDiv.style.borderBottom = "1px solid rgba(0,0,0,.125)"
}

const loadModelPrediction = async (annotationName, tableBodyElement) => {
  const modelQualityPrediction = await getModelPrediction(annotationName)
  if (modelQualityPrediction) {
    qualityEnum.forEach(({
      label
    }) => {
      const labelPrediction = modelQualityPrediction.find(pred => pred.displayName === label)
      const labelScore = labelPrediction ? Number.parseFloat(labelPrediction.classification.score).toPrecision(3) : "--"
      const tablePredictionData = tableBodyElement.querySelector(`td#${annotationName}_prediction_${label}`)
      tablePredictionData.innerHTML = labelScore
      if (labelScore > 0.5) {
        tablePredictionData.parentElement.classList.add("modelPrediction")
      }
    })
  }
}

const getOthersAnnotations = (annotationName, fileAnnotations) => {
  let othersAnnotationsText = ""
  const othersAnnotationsDiv = document.getElementById(`${annotationName}_othersAnnotations`)
  const annotationDisplayName = othersAnnotationsDiv.parentElement.getAttribute("name")
  if (fileAnnotations) {
    const {
      model,
      ...nonModelAnnotations
    } = fileAnnotations
    let othersAnnotations = Object.values(nonModelAnnotations).filter(annotation => annotation && annotation.userId !== window.localStorage.userId)
    if (othersAnnotations.length > 0) {
      const othersAnnotationsUsernames = othersAnnotations.map(annotation => annotation.username)
      const othersAnnotationsUsernamesText = othersAnnotationsUsernames.length === 1 ?
        othersAnnotationsUsernames[0] :
        othersAnnotationsUsernames.slice(0, othersAnnotationsUsernames.length - 1).join(", ") + " and " + othersAnnotationsUsernames[othersAnnotationsUsernames.length - 1]
      othersAnnotationsText = `-- ${othersAnnotationsUsernamesText} annotated this image for ${annotationDisplayName}.`
    }
  }

  othersAnnotationsDiv.innerHTML = othersAnnotationsText
}

const submitAnnotationComments = async (annotationName) => {
  const commentText = document.getElementById(`${annotationName}_commentsTextField`).value
  if(commentText.length === 0) {
    return
  }
  const newCommentMetadata = {
    "userId": window.localStorage.userId,
    "createdBy": window.localStorage.username,
    "createdAt": Date.now(),
    "text": commentText,
    "isPrivate": !(document.getElementById(`${annotationName}_commentsPublic`).checked)
  }
  
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const annotationComments = fileMetadata[`${annotationName}_comments`] ? JSON.parse(fileMetadata[`${annotationName}_comments`]) : []
  annotationComments.push(newCommentMetadata)

  const boxMetadataPath = `/${annotationName}_comments`
  try {
    const newMetadata = await box.updateMetadata(hashParams.image, boxMetadataPath, JSON.stringify(annotationComments))
    window.localStorage.fileMetadata = JSON.stringify(newMetadata)
    showToast("Comment added successfully!")
    populateComments(annotationName)
    const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
    if (toggleCommentsButton.classList.contains("collapsed")) {
      toggleCommentsButton.click()
    }
    document.getElementById(`${annotationName}_allCommentsCard`).scrollTop = document.getElementById(`${annotationName}_allCommentsCard`).scrollHeight
  } catch (e) {
    showToast("Some error occurred adding your comment. Please try later!")
    console.log(e)
  }


}

const populateComments = (annotationName) => {
  const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
 
  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    
    if (annotationComments.length > 0) {
      const visibleComments = annotationComments.filter(comment => comment.userId === window.localStorage.userId || !comment.isPrivate)
      
      if (visibleComments) {
        const commentsCard = document.getElementById(`${annotationName}_allCommentsCard`)
        const commentsSortedByTime = visibleComments.sort((prevComment, currentComment) => prevComment.createdAt - currentComment.createdAt )
        
        const commentsHTML = commentsSortedByTime.map((comment,index) => {
          let commentElement = `
            <span class="annotationComment">
              <b>
                <u style="color: dodgerblue;">
                  ${comment.createdBy}
                </u>
                :
              </b>
              <strong style="color: rgb(85, 85, 85);">
                ${comment.text}
              </stroong>
            </span>
          `
          commentElement += (index !== commentsSortedByTime.length - 1) ? "<hr/>" : ""
          return commentElement
        }).join("")

        commentsCard.innerHTML = commentsHTML

        toggleCommentsButton.innerHTML = "+ Show All Comments"
        toggleCommentsButton.parentElement.style["text-align"] = "left"
        toggleCommentsButton.removeAttribute("disabled")

        return
      }
    }
  }
  toggleCommentsButton.parentElement.style["text-align"] = "center"
  toggleCommentsButton.innerHTML = "-- No Comments To Show --"
}

const activateQualitySelector = (annotationName, fileAnnotations) => {
  const annotationConfig = path.appConfig.annotations.find(annotation => annotation.annotationName === annotationName)
  if (annotationConfig) {
    const annotationLabelsConfig = annotationConfig.labels
    const selectTable = document.getElementById(`${annotationName}Select`)
    const currentlyActiveButton = selectTable.querySelector("button.active")
    if (currentlyActiveButton) {
      currentlyActiveButton.classList.remove("active")
    }
    if (fileAnnotations && fileAnnotations[window.localStorage.userId]) {
      let userAnnotation = fileAnnotations[window.localStorage.userId].value
      // Temporary fix for problem of label mismatch due to AutoML (they were 0, 0.5, 1 before, had to be changed to 
      // O, M, S for AutoML training). Need to change the metadata of all annotated files to solve the problem properly. 
      // if (annotationConfig.labels.find(q => q.label === )) {
      //   userAnnotation = qualityEnum.find(quality => quality.label === fileAnnotations[window.localStorage.userId].value).label
      // }
      selectTable.querySelector(`button[value='${userAnnotation}']`).classList.add("active")
    }
  }
}

const showThumbnailPicker = async (limit, offset = 0) => {
  const thumbnailPicker = document.getElementById("thumbnailPicker")
  if (thumbnailPicker.childElementCount === 0 || thumbnailPicker.getAttribute("folder") !== window.localStorage.currentThumbnailsFolder || window.localStorage.currentThumbnailsOffset !== offset) {
    thumbnailPicker.setAttribute("folder", window.localStorage.currentThumbnailsFolder)
    thumbnailPicker.style.display = "flex"
    thumbnailPicker.style["flex-direction"] = "column"
    thumbnailPicker.style.height = path.tmaCanvas.height

    window.localStorage.currentThumbnailsOffset = offset
    const {
      currentThumbnailsFolder
    } = window.localStorage
    var {
      total_count,
      entries: thumbnails
    } = await box.getFolderContents(currentThumbnailsFolder, limit, offset)
    currentThumbnailsList = thumbnails.map(t => t.id)
    if (thumbnails) {
      addThumbnails(thumbnailPicker, thumbnails)
      addThumbnailPageSelector(thumbnailPicker, total_count, limit, offset)
    }
  }
  let allFilesInFolder = JSON.parse(window.localStorage.allFilesInFolder)
  if (allFilesInFolder[window.localStorage.currentThumbnailsFolder] && allFilesInFolder[window.localStorage.currentThumbnailsFolder].length < total_count) {
    const populateAllFilesInFolder = async (prevEntries = [], offset = 0) => {
      const folderContents = await box.getFolderContents(window.localStorage.currentThumbnailsFolder, total_count, offset)
      const entries = prevEntries.concat(folderContents.entries)
      if (entries.length < total_count) {
        return populateAllFilesInFolder(entries, entries.length)
      }
      const onlyImages = []
      entries.forEach(entry => {
        if (entry.type === "file" && (entry.name.endsWith(".jpg") || entry.name.endsWith(".png"))) {
          onlyImages.push(entry.id)
        }
      })
      const allFilesInFolderObj = allFilesInFolder
      allFilesInFolderObj[window.localStorage.currentThumbnailsFolder] = onlyImages
      window.localStorage.allFilesInFolder = JSON.stringify(allFilesInFolderObj)
    }
    // populateAllFilesInFolder([], 0)
  }
}

const addThumbnails = (thumbnailPicker, thumbnails) => {
  let thumbnailsListDiv = document.getElementById("thumbnailsList")

  if (thumbnailsListDiv) {
    thumbnailPicker.removeChild(thumbnailsListDiv)
    while (thumbnailsListDiv.firstElementChild) {
      thumbnailsListDiv.removeChild(thumbnailsListDiv.firstElementChild)
    }
  } else {
    thumbnailsListDiv = document.createElement("div")
    thumbnailsListDiv.setAttribute("id", "thumbnailsList")
  }
  thumbnailsListDiv.scrollTop = 0

  thumbnails.forEach((thumbnail) => {
    if (thumbnail.type === "file" && (thumbnail.name.endsWith(".jpg") || thumbnail.name.endsWith(".png"))) {
      const {
        id: thumbnailId,
        name
      } = thumbnail
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

    thumbnailCurrentPageText.onchange = ({
      target: {
        value
      }
    }) => {
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
      showThumbnailPicker(defaultThumbnailsListLength, (value - 1) * defaultThumbnailsListLength)
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
  path.appConfig.annotations.forEach(({
    metaName
  }) => {
    if (metaName in metadata && window.localStorage.userId in JSON.parse(metadata[metaName])) {
      numAnnotationsCompleted += 1
    }
  })
  const thumbnailImg = document.getElementById(`thumbnail_${thumbnailId}`)
  if (numAnnotationsCompleted === path.appConfig.annotations.length) {
    thumbnailImg.classList.add("annotationsCompletedThumbnail")
  } else if (numAnnotationsCompleted > 0) {
    thumbnailImg.classList.add("annotationsPartlyCompletedThumbnail")
  }
}

const isThumbnailsFirstPage = () => {
  // For use when changing thumbnails list from elsewhere, for instance showNextImageButton().
  const [thumbnailPrevPageBtn, _] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  return thumbnailPrevPageBtn.getAttribute("disabled") === "true"
}

const isThumbnailsLastPage = () => {
  // For use when changing thumbnails list from elsewhere, for instance showNextImageButton().
  const [_, thumbnailNextPageBtn] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  return thumbnailNextPageBtn.getAttribute("disabled") === "true"
}

const checkAndDisableButtons = (pageNum, totalPages) => {
  const [thumbnailPrevPageBtn, thumbnailNextPageBtn] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
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
  if (thumbnailToSelect) {
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

const addAnnotationToConfig = () => {
  const modalCloseBtn = document.getElementsByClassName("modal-footer")[0].querySelector("button[data-dismiss=modal]")
  modalCloseBtn.click()
  const newAnnotation = {
    "displayName": "",
    "annotationName": "",
    "metaName": "",
    "definition": "",
    "enableComments": false,
    "labelType": "",
    "labels": [],
    "createdBy": "",
    "createdAt": "",
    "private": false,
  }
  const annotationForm = document.getElementById("createAnnotationForm")
  annotationForm.querySelectorAll(".form-control").forEach(element => {
    if (element.name) {
      switch (element.name) {
        case "datasetFolderId":
          // Check if dataset folder exists in Box and if it has a config. Fetch it if it does.
          break

        case "displayName":
          if (!element.value) {
            alert("Annotation Name Missing!")
            return
          }
          newAnnotation["displayName"] = element.value
          newAnnotation["annotationName"] = element.value.split(" ").map((word, ind) => {
            if (ind === 0) {
              return word.toLowerCase()
            } else {
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            }
          }).join("")
          newAnnotation["metaName"] = `${newAnnotation["annotationName"]}_annotations`
          break

        case "displayText":
          if (!element.value) {
            alert("Label Name Missing!")
            return
          }
          const labelIndex = parseInt(element.id.split("_")[1])
          newAnnotation.labels[labelIndex] = newAnnotation.labels[labelIndex] ? {
            "displayText": element.value,
            ...newAnnotation.labels[labelIndex]
          } : {
            "displayText": element.value
          }
          break

        case "label":
          if (!element.value) {
            alert("Label Name Missing!")
            return
          }
          const labelIdx = parseInt(element.id.split("_")[1])
          newAnnotation.labels[labelIdx] = newAnnotation.labels[labelIdx] ? {
            "label": element.value,
            ...newAnnotation.labels[labelIdx]
          } : {
            "displayText": element.value
          }
          break

        default:
          newAnnotation[element.name] = element.type === "checkbox" ? element.checked : element.value
      }
    }
  })
  newAnnotation["createdAt"] = Date.now()
  newAnnotation["createdBy"] = window.localStorage.userId
  updateConfigInBox("annotations", "append", newAnnotation)
}

const updateConfigInBox = async (changedProperty = "annotations", operation, deltaData) => {
  if (deltaData) {
    const isFileJSON = true
    const appConfig = await box.getFileContent(configFileId, isFileJSON)
    if (appConfig) {
      if (operation === "append") {
        if (Array.isArray(appConfig[changedProperty])) {
          appConfig[changedProperty].push(deltaData)
        } else if (typeof (appConfig[changedProperty]) === "object") {
          appConfig[changedProperty] = {
            ...deltaData,
            ...appConfig[changedProperty]
          }
        }
      } else if (operation === "remove") {
        if (Array.isArray(appConfig[changedProperty])) {
          appConfig[changedProperty] = appConfig[changedProperty].filter(obj => obj !== deltaData)
        } else if (typeof (appConfig[changedProperty]) === "object" && appConfig[changedProperty][deltaData]) {
          delete appConfig[changedProperty][deltaData]
        } else {
          console.log("UPDATE CONFIG OPERATION FAILED!")
          return
        }
      }
    }

    const newConfigFormData = new FormData()
    const configFileAttributes = {
      "name": "appConfig.json"
    }
    const newConfigBlob = new Blob([JSON.stringify(appConfig)], {
      type: "application/json"
    })
    newConfigFormData.append("attributes", JSON.stringify(configFileAttributes))
    newConfigFormData.append("file", newConfigBlob)

    try {
      await box.updateFile(configFileId, newConfigFormData)
      showToast("New Annotation Added Successfully!")
      path.appConfig = appConfig
      path.appConfig.annotations.forEach(createAnnotationTables)
    } catch (e) {
      console.log("Couldn't upload new config to Box!", e)
      showToast("Some error occurred while adding the annotation. Please try again!")
    }
  }
}

const addLabelToModal = () => {
  const modalLabelsList = document.getElementById("modalLabelsList")
  const numLabelsAdded = modalLabelsList.childElementCount
  const newLabelRow = document.createElement("div")
  newLabelRow.setAttribute("class", "row")
  newLabelRow.innerHTML = `
    <div class="form-group row addedLabel">
      <div class="col">
        <input type="text" class="form-control" placeholder="Display Name*" name="displayText" id="labelDisplayText_${numLabelsAdded}" required="true"></input>
      </div>
    </div>
    <div class="form-group row addedLabel">
      <div class="col">
        <input type="text" class="form-control" placeholder="Label Value*" name="label" id="labelValue_${numLabelsAdded}" required="true"></input>
      </div>
    </div>
    <div class="col-sm-1">
    <button type="button" class="close" aria-label="Close" style="margin-top: 50%" onclick="removeLabelFromModal(this);">
      <span aria-hidden="true">&times;</span>
    </button>
    </div>
  `
  modalLabelsList.appendChild(newLabelRow)
}

const removeLabelFromModal = (target) => {
  const modalLabelsList = document.getElementById("modalLabelsList")
  modalLabelsList.removeChild(target.parentElement.parentElement)
}

const getModelPrediction = async (annotationType) => {

  // const getBase64FromImage = (image) => {
  //   const tmpCanvas = document.createElement("canvas")
  //   tmpCanvas.width = image.width
  //   tmpCanvas.height = image.height
  //   const tmpCtx = tmpCanvas.getContext("2d")
  //   tmpCtx.drawImage(image, 0, 0, image.width, image.height)
  //   return tmpCanvas.toDataURL().split("base64,")[1]
  // }
  let annotations = JSON.parse(window.localStorage.fileMetadata)[`${annotationType}_annotations`]
  annotations = annotations ? JSON.parse(annotations) : {}
  if (annotations["model"]) {
    return annotations["model"]
  }

  const payload = {
    annotationType,
    "image": path.tmaCanvas.toDataURL().split("base64,")[1]
  }
  const prediction = await utils.request("https://us-central1-nih-nci-dceg-episphere-dev.cloudfunctions.net/getPathPrediction", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, false).then(res => {
    return res.json()
  }).catch(err => {})

  if (prediction) {
    annotations["model"] = prediction
    const boxMetadataPath = `/${annotationType}_annotations`
    box.updateMetadata(hashParams.image, boxMetadataPath, JSON.stringify(annotations)).then(newMetadata => {
      window.localStorage.fileMetadata = JSON.stringify(newMetadata)
    })
    return prediction
  }
}

const loadLocalModel = async () => {
  path.model = await tf.automl.loadImageClassification("./model/model.json")
  console.log("LOADED", path.model)
}

const annotateFolder = async () => {
  path.annotationsForFolder = "id,tissue_adequacy,tissue_adequacy_score,url_in_app"
  const folderContents = JSON.parse(window.localStorage.allFilesInFolder)[hashParams.folder]

  const makePrediction = async (id) => {

    const imageElement = new Image()
    const actualImage = await box.getFileContent(id)
    imageElement.crossOrigin = "anonymous"
    imageElement.src = actualImage.url
    imageElement.onload = async () => {
      const pred = await path.model.classify(imageElement)
      const {
        label,
        prob
      } = pred.reduce((prev, current) => prev.prob > current.prob ? prev : current)
      path.annotationsForFolder += `\n${id},${label},${prob},${window.location.origin+window.location.pathname}#image=${id}`
      // return makePrediction(folderContents[1])
    }
  }
  folderContents.forEach(async (image, ind) => {
    await makePrediction(image)
  })
}

window.onload = path
window.onresize = path.loadCanvas
window.onhashchange = loadHashParams