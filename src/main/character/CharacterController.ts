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
const HIDE_ANIMATION_MS = 2200;
const SHOW_ANIMATION_MS = 1500;

export const characterController = {
  async play(name: AnimationName): Promise<void> {
    const window = getSpriteWindow() ?? (await createSpriteWindow());
    window.webContents.send(IPC.spritePlay, name);
  },

  stop(): void {
    getSpriteWindow()?.webContents.send(IPC.spriteStop);
  },

  async show(): Promise<void> {
    const window = getSpriteWindow() ?? await createSpriteWindow();
    if (!window.isVisible()) window.show();
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    window.webContents.send(IPC.spritePlay, 'Show');
    await new Promise<void>((resolve) => setTimeout(resolve, SHOW_ANIMATION_MS));
  },

  async hide(): Promise<void> {
    const window = getSpriteWindow();
    if (!window || !window.isVisible()) return;
    window.webContents.send(IPC.spritePlay, 'Hide');
    await new Promise<void>((resolve) => setTimeout(resolve, HIDE_ANIMATION_MS));
    hideSprite();
  },

  async moveTo(x: number, y: number, durationMs = 900): Promise<void> {
    await smoothMoveSpriteTo(x, y, durationMs);
  },

  moveBy(dx: number, dy: number): void {
    moveSpriteBy(dx, dy);
  },
};
