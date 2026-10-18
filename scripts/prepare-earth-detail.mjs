import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Original NASA 8192x4096 pixels, converted to JPEG without upscaling.
// Bundled in text parts so clean builds need no external image service.
const target = new URL('../public/assets/earth-detail.jpg', import.meta.url),
  manifest = JSON.parse(fs.readFileSync(new URL('../packed/earth-detail.json', import.meta.url))),
  valid = (bytes) =>
    bytes.length === manifest.bytes &&
    createHash('sha256').update(bytes).digest('hex') === manifest.sha256;
if (!fs.existsSync(target) || !valid(fs.readFileSync(target))) {
  const encoded = manifest.parts
      .map((part) => fs.readFileSync(new URL('../' + part, import.meta.url), 'utf8'))
      .join(''),
    bytes = Buffer.from(encoded, 'base64');
  if (!valid(bytes)) throw Error('Bundled Earth detail texture checksum mismatch');
  fs.writeFileSync(target, bytes);
}
console.log('Prepared bundled 8192x4096 Earth detail texture');
