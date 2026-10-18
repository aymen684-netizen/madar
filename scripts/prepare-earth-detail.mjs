import fs from 'node:fs';
import { createHash } from 'node:crypto';

// Build-only asset acquisition: browsers fetch the verified copy from Madar itself.
// Solar System Scope / INOVE, CC BY 4.0, based on NASA Blue Marble data.
const target = new URL('../public/assets/earth-detail.jpg', import.meta.url),
  source = 'https://www.solarsystemscope.com/textures/download/8k_earth_daymap.jpg',
  expected = '88ab060b6e7d241cfc590c69f528fab2b3247b738d40124cb590999a6fe44abc',
  valid = (bytes) => createHash('sha256').update(bytes).digest('hex') === expected;
if (!fs.existsSync(target) || !valid(fs.readFileSync(target))) {
  const response = await fetch(source, { signal: AbortSignal.timeout(45000) });
  if (!response.ok)
    throw Error('Could not prepare the optional 8K Earth texture: ' + response.status);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!valid(bytes)) throw Error('Optional Earth texture checksum mismatch');
  fs.writeFileSync(target, bytes);
}
console.log('Prepared verified 8192x4096 Earth detail texture (build only)');
