import type { AnimationName } from './animations';

export interface CharacterController {
  show(): void;
  hide(): void;
  play(name: AnimationName): void;
  stop(): void;
  moveTo(x: number, y: number): Promise<void>;
  moveBy(dx: number, dy: number): void;
}
