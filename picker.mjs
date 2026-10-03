// Keyboard-driven terminal UI. Extraction and Herdr calls live in other modules.
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { stripVTControlCharacters } from 'node:util';

const LETTERS = 'asdfghjklwertyuiopzxcvbnm';

// Pane output is untrusted text: never let an extracted label emit terminal commands.
function displayText(text) {
  return stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}

function clip(text, width) {
  return Array.from(displayText(text)).slice(0, Math.max(0, width)).join('');
}

export function showPicker(items, initialError = '') {
  let selected = 0;
  let page = 0;
  let query = '';
  let searching = false;
  let error = initialError;
  let shown = [];
  let pageSize = 1;

  function render() {
    const width = Math.max(20, (process.stdout.columns || 80) - 3);
    const rows = process.stdout.rows || 24;
    const matches = items.filter((item) =>
      item.value.toLowerCase().includes(query.toLowerCase()),
    );

    // Reserve room for the title, controls, status, and destination preview.
    pageSize = Math.max(1, Math.min(LETTERS.length, rows - 10));
    const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pageCount - 1);
    shown = matches.slice(page * pageSize, (page + 1) * pageSize);
    selected = Math.min(selected, Math.max(0, shown.length - 1));

    const help = searching
      ? ` Search: ${query}▏`
      : ' Letter / Enter: open   /: search   ← →: page   Esc: close';
    const lines = [
      '\x1b[H\x1b[2J\x1b[1;35m Open Links\x1b[0m',
      '',
      clip(help, width),
      clip(' Shift+Enter: open containing folder (local paths)', width),
      '',
    ];

    shown.forEach((item, index) => {
      const cursor = index === selected ? '›' : ' ';
      const wrapMarker = item.reconstructed ? '↪ ' : '';
      const label = `${cursor} ${LETTERS[index]}  ${item.kind.padEnd(6)} ${wrapMarker}${item.value}`;
      const color = index === selected ? '\x1b[36m' : '';
      lines.push(`${color}${clip(label, width)}\x1b[0m`);
    });

    if (!shown.length) {
      lines.push(
        items.length
          ? ' No matching links.'
          : ' No links found in the last 500 lines.',
      );
    }

    const status =
      error || `${matches.length} targets · page ${page + 1}/${pageCount}`;
    lines.push('', clip(status, width));

    // The list abbreviates long targets; the preview shows two additional rows.
    const destination = displayText(shown[selected]?.value || '');
    for (
      let offset = 0;
      offset < Math.min(destination.length, width * 2);
      offset += width
    ) {
      lines.push(destination.slice(offset, offset + width));
    }

    process.stdout.write(lines.join('\r\n'));
  }

  function close() {
    process.stdin.setRawMode(false);
    process.stdout.write('\x1b[<u\x1b[?25h\x1b[?1049l');
    process.exit(0);
  }

  function openTarget(index, containingFolder = false) {
    const item = shown[index];

    if (!item) {
      return;
    }

    if (containingFolder && item.kind === 'web') {
      error = 'Containing folders are available for local paths only.';
      render();
      return;
    }

    try {
      const destination = containingFolder ? dirname(item.value) : item.value;
      // Pass the target as an argument, never as a shell command.
      execFileSync('/usr/bin/open', [destination], {
        timeout: 10000,
        stdio: 'pipe',
      });
      close();
    } catch (cause) {
      error = `Could not open: ${displayText(cause.stderr?.toString() || cause.message)}`;
      render();
    }
  }

  function editSearch(text, key) {
    if (key.name === 'backspace') {
      query = query.slice(0, -1);
    } else if (
      text &&
      !key.ctrl &&
      !key.meta &&
      !/[\x00-\x1f\x7f]/.test(text)
    ) {
      query += text;
    }

    page = 0;
    selected = 0;
  }

  function onKeypress(text, key = {}) {
    // Node's readline does not decode CSI-u keys. Decode the basic Kitty
    // protocol ourselves so Shift+Enter stays distinct from plain Enter.
    const encoded = /^\x1b\[(\d+)(?:;(\d+))?u$/.exec(key.sequence || '');
    if (encoded) {
      const code = Number(encoded[1]);
      const modifiers = Number(encoded[2] || 1) - 1;
      text = String.fromCodePoint(code);
      key = {
        name:
          { 13: 'return', 27: 'escape', 127: 'backspace', 9: 'tab' }[code] ||
          text.toLowerCase(),
        shift: Boolean(modifiers & 1),
        meta: Boolean(modifiers & 2),
        ctrl: Boolean(modifiers & 4),
      };
    } else if (key.sequence === '\x1b[27;2;13~') {
      // Some terminals use xterm's modifyOtherKeys encoding instead.
      key = { name: 'return', shift: true };
    }

    if (key.ctrl && key.name === 'c') {
      close();
      return;
    }

    if (key.name === 'escape') {
      if (!searching && !query) {
        close();
        return;
      }

      searching = false;
      query = '';
      page = 0;
    } else if (key.name === 'return') {
      if (searching) {
        // Finish typing before letter keys regain their open-target behavior.
        searching = false;
      } else {
        openTarget(selected, Boolean(key.shift));
        return;
      }
    } else if (searching) {
      editSearch(text, key);
    } else if (text === '/') {
      searching = true;
    } else if (key.name === 'down') {
      selected = Math.min(shown.length - 1, selected + 1);
    } else if (key.name === 'up') {
      selected = Math.max(0, selected - 1);
    } else if (key.name === 'right') {
      page += 1;
      selected = 0;
    } else if (key.name === 'left') {
      page = Math.max(0, page - 1);
      selected = 0;
    } else if (text && LETTERS.includes(text)) {
      openTarget(LETTERS.indexOf(text));
      return;
    }

    render();
  }

  if (!process.stdin.isTTY) {
    throw new Error('The picker needs an interactive terminal.');
  }

  // Use the alternate screen and restore it when the popup closes.
  // Request modifier-aware keys while this popup is active; close() restores
  // the prior keyboard mode before leaving the alternate screen.
  process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[>1u');
  process.stdin.setRawMode(true);
  // A lone Escape otherwise waits Node's default 500 ms. Keep a short grace
  // period for arrow-key escape sequences arriving in separate input chunks.
  emitKeypressEvents(process.stdin, { escapeCodeTimeout: 25 });
  process.stdin.on('keypress', onKeypress);
  process.stdout.on('resize', render);
  process.on('SIGTERM', close);
  process.stdin.resume();

  render();
}
