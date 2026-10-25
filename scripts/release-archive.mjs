import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const RELEASE_REPOSITORY = 'aymen684-netizen/madar';
export const RELEASE_ARCHIVE = 'madar-reviewed-release.tar.gz';
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function releaseTag(sha, runId, attempt) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  assert.match(String(runId), /^[1-9]\d*$/);
  assert.match(String(attempt), /^[1-9]\d*$/);
  return 'madar-' + sha + '-' + runId + '-' + attempt;
}

export function packRelease(root, output) {
  execFileSync('tar', [
    '--format=ustar',
    '--sort=name',
    '--mtime=@0',
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-czf',
    path.resolve(output),
    '-C',
    path.resolve(root),
    '.',
  ]);
}

export async function unpackRelease(archive, root) {
  assert(archive.length <= 64 * 1024 * 1024, 'Release archive is too large');
  const tar = gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 });
  const seen = new Set();
  const text = (bytes) => bytes.toString('utf8').split('\0')[0];
  const octal = (bytes) => {
    const value = text(bytes).trim();
    assert(/^[0-7]+$/.test(value), 'Invalid tar number');
    return parseInt(value, 8);
  };
  root = path.resolve(root);
  await mkdir(root, { recursive: true });
  let at = 0;
  while (at + 512 <= tar.length) {
    const header = tar.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;
    const checksum = [...header].reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    assert.equal(octal(header.subarray(148, 156)), checksum, 'Tar checksum mismatch');
    const prefix = text(header.subarray(345, 500)),
      name = ((prefix ? prefix + '/' : '') + text(header.subarray(0, 100)))
        .replace(/^\.\//, '')
        .replace(/\/$/, ''),
      type = header[156],
      size = octal(header.subarray(124, 136));
    assert([0, 48, 53].includes(type), 'Release archive may contain only files and directories');
    assert(
      !path.isAbsolute(name) &&
        !path.win32.isAbsolute(name) &&
        !name.includes('\\') &&
        !name.split('/').includes('..'),
      'Unsafe archive path',
    );
    const destination = path.resolve(root, name || '.');
    assert(
      destination === root || destination.startsWith(root + path.sep),
      'Archive escapes destination',
    );
    assert(at + 512 + size <= tar.length, 'Truncated tar entry');
    if (type === 53) {
      assert.equal(size, 0);
      await mkdir(destination, { recursive: true });
    } else {
      assert(name && !seen.has(name), 'Duplicate archive file');
      seen.add(name);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, tar.subarray(at + 512, at + 512 + size));
    }
    at += 512 + Math.ceil(size / 512) * 512;
  }
  assert(
    tar.subarray(at).every((byte) => byte === 0),
    'Unexpected tar trailer',
  );
}
