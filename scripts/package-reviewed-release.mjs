import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { RELEASE_ARCHIVE, packRelease, sha256, unpackRelease } from './release-archive.mjs';
import { verifyRelease } from './verify-release.mjs';

await verifyRelease();
const archive = path.resolve('build/' + RELEASE_ARCHIVE);
packRelease('build/release', archive);
await writeFile(archive + '.sha256', sha256(await readFile(archive)) + '\n');
const temporary = await mkdtemp(path.resolve('build/transport-test-'));
try {
  await unpackRelease(await readFile(archive), temporary);
  await verifyRelease({ root: temporary });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log('Packaged and round-trip verified the reviewed release without rebuilding it');
