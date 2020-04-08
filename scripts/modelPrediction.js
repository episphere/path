importScripts("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs", "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-automl")
model = {}

const loadLocalModel = async () => {
  model = await tf.automl.loadImageClassification("./model/covidModel/model.json")
  console.log("LOADED IN WORKER", model)
}

onmessage = async (evt) => {
  console.log("Message received from main thread!")
  const tmaImage = tf.tensor3d(evt.data)
  const pred = await model.classify(tmaImage)
  postMessage(pred)
}

loadLocalModel()