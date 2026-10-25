import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsers } from 'prettier/plugins/acorn';
import { createAssetManifest } from './fingerprint-assets.mjs';
import { fingerprintHtml } from './prepare-html-preview.mjs';

// Parse JavaScript rather than replacing text in comments, regexes or HTML templates.
export async function javascriptAssets(source, assets, from) {
  const ast = await parsers.acorn.parse(source);
  const references = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Literal' && typeof node.value === 'string') {
      const value = node.value;
      if (!/^(?:#|\/\/|[a-z][a-z\d+.-]*:)/i.test(value)) {
        const asset = value.split(/[?#]/, 1)[0];
        if (Object.hasOwn(assets, asset)) {
          const url = new URL(value, 'https://madar-build.invalid/');
          const entries = [...url.searchParams];
          assert(
            !url.hash && (entries.length === 0 || (entries.length === 1 && entries[0][0] === 'v')),
            'Unexpected JavaScript asset query: ' + from + ': ' + value,
          );
          references.push({ start: node.start, end: node.end, source: value, asset });
        } else if (/\?v=\d+$/.test(value)) {
          throw Error('Unresolved JavaScript asset: ' + from + ': ' + value);
        }
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['comments', 'tokens', 'loc', 'range'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return references.sort((a, b) => a.start - b.start);
}

export async function prepareRuntimePreview(root, output, manifest) {
  root = path.resolve(root);
  output = path.resolve(output);
  const contains = (a, b) => {
    const relative = path.relative(a, b);
    return (
      !relative ||
      (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
    );
  };
  assert(!contains(root, output) && !contains(output, root), 'Preview and source must be separate');
  assert.deepEqual(await createAssetManifest(root), manifest, 'Asset manifest is stale');
  const assets = structuredClone(manifest.assets),
    sources = new Map(),
    dependencies = new Map(),
    references = [],
    complete = new Set(),
    visiting = new Set();
  for (const name of Object.keys(assets)) {
    // Vendor bytes and the resource allowlist are data, not authored URL expressions.
    if (!name.endsWith('.js') || name.startsWith('vendor/') || name === 'network-resources.js')
      continue;
    const source = await readFile(path.join(root, name), 'utf8');
    sources.set(name, source);
    dependencies.set(name, await javascriptAssets(source, assets, name));
  }
  // Dynamic flags and backup catalogs use a leaf-only map. Code never points to a
  // map containing its own digest, so no self-hash or fixed-point calculation exists.
  const config = JSON.parse(
    (await readFile(path.join(root, 'network-resources.js'), 'utf8'))
      .replace(/^globalThis\.MadarNetworkResources=/, '')
      .trim()
      .replace(/;$/, ''),
  );
  config.versions = Object.fromEntries(
    Object.entries(assets)
      .filter(([name]) => /^(?:assets\/flags\/[a-z]{2}\.png|data\/[^/]+\.txt)$/.test(name))
      .map(([name, entry]) => [name, entry.sha256]),
  );
  const outputs = new Map([
    ['network-resources.js', 'globalThis.MadarNetworkResources=' + JSON.stringify(config) + ';\n'],
  ]);
  function record(name, source) {
    const bytes = Buffer.from(source);
    outputs.set(name, source);
    assets[name] = {
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
    };
  }
  record('network-resources.js', outputs.get('network-resources.js'));
  function resolve(name) {
    if (complete.has(name) || !sources.has(name)) return;
    assert(!visiting.has(name), 'Asset dependency cycle: ' + [...visiting, name].join(' -> '));
    visiting.add(name);
    const edits = dependencies.get(name);
    for (const reference of edits) resolve(reference.asset);
    let source = sources.get(name);
    for (const reference of [...edits].reverse()) {
      const target = reference.asset + '?v=' + assets[reference.asset].sha256;
      source =
        source.slice(0, reference.start) + JSON.stringify(target) + source.slice(reference.end);
      references.push({ from: name, source: reference.source, target, asset: reference.asset });
    }
    assert(!/\?v=\d+(?:['"`])/.test(source), 'Unresolved manual version in ' + name);
    record(name, source);
    visiting.delete(name);
    complete.add(name);
  }
  for (const name of sources.keys()) resolve(name);
  const html = fingerprintHtml(await readFile(path.join(root, 'index.html'), 'utf8'), { assets });
  record('index.html', html.html);
  references.push(...html.references.map((reference) => ({ from: 'index.html', ...reference })));
  // Resolve and validate everything before replacing the previous output.
  await mkdir(path.dirname(output), { recursive: true });
  await rm(output, { recursive: true, force: true });
  await cp(root, output, { recursive: true });
  for (const [name, source] of outputs) await writeFile(path.join(output, name), source);
  references.sort((a, b) =>
    (a.from + '\0' + a.target).localeCompare(b.from + '\0' + b.target, 'en'),
  );
  return {
    manifest: await createAssetManifest(output),
    references,
    dynamicVersions: config.versions,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await prepareRuntimePreview(
    fileURLToPath(new URL('../public/', import.meta.url)),
    fileURLToPath(new URL('../build/runtime-preview/', import.meta.url)),
    JSON.parse(await readFile(new URL('../build/asset-manifest.json', import.meta.url))),
  );
  for (const [name, value] of [
    ['runtime-preview-manifest.json', result.manifest],
    [
      'runtime-preview-report.json',
      { schemaVersion: 1, references: result.references, dynamicVersions: result.dynamicVersions },
    ],
  ])
    await writeFile(
      new URL('../build/' + name, import.meta.url),
      JSON.stringify(value, null, 2) + '\n',
    );
  console.log(
    'Previewed',
    result.references.length,
    'HTML/JavaScript references and',
    Object.keys(result.dynamicVersions).length,
    'dynamic leaf URLs',
  );
}
