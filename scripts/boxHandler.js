const epiBoxFolderName = `_${EPIBOX}`
const appFolderName = `_${APPNAME}`
const datasetConfigFolderName = `_${APPNAME}`
const epiBoxConfigFileName = "_epiboxUserConfig.json"
const userConfigFileName = "_userConfig.json"
const datasetConfigFileName = "_datasetConfig.json"
const configTemplates = {
  'epiBoxConfig': "https://episphere.github.io/path/assets/epiBoxConfigTemplate.json",
  'userConfig': "https://episphere.github.io/path/assets/userConfigTemplate.json",
  'datasetConfig': "https://episphere.github.io/path/assets/datasetConfigTemplate.json",
}

const box = async () => {

  const client_id = window.location.host.includes("localhost") ? "52zad6jrv5v52mn1hfy1vsjtr9jn5o1w" : "1n44fu5yu1l547f2n2fgcw7vhps7kvuw"
  const client_secret = window.location.host.includes("localhost") ? "2rHTqzJumz8s9bAjmKMV83WHX1ooN4kT" : "2ZYzmHXGyzBcjZ9d1Ttsc1d258LiGGVd"
  const state = "sALTfOrSEcUrITy"
  const redirect_uri = window.location.host.includes("localhost") ? "http://localhost:8000" : "https://episphere.github.io/path"
  
  const boxAuthEndpoint = encodeURI(`https://account.box.com/api/oauth2/authorize?response_type=code&client_id=${client_id}&state=${state}&redirect_uri=${redirect_uri}`)
  const boxAccessTokenEndpoint = "https://api.box.com/oauth2/token"
  box.appBasePath = "https://nih.app.box.com"
  box.basePath = "https://api.box.com/2.0"
  box.uploadBasePath = "https://upload.box.com/api/2.0"
  box.downloadBasePath = "https://dl.boxcloud.com/api/2.0/internal_files"
  
  box.endpoints = {
    'user': `${box.basePath}/users/me`,
    'data': {
      'folder': `${box.basePath}/folders`,
      'file': `${box.basePath}/files`
    },
    'upload': `${box.uploadBasePath}/files`,
    'subEndpoints': {
      'metadata': "metadata/global/properties",
      'content': "content",
      'items': "items",
      'thumbnail': "thumbnail.jpg"
    },
    'search': `${box.basePath}/search`
  }

  document.getElementById("boxLoginBtn").onclick = () => window.location.replace(boxAuthEndpoint)

  box.isLoggedIn = async () => {
    // console.log(window.localStorage.box)
    if (window.localStorage.box) {
      const boxCreds = JSON.parse(window.localStorage.box)
      if (boxCreds["access_token"] && boxCreds["expires_in"]) {
        if (boxCreds["created_at"] + ((boxCreds["expires_in"] - (2*60)) * 1000) < Date.now()) {
          try {
            await getAccessToken('refresh_token', boxCreds["refresh_token"])
          } catch (err) {
            utils.showToast("Some error occurred while logging in to Box. Please try again!")
            console.log(err)
            return false
          }
        }
        return true
      }
    }
    return false
  }

  const getAccessToken = async (type, token) => {
    const requestType = type === "refresh_token" ? type : "code"
    try {
      const resp = await utils.request(boxAccessTokenEndpoint, {
        'method': "POST",
        'body': `grant_type=${type}&${requestType}=${token}&client_id=${client_id}&client_secret=${client_secret}`,
        'headers': {
          'Content-Type': "application/x-www-form-urlencoded"
        }
      })
      if (resp["access_token"]) {
        storeCredsToLS(resp)
        return true
      }
    } catch (err) {
      console.log("ERROR Retrieving Box Access Token!", err)
      throw new Error(err)
    }
    throw new Error("Failed to get access token from Box!", type)
  }

  const storeCredsToLS = (boxCreds) => {
    const newCreds = {
      'created_at': Date.now(),
      ...boxCreds
    }
    window.localStorage.box = JSON.stringify(newCreds)
    storeCredsToIndexedDB(newCreds)
  }

  const storeCredsToIndexedDB = (boxCreds) => {
    path.boxCredsDB.transaction(indexedDBConfig['box'].objectStoreName, "readwrite").objectStore(indexedDBConfig['box'].objectStoreName).put(boxCreds, 1)
    if (box.refreshTokenBeforeExpiry) {
      clearTimeout(box.refreshTokenBeforeExpiry)
    }

    console.log("Resetting Refresh Timeout for ", new Date(boxCreds.created_at + ((boxCreds.expires_in - 2 * 60) * 1000)))
    box.refreshTokenBeforeExpiry = setTimeout(() => {
      console.log("REFRESH SUCCESSFUL")
      box.isLoggedIn()
    }, (boxCreds.expires_in - (2*60)) * 1000)
  }

  const loginSuccessHandler = () => {
    utils.boxRequest = async (url, opts={}, returnJson=true) => {
      await box.isLoggedIn()
      const boxHeaders = {}
      boxHeaders['Authorization'] = `Bearer ${JSON.parse(window.localStorage.box)["access_token"]}`
      opts['headers'] = opts['headers'] ? Object.assign(boxHeaders, opts['headers']) : boxHeaders   // Using Object.assign instead of spread operator for Edge compatibility
      try {
        const res = utils.request(url, opts, returnJson)
        return res
      } catch (e) {
        throw Error(e)
      }
    }
    
    console.log("Initializing Refresh Timeout")
    const { created_at, expires_in } = JSON.parse(localStorage.box)
    const tokenNeedsRefreshAtTime = created_at + (expires_in * 1000) - Date.now()
    box.refreshTokenBeforeExpiry = setTimeout(() => {
      console.log("REFRESH SUCCESSFUL")
      box.isLoggedIn()
    }, tokenNeedsRefreshAtTime - (2*60*1000)) // Buffer of 2 minutes

  }

  if (await box.isLoggedIn()) {
    loginSuccessHandler()
  } else if (urlParams["code"]) {
    let replaceURLPath = window.location.host.includes("localhost") ? "/" : "/path"
    const oldHashParams = window.localStorage.hashParams ? JSON.parse(window.localStorage.hashParams) : {}
    if (!oldHashParams["folder"]) {
      oldHashParams["folder"] = boxRootFolderId
    }
    const urlHash = Object.entries(oldHashParams).map(([key, val]) => `${key}=${val}`).join("&")
    window.history.replaceState({}, "", `${replaceURLPath}#${urlHash}`)
    try {
      await getAccessToken("authorization_code", urlParams["code"])
      loginSuccessHandler()
    } catch (err) {
      utils.showToast("Some error occurred while logging in to Box. Please try again!")
      document.getElementById("boxLoginBtn").style = "display: block"
      console.log("ERROR LOGGING IN TO BOX!", err)
      return
    }
  } else {
    document.getElementById("boxLoginBtn").style = "display: block"
    throw Error("Not Logged In!")
    return
  }
}

box.getUserProfile = async () => {
  const { id, name, login } = await utils.boxRequest(box.endpoints["user"])
  window.localStorage.userId = id
  window.localStorage.username = name
  window.localStorage.email = login
  return name
}


// box.setupFilePicker = (successCB, cancelCB) => {
//   const boxPopup = new BoxSelect()
  
//   const defaultSuccessCB = (response) => {
//     if (response[0].name.endsWith(".jpg") || response[0].name.endsWith(".png")) {
//       if (hashParams.image) {
//         window.location.hash = window.location.hash.replace(`image=${hashParams.image}`, `image=${response[0].id}`)
//       } else {
//         window.location.hash += `image=${response[0].id}`
//       }
//     } else {
//       alert("The item you selected from Box was not a valid image. Please select a file of type .jpg or .png!")
//     }
//   }
//   successCB = successCB || defaultSuccessCB
//   boxPopup.success(successCB)
  
//   const defaultCancelCB = () => console.log("File Selection Cancelled.")
//   cancelCB = cancelCB || defaultCancelCB
//   boxPopup.cancel(cancelCB)
  
// }


box.getData = async (id, type, fields=[]) => {
  const defaultFields = ["id", "type", "name", "metadata.global.properties", "parent", "path_collection", "size", "representations"]
  const fieldsToRequest = [... new Set(defaultFields.concat(fields)) ].join(",")
  const fieldsParam = `fields=${fieldsToRequest}`
  let dataEndpoint = type in box.endpoints['data'] && `${box.endpoints['data'][type]}/${id}`
  dataEndpoint += type === "file" ? `?${fieldsParam}` : ""
  return utils.boxRequest && await utils.boxRequest(dataEndpoint)
}

box.getFolderContents = async (folderId, limit=15, offset=0, fields=[], queryParams={}) => {
  const defaultFields = ["id", "type", "name", "path_collection"]
  const fieldsToRequest = [... new Set(defaultFields.concat(fields)) ].join(",")
  const fieldsParam =  `fields=${fieldsToRequest}`
  const extraParams = Object.keys(queryParams).map(param => `${param}=${queryParams[param]}`).join("&")
  let itemsEndpoint = `${box.endpoints['data']['folder']}/${folderId}/${box.endpoints['subEndpoints']['items']}`
  itemsEndpoint += `?${fieldsParam}&limit=${limit}&offset=${offset}&${extraParams}`
  return utils.boxRequest(itemsEndpoint)
}

box.getAllFolderContents = async (folderId, fields=[]) => {
  let offset = 0
  let limit = 1000
  const folderContents = await box.getFolderContents(folderId, limit, offset, fields)
  if (folderContents.total_count > limit) {
    while (true) {
      offset += limit
      const remainingFiles = await box.getFolderContents(folderId, limit, offset)
      folderContents.entries = folderContents.entries.concat(remainingFiles.entries)
      if (remainingFiles.entries.length < limit) {
        break
      }
    }
  }
  return folderContents
}

box.getFileContent = async (id, isFileJSON=false, urlOnly=false, opts={}) => {
  const contentEndpoint = `${box.endpoints['data']['file']}/${id}/${box.endpoints['subEndpoints']['content']}`
  if (urlOnly) {
    const ac = new AbortController()
    opts["signal"] = ac.signal
    const fileContent = await utils.boxRequest(contentEndpoint, opts, isFileJSON)
    ac.abort()
    return fileContent.url
  } else {
    return utils.boxRequest(contentEndpoint, opts, isFileJSON)
  }
}

box.getThumbnail = async (id) => {
  const sizeParams = "min_width=50&min_height=50&max_width=160&max_height=160"
  let thumbnailEndpoint = `${box.endpoints['data']['file']}/${id}/${box.endpoints['subEndpoints']['thumbnail']}`
  thumbnailEndpoint += `?${sizeParams}`
  try {
    const thumbnailResp = await utils.boxRequest(thumbnailEndpoint, {}, false)
    const thumbnailBlob = await thumbnailResp.blob()
    return URL.createObjectURL(thumbnailBlob)
  } catch (e) {
    throw Error(e.message)
  }
}

box.getMetadata = async (id, type) => {
  const metadataAPI = `${box.endpoints['data'][type]}/${id}/${box.endpoints['subEndpoints']['metadata']}`
  let metadata = {}
  try {
    metadata = await utils.boxRequest(metadataAPI)
  } catch (e) {
    if (e.message === "404") {
      metadata = await box.createMetadata(id, type)
    }
  }
  return metadata
}

box.createMetadata = async (id, type, body=JSON.stringify({})) => {
  const metadataAPI = `${box.endpoints['data'][type ]}/${id}/${box.endpoints['subEndpoints']['metadata']}`
  return utils.boxRequest(metadataAPI, {
    'method': "POST",
    'headers': {
      'Content-Type': "application/json"
    },
    'body': body
  })
}

box.uploadFile = (updateData, id) => {
  // If id is present, the file needs to be updated, otherwise create a new file.
  const uploadEndpoint = id ? `${box.endpoints['upload']}/${id}/${box.endpoints['subEndpoints']['content']}` : `${box.endpoints['upload']}/${box.endpoints['subEndpoints']['content']}`
  return utils.boxRequest(uploadEndpoint, {
    'method': "POST",
    'body': updateData
  })
}

box.updateMetadata = async (id, path, updateData) => {
  const updatePatch = [{
    'op': "add",
    path,
    'value': updateData
  }]
  let metadata = {}
  try {
    metadata = await utils.boxRequest(`${box.endpoints['data']["file"]}/${id}/${box.endpoints['subEndpoints']['metadata']}`, {
      'method': "PUT",
      'headers': {
        'Content-Type': "application/json-patch+json"
      },
      'body': JSON.stringify(updatePatch)
    })
  } catch (e) {
    if (e.message === "404") {
      await box.createMetadata(id, "file")
      await box.updateMetadata(id, path, updateData)
    }
  }
  return metadata
}

box.getRepresentation = async (url) => {
  const isFileJSON = false
  const resp = await utils.boxRequest(url, {}, isFileJSON)
  if (resp.status === 200) {
    const imageBlob = await resp.blob()
    return URL.createObjectURL(imageBlob)
  }
}

box.search = (name, type="file", parentFolderIds=[0], limit=100, fields=[]) => {
  const defaultFields = ["id", "name", "path_collection", "metadata.global.properties"]
  const fieldsRequested = [... new Set(defaultFields.concat(fields))].join(",")
  const queryParams = `query=${name}&ancestor_folder_ids=${parentFolderIds.join(",")}&type=${type}&content_types=name&limit=${limit}&fields=${fieldsRequested}`
  const searchEndpoint = `${box.endpoints.search}?${queryParams}`
  return utils.boxRequest(searchEndpoint)
}

box.iterativeSearchInFolder = async (nameToSearch, parentFolderId, sortDirection="DESC") => {
  let foundEntry = {}
  let searchOffset = 0
  const limit = 1000
  const queryParams = {'sort': "name", 'direction': sortDirection}

  while (!foundEntry.id) {
    const folderContents = await box.getFolderContents(parentFolderId, limit, searchOffset, [], queryParams)
    foundEntry = folderContents.entries.find(entry => entry.name === nameToSearch) || {}
    if (searchOffset + limit < folderContents.total_count) {
      searchOffset += limit
    } else {
      break
    }
  }
  return foundEntry
}

box.createFolder = async (folderName, parentFolderId=0) => {
  const createFolderEndpoint = box.endpoints.data.folder
  const folderDetails = {
    'name': folderName,
    'parent': {
      'id': parentFolderId
    }
  }
  return await utils.boxRequest(createFolderEndpoint, {
    'method': "POST",
    'headers': {
      "Content-Type": "application/json"
    },
    'body': JSON.stringify(folderDetails)
  })
}

box.createEpiboxConfig = async (epiBoxFolderId, application=APPNAME) => {
  // Writes the epibox config file when not present.
  const creationTimestamp = Date.now()

  const newUserConfigFD = new FormData()
  const configFileAttributes = {
    "name": epiBoxConfigFileName,
    "parent": {
      "id": epiBoxFolderId
    }
  }
  
  const epiBoxConfigTemplate = await utils.request(configTemplates.epiBoxConfig, {}, true)
  epiBoxConfigTemplate.userId = window.localStorage.userId
  epiBoxConfigTemplate.createdAt = creationTimestamp
  epiBoxConfigTemplate.lastModifiedAt = creationTimestamp
  epiBoxConfigTemplate.applications.push({
    "name": APPNAME
  })
  const newConfigBlob = new Blob([JSON.stringify(epiBoxConfigTemplate)], {
    type: "application/json"
  })

  newUserConfigFD.append("attributes", JSON.stringify(configFileAttributes))
  newUserConfigFD.append("file", newConfigBlob)

  await box.uploadFile(newUserConfigFD)
}

box.getUserConfig = async () => {
  // Gets the application configuration file from the _epibox folder in the user's root directory. First checks the epiboxUserConfig for an entry
  // corresponding to the application. If present, reads and returns the file id in the entry; if absent, creates the entire hierarchy of folders
  // required for the config file to be present.

  // const { entries: rootEntries } = await box.search(epiBoxFolderName, "folder", [boxRootFolderId], 1000)
  // let rootEpiBoxEntry = rootEntries.find(entry => entry.name === epiBoxFolderName && entry.path_collection.entries.length === 1 && entry.path_collection.entries[0].id === boxRootFolderId)
  // if (!rootEpiBoxEntry) {
  let rootEpiBoxEntry = await box.iterativeSearchInFolder(epiBoxFolderName, boxRootFolderId, "DESC")

  if (!rootEpiBoxEntry?.id) {
    // Create _epibox folder as it doesn't exist
    rootEpiBoxEntry = await box.createFolder(epiBoxFolderName, boxRootFolderId)
    box.createEpiboxConfig(rootEpiBoxEntry.id)
  }
  // }

  const epiBoxFolderId = rootEpiBoxEntry.id

  let appFolderEntry = await box.iterativeSearchInFolder(appFolderName, epiBoxFolderId, "DESC")

  if (!appFolderEntry?.id) {
    // Create _epiPath folder if it doesn't exist
    appFolderEntry  = await box.createFolder(appFolderName, epiBoxFolderId)
  }


  const appFolderId = appFolderEntry.id
  
  let userConfig = {}
  let appConfigFileEntry = await box.iterativeSearchInFolder(userConfigFileName, appFolderId, "DESC")
    
  if (appConfigFileEntry) {
    userConfig = await box.getFileContent(appConfigFileEntry.id, true)
  } else {
    // Creates user config file if it doesn't exist.
    const newUserConfigFD = new FormData()
    const configFileAttributes = {
      "name": userConfigFileName,
      "parent": {
        "id": appFolderId
      }
    }
    
    const userConfigTemplate = await utils.request(configTemplates.userConfig, {}, true)
    userConfigTemplate["userId"] = window.localStorage.userId
    const newConfigBlob = new Blob([JSON.stringify(userConfigTemplate)], {
      type: "application/json"
    })

    newUserConfigFD.append("attributes", JSON.stringify(configFileAttributes))
    newUserConfigFD.append("file", newConfigBlob)

    const uploadResp = await box.uploadFile(newUserConfigFD)
    appConfigFileEntry = uploadResp.entries[0]
    userConfig = userConfigTemplate
  }
  
  box.appConfigFileId = appConfigFileEntry.id
  
  return userConfig
}

box.createDatasetConfig = async (datasetFolderId, appFolderId, datasetFolderName, datasetConfigTemplate) => {
  const newDatasetConfigFD = new FormData()
  const configFileAttributes = {
    "name": datasetConfigFileName,
    "parent": {
      "id": appFolderId
    }
  }
  if (!datasetConfigTemplate) {
    datasetConfigTemplate = await utils.request(configTemplates.datasetConfig, {}, true)
  }
  
  datasetConfigTemplate.datasetFolderId = datasetFolderId
  datasetConfigTemplate.datasetConfigFolderId = appFolderId
  datasetConfigTemplate.datasetFolderName = datasetFolderName
  
  const modelsParentFolderEntry = await box.createFolder("models", appFolderId)
  datasetConfigTemplate.models.parentFolderId = modelsParentFolderEntry.id
  const jpegRepresentationsFolderEntry = await box.createFolder("jpegRepresentations", appFolderId)
  datasetConfigTemplate.jpegRepresentationsFolderId = jpegRepresentationsFolderEntry.id
  const wsiThumbnailsFolderEntry = await box.createFolder("wsiThumbnails", appFolderId)
  datasetConfigTemplate.wsiThumbnailsFolderId = wsiThumbnailsFolderEntry.id
  const wsiPredsFolderEntry = await box.createFolder("wsiPreds", appFolderId)
  datasetConfigTemplate.wsiPredsFolderId = wsiPredsFolderEntry.id

  const newConfigBlob = new Blob([JSON.stringify(datasetConfigTemplate)], {
    type: "application/json"
  })
  newDatasetConfigFD.append("attributes", JSON.stringify(configFileAttributes))
  newDatasetConfigFD.append("file", newConfigBlob)

  const configFileUploadResp = await box.uploadFile(newDatasetConfigFD)
  appConfigFileEntry = configFileUploadResp.entries[0]
  datasetConfig = datasetConfigTemplate
  
  await box.addDatasetToAppConfig(datasetFolderId, appConfigFileEntry.id)
  
  box.changeLastUsedDataset(datasetFolderId)
  box.currentDatasetConfigFileId = appConfigFileEntry.id
  
  return datasetConfig
}

box.getDatasetConfig = (datasetFolderId, forceCreateNew=false) => new Promise(async (resolve) => {
  let datasetConfig = {}
  
  const availableDataset = path.userConfig.datasetsUsed.find(dataset => dataset.folderId === datasetFolderId)
  if (availableDataset && !forceCreateNew) {
    try {
      datasetConfig = await box.getFileContent(availableDataset.configFileId, true)
      
      resolve(datasetConfig)      
      box.currentDatasetConfigFileId = availableDataset.configFileId
        
    } catch (e) {
      if (e.message === "404") {
        resolve(box.getDatasetConfig(datasetFolderId, true))
        return
      }
    }
  } else {
    
    let datasetEpiBoxEntry = await box.iterativeSearchInFolder(epiBoxFolderName, datasetFolderId, "DESC")
    
    if (!datasetEpiBoxEntry?.id) {
      // Create _epibox folder as it doesn't exist.
      datasetEpiBoxEntry = await box.createFolder(epiBoxFolderName, datasetFolderId)
    }
  
    const epiBoxFolderId = datasetEpiBoxEntry.id
    let appFolderEntry = await box.iterativeSearchInFolder(appFolderName, epiBoxFolderId, "DESC")
    
    if (!appFolderEntry?.id) {
      // Create _epiPath folder if it doesn't exist
      appFolderEntry = await box.createFolder(appFolderName, epiBoxFolderId)
    }
  
    const appFolderId = appFolderEntry.id
    let appConfigFileEntry = await box.iterativeSearchInFolder(datasetConfigFileName, appFolderId, "DESC")
    
    if (!appConfigFileEntry?.id) {
      // Creates dataset config file if it doesn't exist.
      const datasetFolderName = datasetEpiBoxEntry.path_collection.entries[datasetEpiBoxEntry.path_collection.entries.length - 1].name
      datasetConfig = await box.createDatasetConfig(datasetFolderId, appFolderId, datasetFolderName)
      resolve(datasetConfig)
      return
    } else {
      datasetConfig = await box.getFileContent(appConfigFileEntry.id, true)
      console.log(datasetFolderId, datasetConfig.datasetFolderId)
      box.currentDatasetConfigFileId = appConfigFileEntry.id
     
      if (false && datasetFolderId != datasetConfig.datasetFolderId) {
      
        if (!path.root.querySelector("div#copiedDatasetModal")) {
          const copiedDatasetModalDiv = document.createElement("div")
          copiedDatasetModalDiv.setAttribute("id", "copiedDatasetModal")
          copiedDatasetModalDiv.setAttribute("class", "modal")
          copiedDatasetModalDiv.setAttribute("role", "dialog")
          copiedDatasetModalDiv.setAttribute("tabindex", "-1")
  
          const copyDatasetButton = document.createElement("button")
          copyDatasetButton.setAttribute("type", "button")
          copyDatasetButton.setAttribute("class", "btn btn-secondary")
          copyDatasetButton.setAttribute("data-dismiss", "modal")
          copyDatasetButton.innerText = "Keep"
          copyDatasetButton.onclick = async () => {
            const datasetFolderName = datasetEpiBoxEntry.path_collection.entries[datasetEpiBoxEntry.path_collection.entries.length - 1].name
            datasetConfig = await box.copyDataset(datasetConfig, datasetFolderId, appFolderId, datasetFolderName)
            resolve(datasetConfig)
          }
          
          const createNewDatasetButton = document.createElement("button")
          createNewDatasetButton.setAttribute("type", "button")
          createNewDatasetButton.setAttribute("class", "btn btn-primary")
          createNewDatasetButton.setAttribute("data-dismiss", "modal")
          createNewDatasetButton.innerText = "Create New"
          createNewDatasetButton.onclick = async () => {
            const datasetFolderName = datasetEpiBoxEntry.path_collection.entries[datasetEpiBoxEntry.path_collection.entries.length - 1].name
            datasetConfig = await box.createDatasetConfig(datasetFolderId, appFolderId, datasetFolderName)
            resolve(datasetConfig)
          }
          
          copiedDatasetModalDiv.insertAdjacentHTML("beforeend", `
            <div class="modal-dialog" role="document">
              <div class="modal-content">
                <div class="modal-header">
                  <h5 class="modal-title">Copy Dataset?</h5>
                  <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
                <div class="modal-body">
                  <p>This dataset seems to have been configured for a different folder. Press Keep to retain the configuration as it is, or press Create New to set up a completely new dataset.</p>
                </div>
                <div class="modal-footer">
                  ${copyDatasetButton.outerHTML}
                  ${createNewDatasetButton.outerHTML}
                </div>
              </div>
            </div>
          `)
          path.root.appendChild(copiedDatasetModalDiv)
          const copiedDatasetModal = new BSN.Modal(copiedDatasetModalDiv)
          copiedDatasetModal.show()
        }
      }
      resolve(datasetConfig)
      return
    }
  }
  box.changeLastUsedDataset(datasetFolderId)
})

box.addDatasetToAppConfig = async (datasetFolderId, configFileId) => {
  const newUserConfigFD = new FormData()
  const configFileAttributes = {
    "name": userConfigFileName
  }
  
  const preExistingDatasetIndex = path.userConfig.datasetsUsed.findIndex(dataset => dataset.folderId === datasetFolderId)
  if (preExistingDatasetIndex !== -1) {
    path.userConfig.datasetsUsed[preExistingDatasetIndex].configFileId = configFileId
  } else {
    path.userConfig.datasetsUsed.push({
      'folderId': datasetFolderId,
      'configFileId': configFileId
    })
  }

  const newConfigBlob = new Blob([JSON.stringify(path.userConfig)], {
    type: "application/json"
  })

  newUserConfigFD.append("attributes", JSON.stringify(configFileAttributes))
  newUserConfigFD.append("file", newConfigBlob)

  await box.uploadFile(newUserConfigFD, box.appConfigFileId)
}

box.changeLastUsedDataset = (datasetFolderId) => {
  if (path.userConfig.lastUsedDataset !== datasetFolderId) {
    const newUserConfigFD = new FormData()
    const configFileAttributes = {
      "name": userConfigFileName
    }
    
    path.userConfig.lastUsedDataset = datasetFolderId
    path.userConfig.preferences.datasetAccessLog = path.userConfig.preferences.datasetAccessLog || {}
    path.userConfig.preferences.datasetAccessLog[datasetFolderId] = Date.now()

    const newConfigBlob = new Blob([JSON.stringify(path.userConfig)], {
      type: "application/json"
    })
  
    newUserConfigFD.append("attributes", JSON.stringify(configFileAttributes))
    newUserConfigFD.append("file", newConfigBlob)
  
    box.uploadFile(newUserConfigFD, box.appConfigFileId)
  }
}

box.addToDatasetConfig = (objectToAdd) => {
  const newDatasetConfigFD = new FormData()
  const configFileAttributes = {
    "name": datasetConfigFileName
  }

  path.datasetConfig = { ...path.datasetConfig, ...objectToAdd }
  const newConfigBlob = new Blob([JSON.stringify(path.datasetConfig)], {
    type: "application/json"
  })

  newDatasetConfigFD.append("attributes", JSON.stringify(configFileAttributes))
  newDatasetConfigFD.append("file", newConfigBlob)
  
  box.uploadFile(newDatasetConfigFD, box.currentDatasetConfigFileId)
}