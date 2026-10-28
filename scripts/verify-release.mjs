import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { githubReviewRetryMs, githubReviewDiagnostics } from './github-review-api.mjs';
import { createAssetManifest } from './fingerprint-assets.mjs';

export async function releaseInputs(project) {
  const names = execFileSync('git', ['ls-files', '-z'], { cwd: project })
    .toString()
    .split('\0')
    .filter((name) => name && !name.startsWith('docs/') && !name.endsWith('.md'));
  const inputs = {};
  for (const name of names)
    inputs[name] = createHash('sha256')
      .update(await readFile(path.join(project, name)))
      .digest('hex');
  return inputs;
}

export async function verifyRelease({
  root = 'build/release',
  project = '.',
  expectedSha = process.env.GITHUB_SHA,
} = {}) {
  root = path.resolve(root);
  project = path.resolve(project);
  const receipt = JSON.parse(await readFile(path.join(root, 'release.json')));
  assert.equal(receipt.schemaVersion, 1, 'Unknown release schema');
  if (expectedSha)
    assert.equal(receipt.sourceSha, expectedSha, 'Release belongs to another commit');
  const actual = await createAssetManifest(root);
  delete actual.assets['release.json'];
  delete actual.assets['review.json'];
  assert.deepEqual(
    actual.assets,
    receipt.files,
    'Release bytes changed, were added or are missing',
  );
  assert.deepEqual(
    await releaseInputs(project),
    receipt.inputs,
    'Release inputs changed; rebuild or check out its source commit',
  );
  const manifest = JSON.parse(await readFile(path.join(root, 'asset-manifest.json')));
  assert.deepEqual(
    await createAssetManifest(path.join(root, 'assets')),
    manifest,
    'Release asset map is stale',
  );
  const config = JSON.parse(await readFile(path.join(project, 'wrangler.jsonc')));
  assert.equal(config.main, 'build/release/worker/index.js');
  assert.equal(config.assets.directory, './build/release/assets');
  assert.equal(config.no_bundle, true);
  assert.equal(config.build.command, 'node scripts/verify-release.mjs --reviewed');
  return { receipt, manifest };
}

export async function verifyReviewedRelease(options = {}) {
  const result = await verifyRelease(options),
    root = path.resolve(options.root || 'build/release');
  const review = JSON.parse(await readFile(path.join(root, 'review.json')));
  const digest = createHash('sha256')
    .update(await readFile(path.join(root, 'release.json')))
    .digest('hex');
  assert.equal(review.receiptSha256, digest, 'Review belongs to another release receipt');
  assert.equal(
    review.sourceSha,
    result.receipt.sourceSha,
    'Review belongs to another source commit',
  );
  assert.equal(review.repository, 'aymen684-netizen/madar');
  assert.equal(review.ref, 'refs/heads/main', 'Only a reviewed main release is deployable');
  assert(
    ['push', 'workflow_dispatch'].includes(review.event),
    'Pull request releases are not deployable',
  );
  assert.match(String(review.runId), /^\d+$/);
  for (const name of [
    'checks',
    'startup',
    'browser',
    'performance',
    'asset-update',
    'release-http',
  ])
    assert.equal(review.jobs[name], 'success', 'Incomplete release review: ' + name);
  if (options.inWorkflow) {
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
    assert.equal(review.runId, process.env.GITHUB_RUN_ID);
    assert.equal(review.sourceSha, process.env.GITHUB_SHA);
    return result;
  }
  const request = options.request || fetch;
  const pause = options.pause || delay;
  const now = options.now || Date.now;
  const deadline = now() + (options.retryTimeoutMs ?? 3 * 60 * 1000);
  const url = 'https://api.github.com/repos/aymen684-netizen/madar/actions/runs/' + review.runId;
  let response,
    failures = 0;
  while (true) {
    response = await request(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN }
          : {}),
      },
      signal: AbortSignal.timeout(20000),
    });
    if (response.status === 200) break;
    const retryMs = await githubReviewRetryMs(response, failures, now()),
      diagnostic = githubReviewDiagnostics(response);
    if (retryMs === null) throw Error('Cannot verify the GitHub review run (' + diagnostic + ')');
    if (failures >= 2 || now() + retryMs >= deadline)
      throw Error('GitHub review retry budget/deadline exceeded (' + diagnostic + ')');
    failures++;
    console.warn(
      'Retrying GitHub review verification after',
      Math.ceil(retryMs / 1000),
      'seconds (' + diagnostic + ')',
    );
    await pause(retryMs);
  }
  const run = await response.json();
  assert.equal(run.conclusion, 'success', 'GitHub review run has not succeeded');
  assert.equal(run.head_sha, review.sourceSha, 'GitHub review run belongs to another commit');
  assert.equal(run.head_branch, 'main');
  assert.equal(run.repository.full_name, review.repository);
  assert.equal(run.head_repository.full_name, review.repository);
  assert(
    ['.github/workflows/review.yml', '.github/workflows/pages.yml'].includes(
      run.path.split('@')[0],
    ),
  );
  assert.equal(run.event, review.event);
  return result;
}

export async function restoreReleaseFixtures(root, project, receipt, manifest) {
  // Existing Node-side browser fixtures need generated data in public. Restore
  // only untracked build outputs; tracked inputs and tested release bytes stay intact.
  for (const name of Object.keys(manifest.assets)) {
    if (Object.hasOwn(receipt.inputs, 'public/' + name)) continue;
    const destination = path.resolve(project, 'public', name);
    assert(destination.startsWith(path.resolve(project, 'public') + path.sep));
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, 'assets', name), destination);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await (process.argv.includes('--reviewed')
    ? verifyReviewedRelease({ inWorkflow: process.argv.includes('--in-workflow') })
    : verifyRelease());
  if (process.argv.includes('--fixtures'))
    await restoreReleaseFixtures(
      path.resolve('build/release'),
      process.cwd(),
      result.receipt,
      result.manifest,
    );
  console.log(
    'Verified frozen release:',
    Object.keys(result.manifest.assets).length,
    'assets, Worker bundle, inputs and commit',
  );
}
