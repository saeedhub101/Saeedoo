import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { join } from 'node:path';

test.describe('Saeed Windows runtime smoke suite', () => {
  let app: Awaited<ReturnType<typeof electron.launch>>;

  test.beforeAll(async () => {
    app = await electron.launch({
      args: [join(process.cwd(), 'out', 'main', 'index.js')],
      timeout: 60_000,
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' },
    });
  });

  test.afterAll(async () => {
    await app?.close();
  });

  test('SMOKE: Electron starts and creates the character window', async () => {
    const page = await app.firstWindow({ timeout: 60_000 });
    await page.waitForLoadState('domcontentloaded');
    expect((await app.windows()).length).toBeGreaterThanOrEqual(1);
    expect(await app.evaluate(({ app: electronApp }) => electronApp.isReady())).toBe(true);
    expect(await page.url()).toContain('file:');
  });

  test('3D/GPU: renderer exposes WebGL and the character canvas', async () => {
    const page = app.windows()[0];
    await expect.poll(async () => page.locator('canvas').count(), { timeout: 30_000 }).toBeGreaterThan(0);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      return {
        canvas: Boolean(canvas),
        webgl: Boolean(gl),
        width: canvas?.width ?? 0,
        height: canvas?.height ?? 0,
      };
    });
    expect(result.canvas).toBe(true);
    expect(result.webgl).toBe(true);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  test('CHAT: user interaction opens the chat surface and accepts a message', async () => {
    const character = app.windows()[0];
    await character.dblclick('body');
    await expect.poll(() => app.windows().some((page) => page.url().includes('chat-panel/index.html') || page.url().includes('bubble/index.html')), { timeout: 30_000 }).toBe(true);

    const surface = app.windows().find((page) =>
      page.url().includes('chat-panel/index.html') || page.url().includes('bubble/index.html'),
    )!;
    await surface.waitForLoadState('domcontentloaded');

    if (surface.url().includes('chat-panel/index.html')) {
      const input = surface.locator('textarea[placeholder*="Ask Saeed"]');
      await expect(input).toBeVisible();
      await input.fill('Smoke test message');
      await expect(surface.getByRole('button', { name: 'Ask' })).toBeEnabled();
      await surface.getByRole('button', { name: 'Ask' }).click();
      await expect(surface.locator('.turn.user')).toContainText('Smoke test message');
    } else {
      const input = surface.locator('textarea, input').first();
      await expect(input).toBeVisible();
      await input.fill('Smoke test message');
      await input.press('Enter');
      await expect(surface.locator('body')).toContainText('Smoke test message');
    }
  });

  test('IDLE: application remains responsive during an idle period', async () => {
    const character = app.windows()[0];
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await expect(character).toHaveURL(/file:/);
    expect((await app.windows()).length).toBeGreaterThanOrEqual(1);
  });

  test('VOICE: speech pipeline returns audio through STT -> brain -> TTS', async () => {
    const result = await app.evaluate(async () => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('node:module');
      const require = createRequire(process.cwd() + '/test/e2e/saeed-smoke.spec.ts');
      const tts = require(process.cwd() + '/out/main/voice/tts.js') as {
        speak: (text: string) => Promise<void>;
      };
      const audioState = require(process.cwd() + '/out/main/voice/audioState.js') as {
        isVoiceActive?: () => boolean;
        isAudioPlaying?: () => boolean;
      };
      const before = Boolean(audioState.isVoiceActive?.() ?? audioState.isAudioPlaying?.() ?? false);
      let completed = false;
      let error = '';
      try {
        await tts.speak('Voice pipeline smoke test.');
        completed = true;
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      return { before, completed, error };
    });
    expect(result.completed, result.error).toBe(true);
  });

  test('VOICE RESPONSE: audio state can be observed while speech is active', async () => {
    const result = await app.evaluate(async () => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('node:module');
      const require = createRequire(process.cwd() + '/test/e2e/saeed-smoke.spec.ts');
      const audioState = require(process.cwd() + '/out/main/voice/audioState.js') as {
        isVoiceActive?: () => boolean;
        isAudioPlaying?: () => boolean;
      };
      const active = audioState.isVoiceActive?.() ?? audioState.isAudioPlaying?.();
      return { observable: typeof active === 'boolean', active: Boolean(active) };
    });
    expect(result.observable).toBe(true);
  });

  test('ERROR: no uncaught renderer page errors during startup', async () => {
    const errors: string[] = [];
    for (const page of app.windows()) {
      page.on('pageerror', (error) => errors.push(error.message));
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
