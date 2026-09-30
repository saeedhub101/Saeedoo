// Copy runtime-only assets beside the sprite page after electron-vite builds.
// Keeping the GLB as a real file avoids relying on bundler-specific public-asset behavior.

import { mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const source = join(ROOT, 'src', 'renderer', 'public', 'characters', 'Saeed.glb');
const destination = join(ROOT, 'out', 'renderer', 'characters', 'Saeed.glb');

await mkdir(join(ROOT, 'out', 'renderer', 'characters'), { recursive: true });
await copyFile(source, destination);
console.log('Copied Saeed.glb to', destination);
