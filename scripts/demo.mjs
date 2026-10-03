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
  { kind: 'web', value: 'https://example.com/docs' },
  { kind: 'web', value: 'https://example.org/releases' },
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
    value: 72,
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
    snapshots.push({
      text: '',
      caption: 'One workspace · two panes · one link in each pane',
      duration: 2.5,
    });
    snapshots.push({ text: '', caption: 'Press Cmd+P, then U', duration: 1.5 });
    showPicker(samples);
    snapshot('Open Links', 3);
    key('', 'down');
    snapshot('Choose a link with its letter: a or s', 2);
    key('s');
    if (opened !== samples[1].value)
      throw new Error('Demo selected the wrong target');
    snapshots.push({
      text: '',
      caption: 's → open example.org/releases · browser opening simulated',
      duration: 2,
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
      'drawbox=x=20:y=20:w=1060:h=35:color=0x29263c:t=fill',
      'drawbox=x=20:y=55:w=180:h=510:color=0x242036:t=fill',
      'drawbox=x=200:y=55:w=880:h=32:color=0x29263c:t=fill',
      'drawbox=x=200:y=87:w=440:h=478:color=0x30263e:t=2',
      'drawbox=x=640:y=87:w=440:h=478:color=0x353247:t=2',
      textFilter(
        '●  ●  ●                  Herdr',
        '0xd6cdec',
        14,
        34,
        30,
        index + '-title.txt',
      ),
      textFilter(
        'spaces\n\n● Open Links\n  main',
        '0xb79af8',
        16,
        35,
        78,
        index + '-spaces.txt',
      ),
      textFilter(
        '1  main       +',
        '0xb79af8',
        16,
        214,
        65,
        index + '-tab.txt',
      ),
      textFilter('docs', '0x827a96', 14, 220, 105, index + '-left-title.txt'),
      textFilter(
        'releases',
        '0x827a96',
        14,
        660,
        105,
        index + '-right-title.txt',
      ),
      textFilter(
        '$ echo https://example.com/docs\n\nhttps://example.com/docs\n\n$ ▏',
        '0xd6cdec',
        15,
        220,
        151,
        index + '-left.txt',
      ),
      textFilter(
        '$ echo https://example.org/releases\n\nhttps://example.org/releases\n\n$ ▏',
        '0xd6cdec',
        15,
        660,
        151,
        index + '-right.txt',
      ),
    ];

    if (frame.text) {
      filters.push('drawbox=x=270:y=185:w=735:h=330:color=0x1c1b2b:t=fill');
      filters.push('drawbox=x=270:y=185:w=735:h=330:color=0xb79af8:t=2');
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
            15,
            286,
            203 + row * 24,
            index + '-row-' + row + '.txt',
          ),
        );
      });
    }
    filters.push(
      textFilter(
        frame.caption,
        '0xb79af8',
        15,
        35,
        579,
        index + '-caption.txt',
      ),
    );
    filters.push(
      textFilter(
        'ILLUSTRATED HERDR WINDOW · REAL PICKER · SAMPLE DATA',
        '0x827a96',
        11,
        35,
        607,
        index + '-sample.txt',
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
