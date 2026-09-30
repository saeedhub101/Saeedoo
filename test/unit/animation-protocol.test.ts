import { describe, expect, it } from 'vitest';
import { StreamingAnimParser, stripAllTags } from '../../src/shared/animation-protocol';

describe('StreamingAnimParser', () => {
  it('parses animation, mood, and suggestion directives', () => {
    const parser = new StreamingAnimParser();
    const chunks = parser.push('Hello [anim:Wave] [feel:cheerful] [suggest:Open settings]');
    expect(chunks).toEqual([
      { type: 'text', value: 'Hello ' },
      { type: 'anim', name: 'Wave' },
      { type: 'text', value: ' ' },
      { type: 'feel', mood: 'cheerful' },
      { type: 'text', value: ' ' },
      { type: 'suggest', text: 'Open settings' },
    ]);
  });

  it('holds a split directive until the closing bracket arrives', () => {
    const parser = new StreamingAnimParser();
    expect(parser.push('Hello [ani')).toEqual([{ type: 'text', value: 'Hello ' }]);
    expect(parser.push('m:Wave]')).toEqual([{ type: 'anim', name: 'Wave' }]);
  });

  it('drops unknown animation directives instead of emitting invalid names', () => {
    const parser = new StreamingAnimParser();
    expect(parser.push('[anim:NotARealAnimation]hello')).toEqual([
      { type: 'text', value: 'hello' },
    ]);
  });
});

describe('stripAllTags', () => {
  it('removes supported inline directives', () => {
    expect(stripAllTags('Hi [anim:Wave][feel:happy][suggest:Open it]')).toBe('Hi ');
  });
});
