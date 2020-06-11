const EPIBOX = "epibox"
const APPNAME = "epiPath"

const boxRootFolderId = "0"
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
      selectFolder(boxRootFolderId)
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
    .then(res => res.ok ? (returnJson ? res.json() : res) : res),

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
  
  await box()
  loadHashParams()  
  loadDefaultImage()
  path.loadModules()


  path.tiffWorker = new Worker('scripts/processImage.js')
  path.tiffUnsupportedAlertShown = false
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
    path.userConfig = await box.getAppConfig()
    
    if (path.userConfig.lastUsedDataset !== -1) {
    
      await path.selectDataset(path.userConfig.lastUsedDataset)
    
    } else if(!window.localStorage.selectDatasetModalShown || (window.localStorage.selectDatasetModalShown - Date.now() > 15*60*1000)) {
    
      const selectDatasetModal = new Modal(document.getElementById("selectDatasetModal"))
      selectDatasetModal.show()
      window.localStorage.selectDatasetModalShown = Date.now()
    
    }
    loadHashParams()
    // await thumbnails.showThumbnailPicker(window.localStorage.currentThumbnailsOffset, DEFAULT_THUMBNAILS_LIST_LENGTH)
    // if (path.datasetConfig) {
    //   path.datasetConfig.annotations.forEach((classType) => annotations.createTables(classType))
    // }
    
    if (hashParams.useWorker) {
      path.predictionWorker = new Worker('scripts/modelPrediction.js')
    }
    if (window.location.host.includes("localhost")) {
      loadLocalModel()
    }
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
    if (path.isImageFromBox) {
      
      await thumbnails.showThumbnailPicker(window.localStorage.currentThumbnailsOffset, DEFAULT_THUMBNAILS_LIST_LENGTH)
      
      if (path.predictionWorker) {
        // path.predictionWorker.postMessage(await tf.browser.fromPixels(path.tmaImage).array())
        // path.predictionWorker.onmessage = (e) => {
        //   console.log("Message received from worker!", e.data)
        //   console.log("Prediction: ", e.data.reduce((maxLabel, pred) => {
        //     maxLabel && maxLabel.prob > pred.prob ? maxLabel : pred
        //   }, {}))
        // }
      } else {
        // setTimeout(() => {
        //   path.model.classify(path.tmaImage).then(preds => console.log("Local Model Prediction", preds))
        // }, 3000)
      }
    }
    if (path.datasetConfig && path.datasetConfig.annotations) {
      annotations.showAnnotationOptions(path.datasetConfig.annotations, path.isImageFromBox, false)
    }
  }
}

path.selectDataset = async (folderId = path.userConfig.lastUsedDataset) => {
  let datasetConfig = {
    annotations: []
  }
  if (folderId != -1) {
    const folderBtnInFileMgr = document.querySelector(`button[entryId="${folderId}"]`)
    datasetConfig = await box.getDatasetConfig(folderId)
    if (datasetConfig) {
      const annotations = datasetConfig.annotations.filter(annotation => !annotation.private || (annotation.private && annotation.createdBy === window.localStorage.userId))
      datasetConfig.annotations = annotations
      utils.showToast(`Using ${datasetConfig.datasetFolderName} as the current dataset.`)
      if (folderBtnInFileMgr) {
        folderBtnInFileMgr.click()
      }
    }
  }
  path.datasetConfig = datasetConfig
  if (hashParams.image) {
    const forceRedraw = true
    annotations.showAnnotationOptions(path.datasetConfig.annotations, forceRedraw)
    thumbnails.reBorderThumbnails()
  }
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
    } else if (path.tmaCanvasLoaded) {
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
        annotations.deactivateQualitySelectors()
  
        const fileMetadata = metadata ? metadata.global.properties : {}
        if (Object.keys(fileMetadata).length > 0) {
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
          selectFolder(parent.id)
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
  tools.addLocalFileButton()
  tools.zoomButton()
  tools.segmentButton()
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

  let prediction = null
  if (path.predictionWorker) {
    path.predictionWorker.postMessage(await tf.browser.fromPixels(path.tmaImage).array())
    path.predictionWorker.onmessage = (e) => {
      prediction = e.data.reduce((maxLabel, pred) => {
        if (maxLabel.prob && maxLabel.prob > pred.prob) {
          return maxLabel
        } 
        return pred
      }, {})
      prediction.displayName = prediction.label
      prediction.classification = {}
      prediction.classification.score = prediction.prob
      prediction = [prediction]
      displayModelPrediction(prediction, path.datasetConfig.annotations[0], document.getElementById(`${path.datasetConfig.annotations[0].annotationName}Select`).querySelector("tbody"))
    }
  } else {
    const payload = {
      annotationType,
      "image": path.tmaCanvas.toDataURL().split("base64,")[1]
    }
    
    prediction = await utils.request("https://us-central1-nih-nci-dceg-episphere-dev.cloudfunctions.net/getPathPrediction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }, false)
    .then(res => {
      return res.json()
    })
    .catch(err => {})

  }

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