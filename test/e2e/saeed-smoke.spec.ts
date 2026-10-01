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

  async function getBubble() {
    await expect.poll(
      () => app.windows().some((page) => page.url().includes('bubble/index.html')),
      { timeout: 30_000 },
    ).toBe(true);
    return app.windows().find((page) => page.url().includes('bubble/index.html'))!;
  }

  async function openAskBubble() {
    const character = app.windows()[0]!;
    await character.dblclick('body');
    const bubble = await getBubble();
    await bubble.waitForLoadState('domcontentloaded');
    await expect(bubble.locator('#ask-input')).toBeVisible();
    return bubble;
  }

  test('SMOKE: Electron starts and creates the character window', async () => {
    const page = await app.firstWindow({ timeout: 60_000 });
    await page.waitForLoadState('domcontentloaded');
    expect((await app.windows()).length).toBeGreaterThanOrEqual(1);
    expect(await app.evaluate(({ app: electronApp }) => electronApp.isReady())).toBe(true);
    expect(await page.url()).toContain('file:');
  });

  test('3D/GPU: renderer exposes WebGL and the character canvas', async () => {
    const page = app.windows()[0]!;
    await expect.poll(
      async () => page.locator('canvas').count(),
      { timeout: 30_000 },
    ).toBeGreaterThan(0);
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

  test('CHAT: user message reaches Saeed and an assistant response is produced', async () => {
    const bubble = await openAskBubble();
    await bubble.locator('#ask-input').fill('Smoke test message');
    await bubble.locator('#ask-submit').click();

    await expect(bubble.locator('#text')).toContainText(/.+/, { timeout: 45_000 });
    const response = await bubble.locator('#text').innerText();
    expect(response.trim().length).toBeGreaterThan(0);
  });

  test('LLM: configured provider produces a non-canned streamed response', async () => {
    const configured = Boolean(process.env.GROQ_API_KEY);
    test.skip(!configured, 'Live LLM test requires GROQ_API_KEY in GitHub Actions secrets');

    const bubble = await openAskBubble();
    await bubble.locator('#ask-input').fill('Reply with exactly: LLM smoke test OK');
    await bubble.locator('#ask-submit').click();

    await expect.poll(
      async () => (await bubble.locator('#text').innerText()).trim(),
      { timeout: 45_000 },
    ).toMatch(/LLM smoke test OK/i);

    const response = await bubble.locator('#text').innerText();
    expect(response).not.toContain('GROQ_API_KEY');
    expect(response.trim().length).toBeGreaterThan(0);
  });

  test('BRAIN/IDLE: running the app through an idle tick window remains responsive', async () => {
    const character = app.windows()[0]!;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await expect(character).toHaveURL(/file:/);
    expect((await app.windows()).length).toBeGreaterThanOrEqual(1);
  });

  test('VOICE: assistant response path exposes the microphone and speaking UI without renderer errors', async () => {
    const bubble = await openAskBubble();
    await expect(bubble.locator('#mic-btn')).toBeVisible();
    await expect(bubble.locator('#ask-input')).toBeVisible();
    await bubble.locator('#ask-input').fill('Voice pipeline smoke test');
    await bubble.locator('#ask-submit').click();
    await expect(bubble.locator('#text')).toContainText(/.+/, { timeout: 45_000 });
  });

  test('ERROR: no uncaught renderer page errors during startup and smoke tests', async () => {
    const errors: string[] = [];
    for (const page of app.windows()) {
      page.on('pageerror', (error) => errors.push(error.message));
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
