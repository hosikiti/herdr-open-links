import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extract } from './links.mjs';
const dir = mkdtempSync(join(tmpdir(), 'herdr-links-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
const folder = join(dir, 'desktop-release', 'desktop', 'release');
mkdirSync(folder, { recursive: true });
const file = join(dir, 'hello world.txt');
writeFileSync(file, 'test');
const values = (text) => extract(text, dir).map((x) => x.value);
test('web links keep queries/fragments and remove Markdown punctuation', () => {
  assert.deepEqual(values('[read](https://example.com/a_(b)?x=1&y=2#part).'), [
    'https://example.com/a_(b)?x=1&y=2#part',
  ]);
});
test('file URLs decode spaces and use local paths', () => {
  assert.deepEqual(values(pathToFileURL(file).href), [file]);
});
test('reassembles the screenshot-style path split inside a word', () => {
  const split = folder.lastIndexOf('/desktop/') + 7;
  assert.equal(
    values(folder.slice(0, split) + '\n  ' + folder.slice(split))[0],
    folder,
  );
});
test('quoted paths with spaces and relative filenames', () => {
  assert.ok(values('"hello world.txt"').includes(file));
});
test('web continuation and adjacent distinct URLs', () => {
  const prefix = 'https://example.com/' + 'a'.repeat(65);
  assert.equal(values(prefix + '\n  /more?x=1')[0], prefix + '/more?x=1');
  assert.deepEqual(values('https://one.example/a\nhttps://two.example/b'), [
    'https://two.example/b',
    'https://one.example/a',
  ]);
});
test('OSC 8 destinations survive short labels', () => {
  assert.equal(
    extract(
      'Docs',
      dir,
      '\x1b]8;;https://example.com/hidden\x1b\\Docs\x1b]8;;\x1b\\',
    )[0].value,
    'https://example.com/hidden',
  );
});
test('deduplicates and rejects nonlocal file URLs / unsupported schemes', () => {
  assert.deepEqual(values('https://example.com\nhttps://example.com'), [
    'https://example.com',
  ]);
  assert.deepEqual(values('file://remotehost/tmp/a\njavascript:alert(1)'), []);
});

test('preserves a very long synthetic OAuth URL byte for byte', () => {
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.searchParams.set(
    'client_id',
    'synthetic-client.apps.googleusercontent.com',
  );
  auth.searchParams.set(
    'redirect_uri',
    'http://localhost:54321/oauth/callback',
  );
  auth.searchParams.set('response_type', 'code');
  auth.searchParams.set(
    'scope',
    Array.from(
      { length: 150 },
      (_, i) => `https://www.googleapis.com/auth/synthetic.scope.${i}`,
    ).join(' '),
  );
  auth.searchParams.set('state', 'synthetic-only-state-' + 'x'.repeat(2048));
  auth.searchParams.set('code_challenge', 'synthetic-only-' + 'a'.repeat(43));
  auth.searchParams.set('code_challenge_method', 'S256');
  const url = auth.href;
  assert.ok(url.length > 10000);
  assert.deepEqual(values(`Open this URL in your browser:\n${url}`), [url]);
  assert.equal(
    extract('Sign in', dir, `\x1b]8;;${url}\x07Sign in\x1b]8;;\x07`)[0].value,
    url,
  );
});
