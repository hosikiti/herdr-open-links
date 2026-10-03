// Add the shortcut without rewriting unrelated configuration or taking another key.
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const ACTION = 'hosikiti.open-links.pick';
const DEFAULT_KEY = 'prefix+u';

function normalizeKey(key) {
  return key.toLowerCase().replace(/\s+/g, '');
}

/** Match the same config-location precedence that Herdr uses. */
export function configPath(env = process.env) {
  if (env.HERDR_CONFIG_PATH !== undefined) {
    if (!env.HERDR_CONFIG_PATH) {
      throw new Error(
        'HERDR_CONFIG_PATH is empty. Set a config path before setup.',
      );
    }

    return env.HERDR_CONFIG_PATH;
  }

  const configHome =
    env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config');

  return join(configHome, 'herdr', 'config.toml');
}

function readBindingTables(text) {
  // This is deliberately a small binding reader, not a general TOML parser.
  // Multiline strings or inline tables could hide headers from this scanner.
  // Those configs can use manual setup instead; Herdr validates all writes.
  if (/"""|'''/.test(text) || /^\s*(?:keys|command)\s*=\s*[\[{]/m.test(text)) {
    throw new Error(
      'Shortcut setup needs ordinary TOML tables. Add the binding manually; see docs/DETAILS.md.',
    );
  }

  const tables = [];
  let table = { name: '', values: {} };
  tables.push(table);

  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^\s*\[\[?\s*([\w.]+)\s*\]\]?\s*(?:#.*)?$/);

    if (header) {
      table = { name: header[1], values: {} };
      tables.push(table);
      continue;
    }

    const assignment = line.match(
      /^\s*([\w-]+)\s*=\s*("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/,
    );

    if (assignment) {
      const quoted = assignment[2];
      table.values[assignment[1]] = quoted.startsWith('"')
        ? JSON.parse(quoted)
        : quoted.slice(1, -1);
    }
  }

  return tables;
}

/** Produce an append-only edit, or reuse a shortcut already chosen by the user. */
export function planKeys(text) {
  const tables = readBindingTables(text);
  const existing = tables.find(
    (table) =>
      table.name === 'keys.command' &&
      table.values.type === 'plugin_action' &&
      table.values.command === ACTION &&
      table.values.key,
  );

  if (existing) {
    return { text, key: existing.values.key, changed: false };
  }

  const conflict = tables.some((table) => {
    if (table.name === 'keys.command') {
      return normalizeKey(table.values.key || '') === DEFAULT_KEY;
    }

    return (
      table.name === 'keys' &&
      Object.entries(table.values).some(
        ([name, value]) =>
          name !== 'prefix' && normalizeKey(value) === DEFAULT_KEY,
      )
    );
  });

  if (conflict) {
    throw new Error(
      'prefix+u is already assigned. No changes made. Choose another shortcut using docs/DETAILS.md.',
    );
  }

  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  const block = [
    '# Herdr Open Links',
    '[[keys.command]]',
    `key = "${DEFAULT_KEY}"`,
    'type = "plugin_action"',
    `command = "${ACTION}"`,
    'description = "open links from pane"',
    '',
  ].join(newline);
  const separator = text.endsWith(newline) || !text ? '' : newline;

  return {
    text: text + separator + newline + block,
    key: DEFAULT_KEY,
    changed: true,
  };
}

function reloadConfig(cli) {
  const response = JSON.parse(cli(['server', 'reload-config']));
  const failed =
    response.error ||
    response.result?.status !== 'applied' ||
    response.result?.diagnostics?.length;

  if (failed) {
    throw new Error(
      response.error?.message ||
        'Herdr did not apply the configuration cleanly.',
    );
  }
}

/** Validate a temporary config, back up the original, then install and reload it. */
export function setupKeys(cli, path = configPath()) {
  // Follow symlinks so an existing dotfile link is preserved during replacement.
  const file = existsSync(path) ? realpathSync(path) : resolve(path);
  const hadConfig = existsSync(file);
  const original = hadConfig ? readFileSync(file, 'utf8') : '';
  const plan = planKeys(original);

  if (!plan.changed) {
    reloadConfig(cli);
    return `Shortcut already configured: ${plan.key}. Herdr reloaded.`;
  }

  mkdirSync(dirname(file), { recursive: true });
  const tempDirectory = mkdtempSync(join(dirname(file), '.open-links-'));
  const candidate = join(tempDirectory, 'config.toml');

  try {
    const mode = hadConfig ? statSync(file).mode & 0o777 : 0o600;
    writeFileSync(candidate, plan.text, { mode });

    // Let Herdr's own parser validate the edit before touching the original.
    const validation = cli(['config', 'check'], {
      HERDR_CONFIG_PATH: candidate,
    });

    if (validation.trim() !== 'config: ok') {
      throw new Error(
        'Herdr reported configuration diagnostics. No changes made.',
      );
    }

    const current = existsSync(file) ? readFileSync(file, 'utf8') : '';

    if (current !== original) {
      throw new Error('Config changed during setup. Run setup-keys again.');
    }

    const backup = file + `.open-links-backup-${Date.now()}`;

    if (hadConfig) {
      writeFileSync(backup, original, { flag: 'wx', mode: 0o600 });
    }

    // Rename within the same directory for an atomic config replacement.
    renameSync(candidate, file);

    try {
      reloadConfig(cli);
    } catch (error) {
      if (hadConfig) {
        writeFileSync(file, original);
      } else {
        rmSync(file);
      }

      try {
        reloadConfig(cli);
      } catch {
        // The config is restored on disk even if the server is unreachable.
      }

      throw new Error(
        `Config restored because reload failed: ${error.message}`,
      );
    }

    const backupNote = hadConfig ? '\nBackup: ' + backup : '';
    return `Shortcut configured: ${plan.key}. Herdr reloaded.${backupNote}`;
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}
