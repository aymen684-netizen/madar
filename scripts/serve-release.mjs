import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { verifyRelease } from './verify-release.mjs';

await verifyRelease();
const config = JSON.parse(await readFile('build/release/wrangler.dev.json'));
config.main = './release/worker/index.js';
config.assets.directory = './release/assets';
await writeFile('build/dev-config.json', JSON.stringify(config, null, 2) + '\n');
if (!process.argv.includes('--prepare-only')) {
  const child = spawn(
    process.execPath,
    [
      'node_modules/wrangler/bin/wrangler.js',
      'dev',
      '--config',
      path.resolve('build/dev-config.json'),
      '--persist-to',
      path.resolve('build/dev-state'),
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
