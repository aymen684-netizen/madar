import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  RELEASE_REPOSITORY,
  RELEASE_ARCHIVE,
  releaseTag,
  sha256,
  unpackRelease,
} from './release-archive.mjs';
import { verifyReviewedRelease } from './verify-release.mjs';

// GitHub may respond with 403/429 for rate limits. Never retry unrelated 403s.
export async function githubReviewRetryMs(response, failures, nowMs = Date.now()) {
  const status = response.status;
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = response.headers.get('retry-after');
  const resetAt = response.headers.get('x-ratelimit-reset');
  let rateLimited = remaining === '0' || retryAfter !== null;
  if (status === 403 && !rateLimited) {
    try {
      const error = await response.json();
      rateLimited = /(?:secondary )?rate limit/i.test(String(error?.message || ''));
    } catch {
      // Unknown forbidden responses are not retried.
    }
  }
  const retryable =
    status === 429 || (status === 403 && rateLimited) || (status >= 500 && status < 600);
  if (!retryable) return null;
  let waitMs = (status >= 500 ? 5000 : 60000) * 2 ** Math.min(failures, 3);
  if (retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter))
    waitMs = Math.max(waitMs, Math.ceil(Number(retryAfter) * 1000));
  if (remaining === '0' && resetAt && /^\d+$/.test(resetAt))
    waitMs = Math.max(waitMs, Number(resetAt) * 1000 - nowMs + 1000);
  return Math.max(0, waitMs);
}

export async function fetchReviewedRelease({
  sha = process.env.WORKERS_CI_COMMIT_SHA,
  project = process.cwd(),
  request = fetch,
  waitMs = 30000,
  timeoutMs = 18 * 60000,
  verify = verifyReviewedRelease,
  pause = delay,
  now = Date.now,
} = {}) {
  assert.match(sha || '', /^[a-f0-9]{40}$/, 'A full source commit SHA is required');
  if (process.env.WORKERS_CI_BRANCH) assert.equal(process.env.WORKERS_CI_BRANCH, 'main');
  const api = 'https://api.github.com/repos/' + RELEASE_REPOSITORY;
  const deadline = now() + timeoutMs;
  let run,
    checkedAt = -Infinity,
    consecutiveFailures = 0;
  await mkdir(path.join(project, 'build'), { recursive: true });
  while (true) {
    if (now() - checkedAt >= 60000) {
      const response = await request(api + '/actions/runs?head_sha=' + sha + '&per_page=20', {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN }
            : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
      if (response.status !== 200) {
        const retryMs = await githubReviewRetryMs(response, consecutiveFailures, now());
        const safe = (name) =>
          String(response.headers.get(name) || 'unknown')
            .replace(/[^a-zA-Z0-9.-]/g, '')
            .slice(0, 72);
        const detail =
          'HTTP ' +
          response.status +
          ', remaining=' +
          safe('x-ratelimit-remaining') +
          ', reset=' +
          safe('x-ratelimit-reset') +
          ', request=' +
          safe('x-github-request-id');
        if (retryMs === null)
          throw Error('Cannot read the GitHub release review (' + detail + ')');
        if (consecutiveFailures >= 3 || now() + retryMs >= deadline)
          throw Error('GitHub release review retry deadline/budget exceeded (' + detail + ')');
        consecutiveFailures++;
        console.warn(
          'Retrying GitHub release review after',
          Math.ceil(retryMs / 1000),
          'seconds (' + detail + ')',
        );
        await pause(retryMs);
        continue;
      }
      consecutiveFailures = 0;
      const runs = (await response.json()).workflow_runs.filter(
        (item) =>
          item.head_sha === sha &&
          item.head_branch === 'main' &&
          ['push', 'workflow_dispatch'].includes(item.event) &&
          ['.github/workflows/review.yml', '.github/workflows/pages.yml'].includes(
            item.path.split('@')[0],
          ),
      );
      run = runs[0];
      assert(
        !run || run.status !== 'completed' || run.conclusion === 'success',
        'Source commit review failed',
      );
      checkedAt = now();
    }
    if (run?.status === 'completed') {
      const tag = releaseTag(sha, run.id, run.run_attempt);
      const url =
        'https://github.com/' +
        RELEASE_REPOSITORY +
        '/releases/download/' +
        tag +
        '/' +
        RELEASE_ARCHIVE;
      const response = await request(url, { signal: AbortSignal.timeout(120000) });
      assert.equal(response.status, 200, 'Reviewed release archive is missing');
      assert(Number(response.headers.get('content-length') || 0) <= 64 * 1024 * 1024);
      const chunks = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) throw Error('Release archive is too large');
        chunks.push(chunk);
      }
      const archive = Buffer.concat(chunks);
      const checksum = await request(url + '.sha256', { signal: AbortSignal.timeout(20000) });
      assert.equal(checksum.status, 200);
      const expected = (await checksum.text()).trim();
      assert.match(expected, /^[a-f0-9]{64}$/);
      assert.equal(sha256(archive), expected, 'Release download checksum mismatch');
      const temporary = await mkdtemp(path.join(project, 'build/downloaded-release-'));
      try {
        await unpackRelease(archive, temporary);
        await verify({
          root: temporary,
          project,
          expectedSha: sha,
          request: async (requestedUrl) => {
            assert.equal(requestedUrl, api + '/actions/runs/' + run.id);
            return new Response(JSON.stringify(run));
          },
        });
        const target = path.join(project, 'build/release');
        await rm(target, { recursive: true, force: true });
        await rename(temporary, target);
        console.log('Downloaded the reviewed release for commit', sha, 'from run', run.id);
        return { tag, sourceSha: sha, runId: run.id, sha256: expected };
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
    assert(now() < deadline, 'Timed out waiting for the reviewed release');
    console.log('Waiting for the main review to complete for', sha);
    await pause(waitMs);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await fetchReviewedRelease();
