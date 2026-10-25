import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Hash the final bytes after all asset preparation steps. Keep the manifest
// outside public so it cannot hash itself or change the network allowlist.
export async function createAssetManifest(root) {
  root = root instanceof URL ? fileURLToPath(root) : root;
  const files = [];
  async function visit(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await visit(path.join(directory, entry.name), name + '/');
      else if (entry.isFile()) files.push(name);
      else throw new Error('Unsupported public asset: ' + name);
    }
  }
  await visit(root);
  const assets = [];
  for (const name of files.sort()) {
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(path.join(root, name))) {
      hash.update(chunk);
      bytes += chunk.length;
    }
    assets.push([name, { sha256: hash.digest('hex'), bytes }]);
  }
  return { schemaVersion: 1, algorithm: 'sha256', assets: Object.fromEntries(assets) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await createAssetManifest(new URL('../public/', import.meta.url));
  const output = new URL('../build/asset-manifest.json', import.meta.url);
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, JSON.stringify(manifest, null, 2) + '\n');
  console.log('Fingerprinted', Object.keys(manifest.assets).length, 'public files (SHA-256)');
}
