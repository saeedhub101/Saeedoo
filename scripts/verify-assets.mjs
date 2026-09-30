// Saeed 3D asset integrity guard.
// The character system ships one authoritative GLB instead of 2D sprite packs.
// This check runs before and after packaging and validates the required clips.

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GLB_REL = 'renderer/public/characters/Saeed.glb';
const MIN_BYTES = 1024;
const REQUIRED_ANIMATIONS = ['Idle', 'Walk', 'Run', 'Wave'];

function parseGlb(buffer, label) {
  if (buffer.length < 20) throw new Error(`${label}: GLB header is truncated`);
  if (buffer.subarray(0, 4).toString('ascii') !== 'glTF') {
    throw new Error(`${label}: invalid GLB magic header`);
  }
  if (buffer.readUInt32LE(4) !== 2) {
    throw new Error(`${label}: unsupported GLB version ${buffer.readUInt32LE(4)}`);
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength > buffer.length) {
    throw new Error(`${label}: declared GLB length ${declaredLength} exceeds file size ${buffer.length}`);
  }

  const jsonChunkLength = buffer.readUInt32LE(12);
  const jsonChunkType = buffer.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a) {
    throw new Error(`${label}: first GLB chunk is not JSON`);
  }
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonChunkLength;
  if (jsonEnd > buffer.length) throw new Error(`${label}: JSON chunk is truncated`);

  let document;
  try {
    document = JSON.parse(buffer.subarray(jsonStart, jsonEnd).toString('utf8').trim());
  } catch (err) {
    throw new Error(`${label}: invalid GLB JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const names = Array.isArray(document.animations)
    ? document.animations
        .map((animation) => (animation && typeof animation.name === 'string' ? animation.name : ''))
        .filter(Boolean)
    : [];

  for (const required of REQUIRED_ANIMATIONS) {
    const found = names.some((name) => name === required || name.endsWith(`|${required}`));
    if (!found) throw new Error(`${label}: required animation "${required}" is missing`);
  }

  return names;
}

async function readGlb(path, label) {
  let buf;
  try {
    buf = await readFile(path);
  } catch {
    throw new Error(`${label}: missing: ${path}`);
  }
  if (buf.length < MIN_BYTES) throw new Error(`${label}: too small (${buf.length} bytes)`);
  const animations = parseGlb(buf, label);
  console.log(`${label}: OK (${buf.length} bytes; animations: ${animations.join(', ')})`);
  return buf;
}

async function verifySource() {
  await readGlb(join(ROOT, 'src', GLB_REL), 'source');
}

async function verifyBuild() {
  await readGlb(join(ROOT, 'out', GLB_REL), 'build');
}

async function verifyPackage() {
  const asarPath = join(ROOT, 'dist', 'win-unpacked', 'resources', 'app.asar');
  let stat;
  try {
    stat = await import('node:fs/promises').then(({ stat }) => stat(asarPath));
  } catch {
    throw new Error(`package: app.asar not found: ${asarPath}`);
  }
  if (stat.size < MIN_BYTES) throw new Error(`package: app.asar is unexpectedly small: ${stat.size} bytes`);

  const asar = (await import('@electron/asar')).default ?? (await import('@electron/asar'));
  const inner = join('out', GLB_REL).replaceAll('\\\\', '/');
  const buf = asar.extractFile(asarPath, inner);
  if (!buf || buf.length < MIN_BYTES) throw new Error(`package: ${inner} missing or too small`);
  const animations = parseGlb(buf, 'package');
  console.log(`package: OK (${buf.length} bytes; animations: ${animations.join(', ')})`);
}

const mode = process.argv.includes('--package') ? 'package' : process.argv.includes('--build') ? 'build' : 'source';
if (mode === 'source') await verifySource();
else if (mode === 'build') await verifyBuild();
else await verifyPackage();
console.log(`verify-assets OK: mode=${mode}`);
