import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  RELEASE_REPOSITORY,
  RELEASE_ARCHIVE,
  releaseTag,
  sha256,
  unpackRelease,
} from './release-archive.mjs';
import { verifyRelease, verifyReviewedRelease } from './verify-release.mjs';

assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.GITHUB_REPOSITORY, RELEASE_REPOSITORY);
await verifyReviewedRelease({ inWorkflow: true });
const tag = releaseTag(
  process.env.GITHUB_SHA,
  process.env.GITHUB_RUN_ID,
  process.env.GITHUB_RUN_ATTEMPT,
);
const archivePath = path.resolve('build/' + RELEASE_ARCHIVE);
const checksum = sha256(await readFile(archivePath));
assert.equal((await readFile(archivePath + '.sha256', 'utf8')).trim(), checksum);
const temporary = await mkdtemp(path.resolve('build/published-release-test-'));
try {
  await unpackRelease(await readFile(archivePath), temporary);
  await verifyRelease({ root: temporary });
} finally {
  await rm(temporary, { recursive: true, force: true });
}
// Draft first: the public download becomes available only after both uploads finish.
execFileSync(
  'gh',
  [
    'release',
    'create',
    tag,
    archivePath,
    archivePath + '.sha256',
    '--repo',
    RELEASE_REPOSITORY,
    '--target',
    process.env.GITHUB_SHA,
    '--title',
    'Madar reviewed release ' + process.env.GITHUB_SHA.slice(0, 7),
    '--notes',
    'Frozen release reviewed in Actions run ' + process.env.GITHUB_RUN_ID + '.',
    '--draft',
  ],
  { stdio: 'inherit' },
);
execFileSync(
  'gh',
  ['release', 'edit', tag, '--repo', RELEASE_REPOSITORY, '--draft=false', '--latest=false'],
  { stdio: 'inherit' },
);
console.log('Published the verified archive and checksum under', tag);
