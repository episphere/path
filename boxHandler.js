const box = async () => {
  const client_id = window.location.host.includes("localhost") ? "52zad6jrv5v52mn1hfy1vsjtr9jn5o1w" : "1n44fu5yu1l547f2n2fgcw7vhps7kvuw"
  const state = "sALTfOrSEcUrITy"
  const redirect_uri = window.location.host.includes("localhost") ? "http://localhost:8000" : "https://episphere.github.io/path"
  const boxAuthEndpoint = encodeURI(`https://account.box.com/api/oauth2/authorize?response_type=code&client_id=${client_id}&state=${state}&redirect_uri=${redirect_uri}`)
  const client_secret = window.location.host.includes("localhost") ? "2rHTqzJumz8s9bAjmKMV83WHX1ooN4kT" : "2ZYzmHXGyzBcjZ9d1Ttsc1d258LiGGVd"
  const boxAccessTokenEndpoint = "https://api.box.com/oauth2/token"
  box.appBasePath = "https://nih.app.box.com"
  box.basePath = "https://api.box.com/2.0"
  box.endpoints = {
    'user': `${box.basePath}/users/me`,
    'data': {
      'folder': `${box.basePath}/folders`,
      'file': `${box.basePath}/files`
    },
    'subEndpoints': {
      'metadata': "metadata/global/properties",
      'content': "content",
      'items': "items",
      'thumbnail': "thumbnail.jpg"
    }
  }

  document.getElementById("boxLoginBtn").onclick = () => window.location.replace(boxAuthEndpoint)

  box.isLoggedIn = async () => {
    if (window.localStorage.box) {
      const boxCreds = JSON.parse(window.localStorage.box)
      if (boxCreds["access_token"] && boxCreds["token_expiry"]) {
        if (boxCreds["token_expiry"] < Date.now()) {
          await getAccessToken('refresh_token', boxCreds["refresh_token"])
        }
        return true
      }
    }
    return false
  }

  const getAccessToken = async (type, token) => {
    const requestType = type === "refresh_token" ? type : "code"
    // try {
    const resp = await utils.request(boxAccessTokenEndpoint, {
      'method': "POST",
      'body': `grant_type=${type}&${requestType}=${token}&client_id=${client_id}&client_secret=${client_secret}`
    })
    storeCredsToLS(resp)
    // } catch (err) {
    //   console.log("ERROR Retrieving Box Access Token!", err)
    // } 
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
      const boxHeaders = {
        'Authorization': `Bearer ${JSON.parse(window.localStorage.box)["access_token"]}`,
        'Content-Type': opts.method !== "PUT" ?  "application/json" : "application/json-patch+json"
      }
      opts['headers'] = opts['headers'] ? {
        ...boxHeaders,
        ...opts['headers']
      } : boxHeaders
      return utils.request(url, opts, returnJson)
    }
    const boxLoginEvent = new CustomEvent("boxLoggedIn", {})
    document.dispatchEvent(boxLoginEvent)
  }

  if (await box.isLoggedIn()) {
    triggerLoginEvent()
  } else if (urlParams["code"]) {
    try {
      await getAccessToken("authorization_code", urlParams["code"])
    } catch (err) {
      console.log("ERROR LOGGING IN TO BOX!", err)
    }
    let replaceURLPath = window.location.host.includes("localhost") ? "/" : "/path"
    const urlHash = Object.entries(JSON.parse(window.localStorage.hashParams)).map(([key, val]) => `${key}=${val}`).join("&")
    window.history.replaceState({}, "", `${replaceURLPath}#${urlHash}`)
    // window.location.hash = urlHash
    triggerLoginEvent()
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
  document.getElementById("filePickers_or_box").style.display = "block"
  document.getElementById("username").appendChild(document.createTextNode(`Welcome ${window.localStorage.username.split(" ")[0]}!`))
}


box.setupFilePicker = (successCB, cancelCB) => {
  const boxPopup = new BoxSelect()
  
  const defaultSuccessCB = (response) => {
    if (response[0].name.endsWith(".jpg") || response[0].name.endsWith(".png")) {
      if (hashParams.image) {
        window.location.hash = window.location.hash.replace(`image=${hashParams.image}`, `image=${response[0].id}`)
      } else {
        window.location.hash += `image=${response[0].id}`
      }
    } else {
      alert("The item you selected from Box was not a valid image. Please select a file of type .jpg or .png!")
    }
  }
  successCB = successCB || defaultSuccessCB
  boxPopup.success(successCB)
  
  const defaultCancelCB = () => console.log("File Selection Cancelled.")
  cancelCB = cancelCB || defaultCancelCB
  boxPopup.cancel(cancelCB)
  
}


box.getData = async (id, type) => {
  const fieldsParam = "fields=id,type,name,metadata.global.properties,parent,path_collection"
  let dataEndpoint = type in box.endpoints['data'] && `${box.endpoints['data'][type]}/${id}`
  dataEndpoint += type === "file" ? `?${fieldsParam}` : ""
  return utils.boxRequest && await utils.boxRequest(dataEndpoint)
}

box.getFolderContents = async (folderId, limit=15, offset=0) => {
  const fieldsParam = "fields=id,name"
  let itemsEndpoint = `${box.endpoints['data']['folder']}/${folderId}/${box.endpoints['subEndpoints']['items']}`
  itemsEndpoint += `?${fieldsParam}&limit=${limit}&offset=${offset}`
  return await utils.boxRequest(itemsEndpoint)
}

box.getFileContent = async (id) => {
  const contentEndpoint = `${box.endpoints['data']['file']}/${id}/${box.endpoints['subEndpoints']['content']}`
  if (await box.isLoggedIn()) {
    return await fetch(`${contentEndpoint}`, {
      'headers': {
        'Authorization': `Bearer ${JSON.parse(window.localStorage.box)["access_token"]}`
      }
    })
  } else {
    return {}
  }
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
  return utils.boxRequest(metadataAPI, { 'method': "POST", 'body': JSON.stringify({}) })
}

box.updateMetadata = async (id, type, path, updateData) => {
  const updatePatch = [{
    'op': "add",
    path,
    'value': updateData
  }]

  const resp = await utils.boxRequest(`${box.endpoints['data'][type]}/${id}/${box.endpoints['subEndpoints']['metadata']}`, {
    'method': "PUT",
    'headers': {
      'Content-Type': "application/json-patch+json"
    },
    body: JSON.stringify(updatePatch)
  })

  return resp

}