import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// Exercise the actual picker's stdin decoder in a child process. A pipe marked
// as a terminal avoids controlling a real app or opening a file/browser.
function startPicker() {
  const moduleUrl = new URL('./picker.mjs', import.meta.url).href;
  const source = `
    import { showPicker } from ${JSON.stringify(moduleUrl)};
    Object.defineProperty(process.stdin, 'isTTY', { value: true });
    process.stdin.setRawMode = () => {};
    showPicker([
      { kind: 'web', value: 'https://example.com/first' },
      { kind: 'web', value: 'https://example.com/second' },
    ]);
  `;
  return spawn(process.execPath, ['--input-type=module', '-e', source], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function waitForOutput(child, expected) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(
      () => finish(new Error('Picker output timed out')),
      2000,
    );

    function finish(error) {
      clearTimeout(timeout);
      child.stdout.off('data', onData);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve(output);
    }

    function onData(chunk) {
      output += chunk.toString();
      if (output.includes(expected)) finish();
    }

    function onExit() {
      finish(new Error('Picker exited before expected output'));
    }

    child.stdout.on('data', onData);
    child.once('exit', onExit);
  });
}

test('Escape exits the picker without the default half-second wait', async (t) => {
  const child = startPicker();
  t.after(() => child.kill());
  await waitForOutput(child, 'Open Links');

  const started = performance.now();
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.stdin.write('\x1b');
  const code = await exited;
  const elapsed = performance.now() - started;

  assert.equal(code, 0);
  assert.ok(elapsed < 250, `Escape took ${Math.round(elapsed)} ms`);
  t.diagnostic(`Escape-to-process-exit: ${Math.round(elapsed)} ms`);
});

test('a fragmented Down-arrow sequence still selects the next target', async (t) => {
  const child = startPicker();
  t.after(() => child.kill());
  await waitForOutput(child, 'Open Links');

  const moved = waitForOutput(child, '› s  web');
  child.stdin.write('\x1b');
  await new Promise((resolve) => setTimeout(resolve, 5));
  child.stdin.write('[B');
  await moved;

  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.stdin.write('\x03');
  assert.equal(await exited, 0);
});
