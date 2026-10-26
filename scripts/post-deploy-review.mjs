import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const SOURCE_REPOSITORY = 'aymen684-netizen/madar';
export const CLOUDFLARE_CHECK = 'Workers Builds: madar';
export const CLOUDFLARE_APP = 'cloudflare-workers-and-pages';
export const SAMPLE_ASSETS = [
  'index.html',
  'privacy.js',
  'positions-worker.js',
  'data/en.json',
  'downloads/madar-overview.docx',
];
export const HOSTS = [
  { name: 'cloudflare', base: 'https://madar.aymen684.workers.dev/' },
  { name: 'pages', base: 'https://aymen684-netizen.github.io/madar/' },
];
const digest = (data) => createHash('sha256').update(data).digest('hex');
const checkedSha = (sha) => {
  assert.match(sha || '', /^[a-f0-9]{40}$/, 'Expected a complete source SHA');
  return sha;
};

export function latestCloudflareCheck(checks, sha) {
  checkedSha(sha);
  const matches = checks.filter(
    (item) =>
      item.name === CLOUDFLARE_CHECK && item.app?.slug === CLOUDFLARE_APP && item.head_sha === sha,
  );
  return matches.sort(
    (a, b) =>
      Date.parse(b.started_at || b.completed_at || 0) -
      Date.parse(a.started_at || a.completed_at || 0),
  )[0];
}

export async function waitForCloudflareDeployment({
  sha,
  token,
  request = fetch,
  pause = delay,
  timeoutMs = 20 * 60_000,
  intervalMs = 20_000,
  now = Date.now,
} = {}) {
  checkedSha(sha);
  assert(token, 'GitHub token with checks:read is required');
  const started = now();
  let last = 'check run not yet present';
  while (now() - started < timeoutMs) {
    const url = `https://api.github.com/repos/${SOURCE_REPOSITORY}/commits/${sha}/check-runs?per_page=100`;
    const response = await request(url, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    assert.equal(response.status, 200, 'Cannot inspect GitHub deployment checks');
    const data = await response.json();
    const matched = latestCloudflareCheck(data.check_runs || [], sha);
    if (matched?.status === 'completed' && matched.conclusion === 'success') {
      return {
        sourceSha: sha,
        checkId: matched.id,
        checkUrl: matched.html_url || matched.details_url || null,
        checkCompletedAt: matched.completed_at || null,
      };
    }
    last = matched ? `${matched.status}: ${matched.conclusion || 'pending'}` : last;
    console.log('Waiting for matching Cloudflare deployment:', last);
    await pause(intervalMs);
  }
  throw Error(`No successful Cloudflare deployment for ${sha} before deadline (${last})`);
}

export async function inspectLiveAssets({
  root = 'build/release',
  sourceSha,
  request = fetch,
  hosts = HOSTS,
} = {}) {
  checkedSha(sourceSha);
  const manifest = JSON.parse(await readFile(path.join(root, 'asset-manifest.json')));
  const receipt = JSON.parse(await readFile(path.join(root, 'release.json')));
  assert.equal(receipt.sourceSha, sourceSha, 'Reviewed package belongs to another commit');
  const verified = [];
  for (const host of hosts) {
    for (const asset of SAMPLE_ASSETS) {
      const expected = manifest.assets[asset];
      assert(expected?.sha256, `Missing reviewed asset: ${asset}`);
      const local = await readFile(path.join(root, 'assets', asset));
      assert.equal(digest(local), expected.sha256, `Reviewed bytes changed: ${asset}`);
      const url = new URL(asset === 'index.html' ? './' : asset, host.base).href;
      const response = await request(url, { signal: AbortSignal.timeout(45_000) });
      assert.equal(response.status, 200, `${host.name} HTTP ${response.status}: ${asset}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(
        digest(bytes),
        expected.sha256,
        `${host.name} has a different release: ${asset}`,
      );
      const etag = response.headers.get('etag');
      assert(etag, `${host.name} is missing ETag: ${asset}`);
      const conditional = await request(url, {
        headers: { 'If-None-Match': etag },
        signal: AbortSignal.timeout(45_000),
      });
      assert.equal(conditional.status, 304, `${host.name} revalidation failed: ${asset}`);
      verified.push({ host: host.name, asset, bytes: bytes.length, sha256: expected.sha256, etag });
    }
  }
  return verified;
}

export async function waitForReviewedSites({
  sourceSha,
  request = fetch,
  pause = delay,
  now = Date.now,
  timeoutMs = 6 * 60_000,
  intervalMs = 15_000,
  root,
  hosts,
} = {}) {
  const started = now();
  let error;
  do {
    try {
      return await inspectLiveAssets({ sourceSha, request, root, hosts });
    } catch (err) {
      error = err;
      console.log('Waiting for reviewed bytes on both hosts:', err.message);
      if (now() - started >= timeoutMs) break;
      await pause(intervalMs);
    }
  } while (now() - started < timeoutMs);
  throw Error(`Reviewed release not yet visible on both hosts: ${error?.message}`);
}

async function main() {
  const [, , mode] = process.argv;
  assert(
    ['deployment', 'assets'].includes(mode),
    'Usage: post-deploy-review.mjs deployment|assets',
  );
  const sha = checkedSha(process.env.MADAR_SOURCE_SHA);
  let output;
  if (mode === 'deployment') {
    output = await waitForCloudflareDeployment({ sha, token: process.env.GITHUB_TOKEN });
  } else {
    output = {
      sourceSha: sha,
      verifiedAt: new Date().toISOString(),
      assets: await waitForReviewedSites({ sourceSha: sha }),
    };
  }
  await mkdir('test-results', { recursive: true });
  await writeFile(`test-results/post-deploy-${mode}.json`, JSON.stringify(output, null, 2) + '\n');
  console.log('PASS:', mode, 'for source', sha);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
