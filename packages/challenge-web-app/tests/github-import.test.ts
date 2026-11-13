import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, createHmac } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { Header } from 'tar';
import { parseRepository, encrypt, decrypt, validSignature } from '../server/services/github/core';
import { archivePath, unpackArchive, readArchive } from '../server/services/github/archive';
import { api } from '../server/services/github/client';

export function archive(entries: { path: string; content?: Buffer; type?: 'File' | 'SymbolicLink'; linkpath?: string }[]) {
   const blocks: Buffer[] = [];
   for (const entry of entries) {
      const content = entry.content ?? Buffer.alloc(0);
      const header = new Header({ path: entry.path, type: entry.type ?? 'File', linkpath: entry.linkpath, size: content.length, mode: 0o644, uid: 0, gid: 0, mtime: new Date(0) });
      header.encode();
      blocks.push(header.block!, content, Buffer.alloc((512 - content.length % 512) % 512));
   }
   return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
const limits = { maxFileBytes: 1024, maxProjectBytes: 2048 };

test('repository input only accepts GitHub repository identities', () => {
   for (const value of ['owner/repo', 'https://github.com/owner/repo', 'https://github.com/owner/repo.git/']) assert.equal(parseRepository(value), 'owner/repo');
   for (const value of ['https://example.com/owner/repo', 'https://github.com.evil.test/owner/repo', 'https://user@github.com/owner/repo', 'https://github.com/owner/repo/tree/main', 'https://github.com/owner/repo?token=secret', '../repo']) assert.throws(() => parseRepository(value));
});
test('credentials are authenticated, encrypted and bound to their Challenge user', () => {
   const key = randomBytes(32), ciphertext = encrypt('secret-token', key, 'user-one');
   assert.equal(decrypt(ciphertext, key, 'user-one'), 'secret-token');
   assert.throws(() => decrypt(ciphertext, key, 'user-two'));
   assert.throws(() => decrypt(ciphertext, randomBytes(32), 'user-one'));
   const bytes = Buffer.from(ciphertext, 'base64'); bytes[15]! ^= 1;
   assert.throws(() => decrypt(bytes.toString('base64'), key, 'user-one'));
   assert.notEqual(ciphertext, encrypt('secret-token', key, 'user-one'));
});
test('webhook signatures cover exact raw bytes', () => {
   const body = Buffer.from('{"action":"revoked"}');
   const signature = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
   assert.ok(validSignature(body, signature, 'secret'));
   assert.ok(!validSignature(Buffer.concat([body, Buffer.from(' ')]), signature, 'secret'));
   assert.ok(!validSignature(body, signature, ''));
});
test('GitHub rate limits are distinguished from repository authorization failures', async () => {
   const original = globalThis.fetch;
   try {
      globalThis.fetch = async () => new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } });
      await assert.rejects(api('/repos/test/repo'), /额度已用尽/);
      globalThis.fetch = async () => new Response('', { status: 404 });
      await assert.rejects(api('/repos/test/repo'), /不存在或需要/);
   } finally { globalThis.fetch = original; }
});
test('archive retains text and binary bytes, excludes .git and dependencies', async () => {
   const result = await unpackArchive(archive([
      { path: 'root/src/index.js', content: Buffer.from('console.log("hello");') },
      { path: 'root/image.png', content: Buffer.from([0, 1, 255, 128]) },
      { path: 'root/.git/config', content: Buffer.from('credential') },
      { path: 'root/node_modules/demo/index.js', content: Buffer.from('ignored') },
   ]), limits);
   assert.equal(result.files.length, 2);
   assert.equal(result.files.find(f => f.path.endsWith('index.js'))?.content, 'console.log("hello");');
   const binary = result.files.find(f => f.path.endsWith('.png'))!.content;
   assert.deepEqual(Buffer.from(binary.split(',')[1]!, 'base64'), Buffer.from([0, 1, 255, 128]));
});
test('archive rejects traversal, duplicate paths, links, LFS and capacity violations', async () => {
   for (const path of ['/root/file', 'root/../file', 'root/a\\b', 'root//file']) assert.throws(() => archivePath(path));
   for (const entries of [
      [{ path: 'root/../escape' }],
      [{ path: 'root/file' }, { path: 'root/file' }],
      [{ path: 'root/link', type: 'SymbolicLink' as const, linkpath: '/etc/passwd' }],
      [{ path: 'root/large', content: Buffer.alloc(1025) }],
      [{ path: 'root/lfs', content: Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:abc\nsize 100\n') }],
   ]) await assert.rejects(unpackArchive(archive(entries), limits));
   await assert.rejects(unpackArchive(archive([{ path: 'root/a', content: Buffer.alloc(1000) }, { path: 'root/b', content: Buffer.alloc(1000) }]), { ...limits, maxProjectBytes: 1500 }));
});
test('archive download accepts 60MB and rejects downloads above 100MB', async () => {
   const downloaded = await readArchive(new Response(Buffer.alloc(60 * 1024 * 1024)), AbortSignal.timeout(5000));
   assert.equal(downloaded.length, 60 * 1024 * 1024);
   await assert.rejects(readArchive(new Response(Buffer.alloc(100 * 1024 * 1024 + 1)), AbortSignal.timeout(5000)), /超过 100MB/);
});
