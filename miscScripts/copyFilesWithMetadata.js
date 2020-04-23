// RUN AS NODE.JS SCRIPT WITH FOLDER IDs AS COMMAND LINE PARAMETERS
// node copyFilesWithMetdata.js <boxFolderIdToCopyFrom> <boxFolderIdToCopyTo>

const box = require('box-node-sdk')

const validFileTypes = [".jpg", ".jpeg", ".png", ".tiff"]
const fromFolder = process.argv[2]
const toFolder = process.argv[3]

const sdk = new box({
  clientID: "1n44fu5yu1l547f2n2fgcw7vhps7kvuw",
  clientSecret: "2ZYzmHXGyzBcjZ9d1Ttsc1d258LiGGVd"
})

const client = sdk.getBasicClient("G0mkhl28WOMTULwRice8WwQbH0segm10") //DEVELOPER Token generated from Box Dev Console

const isValidImage = (fileName) => {
  let isValid = false
  
  validFileTypes.forEach(fileType => {
    if (fileName.endsWith(fileType)) {
      isValid = true
    }
  })
    
  return isValid
}

const deleteImage = async (image, dateToDeleteFor) => {
  if (image.created_at.includes(dateToDeleteFor)) {
    await client.files.delete(image.id)
    console.log("DELETING ", image.id)
  }
}

const main = async () => {
  try {
    const { entries: folderContent } = await client.folders.getItems(fromFolder, {limit: 1000, offset: 0, fields: "name,metadata.global.properties,created_at"})
    folderContent.forEach(async (image) => {
      // await deleteImage(image, "2020-04-22")
      if (image.type === "file" && isValidImage(image.name) && image.metadata && image.metadata.global && image.metadata.global.properties) {
        try {
          const copiedImage = await client.files.copy(image.id, toFolder, {name: `fromQC_${image.name}`})
          const setMetadata = await client.files.addMetadata(copiedImage.id, client.metadata.scopes.GLOBAL, "properties", {})
          const copyMetadataOps = []
          Object.keys(image.metadata.global.properties).forEach(property => {
            if (!Object.keys(setMetadata).includes(property)) {
              copyMetadataOps.push({
                op: 'add',
                path: `/${property}`,
                value: image.metadata.global.properties[property]
              })
            }
          })
          await client.files.updateMetadata(copiedImage.id, client.metadata.scopes.GLOBAL, "properties", copyMetadataOps)
        } catch (e) {
          console.log(e)
        }
      }
    })
  } catch (e) {
    console.log(e)
  }
}

main()