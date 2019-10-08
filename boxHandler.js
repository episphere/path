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
      let boxCreds = JSON.parse(window.localStorage.box)
      if (boxCreds["box_access_token"] && boxCreds["box_token_expiry"]) {
        if (boxCreds["box_token_expiry"] < Date.now()) {
          boxCreds = await getNewAccessToken(boxCreds)
        }
        await getUserProfile(boxCreds)
        return true
      }
    }
    return false
  }

  const getNewAccessToken = async (boxCreds) => {
    try {
      const resp = await utils.request(boxAccessTokenEndpoint, {
        'method': "POST",
        'body': `grant_type=refresh_token&refresh_token=${boxCreds["box_refresh_token"]}&client_id=${client_id}&client_secret=${client_secret}`
      })
      return storeCredsToLS(resp)
    } catch (err) {
      console.log("ERROR REFRESHING BOX TOKEN!", err)
      return {}
    }
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
    const {
      id,
      name,
      login
    } = await utils.request(boxUserEndpoint, {
      'headers': {
        'authorization': `Bearer ${boxCreds["box_access_token"]}`
      }
    })
    window.localStorage.userId = id
    window.localStorage.username = name
    window.localStorage.email = login
  }

  if (await isLoggedIn()) {
    document.getElementById("boxLoginBtn").style = "display: none"
    document.getElementById("username").appendChild(document.createTextNode(`Welcome ${window.localStorage.username.split(" ")[0]}!`))
    const boxPopup = new BoxSelect();
    boxPopup.success(function (response) {
      // document.getElementById("imageDiv").src = response[0].url
      // const img = document.getElementById("selectedImage")
      // img.onload = () => {
      //   const canvas = document.createElement('canvas')
      //   canvas.width = img.width
      //   canvas.height = img.height
      //   canvas.context = canvas.getContext('2d')
      //   canvas.context.drawImage(img, 0, 0, img.width, img.height)
      //   canvas.style = {
      //     position: "absolute",
      //     left: img.getBoundingClientRect().left
      //   }
      //   document.getElementById('canvasDiv').appendChild(canvas)
      // }
      console.log(response)
    });
    // Register a cancel callback handler
    boxPopup.cancel(function () {
      console.log("The user clicked cancel or closed the popup");
    });
    return
  }
  if (urlParams["code"]) {
    try {
      const resp = await utils.request(boxAccessTokenEndpoint, {
        method: "POST",
        body: `grant_type=authorization_code&code=${urlParams["code"]}&client_id=${client_id}&client_secret=${client_secret}`
      })
      storeCredsToLS(resp)
      window.location.search = ""
    } catch (err) {
      console.log("ERROR LOGGING IN TO BOX!", err)
    }
  }
}