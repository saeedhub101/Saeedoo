// Sprite-asset integrity guard. The #1 cause of "Merlin never appeared after
// install" is the clippyjs character assets going missing from the shipped
// build (they're gitignored and fetched at build time via prepare-merlin-
// assets.mjs). clippyjs swallows a load failure silently, so a missing asset
// looks identical to a working app until a real user installs it.
//
// This script asserts every character has its four required files, that they
// are non-empty, and that each map.png is a real PNG. It runs at three points
// in the pipeline so a broken package can never be produced:
//
//   node scripts/verify-assets.mjs            # source  (src/renderer/public/agents)
//   node scripts/verify-assets.mjs --build    # build   (out/renderer/agents)
//   node scripts/verify-assets.mjs --package  # package (cracks dist asar)
//
// Exits non-zero with a precise message on the first failure.

import { stat, readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Canonical character set — MUST stay in sync with scripts/prepare-saeed-assets.mjs.
const CHARACTERS = [
  'Merlin',
  'Clippy',
  'Bonzi',
  'F1',
  'Genie',
  'Genius',
  'Links',
  'Peedy',
  'Rocky',
  'Rover',
];
// Merlin is the default character (store DEFAULTS.character) — if any single
// character must ship, it is this one. Checked explicitly below.
const DEFAULT_CHARACTER = 'Merlin';
const FILES = ['agent.js', 'map.png', 'sounds-mp3.js', 'sounds-ogg.js'];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_BYTES = { 'map.png': 1024, 'agent.js': 256, 'sounds-mp3.js': 16, 'sounds-ogg.js': 16 };

const errors = [];
const fail = (msg) => errors.push(msg);

function checkBuffer(character, name, buf) {
  const min = MIN_BYTES[name] ?? 1;
  if (!buf || buf.length < min) {
    fail(`${character}/${name}: ${buf ? buf.length : 0} bytes (< ${min} expected — corrupt/empty)`);
    return;
  }
  if (name === 'map.png' && !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail(`${character}/${name}: not a valid PNG (bad signature)`);
  }
}

// ---- source / build: real files on disk ------------------------------------

async function verifyDir(agentsRoot, label) {
  let topLevel;
  try {
    topLevel = await stat(agentsRoot);
  } catch {
    fail(`${label}: agents directory missing entirely: ${agentsRoot}`);
    return;
  }
  if (!topLevel.isDirectory()) {
    fail(`${label}: ${agentsRoot} is not a directory`);
    return;
  }
  for (const character of CHARACTERS) {
    for (const name of FILES) {
      const p = join(agentsRoot, character, name);
      try {
        const buf = await readFile(p);
        checkBuffer(character, name, buf);
      } catch {
        fail(`${label}: ${character}/${name} missing (${p})`);
      }
    }
  }
}

// ---- package: read files out of the shipped asar ---------------------------

async function verifyPackage() {
  const asarPath = join(ROOT, 'dist/win-unpacked/resources/app.asar');
  try {
    await stat(asarPath);
  } catch {
    fail(`package: app.asar not found at ${asarPath} (run electron-builder first)`);
    return;
  }
  let asar;
  try {
    asar = (await import('@electron/asar')).default ?? (await import('@electron/asar'));
  } catch {
    fail('package: @electron/asar not available to crack the package');
    return;
  }
  for (const character of CHARACTERS) {
    for (const name of FILES) {
      // electron-builder packs the `out/` tree, so paths inside the asar are
      // rooted at out/renderer/agents/... @electron/asar's extractFile expects
      // the build-OS path separator, so build it with join() (backslash on the
      // Windows build host, forward elsewhere).
      const inner = join('out', 'renderer', 'agents', character, name);
      try {
        const buf = asar.extractFile(asarPath, inner);
        checkBuffer(character, name, buf);
      } catch {
        fail(`package: ${inner} missing from app.asar`);
      }
    }
  }
}

// ---- driver ----------------------------------------------------------------

async function main() {
  const mode = process.argv.includes('--package')
    ? 'package'
    : process.argv.includes('--build')
      ? 'build'
      : 'source';

  console.log(`verify-assets: mode=${mode}`);

  if (mode === 'source') await verifyDir(join(ROOT, 'src/renderer/public/agents'), 'source');
  else if (mode === 'build') await verifyDir(join(ROOT, 'out/renderer/agents'), 'build');
  else await verifyPackage();

  // Hard guard: the default character must be intact regardless of mode, since
  // that's the one a fresh install renders first.
  const defaultErrs = errors.filter((e) => e.includes(`${DEFAULT_CHARACTER}/`));
  if (defaultErrs.length) {
    console.error(`\n  CRITICAL: default character "${DEFAULT_CHARACTER}" is broken — fresh installs will show NOTHING.`);
  }

  if (errors.length) {
    console.error(`\nverify-assets FAILED (${errors.length} problem(s)):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error('\nFix: run `npm run assets` (add --force to re-fetch), then rebuild.');
    process.exit(1);
  }

  console.log(`verify-assets OK: ${CHARACTERS.length} characters × ${FILES.length} files intact.`);
}

main().catch((err) => {
  console.error('verify-assets crashed:', err);
  process.exit(1);
});
