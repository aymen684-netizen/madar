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

export async function fetchReviewedRelease({
  sha = process.env.WORKERS_CI_COMMIT_SHA,
  project = process.cwd(),
  request = fetch,
  waitMs = 30000,
  timeoutMs = 18 * 60000,
  verify = verifyReviewedRelease,
} = {}) {
  assert.match(sha || '', /^[a-f0-9]{40}$/, 'A full source commit SHA is required');
  if (process.env.WORKERS_CI_BRANCH) assert.equal(process.env.WORKERS_CI_BRANCH, 'main');
  const api = 'https://api.github.com/repos/' + RELEASE_REPOSITORY;
  const deadline = Date.now() + timeoutMs;
  let run,
    checkedAt = -Infinity;
  await mkdir(path.join(project, 'build'), { recursive: true });
  while (true) {
    if (Date.now() - checkedAt >= 60000) {
      const response = await request(api + '/actions/runs?head_sha=' + sha + '&per_page=20', {
        headers: {
          Accept: 'application/vnd.github+json',
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN }
            : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
      assert.equal(response.status, 200, 'Cannot read the GitHub release review');
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
      checkedAt = Date.now();
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
    assert(Date.now() < deadline, 'Timed out waiting for the reviewed release');
    console.log('Waiting for the main review to complete for', sha);
    await delay(waitMs);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await fetchReviewedRelease();
