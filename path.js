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
  box()
  path.root = document.getElementById("tmaPath")
  path.imageDiv = document.getElementById("imageDiv")
  path.loadCanvas()
}

path.loadCanvas = () => {
  const fileInput = document.getElementById("imgInput")
  const imgElement = document.createElement("img")
  imgElement.setAttribute("id", "tmaImg")
  imgElement.setAttribute("src", defaultImg)
  imgElement.setAttribute("width", "500")
  imgElement.setAttribute("height", "500")
  path.imageDiv.appendChild(imgElement)

  fileInput.onchange = ({
    target: {
      files
    }
  }) => {
    document.getElementById("imgHeader").innerText = files[0].name
    imgElement.setAttribute("src", URL.createObjectURL(files[0]))
  }

  const canvas = document.createElement("canvas")
  canvas.setAttribute("id", "tmaCanvas")
  imgElement.onload = () => {
    canvas.setAttribute("width", imgElement.width)
    canvas.setAttribute("height", imgElement.height)
    const context = canvas.getContext('2d')
    context.drawImage(imgElement, 0, 0)
    path.imageDiv.appendChild(document.createElement("br"))
    path.imageDiv.appendChild(canvas)

  }
}