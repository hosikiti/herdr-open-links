// Extract and resolve targets without opening them or making network requests.
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const MAX_CONTINUATION_LINES = 4;
const MIN_WRAPPED_URL_LENGTH = 60;

// OSC 8: ESC ] 8 ; parameters ; destination, terminated by BEL or ESC backslash.
const OSC8_LINK = /\x1b\]8;[^;]*;([^\x07\x1b]+)(?:\x07|\x1b\\)/g;

// Prefer full URLs/paths over bare filenames so URL fragments are not separate targets.
const TARGET_TOKEN =
  /(?:https?:\/\/|file:\/\/|~\/|\.\.?\/|\/)[^\s<>"'`]+|(?:[\w@.-]+\/)+[^\s<>"'`]+|[\w@.-]+\.[a-zA-Z\d]{1,12}(?::\d+(?::\d+)?)?/g;

/** Remove surrounding prose punctuation, keeping balanced brackets in URLs. */
export function clean(value) {
  let cleaned = value.trim().replace(/[.,;]+$/, '');
  const brackets = [
    [')', '('],
    [']', '['],
    ['}', '{'],
  ];

  for (const [closing, opening] of brackets) {
    while (
      cleaned.endsWith(closing) &&
      cleaned.split(closing).length > cleaned.split(opening).length
    ) {
      cleaned = cleaned.slice(0, -1);
    }
  }

  return cleaned;
}

/** Return a supported web target or an existing local file/folder. */
export function target(value, cwd) {
  // Check the literal filename first: punctuation may be part of a real name.
  const candidates = [...new Set([value.trim(), clean(value)])];

  for (let candidate of candidates) {
    try {
      if (/^https?:\/\//i.test(candidate)) {
        candidate = clean(candidate);
        const url = new URL(candidate);

        if (!url.hostname || /[\s\x00-\x1f]/.test(candidate)) {
          continue;
        }

        // Preserve the original query encoding instead of serializing the URL.
        return { value: candidate, kind: 'web' };
      }

      if (/^file:\/\//i.test(candidate)) {
        candidate = fileURLToPath(new URL(candidate));
      } else if (/^[a-z][a-z\d+.-]*:/i.test(candidate)) {
        continue;
      } else {
        candidate = resolve(cwd, candidate.replace(/^~(?=\/|$)/, homedir()));
      }

      if (existsSync(candidate)) {
        return {
          value: candidate,
          kind: statSync(candidate).isDirectory() ? 'folder' : 'file',
        };
      }

      // Compiler output often appends :line:column; macOS cannot open that suffix.
      const withoutLine = candidate.replace(/:\d+(?::\d+)?$/, '');
      if (withoutLine !== candidate && existsSync(withoutLine)) {
        return { value: withoutLine, kind: 'file' };
      }
    } catch {
      // Invalid URLs, remote file hosts, and inaccessible files are not targets.
    }
  }

  return null;
}

function recoverContinuation(value, row, lines, cwd) {
  let joined = value;
  let recovered = null;

  for (
    let offset = 1;
    offset <= MAX_CONTINUATION_LINES && row + offset < lines.length;
    offset++
  ) {
    const nextLine = lines[row + offset].trim();

    // Stop at prose, pane borders, blank lines, or a distinct new URL/path.
    if (!nextLine || /\s|^[#*>│]|^(?:https?|file):\/\/|^~\//.test(nextLine)) {
      break;
    }

    joined += nextLine;
    const candidate = target(joined, cwd);

    // An existing file is stronger evidence than a string that looks like a URL.
    if (candidate && candidate.kind !== 'web') {
      recovered = joined;
    }

    // Real newlines lose wrap metadata. Only join long URLs when the next row
    // looks like a path/query continuation; arbitrary words would be ambiguous.
    const looksLikeWebContinuation =
      candidate?.kind === 'web' &&
      value.length >= MIN_WRAPPED_URL_LENGTH &&
      /[/?&=%#]/.test(nextLine) &&
      !/[.,;)]$/.test(value);

    if (looksLikeWebContinuation) {
      recovered = joined;
    }
  }

  return recovered;
}

/** Read plain text and OSC 8 destinations, newest matches first, without duplicates. */
export function extract(text, cwd, ansi = '') {
  const found = [];

  function add(value, order, reconstructed = false) {
    const item = target(value, cwd);

    if (item) {
      found.push({ ...item, order, reconstructed });
    }
  }

  // Hyperlink labels can say only "Docs" while carrying a complete hidden URL.
  // Destinations without a plain-text position appear after the visible matches.
  for (const match of ansi.matchAll(OSC8_LINK)) {
    if (/^(?:https?|file):\/\//i.test(match[1])) {
      add(match[1], -1);
    }
  }

  const lines = stripVTControlCharacters(text).split(/\r?\n/);

  lines.forEach((line, row) => {
    for (const match of line.matchAll(/[`"']([^`"']+)[`"']/g)) {
      add(match[1], row);
    }

    for (const match of line.matchAll(TARGET_TOKEN)) {
      const value = match[0];
      const endsAtLineBoundary =
        line.slice(match.index + value.length).trim() === '';
      const recovered = endsAtLineBoundary
        ? recoverContinuation(value, row, lines, cwd)
        : null;

      if (recovered) {
        add(recovered, row, true);
      } else {
        add(value, row);
      }
    }
  });

  const seen = new Set();

  return found
    .sort((left, right) => right.order - left.order)
    .filter((item) => {
      if (seen.has(item.value)) {
        return false;
      }

      seen.add(item.value);
      return true;
    })
    .map(({ order, ...item }) => item);
}
