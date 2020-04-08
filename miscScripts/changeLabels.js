// RUN IN BROWSER CONSOLE

const boxAccessToken = JSON.parse(window.localStorage.box).access_token
const boxFolderId = hashParams.folder || "86570922727"
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

const getFolderContents = async (boxFolderId, limit=1000, offset=0, prevEntries=[]) => {
  const {total_count, entries: folderContents } = await box.getFolderContents(boxFolderId, limit, offset, ["metadata.global.properties"])
  const entries = prevEntries.concat(folderContents)
  if (entries.length < total_count) {
    return getFolderContents(boxFolderId, total_count, entries.length, entries)
  }
  console.log("DONE", entries.length)
  return entries
}

const changeLabels = (folderContents) => {
  for (item of folderContents) {
    if (item.type === "file") {
      annotationTypes2.forEach(async (annot) => {
        if (item.metadata && item.metadata.global && item.metadata.global.properties && item.metadata.global.properties[annot]) {
          const newMeta = rectify(item.metadata.global.properties[annot])
          const path = `/${annot}`
          const newMetadata = await box.updateMetadata(item.id, "file", path, JSON.stringify(newMeta))
          console.log(`Updated ${annot} for ${item.id}`)
        }
      })
    }
  }
}

const folderContents = await getFolderContents(boxFolderId, 1000, 0, [])
changeLabels(folderContents)
