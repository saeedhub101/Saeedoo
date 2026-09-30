// Prepares the Saeed 3D runtime assets.
// The 2D Merlin/clippyjs sprite packs are no longer downloaded or packaged.
// The only character asset is the bundled Saeed GLB under
// src/renderer/public/characters/Saeed.glb.
//
// Run with: npm run assets
// Idempotent and offline-safe.

import { stat, readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Jimp from 'jimp';
import pngToIco from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ICON_PNG = join(ROOT, 'resources/icon.png');
const ICON_ICO = join(ROOT, 'resources/icon.ico');
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function buildIcons() {
  if (!(await exists(ICON_PNG))) {
    throw new Error('resources/icon.png is missing');
  }
  const mapBuf = await readFile(ICON_PNG);
  const image = await Jimp.read(mapBuf);
  const size = Math.min(image.bitmap.width, image.bitmap.height);
  const frame = image.clone().crop(0, 0, size, size);

  const png256 = await frame.clone()
    .resize(256, 256, Jimp.RESIZE_NEAREST_NEIGHBOR)
    .getBufferAsync(Jimp.MIME_PNG);
  await writeFile(ICON_PNG, png256);

  const buffers = [];
  for (const s of ICON_SIZES) {
    buffers.push(await frame.clone()
      .resize(s, s, Jimp.RESIZE_NEAREST_NEIGHBOR)
      .getBufferAsync(Jimp.MIME_PNG));
  }
  await writeFile(ICON_ICO, await pngToIco(buffers));
  console.log('Prepared Saeed 3D app icons.');
}

async function main() {
  const glb = join(ROOT, 'src/renderer/public/characters/Saeed.glb');
  if (!(await exists(glb))) throw new Error('Saeed.glb is missing: ' + glb);
  await buildIcons();
  console.log('Saeed 3D assets verified.');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
