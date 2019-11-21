const box = async () => {
  const client_id = window.location.host.includes("localhost") ? "52zad6jrv5v52mn1hfy1vsjtr9jn5o1w" : "1n44fu5yu1l547f2n2fgcw7vhps7kvuw"
  const state = "sALTfOrSEcUrITy"
  const redirect_uri = window.location.host.includes("localhost") ? "http://localhost:8000" : "https://episphere.github.io/path"
  const boxAuthEndpoint = encodeURI(`https://account.box.com/api/oauth2/authorize?response_type=code&client_id=${client_id}&state=${state}&redirect_uri=${redirect_uri}`)
  const client_secret = window.location.host.includes("localhost") ? "2rHTqzJumz8s9bAjmKMV83WHX1ooN4kT" : "2ZYzmHXGyzBcjZ9d1Ttsc1d258LiGGVd"
  const boxAccessTokenEndpoint = "https://api.box.com/oauth2/token"
  box.basePath = "https://api.box.com/2.0"
  box.endpoints = {
    'user': `${box.basePath}/users/me`,
    'data': {
      'folder': `${box.basePath}/folders`,
      'file': `${box.basePath}/files`
    },
    'subEndpoints': {
      'metadata': `metadata/global/properties`,
      'content': 'content'
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
    utils.boxRequest = async (url, opts = {}) => {
      await box.isLoggedIn()
      const boxHeaders = {
        'Authorization': `Bearer ${JSON.parse(window.localStorage.box)["access_token"]}`,
        'Content-Type': opts.method !== "PUT" ?  "application/json" : "application/json-patch+json"
      }
      opts['headers'] = opts['headers'] ? {
        ...boxHeaders,
        ...opts['headers']
      } : boxHeaders
      return utils.request(url, opts)
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
    let urlHash = "#"
    urlHash += window.localStorage.currentImage ? `image=${window.localStorage.currentImage}` : ""
    urlHash += window.localStorage.extModules ? (urlHash.length > 1 ? `&extModules=${window.localStorage.extModules}`: `extModules=${window.localStorage.extModules}`) : ""
    replaceURLPath += urlHash.length > 1 ? urlHash : ""
    window.history.replaceState({}, "", replaceURLPath)
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
}


box.setupFilePicker = (successCB, cancelCB) => {
  const boxPopup = new BoxSelect()
  
  const defaultSuccessCB = (response) => {
    
    if (hashParams['image']) {
      window.location.hash = window.location.hash.replace(`image=${hashParams['image']}`, `image=${response[0].id}`)
    } else {
      window.location.hash = window.location.hash ? window.location.hash + `&image=${response[0].id}` : `image=${response[0].id}`
    }
    window.localStorage.currentImage = response[0].id
    
    document.getElementById("imgHeader").innerText = response[0].name
    path.tmaImage.setAttribute("src", response[0].url)
    path.tmaImage.setAttribute("crossorigin", "Anonymous")
    box.getMetadata(response[0].id, "file").then(res => window.localStorage.fileMetadata = JSON.stringify(res))
  }
  successCB = successCB || defaultSuccessCB
  boxPopup.success(successCB);
  
  const defaultCancelCB = () => console.log("File Selection Cancelled.")
  cancelCB = cancelCB || defaultCancelCB
  boxPopup.cancel(cancelCB);
  
}


box.getData = async (id, type) => {
  const dataEndpoint = type in box.endpoints['data'] && `${box.endpoints['data'][type]}`
  if (await box.isLoggedIn()) {
    try {
      if (type === 'file') {
        box.getMetadata(id, "file").then(res => window.localStorage.fileMetadata = JSON.stringify(res))
      }
      return await utils.boxRequest(`${dataEndpoint}/${id}`)
    } catch (e) {
      console.log(`Error fetching data for ${type} with ID ${id}`, e)
      return {}
    }
  } else {
    return {}
  }
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

box.getMetadata = async (id, type) => {
  const metadataAPI = `${box.endpoints['data'][type]}/${id}/${box.endpoints['subEndpoints']['metadata']}`
  let metadata = await utils.boxRequest(metadataAPI)
  if (metadata.status === 404) {
    metadata = utils.boxRequest(metadataAPI, { 'method': "POST", 'body': JSON.stringify({}) })
  }
  return metadata
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