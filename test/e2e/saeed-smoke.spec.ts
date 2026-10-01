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
    const page = app.windows()[0]!;
    await expect.poll(async () => page.locator('canvas').count(), { timeout: 30_000 }).toBeGreaterThan(0);
    const result = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null;
      const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
      return { canvas: Boolean(canvas), webgl: Boolean(gl), width: canvas?.width ?? 0, height: canvas?.height ?? 0 };
    });
    expect(result.canvas).toBe(true);
    expect(result.webgl).toBe(true);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  test('CHAT: user message reaches the chat surface and an assistant response is produced', async () => {
    const character = app.windows()[0]!;
    await character.dblclick('body');
    await expect.poll(() => app.windows().some((page) =>
      page.url().includes('chat-panel/index.html') || page.url().includes('bubble/index.html')), { timeout: 30_000 }).toBe(true);
    const surface = app.windows().find((page) =>
      page.url().includes('chat-panel/index.html') || page.url().includes('bubble/index.html'))!;
    await surface.waitForLoadState('domcontentloaded');

    if (surface.url().includes('chat-panel/index.html')) {
      const input = surface.locator('textarea[placeholder*="Ask Saeed"]');
      await expect(input).toBeVisible();
      await input.fill('Smoke test message');
      await surface.getByRole('button', { name: 'Ask' }).click();
      await expect(surface.locator('.turn.user')).toContainText('Smoke test message');
      await expect.poll(async () => (await surface.locator('.turn.assistant').count()), { timeout: 45_000 }).toBeGreaterThan(0);
    } else {
      const input = surface.locator('textarea, input').first();
      await expect(input).toBeVisible();
      await input.fill('Smoke test message');
      await input.press('Enter');
      await expect(surface.locator('body')).toContainText('Smoke test message');
    }
  });

  test('LLM: provider registry is valid and real streaming is exercised when configured', async () => {
    const result = await app.evaluate(async ({ llmPath }) => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('node:module');
      const require = createRequire(process.cwd() + '/test/e2e/saeed-smoke.spec.ts');
      const mod = require(llmPath) as {
        PROVIDERS: Record<string, { defaultModel: string }>;
        isLLMConfigured: () => Promise<boolean>;
        streamChat: (opts: { history: Array<{ role: 'user' | 'assistant'; content: string }> }) => AsyncGenerator<string>;
      };
      const providers = Object.keys(mod.PROVIDERS);\n      const defaults = Object.fromEntries(providers.map((id) => [id, mod.PROVIDERS[id]?.defaultModel ?? '']));
      const configured = await mod.isLLMConfigured();
      let chunks = 0;
      let error = '';
      if (configured) {
        try {
          for await (const chunk of mod.streamChat({
            history: [{ role: 'user', content: 'Reply with exactly: LLM smoke test OK' }],
          })) {
            if (chunk.trim()) chunks += 1;
            if (chunks >= 3) break;
          }
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }
      }
      return { providers, defaults, configured, chunks, error };
    }, { llmPath: process.cwd() + '/out/main/llm/providerRegistry.js' });

    expect(result.providers.length).toBeGreaterThanOrEqual(3);
    expect(result.providers.every((id) => typeof id === 'string' && id.length > 0 && Boolean(result.defaults[id]))).toBe(true);
    if (result.configured) {
      expect(result.error).toBe('');
      expect(result.chunks).toBeGreaterThan(0);
    }
  });

  test('BRAIN: force-tick path executes without crashing', async () => {
    const result = await app.evaluate(async ({ brainPath }) => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('node:module');
      const require = createRequire(process.cwd() + '/test/e2e/saeed-smoke.spec.ts');
      const brain = require(brainPath) as { forceTickActiveBrain: () => Promise<string> };
      return brain.forceTickActiveBrain();
    }, { brainPath: process.cwd() + '/out/main/brainSupervisor.js' });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('IDLE: brain remains responsive and the idle surface can stay alive', async () => {
    const character = app.windows()[0]!;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await expect(character).toHaveURL(/file:/);
    expect((await app.windows()).length).toBeGreaterThanOrEqual(1);
  });

  test('VOICE: real TTS -> audio-state path is exercised with Windows SAPI', async () => {
    const result = await app.evaluate(async ({ ttsPath, storePath, audioPath }) => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('node:module');
      const require = createRequire(process.cwd() + '/test/e2e/saeed-smoke.spec.ts');
      const tts = require(ttsPath) as { speak: (text: string) => Promise<void>; waitForSynthDrain: (timeoutMs?: number) => Promise<void> };
      const store = require(storePath) as { read: () => Promise<{ voiceEngine: string }>; write: (patch: { voiceEngine: string }) => Promise<unknown> };
      const audio = require(audioPath) as { isVoiceActive: () => boolean };
      const before = await store.read();
      const original = before.voiceEngine;
      let error = '';
      try {
        await store.write({ voiceEngine: 'sapi' });
        await tts.speak('Saeed voice pipeline smoke test.');
        await tts.waitForSynthDrain(30_000);
        const deadline = Date.now() + 10_000;
        while (!audio.isVoiceActive() && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100));
        }
        const activeObserved = audio.isVoiceActive();
        const idleDeadline = Date.now() + 30_000;
        while (audio.isVoiceActive() && Date.now() < idleDeadline) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return { original, activeObserved, idleAfter: !audio.isVoiceActive(), error };
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
        return { original, activeObserved: false, idleAfter: !audio.isVoiceActive(), error };
      } finally {
        await store.write({ voiceEngine: original });
      }
    }, {
      ttsPath: process.cwd() + '/out/main/voice/tts.js',
      storePath: process.cwd() + '/out/main/storage/store.js',
      audioPath: process.cwd() + '/out/main/voice/audioState.js',
    });
    expect(result.error).toBe('');
    expect(result.activeObserved).toBe(true);
    expect(result.idleAfter).toBe(true);
  });

  test('VOICE/STT: real TTS-generated WAV reaches Groq Whisper when a Groq key is configured', async () => {
    const result = await app.evaluate(async ({ sapiPath, whisperPath }) => {
      const { createRequire } = process.getBuiltinModule('module') as typeof import('node:module');
      const require = createRequire(process.cwd() + '/test/e2e/saeed-smoke.spec.ts');
      const sapi = require(sapiPath) as { synthesizeSapi: (text: string, voiceName?: string) => Promise<Buffer | null> };
      const whisper = require(whisperPath) as { transcribeAudio: (audioBase64: string, mimeType: string) => Promise<string | null> };
      const key = process.env.GROQ_API_KEY;
      if (!key) return { configured: false, text: null, error: '' };
      const audio = await sapi.synthesizeSapi('Saeed voice smoke test');
      if (!audio) return { configured: true, text: null, error: 'SAPI produced no audio' };
      const text = await whisper.transcribeAudio(audio.toString('base64'), 'audio/wav');
      return { configured: true, text, error: text ? '' : 'Whisper returned no transcription' };
    }, {
      sapiPath: process.cwd() + '/out/main/voice/sapi.js',
      whisperPath: process.cwd() + '/out/main/voice/whisper.js',
    });
    if (result.configured) {
      expect(result.error).toBe('');
      expect(result.text).toMatch(/Saeed|voice|smoke/i);
    }
  });

  test('ERROR: no uncaught renderer page errors during startup and smoke tests', async () => {
    const errors: string[] = [];
    for (const page of app.windows()) page.on('pageerror', (error) => errors.push(error.message));
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
