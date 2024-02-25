const EPIBOX = "epibox"
const APPNAME = "epiPath"

const boxRootFolderId = "0"
const indexedDBConfig = {
  'box': {
    'dbName': "boxCreds",
    'objectStoreName': "oauth",
    'objectStoreOpts': {
      'autoIncrement': true
    }
  },
  'wsi': {
    'dbName': "wsiPreds",
    'objectStoreNamePrefix': "tilePredictions",
    'objectStoreOpts': {
      'keyPath': ["x", "y", "width", "height"]
    },
    'objectStoreIndexes': [{
      'name': "tileCoords",
      'keyPath': ["x", "y", "width", "height"],
      'objectParameters': {
        'unique': true
      }
    }, {
      'name': "tilePredictions",
      'keyPath': ["predictedLabel", "predictionScore"],
      'objectParameters': {
        'unique': false
      }
    }]
  }
}


const basePath = window.location.pathname === "/" ? "" : window.location.pathname
let configFileId = window.location.hash.includes("covid") ? 644912149213 : 627997326641
// const configFileId = 627997326641
const containsEmojiRegex = new RegExp("(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])")
const wsiFileTypes = [".svs", ".ndpi"]
const validFileTypes = [".jpg", ".jpeg", ".png", ".tiff", ...wsiFileTypes]

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

var hashParams = {}
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
  
  if (box.isLoggedIn && await box.isLoggedIn()) {
 
    if (hashParams.image && hashParams.image !== path.tmaImage.getAttribute("entry_id")) {
      loadImageFromBox(hashParams.image)
    }
    if (hashParams.wsiCenterX && hashParams.wsiCenterY && hashParams.wsiZoom) {
      wsi.handlePanAndZoom(hashParams.wsiCenterX, hashParams.wsiCenterY, hashParams.wsiZoom)
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

  isWSI: (name) => {
    let isWSI = false
    
    wsiFileTypes.forEach(fileType => {
      if (name.endsWith(fileType)) {
        isWSI = true
      }
    })

    return isWSI
  },

  showToast: (message) => {
    const toastElement = document.getElementById("toast")
    if (toastElement) {
      document.getElementById("toastMessage").innerText = message
      document.getElementById("toastClose")?.Toast.show()
      setTimeout(() => {
        if (toastElement?.classList.contains("showing")) {
          toastElement?.dispatchEvent(new Event("webkitTransitionEnd"))
        }
      }, 7000) //For bug where toast doesn't go away the second time an annotation is made.
    }
  },

  roundToPrecision: (value, precision) => {
    return Math.round((parseFloat(value)  + Number.EPSILON) * 10**precision) / 10**precision
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
  window.localStorage.currentFolder = ""
  window.localStorage.allFilesInFolder = window.localStorage.allFilesInFolder || JSON.stringify({})
  window.localStorage.fileMetadata = JSON.stringify({})
  
  loadURLParams()
  
  path.root = document.getElementById("tmaPath")
  path.canvasParentElement = document.getElementById("canvasWithPickers")
  path.tabsContainerElement = document.getElementById("tabsContainer")
  path.imageDiv = document.getElementById("imageDiv")
  path.imageDiv.style.height = window.innerHeight - path.imageDiv.getBoundingClientRect().top - 16
  
  path.tmaCanvas = document.getElementById("tmaCanvas")
  path.tmaCanvasLoaded = false
  
  path.toolsDiv = document.getElementById("toolsDiv")
  path.tmaImage = new Image()
  
  path.wsiViewer = {}
  path.wsiViewerDiv = document.getElementById("wsiCanvasParent")
  
  path.setupEventListeners()
  path.boxCredsDB = await path.setupIndexedDB(...Object.values(indexedDBConfig['box']))
  
  path.miscProcessingWorker = new Worker(`${basePath}/scripts/miscProcessing.js`, {type: 'module'})

  // addWSIServiceWorker = () => {
  //   if ('serviceWorker' in navigator) {
  //     navigator.serviceWorker.register(`${window.location.pathname}imagebox3.js?tileServerURL=${wsi.imageBox3TileServerBasePath}`)
  //     .catch((error) => {
  //       console.log('Service worker registration failed', error)
  //       reject(error)
  //     })
  //     return navigator.serviceWorker.ready
  //   }
  // }
  // await addWSIServiceWorker()

  box().then(() => {
    path.setupAfterBoxLogin()
    loadHashParams()
    loadDefaultImage()
    path.loadModules()
  }).catch((e) => {
    loadHashParams() // to handle case where user is not logged in but there is a hash string, so store the hashParams in localstorage.
    myBox.showLoginMessage()
    loadDefaultImage()
  })
  
  path.tiffUnsupportedAlertShown = false
}

path.setupIndexedDB = (dbName, objectStoreName, objectStoreOpts={}, indexOpts) => {
  return new Promise(resolve => {
    const dbRequest = window.indexedDB.open(dbName)
    dbRequest.onupgradeneeded = () => {
      const db = dbRequest.result
      if (!db.objectStoreNames.contains(objectStoreName)) {
        const objectStore = db.createObjectStore(objectStoreName, objectStoreOpts)
        if (indexOpts) {
          objectStore.createIndex(indexOpts.name, indexOpts.keyPath, indexOpts.objectParameters)
        }
      }
      resolve(db)
    }
    dbRequest.onsuccess = (evt) => {
      const db = evt.target.result
      resolve(db)
    }
  })
}

path.loadModules = (modules) => {
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

path.setupAfterBoxLogin = async () => {
  const username = await box.getUserProfile()
  document.getElementById("boxLoginBtn").style.display = "none"
  document.getElementById("username").innerText = `Welcome ${username.split(" ")[0]}!`
  document.getElementById("username").style.display = "block"

  if (hashParams.folder) {
    myBox.loadFileManager(hashParams.folder)
  }
  
  path.userConfig = await box.getUserConfig()
  if (path.userConfig.lastUsedDataset && path.userConfig.lastUsedDataset !== -1) {
    annotations.showAnnotationOptions(undefined, !!hashParams.image)
    
    await path.selectDataset(path.userConfig.lastUsedDataset)
  
  } else if(!window.localStorage.selectDatasetModalShown || (Date.now() - window.localStorage.selectDatasetModalShown > 10*60*1000)) {
    const selectDatasetModal = new BSN.Modal(document.getElementById("selectDatasetModal"))
    selectDatasetModal.show()
    window.localStorage.selectDatasetModalShown = Date.now()
  }
  thumbnails.showThumbnailPicker(window.localStorage.currentThumbnailsOffset, DEFAULT_THUMBNAILS_LIST_LENGTH)

  populateDatasetSelectDropdown().then(() => {
    if (!path.datasetConfig) {
      annotations.showAnnotationOptions(undefined, !!hashParams.image)
    }
  })
}

path.setupEventListeners = () => {
  
  const addClassificationModal = document.getElementById("addClassificationModal")
  addClassificationModal.addEventListener("show.bs.modal", () => {
    document.getElementById("datasetFolderId").value = path.datasetConfig.datasetFolderId ? path.datasetConfig.datasetFolderId : "INVALID"
  })
  addClassificationModal.addEventListener("hidden.bs.modal", () => {
    annotations.resetAddClassificationModal()
  })

  path.tmaImage.onload = path.loadCanvas

}

path.selectDataset = async (datasetFolderId=path.userConfig.lastUsedDataset) => {
  if (!path.datasetConfig || (path.datasetConfig && path.datasetConfig.datasetFolderId !== datasetFolderId)) {
    const datasetSelectDropdownBtn = document.getElementById("datasetSelectDropdownBtn")
    datasetSelectDropdownBtn.setAttribute("disabled", "true")
    datasetSelectDropdownBtn.firstElementChild.classList.remove("fa-caret-down")
    datasetSelectDropdownBtn.firstElementChild.classList.add("fa-spinner")
    datasetSelectDropdownBtn.firstElementChild.classList.add("fa-spin")

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
    
    datasetSelectDropdownBtn.removeAttribute("disabled")
    datasetSelectDropdownBtn.firstElementChild.classList.add("fa-caret-down")
    datasetSelectDropdownBtn.firstElementChild.classList.remove("fa-spinner") 
    datasetSelectDropdownBtn.firstElementChild.classList.remove("fa-spin")
    myBox.highlightSelectedDatasetFolder(path.userConfig.lastUsedDataset)
    if (path.datasetConfig.models?.trainedModels?.length > 0) {
      await wsi.setupIndexedDB()
    }
    try {
      const forceRedraw = true
      annotations.showAnnotationOptions(path.datasetConfig.annotations, !!hashParams.image, forceRedraw)
      thumbnails.reBorderThumbnails()
    } catch (e) {
      console.log(e)
    }
    
    if (path.datasetConfig.models?.trainedModels?.length > 0) {
      const toastMessage = path.datasetConfig.models.trainedModels.length === 1 ? "Loading AI Model..." : "Loading AI Models..."
      utils.showToast(toastMessage)
      dataset.loadModels(path.datasetConfig.models.trainedModels)
    }
    const datasetConfigSetEvent = new CustomEvent("datasetConfigSet")
    document.dispatchEvent(datasetConfigSetEvent)
    dataset.populateInfo(path.datasetConfig, false)
    // path.predictionWorker.postMessage({
    //   "op": "loadModels", 
    //   "body": {
    //     "modelsConfig": path.datasetConfig.models
    //   }
    // })
    // path.predictionWorker.onmessage = (message) => {
    //   if (message.data.annotationId && message.data.modelLoaded) {
    //     path.modelsLoaded[message.data.annotationId] = true
    //   } if (Object.keys(path.modelsLoaded).length === path.datasetConfig.models.trainedModels.length) {
    //     const toastMessage = path.datasetConfig.models.trainedModels.length === 1 ? "Model loaded successfully!" : "Models loaded successfully!"
    //     utils.showToast(toastMessage)
    //   }
    // }
  }
}

const populateDatasetSelectDropdown = async () => {
  const datasetsUsed = path.userConfig.datasetsUsed.sort((d1, d2)=> {
    if (path.userConfig.preferences.datasetAccessLog) {
      const d1Time = path.userConfig.preferences.datasetAccessLog[d1.folderId]
      const d2Time = path.userConfig.preferences.datasetAccessLog[d2.folderId]
      return d2Time - d1Time
    } else {
      return 0
    }
  }).map(d => d.folderId)

  const { entries: availableDatasets } = await box.search(`"${epiBoxFolderName}"`, "folder", undefined, 100)
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
      const datasetFolder = folder.path_collection.entries[folder.path_collection.entries.length - 1] // Get parent folder of _epbox
      if (folder.name === epiBoxFolderName && folder.path_collection.entries.length > 1) {
        const datasetOptionBtn = document.createElement("button")
        datasetOptionBtn.setAttribute("class", "btn btn-link datasetOptionBtn")
        datasetOptionBtn.innerText = datasetFolder.name

        if (datasetFolder.id === path.datasetConfig?.datasetFolderId?.toString()) {
          datasetOptionBtn.classList.add("selected")
        } else {
        }
        datasetOptionBtn.onclick = () => {
          const previouslySelectedDatasetOptionBtn = datasetSelectDropdownDiv.querySelector("button.selected")
          if (previouslySelectedDatasetOptionBtn) {
            previouslySelectedDatasetOptionBtn.classList.remove("selected")
          }
          datasetOptionBtn.classList.add("selected")
          path.selectDataset(datasetFolder.id)
          // const folderInMyBox = document.getElementById("boxFolderTree").querySelector(`button[entryid="${datasetFolder.id}"]`)
          // if (folderInMyBox) {
          //   path.selectFolder(datasetFolder.id)
          // }
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
    if (!path.tmaOptions) {
      path.loadTMAOptions()
    }
  }
}

const loadImageFromBox = async (id, url) => {
  path.isImageFromBox = false

  //Disable clicking on anything else while new image is loading.
  path.imageDiv.style["pointer-events"] = "none"

  const thumbnailImage = document.getElementById(`thumbnail_${id}`)
  if (thumbnailImage && !path.wsiViewer.canvas) {
    path.isThumbnail = true
    path.tmaImage.src = thumbnailImage.src
    thumbnails.highlightThumbnail(id)
    const loaderElementId = "imgLoaderDiv"
    showLoader(loaderElementId, path.tmaCanvas)
  } else if (path.tmaCanvasLoaded) {
    path.isThumbnail = false
    const loaderElementId = "imgLoaderDiv"
    showLoader(loaderElementId, path.tmaCanvas)
  }
  
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
      
      window.localStorage.currentThumbnailsFolder = parent.id
      
      path.isWSI = utils.isWSI(name)
      path.tmaImage.setAttribute("alt", name)
      
      if (!url) {
        
        if (path.isWSI) {
          path.tmaCanvasLoaded = false
          path.isImageFromBox = true
          path.isThumbnail = false
          
          document.documentElement.style.setProperty("--tabsContainerWidth", "35%")
          document.documentElement.style.setProperty("--tmaCanvasWidth", "65%")
          path.tmaImage.setAttribute("entry_id", id)
          wsi.loadImage(id, name, fileMetadata)
        } else {

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
              
              box.getRepresentation(maxResolutionRep.url).then(repURL => {
                url = repURL
                loadImgFromBoxFile(null, url)
              })

              if (!path.datasetConfig.jpegRepresentationsFolderId || path.datasetConfig.jpegRepresentationsFolderId === -1) {
                const jpegRepresentationsFolderEntry = await box.createFolder("jpegRepresentations", path.datasetConfig.datasetConfigFolderId)
                const objectToAdd = {
                  jpegRepresentationsFolderId: jpegRepresentationsFolderEntry.id
                }
                box.addToDatasetConfig(objectToAdd)
              }

              if (typeof OffscreenCanvas === "function") {
                const op = "tiffConvert"
                path.miscProcessingWorker.postMessage({
                  op,
                  'data': {
                    'imageId': id,
                    'jpegRepresentationsFolderId': path.datasetConfig.jpegRepresentationsFolderId,
                    name,
                    size
                  }
                })
                
                path.miscProcessingWorker.onmessage = (evt) => {
                  if (evt.data.op === op) {
                    const { originalImageId, metadataWithRepresentation: newMetadata, representationFileId } = evt.data
                    if (originalImageId === hashParams.image) {
                      console.log("Conversion completion message received from worker, loading new image", new Date())
                      loadImgFromBoxFile(representationFileId)
                      window.localStorage.fileMetadata = JSON.stringify(newMetadata)
                    } 
                  }
                }

                path.miscProcessingWorker.onerror = (err) => {
                  console.log("Error converting TIFF from worker", err)
                }
              }
              
            } else { // Just use the representation created before.
              const { representationFileId } = JSON.parse(fileMetadata["jpegRepresentation"])
              console.log("Using the JPEG representation created already", new Date())
              loadImgFromBoxFile(representationFileId)
            }
        
          } else {
            loadImgFromBoxFile(id)
          }
        }
      }

      addImageHeader(filePathInBox, id, name)
      thumbnails.showThumbnailPicker(window.localStorage.currentThumbnailsOffset, DEFAULT_THUMBNAILS_LIST_LENGTH)
      
      if (!hashParams.folder) {
        path.selectFolder(parent.id)
      }
    } else {
      alert("The ID in the URL does not point to a valid image file (.jpg/.png/.tiff) in Box.")
    }
  
  } catch (e) {
    console.log("Error occurred loading image", e)
  }
}

const loadImgFromBoxFile = async (id, url) => {
  
  document.documentElement.style.setProperty("--tabsContainerWidth", "45%")
  document.documentElement.style.setProperty("--tmaCanvasWidth", "55%")
  
  if (!path.tmaOptions) {
    path.loadTMAOptions()
  }

  if (id && !url) {
    url = await box.getFileContent(id, false, true)
  }
  
  path.isImageFromBox = true
  path.isThumbnail = false
  path.tmaImage.setAttribute("src", "")
  path.tmaImage.setAttribute("src", url)
  path.tmaImage.setAttribute("entry_id", id)
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
      folderLink.innerText = folder.name.length > 15 ? folder.name.slice(0, 12).trim() + "..." : folder.name.trim()
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

const showLoader = (id="imgLoaderDiv", overlayOnElement=path.tmaCanvas) => {
  const loaderDiv = document.getElementById(id)
  if (loaderDiv && overlayOnElement) {
    const {
      width,
      height
    } = overlayOnElement.getBoundingClientRect()
    loaderDiv.style.width = width
    loaderDiv.style.height = height
    loaderDiv.style.display = "inline-block";
  }
}

const hideLoader = (id) => {
  document.getElementById(id).style.display = "none";
}

path.loadCanvas = () => {
  // Condition checks if path.tmaImage.src is empty
  let wasWSICanvasPresent = false
  if (path.tmaImage.src !== window.location.origin + window.location.pathname) {
    
    if (path.wsiViewer.canvas) {
      wasWSICanvasPresent = true
      path.toolsDiv.parentElement.style.display = "flex"
      path.canvasParentElement.style.marginLeft = "1rem"
      path.wsiViewer.destroy()
      path.wsiViewer = {}
      path.wsiViewerDiv.style.display = "none"
      path.tmaCanvas.parentElement.style.display = "flex"
      path.tmaCanvas.parentElement.style.backgroundColor = "transparent"
    }
    // console.log(path.tmaCanvas.width, path.tmaCanvas.parentElement.getBoundingClientRect().width)
    // console.log(path.tmaCanvas.height, path.tmaCanvas.parentElement.getBoundingClientRect().height)
    if (!path.isThumbnail) {
      path.tmaCanvas.setAttribute("width", path.tmaCanvas.parentElement.getBoundingClientRect().width)
      path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
    }

    const tmaContext = path.tmaCanvas.getContext("2d")
    tmaContext.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
    path.tmaCanvasLoaded = true
    if (!path.isThumbnail) {
      path.imageDiv.style["pointer-events"] = "auto"
    }

    path.onCanvasLoaded(true, wasWSICanvasPresent)
  }
}

path.onCanvasLoaded = async (loadAnnotations=true, forceRedraw=false) => {
  if (!path.isThumbnail) {
    hideLoader("imgLoaderDiv")
  }
  
  if (loadAnnotations && path.datasetConfig && !path.isThumbnail) {
    annotations.showAnnotationOptions(path.datasetConfig.annotations, path.isImageFromBox, forceRedraw)
  }
}

path.getCurrentCanvasSize = () => {
  if (path.wsiViewer.canvas) {
    return path.wsiViewer.element.getBoundingClientRect()
  }
  return path.tmaCanvas.getBoundingClientRect()
}

path.loadTMAOptions = () => {
  path.tmaOptions = true
  path.wsiOptions = false
  document.getElementById("toolsOuterDiv").style.visibility = "visible"
  document.getElementById("toolsOuterDiv").style.borderRight = "1px solid lightgray"
  tools.removeTools()
  tools.addLocalFileButton()
  tools.zoomButton()
  tools.segmentButton()
}

path.loadWSIOptions = () => {
  path.loadTMAOptions()
  path.tmaOptions = false
  path.wsiOptions = true
  path.toolsDiv.querySelectorAll("button").forEach(element => element.setAttribute("disabled", "true"))
}

// path.loadWSIOptions = () => {
//   path.wsiOptions = true
//   path.tmaOptions = false
//   document.getElementById("toolsOuterDiv").style.visibility = "visible"
//   document.getElementById("toolsOuterDiv").style.borderRight = "1px solid lightgray"
//   tools.removeTools()
//   tools.addPredictionOptions()
// }

path.modifyHashString = (hashObj, removeFromHistory=false) => {
  // hashObj contains hash keys with corresponding values to update. To remove a hash parameter, the
  // value corresponding to the hash param should be undefined in the hashObj.
  let hash = decodeURIComponent(window.location.hash)
  Object.entries(hashObj).forEach(([key, val]) => {
    if (val && val !== hashParams[key]) {
     
      if (hashParams[key]) {
        hash = hash.replace(`${key}=${hashParams[key]}`, `${key}=${val}`)
      } else {
        hash += hash.length > 0 ? "&" : ""
        hash += `${key}=${val}`
      }
  
    } else if (!val) {
      const param = `${key}=${hashParams[key]}`
      const paramIndex = hash.indexOf(param)
      if (hash[paramIndex-1] === "&") {  // if hash is of the form "...&image=123...", remove preceding & as well.
        hash = hash.replace(`&${param}`, "")
      } else if (hash[paramIndex + param.length] === "&") { // if hash is of the form "#image=123&...", remove following & as well.
        hash = hash.replace(`${param}&`, "")
      } else { // if hash is just #image=123, remove just the param.
        hash = hash.replace(param, "")
      }
    }
  })
  window.location.hash = hash

  if (removeFromHistory) {
    history.replaceState({}, '', window.location.pathname + window.location.hash)
  }
}

path.selectImage = (imageId) => {
  path.modifyHashString({
    'image': imageId
  })
}

path.selectFolder = (folderId) => {
  path.modifyHashString({
    'folder': folderId
  })
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

// const loadLocalModel = async () => {
//   // path.model = await tf.automl.loadImageClassification("./model/model.json")
//   path.model = await tf.automl.loadImageClassification("./model/covidModel/model.json")
//   console.log("LOADED", path.model)
// }

path.predictForFolder = async (folderId=hashParams.folder, annotation=path.datasetConfig.annotations[0], uploadToBox=false, updateFileMetadata=true) => {
  const annotationName = annotation.metaName
  const labels = annotation.labels.map(l => l.label)
  let predictionsForFolder = `id,filename,prediction_label,prediction_score,url_in_app`
  labels.forEach(label => {
    predictionsForFolder += ","
    predictionsForFolder += `prediction_score_for_${label}`
  })
  // let forROC = ""
  const images = await box.getAllFolderContents(folderId)

  console.log("Starting predictions for folder", folderId)
  console.time("Prediction")
  for (let image of images.entries) {
    if (image.type === "file" && utils.isValidImage(image.name)) {
      const preds = await models.getTMAPrediction(annotation.annotationId, annotationName, image.id, true, updateFileMetadata)
      const maxPred = preds.reduce((maxLabel, pred) => {
        if (!maxLabel.prob || maxLabel.prob < pred.prob) {
          maxLabel = pred
        }
        return maxLabel
      }, {})
      console.log(`Prediction for ${image.name} completed.`)
      predictionsForFolder += `\n${image.id},${image.name},${maxPred.label},${maxPred.prob},https://episphere.github.io/path#image=${image.id}`
      labels.forEach(label => {
        const labelPrediction = preds.find(pred => pred.label===label)
        predictionsForFolder += ","
        predictionsForFolder += `${labelPrediction?.prob || -1}`
      })
    }
  }
  console.timeEnd("Prediction")
  
  console.log("DONE!")

  const filename = `Predictions_${annotation.displayName}.csv`
  const tempAnchorElement = document.createElement('a')
  tempAnchorElement.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(predictionsForFolder))
  tempAnchorElement.setAttribute('download', filename)
  tempAnchorElement.click()

  if (uploadToBox) {
    const uploadPredictionsFileFD = new FormData()
    const predictionsFileConfig =  {
      "name": filename,
      "parent": {
        "id": 109209908256
      }
    }
    const predictionsBlob = new Blob([predictionsForFolder], {
      type: 'text/plain'
    })
  
    uploadPredictionsFileFD.append("attributes", JSON.stringify(predictionsFileConfig))
    uploadPredictionsFileFD.append("file", predictionsBlob)
  
    await box.uploadFile(uploadPredictionsFileFD)
  }
  // console.log(forROC)
}

window.onload = path
window.onresize = () => path.tmaCanvasLoaded && path.loadCanvas()
window.onhashchange = loadHashParams