import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('./styles.css', import.meta.url), 'utf8');
const js = await readFile(new URL('./game.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('./README.md', import.meta.url), 'utf8');

test('project includes required controls and static assets', () => {
  for (const id of ['gameCanvas', 'startBtn', 'pauseBtn', 'resumeBtn', 'restartBtn', 'resetBtn', 'soundBtn', 'gameOverPanel', 'score', 'timeLeft', 'combo']) {
    assert.match(html, new RegExp(`id="${id}"`), `missing ${id}`);
  }
  assert.match(css, /touch-action/);
  assert.match(css, /@media\(max-width:560px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(js, /pointerdown/);
  assert.match(js, /pointermove/);
  assert.match(js, /localStorage/);
  assert.match(js, /AudioContext/);
  assert.match(readme, /Deploy to Vercel/);
});

test('game script parses and has no unresolved placeholder markers', () => {
  assert.doesNotThrow(() => new vm.Script(js));
  assert.doesNotMatch(js, /TODO|FIXME|YOUR_API_KEY/);
});

test('local server serves the app and game script', async (t) => {
  const { spawn } = await import('node:child_process');
  const port = 4300 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['serve.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM'));
  let response;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { response = await fetch(`http://127.0.0.1:${port}/`); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  assert.ok(response, 'server did not start');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Fruit Frenzy/);
  const jsResponse = await fetch(`http://127.0.0.1:${port}/game.js`);
  assert.equal(jsResponse.status, 200);
  assert.match(await jsResponse.text(), /function startGame/);
});
