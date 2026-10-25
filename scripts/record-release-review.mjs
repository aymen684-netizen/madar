import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { verifyRelease } from './verify-release.mjs';

assert.equal(
  process.env.GITHUB_ACTIONS,
  'true',
  'Review records are produced by the CI release gate',
);
const { receipt } = await verifyRelease();
const needs = JSON.parse(process.env.MADAR_REVIEW_JOBS || '{}'),
  jobs = {};
for (const name of [
  'checks',
  'startup',
  'browser',
  'performance',
  'asset-update',
  'release-http',
]) {
  assert.equal(needs[name]?.result, 'success', 'Release review did not pass: ' + name);
  jobs[name] = needs[name].result;
}
const review = {
  schemaVersion: 1,
  repository: process.env.GITHUB_REPOSITORY,
  sourceSha: receipt.sourceSha,
  ref: process.env.GITHUB_REF,
  event: process.env.GITHUB_EVENT_NAME,
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  candidateArtifactId: needs.checks.outputs.release_artifact,
  receiptSha256: createHash('sha256')
    .update(await readFile('build/release/release.json'))
    .digest('hex'),
  jobs,
};
await writeFile('build/release/review.json', JSON.stringify(review, null, 2) + '\n');
await verifyRelease();
console.log('Recorded successful CI review for the unchanged candidate artifact');
