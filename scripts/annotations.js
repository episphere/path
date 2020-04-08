const annotations = {}

annotations.createTables = async (annotation, forceRedraw = false) => {
  const {
    annotationId,
    displayName,
    annotationName,
    definition,
    enableComments
  } = annotation

  const annotationsAccordion = document.getElementById("annotationsAccordion")
  if (annotationsAccordion.childElementCount > path.appConfig.annotations.length) {

    annotationsAccordion.innerHTML = ""
  }

  let annotationCard = annotationsAccordion.querySelector(`#annotation_${annotationId}Card`)

  if (annotationCard && forceRedraw) {
    annotationCard.parentElement.removeChild(annotationCard)
    annotationCard = undefined
  }

  if (!annotationCard || annotationCard.childElementCount === 0) {
    const annotationCardDiv = document.createElement("div")
    annotationCardDiv.setAttribute("class", "card annotationsCard")
    annotationCardDiv.setAttribute("id", `annotation_${annotationId}Card`)
    annotationCardDiv.style.overflow = "visible"
    let annotationCard = `
      <div class="card-header">
        <div class="annotationWithMenuHeader">
          <div class="classWithDefinition">
            <h2 class="mb-0">
              <button class="btn btn-link classCardHeader" type="button" data-toggle="collapse"
                data-target="#${annotationName}Annotations" id="${annotationName}Toggle">
                ${displayName}
              </button>
            </h2>
    `

    if (definition) {
      annotationCard += `
            <button class="btn btn-light classDefinitionPopup" id="${annotationName}_definitionPopup" type="button" data-toggle="popover">
              <i class="fas fa-info-circle"></i>
            </button>
      `
    }

    annotationCard += `
          </div>
          <div class="btn-group dropdown classificationMenu" id="${annotationName}_classificationMenu">
            <button class="btn btn-light dropdown-toggle classificationMenuToggle" role="button" id="${annotationName}_classificationMenuToggle" data-toggle=dropdown aria-haspopup="true" aria-expanded="false">
              <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="dropdown-menu dropdown-menu-right classificationMenuDropdown">
              <div class="classificationMenuButtons">
                <button class="btn btn-light classificationMenuOption" role="button" id="${annotationName}_editClassification" title="Edit" onclick="editClassificationConfig(${annotationId})"  aria-haspopup="true" aria-expanded="false">
                  <i class="fas fa-pencil-alt"></i> &nbsp;Edit Config
                </button>
                <hr/>
                <button class="btn btn-light classificationMenuOption" role="button" id="${annotationName}_deleteClassification" title="Delete" onclick="deleteClassificationConfig(${annotationId})" aria-haspopup="true" aria-expanded="false">
                  <i class="fas fa-trash-alt"></i> &nbsp;Delete Class
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
  
      <div id="${annotationName}Annotations" class="collapse qualityAnnotations" data-parent="#annotationsAccordion">
        <div class="card-body annotationsCardBody" name="${displayName}">
          <table id="${annotationName}Select" class="table table-bordered qualitySelect">
            <thead>
              <tr>
                <th scope="col" style="border-right: none; padding-left: 0; padding-right: 0;">
                  <div class="text-left col">Label</div>
                </th>
                <th scope="col" style="border-left: none;">
                  <div class="text-center col">Model Score</div>
                </th>
              </tr>
            </thead>
            <tbody>
            </tbody>
          </table>
          <div id="${annotationName}_othersAnnotations" class="quality_othersAnnotations"></div>
      `
    if (enableComments) {
      annotationCard += `
          <div class="commentsToggleDiv">
            <button id="${annotationName}_commentsToggle" type="button" data-toggle="collapse" data-target="#${annotationName}_allComments" role="button" class="btn btn-link collapsed" disabled style="padding-left: 0;"></button>
          </div>
          <div class="collapse" id="${annotationName}_allComments">
            <div class="allCommentsCard card card-body" id="${annotationName}_allCommentsCard">
            </div>
          </div>
          <div id="${annotationName}_comments" class="quality_addComment form-group">
            <textarea class="form-control" id="${annotationName}_commentsTextField" rows="2" placeholder="Add your comments here..."></textarea>
            <div style="display: flex; flex-direction: row; justify-content: space-between; margin-top: 0.5rem; margin-left: 0.1rem;">
              <div style="display: flex; flex-direction: row; style="margin: auto 0;">
                <label for="${annotationName}_commentsPublic" style="margin-right: 0.5rem;">Private</label>
                <div class="custom-control custom-switch">
                  <input type="checkbox" class="custom-control-input" id="${annotationName}_commentsPublic">
                  <label class="custom-control-label" for="${annotationName}_commentsPublic">Public</label>
                </div>
              </div>
              <div>
                <button type="button" onclick=cancelEditComment("${annotationName}") id="${annotationName}_cancelEditComment" class="btn btn-link">Cancel</button>
                <button type="submit" onclick=submitAnnotationComment("${annotationName}") id="${annotationName}_submitComment" class="btn btn-info" disabled>Submit</button>
              </div>
            </div>
          </div>
        `
    }
    annotationCard += `
        </div>
      </div>
      `
    annotationCardDiv.innerHTML += annotationCard
    annotationsAccordion.appendChild(annotationCardDiv)
    new Collapse(document.getElementById(`${annotationName}Toggle`))
    new Dropdown(document.getElementById(`${annotationName}_classificationMenu`))

    if (definition) {
      new Popover(document.getElementById(`${annotationName}_definitionPopup`), {
        placement: "right",
        animation: "slidenfade",
        delay: 100,
        dismissible: false,
        trigger: "hover",
        content: definition
      })
    }

    if (enableComments) {

      const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
      new Collapse(toggleCommentsButton)
      toggleCommentsButton.addEventListener("shown.bs.collapse", (evt) => {
        toggleCommentsButton.innerHTML = "- Hide All Comments"
      })
      toggleCommentsButton.addEventListener("hidden.bs.collapse", (evt) => {
        toggleCommentsButton.innerHTML = "+ Show All Comments"
      })

      const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
      const commentsSubmitButton = document.getElementById(`${annotationName}_submitComment`)
      commentsTextField.oninput = (evt) => {
        if (commentsTextField.value.length > 0) {
          commentsSubmitButton.removeAttribute("disabled")
        } else {
          commentsSubmitButton.setAttribute("disabled", "true")
        }
      }
      commentsTextField.onkeydown = (evt) => {
        if (evt.shiftKey && evt.keyCode === 13) {
          evt.preventDefault()
          commentsSubmitButton.click()
        }
      }
    }
  }
  showQualitySelectors(annotation)
  showNextImageButton()
  populateComments(annotationName)
  annotationsAccordion.parentElement.style.display = "block"
}

const showQualitySelectors = async (annotation) => {
  const {
    annotationName,
    labels,
  } = annotation
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const fileAnnotations = fileMetadata[`${annotationName}_annotations`] && JSON.parse(fileMetadata[`${annotationName}_annotations`])
  const annotationDiv = document.getElementById(`${annotationName}Annotations`)
  const selectTable = document.getElementById(`${annotationName}Select`)
  const selectTableBody = selectTable.querySelector("tbody")

  // const qualitySelectorsDiv = document.createElement("div")
  // qualitySelectorsDiv.setAttribute("id", "qualitySelectors")
  // qualitySelectorsDiv.style.display = "flex"
  // qualitySelectorsDiv.style.flexDirection = "column"
  if (selectTableBody.childElementCount === 0) {
    labels.forEach((labelConfig) => {
      const {
        label,
        displayText,
        tooltip
      } = labelConfig
      const tableRow = document.createElement("tr")
      const tableAnnotationData = document.createElement("td")
      const annotationDiv = document.createElement("div")
      annotationDiv.setAttribute("class", "qualitySelectorDiv")

      const qualityButton = document.createElement("button")
      let qualityButtonClass = "btn btn-outline-info labelText"
      if (containsEmojiRegex.test(displayText)) {
        qualityButtonClass += " emojiText"
      } else {
        qualityButtonClass += " normalText"
      }
      qualityButton.setAttribute("class", qualityButtonClass)
      qualityButton.setAttribute("id", `${annotationName}_${label}`)
      qualityButton.setAttribute("value", label)
      qualityButton.setAttribute("onclick", `selectQuality("${annotationName}", "${label}")`)
      qualityButton.innerText = displayText
      if (tooltip) {
        qualityButton.setAttribute("title", tooltip)
        new Tooltip(qualityButton, {
          'placement': "right",
          'animation': "slideNfade",
          'delay': 100,
          'html': true
        })
      }

      annotationDiv.appendChild(qualityButton)
      tableAnnotationData.style.borderRight = "none"
      tableAnnotationData.appendChild(annotationDiv)
      tableRow.appendChild(tableAnnotationData)

      const predictionTableData = document.createElement("td")
      predictionTableData.setAttribute("id", `${annotationName}_prediction_${label}`)
      predictionTableData.setAttribute("class", `predictionScore`)
      predictionTableData.setAttribute("align", "center")
      predictionTableData.style.verticalAlign = "middle"
      predictionTableData.style.borderLeft = "none"
      predictionTableData.innerHTML = "--"
      tableRow.appendChild(predictionTableData)
      selectTableBody.appendChild(tableRow)
    })
  }
  const previousPrediction = selectTableBody.querySelector("tr.modelPrediction")
  if (previousPrediction) {
    previousPrediction.classList.remove("modelPrediction")
    const previousPredictionTD = previousPrediction.querySelector("td.predictionScore")
    previousPredictionTD.innerHTML = "--"
  }
  activateQualitySelector(annotationName, fileAnnotations)
  getOthersAnnotations(annotationName, fileAnnotations)
  loadModelPrediction(annotationName, selectTableBody)
  annotationDiv.style.borderBottom = "1px solid rgba(0,0,0,.125)"
}

const loadModelPrediction = async (annotationName, tableBodyElement) => {
  const modelQualityPrediction = await getModelPrediction(annotationName)
  if (modelQualityPrediction) {
    qualityEnum.forEach(({
      label
    }) => {
      const labelPrediction = modelQualityPrediction.find(pred => pred.displayName === label)
      const labelScore = labelPrediction ? Number.parseFloat(labelPrediction.classification.score).toPrecision(3) : "--"
      const tablePredictionData = tableBodyElement.querySelector(`td#${annotationName}_prediction_${label}`)
      tablePredictionData.innerHTML = labelScore
      if (labelScore > 0.5) {
        tablePredictionData.parentElement.classList.add("modelPrediction")
      }
    })
  }
}

const getOthersAnnotations = (annotationName, fileAnnotations) => {
  let othersAnnotationsText = ""
  const othersAnnotationsDiv = document.getElementById(`${annotationName}_othersAnnotations`)
  const annotationDisplayName = othersAnnotationsDiv.parentElement.getAttribute("name")
  if (fileAnnotations) {
    const {
      model,
      ...nonModelAnnotations
    } = fileAnnotations
    let othersAnnotations = Object.values(nonModelAnnotations).filter(annotation => annotation && annotation.userId !== window.localStorage.userId)
    if (othersAnnotations.length > 0) {
      const othersAnnotationsUsernames = othersAnnotations.map(annotation => annotation.username)
      const othersAnnotationsUsernamesText = othersAnnotationsUsernames.length === 1 ?
        othersAnnotationsUsernames[0] :
        othersAnnotationsUsernames.slice(0, othersAnnotationsUsernames.length - 1).join(", ") + " and " + othersAnnotationsUsernames[othersAnnotationsUsernames.length - 1]
      othersAnnotationsText = `-- ${othersAnnotationsUsernamesText} annotated this image for ${annotationDisplayName}.`
    }
  }

  othersAnnotationsDiv.innerHTML = othersAnnotationsText
}

const showNextImageButton = (metadata) => {
  metadata = metadata || JSON.parse(window.localStorage.fileMetadata)
  const numAnnotationsCompleted = thumbnails.getNumCompletedAnnotations(metadata)
  const nextImageMessage = document.getElementById("nextImageMessage")
  const nextImageText = `<b><span style='color:darkorchid'>${numAnnotationsCompleted}</span> / ${path.appConfig.annotations.length} Annotations Completed!</b>`
  nextImageMessage.innerHTML = nextImageText

  const nextImageButton = document.getElementById("nextImageBtn") || document.createElement("button")
  nextImageButton.setAttribute("type", "button")
  nextImageButton.setAttribute("id", "nextImageBtn")
  nextImageButton.setAttribute("class", "btn btn-link")
  nextImageButton.innerHTML = "Next Image >>"

  const allFilesInCurrentFolder = JSON.parse(window.localStorage.allFilesInFolder)[window.localStorage.currentFolder] || []

  if (allFilesInCurrentFolder.length > 0) {
    const currentImageIndex = allFilesInCurrentFolder.indexOf(hashParams.image.toString())
    if (currentImageIndex === allFilesInCurrentFolder.length - 1) {
      return
    }

    nextImageButton.onclick = async (_) => {
      if (hashParams.image === currentThumbnailsList[currentThumbnailsList.length - 1]) {
        const thumbnailCurrentPageText = document.getElementById("thumbnailPageSelector_currentPage")
        thumbnailCurrentPageText.stepUp()
        thumbnailCurrentPageText.dispatchEvent(new Event("change"))
      }
      selectImage(allFilesInCurrentFolder[currentImageIndex + 1])
    }

  } else {
    // Fallback for first load where allFilesInFolder is yet to be populated, since doing that takes a lot of time.
    const currentImageIndex = currentThumbnailsList.indexOf(hashParams.image.toString())
    if (currentImageIndex === currentThumbnailsList.length - 1 && thumbnails.isThumbnailsLastPage()) {
      return
    }

    nextImageButton.onclick = async (_) => {
      if (hashParams.image === currentThumbnailsList[currentThumbnailsList.length - 1]) {
        const thumbnailCurrentPageText = document.getElementById("thumbnailPageSelector_currentPage")
        thumbnailCurrentPageText.stepUp()
        thumbnailCurrentPageText.dispatchEvent(new Event("change"))
        setTimeout(() => { // Needs to wait for new thumbnails list to be loaded. Very ugly, need rethinking later.
          selectImage(currentThumbnailsList[0])
        }, 3000)
      } else {
        selectImage(currentThumbnailsList[currentImageIndex + 1])
      }
    }
  }
  nextImageMessage.appendChild(nextImageButton)
}

const selectQuality = async (annotationName, qualitySelected) => {
  if (await box.isLoggedIn()) {
    const imageId = hashParams.image
    const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
    const fileAnnotations = fileMetadata[`${annotationName}_annotations`] ? JSON.parse(fileMetadata[`${annotationName}_annotations`]) : {}

    const newAnnotation = {
      'userId': window.localStorage.userId,
      'email': window.localStorage.email,
      'username': window.localStorage.username,
      'value': qualitySelected,
      'createdAt': Date.now()
    }

    const previousAnnotation = fileAnnotations[window.localStorage.userId]
    if (previousAnnotation && previousAnnotation.value != newAnnotation.value) {
      const {
        displayText: previousValue
      } = qualityEnum.find(quality => quality.label === previousAnnotation.value)
      const {
        displayText: newValue
      } = qualityEnum.find(quality => quality.label === newAnnotation.value)
      if (!confirm(`You previously annotated this image to be of ${previousValue} quality. Do you wish to change your annotation to ${newValue} quality?`)) {
        return
      } else {
        fileAnnotations[window.localStorage.userId].value = newAnnotation.value
        fileAnnotations[window.localStorage.userId].createdAt = Date.now()
      }
    } else if (previousAnnotation && previousAnnotation.value == newAnnotation.value) {
      return
    } else {
      fileAnnotations[window.localStorage.userId] = newAnnotation
    }
    const boxMetadataPath = `/${annotationName}_annotations`
    const newMetadata = await box.updateMetadata(imageId, boxMetadataPath, JSON.stringify(fileAnnotations))

    if (!newMetadata.status) { // status is returned only on error, check for errors properly later
      window.localStorage.fileMetadata = JSON.stringify(newMetadata)
      utils.showToast(`Annotation Successful!`)
      thumbnails.borderByAnnotations(hashParams.image, newMetadata)

      if (imageId === hashParams.image) {
        activateQualitySelector(annotationName, fileAnnotations)
        showNextImageButton(newMetadata)
      }
    } else {
      utils.showToast("Error occurred during annotation, please try again later!")
    }
  }
}

const submitAnnotationComment = (annotationName) => {
  const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
  const commentText = commentsTextField.value.trim()

  if (commentText.length === 0) {
    return
  }

  const newCommentMetadata = {
    "commentId": Math.floor(1000000 + Math.random() * 9000000),
    "userId": window.localStorage.userId,
    "createdBy": window.localStorage.username,
    "text": commentText,
    "isPrivate": !(document.getElementById(`${annotationName}_commentsPublic`).checked)
  }

  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const annotationComments = fileMetadata[`${annotationName}_comments`] ? JSON.parse(fileMetadata[`${annotationName}_comments`]) : []
  const editingCommentId = parseInt(commentsTextField.getAttribute("editingCommentId"))
  // If comment is an edit of a previously submitted comment, replace it, otherwise add a new one.
  if (editingCommentId) {
    newCommentMetadata["modifiedAt"] = Date.now()
    const editingCommentIndex = annotationComments.findIndex(comment => comment["commentId"] === editingCommentId)
    annotationComments[editingCommentIndex] = newCommentMetadata
  } else {
    newCommentMetadata["createdAt"] = Date.now()
    annotationComments.push(newCommentMetadata)
  }

  updateCommentsInBox(annotationName, annotationComments)
}

const updateCommentsInBox = async (annotationName, annotationComments) => {
  const boxMetadataPath = `/${annotationName}_comments`
  try {
    const newMetadata = await box.updateMetadata(hashParams.image, boxMetadataPath, JSON.stringify(annotationComments))

    if (JSON.parse(newMetadata[`${annotationName}_comments`]).length < JSON.parse(JSON.parse(window.localStorage.fileMetadata)[`${annotationName}_comments`]).length) {
      utils.showToast("Comment Deleted Successfully!")
    } else {
      utils.showToast("Comment Added Successfully!")
    }

    window.localStorage.fileMetadata = JSON.stringify(newMetadata)
    populateComments(annotationName)

    const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
    if (toggleCommentsButton.classList.contains("collapsed")) {
      toggleCommentsButton.click()
    }
    document.getElementById(`${annotationName}_allCommentsCard`).scrollTop = document.getElementById(`${annotationName}_allCommentsCard`).scrollHeight

    cancelEditComment(annotationName)
    return newMetadata
  } catch (e) {
    utils.showToast("Some error occurred adding your comment. Please try later!")
    console.log(e)
  }
}

const populateComments = (annotationName) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  const toggleCommentsButton = document.getElementById(`${annotationName}_commentsToggle`)
  const commentsCard = document.getElementById(`${annotationName}_allCommentsCard`)

  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments.length > 0) {
      let commentsSortedByTime = annotationComments.sort((prevComment, currentComment) => prevComment.createdAt - currentComment.createdAt)
      // To resolve breaking change of comments not having the ID field before. Assign old comments IDs and store them back in Box.
      commentsSortedByTime = commentsSortedByTime.map(comment => {
        const commentWithId = {
          ...comment
        }
        if (!commentWithId["commentId"]) {
          commentWithId["commentId"] = Math.floor(1000000 + Math.random() * 9000000)
        }
        return commentWithId
      })
      if (JSON.stringify(annotationComments) !== JSON.stringify(commentsSortedByTime)) {
        updateCommentsInBox(annotationName, commentsSortedByTime)
      }

      const visibleComments = commentsSortedByTime.filter(comment => comment.userId === window.localStorage.userId || !comment.isPrivate)

      if (visibleComments) {
        const userCommentIds = []

        const commentsHTML = visibleComments.map((comment, index) => {
          const {
            commentId
          } = comment
          let commentElement = `
            <span class="annotationComment" id="${annotationName}_comment_${commentId}">
              <span class="annotationCommentText">
                <b>
                <u style="color: dodgerblue;">${comment.createdBy.trim()}</u>
                </b>
          `
          if (!comment.isPrivate) {
            commentElement += `
                <i class="fas fa-globe" title="This comment is public"></i>
            `
          }

          commentElement += `
          :
                <strong style="color: rgb(85, 85, 85);">
                  ${comment.text}
                </strong>
              </span>
          `

          if (comment.userId === window.localStorage.userId) {
            const commentDropdownMenu = `
              <div class="btn-group dropleft dropdown commentMenu" id="${annotationName}_commentMenu_${commentId}">
                <button class="btn btn-light dropdown-toggle commentMenuToggle" role="button" id="${annotationName}_commentMenuToggle_${commentId}" data-toggle=dropdown aria-haspopup="true" aria-expanded="false">
                  <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="dropdown-menu commentMenuDropdown" style="top: -10px;">
                  <div class="commentMenuButtons">
                    <button class="btn btn-light commentMenuOption" role="button" id="${annotationName}_editComment_${commentId}" title="Edit" onclick="editAnnotationComment('${annotationName}', ${commentId})"  aria-haspopup="true" aria-expanded="false">
                      <i class="fas fa-pencil-alt"></i>
                    </button>
                    <div style="border-left: 1px solid lightgray; height: auto;"></div>
                    <button class="btn btn-light commentMenuOption" role="button" id="${annotationName}_deleteComment_${commentId}" title="Delete" onclick="deleteAnnotationComment('${annotationName}', ${commentId})" aria-haspopup="true" aria-expanded="false">
                      <i class="fas fa-trash-alt"></i>
                    </button>
                  </div>
                </div>
              </div>
            `
            commentElement += commentDropdownMenu
            userCommentIds.push(commentId)
          }

          commentElement += "</span>"
          commentElement += (index !== commentsSortedByTime.length - 1) ? "<hr/>" : ""
          return commentElement
        }).join("")

        commentsCard.innerHTML = commentsHTML

        userCommentIds.forEach(commentId => {
          const commentMenu = document.getElementById(`${annotationName}_commentMenu_${commentId}`)
          const commentMenuDropdown = new Dropdown(commentMenu)
          new Tooltip(document.getElementById(`${annotationName}_editComment_${commentId}`), {
            'placement': "bottom",
            'animation': "slideNfade",
            'delay': 50
          })
          new Tooltip(document.getElementById(`${annotationName}_deleteComment_${commentId}`), {
            'placement': "bottom",
            'animation': "slideNfade",
            'delay': 50
          })
          const commentSpan = document.getElementById(`${annotationName}_comment_${commentId}`)
          commentSpan.onmouseover = () => {
            document.getElementById(`${annotationName}_commentMenu_${commentId}`).style.display = "block"
          }
          commentSpan.onmouseleave = () => {
            const commentMenuIsOpen = commentMenu.querySelector("div.commentMenuDropdown").classList.contains("show")
            if (!commentMenuIsOpen) {
              document.getElementById(`${annotationName}_commentMenu_${commentId}`).style.display = "none"
            }
          }
        })

        toggleCommentsButton.innerHTML = "+ Show All Comments"
        toggleCommentsButton.parentElement.style["text-align"] = "left"
        toggleCommentsButton.removeAttribute("disabled")

        return
      }
    }
  }

  commentsCard.innerHTML = ""
  if (!(toggleCommentsButton.classList.contains("collapsed"))) {
    toggleCommentsButton.Collapse.hide()
  }
  toggleCommentsButton.parentElement.style["text-align"] = "center"
  toggleCommentsButton.setAttribute("disabled", "true")
  toggleCommentsButton.innerHTML = "-- No Comments To Show --"

}

const editAnnotationComment = async (annotationName, commentId) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments) {
      const commentToEdit = annotationComments.find(comment => comment["commentId"] === commentId)
      if (commentToEdit) {
        const {
          userId,
          text,
          isPrivate
        } = commentToEdit
        if (userId === window.localStorage.userId) {
          const commentsTextField = document.getElementById(`${annotationName}_commentsTextField`)
          commentsTextField.setAttribute("editingCommentId", commentId)
          commentsTextField.value = text
          document.getElementById(`${annotationName}_commentsPublic`).checked = !isPrivate
          commentsTextField.focus()
          if (text.trim().length > 0) {
            document.getElementById(`${annotationName}_submitComment`).removeAttribute("disabled")
          }
        }
      }
    }
  }
}

const deleteAnnotationComment = async (annotationName, commentId) => {
  const fileMetadata = JSON.parse(window.localStorage.fileMetadata)
  if (fileMetadata[`${annotationName}_comments`]) {
    const annotationComments = JSON.parse(fileMetadata[`${annotationName}_comments`])
    if (annotationComments) {
      const commentsAfterDelete = annotationComments.filter(comment => comment["commentId"] !== commentId)
      if (commentsAfterDelete.length !== annotationComments.length) {
        updateCommentsInBox(annotationName, commentsAfterDelete)
      }
    }
  }
}

const cancelEditComment = async (annotationName) => {
  document.getElementById(`${annotationName}_commentsTextField`).value = ""
  document.getElementById(`${annotationName}_commentsTextField`).removeAttribute("editingCommentId")
  document.getElementById(`${annotationName}_commentsPublic`).checked = false
  document.getElementById(`${annotationName}_submitComment`).setAttribute("disabled", "true")
}

const activateQualitySelector = (annotationName, fileAnnotations) => {
  const selectTable = document.getElementById(`${annotationName}Select`)
  const currentlyActiveButton = selectTable.querySelector("button.active")
  if (currentlyActiveButton) {
    currentlyActiveButton.classList.remove("active")
  }
  if (fileAnnotations && fileAnnotations[window.localStorage.userId]) {
    let userAnnotation = fileAnnotations[window.localStorage.userId].value
    // Temporary fix for problem of label mismatch due to AutoML (they were 0, 0.5, 1 before, had to be changed to 
    // O, M, S for AutoML training). Need to change the metadata of all annotated files to solve the problem properly. 
    // if (annotationConfig.labels.find(q => q.label === )) {
    //   userAnnotation = qualityEnum.find(quality => quality.label === fileAnnotations[window.localStorage.userId].value).label
    // }
    const newActiveButton = selectTable.querySelector(`button[value='${userAnnotation}']`)
    if (newActiveButton) {
      newActiveButton.classList.add("active")
    }
  }
}

annotations.deactivateQualitySelectors = () => {
  const activeQualitySelector = document.querySelectorAll("button.labelText.active")
  activeQualitySelector.forEach(element => element.classList.remove("active"))
}