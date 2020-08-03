const EPIBOX = "epibox"
const APPNAME = "epiPath"

const boxRootFolderId = "0"
const indexedDBConfig = {
  dbName: "boxCreds",
  objectStoreName: "oauth"
}
let configFileId = window.location.hash.includes("covid") ? 644912149213 : 627997326641
// const configFileId = 627997326641
const containsEmojiRegex = new RegExp("(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])")
const validFileTypes = [".jpg", ".jpeg", ".png", ".tiff"]

const urlParams = {}
const loadURLParams = () => {
  window.location.search.slice(1).split('&').forEach(param => {
    const [key, value] = param.split('=')
    urlParams[key] = value
  })
}

if (typeof OffscreenCanvas !== "function") { // Alert for browsers without OffscreenCanvas support.
  alert("This browser does not support all features required to run this application. Please use the Google Chrome browser for the best experience!")
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
      if (path.userConfig) {
        myBox.loadFileManager(hashParams.folder)
      }
    } else {
      path.selectFolder(boxRootFolderId)
    }
 
    if (!hashParams.sort) {
      window.location.hash += "&sort=name"
    }
 
  }
}

const defaultImg = window.location.origin + window.location.pathname + "external/images/OFB_023_2_003_1_13_03.jpg"

const utils = {
  request: (url, opts, returnJson = true) => 
    fetch(url, opts)
    .then(res => {
      if (res.ok) {
        if (returnJson)
        return res.json()
        else
        return res
      } else {
        throw Error(res.status)
      } 
    }),

  isValidImage: (name) => {
    let isValid = false
    
    validFileTypes.forEach(fileType => {
      if (name.endsWith(fileType)) {
        isValid = true
      }
    })
    
    return isValid
  },

  showToast: (message) => {
    document.getElementById("toastMessage").innerText = message
    document.getElementById("toastClose").Toast.show()
    setTimeout(() => {
      if (document.getElementById("toast").classList.contains("showing")) {
        document.getElementById("toast").dispatchEvent(new Event("webkitTransitionEnd"))
      }
    }, 3000) //For bug where toast doesn't go away the second time an annotation is made.
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
  window.localStorage.fileMetadata = JSON.stringify({})

  loadURLParams()
  path.root = document.getElementById("tmaPath")
  path.imageDiv = document.getElementById("imageDiv")
  path.tmaCanvas = document.getElementById("tmaCanvas")
  path.tmaCanvasLoaded = false
  path.toolsDiv = document.getElementById("toolsDiv")
  path.tmaImage = new Image()
  path.setupEventListeners()
  path.indexedDB = await path.setupIndexedDB()
  
  await box()
  loadHashParams()  
  loadDefaultImage()
  path.loadModules()

  path.predictionWorker = new Worker('scripts/modelPrediction.js')
  path.modelsLoaded = {}
  
  path.tiffWorker = new Worker('scripts/processImage.js')
  path.tiffUnsupportedAlertShown = false
}

path.setupIndexedDB = () => {
  return new Promise(resolve => {
    const dbRequest = window.indexedDB.open(indexedDBConfig.dbName)
    dbRequest.onupgradeneeded = () => {
      const db = dbRequest.result
      if (!db.objectStoreNames.contains(indexedDBConfig.objectStoreName)) {
        db.createObjectStore(indexedDBConfig.objectStoreName, {autoIncrement: true})
      }
      resolve(db)
    }
    dbRequest.onsuccess = (evt) => {
      const db = evt.target.result
      resolve(db)
    }
  })
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
  
    const username = await box.getUserProfile()
    document.getElementById("boxLoginBtn").style = "display: none"
    document.getElementById("username").innerText = `Welcome ${username.split(" ")[0]}!`

    path.userConfig = await box.getUserConfig()
    
    if (path.userConfig.lastUsedDataset && path.userConfig.lastUsedDataset !== -1) {
    
      path.selectDataset(path.userConfig.lastUsedDataset)
    
    } else if(!window.localStorage.selectDatasetModalShown || (window.localStorage.selectDatasetModalShown - Date.now() > 15*60*1000)) {
      const selectDatasetModal = new Modal(document.getElementById("selectDatasetModal"))
      selectDatasetModal.show()
      window.localStorage.selectDatasetModalShown = Date.now()
      
    }
    populateDatasetSelectDropdown()
    loadHashParams()
    // await thumbnails.showThumbnailPicker(window.localStorage.currentThumbnailsOffset, DEFAULT_THUMBNAILS_LIST_LENGTH)
    // if (path.datasetConfig) {
    //   path.datasetConfig.annotations.forEach((classType) => annotations.createTables(classType))
    // }
    
    // if (hashParams.useWorker) {
    
    
    // }
    // if (window.location.host.includes("localhost")) {
    //   loadLocalModel()
    // }
  })

  const addClassificationModal = document.getElementById("addClassificationModal")
  addClassificationModal.addEventListener("show.bs.modal", (evt) => {
    document.getElementById("datasetFolderId").value = path.datasetConfig.datasetFolderId ? path.datasetConfig.datasetFolderId : "INVALID"
  })
  addClassificationModal.addEventListener("hidden.bs.modal", (evt) => {
    annotations.resetAddClassificationModal()
  })

  path.tmaImage.onload = async () => {
    path.loadCanvas()
    hideLoader("imgLoaderDiv")
    if (path.isImageFromBox && !path.isThumbnail) {
      
      await thumbnails.showThumbnailPicker(window.localStorage.currentThumbnailsOffset, DEFAULT_THUMBNAILS_LIST_LENGTH)
      
      if (path.datasetConfig && path.datasetConfig.annotations.length > 0 && !path.isThumbnail) {
        annotations.showAnnotationOptions(path.datasetConfig.annotations, path.isImageFromBox, false)
      }
    }
  }
}

path.selectDataset = async (datasetFolderId=path.userConfig.lastUsedDataset) => {
  const datasetSelectDropdownBtn = document.getElementById("datasetSelectDropdownBtn")
  datasetSelectDropdownBtn.setAttribute("disabled", "true")
  let datasetConfig = {
    annotations: []
  }
  if (datasetFolderId && datasetFolderId != -1) {
    datasetConfig = await box.getDatasetConfig(datasetFolderId)
    if (datasetConfig) {
      const annotations = datasetConfig.annotations.filter(annotation => !annotation.private || (annotation.private && annotation.createdBy === window.localStorage.userId))
      datasetConfig.annotations = annotations
      utils.showToast(`Using ${datasetConfig.datasetFolderName} as the current dataset.`)
    }
    datasetSelectDropdownBtn.innerHTML = `
       ${datasetConfig.datasetFolderName} <i class="fas fa-caret-down"></i>
    `
  }
  path.datasetConfig = datasetConfig
  if (hashParams.image) {
    const forceRedraw = true
    annotations.showAnnotationOptions(path.datasetConfig.annotations, true, forceRedraw)
    thumbnails.reBorderThumbnails()
  }
  
  if (path.datasetConfig && path.datasetConfig.models && path.datasetConfig.models.trainedModels?.length > 0) {
    const toastMessage = path.datasetConfig.models.trainedModels.length === 1 ? "Loading AI Model..." : "Loading AI Models..."
    utils.showToast(toastMessage)
    path.predictionWorker.postMessage({
      "op": "loadModels", 
      "body": {
        "modelsConfig": path.datasetConfig.models
      }
    })
    path.predictionWorker.onmessage = (message) => {
      if (message.data.annotationId && message.data.modelLoaded) {
        path.modelsLoaded[message.data.annotationId] = true
      } if (Object.keys(path.modelsLoaded).length === path.datasetConfig.models.trainedModels.length) {
        const toastMessage = path.datasetConfig.models.trainedModels.length === 1 ? "Model loaded successfully!" : "Models loaded successfully!"
        utils.showToast(toastMessage)
      }
    }
  }
}

const populateDatasetSelectDropdown = async (selectedDatasetId) => {
  const datasetsUsed = path.userConfig.datasetsUsed.sort((d1, d2)=> {
    if (path.userConfig.preferences.datasetAccessLog) {
      const d1Time = path.userConfig.preferences.datasetAccessLog[d1.folderId]
      const d2Time = path.userConfig.preferences.datasetAccessLog[d2.folderId]
      return d2Time - d1Time
    } else {
      return 0
    }
  }).map(d => d.folderId)

  const { entries: availableDatasets } = await box.search(epiBoxFolderName, "folder", undefined, 100)
  if (availableDatasets.length > 0) {
    const datasetSelectDropdownDiv = document.getElementById("datasetSelectDropdownDiv")
    while (datasetSelectDropdownDiv.childElementCount > 1) {
      datasetSelectDropdownDiv.removeChild(datasetSelectDropdownDiv.firstElementChild)
    }
    availableDatasets.sort((d1, d2) => {
      let d1Index = datasetsUsed.indexOf(d1.path_collection.entries[d1.path_collection.entries.length - 1].id)
      d1Index = d1Index !== -1 ? d1Index : Infinity
      let d2Index = datasetsUsed.indexOf(d2.path_collection.entries[d2.path_collection.entries.length - 1].id) 
      d2Index = d2Index !== -1 ? d2Index : Infinity
      return d1Index - d2Index
    })
    
    availableDatasets.forEach(folder => {
      const datasetFolder = folder.path_collection.entries[folder.path_collection.entries.length - 1]
      if (folder.name === epiBoxFolderName && datasetFolder.id !== selectedDatasetId && folder.path_collection.entries.length > 1) {
        const datasetOptionBtn = document.createElement("button")
        datasetOptionBtn.setAttribute("class", "btn btn-link")
        datasetOptionBtn.innerText = datasetFolder.name
        datasetOptionBtn.onclick = () => {
          path.selectDataset(datasetFolder.id)
          const folderInMyBox = document.getElementById("boxFolderTree").querySelector(`button[entryid="${datasetFolder.id}"]`)
          if (folderInMyBox) {
            path.selectFolder(datasetFolder.id)
          }
        }
        datasetSelectDropdownDiv.insertBefore(datasetOptionBtn, datasetSelectDropdownDiv.lastElementChild)
        datasetSelectDropdownDiv.insertBefore(document.createElement("hr"), datasetSelectDropdownDiv.lastElementChild)
      }
    })
  }
  datasetSelectDropdownBtn.removeAttribute("disabled")
  document.getElementById("datasetSelectSpan").style.display = "flex"
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
      path.isThumbnail = true
      path.tmaImage.src = thumbnailImage.src
    } else if (path.tmaCanvasLoaded) {
      path.isThumbnail = false
      const loaderElementId = "imgLoaderDiv"
      showLoader(loaderElementId, path.tmaCanvas)
    }
    thumbnails.highlightThumbnail(id)
    myBox.highlightImage(id)
   
    try {
      
      const imageData = await box.getData(id, "file") || {}
      if (imageData.status === 404) {
        console.log(`Can't fetch data for image ID ${id} from Box`)
        alert("The image ID in the URL does not point to a file in Box!")
        path.selectImage()
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
        annotations.deactivateQualitySelectors()
  
        const fileMetadata = metadata ? metadata.global.properties : {}
        if (Object.keys(fileMetadata).length > 0) {
          window.localStorage.fileMetadata = JSON.stringify(fileMetadata)
        } else {
          box.createMetadata(id, "file").then(res => {
            window.localStorage.fileMetadata = JSON.stringify(res)
          })
        }
        
        // const allFilesInFolderObj = JSON.parse(window.localStorage.allFilesInFolder) || {}
        // allFilesInFolderObj[parent.id] = parent.id in allFilesInFolderObj && allFilesInFolderObj[parent.id].length > 0 ? allFilesInFolderObj[parent.id] : []
        // window.localStorage.allFilesInFolder = JSON.stringify(allFilesInFolderObj)
        window.localStorage.currentThumbnailsFolder = parent.id
  
        path.tmaImage.setAttribute("alt", name)
        
        if (!url) {
        
          if (name.endsWith(".tiff")) {
            if (!path.tiffUnsupportedAlertShown && typeof OffscreenCanvas !== "function") { // Alert for browsers without OffscreenCanvas support.
              alert("TIFF files might not work well in this browser. Please use the Google Chrome browser for the best experience!")
              path.tiffUnsupportedAlertShown = true
            }
  
            if (!fileMetadata["jpegRepresentation"]) { // Get a temporary png from Box, send TIFF to web worker for PNG conversion in the meantime.
              console.log("Representation not found, loading Box's.", new Date())

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
              
              url = await box.getRepresentation(maxResolutionRep.url)
              if (url) {
                await loadImgFromBoxFile(null, url)
              }
  
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
          path.selectFolder(parent.id)
        }
      } else {
        alert("The ID in the URL does not point to a valid image file (.jpg/.png/.tiff) in Box.")
      }
    
    } catch (e) {
      console.log("Error occurred loading image", e)
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
  path.isThumbnail = false
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
      folderLink.innerText = path.tmaCanvas.getBoundingClientRect().width < 550 ? folder.name.slice(0, 7).trim() + "..." : folder.name.trim()
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
  fileLink.innerText = name.length > 20 ? name.slice(0,20).trim() + "..." : name.trim()
  fileItem.appendChild(fileLink)
  
  folderStructure.appendChild(fileItem)
  imgHeader.appendChild(folderStructure)
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
    // console.log(path.tmaCanvas.width, path.tmaCanvas.parentElement.getBoundingClientRect().width)
    // console.log(path.tmaCanvas.height, path.tmaCanvas.parentElement.getBoundingClientRect().height)
    if (!path.isThumbnail) {
      path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width)
      path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
    }

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
  tools.addLocalFileButton()
  tools.zoomButton()
  tools.segmentButton()
}

path.selectImage = (imageId) => {
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

path.selectFolder = (folderId) => {
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

const getModelPrediction = (annotationId, annotationType, imageId=hashParams.image, forceModel=false) => {
  
  return new Promise(async (resolve) => {
    const updatePredictionInBox = (imageId, prediction, annotationName) => {
      annotations["model"] = prediction
      const boxMetadataPath = `/${annotationName}`
      box.updateMetadata(imageId, boxMetadataPath, JSON.stringify(annotations)).then(newMetadata => {
        window.localStorage.fileMetadata = JSON.stringify(newMetadata)
      })
    }
    let annotations = JSON.parse(window.localStorage.fileMetadata)[annotationType]
    annotations = annotations ? JSON.parse(annotations) : {}
    if (!forceModel && annotations["model"]) {
      if (annotations["model"][0].classification) {
        const prediction = [{
          'label': annotations["model"][0].displayName,
          'prob': annotations["model"][0].classification.score
        }]
        // updatePredictionInBox(imageId, prediction, annotationType)
        resolve(prediction)
      } else {
        resolve(annotations["model"])
      }
    } else if (path.predictionWorker && path.modelsLoaded[annotationId]) {
      let imageBitmap = []
      if (imageId === hashParams.image) {
        const offscreenCV = new OffscreenCanvas(path.tmaImage.width, path.tmaImage.height)
        const offscreenCtx = offscreenCV.getContext('2d')
        offscreenCtx.drawImage(path.tmaImage, 0, 0, path.tmaImage.width, path.tmaImage.height)
        imageBitmap = offscreenCV.transferToImageBitmap()
        path.predictionWorker.postMessage({
          'op': "predict",
          'body': {
            'annotationId': annotationId,
            'tmaImageData': {
              imageBitmap,
              'width': path.tmaImage.width,
              'height': path.tmaImage.height
            }
          }
        }, [imageBitmap])
      } else {
        const fileContent = await box.getFileContent(imageId)
        const tempImage = new Image()
        tempImage.crossOrigin = "anonymous"
        tempImage.src = fileContent.url
        tempImage.onload = (() => {
          const offscreenCV = new OffscreenCanvas(tempImage.width, tempImage.height)
          const offscreenCtx = offscreenCV.getContext('2d')
          offscreenCtx.drawImage(tempImage, 0, 0, tempImage.width, tempImage.height)
          imageBitmap = offscreenCV.transferToImageBitmap()
          path.predictionWorker.postMessage({
            'op': "predict",
            'body': {
              'annotationId': annotationId,
              'tmaImageData': {
                imageBitmap,
                'width': tempImage.width,
                'height': tempImage.height
              }
            }
          }, [imageBitmap])
        })
      }
      
  
      path.predictionWorker.onmessage = (e) => {
        resolve(e.data)
        // updatePredictionInBox(imageId, e.data, annotationType)
      }
    } else {
      resolve(null)
      // const payload = {
      //   annotationType,
      //   "image": path.tmaCanvas.toDataURL().split("base64,")[1]
      // }
      
      // prediction = await utils.request("https://us-central1-nih-nci-dceg-episphere-dev.cloudfunctions.net/getPathPrediction", {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json"
      //   },
      //   body: JSON.stringify(payload)
      // }, false)
      // .then(res => {
      //   return res.json()
      // })
      // .catch(err => {})
  
    }
  })


  // const getBase64FromImage = (image) => {
  //   const tmpCanvas = document.createElement("canvas")
  //   tmpCanvas.width = image.width
  //   tmpCanvas.height = image.height
  //   const tmpCtx = tmpCanvas.getContext("2d")
  //   tmpCtx.drawImage(image, 0, 0, image.width, image.height)
  //   return tmpCanvas.toDataURL().split("base64,")[1]
  // }

  
}

// const loadLocalModel = async () => {
//   // path.model = await tf.automl.loadImageClassification("./model/model.json")
//   path.model = await tf.automl.loadImageClassification("./model/covidModel/model.json")
//   console.log("LOADED", path.model)
// }

path.annotateFolder = async (folderId=hashParams.folder, annotationName) => {
  const annotation = path.datasetConfig.annotations[0]
  annotationName = annotationName || annotation.metaName
  let annotationsForFolder = `id,filename,prediction_label,prediction_score,url_in_app,prediction_score_present,prediction_score_absent,prediction_score_uncertain`
  // let forROC = ""
  const images = await box.getAllFolderContents(folderId)

  console.log("Starting predictions for folder", folderId)
  console.time("Prediction")
  for (let image of images.entries) {
    if (image.type === "file" && utils.isValidImage(image.name)) {
      const preds = await getModelPrediction(annotation.annotationId, annotationName, image.id, true)
      const maxPred = preds.reduce((maxLabel, pred) => {
        if (!maxLabel.prob || maxLabel.prob < pred.prob) {
          maxLabel = pred
        }
        return maxLabel
      }, {})
      console.log(`Prediction for ${image.name} completed.`)
      annotationsForFolder += `\n${image.id},${image.name},${maxPred.label},${maxPred.prob},https://episphere.github.io/path#image=${image.id},${preds.find(pred => pred.label==="Present").prob},${preds.find(pred => pred.label==="Absent").prob},${preds.find(pred => pred.label==="Uncertain").prob}`
    }
  }
  console.timeEnd("Prediction")
  
  console.log("DONE!")
  const uploadPredictionsFileFD = new FormData()
  const predictionsFileConfig =  {
    "name": `Predictions_${annotation.displayName}.csv`,
    "parent": {
      "id": 109209908256
    }
  }
  const predictionsBlob = new Blob([annotationsForFolder], {
    type: 'text/plain'
  })

  uploadPredictionsFileFD.append("attributes", JSON.stringify(predictionsFileConfig))
  uploadPredictionsFileFD.append("file", predictionsBlob)

  await box.uploadFile(uploadPredictionsFileFD)
  // console.log(forROC)
}

window.onload = path
window.onresize = path.loadCanvas
window.onhashchange = loadHashParams