const boxRootFolderId = "0"
// let configFileId = window.location.hash.includes("covid") ? 644912149213 : 627997326641
const configFileId = 627997326641
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
      myBox.loadFileManager(hashParams.folder)
    } else {
      selectFolder(boxRootFolderId)
    }
  }
}

const defaultImg = window.location.origin + window.location.pathname + "images/OFB_023_2_003_1_13_03.jpg"

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

  if (hashParams.useWorker) {
    path.predictionworker = new Worker('scripts/modelPrediction.js')
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
    path.getDatasetConfig()
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
    resetAddClassificationModal()
  })

  path.tmaImage.onload = async () => {
    path.loadCanvas()
    
    if (path.isImageFromBox) {
      
      await thumbnails.showThumbnailPicker(window.localStorage.currentThumbnailsOffset, DEFAULT_THUMBNAILS_LIST_LENGTH)
      
      path.appConfig.annotations.forEach((classType) => annotations.createTables(classType))
      if (path.predictionworker) {
        path.predictionworker.postMessage(await tf.browser.fromPixels(path.tmaImage).array())
        path.predictionworker.onmessage = (e) => {
          console.log("Message received from worker!", e.data)
          console.log("Prediction: ", e.data.reduce((maxLabel, pred) => {
            maxLabel && maxLabel.prob > pred.prob ? maxLabel : pred
          }, {}))
        }
      } else {
        // setTimeout(() => {
        //   path.model.classify(path.tmaImage).then(preds => console.log("Local Model Prediction", preds))
        // }, 3000)
      }
    }
  }
}

path.getDatasetConfig = async () => {
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
      thumbnails.highlightThumbnail(id)
      myBox.highlightImage(id)
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
      annotations.deactivateQualitySelectors()

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

const editClassificationConfig = (annotationId) => {
  const annotationForm = document.getElementById("createClassificationForm")
  annotationForm.setAttribute("annotationId", annotationId) // Used after submit to know if the form was used to add a new class or update an old one.
  
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
      utils.showToast(toastMessage)
      path.appConfig = appConfig
      path.appConfig.annotations.forEach(annotation => (annotation) => annotations.createTables(annotation, annotation[identifier] === deltaData[identifier]))
    
      thumbnails.reBorderThumbnails()
    
    } catch (e) {
      console.log("Couldn't upload new config to Box!", e)
      utils.showToast("Some error occurred while adding the annotation. Please try again!")
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

const resetAddClassificationModal = () => {
  const annotationForm = document.getElementById("createClassificationForm")
  annotationForm.removeAttribute("annotationId")
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