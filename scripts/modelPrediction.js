importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.0.1/dist/tf.min.js", "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-automl@1.0.0/dist/tf-automl.min.js")
models = {}

const loadLocalModel = async () => {

  // model = await tf.automl.loadImageClassification()
  // console.log("LOADED IN WORKER", model)
}

onmessage = async (evt) => {
  const { op, ...data } = evt
  console.log("Message received from main thread!")
  switch (op) {
    case 'loadModel':
      const { modelsConfig } = data
      modelsConfig.trainedModels.forEach(model => {
        
      })
      break;
  }
  const tmaImage = tf.tensor3d(evt.data)
  const pred = await model.classify(tmaImage)
  postMessage(pred)
}

loadLocalModel()