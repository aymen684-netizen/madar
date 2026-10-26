import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  latestCloudflareCheck,
  waitForCloudflareDeployment,
  inspectLiveAssets,
  SAMPLE_ASSETS,
  CLOUDFLARE_CHECK,
  CLOUDFLARE_APP,
} from './post-deploy-review.mjs';

const sha = 'a'.repeat(40);
const token = 'synthetic-token';
const entry = (status, conclusion, expectedSha = sha) => ({
  id: 1,
  name: CLOUDFLARE_CHECK,
  app: { slug: CLOUDFLARE_APP },
  head_sha: expectedSha,
  status,
  conclusion,
  started_at: '2026-10-26T20:00:00Z',
});
assert.equal(latestCloudflareCheck([entry('completed', 'success', 'b'.repeat(40))], sha), undefined);
assert.equal(latestCloudflareCheck([entry('completed', 'success')], sha).conclusion, 'success');
const statusResponse = (runs) => new Response(JSON.stringify({ check_runs: runs }), { status: 200 });
const success = await waitForCloudflareDeployment({
  sha,
  token,
  request: async (url, options) => {
    assert(url.includes(sha));
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return statusResponse([entry('completed', 'success')]);
  },
});
assert.equal(success.sourceSha, sha);
assert.equal(success.checkId, 1);
let calls = 0;
await assert.rejects(
  waitForCloudflareDeployment({
    sha,
    token,
    now: () => ++calls,
    timeoutMs: 2,
    intervalMs: 0,
    pause: async () => {},
    request: async () => statusResponse([entry('completed', 'failure')]),
  }),
  /No successful Cloudflare deployment/,
);

const directory = await mkdtemp(path.join(os.tmpdir(), 'madar-post-deploy-test-'));
try {
  const manifest = { assets: {} };
  const sampleData = new Map();
  for (const asset of SAMPLE_ASSETS) {
    const data = Buffer.from('SYNTHETIC TEST ONLY ' + asset);
    sampleData.set(asset, data);
    manifest.assets[asset] = { sha256: createHash('sha256').update(data).digest('hex') };
    await mkdir(path.join(directory, 'assets', path.dirname(asset)), { recursive: true });
    await writeFile(path.join(directory, 'assets', asset), data);
  }
  await writeFile(path.join(directory, 'asset-manifest.json'), JSON.stringify(manifest));
  await writeFile(path.join(directory, 'release.json'), JSON.stringify({ sourceSha: sha }));
  const host = { name: 'fixture', base: 'https://test.example/subdir/' };
  const request = async (url, options) => {
    const asset = new URL(url).pathname.replace('/subdir/', '') || 'index.html';
    assert(sampleData.has(asset), `Unexpected URL: ${url}`);
    if (options?.headers?.['If-None-Match'])
      return new Response(null, { status: 304 });
    return new Response(sampleData.get(asset), { status: 200, headers: { ETag: '"synthetic"' } });
  };
  const verified = await inspectLiveAssets({ root: directory, sourceSha: sha, hosts: [host], request });
  assert.equal(verified.length, SAMPLE_ASSETS.length);
  await assert.rejects(
    inspectLiveAssets({
      root: directory,
      sourceSha: sha,
      hosts: [host],
      request: async () => new Response('WRONG', { status: 200, headers: { ETag: '"synthetic"' } }),
    }),
    /different release/,
  );
  await assert.rejects(
    inspectLiveAssets({ root: directory, sourceSha: 'b'.repeat(40), hosts: [host], request }),
    /another commit/,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
console.log('PASS: Cloudflare commit gating, wrong-commit rejection, reviewed asset bytes, ETag/304');
