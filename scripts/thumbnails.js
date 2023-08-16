const DEFAULT_THUMBNAILS_LIST_LENGTH = 20

const thumbnails = async () => {
  window.localStorage.currentThumbnailsOffset = window.localStorage.currentThumbnailsOffset || "0"
}

thumbnails.showThumbnailPicker = async (offset="0", limit=DEFAULT_THUMBNAILS_LIST_LENGTH, forceReload=false) => {
  const {
    currentThumbnailsFolder
  } = window.localStorage
  const thumbnailPicker = document.getElementById("thumbnailPicker")
  // thumbnailPicker.style.height = window.innerHeight - thumbnailPicker.parentElement.getBoundingClientRect().top - 80
  // thumbnailPicker.style.maxHeight = window.innerHeight - thumbnailPicker.parentElement.getBoundingClientRect().top - 80
  if (forceReload || (currentThumbnailsFolder && (thumbnailPicker.childElementCount === 0 || thumbnailPicker.getAttribute("folder") !== currentThumbnailsFolder || window.localStorage.currentThumbnailsOffset !== offset))) {
    if (thumbnails.areLoading) {
      // Defer repeated calls to load thumbnails by 10 seconds each time.
      setTimeout(() => thumbnails.showThumbnailPicker(offset, limit, forceReload), 10000)
      return
    }

    thumbnailPicker.setAttribute("folder", window.localStorage.currentThumbnailsFolder)
    window.localStorage.currentThumbnailsOffset = offset
    
    thumbnails.areLoading = true // Mutex to avoid reloading thumbnails while first call has already gone out.
    var {
      total_count,
      entries: thumbnailImages
    } = await box.getFolderContents(currentThumbnailsFolder, limit, offset, ["metadata.global.properties"])
    thumbnails.areLoading = false
    
    if (thumbnailImages.length === 0 && total_count !== 0) {
      return thumbnails.showThumbnailPicker(0, DEFAULT_THUMBNAILS_LIST_LENGTH)
    }

    if (thumbnailImages) {
      thumbnails.addThumbnails(thumbnailPicker, thumbnailImages)
      thumbnails.addThumbnailPageSelector(thumbnailPicker, total_count, limit, offset)
    }
  }

  // let allFilesInFolder = JSON.parse(window.localStorage.allFilesInFolder)
  // if (allFilesInFolder[window.localStorage.currentThumbnailsFolder] && allFilesInFolder[window.localStorage.currentThumbnailsFolder].length < total_count) {
  //   const populateAllFilesInFolder = async (prevEntries = [], offset = 0) => {
  //     const folderContents = await box.getFolderContents(window.localStorage.currentThumbnailsFolder, total_count, offset)
  //     const entries = prevEntries.concat(folderContents.entries)
  //     if (entries.length < total_count) {
  //       return populateAllFilesInFolder(entries, entries.length)
  //     }
  //     const onlyImages = []
  //     entries.forEach(entry => {
  //       if (entry.type === "file" && utils.isValidImage(entry.name)) {
  //         onlyImages.push(entry.id)
  //       }
  //     })
  //     const allFilesInFolderObj = allFilesInFolder
  //     allFilesInFolderObj[window.localStorage.currentThumbnailsFolder] = onlyImages
  //     window.localStorage.allFilesInFolder = JSON.stringify(allFilesInFolderObj)
  //   }
    // populateAllFilesInFolder([], 0)
  // }
  thumbnails.highlightThumbnail(hashParams.image)
}

thumbnails.addThumbnails = (thumbnailPicker, thumbnailImages) => {
  let thumbnailsListDiv = document.getElementById("thumbnailsList")

  if (thumbnailsListDiv) {
    const alreadyRenderedThumbnails = thumbnailsListDiv.querySelectorAll("img.imagePickerThumbnail")
    const thumbnailIDsToRender = thumbnailImages.map(entry => entry.id)
    let areThumbnailsAlreadyLoaded = true
    alreadyRenderedThumbnails.forEach(thumbnailElement => {
      if (thumbnailIDsToRender.indexOf(thumbnailElement.getAttribute("entry_id")) === -1) {
        areThumbnailsAlreadyLoaded = false
      }
    })
    if (areThumbnailsAlreadyLoaded) {
      return
    }
    thumbnailPicker.removeChild(thumbnailsListDiv)
    while (thumbnailsListDiv.firstElementChild) {
      thumbnailsListDiv.removeChild(thumbnailsListDiv.firstElementChild)
    }
  } else {
    thumbnailsListDiv = document.createElement("div")
    thumbnailsListDiv.setAttribute("id", "thumbnailsList")
  }
  thumbnailsListDiv.scrollTop = 0
  thumbnailPicker.insertBefore(thumbnailsListDiv, thumbnailPicker.firstElementChild)

  thumbnailImages.forEach((thumbnailImage) => {
    if (thumbnailImage.type === "file" && utils.isValidImage(thumbnailImage.name)) {
      const {
        id,
        name,
        metadata
      } = thumbnailImage
      const thumbnailDiv = document.createElement("div")
      thumbnailDiv.setAttribute("class", "thumbnailDiv")
      const thumbnailImg = document.createElement("img")
      thumbnailImg.setAttribute("id", `thumbnail_${id}`)
      thumbnailImg.setAttribute("entry_id", id)
      thumbnailImg.setAttribute("class", "imagePickerThumbnail")
      // thumbnailImg.setAttribute("loading", "lazy")

      thumbnailDiv.appendChild(thumbnailImg)
      const thumbnailNameText = document.createElement("span")
      thumbnailNameText.setAttribute("class", "imagePickerThumbnailText")
      const thumbnailNameWithoutExtension = name.trim().split(".")
      thumbnailNameWithoutExtension.pop()
      const thumbnailName = thumbnailNameWithoutExtension.join("")
      thumbnailNameText.innerText = thumbnailName
      // thumbnailNameText.style.width = thumbnailImg.getBoundingClientRect().width
      // thumbnailNameText.style["text-overflow"] = "ellipsis"
      // thumbnailNameText.style["white-space"] = "nowrap"
      // thumbnailNameText.style["overflow"] = "hidden"
      
      thumbnailDiv.appendChild(thumbnailNameText)
      thumbnailsListDiv.appendChild(thumbnailDiv)
      thumbnailDiv.onmouseup = (e) => {
        if (e.button === 0) {
          path.selectImage(id)
        }
      }
      
      const thumbnailMetadata = metadata?.global?.properties
      thumbnails.loadThumbnail(id, name, thumbnailImg, thumbnailMetadata).then(() => {
        if (!utils.isWSI(name)) {
          thumbnails.borderByAnnotations(id, thumbnailMetadata)
        }
      })
      // thumbnails.getAnnotationsForBorder(thumbnailId)
    }
  })

  document.dispatchEvent(new Event("thumbnailsLoaded"))

}

thumbnails.loadThumbnail = async (id, name, thumbnailImgElement, thumbnailMetadata={}, forceCreateNew=false) => {
  if (!forceCreateNew && thumbnailMetadata && thumbnailMetadata.wsiThumbnail && utils.isWSI(name)) {
    
    const { thumbnailImageId: wsiThumbnailId } = JSON.parse(thumbnailMetadata.wsiThumbnail)
    box.getFileContent(wsiThumbnailId, false, true).then(thumbnailURL => {
      thumbnailImgElement.setAttribute("src", thumbnailURL)
    }).catch(e => {
      console.log(e)
      if (e.message === "404") {
        thumbnails.loadThumbnail(id, name, thumbnailImgElement, thumbnailMetadata, true)
      }
    })
  
  } else {
    if (!forceCreateNew && document.getElementById(`thumbnail_${id}`).src.length > 0) {
      return
    }
    box.getThumbnail(id).then(res => {
      thumbnailImgElement.setAttribute("src", res)
    }).catch(err => {
      if(utils.isWSI(name)){
        const handleWSIThumbnailGeneration = () => {
          if (path.datasetConfig) {
            let op = "wsiThumbnail"
            path.miscProcessingWorker.postMessage({
              op,
              'data': {
                'imageId': id,
                'name': name,
                'wsiThumbnailsFolderId': path.datasetConfig.wsiThumbnailsFolderId
              }
            })
            
            const consumeGeneratedThumbnail =  (evt) => {
              if (evt.data.op === op && evt.data.data.imageId === id) {
                const { data: { thumbnailURL, thumbnailSavedToBox }} = evt.data
                thumbnailImgElement.setAttribute("src", thumbnailURL)
                path.miscProcessingWorker.removeEventListener('message', consumeGeneratedThumbnail)
                if (!thumbnailSavedToBox) {
                  setTimeout(() => retrySaveThumbnailToBox(thumbnailURL, name), 2*1000)
                }
              }
            }
  
            const retrySaveThumbnailToBox = async (thumbnailURL, thumbnailName) => {
              if (path.datasetConfig && (!path.datasetConfig.wsiThumbnailsFolderId || path.datasetConfig.wsiThumbnailsFolderId === -1)) {
                const wsiThumbnailsFolderEntry = await box.createFolder("wsiThumbnails", path.datasetConfig.datasetConfigFolderId)
                const objectToAdd = {
                  wsiThumbnailsFolderId: wsiThumbnailsFolderEntry.id
                }
                await box.addToDatasetConfig(objectToAdd)
              }
  
              path.miscProcessingWorker.postMessage({
                'op': "retrySaveThumbnail",
                'data': {
                  'imageId': id,
                  'imageURL': thumbnailURL,
                  'name': thumbnailName,
                  'wsiThumbnailsFolderId': path.datasetConfig.wsiThumbnailsFolderId
                }
              })
            }
  
            path.miscProcessingWorker.addEventListener('message', consumeGeneratedThumbnail)
          } else {
            document.addEventListener("datasetConfigSet", handleWSIThumbnailGeneration, {
              once: true
            })
          }
        }
        handleWSIThumbnailGeneration()
      } else {
        console.log(`Problem loading thumbnail for file ${id}`, err)
      }
    })

  }
}

thumbnails.addThumbnailPageSelector = (thumbnailPicker, totalCount, limit, offset) => {
  const currentPageNum = Math.floor(offset / limit) + 1
  const totalPages = Math.floor(totalCount / limit) + 1
  const thumbnailPageSelector = document.getElementById("thumbnailPageSelector")
  if (!thumbnailPageSelector) {
    const thumbnailPageNumSpan = document.createElement("span")
    thumbnailPageNumSpan.setAttribute("id", "thumbnailPageSelector")

    const thumbnailPrevPageBtn = document.createElement("button")
    thumbnailPrevPageBtn.setAttribute("class", "btn btn-sm btn-light")

    const prevBtnText = document.createTextNode("<")
    thumbnailPrevPageBtn.style["font-size"] = "9px"
    thumbnailPrevPageBtn.style["margin-right"] = "0.18rem"
    thumbnailPrevPageBtn.style["padding"] = "0.2rem 0.3rem 0.2rem 0.3rem"
    thumbnailPrevPageBtn.appendChild(prevBtnText)

    const thumbnailCurrentPageText = document.createElement("input")
    thumbnailCurrentPageText.setAttribute("id", "thumbnailPageSelector_currentPage")
    thumbnailCurrentPageText.setAttribute("type", "number")
    thumbnailCurrentPageText.setAttribute("min", "1")
    thumbnailCurrentPageText.setAttribute("max", totalPages)
    thumbnailCurrentPageText.setAttribute("value", currentPageNum)
    thumbnailCurrentPageText.style.width = "30px";

    const outOfTotalPagesText = document.createElement("span")
    outOfTotalPagesText.setAttribute("id", "thumbnailPageSelector_totalPages")
    outOfTotalPagesText.innerText = ` / ${totalPages}`

    const thumbnailNextPageBtn = document.createElement("button")
    thumbnailNextPageBtn.setAttribute("class", "btn btn-sm btn-light")

    const nextBtnText = document.createTextNode(">")
    thumbnailNextPageBtn.style["font-size"] = "9px"
    thumbnailNextPageBtn.style["margin-left"] = "0.18rem"
    thumbnailNextPageBtn.style["padding"] = "0.2rem 0.3rem 0.2rem 0.3rem"
    thumbnailNextPageBtn.appendChild(nextBtnText)

    thumbnailPrevPageBtn.onmouseup = (e) => {
      if (e.button === 0) {
        thumbnailCurrentPageText.stepDown()
        thumbnailCurrentPageText.dispatchEvent(new Event("change"))
      }
    }
    thumbnailNextPageBtn.onmouseup = (e) => {
      if (e.button === 0) {
        thumbnailCurrentPageText.stepUp()
        thumbnailCurrentPageText.dispatchEvent(new Event("change"))
      }
    }

    thumbnailCurrentPageText.onchange = ({
      target: {
        value
      }
    }) => {
      value = parseInt(value)
      changeThumbnails(value)
    }

    thumbnailPageNumSpan.appendChild(thumbnailPrevPageBtn)
    thumbnailPageNumSpan.appendChild(thumbnailCurrentPageText)
    thumbnailPageNumSpan.appendChild(outOfTotalPagesText)
    thumbnailPageNumSpan.appendChild(thumbnailNextPageBtn)

    thumbnailPicker.appendChild(thumbnailPageNumSpan)

    thumbnails.checkAndDisableButtons(currentPageNum, totalPages)

  } else {
    const thumbnailCurrentPageText = document.getElementById("thumbnailPageSelector_currentPage")
    thumbnailCurrentPageText.setAttribute("max", totalPages)
    const outOfTotalPagesText = document.getElementById("thumbnailPageSelector_totalPages")
    thumbnailCurrentPageText.value = currentPageNum
    outOfTotalPagesText.innerText = ` / ${totalPages}`
    thumbnails.checkAndDisableButtons(currentPageNum, totalPages)
  }
  const changeThumbnails = (value) => {
    if (1 <= value && value <= totalPages) {
      thumbnails.checkAndDisableButtons(value, totalPages)
      thumbnails.showThumbnailPicker((value - 1) * DEFAULT_THUMBNAILS_LIST_LENGTH, DEFAULT_THUMBNAILS_LIST_LENGTH)
    }
  }
}

thumbnails.getAnnotationsForBorder = (thumbnailId) => {
  box.getData(thumbnailId, "file").then(resp => {
    if (resp && resp.metadata && resp.metadata.global && resp.metadata.global.properties) {
      metadata = resp.metadata.global.properties
      thumbnails.borderByAnnotations(thumbnailId, metadata)
    }
  })
}

thumbnails.borderByAnnotations = (thumbnailId, metadata = JSON.parse(window.localStorage.fileMetadata)) => {
  const numAnnotationsCompleted = annotations.getNumCompletedAnnotations(metadata)
  const thumbnailImg = document.getElementById(`thumbnail_${thumbnailId}`)
  if (thumbnailImg) {
    
    if (numAnnotationsCompleted === 0) {
      thumbnailImg.classList.remove("annotationsCompletedThumbnail")
      thumbnailImg.classList.remove("annotationsPartlyCompletedThumbnail")
    } else if (path.datasetConfig && path.datasetConfig.annotations && numAnnotationsCompleted === path.datasetConfig.annotations.length) {
      thumbnailImg.classList.add("annotationsCompletedThumbnail")
    } else if (numAnnotationsCompleted > 0) {
      thumbnailImg.classList.add("annotationsPartlyCompletedThumbnail")
    }

  }
}

thumbnails.isThumbnailsFirstPage = () => {
  // For use when changing thumbnails list from elsewhere, for instance showNextImageButton().
  const [thumbnailPrevPageBtn, _] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  return thumbnailPrevPageBtn.getAttribute("disabled") === "true"
}

thumbnails.isThumbnailsLastPage = () => {
  // For use when changing thumbnails list from elsewhere, for instance showNextImageButton().
  const [_, thumbnailNextPageBtn] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  return thumbnailNextPageBtn.getAttribute("disabled") === "true"
}

thumbnails.checkAndDisableButtons = (pageNum, totalPages) => {
  const [thumbnailPrevPageBtn, thumbnailNextPageBtn] = document.getElementById("thumbnailPageSelector").querySelectorAll("button")
  thumbnailPrevPageBtn.removeAttribute("disabled")
  thumbnailNextPageBtn.removeAttribute("disabled")

  if (pageNum === 1) {
    thumbnailPrevPageBtn.setAttribute("disabled", "true")
  }

  if (pageNum === totalPages) {
    thumbnailNextPageBtn.setAttribute("disabled", "true")
  }

}

thumbnails.highlightThumbnail = (id) => {
  const prevSelectedThumbnail = document.getElementsByClassName("selectedThumbnail")
  if (prevSelectedThumbnail.length > 0) {
    prevSelectedThumbnail[0].classList.remove("selectedThumbnail")
  }
  const thumbnailToSelect = document.getElementById(`thumbnail_${id}`)
  if (thumbnailToSelect) {
    thumbnailToSelect.classList.add("selectedThumbnail")
  }
}

thumbnails.reBorderThumbnails = () => {
  const allThumbnails = document.querySelectorAll("img.imagePickerThumbnail")
  const allThumbnailIDs = []
  allThumbnails.forEach(thumbnail => allThumbnailIDs.push(thumbnail.id.split("_")[1]))
  allThumbnailIDs.forEach(thumbnails.getAnnotationsForBorder)
}