import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const auditRoot = path.join(root, 'tools/vendor-audit');
const lock = JSON.parse(await readFile(path.join(auditRoot, 'package-lock.json'), 'utf8'));
const declared = JSON.parse(await readFile(path.join(auditRoot, 'package.json'), 'utf8'));
const hashes = JSON.parse(await readFile(path.join(auditRoot, 'shipped-bundles.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const targets = [
  {
    name: 'docx',
    upstream: 'dist/index.umd.cjs',
    shipped: 'public/vendor/docx.js',
  },
  {
    name: 'satellite.js',
    upstream: 'dist/satellite.min.js',
    shipped: 'public/vendor/satellite.min.js',
  },
];
let mismatches = 0;
for (const target of targets) {
  const pkgRoot = path.join(auditRoot, 'node_modules', target.name);
  const pkg = JSON.parse(await readFile(path.join(pkgRoot, 'package.json'), 'utf8'));
  const version = declared.dependencies[target.name];
  const locked = lock.packages['node_modules/' + target.name];
  const pinned = hashes.bundles.find((item) => item.package === target.name);
  assert(pinned, 'Missing shipped provenance record: ' + target.name);
  assert.equal(pkg.version, version, 'Installed npm package version mismatch: ' + target.name);
  assert.equal(locked.version, version, 'Locked npm version mismatch: ' + target.name);
  assert.equal(pinned.declaredVersion, version, 'Audit-declared version mismatch: ' + target.name);
  assert.match(locked.integrity || '', /^sha512-/, 'Missing upstream npm tarball integrity');
  const [upstream, shipped] = await Promise.all([
    readFile(path.join(pkgRoot, target.upstream)),
    readFile(path.join(root, target.shipped)),
  ]);
  const upstreamHash = sha256(upstream);
  const shippedHash = sha256(shipped);
  assert.equal(shippedHash, pinned.sha256, 'Tracked shipped SHA-256 mismatch: ' + target.name);
  const identical = upstream.equals(shipped);
  console.log(
    JSON.stringify({
      package: target.name,
      version,
      upstreamPath: target.upstream,
      upstreamBytes: upstream.length,
      upstreamSha256: upstreamHash,
      shippedBytes: shipped.length,
      shippedSha256: shippedHash,
      byteIdentical: identical,
    }),
  );
  if (!identical) mismatches++;
}
assert.equal(mismatches, 0, 'Upstream npm distribution and shipped vendor bytes differ');
