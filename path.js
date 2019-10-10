console.log("path.js loaded")

const urlParams = {}
window.location.search.slice(1).split('&').forEach(param => {
  const [key, value] = param.split('=')
  urlParams[key] = value
})

const defaultImg = "images/OFB_023_2_003_1_13_03.jpg"

const utils = {
  request: (url, opts) => fetch(url, opts).then(res => res.json()),
}

const path = async () => {
  path.root = document.getElementById("tmaPath")
  path.imageDiv = document.getElementById("imageDiv")
  path.tmaCanvas = document.getElementById("tmaCanvas")
  path.tmaImage = new Image()
  path.tmaImage.src = defaultImg
  path.setupEventListeners()
  
  await box()
  
}

path.setupEventListeners = () => {
  
  document.addEventListener("boxLoggedIn", () => {
    const boxPopup = new BoxSelect()
    boxPopup.success((response) => {
      document.getElementById("imgHeader").innerText = response[0].name
      path.tmaImage.setAttribute("src", response[0].url)
    });
    boxPopup.cancel(() => {
      console.log("The user clicked cancel or closed the popup");
    });
    document.getElementById("boxLoginBtn").style = "display: none"
    document.getElementById("username").appendChild(document.createTextNode(`Welcome ${window.localStorage.username.split(" ")[0]}!`))
    document.getElementById("filePickers_or").style.display = "block"
  })
  
  const fileInput = document.getElementById("imgInput")
  fileInput.onchange = ({ target: { files }}) => {
    document.getElementById("imgHeader").innerText = files[0].name
    path.tmaImage.setAttribute("src", URL.createObjectURL(files[0]))
  }
  
  path.tmaImage.onload = path.loadCanvas

}

path.loadCanvas = () => {
  path.tmaCanvas.setAttribute("width", path.root.getBoundingClientRect().width)
  path.tmaCanvas.setAttribute("height", path.tmaCanvas.width * path.tmaImage.height / path.tmaImage.width)
  const context = path.tmaCanvas.getContext('2d')
  context.drawImage(path.tmaImage, 0, 0, path.tmaCanvas.width, path.tmaCanvas.height)
}