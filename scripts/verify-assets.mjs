// Saeed 3D asset integrity guard.
// The character system ships one authoritative GLB instead of 2D sprite packs.
// This check runs before and after packaging.

import { stat, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GLB_REL = 'renderer/public/characters/Saeed.glb';
const MIN_BYTES = 1024;

async function checkFile(path, label) {
  let buf;
  try { buf = await readFile(path); }
  catch { throw new Error(`${label}: missing: ${path}`); }
  if (buf.length < MIN_BYTES) throw new Error(`${label}: too small (${buf.length} bytes)`);
  if (buf.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error(`${label}: invalid GLB magic header`);
  }
  if (buf.readUInt32LE(4) !== 2) {
    throw new Error(`${label}: unsupported GLB version ${buf.readUInt32LE(4)}`);
  }
  console.log(`${label}: OK (${buf.length} bytes)`);
}

async function verifySource() {
  await checkFile(join(ROOT, 'src', GLB_REL), 'source');
}

async function verifyBuild() {
  await checkFile(join(ROOT, 'out', GLB_REL), 'build');
}

async function verifyPackage() {
  const asarPath = join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');
  try { await stat(asarPath); } catch {
    throw new Error(`package: app.asar not found: ${asarPath}`);
  }
  const asar = (await import('@electron/asar')).default ?? (await import('@electron/asar'));
  const inner = join('out', GLB_REL).replaceAll('\\\\', '/');
  const buf = asar.extractFile(asarPath, inner);
  if (!buf || buf.length < MIN_BYTES) throw new Error(`package: ${inner} missing or too small`);
  if (buf.subarray(0, 4).toString('ascii') !== 'glTF') throw new Error(`package: ${inner} is not a valid GLB`);
  console.log(`package: OK (${buf.length} bytes)`);
}

const mode = process.argv.includes('--package') ? 'package' : process.argv.includes('--build') ? 'build' : 'source';
if (mode === 'source') await verifySource();
else if (mode === 'build') await verifyBuild();
else await verifyPackage();
console.log(`verify-assets OK: mode=${mode}`);
