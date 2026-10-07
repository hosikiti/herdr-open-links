// Plugin entry points: launch the popup, configure its shortcut, or scan a pane.
import { execFileSync } from 'node:child_process';
import { extract } from './links.mjs';
import { showPicker } from './picker.mjs';

const PLUGIN_ID = 'hosikiti.open-links';
const herdr = process.env.HERDR_BIN_PATH || 'herdr';

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error('Herdr Open Links requires Node.js 18 or newer.');
  process.exit(1);
}

// Use Herdr's injected binary and environment so named sessions keep working.
function runHerdr(args, extraEnv = {}) {
  return execFileSync(herdr, args, {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...extraEnv },
  });
}

function readResult(args) {
  const response = JSON.parse(runHerdr(args));

  if (response.error) {
    throw new Error(response.error.message || JSON.stringify(response.error));
  }

  return response.result;
}

function invocationContext() {
  return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}');
}

function launchPicker() {
  const context = invocationContext();
  const sourcePane = context.focused_pane_id || process.env.HERDR_PANE_ID;
  const args = [
    'plugin',
    'pane',
    'open',
    '--plugin',
    PLUGIN_ID,
    '--entrypoint',
    'picker',
  ];

  // Capture the source before launching; the popup must not scan itself.
  if (sourcePane) {
    args.push('--env', `OPEN_LINKS_SOURCE_PANE=${sourcePane}`);
  }

  readResult(args);
}

function scanSourcePane() {
  const context = invocationContext();
  const paneId =
    process.env.OPEN_LINKS_SOURCE_PANE ||
    context.focused_pane_id ||
    process.env.HERDR_PANE_ID;

  if (!paneId) {
    throw new Error(
      'No source pane. Open the picker using the Herdr shortcut.',
    );
  }

  const { pane } = readResult(['pane', 'get', paneId]);
  const cwd = pane.foreground_cwd || pane.cwd || context.focused_pane_cwd;

  if (!cwd) {
    throw new Error('Cannot determine the source folder.');
  }

  const readArgs = ['pane', 'read', paneId, '--source', 'visible'];
  const text = runHerdr(readArgs);
  let ansi = '';

  // The visible source is passive: it avoids scrolling agent panes to read history.
  // ANSI supplies hidden OSC 8 destinations; if unavailable, plain text still works.
  try {
    ansi = runHerdr([...readArgs, '--ansi']);
  } catch {
    // Older or unavailable ANSI snapshots can safely be skipped.
  }

  return extract(text, cwd, ansi);
}

async function main() {
  switch (process.argv[2]) {
    case 'setup-keys': {
      const { setupKeys } = await import('./setup.mjs');
      console.log(setupKeys(runHerdr));
      break;
    }

    case 'launch':
      launchPicker();
      break;

    case 'scan':
      console.log(JSON.stringify(scanSourcePane(), null, 2));
      break;

    default: {
      let items = [];
      let error = '';

      // Show read errors inside the popup so it does not disappear silently.
      try {
        items = scanSourcePane();
      } catch (cause) {
        error = cause.message;
      }

      showPicker(items, error);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
