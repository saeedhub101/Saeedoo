import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Invalid package version "${version}". Expected MAJOR.MINOR.PATCH.`);
}

console.log(`Version OK: ${version}`);
