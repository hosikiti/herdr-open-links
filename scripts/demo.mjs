// Render real picker output with sample data. No real URLs are opened.
// Requires Node.js and ffmpeg; generated frames stay in a temporary directory.
import { execFileSync } from 'node:child_process';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { showPicker } from '../picker.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(projectRoot, 'assets/demo.gif');
const temporary = mkdtempSync(join(tmpdir(), 'herdr-links-demo-'));
const font = process.env.DEMO_FONT || '/System/Library/Fonts/Menlo.ttc';
const samples = [
  { kind: 'web', value: 'https://example.com/docs/getting-started' },
  {
    kind: 'folder',
    value: '/demo/project/desktop/release',
    reconstructed: true,
  },
  { kind: 'file', value: '/demo/project/README.md' },
  {
    kind: 'web',
    value:
      'https://accounts.example.com/oauth2/auth?client_id=demo-client&redirect_uri=http%3A%2F%2Flocalhost%3A54321%2Fcallback&response_type=code&scope=' +
      'demo.read%20'.repeat(70) +
      '&state=sample-only',
  },
];

function capturePicker() {
  const snapshots = [];
  let latest = '';
  let opened = '';
  const originalWrite = process.stdout.write;
  const originalExit = process.exit;
  const originalOpen = childProcess.execFileSync;
  const originalRawMode = process.stdin.setRawMode;
  const stdoutDescriptors = Object.getOwnPropertyDescriptors(process.stdout);
  const stdinDescriptor = Object.getOwnPropertyDescriptor(
    process.stdin,
    'isTTY',
  );

  // Drive the real key handler without a terminal or OS/browser side effects.
  Object.defineProperty(process.stdout, 'columns', {
    value: 95,
    configurable: true,
  });
  Object.defineProperty(process.stdout, 'rows', {
    value: 20,
    configurable: true,
  });
  Object.defineProperty(process.stdin, 'isTTY', {
    value: true,
    configurable: true,
  });
  process.stdin.setRawMode = () => {};
  process.stdout.write = (chunk) => {
    if (String(chunk).includes('\x1b[H')) latest = String(chunk);
    return true;
  };
  process.exit = () => {};
  childProcess.execFileSync = (command, args) => {
    if (command !== '/usr/bin/open') throw new Error('Unexpected demo command');
    opened = args[0];
    return Buffer.alloc(0);
  };
  syncBuiltinESMExports();

  const snapshot = (caption, duration) =>
    snapshots.push({ text: latest, caption, duration });
  const key = (text, name = text) =>
    process.stdin.emit('keypress', text, { name });

  try {
    showPicker(samples);
    snapshot('Prefix → U: find links from the current pane', 2.4);
    key('', 'down');
    snapshot('Folders and files are included too', 1.7);
    key('/');
    snapshot('Press / to search', 0.8);

    for (const letter of 'oauth') {
      key(letter);
      snapshot(`Search: ${'oauth'.slice(0, 'oauth'.indexOf(letter) + 1)}`, 0.3);
    }

    key('\r', 'return');
    snapshot('The full long URL is retained · press a to open', 2.4);
    key('a');

    if (opened !== samples[3].value)
      throw new Error('Demo selected the wrong target');
    snapshots.push({
      text: '\x1b[1;35m Open Links\x1b[0m\r\n\r\n Selected URL sent to the browser opener.\r\n\r\n No selecting text. No copying.\r\n\r\n Press prefix → U, then a letter.',
      caption: 'a: open the selected URL · browser opening simulated',
      duration: 2.4,
    });
  } finally {
    process.stdout.write = originalWrite;
    process.exit = originalExit;
    childProcess.execFileSync = originalOpen;
    syncBuiltinESMExports();
    process.stdin.setRawMode = originalRawMode;
    process.stdin.removeAllListeners('keypress');
    process.stdin.pause();

    for (const name of ['columns', 'rows']) {
      if (stdoutDescriptors[name])
        Object.defineProperty(process.stdout, name, stdoutDescriptors[name]);
      else delete process.stdout[name];
    }
    if (stdinDescriptor)
      Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);
    else delete process.stdin.isTTY;
  }

  return snapshots;
}

function textFilter(text, color, size, x, y, filename) {
  const file = join(temporary, filename);
  writeFileSync(file, stripVTControlCharacters(text));
  return `drawtext=fontfile='${font}':textfile='${file}':expansion=none:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}`;
}

try {
  const frames = capturePicker();
  const manifest = [];

  frames.forEach((frame, index) => {
    const filters = [
      'drawbox=x=18:y=18:w=1064:h=604:color=0x353247:t=2',
      'drawbox=x=20:y=20:w=1060:h=45:color=0x29263c:t=fill',
      textFilter(
        'HERDR OPEN LINKS',
        '0xd6cdec',
        18,
        42,
        33,
        `${index}-title.txt`,
      ),
      textFilter(
        'DEMO · SAMPLE DATA',
        '0x827a96',
        13,
        880,
        36,
        `${index}-sample.txt`,
      ),
    ];

    frame.text.split(/\r?\n/).forEach((line, row) => {
      const color = line.includes('[36m')
        ? '0x71d4d0'
        : line.includes('[1;35m')
          ? '0xb79af8'
          : '0xd6cdec';
      filters.push(
        textFilter(
          line,
          color,
          18,
          42,
          95 + row * 25,
          `${index}-row-${row}.txt`,
        ),
      );
    });
    filters.push(
      textFilter(
        frame.caption,
        '0xb79af8',
        16,
        42,
        554,
        `${index}-caption.txt`,
      ),
    );
    filters.push(
      textFilter(
        'https://github.com/hosikiti/herdr-open-links',
        '0x827a96',
        13,
        42,
        587,
        `${index}-repo.txt`,
      ),
    );

    const png = join(temporary, `frame-${index}.png`);
    execFileSync(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=0x1c1b2b:s=1100x640',
        '-vf',
        filters.join(','),
        '-frames:v',
        '1',
        png,
      ],
      { stdio: 'pipe' },
    );
    manifest.push(`file '${png}'`, `duration ${frame.duration}`);
  });

  manifest.push(`file '${join(temporary, `frame-${frames.length - 1}.png`)}'`);
  const list = join(temporary, 'frames.txt');
  writeFileSync(list, manifest.join('\n'));
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      list,
      '-filter_complex',
      '[0:v]fps=10,split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none',
      '-loop',
      '0',
      output,
    ],
    { stdio: 'pipe' },
  );
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      output,
      '-frames:v',
      '1',
      resolve(projectRoot, 'assets/demo-preview.png'),
    ],
    { stdio: 'pipe' },
  );
  console.log(`Created ${output}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
