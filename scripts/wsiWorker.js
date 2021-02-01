importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.7.0/dist/tf.min.js", "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-automl@1.0.0/dist/tf-automl.min.js")
importScripts("/scripts/modelWorkerUtils.js")

const tileServerBasePath = "https://dl-test-tma.uc.r.appspot.com/iiif"
let model = {}

onmessage = async (evt) => {
  const { op, ...data } = evt.data
  if (op === "loadModel") {
    modelConfig = data.body.modelConfig
    const { configFileId, weightFiles, dictionaryFileId } = modelConfig
    const modelArch = await getFileContentFromBox(configFileId, false, "json")
    const handler = new BoxHandler(modelArch, weightFiles)
    const graphModel = await tf.loadGraphModel(handler)
    const dictionary = await getFileContentFromBox(dictionaryFileId, false, "text")
    model = new tf.automl.ImageClassificationModel(graphModel, dictionary.trim().split('\n'))
    postMessage({
      op, 
      'body': {
        'modelLoaded': true
      }
    })
  } else {

    const { imageId, imageURL, x, y, width, height, attemptNum } = data.body
  
    if (x >= 0 && y >= 0 && width >= 0 && height >= 0) {
      const tileServerRequest = `${tileServerBasePath}/?iiif=${imageURL}/${x},${y},${width},${height}/${width},/0/default.jpg`
      try {
        const tileBlob = await (await fetch(tileServerRequest)).blob()
        const tileImageBitmap = await createImageBitmap(tileBlob)
        
        if (tileImageBitmap) {
          const offscreenCV = new OffscreenCanvas(tileImageBitmap.width, tileImageBitmap.height)
          const offscreenCtx = offscreenCV.getContext('2d')
          offscreenCtx.drawImage(tileImageBitmap, 0, 0)
          const imgData = offscreenCtx.getImageData(0, 0, tileImageBitmap.width, tileImageBitmap.height)
          if (imgData.data.filter(pixelIntensity => pixelIntensity < 220).length > 100) {
            const prediction = await model.classify(offscreenCV)
            postMessage({
              op,
              'body': {
                imageId,
                x,
                y,
                width,
                height,
                prediction,
                'success': true
              }
            })
          } else {
            postMessage({
              op,
              'body': {
                imageId,
                x,
                y,
                width,
                height,
                'isTileBlank': true,
                'success': true,
              }
            })
          }
       
        } else {
          // postMessage({
          //   op,
          //   'body': {
          //     x,
          //     y,
          //     width,
          //     height,
          //     'success': false,
          //     'message': "Error occurred getting the tile image bitmap!"
          //   }
          // })
        }
  
      } catch (e) {
        console.log(e)
        postMessage({
          op,
          'body': {
            imageId,
            x,
            y,
            width,
            height,
            attemptNum,
            'success': false,
            'message': "Error fetching tile"
          }
        })
      } 
    }
  }
}