const myBox = {}

myBox.loadFileManager = async (id = boxRootFolderId) => {
  const boxFileMgrHeaderDiv = document.getElementById("boxFileMgrHeader")
  if (boxFileMgrHeaderDiv.parentElement.getAttribute("folderId") === hashParams.folder) {
    return
  }

  const [fileMgrTools, fileMgrNav] = boxFileMgrHeaderDiv.children
  fileMgrTools.style.position = "absolute"
  fileMgrTools.style.display = "flex"
  fileMgrTools.style["flex-direction"] = "row"

  const folderData = await box.getData(id, "folder")
  if (folderData) {
    
    let backBtnSpan = document.getElementById("fileMgrBackBtn")
    if (!backBtnSpan) {
      backBtnSpan = document.createElement("span")
      backBtnSpan.setAttribute("id", "fileMgrBackBtn")
      backBtnSpan.setAttribute("class", "boxFileMgrHeaderBtn")

      const backButton =
        `<button type="button" class="btn" style="background-color: rgba(255, 255, 255); border: 1px solid lightgray;">
              <i style="font-size:25px; color: royalblue;" class="fas fa-caret-left"></i>
            </button>`
      backBtnSpan.innerHTML = backButton
      fileMgrTools.appendChild(backBtnSpan)
    }

    backBtnSpan.onclick = id === boxRootFolderId ? () => {} : (e) => {
      selectFolder(folderData.path_collection.entries[folderData.path_collection.entries.length - 1].id)
    }

    let homeBtnSpan = document.getElementById("fileMgrHomeBtn")
    if (!homeBtnSpan) {
      homeBtnSpan = document.createElement("span")
      homeBtnSpan.setAttribute("id", "fileMgrHomeBtn")
      homeBtnSpan.setAttribute("class", "boxFileMgrHeaderBtn")

      const homeButton =
        `<button type="button" class="btn" style="background-color: rgba(255, 255, 255); border: 1px solid lightgray;">
              <i style="font-size:25px; color: royalblue;" class="fas fa-home"></i>
            </button>`
      homeBtnSpan.innerHTML = homeButton
      fileMgrTools.appendChild(homeBtnSpan)
    }

    homeBtnSpan.onclick = id === boxRootFolderId ? () => {} : (e) => {
      selectFolder(boxRootFolderId)
    }

    fileMgrNav.setAttribute("id", "boxFileMgrNav")
    fileMgrNav.style.width = "100%"
    fileMgrNav.style.margin = "auto 0"
    fileMgrNav.style.textAlign = "center"

    fileMgrNav.innerHTML =
      `<strong style="font-size: 18px;">
            <a href="${box.appBasePath}/${folderData.type}/${folderData.id}" target="_blank">
              ${folderData.name}
            </a>
          </strong>`

    boxFileMgrHeaderDiv.style.display = "flex"
    boxFileMgrHeaderDiv.style.alignItems = "center"
    boxFileMgrHeaderDiv.style.height = "4rem";
    boxFileMgrHeaderDiv.style["background-color"] = "rgba(210, 210, 210, 0.2)";

    if (!boxFileMgrHeaderDiv.parentElement.querySelector("hr")) {
      boxFileMgrHeaderDiv.parentElement.insertBefore(document.createElement("hr"), boxFileMgrHeaderDiv.nextElementSibling)
    }

    myBox.loadFolderTree(folderData)
    boxFileMgrHeaderDiv.parentElement.setAttribute("folderId", id)

  } else if (folderData && folderData.status === 404) {
    alert("The folder ID in the URL does not point to a valid folder in your Box account!")
    selectFolder(boxRootFolderId)
  }

  // const forwardBtnSpan = document.getElementById("fileMgrForwardBtn") || document.createElement("span")
  // forwardBtnSpan.setAttribute("id", "fileMgrForwardBtn")
  // forwardBtnSpan.setAttribute("class", "boxFileMgrBtn")
  // const forwardButton = 
  //   `<button type="button" class="btn btn-light">
  //     <i class="fas fa-caret-right"></i>
  //   </button>`
  // forwardBtnSpan.innerHTML = forwardButton
}

myBox.loadFolderTree = (folderData) => {
  const {
    id
  } = folderData

  if (folderData && folderData.item_status === "active") {
    const {
      item_collection: {
        entries
      }
    } = folderData

    const parentElement = document.getElementById("boxFolderTree")

    if (entries.length !== 0) {
      const loaderElementId = "fileMgrLoaderDiv"
      // if (parentElement.childElementCount > 0) {
      //   showLoader(loaderElementId, parentElement)
      // }

      parentElement.firstChild && parentElement.removeChild(parentElement.firstChild) // Removes Empty Directory element (I think :P) 
      const folderSubDiv = myBox.populateFolderTree(entries, id)
      // hideLoader(loaderElementId)

      parentElement.style.height = window.innerHeight - parentElement.getBoundingClientRect().y - 30 // 40 seems to be the initial width of the canvas

      folderSubDiv.style.height = "100%"
      folderSubDiv.style.width = "100%"
      folderSubDiv.style.overflowY = "scroll"

      parentElement.appendChild(folderSubDiv)

    } else if (entries.length === 0) {
      parentElement.style.textAlign = "center"
      parentElement.innerText = "-- Empty Folder --"
    }
  }
}

myBox.populateFolderTree = (entries, id) => {
  const currentFolderDiv = document.createElement("div")
  currentFolderDiv.setAttribute("class", `boxFileMgr_folderTree`)
  currentFolderDiv.setAttribute("id", `boxFileMgr_folderTree_${id}`)
  entries.forEach(entry => {
    const entryBtnDiv = document.createElement("div")
    entryBtnDiv.setAttribute("id", `boxFileMgr_subFolder_${entry.id}`)
    entryBtnDiv.setAttribute("class", `boxFileMgr_subFolder`)
    const entryBtn = document.createElement("button")
    entryBtn.setAttribute("class", "btn btn-link")
    entryBtn.setAttribute("type", "button")
    const entryIcon = document.createElement("i")
    if (entry.type === "folder") {
      entryIcon.setAttribute("class", "fas fa-folder")
    } else if (entry.type === "file") {
      if (utils.isValidImage(entry.name)) {
        entryIcon.setAttribute("class", "fas fa-file-image")
      } else {
        entryIcon.setAttribute("class", "fas fa-file")
      }
      if (entry.id === hashParams.image) {
        entryBtnDiv.classList.add("selectedImage")
      }
    }
    entryIcon.innerHTML = "&nbsp&nbsp"
    entryBtn.appendChild(entryIcon)
    entryBtn.innerHTML += entry.name
    // const loaderImage = document.createElement("img")
    // loaderImage.setAttribute("src", `${window.location.origin}${window.location.pathname}/images/loader_sm.gif`)
    // loaderImage.setAttribute("class", "boxFileMgr_loader")
    // entryBtnSubfolders.appendChild(loaderImage)
    // entryBtnSubfolders.style.display = "none"
    // entryBtnDiv.appendChild(entryBtnSubfolders)
    entryBtnDiv.appendChild(entryBtn)
    entryBtnDiv.appendChild(document.createElement("hr"))

    entryBtn.onclick = async () => {
      if (entry.type === "folder") {
        selectFolder(entry.id)
      } else if (entry.type === "file" && utils.isValidImage(entry.name)) {
        if (entry.id !== hashParams.image) {
          selectImage(entry.id)
          myBox.highlightImage(entry.id)
        }
      }
    }
    // const folderTree = document.createElement("div")
    // folderTree.setAttribute("class", `boxFileMgr_folderTree_${id}`)
    currentFolderDiv.appendChild(entryBtnDiv)
  })
  // currentFolderDiv.appendChild(folderTree)
  return currentFolderDiv
}

myBox.highlightImage = (id) => {
  const previouslySelectedImage = document.getElementById("boxFileManager").querySelector("div.selectedImage")
  const newlySelectedImage = document.getElementById(`boxFileMgr_subFolder_${id}`)
  if (previouslySelectedImage) {
    previouslySelectedImage.classList.remove("selectedImage")
  }
  if (newlySelectedImage) {
    newlySelectedImage.classList.add("selectedImage")
  }

}