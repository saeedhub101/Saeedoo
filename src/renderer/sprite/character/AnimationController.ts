import * as THREE from 'three';
import type { AnimationName } from '@shared/animations';

export interface AnimationDriver {
  clips: THREE.AnimationClip[];
  mixer: THREE.AnimationMixer;
}

function baseName(name: string): string {
  const pipe = name.lastIndexOf('|');
  return pipe >= 0 ? name.slice(pipe + 1) : name;
}

export class SaeedAnimationController {
  private activeAction: THREE.AnimationAction | null = null;
  private idleAction: THREE.AnimationAction | null = null;

  constructor(private readonly driver: AnimationDriver) {}

  private findClip(name: string): THREE.AnimationClip | null {
    const exact = this.driver.clips.find((clip) => clip.name === name);
    if (exact) return exact;
    const lower = name.toLowerCase();
    return this.driver.clips.find((clip) => baseName(clip.name).toLowerCase() === lower) ?? null;
  }

  resolve(name: AnimationName): THREE.AnimationClip | null {
    if (name.startsWith('Move')) {
      return this.findClip('Walk') ?? this.findClip('Run');
    }
    if (name === 'Greet' || name === 'Wave' || name === 'GetAttention') {
      return this.findClip('Wave');
    }
    if (name === 'Hide' || name === 'Show') {
      return this.findClip('Idle');
    }
    return this.findClip('Idle') ?? this.driver.clips[0] ?? null;
  }

  startIdle(): void {
    const clip = this.findClip('Idle') ?? this.driver.clips[0];
    if (!clip) return;
    const action = this.driver.mixer.clipAction(clip);
    this.idleAction = action;
    this.activeAction = action;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
  }

  play(name: AnimationName, loop = false): boolean {
    const clip = this.resolve(name);
    if (!clip) return false;
    const action = this.driver.mixer.clipAction(clip);
    if (this.activeAction === action && action.isRunning()) return true;
    if (this.activeAction && this.activeAction !== action) this.activeAction.fadeOut(0.16);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.fadeIn(0.16).play();
    this.activeAction = action;
    return true;
  }

  stop(): void {
    this.driver.mixer.stopAllAction();
    if (this.idleAction) this.idleAction.reset().play();
    this.activeAction = this.idleAction;
  }

  update(delta: number): void {
    this.driver.mixer.update(delta);
    if (this.activeAction && !this.activeAction.isRunning() && this.activeAction !== this.idleAction) {
      if (this.idleAction) {
        this.idleAction.reset().fadeIn(0.18).play();
        this.activeAction = this.idleAction;
      }
    }
  }

  isAnimating(): boolean {
    return Boolean(this.activeAction?.isRunning() || this.activeAction === this.idleAction);
  }
}
