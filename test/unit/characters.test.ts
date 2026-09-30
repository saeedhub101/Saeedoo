import { describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from '../../src/shared/characters';

describe('Saeed character registry', () => {
  it('contains Saeed as the sole built-in visual identity', () => {
    expect(CHARACTERS).toHaveLength(1);
    expect(CHARACTERS[0]?.id).toBe('Saeed');
    expect(CHARACTERS[0]?.displayName).toBe('Saeed');
  });

  it('falls back to Saeed for an unknown character id', () => {
    expect(getCharacter('unknown').id).toBe('Saeed');
  });
});
