import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export interface LoadedSaeedModel {
  scene: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: THREE.AnimationClip[];
}

export class SaeedModelLoader {
  async load(url: string): Promise<LoadedSaeedModel> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(url);
    const scene = gltf.scene;
    scene.rotation.y = Math.PI;
    return {
      scene,
      mixer: new THREE.AnimationMixer(scene),
      clips: gltf.animations,
    };
  }
}
