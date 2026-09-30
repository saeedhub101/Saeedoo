import { app } from 'electron';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { CHARACTERS, type CharacterInfo } from '@shared/characters';
import { logger } from './logger';

// Custom characters are persona profiles only. The visual layer is always Saeed 3D.\n\nexport interface CustomCharacter extends CharacterInfo {
  /** Legacy field accepted for migration; it no longer selects a visual asset. */
  baseCharacter?: string;
  /** Marker so callers know this came from disk. */
  custom: true;
}

let cache: CustomCharacter[] | null = null;

function dir(): string {
  return join(app.getPath('userData'), 'characters');
}

async function readOne(path: string): Promise<CustomCharacter | null> {
  try {
    const txt = await fsp.readFile(path, 'utf-8');
    const raw = JSON.parse(txt) as Partial<CustomCharacter>;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
    const personaHint = typeof raw.personaHint === 'string' ? raw.personaHint.trim() : '';
    const baseCharacter = typeof raw.baseCharacter === 'string' ? raw.baseCharacter.trim() : undefined;
    if (!id || !displayName || !personaHint) {
      logger.warn('custom character missing required field, skipping:', path);
      return null;
    }
    return {
      id, displayName, personaHint,
      description: typeof raw.description === 'string' ? raw.description : displayName,
      ...(baseCharacter ? { baseCharacter } : {}),
      custom: true,
    };
  } catch (err) {
    logger.warn('failed to read custom character', path, err);
    return null;
  }
}

export async function loadCustomCharacters(): Promise<CustomCharacter[]> {
  try {
    await fsp.mkdir(dir(), { recursive: true });
    const entries = await fsp.readdir(dir());
    const files = entries.filter((e) => e.toLowerCase().endsWith('.json'));
    const out: CustomCharacter[] = [];
    for (const f of files) {
      const c = await readOne(join(dir(), f));
      if (c) out.push(c);
    }
    cache = out;
    logger.info('loaded', out.length, 'custom character(s)');
    return out;
  } catch (err) {
    logger.warn('loadCustomCharacters failed', err);
    cache = [];
    return [];
  }
}

export function getCustomCharacters(): CustomCharacter[] {
  return cache ? cache.slice() : [];
}

export function findCustomCharacter(id: string): CustomCharacter | null {
  return (cache ?? []).find((c) => c.id === id) ?? null;
}

/** Returns built-in + custom characters merged. Built-in entries first. */
export function getAllCharacters(): CharacterInfo[] {
  return [...CHARACTERS, ...(cache ?? [])];
}

/** Resolve the visual asset ID. Saeed is the only visual character. */
export function resolveSpriteId(_id: string): string {
  return 'Saeed';
}

/** Resolve a (possibly custom) character ID to its full persona info. */
export function resolveCharacter(id: string): CharacterInfo {
  const custom = findCustomCharacter(id);
  if (custom) return custom;
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0]!;
}

/** Absolute path of the characters folder (for "Open folder" UI). */
export function customCharactersDir(): string {
  return dir();
}
