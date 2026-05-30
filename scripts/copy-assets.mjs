#!/usr/bin/env node
/**
 * Copies the JSON clinical data from src/data into dist/data so the compiled
 * server can load it at runtime. tsc does not copy non-TS assets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'data');
const DEST = path.join(ROOT, 'dist', 'data');

fs.mkdirSync(DEST, { recursive: true });
let copied = 0;
for (const file of fs.readdirSync(SRC)) {
  if (file.endsWith('.json')) {
    fs.copyFileSync(path.join(SRC, file), path.join(DEST, file));
    copied++;
  }
}
console.log(`Copied ${copied} data file(s) to dist/data`);
