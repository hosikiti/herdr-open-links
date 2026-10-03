import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  copyFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const dir = mkdtempSync(join(tmpdir(), 'herdr-launch space-'));
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
copyFileSync(
  fileURLToPath(new URL('./launch.sh', import.meta.url)),
  join(dir, 'launch.sh'),
);
writeFileSync(
  join(dir, 'index.mjs'),
  'console.log(JSON.stringify(process.argv.slice(2)));',
);
symlinkSync(process.execPath, join(dir, 'node'));
const run = (env) =>
  spawnSync(
    '/bin/sh',
    [join(dir, 'launch.sh'), 'scan', 'argument with spaces'],
    {
      env: { PATH: '/usr/bin:/bin', HOME: dir, ...env },
      encoding: 'utf8',
    },
  );

test('explicit Node override works with a restricted server PATH and spaces', () => {
  const result = run({ OPEN_LINKS_NODE: process.execPath });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['scan', 'argument with spaces']);
});
test('discovers Node on PATH without a hardcoded installation', () => {
  const result = run({ PATH: dir });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['scan', 'argument with spaces']);
});
test('invalid explicit override fails with a useful message', () => {
  const result = run({ OPEN_LINKS_NODE: join(dir, 'missing-node') });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /OPEN_LINKS_NODE must point to an executable/);
});

test("launches from the plugin root using Herdr's relative script filename", () => {
  const result = spawnSync('/bin/sh', ['launch.sh', 'setup-keys'], {
    cwd: dir,
    env: { PATH: '/usr/bin:/bin', OPEN_LINKS_NODE: process.execPath },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), ['setup-keys']);
});
