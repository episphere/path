const modelWorkerUtilsScriptPath = `./modelWorkerUtils.js`

const MAX_PARALLEL_REQUESTS = 5

const models = {}
const wsiFileTypes = [".svs", ".ndpi"]
const validFileTypes = [".jpg", ".jpeg", ".png", ".tiff", ...wsiFileTypes]
const minTileWidth = 512
const minTileHeight = 512
const tileWidthRendered = 256
const maxTileImageDimension = 512

let stopPreds = false

const utils = {
  isValidImage: (name) => {
    let isValid = false
    
    validFileTypes.forEach(fileType => {
      if (name.endsWith(fileType)) {
        isValid = true
      }
    })
    
    return isValid
  },

  isWSI: (name) => {
    let isWSI = false
    
    wsiFileTypes.forEach(fileType => {
      if (name.endsWith(fileType)) {
        isWSI = true
      }
    })

    return isWSI
  }
  
}

const loadLocalModel = async () => {
  // model = await tf.automl.loadImageClassification()
  // console.log("LOADED IN WORKER", model)
}

onmessage = async (evt) => {
  const { op, ...data } = evt.data
  let annotationId, imageId, prediction, modelConfig

  const { getFileContentFromBox, insertWSIDataToIndexedDB } = await import(modelWorkerUtilsScriptPath)

  // console.log("Message received from main thread!")
  switch (op) {
    case 'loadModel':
      const { BoxHandler} = await import(modelWorkerUtilsScriptPath)
      const { loadGraphModel } = await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/+esm")
      const { ImageClassificationModel } = await import("https://esm.sh/gh/PrafulB/tfjs-automl-dist")
      
      modelConfig = data.body.modelConfig
      const { correspondingAnnotation, configFileId, weightFiles, dictionaryFileId } = modelConfig
      const modelArch = await getFileContentFromBox(configFileId, false, "json")
      const handler = new BoxHandler(modelArch, weightFiles)
      const graphModel = await loadGraphModel(handler)
      const dictionary = await getFileContentFromBox(dictionaryFileId, false, "text")
      const model = new ImageClassificationModel(graphModel, dictionary.trim().split('\n'))
      models[correspondingAnnotation] = {
        'modelId': modelConfig.id,
        'modelVersion': modelConfig.version,
        model
      }
      postMessage({ op, "annotationId": correspondingAnnotation, "modelId": modelConfig.id, "modelLoaded": true})
      break
    
    case 'predict':
      annotationId = data.body.annotationId
      imageId = data.body.imageData.imageId
      let { imageData: { imageBitmap, width, height } } = data.body
      if (!imageBitmap && imageId) {
        const { getDataFromBox } = await import(modelWorkerUtilsScriptPath)
        const { name } = await getDataFromBox(imageId, "file")
        if (utils.isValidImage(name)) {
          const imageBlob = await getFileContentFromBox(imageId, false, "blob")
          imageBitmap = await createImageBitmap(imageBlob)
          width = imageBitmap.width
          height = imageBitmap.height
        }
      }
      
      const offscreenCV = new OffscreenCanvas(width, height)
      const offscreentCtx = offscreenCV.getContext('2d')
      offscreentCtx.drawImage(imageBitmap, 0, 0)
      prediction = await models[annotationId].model.classify(offscreenCV)
      postMessage({
        op,
        prediction,
        imageId,
        'modelId': models[annotationId].modelId,
        'modelVersion': models[annotationId].modelVersion
      })
      break
      
    case 'predictWSI':
      const { default: Imagebox3 } = await import("https://cdn.jsdelivr.net/gh/episphere/imagebox3/imagebox3.mjs");
      
      stopPreds = false
      annotationId = data.body.annotationId
      const { indexedDBConfig, getAllWSIDataFromIndexedDB, getWSIDataFromIndexedDB, uploadFileToBox } = await import(modelWorkerUtilsScriptPath)
      prediction = await getAllWSIDataFromIndexedDB(annotationId, {'removeKeys': ["userFeedback"]})
      imageId = data.body.imageData.imageId
      let { imageName, imageInfo, predictionBounds, wsiPredsFileId } = data.body.imageData
      const fileFormat = imageName.substring(imageName.lastIndexOf(".") + 1)
      
      const tileServerPathSuffix = "iiif"
      const tileServerBasePath = `https://imageboxv2-oxxe7c4jbq-uc.a.run.app/${tileServerPathSuffix}`
      // const imagebox3TileServerBasePath = `${location.origin}/${tileServerPathSuffix}`
      let isImagebox3Compatible = undefined
      let imagebox3Instance = undefined
      const wsiTilePrediction = async (tileInfo) => {
        const { imageId, imageURL, x, y, width, height, attemptNum } = tileInfo
        const indexedDBRecord = await getWSIDataFromIndexedDB({x, y, width, height}, annotationId)
        if (indexedDBRecord) {
          return {
            annotationId,
            imageId,
            ...indexedDBRecord,
            'success': true,
            'fromLocalDB': true
          }
        } else if (x >= 0 && y >= 0 && width > 0 && height > 0) {
          let tile = undefined

          const getImageBox3Tile = async () => {
            const tile = await imagebox3Instance.getTile(x, y, width, height, tileWidthRendered)
            return tile
          }
          if (typeof(isImagebox3Compatible) === "undefined"
          || !isImagebox3Compatible  // Remove this second condition later. Need to resolve the GeoTIFF "block is undefined"
                                     // error for some tiles to resolve this. For now, use ImageBox3 for all tiles as far as possible.
          ) {
            const checkImageBox3Compatibility = async () => {
              if (fileFormat !== 'svs') {
                return false
              }
              try {
                try {
                  tile = await getImageBox3Tile()
                  return true
                } catch(e) {
                  console.log("Tile loading failed from ImageBox3, retrying once more.", e)
                  try {
                    tile = await getImageBox3Tile()
                    return true
                  } catch (e) {
                    console.warn("Error using Imagebox3, reverting to Imagebox2", e)
                    return false
                  }
                }
              } catch (e) {
                console.warn("Error using Imagebox3, reverting to Imagebox2", e)
                return false
              }
            }
            isImagebox3Compatible = await checkImageBox3Compatibility()
          } 
          if (isImagebox3Compatible && !tile) {
            try {
              tile = await getImageBox3Tile()
            } catch (e) {
              console.warn("Tile loading failed using Imagebox3, checking compatibility again.") // Also to handle the GeoTIFF "block is undefined" error.
              isImagebox3Compatible = undefined
              return await wsiTilePrediction(tileInfo)
            }
          } else if (!tile) {
            const tileServerRequest = `${tileServerBasePath}/?format=${fileFormat}&iiif=${imageURL}/${x},${y},${width},${height}/${tileWidthRendered},/0/default.jpg`
            tile = await (await fetch(tileServerRequest)).blob()
          }
          // const tileServerRequest = `${tileServerBasePath}/?format=${fileFormat}&iiif=${imageURL}/${x},${y},${width},${height}/${width > maxTileImageDimension ? maxTileImageDimension: width},/0/default.jpg`
          try {
            const tileBlob = tile
            const tileImageBitmap = await createImageBitmap(tileBlob)
            
            if (tileImageBitmap) {
              const offscreenCV = new OffscreenCanvas(tileImageBitmap.width, tileImageBitmap.height)
              const offscreenCtx = offscreenCV.getContext('2d')
              offscreenCtx.drawImage(tileImageBitmap, 0, 0)
              const imgData = offscreenCtx.getImageData(0, 0, tileImageBitmap.width, tileImageBitmap.height)
              
              if (imgData.data.filter(pixelIntensity => pixelIntensity < 220).length > imgData.data.length*0.001) {
                const prediction = await models[annotationId].model.classify(offscreenCV)
                return {
                  annotationId,
                  imageId,
                  x,
                  y,
                  width,
                  height,
                  prediction,
                  'modelId': models[annotationId].modelId,
                  'success': true
                }
           
              } else {
                return {
                  annotationId,
                  imageId,
                  x,
                  y,
                  width,
                  height,
                  'isTileBlank': true,
                  'success': true,
                }
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
            throw Error(e)
          }
        }
      }
      
      let lastURLRefreshTime = null
      if (imageId) {
        let url = await getFileContentFromBox(imageId, true)
        lastURLRefreshTime = Date.now()

        imagebox3Instance = new Imagebox3(url, Math.floor(navigator.hardwareConcurrency/2))
        await imagebox3Instance.init()
        
        if (!imageInfo) {
          const p = `${tileServerBasePath}/?format=${fileFormat}&iiif=${url}`
          const infoURL = `${p}/info.json`
          imageInfo = await (await fetch(infoURL)).json()
        }
        let { startX:initialX=0, startY:initialY=0, endX:finalX=imageInfo.width, endY:finalY=imageInfo.height, tileDimensions=minTileWidth } = predictionBounds
        
        postMessage({
          op,
          'body': {
            'message': "Starting predictions on WSI Tiles",
            imageId
          }
        })
        
        // childWorkers.forEach(worker => worker.terminate())
        
        let currentX = -1
        let currentY = -1
        let currentTileWidth = -1
        let currentTileHeight = -1
        let currentLevel = 0
        let isRightMostTile = false
        let isBottomMostTile = false
        let wsiDone = false
        let activeCalls = 0

        const commitToBox = (data=prediction) => {
          const formData = new FormData()
          const dataBlob = new Blob([JSON.stringify(data)], {
            type: "application/json"
          })
          formData.append("file", dataBlob)
          uploadFileToBox(formData, wsiPredsFileId)
        }

        const getNextTileInfo = (imageId) => {
          if (currentX === -1 && currentY === -1 && currentTileWidth === -1 && currentTileHeight === -1) {
            currentX = initialX
            currentY = initialY
            currentTileWidth = initialX + tileDimensions <= finalX ? tileDimensions : minTileWidth
            currentTileHeight = initialY + tileDimensions <= finalY ? tileDimensions : minTileHeight
            
            if (currentX + currentTileWidth >= finalX) {
              isRightMostTile = true
            }
            if (currentY + currentTileHeight >= finalY) {
              isBottomMostTile = true
            }
            
          } else {
            currentX += currentTileWidth

            if (isRightMostTile) {
              currentTileWidth = Math.floor(tileDimensions/Math.pow(2, currentLevel))
              currentTileHeight = Math.floor(tileDimensions/Math.pow(2, currentLevel))
              currentX = initialX
              currentY += currentTileHeight
              isRightMostTile = false

              if (isBottomMostTile) {
                currentLevel += 1
                currentTileWidth = Math.floor(tileDimensions/Math.pow(2, currentLevel))
                currentTileHeight = Math.floor(tileDimensions/Math.pow(2, currentLevel))
                currentY = initialY
                isBottomMostTile = false
                
                if (currentTileWidth < minTileWidth || currentTileHeight < minTileHeight) {
                  wsiDone = true
                  return
                }
                postMessage({
                  op,
                  'body': {
                    'message': `Increasing tile magnification for model prediction.`,
                    imageId
                  }
                })

              } else if (currentY + currentTileHeight >= finalY) {
                currentTileHeight = finalY - currentY
                isBottomMostTile = true
              }
              
            } else if (currentX + currentTileWidth >= finalX) {
              currentTileWidth = finalX - currentX
              isRightMostTile = true
            }
          }
          
          const nextTileInfo = {
            annotationId,
            imageId,
            'imageURL': url,
            'x': currentX,
            'y': currentY,
            'width': currentTileWidth,
            'height': currentTileHeight
          }
          
          return nextTileInfo
        }

        const makePrediction = (tileInfo, attemptNum=1) => {

          postMessage({
            op,
            'body': {
              'processing': true,
              'annotationId': tileInfo.annotationId,
              'imageId': tileInfo.imageId,
              'x': tileInfo.x,
              'y': tileInfo.y,
              'width': tileInfo.width,
              'height': tileInfo.height,
            }
          })

          if (!stopPreds && attemptNum <= 3) {
            tileInfo['attemptNum'] = attemptNum
            activeCalls += 1

            wsiTilePrediction(tileInfo).then((data) => {
              activeCalls -= 1
            
              if (data?.success) {
                let predictedLabel=undefined
                let predictionScore=undefined
                if (!data.isTileBlank && !data.fromLocalDB) {
                  const addObjToDb = {
                    'x': data.x,
                    'y': data.y,
                    'width': data.width,
                    'height': data.height,
                    'prediction': data.prediction,
                    'modelId': data.modelId,
                  }
                  const highestValuePrediction = data.prediction.reduce((max, current) => current.prob > max.prob ? current : max, {prob: 0})
                  predictedLabel = highestValuePrediction.label
                  predictionScore = highestValuePrediction.prob

                  insertWSIDataToIndexedDB({
                    predictedLabel,
                    predictionScore,
                    ...addObjToDb
                  }, annotationId).then(result => {
                    if (result && result.length === indexedDBConfig['wsi'].objectStoreOpts.keyPath.length) {
                      prediction.push(addObjToDb)
                      if (prediction.length % 50 === 0) {
                        commitToBox(prediction)
                      }
                    } else {
                      console.log(result)
                    }
                  }).catch(e => console.log(e))
                }

                postMessage({
                  op,
                  'body': {
                    'success': true,
                    predictedLabel,
                    predictionScore,
                    ...data
                  }
                })
              }
           
              const nextTileInfo = getNextTileInfo(tileInfo.imageId)
              if (!wsiDone && !stopPreds) {
                makePrediction(nextTileInfo)
                return
         
              } else if (activeCalls === 0) {
                imagebox3Instance.destroyWorkerPool()
                commitToBox(prediction)
                postMessage({
                  op,
                  'body': {
                    'imageId': tileInfo.imageId,
                    'completed': true,
                    'message': "Finished running the model!"
                  }
                })
              }

            }).catch(async (e) => {
              activeCalls -= 1
              console.log("Error making prediction for tile", JSON.stringify(tileInfo), e)
              console.log("Retrying, attempt", attemptNum+1)

              if (lastURLRefreshTime + 14*60*1000 < Date.now()) {
                console.log("Box URL expired. Refreshing for further predictions.", Date())
                if (url) {
                  // Use url as a mutex.
                  url = undefined
                  url = await getFileContentFromBox(imageId, true)
                  lastURLRefreshTime = Date.now()
                  tileInfo['imageURL'] = url
                  imagebox3Instance = new Imagebox3(url, Math.floor(navigator.hardwareConcurrency/2))
                  await imagebox3Instance.init()
                } else {
                  // Wait for new URL and Imagebox3 instance setup to complete before moving on.
                  await new Promise(res => setTimeout(res, 1000))
                }
              }
              makePrediction(tileInfo, attemptNum+1)
            })
     
          } else if (!stopPreds) {
            stopPreds = true
            console.error("Image loading failed too many times! Further predictions cannot be made.")
            imagebox3Instance.destroyWorkerPool()
            postMessage({
              op,
              'body': {
                'error': true,
                'message': "Tile Loading Failed for WSI Prediction!",
                imageId
              }
            })
            return
          }
        }

        for (let i = 0; i < MAX_PARALLEL_REQUESTS; i++) {
          const tileInfo = getNextTileInfo(imageId)
          if (tileInfo) {
            makePrediction(tileInfo, 1)
          } else {
            break
          }
        }
        
      }
      break

    case 'getPreviousPreds':
      // Get the prediction file for the WSI if it exists and load it into IndexedDB, otherwise
      // create a new file and add to the WSI metadata.
      annotationId = data.body.annotationId
      imageId = data.body.imageData.imageId
      const { modelId } = data.body
      const { wsiPredsFiles } = data.body.imageData
      const datasetConfig = data.body.datasetConfig

      const { clearWSIDataFromIndexedDB, getPredsFromBox } = await import(modelWorkerUtilsScriptPath)

      clearWSIDataFromIndexedDB()
      const predsToInsert = []
      const { previousPredictions, ...otherChanges } = await getPredsFromBox(imageId, annotationId, modelId, datasetConfig, wsiPredsFiles)
      const positiveLabel = data.body.positiveLabel || datasetConfig.annotations.find(annot => annot.annotationId === annotationId).labels[0]
      previousPredictions
      // .sort((a, b) => b.prediction.find(({label}) => label === positiveLabel.displayText).prob - a.prediction.find(({label}) => label === positiveLabel.displayText).prob)
      .forEach(pred => {
        const { label: predictedLabel, prob: predictionScore } = pred.prediction.reduce((max, current) => current.prob > max.prob ? current : max, {prob: 0})
        const predictionForIDB = {
          ...pred,
          predictedLabel,
          predictionScore
        }
        predsToInsert.push(predictionForIDB)
      })
      insertWSIDataToIndexedDB(predsToInsert, annotationId)

      postMessage({
        op,
        'body': {
          imageId,
          annotationId,
          modelId,
          ...otherChanges,
          'success': true
        }
      })
      break
      
    case 'stop':
      annotationId = data.body.annotationId
      stopPreds = true
      postMessage({
        op,
        'body': {
          'success': true,
          "message": "Workers Stopped"
        }
      })
  }
  // const tmaImage = tf.tensor3d(evt.data)
  // postMessage(pred)
}
loadLocalModel()