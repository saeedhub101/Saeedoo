import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('idle thought voice regression', () => {
  it('routes emitted idle thoughts through the existing TTS pipeline', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/main/brainControllers/context.ts'),
      'utf8',
    );
    expect(source).toContain("import { speak as ttsSpeak } from '../voice/tts';");
    expect(source).toContain('await ttsSpeak(text);');
  });
});
