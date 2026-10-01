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

  test('CHAT: chat panel opens and accepts a user message', async () => {
    await app.evaluate(() => {
      // Test-only access to the existing window module; no production API is changed.
      const { createRequire } = process.getBuiltinModule('module') as typeof import('node:module');
      const require = createRequire(process.cwd() + '/test/e2e/saeed-smoke.spec.ts');
      const panel = require(process.cwd() + '/out/main/windows/chatPanelWindow.js') as { showChatPanel: () => void };
      panel.showChatPanel();
    });
    await expect.poll(() => app.windows().some((page) => page.url().includes('chat-panel/index.html')), { timeout: 30_000 }).toBe(true);
    const panel = app.windows().find((page) => page.url().includes('chat-panel/index.html'))!;
    await panel.waitForLoadState('domcontentloaded');
    const input = panel.locator('textarea[placeholder*="Ask Saeed"]');
    await expect(input).toBeVisible();
    await input.fill('Smoke test message');
    await expect(panel.getByRole('button', { name: 'Ask' })).toBeEnabled();
    await panel.getByRole('button', { name: 'Ask' }).click();
    await expect(panel.locator('.turn.user')).toContainText('Smoke test message');
  });

  test('IDLE: autonomous thought pipeline can emit a thought without crashing', async () => {
    const emitted = await app.evaluate(async () => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('node:module');
      const require = createRequire(process.cwd() + '/test/e2e/saeed-smoke.spec.ts');
      const { buildBrainContext } = require(process.cwd() + '/out/main/brainControllers/context.js') as {
        buildBrainContext: () => { emitIdleThought: (text: string) => Promise<void> };
      };
      try {
        await buildBrainContext().emitIdleThought('Smoke test idle thought');
        return true;
      } catch {
        return false;
      }
    });
    expect(emitted).toBe(true);
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
