import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../public/', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('manifest.webmanifest', root)));
const sizes = {
  'madar-art-512-v76': 512,
  'madar-art-192-v76': 192,
  'madar-maskable-512-v76': 512,
  'apple-touch-icon-v76': 180,
  'madar-symbol-64-v76': 64,
  'favicon-32-v76': 32,
  'favicon-16-v76': 16,
};
let total = 0;
for (const [name, size] of Object.entries(sizes)) {
  const data = fs.readFileSync(new URL(`icons/${name}.png`, root));
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(data.readUInt32BE(16), size);
  assert.equal(data.readUInt32BE(20), size);
  assert(data.length < 180_000, `${name}: icon byte budget`);
  total += data.length;
}
assert(total < 400_000, 'all brand assets stay below 400 KB');
assert(html.includes('src="icons/madar-art-512-v76.png"'));
assert(html.includes('href="icons/favicon-16-v76.png"'));
assert(html.includes('href="icons/favicon-32-v76.png"'));
assert(html.includes('href="icons/apple-touch-icon-v76.png"'));
assert(!html.includes('src="madar-mark.svg"'));
assert(!/<video\b/.test(html.match(/<dialog id="welcome-dialog"[\s\S]*?<\/dialog>/)[0]));
for (const icon of manifest.icons) {
  assert(icon.src.includes('-v76.png'));
  assert(fs.existsSync(new URL(icon.src, root)));
  assert.equal(icon.type, 'image/png');
}
assert(manifest.icons.some((icon) => icon.purpose === 'maskable'));
console.log(
  `PASS: local static branding, PNG dimensions, install icons and byte budgets (${total} bytes)`,
);
