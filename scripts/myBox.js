const myBox = {}

myBox.loadFileManager = async (id = boxRootFolderId, forceRedraw) => {
  const boxFileMgrHeaderDiv = document.getElementById("boxFileMgrHeader")

  if (boxFileMgrHeaderDiv.parentElement.getAttribute("folderId") === hashParams.folder ) {
    return
  }

  const [ fileMgrTools, fileMgrNav, fileMgrOptions, ..._ ] = boxFileMgrHeaderDiv.children
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

      const backButton = `
        <button type="button" class="btn" style="background-color: rgba(255, 255, 255); border: 1px solid lightgray;">
          <i style="font-size:25px; color:royalblue;" class="fas fa-caret-left"></i>
        </button>
      `
      backBtnSpan.innerHTML = backButton
      fileMgrTools.appendChild(backBtnSpan)
    }

    backBtnSpan.onclick = id === boxRootFolderId ? () => {} : (e) => {
      path.selectFolder(folderData.path_collection.entries[folderData.path_collection.entries.length - 1].id)
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
      path.selectFolder(boxRootFolderId)
    }

    fileMgrNav.setAttribute("id", "boxFileMgrNav")
    fileMgrNav.style.width = "100%"
    fileMgrNav.style.margin = "auto 0"
    fileMgrNav.style.textAlign = "center"

    folderData.name = folderData.name.length > 25 ? folderData.name.slice(0,22).trim() + "..." : folderData.name.trim()

    fileMgrNav.innerHTML =
      `<strong style="font-size: 18px;">
        <a href="${box.appBasePath}/${folderData.type}/${folderData.id}" target="_blank">
          ${folderData.name}
        </a>
      </strong>`

    
    let optionsToggleDiv = document.getElementById("fileMgrSort")
    if (!optionsToggleDiv) {
      optionsToggleDiv = document.createElement("div")
      optionsToggleDiv.setAttribute("id", "fileMgrSort")
      optionsToggleDiv.setAttribute("class", "boxFileMgrHeaderBtn")

      const optionsToggle = `
        <button type="button" class="btn btn-link" id="fileMgrOptionsToggle" disabled data-toggle="collapse" data-target="#boxFileMgrOptionsCollapse">
          Options <i class="fas fa-caret-down"></i>
        </button>
      `
      const optionsCollapseDiv = document.getElementById("boxFileMgrOptionsCollapse")
      
      optionsCollapseDiv.innerHTML = `
        <div id="fileMgrOptionsContent">
          <div class="dropdown fileMgrOptions" id="fileMgrSortOption">
            <button type="button" class="btn btn-light dropdown-toggle" id="fileMgrSortOptionToggle" data-toggle="dropdown" style="color: royalblue;">
              Sort 
            </button>
            <div class="dropdown-menu" id="fileMgrSortValues">
              <button class="btn btn-sm btn-outline-primary active" value="name" onclick="myBox.setFileSortingPreference('name')"><span class="fileMgrOption">By Name <i class="fas fa-sort-alpha-down"></i></span></button>
              <button class="btn btn-sm btn-outline-primary" value="random" onclick="myBox.setFileSortingPreference('random')"><span class="fileMgrOption">Randomly <i class="fas fa-random"></i></span></button>
            </div>
          </div>
          <div class="fileMgrOptions">
            <div>
              <label for="fileMgrHideFilenameCheckbox" style="color:royalblue; margin-bottom:0;">Hide Filenames&nbsp;&nbsp;</label>
              <input type="checkbox" id="fileMgrHideFilenameCheckbox" class="form-group" style="margin-bottom:0;" onchange="myBox.hideFilenames(this)"></input>
            </div>
          </div>
        </div>
      `
      optionsToggleDiv.innerHTML = optionsToggle
      fileMgrOptions.appendChild(optionsToggleDiv)
      new BSN.Collapse(document.getElementById("fileMgrOptionsToggle"))
      new BSN.Dropdown(document.getElementById("fileMgrSortOption"))

      if (hashParams.sort) {
        const sortButtonToActivate = document.getElementById("fileMgrSortValues").querySelector(`button[value=${hashParams.sort}]`)
        const sortButtonAlreadyActive = document.getElementById("fileMgrSortValues").querySelector(`button.active`)
        if (sortButtonToActivate && sortButtonAlreadyActive) {
          sortButtonAlreadyActive.classList.remove("active")
          sortButtonToActivate.classList.add("active")
        }
      }

      if (hashParams.hideFilenames) {
        document.getElementById("fileMgrHideFilenameCheckbox").checked = true
      }

    }

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
    path.selectFolder(boxRootFolderId)
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
    let {
      item_collection: {
        entries,
        limit,
        total_count
      }
    } = folderData

    const parentElement = document.getElementById("boxFolderTree")
    if (entries.length !== 0) {
      // const loaderElementId = "fileMgrLoaderDiv"
      // if (parentElement.childElementCount > 0) {
      //   showLoader(loaderElementId, parentElement)
      // }

      const sortingPreference = document.getElementById("fileMgrSortValues").querySelector("button.active").getAttribute("value")
      const hideFilenamesSelected = document.getElementById("fileMgrHideFilenameCheckbox").checked
      if (sortingPreference === "random") {
        entries.sort(()=> 0.5-Math.random())
      }
      if (hideFilenamesSelected) {
        entries = entries.map(entry => {
          if (entry.type === "file") {
            entry.name = entry.id
          }
          return entry
        })
      }

      parentElement.firstChild && parentElement.removeChild(parentElement.firstChild) // Removes Empty Directory element if present. 
      const currentFolderDiv = document.createElement("div")
      currentFolderDiv.setAttribute("class", `boxFileMgr_folderTree`)
      currentFolderDiv.setAttribute("id", `boxFileMgr_folderTree_${id}`)
      const moreFiles = limit < total_count
      const folderSubDiv = myBox.populateFolderTree(entries, currentFolderDiv, moreFiles)
      // hideLoader(loaderElementId)

      // parentElement.style.height = window.innerHeight - parentElement.getBoundingClientRect().y - 40 // 40 seems to be the initial width of the canvas

      parentElement.appendChild(folderSubDiv)
      if (path.userConfig && path.userConfig.lastUsedDataset && path.userConfig.lastUsedDataset !== -1) {
        myBox.highlightSelectedDatasetFolder(path.userConfig.lastUsedDataset)  
      }
      // To Enable Dropdown for folders
      const folderOptionsTogglers = document.querySelectorAll(".dropdown.boxFolderOptionsDiv")
      folderOptionsTogglers.forEach(folderOptionDiv => new BSN.Dropdown(folderOptionDiv) )

    } else if (entries.length === 0) {
      parentElement.style.textAlign = "center"
      parentElement.style.color = "gray"
      parentElement.innerHTML = `<span><br/><i style="font-size:1.1rem">-- Empty Folder --</i></span>`
      // parentElement.innerText = `-- Empty Folder --`
    }
  }
}

myBox.populateFolderTree = (entries, currentFolderDiv, moreFiles=false) => {
  const addMoreFilesToFolderTree = () => {
    console.log(currentFolderDiv.querySelectorAll("div.boxFileMgr_subFolder"))
  }

  const addFileElementToFolderTree = (entry, currentFolderDiv) => {
    // Do not show _epibox and _app folders
    if (entry.name !== `_${EPIBOX}` && entry.name !== `_${APPNAME}`) {
      const entryBtnDiv = document.createElement("div")
      entryBtnDiv.setAttribute("id", `boxFileMgr_subFolder_${entry.id}`)
      entryBtnDiv.setAttribute("class", `boxFileMgr_subFolder`)
      const entryBtn = document.createElement("button")
      entryBtn.setAttribute("class", "btn btn-link")
      entryBtn.setAttribute("entryId", entry.id)
      entryBtn.setAttribute("type", "button")
      let entryIcon = ""
      if (entry.type === "folder") {
        entryIcon = `<i class="fas fa-folder">&nbsp&nbsp</i>`
      } else if (entry.type === "file") {
        if (utils.isValidImage(entry.name)) {
          entryIcon = `<i class="fas fa-file-image">&nbsp&nbsp</i>`
        } else {
          entryIcon = `<i class="fas fa-file">&nbsp&nbsp</i>`
        }
        if (entry.id === hashParams.image) {
          entryBtnDiv.classList.add("selectedImage")
        }
      }
      entryBtn.innerHTML = `${entryIcon}${entry.name}`
      // const loaderImage = document.createElement("img")
      // loaderImage.setAttribute("src", `${window.location.origin}${window.location.pathname}/images/loader_sm.gif`)
      // loaderImage.setAttribute("class", "boxFileMgr_loader")
      // entryBtnSubfolders.appendChild(loaderImage)
      // entryBtnSubfolders.style.display = "none"
      // entryBtnDiv.appendChild(entryBtnSubfolders)
      entryBtnDiv.appendChild(entryBtn)
      if (entry.type === "folder") {
        const entryBtnOptionsDiv = document.createElement("div")
        entryBtnOptionsDiv.setAttribute("class", "boxFolderOptionsDiv")
        entryBtnOptionsDiv.setAttribute("id", `${entry.id}_folderOptions`)
        
        entryBtnOptionsDiv.classList.add("dropdown")
        entryBtnOptionsDiv.innerHTML = `<button class="btn btn-light dropdown-toggle boxFolderOptionsToggle" role="button" id="${entry.id}_folderOptionsToggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
          <i class="fas fa-ellipsis-v"></i>
        </button>
        `
        const entryBtnDropdownDiv = document.createElement("div")
        entryBtnDropdownDiv.setAttribute("class", "dropdown-menu dropdown-menu-right boxFolderOptionsDropdown")
        const entryBtnDropdownOptionsDiv = document.createElement("div")
        entryBtnDropdownOptionsDiv.setAttribute("class", "boxFolderOptions")
          
        const entryBtnDropdownToggleBtn = document.createElement("button")
        entryBtnDropdownToggleBtn.setAttribute("class", "btn btn-light boxFolderOption")
        entryBtnDropdownToggleBtn.setAttribute("id", `${entry.id}_selectDataset`)
        entryBtnDropdownToggleBtn.onclick = () => {
          entryBtnOptionsDiv.innerHTML = `<img src="https://episphere.github.io/path/external/images/loader_folder.gif" style="width:2rem;"></img>`
          path.selectDataset(entry.id)
          path.selectFolder(entry.id)
        }
        entryBtnDropdownToggleBtn.innerHTML = ` <i class="fas fa-pencil-alt"></i> &nbsp;Use as Dataset`
        
        entryBtnDropdownOptionsDiv.appendChild(entryBtnDropdownToggleBtn)
        entryBtnDropdownDiv.appendChild(entryBtnDropdownOptionsDiv)
        entryBtnOptionsDiv.appendChild(entryBtnDropdownDiv)
          
        entryBtnDiv.appendChild(entryBtnOptionsDiv)
      }
      
      entryBtn.onclick = async () => {
        if (entry.type === "folder") {
          path.selectFolder(entry.id)
        } else if (entry.type === "file" && utils.isValidImage(entry.name)) {
          if (entry.id !== hashParams.image) {
            path.selectImage(entry.id)
          }
        }
      }
      // const folderTree = document.createElement("div")
      // folderTree.setAttribute("class", `boxFileMgr_folderTree_${id}`)
      currentFolderDiv.appendChild(entryBtnDiv)
      currentFolderDiv.appendChild(document.createElement("hr"))
    }
  }

  entries.forEach(entry => addFileElementToFolderTree(entry, currentFolderDiv))

  if (moreFiles) {
    const moreFilesBtnDiv = document.createElement("div")
    moreFilesBtnDiv.setAttribute("class", "boxMoreFilesDiv")
    moreFilesBtnDiv.setAttribute("id", `moreFilesDiv`)
    const moreFilesBtn = document.createElement("button")
    moreFilesBtn.setAttribute("class", "btn btn-outline-info")
    moreFilesBtn.setAttribute("id", "moreFilesBtn")
    moreFilesBtn.setAttribute("type", "button")
    moreFilesBtn.innerText = "+ More Files"
    moreFilesBtn.onclick = () => addMoreFilesToFolderTree(currentFolderDiv)
    moreFilesBtnDiv.appendChild(moreFilesBtn)
    currentFolderDiv.appendChild(moreFilesBtnDiv)
  }
  // currentFolderDiv.appendChild(folderTree)
  return currentFolderDiv
}

myBox.highlightSelectedDatasetFolder = (id) => {
  const entryBtnOptionsDiv = document.getElementById(`${id}_folderOptions`)
  if (entryBtnOptionsDiv) {
    entryBtnOptionsDiv.classList.remove("dropdown")
    entryBtnOptionsDiv.innerHTML = `<i class="far fa-check-circle"></i>`
  }
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

myBox.hideFilenames = (target) =>{
  const boxFolderTreeElement = document.getElementById("boxFolderTree").children[0]
  if (target.checked) {
    
  }
  // if 
}

myBox.setFileSortingPreference = async (preference) => {
  if (preference !== hashParams.sortBy) {
    const sortOptionSelected = document.getElementById("fileMgrSortValues").querySelector(`button[value=${preference}]`)
    if (sortOptionSelected) {
      switch(preference) {
        case 'random':

      }
    }
  }
}

myBox.showLoginMessage = () => {
  const boxFolderTree = document.getElementById("boxFolderTree")
  boxFolderTree.innerHTML = `
  <span id="loginToBoxMessage" style="margin: 2rem auto; color: gray; font-size: 18px;">
    <i style="text-align: center;">-- Please <a href="#" onclick="document.getElementById('boxLoginBtn').click(); return false;">Login to Box</a> first! --</i>
  </span>
  `
}