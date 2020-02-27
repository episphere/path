// RUN IN BROWSER CONSOLE

const boxAccessToken = JSON.parse(window.localStorage.box).access_token
const boxFolderId = "97077691060"
const annotationTypes2 = ["tissueAdequacy_annotations", "stainingAdequacy_annotations"]
const changeLabel = {
  "0": "U",
  "0.5": "S",
  "1": "O"
}

const rectify = (metadata) => {
  const {model, ...meta} = JSON.parse(metadata)
  for (annot of Object.entries(meta)) {
    const [key, val] = annot
    val.value = Object.keys(changeLabel).includes(val.value.toString()) ? changeLabel[val.value.toString()] : val.value
    meta[key] = val
  }
  if (model && model[0].displayName === "S") {
    model[0].displayName = "U"
  } else if (model && model[0].displayName === "M") {
    model[0].displayName = "S"
  }
  return {model, ...meta}
}

const folderContents = await box.getFolderContents(boxFolderId, 1000, 0, ["metadata.global.properties"])

const doIt = () => {
    for (item of folderContents.entries) {
      if (item.type === "file") {
        annotationTypes2.forEach(async (annot) => {
          const newMeta = rectify(item.metadata.global.properties[annot])
          const path = `/${annot}`
          const newMetadata = await box.updateMetadata(item.id, "file", path, JSON.stringify(newMeta))
          console.log(newMetadata)
        })
      }
    }
}