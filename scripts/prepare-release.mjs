import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssetManifest } from './fingerprint-assets.mjs';
import { prepareRuntimePreview } from './prepare-runtime-preview.mjs';
import { releaseInputs, verifyRelease } from './verify-release.mjs';

export async function prepareRelease(project = process.cwd()) {
  const build = path.join(project, 'build'),
    root = path.join(build, 'release');
  await mkdir(build, { recursive: true });
  const config = JSON.parse(await readFile(path.join(project, 'wrangler.jsonc')));
  delete config.build;
  config.main = '../worker/index.js';
  config.no_bundle = false;
  config.assets.directory = '../public';
  await writeFile(path.join(build, 'bundle-config.json'), JSON.stringify(config, null, 2) + '\n');
  await rm(path.join(build, 'worker-build'), { recursive: true, force: true });
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(project, 'node_modules/wrangler/bin/wrangler.js'),
        'deploy',
        '--dry-run',
        '--config',
        path.join(build, 'bundle-config.json'),
        '--outdir',
        path.join(build, 'worker-build'),
      ],
      {
        cwd: project,
        stdio: 'inherit',
        env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
      },
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error('Worker bundling failed: ' + code)),
    );
  });
  await rm(root, { recursive: true, force: true });
  const result = await prepareRuntimePreview(
    path.join(project, 'public'),
    path.join(root, 'assets'),
    JSON.parse(await readFile(path.join(build, 'asset-manifest.json'))),
  );
  await mkdir(path.join(root, 'worker'));
  for (const name of ['index.js', 'index.js.map'])
    await copyFile(path.join(build, 'worker-build', name), path.join(root, 'worker', name));
  const candidateConfig = JSON.parse(await readFile(path.join(project, 'wrangler.jsonc')));
  delete candidateConfig.build;
  candidateConfig.main = './worker/index.js';
  candidateConfig.assets.directory = './assets';
  await writeFile(
    path.join(root, 'wrangler.dev.json'),
    JSON.stringify(candidateConfig, null, 2) + '\n',
  );
  await writeFile(
    path.join(root, 'asset-manifest.json'),
    JSON.stringify(result.manifest, null, 2) + '\n',
  );
  await writeFile(
    path.join(root, 'references.json'),
    JSON.stringify(
      { schemaVersion: 1, references: result.references, dynamicVersions: result.dynamicVersions },
      null,
      2,
    ) + '\n',
  );
  const receipt = {
    schemaVersion: 1,
    sourceSha: process.env.GITHUB_SHA || null,
    inputs: await releaseInputs(project),
    files: (await createAssetManifest(root)).assets,
  };
  await writeFile(path.join(root, 'release.json'), JSON.stringify(receipt, null, 2) + '\n');
  await verifyRelease({ root, project });
  console.log('Prepared frozen release: assets, prebuilt Worker, reference map and receipt');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await prepareRelease();
