const epiBoxFolderName = "_epibox"
const appFolderName = `_${APPNAME}`
const datasetConfigFolderName = `_${APPNAME}`
const epiBoxConfigFileName = "_epiboxUserConfig.json"
const appConfigFileName = "_userConfig.json"
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
      if (boxCreds["access_token"] && boxCreds["token_expiry"]) {
        if (boxCreds["token_expiry"] < Date.now()) {
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
    const expiry = (boxCreds["expires_in"] - 2 * 60) * 1000 + Date.now()
    const newCreds = {
      'access_token': boxCreds["access_token"],
      'token_expiry': expiry,
      'refresh_token': boxCreds["refresh_token"]
    }
    window.localStorage.box = JSON.stringify(newCreds)
  }

  const triggerLoginEvent = async () => {
    utils.boxRequest = async (url, opts = {}, returnJson=true) => {
      await box.isLoggedIn()
      const boxHeaders = {}
      boxHeaders['Authorization'] = `Bearer ${JSON.parse(window.localStorage.box)["access_token"]}`
      opts['headers'] = opts['headers'] ? Object.assign(boxHeaders, opts['headers']) : boxHeaders   // Using Object.assign instead of spread operator for Edge compatibility
      return utils.request(url, opts, returnJson)
    }
    const boxLoginEvent = new CustomEvent("boxLoggedIn", {})
    document.dispatchEvent(boxLoginEvent)
  }

  if (await box.isLoggedIn()) {
    triggerLoginEvent()
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
      triggerLoginEvent()
    } catch (err) {
      utils.showToast("Some error occurred while logging in to Box. Please try again!")
      document.getElementById("boxLoginBtn").style = "display: block"
      console.log("ERROR LOGGING IN TO BOX!", err)
      return
    }
  } else {
    document.getElementById("boxLoginBtn").style = "display: block"
    return
  }
}

box.getUserProfile = async () => {
  const { id, name, login } = await utils.boxRequest(box.endpoints["user"])
  window.localStorage.userId = id
  window.localStorage.username = name
  window.localStorage.email = login
  document.getElementById("boxLoginBtn").style = "display: none"
  document.getElementById("username").innerText = `Welcome ${window.localStorage.username.split(" ")[0]}!`
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

box.getFolderContents = async (folderId, limit=15, offset=0, fields=[]) => {
  const defaultFields = ["id", "type", "name", "path_collection"]
  const fieldsToRequest = [... new Set(defaultFields.concat(fields)) ].join(",")
  const fieldsParam =  `fields=${fieldsToRequest}`
  let itemsEndpoint = `${box.endpoints['data']['folder']}/${folderId}/${box.endpoints['subEndpoints']['items']}`
  itemsEndpoint += `?${fieldsParam}&limit=${limit}&offset=${offset}`
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

box.getFileContent = async (id, isFileJSON=false) => {
  const contentEndpoint = `${box.endpoints['data']['file']}/${id}/${box.endpoints['subEndpoints']['content']}`
  return utils.boxRequest(contentEndpoint, {
    'headers': {
      'Authorization': `Bearer ${JSON.parse(window.localStorage.box)["access_token"]}`
    }
  }, isFileJSON)
}

box.getThumbnail = async (id) => {
  const sizeParams = "min_width=50&min_height=50&max_width=100&max_height=100"
  let thumbnailEndpoint = `${box.endpoints['data']['file']}/${id}/${box.endpoints['subEndpoints']['thumbnail']}`
  thumbnailEndpoint += `?${sizeParams}`
  const thumbnailResp = await utils.boxRequest(thumbnailEndpoint, {}, false)
  const thumbnailBlob = await thumbnailResp.blob()
  return URL.createObjectURL(thumbnailBlob)
}

box.getMetadata = async (id, type) => {
  const metadataAPI = `${box.endpoints['data'][type]}/${id}/${box.endpoints['subEndpoints']['metadata']}`
  let metadata = await utils.boxRequest(metadataAPI)
  if (metadata.status === 404) {
    metadata = await box.createMetadata(id, type) // Returns 409 for some reason, but works :/ Probably a bug in the Box API
  }
  return metadata
}

box.createMetadata = async (id, type) => {
  const metadataAPI = `${box.endpoints['data'][type]}/${id}/${box.endpoints['subEndpoints']['metadata']}`
  return utils.boxRequest(metadataAPI, {
    'method': "POST",
    'headers': {
      'Content-Type': "application/json"
    },
    'body': JSON.stringify({})
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

box.updateMetadata = (id, path, updateData) => {
  const updatePatch = [{
    'op': "add",
    path,
    'value': updateData
  }]

  return utils.boxRequest(`${box.endpoints['data']["file"]}/${id}/${box.endpoints['subEndpoints']['metadata']}`, {
    'method': "PUT",
    'headers': {
      'Content-Type': "application/json-patch+json"
    },
    'body': JSON.stringify(updatePatch)
  })

}

box.getRepresentation = async (url) => {
  const isFileJSON = false
  const resp = await utils.boxRequest(url, {}, isFileJSON)
  if (resp.status === 200) {
    const imageBlob = await resp.blob()
    return URL.createObjectURL(imageBlob)
  }
}

box.search = async (name, type="file", parentFolderIds=[0], limit=100, fields) => {
  const defaultFields = ["id", "name", "metadata.global.properties"]
  const fieldsRequested = [... new Set(defaultFields.concat(fields))].join(",")
  const queryParams = `query=${name}&ancestor_folder_ids=${parentFolderIds.join(",")}&type=${type}&content_types=name&limit=${limit}`
  const searchEndpoint = `${box.endpoints.search}?${queryParams}`
  return utils.boxRequest(searchEndpoint)
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

box.setupEpiboxConfig = async (epiBoxFolderId, application=APPNAME) => {
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

box.selectDataset = async (folderId) => {
  
}

box.getUserConfig = async () => {
  // Gets the application configuration file from the _epibox folder in the user's root directory. First checks the epiboxUserConfig for an entry
  // corresponding to the application. If present, reads and returns the file id in the entry; if absent, creates the entire hierarchy of folders
  // required for the config file to be present.

  const { entries: rootEntries } = await box.search(epiBoxFolderName, "folder", [boxRootFolderId], 1000)
  let rootEpiBoxEntry = rootEntries.find(entry => entry.name === epiBoxFolderName && entry.path_collection.entries.length === 1 && entry.path_collection.entries[0].id === boxRootFolderId)
  if (!rootEpiBoxEntry) {
    const rootFolderContents = await box.getAllFolderContents(boxRootFolderId) // To handle case where _epibox folder was very recently created, so doesn't show up in search response yet.
    if (rootFolderContents.entries.find(entry => entry.name === epiBoxFolderName)) {
      rootEpiBoxEntry = rootFolderContents.entries.find(entry => entry.name === epiBoxFolderName)
    } else {
      // Create _epibox folder if it doesn't exist
      rootEpiBoxEntry = await box.createFolder(epiBoxFolderName, boxRootFolderId)
      box.setupEpiboxConfig(rootEpiBoxEntry.id)
    }
  }

  const epiBoxFolderId = rootEpiBoxEntry.id
  const { entries: epiBoxEntries } = await box.search(appFolderName, "folder", [epiBoxFolderId], 1)
  let appFolderEntry = epiBoxEntries.find(entry => entry.name === epiBoxFolderName && entry.path_collection.entries.length === 2 && entry.path_collection.entries[entry.path_collection.entries.length - 1].id === epiBoxFolderId)
  if (!appFolderEntry) {
    const epiBoxContents = await box.getAllFolderContents(epiBoxFolderId) // To handle case where app folder was very recently created, so doesn't show up in search response yet.
    appFolderEntry = epiBoxContents.entries.find(entry => entry.name === appFolderName)
    if (!appFolderEntry) {
      // Create _epiPath folder if it doesn't exist
      appFolderEntry  = await box.createFolder(appFolderName, epiBoxFolderId)
    }
  }


  const appFolderId = appFolderEntry.id
  let userConfig = {}
  const { entries: appEntries } = await box.search(appConfigFileName, "file", [appFolderId], 1)
  let appConfigFileEntry = appEntries.find(file => file.name === appConfigFileName)
  if (!appConfigFileEntry) {
    const appFolderContents = await box.getAllFolderContents(appFolderId) // To handle case where config file was very recently created, so doesn't show up in search response yet.
    appConfigFileEntry = appFolderContents.entries.find(entry => entry.name === appConfigFileName)
    
    if (appConfigFileEntry) {
      userConfig = await box.getFileContent(appConfigFileEntry.id, true)
    } else {
      // Creates user config file if it doesn't exist.
      const newUserConfigFD = new FormData()
      const configFileAttributes = {
        "name": appConfigFileName,
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
  } else {
    userConfig = await box.getFileContent(appConfigFileEntry.id, true)
  }
  
  box.appConfigFileId = appConfigFileEntry.id
  
  return userConfig
}

box.getDatasetConfig = async (datasetFolderId) => {
  let datasetConfig = {}
  
  const availableDataset = path.userConfig.datasetsUsed.find(dataset => dataset.folderId === datasetFolderId)
  if (availableDataset) {
    datasetConfig = await box.getFileContent(availableDataset.configFileId, true)
    box.currentDatasetConfigFileId = availableDataset.configFileId
  } else {
    
    const { entries: datasetEntries } = await box.search(epiBoxFolderName, "folder", [datasetFolderId], 1000, ["path_collection"])
    let datasetEpiBoxEntry = datasetEntries.find(entry => entry.name === epiBoxFolderName && entry.path_collection.entries[entry.path_collection.entries.length - 1].id === datasetFolderId)
    if (!datasetEpiBoxEntry) {
      const datasetFolderContents = await box.getAllFolderContents(datasetFolderId) // To handle case where the dataset config folder was very recently created, so doesn't show up in search response yet.
      datasetEpiBoxEntry = datasetFolderContents.entries.find(entry => entry.name === epiBoxFolderName)
      if (!datasetEpiBoxEntry) {
        // Create _epibox folder if it doesn't exist.
        datasetEpiBoxEntry = await box.createFolder(epiBoxFolderName, datasetFolderId)
      }
    }
  
    const epiBoxFolderId = datasetEpiBoxEntry.id
    const { entries: epiBoxEntries } = await box.search(appFolderName, "folder", [epiBoxFolderId], 100)
    let appFolderEntry = epiBoxEntries.find(entry => entry.name === appFolderName && entry.path_collection.entries[entry.path_collection.entries.length - 1].id === epiBoxFolderId)
    if (!appFolderEntry) {
      const epiBoxContents = await box.getAllFolderContents(epiBoxFolderId) // To handle case where app folder was very recently created, so doesn't show up in search response yet.
      appFolderEntry = epiBoxContents.entries.find(entry => entry.name === appFolderName)
      if (!appFolderEntry) {
        // Create _epiPath folder if it doesn't exist
        appFolderEntry  = await box.createFolder(appFolderName, epiBoxFolderId)
      }
    }
  
    const appFolderId = appFolderEntry.id
    const { entries: appEntries } = await box.search(datasetConfigFileName, "file", [appFolderId], 100)
    let appConfigFileEntry = appEntries.find(file => file.name === datasetConfigFileName)
    if (!appConfigFileEntry) {
      const appFolderContents = await box.getAllFolderContents(appFolderId) // To handle case where config file was very recently created, so doesn't show up in Search response yet.
      appConfigFileEntry = appFolderContents.entries.find(entry => entry.name === datasetConfigFileName)
      
      if (appConfigFileEntry) {
        datasetConfig = await box.getFileContent(appConfigFileEntry.id, true)
      } else {
        // Creates user config file if it doesn't exist.
        const newDatasetConfigFD = new FormData()
        const configFileAttributes = {
          "name": datasetConfigFileName,
          "parent": {
            "id": appFolderId
          }
        }
        
        const datasetConfigTemplate = await utils.request(configTemplates.datasetConfig, {}, true)
        datasetConfigTemplate.datasetFolderId = datasetFolderId
        datasetConfigTemplate.datasetFolderName = datasetEpiBoxEntry.path_collection.entries[datasetEpiBoxEntry.path_collection.entries.length - 1].name
        const newConfigBlob = new Blob([JSON.stringify(datasetConfigTemplate)], {
          type: "application/json"
        })
  
        newDatasetConfigFD.append("attributes", JSON.stringify(configFileAttributes))
        newDatasetConfigFD.append("file", newConfigBlob)
  
        const configFileUploadResp = await box.uploadFile(newDatasetConfigFD)
        appConfigFileEntry = configFileUploadResp.entries[0]
        datasetConfig = datasetConfigTemplate
      }
    } else {
      datasetConfig = await box.getFileContent(appConfigFileEntry.id, true)
    }
    box.currentDatasetConfigFileId = appConfigFileEntry.id
    await box.addDatasetToAppConfig(datasetFolderId)
  }
  
  box.changeLastUsedDataset(datasetFolderId)

  return datasetConfig

}

box.addDatasetToAppConfig = async (datasetFolderId) => {
  const newUserConfigFD = new FormData()
  const configFileAttributes = {
    "name": appConfigFileName
  }
  
  path.userConfig.datasetsUsed.push({
    'folderId': datasetFolderId,
    'configFileId': box.currentDatasetConfigFileId
  })

  const newConfigBlob = new Blob([JSON.stringify(path.userConfig)], {
    type: "application/json"
  })

  newUserConfigFD.append("attributes", JSON.stringify(configFileAttributes))
  newUserConfigFD.append("file", newConfigBlob)

  await box.uploadFile(newUserConfigFD, box.appConfigFileId)
}

box.changeLastUsedDataset = async (datasetFolderId) => {
  if (path.userConfig.lastUsedDataset !== datasetFolderId) {
    const newUserConfigFD = new FormData()
    const configFileAttributes = {
      "name": appConfigFileName
    }
    
    path.userConfig.lastUsedDataset = datasetFolderId
    const newConfigBlob = new Blob([JSON.stringify(path.userConfig)], {
      type: "application/json"
    })
  
    newUserConfigFD.append("attributes", JSON.stringify(configFileAttributes))
    newUserConfigFD.append("file", newConfigBlob)
  
    await box.uploadFile(newUserConfigFD, box.appConfigFileId)
  }
}

box.addToDatasetConfig = async (objectToAdd) => {
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
  
  await box.uploadFile(newDatasetConfigFD, box.currentDatasetConfigFileId)
}