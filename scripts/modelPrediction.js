importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.0.1/dist/tf.min.js", "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-automl@1.0.0/dist/tf-automl.min.js")
const indexedDBConfig = {
  dbName: "boxCreds",
  objectStoreName: "oauth"
}

const models = {}

let workerDB = {}
indexedDB.open(indexedDBConfig.dbName).onsuccess = (evt) => {
  workerDB = evt.target.result
}

const utils = {
  request: (url, opts) => 
    fetch(url, opts)
    .then(res => {
      if (res.ok) {
        return res
      } else {
        throw Error(res.status)
      } 
    })
}

class BoxHandler {
  constructor (configJSON, weightFiles) {
    this.configJSON = configJSON
    this.weightFiles = weightFiles
  }
  async load() {
    // Returns a ModelArtifacts Object. https://github.com/tensorflow/tfjs/blob/81225adc2fcf6fcf633b4119e4b89a3bf55be824/tfjs-core/src/io/types.ts#L226
    let weightData = new ArrayBuffer()
    for (const file of this.configJSON.weightsManifest[0].paths) {
      const fileIdInBox = this.weightFiles[file]
      const weightsBinary = await getFileContentFromBox(fileIdInBox, "buffer")
      const tempWeightData = new Uint8Array(weightData.byteLength + weightsBinary.byteLength)
      tempWeightData.set(new Uint8Array(weightData), 0)
      tempWeightData.set(new Uint8Array(weightsBinary), weightData.byteLength)
      weightData = tempWeightData.buffer
    }
    const modelArtifacts = {
      modelTopology: this.configJSON.modelTopology,
      format: this.configJSON.format,
      generatedBy: this.configJSON.generatedBy,
      convertedBy: this.configJSON.convertedBy,
      userDefinedMetadata: this.configJSON.userDefinedMetadata,
      weightSpecs: this.configJSON.weightsManifest[0].weights,
      weightData
    }
    return modelArtifacts
  }
  async save() {
    // Returns a ModelArtifactsInfo Object. https://github.com/tensorflow/tfjs/blob/81225adc2fcf6fcf633b4119e4b89a3bf55be824/tfjs-core/src/io/types.ts#L150
    return {
      dateSaved: new Date(),
      modelTopologyType: 'JSON'
    }
  }
}


const loadLocalModel = async () => {

  // model = await tf.automl.loadImageClassification()
  // console.log("LOADED IN WORKER", model)
}

onmessage = async (evt) => {
  const { op, ...data } = evt.data
  // console.log("Message received from main thread!")
  switch (op) {
    case 'loadModels':
      const { modelsConfig } = data.body
      modelsConfig.trainedModels.forEach(async (modelCfg) => {
        const { correspondingAnnotation, configFileId, weightFiles, dictionaryFileId } = modelCfg
        const modelConfig = await getFileContentFromBox(configFileId, "json")
        const handler = new BoxHandler(modelConfig, weightFiles)
        const graphModel = await tf.loadGraphModel(handler)
        const dictionary = await getFileContentFromBox(dictionaryFileId, "text")
        const model = new tf.automl.ImageClassificationModel(graphModel, dictionary.trim().split('\n'))
        models[correspondingAnnotation] = model
        postMessage({"annotationId": correspondingAnnotation, "modelLoaded": true})
      })
      break
    
    case 'predict':
      const { annotationId, tmaImageData: { imageBitmap, width, height } } = data.body
      const offscreenCV = new OffscreenCanvas(width, height)
      const offscreentCtx = offscreenCV.getContext('2d')
      offscreentCtx.drawImage(imageBitmap, 0, 0)
      const pred = await models[annotationId].classify(offscreenCV)
      postMessage(pred)
      break

    case 'test':
      return new Promise(resolve => {
        setTimeout(()=> resolve(data), 5000)

      })
      
  }
  // const tmaImage = tf.tensor3d(evt.data)
  // postMessage(pred)
  
}

const getFileContentFromBox = (id, fileType="json") => {
  return new Promise(resolve => {
    workerDB.transaction("oauth", "readwrite").objectStore("oauth").get(1).onsuccess = async (evt) => {
      const accessToken = evt.target.result.access_token
      const contentEndpoint = `https://api.box.com/2.0/files/${id}/content`
      let resp = await utils.request(contentEndpoint, {
        'headers': {
          'Authorization': `Bearer ${accessToken}`
        }
      })
      if (fileType === "json") {
        resp = await resp.json()
      } else if (fileType === "buffer") {
        resp = await resp.arrayBuffer()
      } else {
        resp = await resp.text()
      }
      resolve(resp)
    }
  })
}

loadLocalModel()