import { Injectable } from '@angular/core';
import * as faceapi from 'face-api.js';
import { Utils } from '../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class FaceRecService {

  constructor() {
    // this.initialize();
  }

  async initialize() {
    const MODEL_URL = '../assets/models/';
    await faceapi.loadSsdMobilenetv1Model(MODEL_URL + "ssd_mobilenetv1_model-weights_manifest.json");
    await faceapi.loadFaceLandmarkModel(MODEL_URL);
    await faceapi.loadFaceRecognitionModel(MODEL_URL);

    const image = new Image();
    image.src = "../../assets/test.jpeg";

    const fullFaceDescriptions = await faceapi.detectAllFaces(image).withFaceLandmarks().withFaceDescriptors();

    console.log(fullFaceDescriptions);

    const labels = ['matthias'];

    const labeledFaceDescriptors = await Promise.all(
      labels.map(async label => {
        // fetch image data from urls and convert blob to HTMLImage element
        const imgUrl = `../../assets/${label}.jpg`;
        const img = await faceapi.fetchImage(imgUrl)

        // detect the face with the highest score in the image and compute it's landmarks and face descriptor
        const fullFaceDescription = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()

        if (!fullFaceDescription) {
          throw new Error(`no faces detected for ${label}`)
        }

        const faceDescriptors = [fullFaceDescription.descriptor]
        return new faceapi.LabeledFaceDescriptors(label, faceDescriptors)
      })
    )

    console.log(labeledFaceDescriptors);

    const maxDescriptorDistance = 0.6
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, maxDescriptorDistance);

    const results = fullFaceDescriptions.map(fd => faceMatcher.findBestMatch(fd.descriptor));

    console.log(results);

    if (results[3].label === "matthias") {
      Utils.showToast("Matthias ist da");
    }
  }
}
