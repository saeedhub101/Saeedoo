import * as THREE from 'three';
import type { AnimationName } from '@shared/animations';
import { SaeedAnimationController } from './AnimationController';
import { SaeedModelLoader, type LoadedSaeedModel } from './ModelLoader';

export class Saeed3DRenderer {
  private model: LoadedSaeedModel | null = null;
  private animation: SaeedAnimationController | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
  ) {}

  async load(url: string): Promise<string[]> {
    const loader = new SaeedModelLoader();
    this.model = await loader.load(url);
    this.scene.add(this.model.scene);
    this.fit();
    this.animation = new SaeedAnimationController(this.model);
    this.animation.startIdle();
    return this.model.clips.map((clip) => clip.name);
  }

  fit(): void {
    if (!this.model) return;
    const model = this.model.scene;
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model, true);
    const rawSize = box.getSize(new THREE.Vector3());
    const targetHeight = 3.75;
    const scale = targetHeight / Math.max(rawSize.y, 0.001);
    model.scale.setScalar(scale);
    model.updateWorldMatrix(true, true);

    const fitted = new THREE.Box3().setFromObject(model, true);
    const center = fitted.getCenter(new THREE.Vector3());
    model.position.x -= center.x;
    model.position.z -= center.z;
    model.position.y -= fitted.min.y;
    model.updateWorldMatrix(true, true);

    const finalBox = new THREE.Box3().setFromObject(model, true);
    const size = finalBox.getSize(new THREE.Vector3());
    const finalCenter = finalBox.getCenter(new THREE.Vector3());
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov) * this.camera.aspect);
    const verticalDistance = (size.y * 0.5) / Math.max(Math.tan(verticalFov), 0.001);
    const horizontalDistance = (size.x * 0.5) / Math.max(Math.tan(horizontalFov * 0.5), 0.001);
    const distance = Math.max(verticalDistance, horizontalDistance) * 1.04 + size.z * 0.5;
    this.camera.position.set(0, finalCenter.y, Math.max(distance, 2.5));
    this.camera.lookAt(0, finalCenter.y + size.y * 0.02, 0);
  }

  play(name: AnimationName, loop = false): boolean {
    return this.animation?.play(name, loop) ?? false;
  }

  stop(): void {
    this.animation?.stop();
  }

  update(delta: number): void {
    this.animation?.update(delta);
  }

  isAnimating(): boolean {
    return this.animation?.isAnimating() ?? false;
  }

  hasModel(): boolean {
    return this.model !== null;
  }

  getAnimations(): string[] {
    return this.model?.clips.map((clip) => clip.name) ?? [];
  }

  getRenderer(): THREE.WebGLRenderer {
    return this.renderer;
  }
}
