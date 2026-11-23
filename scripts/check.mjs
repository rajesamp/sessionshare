import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('..', import.meta.url));
const files = ['server.mjs', ...['src', 'scripts', 'test', 'public'].flatMap(dir => readdirSync(resolve(root, dir)).filter(f => /\.(m?js)$/.test(f)).map(f => `${dir}/${f}`))];
for (const file of files) { const result = spawnSync(process.execPath, ['--check', resolve(root, file)], { encoding: 'utf8' }); if (result.status) { console.error(result.stderr); process.exit(result.status || 1); } }
console.log(`Syntax checked ${files.length} JavaScript modules.`);
