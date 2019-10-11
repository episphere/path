const box = async () => {
  const client_id = window.location.host.includes("localhost") ? "52zad6jrv5v52mn1hfy1vsjtr9jn5o1w" : "1n44fu5yu1l547f2n2fgcw7vhps7kvuw"
  const state = "sALTfOrSEcUrITy"
  const redirect_uri = window.location.host.includes("localhost") ? "http://localhost:8000" : "https://episphere.github.io/path"
  const boxAuthEndpoint = encodeURI(`https://account.box.com/api/oauth2/authorize?response_type=code&client_id=${client_id}&state=${state}&redirect_uri=${redirect_uri}`)
  const client_secret = window.location.host.includes("localhost") ? "2rHTqzJumz8s9bAjmKMV83WHX1ooN4kT" : "2ZYzmHXGyzBcjZ9d1Ttsc1d258LiGGVd"
  const boxAccessTokenEndpoint = "https://api.box.com/oauth2/token"
  const boxUserEndpoint = "https://api.box.com/2.0/users/me"

  document.getElementById("boxLoginBtn").onclick = () => window.location.replace(boxAuthEndpoint)

  const isLoggedIn = async () => {
    if (window.localStorage.box) {
      const boxCreds = JSON.parse(window.localStorage.box)
      if (boxCreds["box_access_token"] && boxCreds["box_token_expiry"]) {
        if (boxCreds["box_token_expiry"] < Date.now()) {
          await getAccessToken('refresh_token', boxCreds["box_refresh_token"])
        }
        return true
      }
    }
    return false
  }
  
  const getAccessToken = async (type, token) => {
    const requestType = type === "refresh_token" ? type : "code"
    try {
      var resp = await utils.request(boxAccessTokenEndpoint, {
        'method': "POST",
        'body': `grant_type=${type}&${requestType}=${token}&client_id=${client_id}&client_secret=${client_secret}`
      })
    } catch (err) {
      console.log("ERROR REFRESHING BOX TOKEN!", err)
    }
    const newCreds = storeCredsToLS(resp)
    await getUserProfile(newCreds)
  }

  const storeCredsToLS = (boxCreds) => {
    const expiry = (boxCreds["expires_in"] - 2 * 60) * 1000 + Date.now()
    const newCreds = {
      'box_access_token': boxCreds["access_token"],
      'box_token_expiry': expiry,
      'box_refresh_token': boxCreds["refresh_token"]
    }
    window.localStorage.box = JSON.stringify(newCreds)
    return newCreds
  }

  const getUserProfile = async (boxCreds) => {
    const { id, name, login } = await utils.request(boxUserEndpoint, {
      'headers': {
        'authorization': `Bearer ${boxCreds["box_access_token"]}`
      }
    })
    window.localStorage.userId = id
    window.localStorage.username = name
    window.localStorage.email = login
  }

  if (await isLoggedIn()) {
    const boxLoginEvent = new CustomEvent("boxLoggedIn", {})
    document.dispatchEvent(boxLoginEvent)
  }
  else if (urlParams["code"]) {
    try {
      await getAccessToken("authorization_code", urlParams["code"])
    } catch (err) {
      console.log("ERROR LOGGING IN TO BOX!", err)
    }
    const replaceURLPath = window.location.host.includes("localhost") ? "/" : "/path"
    window.history.replaceState({}, "", replaceURLPath)
    const boxLoginEvent = new CustomEvent("boxLoggedIn", {})
    document.dispatchEvent(boxLoginEvent)
  } else {
    document.getElementById("boxLoginBtn").style = "display: block"
  }
}