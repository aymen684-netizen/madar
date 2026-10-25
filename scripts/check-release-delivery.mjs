import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { packRelease, unpackRelease, releaseTag, sha256 } from './release-archive.mjs';
import { fetchReviewedRelease } from './fetch-reviewed-release.mjs';
import { verifyRelease } from './verify-release.mjs';

function maliciousTar(name, type = '0') {
  const header = Buffer.alloc(512);
  header.write(name);
  header.write('00000000000\0', 124);
  header[156] = type.charCodeAt(0);
  header.fill(32, 148, 156);
  const checksum = header.reduce((sum, value) => sum + value, 0);
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
  return gzipSync(Buffer.concat([header, Buffer.alloc(1024)]));
}

test('archive transport preserves the frozen package and rejects traversal, links and truncation', async () => {
  const temporary = await mkdtemp(path.resolve('build/delivery-test-'));
  try {
    const archivePath = path.join(temporary, 'release.tar.gz'),
      output = path.join(temporary, 'unpacked');
    packRelease('build/release', archivePath);
    const archive = await readFile(archivePath);
    await unpackRelease(archive, output);
    await verifyRelease({ root: output });
    for (const bad of [
      maliciousTar('../escape'),
      maliciousTar('/absolute'),
      maliciousTar('link', '2'),
    ])
      await assert.rejects(
        unpackRelease(bad, path.join(temporary, 'bad')),
        /Unsafe archive path|only files/,
      );
    await assert.rejects(
      unpackRelease(archive.subarray(0, archive.length - 16), path.join(temporary, 'truncated')),
    );
    assert.throws(() => releaseTag('bad', 123, 1));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Cloudflare importer requires the latest successful source review and checksum before replacing files', async () => {
  const temporary = await mkdtemp(path.resolve('build/import-test-'));
  try {
    const source = path.join(temporary, 'source'),
      project = path.join(temporary, 'project');
    await cp('build/release', source, { recursive: true });
    const receipt = JSON.parse(await readFile(path.join(source, 'release.json'))),
      sha = receipt.sourceSha || '1'.repeat(40);
    receipt.sourceSha = sha;
    await writeFile(path.join(source, 'release.json'), JSON.stringify(receipt));
    const archivePath = path.join(temporary, 'release.tar.gz');
    packRelease(source, archivePath);
    const archive = await readFile(archivePath);
    const run = {
      id: 123,
      run_attempt: 1,
      head_sha: sha,
      head_branch: 'main',
      event: 'push',
      path: '.github/workflows/review.yml',
      status: 'completed',
      conclusion: 'success',
    };
    let badChecksum = true,
      failed = false,
      verified = false;
    const request = async (url, options) => {
      if (url.includes('/actions/runs?'))
        return new Response(
          JSON.stringify({ workflow_runs: [failed ? { ...run, conclusion: 'failure' } : run] }),
        );
      assert.equal(
        options?.headers?.Authorization,
        undefined,
        'download never receives a GitHub token',
      );
      if (url.endsWith('.sha256'))
        return new Response(badChecksum ? '0'.repeat(64) : sha256(archive));
      return new Response(archive);
    };
    const options = {
      sha,
      project,
      request,
      timeoutMs: 0,
      verify: async (value) => {
        assert.equal(value.expectedSha, sha);
        await verifyRelease({ root: value.root, project: process.cwd(), expectedSha: sha });
        verified = true;
      },
    };
    await assert.rejects(fetchReviewedRelease(options), /checksum mismatch/);
    assert.equal(verified, false);
    badChecksum = false;
    failed = true;
    await assert.rejects(fetchReviewedRelease(options), /review failed/);
    failed = false;
    const result = await fetchReviewedRelease(options);
    assert.equal(result.sourceSha, sha);
    assert(verified);
    await verifyRelease({
      root: path.join(project, 'build/release'),
      project: process.cwd(),
      expectedSha: sha,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
