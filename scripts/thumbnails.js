var currentThumbnailsList = []
const DEFAULT_THUMBNAILS_LIST_LENGTH = 20

const thumbnails = async () => {
  window.localStorage.currentThumbnailsOffset = window.localStorage.currentThumbnailsOffset || "0"
}

thumbnails.showThumbnailPicker = async (offset = 0, limit=DEFAULT_THUMBNAILS_LIST_LENGTH) => {
  const thumbnailPicker = document.getElementById("thumbnailPicker")
  thumbnailPicker.style.display = "flex"
  thumbnailPicker.style["flex-direction"] = "column"
  thumbnailPicker.style.height = window.innerHeight - thumbnailPicker.getBoundingClientRect().y - 40

  if (thumbnailPicker.childElementCount === 0 || thumbnailPicker.getAttribute("folder") !== window.localStorage.currentThumbnailsFolder || window.localStorage.currentThumbnailsOffset !== offset) {
    thumbnailPicker.setAttribute("folder", window.localStorage.currentThumbnailsFolder)
    window.localStorage.currentThumbnailsOffset = offset

    const {
      currentThumbnailsFolder
    } = window.localStorage
    var {
      total_count,
      entries: thumbnailImages
    } = await box.getFolderContents(currentThumbnailsFolder, limit, offset)
    
    currentThumbnailsList = thumbnailImages.map(thumbnailImage => thumbnailImage.id)
    if (thumbnailImages) {
      thumbnails.addThumbnails(thumbnailPicker, thumbnailImages)
      thumbnails.addThumbnailPageSelector(thumbnailPicker, total_count, limit, offset)
    }
  }
  let allFilesInFolder = JSON.parse(window.localStorage.allFilesInFolder)
  if (allFilesInFolder[window.localStorage.currentThumbnailsFolder] && allFilesInFolder[window.localStorage.currentThumbnailsFolder].length < total_count) {
    const populateAllFilesInFolder = async (prevEntries = [], offset = 0) => {
      const folderContents = await box.getFolderContents(window.localStorage.currentThumbnailsFolder, total_count, offset)
      const entries = prevEntries.concat(folderContents.entries)
      if (entries.length < total_count) {
        return populateAllFilesInFolder(entries, entries.length)
      }
      const onlyImages = []
      entries.forEach(entry => {
        if (entry.type === "file" && utils.isValidImage(entry.name)) {
          onlyImages.push(entry.id)
        }
      })
      const allFilesInFolderObj = allFilesInFolder
      allFilesInFolderObj[window.localStorage.currentThumbnailsFolder] = onlyImages
      window.localStorage.allFilesInFolder = JSON.stringify(allFilesInFolderObj)
    }
    // populateAllFilesInFolder([], 0)
  }
}

thumbnails.addThumbnails = (thumbnailPicker, thumbnailImages) => {
  let thumbnailsListDiv = document.getElementById("thumbnailsList")

  if (thumbnailsListDiv) {
    thumbnailPicker.removeChild(thumbnailsListDiv)
    while (thumbnailsListDiv.firstElementChild) {
      thumbnailsListDiv.removeChild(thumbnailsListDiv.firstElementChild)
    }
  } else {
    thumbnailsListDiv = document.createElement("div")
    thumbnailsListDiv.setAttribute("id", "thumbnailsList")
  }
  thumbnailsListDiv.scrollTop = 0

  thumbnailImages.forEach((thumbnailImage) => {
    if (thumbnailImage.type === "file" && utils.isValidImage(thumbnailImage.name)) {
      const {
        id: thumbnailId,
        name
      } = thumbnailImage
      const thumbnailDiv = document.createElement("div")
      thumbnailDiv.setAttribute("class", "thumbnailDiv")
      const thumbnailImg = document.createElement("img")
      thumbnailImg.setAttribute("id", `thumbnail_${thumbnailId}`)
      thumbnailImg.setAttribute("class", "imagePickerThumbnail")
      if (thumbnailId === hashParams.image) {
        thumbnailImg.classList.add("selectedThumbnail")
      }
      thumbnailImg.setAttribute("loading", "lazy")

      thumbnailDiv.appendChild(thumbnailImg)
      const thumbnailNameText = document.createElement("span")
      thumbnailNameText.setAttribute("class", "imagePickerThumbnailText")
      const thumbnailNameWithoutExtension = name.trim().split(".")
      thumbnailNameWithoutExtension.pop()
      const thumbnailName = thumbnailNameWithoutExtension.join("")
      thumbnailDiv.appendChild(thumbnailNameText)
      thumbnailsListDiv.appendChild(thumbnailDiv)
      thumbnailDiv.onclick = () => selectImage(thumbnailId)

      box.getThumbnail(thumbnailId).then(res => {
        thumbnailImg.setAttribute("src", res)
        thumbnailNameText.innerText = thumbnailName
        thumbnailNameText.style.width = thumbnailImg.getBoundingClientRect().width
        thumbnailNameText.style["text-overflow"] = "ellipsis"
        thumbnailNameText.style["white-space"] = "nowrap"
        thumbnailNameText.style["overflow"] = "hidden"
      })
      thumbnails.getAnnotationsForBorder(thumbnailId)
    }
  })

  thumbnailPicker.insertBefore(thumbnailsListDiv, thumbnailPicker.firstElementChild)
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

    thumbnailPrevPageBtn.onclick = (e) => {
      thumbnailCurrentPageText.stepDown()
      thumbnailCurrentPageText.dispatchEvent(new Event("change"))
    }
    thumbnailNextPageBtn.onclick = (e) => {
      thumbnailCurrentPageText.stepUp()
      thumbnailCurrentPageText.dispatchEvent(new Event("change"))
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

thumbnails.getNumCompletedAnnotations = (metadata) => {
  const numAnnotationsCompleted = path.appConfig.annotations.reduce((total, {
    annotationName
  }) => {
    if (metadata[`${annotationName}_annotations`] && window.localStorage.userId in JSON.parse(metadata[`${annotationName}_annotations`])) {
      total += 1
    }
    return total
  }, 0)
  return numAnnotationsCompleted
}

thumbnails.borderByAnnotations = (thumbnailId, metadata = JSON.parse(window.localStorage.fileMetadata)) => {
  const numAnnotationsCompleted = thumbnails.getNumCompletedAnnotations(metadata)
  const thumbnailImg = document.getElementById(`thumbnail_${thumbnailId}`)
  if (numAnnotationsCompleted === path.appConfig.annotations.length) {
    thumbnailImg.classList.add("annotationsCompletedThumbnail")
  } else if (numAnnotationsCompleted > 0) {
    thumbnailImg.classList.add("annotationsPartlyCompletedThumbnail")
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
  if (pageNum === 1) {
    thumbnailPrevPageBtn.setAttribute("disabled", "true")
    thumbnailNextPageBtn.removeAttribute("disabled")
  } else if (pageNum === totalPages) {
    thumbnailNextPageBtn.setAttribute("disabled", "true")
    thumbnailPrevPageBtn.removeAttribute("disabled")
  } else {
    thumbnailPrevPageBtn.removeAttribute("disabled")
    thumbnailNextPageBtn.removeAttribute("disabled")
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