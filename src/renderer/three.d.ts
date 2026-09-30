declare module 'three' {
  export const LoopRepeat: number;
  export const LoopOnce: number;
  export const SRGBColorSpace: string;
  export const ACESFilmicToneMapping: number;

  export class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x?: number, y?: number, z?: number);
  }

  export class Object3D {
    position: Vector3;
    rotation: { x: number; y: number; z: number };
    scale: { setScalar(value: number): this };
    add(...objects: Object3D[]): this;
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
  }

  export class Group extends Object3D {}

  export class Scene extends Object3D {}

  export class Camera extends Object3D {
    lookAt(x: number, y: number, z: number): void;
  }

  export class PerspectiveCamera extends Camera {
    aspect: number;
    fov: number;
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    updateProjectionMatrix(): void;
  }

  export class WebGLRenderer {
    outputColorSpace: string;
    toneMapping: number;
    toneMappingExposure: number;
    constructor(parameters?: {
      canvas?: HTMLCanvasElement;
      alpha?: boolean;
      antialias?: boolean;
      powerPreference?: string;
      preserveDrawingBuffer?: boolean;
    });
    setPixelRatio(value: number): void;
    setClearColor(color: number, alpha?: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: Camera): void;
  }

  export class HemisphereLight extends Object3D {
    constructor(skyColor?: number, groundColor?: number, intensity?: number);
  }

  export class DirectionalLight extends Object3D {
    constructor(color?: number, intensity?: number);
  }

  export class AnimationClip {
    name: string;
  }

  export class AnimationAction {
    clampWhenFinished: boolean;
    reset(): this;
    setLoop(mode: number, repetitions: number): this;
    fadeIn(duration: number): this;
    fadeOut(duration: number): this;
    play(): this;
    isRunning(): boolean;
  }

  export class AnimationMixer {
    constructor(root: Object3D);
    clipAction(clip: AnimationClip): AnimationAction;
    stopAllAction(): this;
    update(delta: number): void;
  }

  export class Box3 {
    min: Vector3;
    constructor(min?: Vector3, max?: Vector3);
    setFromObject(object: Object3D, precise?: boolean): this;
    getSize(target: Vector3): Vector3;
    getCenter(target: Vector3): Vector3;
  }

  export const MathUtils: {
    degToRad(degrees: number): number;
  };
}

declare module 'three/addons/loaders/GLTFLoader.js' {
  import type { AnimationClip, Group } from 'three';

  export interface GLTF {
    scene: Group;
    animations: AnimationClip[];
  }

  export class GLTFLoader {
    loadAsync(url: string): Promise<GLTF>;
  }
}
