const models = {
  loadModels: () => {
    if (path.predictionWorker && path.datasetConfig && path.datasetConfig.models && path.datasetConfig.models.trainedModels.length > 0) {
      path.predictionWorker.postMessage({
        "op": "loadModels", 
        "body": {
          "modelsConfig": path.datasetConfig.models
        }
      })
    }
  },

  populateAccordion: () => {
    
  }
}