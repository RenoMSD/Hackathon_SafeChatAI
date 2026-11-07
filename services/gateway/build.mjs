import { copyFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src', 'index.ts');
const DIST_DIR = join(ROOT, 'dist');
const DIST = join(DIST_DIR, 'index.ts');

if (existsSync(DIST_DIR)) rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });
copyFileSync(SRC, DIST);

console.log(`Built ${DIST}`);
