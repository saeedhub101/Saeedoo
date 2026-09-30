import { IPC } from '@shared/ipc-contract';
import type { AnimationName } from '@shared/animations';
import {
  createSpriteWindow,
  getSpriteWindow,
  hideSprite,
  showSprite,
  smoothMoveSpriteTo,
  moveSpriteBy,
} from '../windows/spriteWindow';

/**
 * Main-process character boundary.
 *
 * Brain, tools and voice talk to this controller instead of knowing whether
 * the visual implementation is Clippy, Three.js, or another renderer.
 */
export const characterController = {
  async play(name: AnimationName): Promise<void> {
    const window = getSpriteWindow() ?? (await createSpriteWindow());
    window.webContents.send(IPC.spritePlay, name);
  },

  stop(): void {
    getSpriteWindow()?.webContents.send(IPC.spriteStop);
  },

  show(): void {
    showSprite();
  },

  hide(): void {
    hideSprite();
  },

  async moveTo(x: number, y: number, durationMs = 900): Promise<void> {
    await smoothMoveSpriteTo(x, y, durationMs);
  },

  moveBy(dx: number, dy: number): void {
    moveSpriteBy(dx, dy);
  },
};
