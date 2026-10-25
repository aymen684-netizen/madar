import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { verifyRelease, verifyReviewedRelease } from './verify-release.mjs';

test('release verification rejects changed/added/missing files, another commit and changed inputs', async () => {
  await verifyRelease();
  const temporary = await mkdtemp(path.resolve('build/release-test-'));
  const root = path.join(temporary, 'release');
  try {
    await cp('build/release', root, { recursive: true });
    const asset = path.join(root, 'assets/privacy.js'),
      original = await readFile(asset);
    await writeFile(asset, Buffer.concat([original, Buffer.from('\n// changed')]));
    await assert.rejects(verifyRelease({ root }), /Release bytes changed/);
    await writeFile(asset, original);
    const added = path.join(root, 'assets/unexpected.js');
    await writeFile(added, 'unexpected');
    await assert.rejects(verifyRelease({ root }), /Release bytes changed/);
    await rm(added);
    const worker = path.join(root, 'worker/index.js'),
      bundle = await readFile(worker);
    await rm(worker);
    await assert.rejects(verifyRelease({ root }), /Release bytes changed/);
    await writeFile(worker, bundle);
    await assert.rejects(verifyRelease({ root, expectedSha: 'another-commit' }), /another commit/);
    const receipt = JSON.parse(await readFile(path.join(root, 'release.json')));
    receipt.inputs['package.json'] = '0'.repeat(64);
    await writeFile(path.join(root, 'release.json'), JSON.stringify(receipt));
    await assert.rejects(verifyRelease({ root }), /Release inputs changed/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('production requires a matching main review and a successful run for the same commit', async () => {
  const temporary = await mkdtemp(path.resolve('build/review-test-'));
  const root = path.join(temporary, 'release');
  try {
    await cp('build/release', root, { recursive: true });
    await assert.rejects(verifyReviewedRelease({ root }), /ENOENT/);
    const sourceSha = '1'.repeat(40);
    const receipt = JSON.parse(await readFile(path.join(root, 'release.json')));
    receipt.sourceSha = sourceSha;
    const bytes = Buffer.from(JSON.stringify(receipt));
    await writeFile(path.join(root, 'release.json'), bytes);
    const review = {
      schemaVersion: 1,
      sourceSha,
      runId: '123',
      repository: 'aymen684-netizen/madar',
      event: 'push',
      ref: 'refs/heads/main',
      receiptSha256: createHash('sha256').update(bytes).digest('hex'),
      jobs: Object.fromEntries(
        ['checks', 'startup', 'browser', 'performance', 'asset-update', 'release-http'].map(
          (name) => [name, 'success'],
        ),
      ),
    };
    const save = () => writeFile(path.join(root, 'review.json'), JSON.stringify(review));
    await save();
    const run = {
      conclusion: 'success',
      head_sha: sourceSha,
      head_branch: 'main',
      repository: { full_name: review.repository },
      head_repository: { full_name: review.repository },
      path: '.github/workflows/review.yml',
      event: 'push',
    };
    const verify = (overrides = {}) =>
      verifyReviewedRelease({
        root,
        expectedSha: sourceSha,
        request: async () => new Response(JSON.stringify({ ...run, ...overrides })),
      });
    await verify();
    await assert.rejects(verify({ conclusion: 'failure' }), /has not succeeded/);
    await assert.rejects(verify({ head_sha: '2'.repeat(40) }), /another commit/);
    await assert.rejects(verify({ path: '.github/workflows/other.yml' }));
    review.ref = 'refs/pull/85/merge';
    await save();
    await assert.rejects(verify(), /Only a reviewed main release/);
    review.ref = 'refs/heads/main';
    review.jobs.browser = 'skipped';
    await save();
    await assert.rejects(verify(), /Incomplete release review/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
