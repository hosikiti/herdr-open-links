import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  lstatSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configPath, planKeys, setupKeys } from './setup.mjs';

const directory = mkdtempSync(join(tmpdir(), 'herdr-setup-'));
process.on('exit', () => rmSync(directory, { recursive: true, force: true }));
const applied = JSON.stringify({
  result: { status: 'applied', diagnostics: [] },
});

// Isolate config edits from the user's running Herdr session.
function fakeHerdr(args) {
  return args[0] === 'config' ? 'config: ok\n' : applied;
}

test('config path follows explicit, XDG, and home precedence', () => {
  assert.equal(
    configPath({ HERDR_CONFIG_PATH: '/custom/config' }),
    '/custom/config',
  );
  assert.equal(
    configPath({ XDG_CONFIG_HOME: '/xdg' }),
    '/xdg/herdr/config.toml',
  );
  assert.equal(
    configPath({ HOME: '/example' }),
    '/example/.config/herdr/config.toml',
  );
  assert.throws(() => configPath({ HERDR_CONFIG_PATH: '' }), /is empty/);
});

test('appends without changing comments, prefix, or line endings', () => {
  const original = "# user setting\r\n[keys]\r\nprefix = 'cmd+p'\r\n";
  const plan = planKeys(original);

  assert.ok(plan.text.startsWith(original));
  assert.equal(plan.key, 'prefix+u');
  assert.ok(!/(?<!\r)\n/.test(plan.text));
  assert.equal(planKeys(plan.text).changed, false);
});

test('preserves a customized plugin shortcut and adds no duplicate', () => {
  const original = [
    '[[keys.command]]',
    "key = 'prefix+shift+u'",
    "type = 'plugin_action'",
    "command = 'hosikiti.open-links.pick' # keep this",
    '',
  ].join('\n');

  assert.deepEqual(planKeys(original), {
    text: original,
    key: 'prefix+shift+u',
    changed: false,
  });
});

test('rejects both custom-command and built-in binding conflicts', () => {
  assert.throws(
    () => planKeys('[[keys.command]]\nkey = "prefix+u"\ncommand = "other"'),
    /already assigned/,
  );
  assert.throws(
    () => planKeys('[keys]\nhelp = "prefix+u"'),
    /already assigned/,
  );
});

test('complex TOML is left for manual setup', () => {
  assert.throws(() => planKeys('title = """\n[keys]\n"""'), /ordinary TOML/);
  assert.throws(() => planKeys('keys = { prefix = "cmd+p" }'), /ordinary TOML/);
});

test('backs up the original, validates before writing, and is idempotent', () => {
  const file = join(directory, 'config.toml');
  const original = '[theme]\nname = "dracula"\n';
  const events = [];
  writeFileSync(file, original);

  const cli = (args, env) => {
    events.push(args.join(' '));

    if (args[0] === 'config') {
      assert.equal(readFileSync(file, 'utf8'), original);
      assert.match(readFileSync(env.HERDR_CONFIG_PATH, 'utf8'), /prefix\+u/);
    }

    return fakeHerdr(args);
  };

  setupKeys(cli, file);
  const changed = readFileSync(file, 'utf8');
  const backups = readdirSync(directory).filter((name) =>
    name.includes('backup'),
  );

  assert.deepEqual(events, ['config check', 'server reload-config']);
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(directory, backups[0]), 'utf8'), original);
  assert.match(setupKeys(fakeHerdr, file), /already configured/);
  assert.equal(readFileSync(file, 'utf8'), changed);
});

test('a validation failure never replaces the config', () => {
  const file = join(directory, 'invalid.toml');
  const original = '# keep this exactly\n';
  writeFileSync(file, original);

  assert.throws(
    () => setupKeys(() => 'config: invalid', file),
    /No changes made/,
  );
  assert.equal(readFileSync(file, 'utf8'), original);
});

test('reload failure restores the original and preserves symlinked configs', () => {
  const destination = join(directory, 'dotfile.toml');
  const link = join(directory, 'config-link.toml');
  const original = '[ui]\nonboarding = false\n';
  let reloads = 0;

  writeFileSync(destination, original);
  symlinkSync(destination, link);

  const cli = (args) => {
    if (args[0] === 'config') {
      return 'config: ok';
    }

    reloads += 1;
    return reloads === 1
      ? JSON.stringify({ error: { message: 'test failure' } })
      : applied;
  };

  assert.throws(() => setupKeys(cli, link), /Config restored/);
  assert.ok(lstatSync(link).isSymbolicLink());
  assert.equal(readFileSync(destination, 'utf8'), original);
  assert.equal(reloads, 2);
});
