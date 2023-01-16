import { Injectable } from '@angular/core';
import * as faceapi from 'face-api.js';
import { DEFAULT_IMAGE } from '../utilities/constants';
import { Person, Player } from '../utilities/interfaces';
import { Utils } from '../utilities/Utils';

@Injectable({
  providedIn: 'root'
})
export class FaceRecService {

  constructor() { }

  async initialize(players: Player[], conductors: Person[], imageUrl: string) {
    const MODEL_URL = "https://zukclqspndysemvvihjm.supabase.co/storage/v1/object/public/models/";
    await faceapi.loadSsdMobilenetv1Model(MODEL_URL);
    await faceapi.loadFaceLandmarkModel(MODEL_URL);
    await faceapi.loadFaceRecognitionModel(MODEL_URL);

    const image = new Image();
    image.src = imageUrl;
    image.crossOrigin = "anonymous";

    const fullFaceDescriptions = await faceapi.detectAllFaces(image).withFaceLandmarks().withFaceDescriptors();

    const labeledFaceDescriptors = await Promise.all(
      [...players, ...conductors].filter((player: Player) => player.img !== DEFAULT_IMAGE).map(async (player: Player) => {
        // fetch image data from urls and convert blob to HTMLImage element
        const img = await faceapi.fetchImage(player.img);

        // detect the face with the highest score in the image and compute it's landmarks and face descriptor
        const fullFaceDescription = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()

        if (!fullFaceDescription) {
          throw new Error(`no faces detected for ${player.firstName} ${player.lastName}`)
        }

        const faceDescriptors = [fullFaceDescription.descriptor]
        return new faceapi.LabeledFaceDescriptors(`${player.firstName} ${player.lastName}`, faceDescriptors)
      })
    )

    const maxDescriptorDistance = 0.6
    const faceMatcher = new faceapi.FaceMatcher(labeledFaceDescriptors, maxDescriptorDistance);

    return fullFaceDescriptions.map(fd => faceMatcher.findBestMatch(fd.descriptor));
  }
}
