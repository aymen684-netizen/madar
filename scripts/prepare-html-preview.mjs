import assert from 'node:assert/strict';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssetManifest } from './fingerprint-assets.mjs';

export function fingerprintHtml(html, manifest) {
  const references = [];
  function rewriteTag(tag) {
    return tag.replace(
      /(\s+)([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"'<>`]+)/g,
      (attribute, space, name, equals, quoted) => {
        if (!['src', 'href'].includes(name.toLowerCase())) return attribute;
        const quote = /^["']/.test(quoted) ? quoted[0] : '',
          value = quote ? quoted.slice(1, -1) : quoted;
        if (!value || /^(?:#|\/\/|[a-z][a-z\d+.-]*:)/i.test(value)) return attribute;
        const url = new URL(value, 'https://madar-build.invalid/__page__/');
        if (url.origin !== 'https://madar-build.invalid') return attribute;
        const absolute = value.startsWith('/');
        if (!absolute && !url.pathname.startsWith('/__page__/'))
          throw new Error('Asset outside page directory: ' + value);
        const asset = decodeURIComponent(url.pathname.slice(absolute ? 1 : '/__page__/'.length));
        // Navigation routes and HTML documents are not asset references.
        if (!asset || url.pathname.endsWith('/') || asset.endsWith('.html')) return attribute;
        if (!Object.hasOwn(manifest.assets, asset)) {
          if (name.toLowerCase() === 'src' || /\.[a-z\d]+$/i.test(asset))
            throw new Error('Missing HTML asset: ' + value);
          return attribute;
        }
        if (value.startsWith('../') || value.includes('/../'))
          throw new Error('Asset outside page directory: ' + value);
        const entries = [...url.searchParams];
        if (entries.length > 1 || (entries.length === 1 && entries[0][0] !== 'v'))
          throw new Error('Unexpected asset query: ' + value);
        const { sha256 } = manifest.assets[asset];
        assert.match(sha256, /^[a-f0-9]{64}$/, 'Invalid asset fingerprint: ' + asset);
        const target = value.split(/[?#]/, 1)[0] + '?v=' + sha256 + url.hash;
        references.push({ attribute: name.toLowerCase(), source: value, target, asset });
        const outputQuote = quote || '"';
        return space + name + equals + outputQuote + target + outputQuote;
      },
    );
  }
  // Preserve comments and raw-text contents, including literal HTML in scripts.
  const tags =
    /<!--[\s\S]*?-->|(<(script|style|textarea|title)\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/\2\s*>)|<[a-z][\w:-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  const output = html.replace(tags, (token, opening, rawTag, body, closing) => {
    if (token.startsWith('<!--')) return token;
    return opening ? rewriteTag(opening) + body + closing : rewriteTag(token);
  });
  return { html: output, references };
}

export async function prepareHtmlPreview(root, output, manifest) {
  root = path.resolve(root);
  output = path.resolve(output);
  const contains = (parent, child) => {
    const relative = path.relative(parent, child);
    return (
      !relative ||
      (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
    );
  };
  assert(!contains(root, output) && !contains(output, root), 'Preview and source must be separate');
  assert.deepEqual(await createAssetManifest(root), manifest, 'Asset manifest is stale');
  const source = await readFile(path.join(root, 'index.html'), 'utf8');
  const result = fingerprintHtml(source, manifest);
  await mkdir(path.dirname(output), { recursive: true });
  await rm(output, { recursive: true, force: true });
  await cp(root, output, { recursive: true });
  await writeFile(path.join(output, 'index.html'), result.html);
  return { references: result.references, manifest: await createAssetManifest(output) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../public/', import.meta.url));
  const output = fileURLToPath(new URL('../build/html-preview/', import.meta.url));
  const manifest = JSON.parse(
    await readFile(new URL('../build/asset-manifest.json', import.meta.url)),
  );
  const result = await prepareHtmlPreview(root, output, manifest);
  for (const [name, value] of [
    ['html-preview-report.json', { schemaVersion: 1, references: result.references }],
    ['html-preview-manifest.json', result.manifest],
  ])
    await writeFile(
      new URL('../build/' + name, import.meta.url),
      JSON.stringify(value, null, 2) + '\n',
    );
  console.log('Previewed', result.references.length, 'HTML asset references with SHA-256 versions');
}
