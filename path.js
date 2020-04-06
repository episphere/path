const boxRootFolderId = "0"
// let configFileId = window.location.hash.includes("covid") ? 644912149213 : 627997326641
const configFileId = 627997326641
var currentThumbnailsList = []
const containsEmojiRegex = new RegExp("(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])")
const validFileTypes = [".jpg", ".jpeg", ".png", ".tiff"]

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
    .then(res => res.ok ? (returnJson ? res.json() : res) : res),
  
  isValidImage: (name) => {
    let isValid = false
    
    validFileTypes.forEach(fileType => {
      if (name.endsWith(fileType)) {
        isValid = true
      }
    })
    
    return isValid
  }
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
  path.tmaCanvasLoaded = false
  path.toolsDiv = document.getElementById("toolsDiv")
  path.tmaImage = new Image()
  path.setupEventListeners()


  await box()
  loadHashParams()
  loadDefaultImage()
  path.loadModules()

  path.tiffWorker = new Worker('processImage.js')
  path.tiffUnsupportedAlertShown = false

  if (hashParams.useWorker) {
    path.predictionworker = new Worker('modelPrediction.js')
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
    if (window.location.host.includes("localhost")) {
      loadLocalModel()
    }
  })

  const addClassificationModal = document.getElementById("addClassificationModal")
  addClassificationModal.addEventListener("show.bs.modal", (evt) => {
    document.getElementById("datasetFolderId").value = path.appConfig.datasetFolderId ? path.appConfig.datasetFolderId : "INVALID"
  })
  addClassificationModal.addEventListener("hidden.bs.modal", (evt) => {
    resetaddClassificationModal()
  })

  path.tmaImage.onload = async () => {
    path.loadCanvas()
    
    if (path.isImageFromBox) {
      
      await showThumbnailPicker(defaultThumbnailsListLength, window.localStorage.currentThumbnailsOffset)
      path.appConfig.annotations.forEach(createAnnotationTables)
      if (path.predictionworker) {
        path.predictionworker.postMessage(await tf.browser.fromPixels(path.tmaImage).array())
        path.predictionworker.onmessage = (e) => {
          console.log("Message received from worker!", e.data)
          // console.log("Prediction: ", e.data.reduce((maxLabel, pred) => {
          //   maxLabel.prob > pred.prob ? maxLabel : pred
          // }, 0))
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
    path.isImageFromBox = false
    document.getElementById("imgHeader").innerHTML = `<h5>Test Image</h5>`
  }
}

const loadImageFromBox = async (id, url) => {
  path.isImageFromBox = false

  if (await utils.boxRequest) {
    //Disable clicking on anything else while new image is loading.
    path.imageDiv.style["pointer-events"] = "none"

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
      },
      size,
      representations
    } = imageData

    if (type === "file" && utils.isValidImage(name)) {
      deactivateQualitySelectors()

      const fileMetadata = metadata && metadata.global.properties
      if (fileMetadata) {
        window.localStorage.fileMetadata = JSON.stringify(fileMetadata)
      } else {
        box.createMetadata(id, "file").then(res => {
          window.localStorage.fileMetadata = JSON.stringify(res)
        })
      }
      
      const allFilesInFolderObj = JSON.parse(window.localStorage.allFilesInFolder) || {}
      allFilesInFolderObj[parent.id] = parent.id in allFilesInFolderObj && allFilesInFolderObj[parent.id].length > 0 ? allFilesInFolderObj[parent.id] : []
      window.localStorage.allFilesInFolder = JSON.stringify(allFilesInFolderObj)
      window.localStorage.currentThumbnailsFolder = parent.id

      path.tmaImage.setAttribute("alt", name)
      
      if (!url) {
      
        if (name.endsWith(".tiff")) {
          if (!path.tiffUnsupportedAlertShown && typeof OffscreenCanvas !== "function") { // Alert for browsers without OffscreenCanvas support.
            alert("TIFF files might not work well in this browser. Please use the Google Chrome browser for the best experience!")
            path.tiffUnsupportedAlertShown = true
          }

          if (!fileMetadata["jpegRepresentation"]) { // Get a temporary png from Box, send to web worker for tiff to png conversion.
            const maxResolutionRep = representations.entries.reduce((maxRep, rep) => {
              const resolution = Math.max(...rep.properties.dimensions.split("x").map(Number))
              if (resolution > maxRep.resolution) {
                return {
                  resolution,
                  url: rep.info.url.replace("api.box.com", "dl.boxcloud.com/api") + `/content/1.${rep.representation}`
                }
              } else {
                return maxRep
              }
            }, { resolution: 0, url: "" })
            
            console.log("Representation not found, loading Box's.", new Date())
            url = await box.getRepresentation(maxResolutionRep.url)
            await loadImgFromBoxFile(null, url)

            if (typeof OffscreenCanvas === "function") {
              path.tiffWorker.postMessage({
                'boxAccessToken': JSON.parse(window.localStorage.box)["access_token"],
                'imageId': id,
                name,
                size
              })
              
              path.tiffWorker.onmessage = (evt) => {
                const { originalImageId, metadataWithRepresentation: newMetadata, representationFileId } = evt.data
                if (originalImageId === hashParams.image) {
                  console.log("Conversion completion message received from worker, loading new image", new Date())
                  loadImgFromBoxFile(representationFileId)
                  window.localStorage.fileMetadata = JSON.stringify(newMetadata)
                }
              }

              path.tiffWorker.onerror = (err) => {
                console.log("Error converting TIFF from worker", err)
              }
            }

          } else { // Just use the representation created before.
            const { representationFileId} = JSON.parse(fileMetadata["jpegRepresentation"])
            console.log("Using the JPEG representation created already", new Date())
            await loadImgFromBoxFile(representationFileId)
          }
        
        } else {
          await loadImgFromBoxFile(id)
        }
      }

      
      addImageHeader(filePathInBox, id, name)
      window.localStorage.currentImage = id
      
      if (!hashParams.folder) {
        selectFolder(parent.id)
      }
    } else {
      alert("The ID in the URL does not point to a valid image file (.jpg/.png/.tiff) in Box.")
    }
    // Re-enable click events once image has been loaded.
    path.imageDiv.style["pointer-events"] = "auto"
  }
}

const loadImgFromBoxFile = async (id, url) => {
  if (id && !url) {
    const fileContent = await box.getFileContent(id)
    url = fileContent.url
  }
  path.isImageFromBox = true
  path.tmaImage.setAttribute("src", "")
  path.tmaImage.setAttribute("src", url)
  path.tmaImage.setAttribute("crossorigin", "Anonymous")
}

const addImageHeader = (filePathInBox, id, name) => {
  const imgHeader = document.getElementById("imgHeader")
  imgHeader.style.display = "inline-block"
  imgHeader.innerHTML = ""
  const folderStructure = document.createElement("ol")
  folderStructure.setAttribute("class", "breadcrumb")
  folderStructure.style.background = "none"
  folderStructure.style.margin = "0 0 0.5rem 0"
  folderStructure.style.padding = 0
  filePathInBox.forEach(folder => {
    if (folder.id !== "0") {
      const folderItem = document.createElement("li")
      folderItem.setAttribute("class", "breadcrumb-item")
      const folderLink = document.createElement("a")
      folderLink.setAttribute("href", `${box.appBasePath}/${folder.type}/${folder.id}`)
      folderLink.setAttribute("target", "_blank")
      folderLink.innerText = path.tmaCanvas.getBoundingClientRect().width < 550 ? folder.name.trim().slice(0, 7) + "..." : folder.name.trim()
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
  fileLink.style.whiteSpace = "nowrap"
  fileLink.style.textOverflow = "ellipsis"
  fileLink.style.overflow = "hidden"
  fileLink.innerText = name.length > 20 ? name.trim().slice(0,20) + "..." : name.trim()
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

  if (folderData && folderData.item_status === "active") {
    const {
      item_collection: {
        entries
      }
    } = folderData
    
    const parentElement = document.getElementById("boxFolderTree")

    if (entries.length !== 0) {
      const loaderElementId = "fileMgrLoaderDiv"
      if (parentElement.childElementCount > 0) {
        showLoader(loaderElementId, parentElement)
      }
      
      parentElement.firstChild && parentElement.removeChild(parentElement.firstChild) // Removes Empty Directory element (I think :P) 
      const folderSubDiv = populateBoxFolderTree(entries, id)
      hideLoader(loaderElementId)

      const boxFileMgrHeader = document.getElementById("boxFileMgrHeader")
      parentElement.style.height = path.tmaCanvasLoaded ? path.tmaCanvas.height - boxFileMgrHeader.getBoundingClientRect().height : window.innerHeight - parentElement.getBoundingClientRect().y - 40 // 40 seems to be the initial width of the canvas

      folderSubDiv.style.height = "100%"
      folderSubDiv.style.width = "100%"
      folderSubDiv.style.overflowY = "scroll"

      parentElement.appendChild(folderSubDiv)

    } else if (entries.length === 0) {
      parentElement.style.textAlign = "center"
      parentElement.innerText = "-- Empty Folder --"
    }
  }
}

const populateBoxFolderTree = (entries, id) => {
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
      if (utils.isValidImage(entry.name)) {
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
      } else if (entry.type === "file" && utils.isValidImage(entry.name)) {
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
  // Condition checks if path.tmaImage.src is empty
  if (path.tmaImage.src !== window.location.origin + window.location.pathname) {
    path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width)
    path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)

    const tmaContext = path.tmaCanvas.getContext("2d")
    tmaContext.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
    path.tmaCanvasLoaded = true

    document.getElementById("canvasWithPickers").style.borderLeft = "1px solid lightgray"
    document.getElementById("canvasWithPickers").style.borderRight = "1px solid lightgray"

    if (!path.options) {
      path.loadOptions()
    }
  }
}

path.loadOptions = () => {
  path.options = true
  document.getElementById("toolsOuterDiv").style.visibility = "visible"
  addLocalFileButton()
  zoomButton()
  segmentButton()
}

path.qualityAnnotate = async (annotationName, qualitySelected) => {
  if (await box.isLoggedIn()) {
    const imageId = hashParams.image
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
    const newMetadata = await box.updateMetadata(imageId, boxMetadataPath, JSON.stringify(annotations))

    if (!newMetadata.status) { // status is returned only on error, check for errors properly later
      window.localStorage.fileMetadata = JSON.stringify(newMetadata)
      showToast(`Annotation Successful!`)
      borderByAnnotations(hashParams.image, newMetadata)
      if (imageId === hashParams.image) {
        activateQualitySelector(annotationName, annotations)
        showNextImageButton(newMetadata)
      }
    } else {
      showToast("Error occurred during annotation, please try again later!")
    }
  }
}

const showNextImageButton = (metadata) => {
  metadata = metadata || JSON.parse(window.localStorage.fileMetadata)
  const numAnnotationsCompleted = getNumCompletedAnnotations(metadata)
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
  segmentDiv.setAttribute("title", "Under Development!")
  
  const segmentBtn = document.createElement("button")
  segmentBtn.setAttribute("class", "btn btn-outline-primary")
  segmentBtn.setAttribute("disabled", "")
  
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
  
  new Tooltip(segmentDiv, {
    'placement': "bottom",
    'animation': "slideNfade",
    'delay': 50
  })
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

const addLocalFileButton = async () => {
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
    document.getElementById("imgHeader").innerHTML = `<h5>${files[0].name}</h5>`
    if (hashParams.image) {
      selectImage(null)
      window.localStorage.currentImage = ""
      window.localStorage.currentFolder = ""
    }
    path.isImageFromBox = false
    path.tmaImage.setAttribute("src", "") // Unsetting src because Firefox does not update image otherwise.
    path.tmaImage.setAttribute("src", URL.createObjectURL(files[0]))
    path.tmaImage.setAttribute("crossorigin", "Anonymous")
    document.getElementById("annotations").style.display = "none"
    document.getElementById("thumbnailPicker").style.display = "none"
  }

  addFileBtn.setAttribute("title", "Add Local File")
  new Tooltip(addFileBtn, {
    'placement': "bottom",
    'animation': "slideNfade",
    'delay': 50
  })

  path.toolsDiv.appendChild(addFileBtnDiv)
  
}

const createAnnotationTables = async (annotation, forceRedraw=false) => {
  
  const {
    annotationId,
    displayName,
    annotationName,
    definition,
    enableComments
  } = annotation
  
  const annotationsAccordion = document.getElementById("annotationsAccordion")
  if (annotationsAccordion.childElementCount > path.appConfig.annotations.length) {
    annotationsAccordion.innerHTML = ""
  }

  let annotationCard = annotationsAccordion.querySelector(`#annotation_${annotationId}Card`)

  if (annotationCard && forceRedraw) {
    annotationCard.parentElement.removeChild(annotationCard)
    annotationCard = undefined
  }

  if (!annotationCard || annotationCard.childElementCount === 0) {
    const annotationCardDiv = document.createElement("div")
    annotationCardDiv.setAttribute("class", "card annotationsCard")
    annotationCardDiv.setAttribute("id", `annotation_${annotationId}Card`)
    annotationCardDiv.style.overflow = "visible"
    let annotationCard = `
      <div class="card-header">
        <div class="annotationWithMenuHeader">
          <div class="classWithDefinition">
            <h2 class="mb-0">
              <button class="btn btn-link classCardHeader" type="button" data-toggle="collapse"
                data-target="#${annotationName}Annotations" id="${annotationName}Toggle">
                ${displayName}
              </button>
            </h2>
    `

    if (definition) {
      annotationCard += `
            <button class="btn btn-light classDefinitionPopup" id="${annotationName}_definitionPopup" type="button" data-toggle="popover">
              <i class="fas fa-info-circle"></i>
            </button>
      `
    }

    annotationCard += `
          </div>
          <div class="btn-group dropdown classificationMenu" id="${annotationName}_classificationMenu">
            <button class="btn btn-light dropdown-toggle classificationMenuToggle" role="button" id="${annotationName}_classificationMenuToggle" data-toggle=dropdown aria-haspopup="true" aria-expanded="false">
              <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="dropdown-menu dropdown-menu-right classificationMenuDropdown">
              <div class="classificationMenuButtons">
                <button class="btn btn-light classificationMenuOption" role="button" id="${annotationName}_editClassification" title="Edit" onclick="editClassificationConfig(${annotationId})"  aria-haspopup="true" aria-expanded="false">
                  <i class="fas fa-pencil-alt"></i> &nbsp;Edit Config
                </button>
                <hr/>
                <button class="btn btn-light classificationMenuOption" role="button" id="${annotationName}_deleteClassification" title="Delete" onclick="deleteClassificationConfig(${annotationId})" aria-haspopup="true" aria-expanded="false">
                  <i class="fas fa-trash-alt"></i> &nbsp;Delete Class
                </button>
              </div>
            </div>
          </div>
        </div>
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
          <div id="${annotationName}_comments" class="quality_addComment form-group">
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
                <button type="button" onclick=cancelEditComment("${annotationName}") id="${annotationName}_cancelEditComment" class="btn btn-link">Cancel</button>
                <button type="submit" onclick=submitAnnotationComment("${annotationName}") id="${annotationName}_submitComment" class="btn btn-info" disabled>Submit</button>
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
    new Dropdown(document.getElementById(`${annotationName}_classificationMenu`))

    if (definition) {
      new Popover(document.getElementById(`${annotationName}_definitionPopup`), {
        placement: "right",
        animation: "slidenfade",
        delay: 100,
        dismissible: false,
        trigger: "hover",
        content: definition
      })
    }

    if (enableComments) {
      
      const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
      new Collapse(toggleCommentsButton)
      toggleCommentsButton.addEventListener("shown.bs.collapse", (evt) => {
        toggleCommentsButton.innerHTML = "- Hide All Comments"
      })
      toggleCommentsButton.addEventListener("hidden.bs.collapse", (evt) => {
        toggleCommentsButton.innerHTML = "+ Show All Comments"
      })
      
      const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
      const commentsSubmitButton = document.getElementById(`${annotationName}_submitComment`)
      commentsTextField.oninput = (evt) => {
        if (commentsTextField.value.length > 0) {
          commentsSubmitButton.removeAttribute("disabled")
        } else {
          commentsSubmitButton.setAttribute("disabled", "true")
        }
      }
      commentsTextField.onkeydown = (evt) => {
        if (evt.shiftKey && evt.keyCode === 13) {
          evt.preventDefault()
          commentsSubmitButton.click()
        }
      }
    }
  }
  showQualitySelectors(annotation)
  showNextImageButton()
  populateComments(annotationName)
  annotationsAccordion.parentElement.style.display = "block"
}

const showQualitySelectors = async (annotation) => {
  const {
    annotationName,
    labels,
  } = annotation
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const fileAnnotations = fileMetadata[`${annotationName}_annotations`] && JSON.parse(fileMetadata[`${annotationName}_annotations`])
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
      let qualityButtonClass = "btn btn-outline-info labelText"
      if (containsEmojiRegex.test(displayText)) {
        qualityButtonClass += " emojiText"
      } else {
        qualityButtonClass += " normalText"
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
      predictionTableData.innerHTML = "--"
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

const submitAnnotationComment = (annotationName) => {
  const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
  const commentText = commentsTextField.value.trim()

  if(commentText.length === 0) {
    return
  }
  
  const newCommentMetadata = {
    "commentId": Math.floor(1000000 + Math.random()*9000000),
    "userId": window.localStorage.userId,
    "createdBy": window.localStorage.username,
    "text": commentText,
    "isPrivate": !(document.getElementById(`${annotationName}_commentsPublic`).checked)
  }
  
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const annotationComments = fileMetadata[`${annotationName}_comments`] ? JSON.parse(fileMetadata[`${annotationName}_comments`]) : []
  const editingCommentId = parseInt(commentsTextField.getAttribute("editingCommentId"))
  // If comment is an edit of a previously submitted comment, replace it, otherwise add a new one.
  if (editingCommentId) {
    newCommentMetadata["modifiedAt"] = Date.now()
    const editingCommentIndex = annotationComments.findIndex(comment => comment["commentId"] === editingCommentId)
    annotationComments[editingCommentIndex] = newCommentMetadata
  } else {
    newCommentMetadata["createdAt"] = Date.now()
    annotationComments.push(newCommentMetadata)
  }

  updateCommentsInBox(annotationName, annotationComments)
}

const updateCommentsInBox = async (annotationName, annotationComments) => {
  const boxMetadataPath = `/${annotationName}_comments`
  try {
    const newMetadata = await box.updateMetadata(hashParams.image, boxMetadataPath, JSON.stringify(annotationComments))
    
    if (JSON.parse(newMetadata[`${annotationName}_comments`]).length < JSON.parse(JSON.parse(window.localStorage.fileMetadata)[`${annotationName}_comments`]).length) {
      showToast("Comment Deleted Successfully!")
    } else {
      showToast("Comment Added Successfully!")
    }
    
    window.localStorage.fileMetadata = JSON.stringify(newMetadata)
    populateComments(annotationName)
    
    const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
    if (toggleCommentsButton.classList.contains("collapsed")) {
      toggleCommentsButton.click()
    }
    document.getElementById(`${annotationName}_allCommentsCard`).scrollTop = document.getElementById(`${annotationName}_allCommentsCard`).scrollHeight
    
    cancelEditComment(annotationName)
    return newMetadata
  } catch (e) {
    showToast("Some error occurred adding your comment. Please try later!")
    console.log(e)
  }
}

const populateComments = (annotationName) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
  const commentsCard = document.getElementById(`${annotationName}_allCommentsCard`)
 
  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments.length > 0) {
      let commentsSortedByTime = annotationComments.sort((prevComment, currentComment) => prevComment.createdAt - currentComment.createdAt )
      // To resolve breaking change of comments not having the ID field before. Assign old comments IDs and store them back in Box.
      commentsSortedByTime = commentsSortedByTime.map(comment => {
        const commentWithId = { ...comment }
        if (!commentWithId["commentId"]) {
          commentWithId["commentId"] = Math.floor(1000000 + Math.random()*9000000)
        }
        return commentWithId
      })
      if (JSON.stringify(annotationComments) !== JSON.stringify(commentsSortedByTime)) {
        updateCommentsInBox(annotationName, commentsSortedByTime)
      }

      const visibleComments = commentsSortedByTime.filter(comment => comment.userId === window.localStorage.userId || !comment.isPrivate)
      
      if (visibleComments) {
        const userCommentIds = []
        
        const commentsHTML = visibleComments.map((comment, index) => {
          const {commentId} = comment
          let commentElement = `
            <span class="annotationComment" id="${annotationName}_comment_${commentId}">
              <span class="annotationCommentText">
                <b>
                  <u style="color: dodgerblue;">${comment.createdBy.trim()}</u> :
                </b>
                <strong style="color: rgb(85, 85, 85);">
                  ${comment.text}
                </strong>
              </span>
          `

          if (comment.userId === window.localStorage.userId) {
            const commentDropdownMenu = `
              <div class="btn-group dropleft dropdown commentMenu" id="${annotationName}_commentMenu_${commentId}">
                <button class="btn btn-light dropdown-toggle commentMenuToggle" role="button" id="${annotationName}_commentMenuToggle_${commentId}" data-toggle=dropdown aria-haspopup="true" aria-expanded="false">
                  <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="dropdown-menu commentMenuDropdown" style="top: -10px;">
                  <div class="commentMenuButtons">
                    <button class="btn btn-light commentMenuOption" role="button" id="${annotationName}_editComment_${commentId}" title="Edit" onclick="editAnnotationComment('${annotationName}', ${commentId})"  aria-haspopup="true" aria-expanded="false">
                      <i class="fas fa-pencil-alt"></i>
                    </button>
                    <div style="border-left: 1px solid lightgray; height: auto;"></div>
                    <button class="btn btn-light commentMenuOption" role="button" id="${annotationName}_deleteComment_${commentId}" title="Delete" onclick="deleteAnnotationComment('${annotationName}', ${commentId})" aria-haspopup="true" aria-expanded="false">
                      <i class="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              </div>
            `
            commentElement += commentDropdownMenu
            userCommentIds.push(commentId)
          }

          commentElement += "</span>"
          commentElement += (index !== commentsSortedByTime.length - 1) ? "<hr/>" : ""
          return commentElement
        }).join("")

        commentsCard.innerHTML = commentsHTML        
        
        userCommentIds.forEach(commentId => {
          const commentMenu = document.getElementById(`${annotationName}_commentMenu_${commentId}`)
          const commentMenuDropdown = new Dropdown(commentMenu)
          new Tooltip(document.getElementById(`${annotationName}_editComment_${commentId}`), {
            'placement': "bottom",
            'animation': "slideNfade",
            'delay': 50
          })
          new Tooltip(document.getElementById(`${annotationName}_deleteComment_${commentId}`), {
            'placement': "bottom",
            'animation': "slideNfade",
            'delay': 50
          })
          const commentSpan = document.getElementById(`${annotationName}_comment_${commentId}`)
          commentSpan.onmouseover = () => {
            document.getElementById(`${annotationName}_commentMenu_${commentId}`).style.display = "block"
          }
          commentSpan.onmouseleave = () => {
            const commentMenuIsOpen = commentMenu.querySelector("div.commentMenuDropdown").classList.contains("show")
            if (!commentMenuIsOpen) {
              document.getElementById(`${annotationName}_commentMenu_${commentId}`).style.display = "none"
            }
          }
        })
        
        toggleCommentsButton.innerHTML = "+ Show All Comments"
        toggleCommentsButton.parentElement.style["text-align"] = "left"
        toggleCommentsButton.removeAttribute("disabled")

        return
      }
    }
  }
  
  commentsCard.innerHTML = ""
  if ( !(toggleCommentsButton.classList.contains("collapsed")) ) {
    toggleCommentsButton.Collapse.hide()
  }
  toggleCommentsButton.parentElement.style["text-align"] = "center"
  toggleCommentsButton.setAttribute("disabled", "true")
  toggleCommentsButton.innerHTML = "-- No Comments To Show --"

}

const editAnnotationComment = async (annotationName, commentId) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments){
      const commentToEdit = annotationComments.find(comment => comment["commentId"] === commentId)
      if (commentToEdit) {
        const { userId, text, isPrivate } = commentToEdit
        if (userId === window.localStorage.userId) {
          const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
          commentsTextField.setAttribute("editingCommentId", commentId)
          commentsTextField.value = text
          document.getElementById(`${annotationName}_commentsPublic`).checked = !isPrivate
          commentsTextField.focus()
          if (text.trim().length > 0) {
            document.getElementById(`${annotationName}_submitComment`).removeAttribute("disabled")
          }
        }
      }
    }
  }
}

const deleteAnnotationComment = async (annotationName, commentId) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments) {
      const commentsAfterDelete = annotationComments.filter(comment => comment["commentId"] !== commentId)
      if (commentsAfterDelete.length !== annotationComments.length) {
        updateCommentsInBox(annotationName, commentsAfterDelete)
      }
    }
  }
}

const cancelEditComment = async (annotationName) => {
  document.getElementById(`${annotationName}_commentsTextField`).value = ""
  document.getElementById(`${annotationName}_commentsTextField`).removeAttribute("editingCommentId")
  document.getElementById(`${annotationName}_commentsPublic`).checked = false
  document.getElementById(`${annotationName}_submitComment`).setAttribute("disabled", "true")
}

const activateQualitySelector = (annotationName, fileAnnotations) => {
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
    const newActiveButton = selectTable.querySelector(`button[value='${userAnnotation}']`)
    if (newActiveButton) {
      newActiveButton.classList.add("active")
    }
  }
}

const deactivateQualitySelectors = () => {
  const activeQualitySelector = document.querySelectorAll("button.labelText.active")
  activeQualitySelector.forEach(element => element.classList.remove("active"))
}

const showThumbnailPicker = async (limit, offset = 0) => {
  const thumbnailPicker = document.getElementById("thumbnailPicker")
  thumbnailPicker.style.display = "flex"
  thumbnailPicker.style["flex-direction"] = "column"
  thumbnailPicker.style.height = window.innerHeight - thumbnailPicker.parentElement.getBoundingClientRect().y - 50
  
  if (thumbnailPicker.childElementCount === 0 || thumbnailPicker.getAttribute("folder") !== window.localStorage.currentThumbnailsFolder || window.localStorage.currentThumbnailsOffset !== offset) {
    thumbnailPicker.setAttribute("folder", window.localStorage.currentThumbnailsFolder)
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
        if (entry.type === "file" && utils.isValidImage(entry.name)) {
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
    if (thumbnail.type === "file" && utils.isValidImage(thumbnail.name)) {
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
      
      thumbnailDiv.appendChild(thumbnailImg)
      const thumbnailNameText = document.createElement("span")
      thumbnailNameText.setAttribute("class", "imagePickerThumbnailText")
      const thumbnailNameWithoutExtension = name.trim().split(".")
      thumbnailNameWithoutExtension.pop()
      const thumbnailName = thumbnailNameWithoutExtension.join("")
      thumbnailDiv.appendChild(thumbnailNameText)
      thumbnailsListDiv.appendChild(thumbnailDiv)
      thumbnailDiv.onclick = () => selectImage(thumbnailId)

      box.getThumbnail(thumbnailId).then(res => {
        thumbnailImg.setAttribute("src", res)
        thumbnailNameText.innerText = thumbnailName
        thumbnailNameText.style.width = thumbnailImg.getBoundingClientRect().width
        thumbnailNameText.style["text-overflow"] = "ellipsis"
        thumbnailNameText.style["white-space"] = "nowrap"
        thumbnailNameText.style["overflow"] = "hidden"
      })
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

const getNumCompletedAnnotations = (metadata) => {
  const numAnnotationsCompleted = path.appConfig.annotations.reduce((total, { annotationName }) => {
    if (metadata[`${annotationName}_annotations`] && window.localStorage.userId in JSON.parse(metadata[`${annotationName}_annotations`])) {
      total += 1
    }
    return total
  },0)
  return numAnnotationsCompleted
}

const borderByAnnotations = (thumbnailId, metadata=JSON.parse(window.localStorage.fileMetadata)) => {
  const numAnnotationsCompleted = getNumCompletedAnnotations(metadata)
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
  let hash = decodeURIComponent(window.location.hash)
  if (imageId && imageId !== hashParams.image) {
   
    if (hashParams.image) {
      hash = hash.replace(`image=${hashParams.image}`, `image=${imageId}`)
    } else {
      hash += hash.length > 0 ? "&" : ""
      hash += `image=${imageId}`
    }
    window.location.hash = hash

  } else if (!imageId) {
    const imageParam = `image=${hashParams.image}`
    const imageParamIndex = hash.indexOf(imageParam)
    
    if (hash[imageParamIndex-1] === "&") {  // if hash is of the form "...&image=abc...", remove preceding & also.
      hash = hash.replace(`&${imageParam}`, "")
    } else if (hash[imageParamIndex + imageParam.length] === "&") { // if hash is of the form "#image=abc&...", remove following & also.
      hash = hash.replace(`${imageParam}&`, "")
    } else { // if hash is just #image=abc, remove just the param.
      hash = hash.replace(imageParam, "")
    }
  
    window.location.hash = hash
  }
}

const selectFolder = (folderId) => {
  if (folderId && folderId !== hashParams.folder) {
    if (hashParams.folder) {
      window.location.hash = window.location.hash.replace(`folder=${hashParams.folder}`, `folder=${folderId}`)
    } else {
      window.location.hash += window.location.hash.length > 0 ? "&" : ""
      window.location.hash += `folder=${folderId}`
    }
  } else if (!folderId) {
    let hash = decodeURIComponent(window.location.hash)
    const folderParam = `folderParam=${hashParams.image}`
    const folderParamIndex = hash.indexOf(folderParam)
    
    if (hash[folderParamIndex-1] === "&") {  // if hash is of the form "...&folder=abc...", remove preceding & also.
      hash = hash.replace(`&${folderParam}`, "")
    } else if (hash[folderParamIndex + folderParam.length] === "&") { // if hash is of the form "#folder=abc&...", remove following & also.
      hash = hash.replace(`${folderParam}&`, "")
    } else { // if hash is just #folder=abc, remove just the param.
      hash = hash.replace(folderParam, "")
    }
    window.location.hash = hash
  }
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

const editClassificationConfig = (annotationId) => {
  const annotationForm = document.getElementById("createClassificationForm")
  annotationForm.setAttribute("annotationId", annotationId)
  
  const annotationToEdit = path.appConfig.annotations.filter(annotation => annotation["annotationId"] === annotationId)[0]
  if (annotationToEdit) {
    document.getElementById("addClassificationBtn").Modal.show()
    document.getElementById("addClassificationModal").querySelector("button[type=submit]").innerHTML = "Update Class"
   
    annotationForm.querySelectorAll(".form-control").forEach(element => {
    
      if (element.name && !element.classList.contains("classLabelField")) {
     
        switch(element.name) {
          case "datasetFolderId":
            break

            case "displayName":
            case "definition":
              element.value = annotationToEdit[element.name]
            break
            
            case "labelType":
              element.value = annotationToEdit[element.name]
              displayLabelsSectionInModal(element)
          
          case "enableComments":
            element.checked = annotationToEdit.enableComments
            break
          
          default:
        }
      }
    })

    annotationForm.querySelector("div#modalLabelsList").innerHTML = ""
    annotationToEdit.labels.forEach(label => {
      const newLabelRow = addLabelToModal()
      newLabelRow.querySelector("input[name=labelDisplayText]").value = label.displayText
      newLabelRow.querySelector("input[name=labelValue]").value = label.label
    })
    
  }
}

const deleteClassificationConfig = async (annotationId) => {
  if (confirm("This will delete this classification for everyone with access to this dataset. Are you sure you want to continue?")) {
    const annotationToDelete = path.appConfig.annotations.filter(annotation => annotation["annotationId"] === annotationId)[0]
    if (annotationToDelete) {
      updateConfigInBox("annotations", "remove", annotationToDelete, "annotationId")
    }
  }
}

const addClassificationToConfig = () => {
  let formIsValid = true
  let alertMessage = ""
  const annotationForm = document.getElementById("createClassificationForm")

  const annotationIdToEdit = parseInt(annotationForm.getAttribute("annotationId"))

  const newAnnotation = {
    "annotationId": annotationIdToEdit || Math.floor(1000000 + Math.random()*9000000), //random 7 digit annotation ID
    "displayName": "",
    "annotationName": "",
    "definition": "",
    "enableComments": false,
    "labelType": "",
    "labels": [],
    "createdBy": "",
    "private": false,
  }

  annotationForm.querySelectorAll(".form-control").forEach(element => {
    if (element.name) {
      switch (element.name) {
        case "datasetFolderId":
          // Check if dataset folder exists in Box and if it has a config. Fetch it if it does.
          break

        case "displayName":
          if (!element.value) {
            formIsValid = false
            alertMessage = "Please enter values for the missing fields!"

            element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
            element.oninput = element.oninput ? element.oninput : () => {
              if (element.value) {
                element.style.boxShadow = "none"
              } else {
                element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              }
            }
            
            break
          }
          
          newAnnotation["displayName"] = element.value
          
          newAnnotation["annotationName"] = element.value.split(" ").map((word, ind) => {
            if (ind === 0) {
              return word.toLowerCase()
            } else {
              return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            }
          }).join("")
          newAnnotation["annotationName"] += `_${newAnnotation["annotationId"]}`
          
          break

        case "labelDisplayText":
          if (!element.value) {
            formIsValid = false
            alertMessage = "Please enter values for the missing fields!"

            element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
            element.oninput = element.oninput ? element.oninput : () => {
              if (element.value) {
                element.style.boxShadow = "none"
              } else {
                element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              }
            }
          }
          else {
            const alreadyDefinedLabels = newAnnotation.labels.map(label => label.displayText)
            if (alreadyDefinedLabels.indexOf(element.value) != -1 ) {
              formIsValid = false
              alertMessage = alertMessage || "Labels must have unique values!"
              element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              document.getElementById(`labelDisplayText_${alreadyDefinedLabels.indexOf(element.value)}`).style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)"
              break
            }

            const labelTextIndex = parseInt(element.id.split("_")[1])
            newAnnotation.labels[labelTextIndex] = newAnnotation.labels[labelTextIndex] ? {
              "displayText": element.value,
              ...newAnnotation.labels[labelTextIndex]
            } : {
              "displayText": element.value
            }
          }
          
          break

        case "labelValue":
          if (!element.value) {
            formIsValid = false
            alertMessage = "Please enter values for the missing fields!"

            element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
            element.oninput = element.oninput ? element.oninput : () => {
              if (element.value) {
                element.style.boxShadow = "none"
              } else {
                element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              }
            }

          } else {
            const alreadyDefinedLabels = newAnnotation.labels.map(label => label.label)
            if (alreadyDefinedLabels.indexOf(element.value) != -1 ) {
              formIsValid = false
              alertMessage = alertMessage || "Labels must have unique values!"
              element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              document.getElementById(`labelValue_${alreadyDefinedLabels.indexOf(element.value)}`).style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)"
              break
            }
            
            const labelValueIndex = parseInt(element.id.split("_")[1])
            newAnnotation.labels[labelValueIndex] = newAnnotation.labels[labelValueIndex] ? {
              "label": element.value,
              ...newAnnotation.labels[labelValueIndex]
            } : {
              "displayText": element.value
            }
          }

          break

        default:
          if (element.type === "checkbox") {
            newAnnotation[element.name] = element.checked
          } else {
            if (element.name === "labelType" && !element.value) {
              formIsValid = false
              alertMessage = "Please enter values for the missing fields!"

              element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
              element.oninput = element.oninput ? element.oninput : () => {
                if (element.value) {
                  element.style.boxShadow = "none"
                } else {
                  element.style.boxShadow = "0px 0px 10px rgba(200, 0, 0, 0.85)";
                }
              }
              
              break
            }
            newAnnotation[element.name] = element.value
          }
      }
    }
  })

  if (!formIsValid) {
    alert(alertMessage)
    return
  }
  
  if(annotationIdToEdit) {
    newAnnotation["modifiedAt"] = Date.now()
    newAnnotation["lastModifiedByUserId"] = window.localStorage.userId
    newAnnotation["lastModifiedByUsername"] = window.localStorage.username
    updateConfigInBox("annotations", "modify", newAnnotation, "annotationId")
  } else {
    newAnnotation["createdAt"] = Date.now()
    newAnnotation["createdByUserId"] = window.localStorage.userId
    newAnnotation["createdByUsername"] = window.localStorage.userId
    updateConfigInBox("annotations", "append", newAnnotation)
  }
  
  const modalCloseBtn = document.getElementsByClassName("modal-footer")[0].querySelector("button[data-dismiss=modal]")
  modalCloseBtn.click()
  resetaddClassificationModal()
}

const updateConfigInBox = async (changedProperty = "annotations", operation, deltaData, identifier) => {
  let toastMessage = ""
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
      
        toastMessage = "New Class Added Successfully!"
      
      } else if (operation === "remove") {
     
        if (Array.isArray(appConfig[changedProperty])) {
          appConfig[changedProperty] = appConfig[changedProperty].filter(val => {
            if (typeof(val) === "object" && val[identifier]) {
              return val[identifier] !== deltaData[identifier]
            } else {
              return val !== deltaData
            }
          })
        } else if (typeof (appConfig[changedProperty]) === "object" && appConfig[changedProperty][deltaData]) {
          delete appConfig[changedProperty][deltaData]
        }
    
        toastMessage = "Class Removed From Config!"
     
      } else if (operation === "modify") {
  
        if (Array.isArray(appConfig[changedProperty])) {
 
          const indexToChangeAt = appConfig[changedProperty].findIndex(val => {
            if (typeof(val) === "object" && val[identifier]) {
              return val[identifier] === deltaData[identifier]
            } else {
              return val === deltaData
            }
          })
  
          if (indexToChangeAt !== -1) {
            appConfig[changedProperty][indexToChangeAt] = deltaData
          }
  
        } else if (typeof(appConfig[changedProperty]) === "object") {
          appConfig[changedProperty] = deltaData
        }
        toastMessage = "Class Updated Successfully!"
      }
    } else {
      console.log("UPDATE CONFIG OPERATION FAILED!")
      return
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
      await box.uploadFile(configFileId, newConfigFormData)
      showToast(toastMessage)
      path.appConfig = appConfig
      path.appConfig.annotations.forEach(annotation => createAnnotationTables(annotation, annotation[identifier] === deltaData[identifier]))
      const reBorderThumbnails = () => {
        const allThumbnails = document.querySelectorAll("img.imagePickerThumbnail")
        const allThumbnailIDs = []
        allThumbnails.forEach(thumbnail => allThumbnailIDs.push(thumbnail.id.split("_")[1]))
        allThumbnailIDs.map(getAnnotationsForBorder)
      }
      reBorderThumbnails()
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
        <input type="text" class="form-control" placeholder="Display Name*" name="labelDisplayText" id="labelDisplayText_${numLabelsAdded}" oninput="prefillLabelValueInModal(${numLabelsAdded})" required="true"></input>
      </div>
    </div>
    <div class="form-group row addedLabel">
      <div class="col">
        <input type="text" class="form-control" placeholder="Label Value*" name="labelValue" id="labelValue_${numLabelsAdded}" oninput="this.setAttribute('userInput', true)" required="true"></input>
      </div>
    </div>
    <div class="col-sm-1">
    <button type="button" class="close" aria-label="Close" style="margin-top: 50%" onclick="removeLabelFromModal(this);">
      <span aria-hidden="true">&times;</span>
    </button>
    </div>
  `
  modalLabelsList.appendChild(newLabelRow)
  return newLabelRow
}

const prefillLabelValueInModal = (labelInputIndex) => {
  const elementToPrefillFrom = document.getElementById(`labelDisplayText_${labelInputIndex}`)
  const elementToPrefillInto = document.getElementById(`labelValue_${labelInputIndex}`)
  if (elementToPrefillFrom && elementToPrefillInto && !elementToPrefillInto.getAttribute("userInput")) {
    elementToPrefillInto.value = elementToPrefillFrom.value
  }
}

const removeLabelFromModal = (target) => {
  const modalLabelsList = document.getElementById("modalLabelsList")
  modalLabelsList.removeChild(target.parentElement.parentElement)
}

const displayLabelsSectionInModal = (selectElement) => {
  if (selectElement.value) {
    document.getElementById("addLabelsToModal").style.display = "flex"
  } else {
    document.getElementById("addLabelsToModal").style.display = "none"
  }
}

const resetaddClassificationModal = () => {
  const annotationForm = document.getElementById("createClassificationForm")
  annotationForm.querySelectorAll(".form-control").forEach(element => {
    if (element.type === "checkbox") {
      element.checked = false
    } else {
      element.value = ""
    }
  })

  const modalLabelsList = document.getElementById("modalLabelsList")
  while(modalLabelsList.firstElementChild !== modalLabelsList.lastElementChild) {
    modalLabelsList.removeChild(modalLabelsList.lastElementChild)
  }
  modalLabelsList.parentElement.style.display = "none"

  document.getElementById("addClassificationModal").querySelector("button[type=submit]").innerHTML = "Create Class"
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
  // path.model = await tf.automl.loadImageClassification("./model/model.json")
  path.model = await tf.automl.loadImageClassification("./model/covidModel/model.json")
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