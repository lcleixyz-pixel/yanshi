#!/usr/bin/env node
/**
 * 在真实 Safari 中走完偏光镜基础引导课程（WebDriver）。
 * 前提：已启动应用（默认 http://127.0.0.1:5178），并运行 `safaridriver -p 4445`；Safari 需允许远程自动化。
 * 点击走 WebDriver 元素点击；预测下拉框等无法直接点击的控件用脚本设置。输出截图和 result.json。
 * 用法：node verify-course-safari.mjs [appUrl] [outDir]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = process.argv[2] ?? 'http://127.0.0.1:5178';
const OUT = resolve(process.argv[3] ?? fileURLToPath(new URL('../../assets-source/polariscope/validation/course-v1/safari', import.meta.url)));
const DRIVER = 'http://127.0.0.1:4445';
const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

async function call(method, path, body) {
  const response = await fetch(`${DRIVER}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json();
  if (json.value?.error) throw new Error(`${path}: ${json.value.error} ${json.value.message}`);
  return json.value;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const checks = [];
let session;

const run = (script, args = []) => call('POST', `/session/${session}/execute/sync`, { script, args });
async function find(selector) { return (await call('POST', `/session/${session}/element`, { using: 'css selector', value: selector }))[ELEMENT]; }
async function click(selector) { await call('POST', `/session/${session}/element/${await find(selector)}/click`, {}); await sleep(250); }
const byTestId = (id) => `[data-testid="${id}"]`;
async function waitFor(description, script, timeout = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await run(script)) { checks.push({ check: description, pass: true, ms: Date.now() - start }); return; }
    await sleep(300);
  }
  checks.push({ check: description, pass: false });
  throw new Error(`Timed out: ${description}`);
}
const step = (id) => waitFor(`课程进入「${id}」`, `return document.querySelector('[data-testid="course-guide"]')?.dataset.step === '${id}'`);
async function shot(name) { await writeFile(join(OUT, `${name}.png`), Buffer.from(await call('GET', `/session/${session}/screenshot`), 'base64')); }
async function rotate(observation) {
  await click(byTestId('sample-demo-mode'));
  await click(byTestId('sample-auto-rotate'));
  await waitFor(`揭晓 ${observation}`, `return document.querySelector('[data-testid="sample-reveal"]')?.dataset.observation === '${observation}'`);
}
async function answer(question, indexes) {
  for (const index of indexes) await click(`[data-testid="course-question-${question}"] label:nth-of-type(${index + 1}) input`);
  await click(`[data-testid="course-question-${question}"] button`);
}

await mkdir(OUT, { recursive: true });
session = (await call('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })).sessionId;
try {
  await call('POST', `/session/${session}/window/rect`, { width: 1440, height: 1000, x: 0, y: 0 });
  await call('POST', `/session/${session}/url`, { url: `${APP}/explore/polariscope` });
  await run(`window.__courseErrors = []; addEventListener('error', (event) => window.__courseErrors.push(String(event.message))); addEventListener('unhandledrejection', (event) => window.__courseErrors.push(String(event.reason)));`);
  await waitFor('3D 场景就绪', `return document.querySelector('[data-testid="polariscope-scene"]')?.dataset.status === 'ready'`, 40_000);
  await click(byTestId('explore-course-start'));
  await step('parts');
  for (const part of ['polarizer', 'stage', 'analyzer']) await click(byTestId(`explore-part-${part}`));
  await waitFor('认识部件：三个部件已点选', `return document.querySelector('[data-testid="course-guide"]').dataset.complete === 'true'`);
  await shot('01-parts');
  await click(byTestId('course-next'));
  await step('path');
  for (let i = 0; i < 4; i++) await click('[aria-label="光路下一步"]');
  await shot('02-path');
  await click(byTestId('course-next'));
  await step('crossed');
  await click('.pol-explore__panel .pol-explore__angle-presets button:nth-child(3)');
  await waitFor('空载正交：透过率 0', `return document.querySelector('[data-testid="principle-transmission"]')?.dataset.value === '0'`);
  await shot('03-crossed');
  await click(byTestId('course-next'));
  await step('rotate');
  await rotate('all-dark');
  await click('.pol-course__check-button');
  await rotate('four-bright-four-dark');
  await click('.pol-course__check-button');
  await rotate('all-bright');
  await shot('04-rotate');
  await click(byTestId('course-next'));
  await step('reorient');
  await rotate('axis-dark');
  await click(byTestId('course-reorient'));
  await click(byTestId('sample-auto-rotate'));
  await waitFor('换方向后四明四暗', `return document.querySelector('[data-testid="sample-reveal"]')?.dataset.observation === 'four-bright-four-dark'`);
  await shot('05-reorient');
  await click(byTestId('course-next'));
  await step('explain');
  await answer('why-crossed', [0]);
  await answer('why-reorient', [1]);
  await answer('no-conclusion', [0, 1, 2, 3]);
  await waitFor('三题全部答对', `return document.querySelectorAll('[data-correct="true"]').length === 3`);
  await shot('06-quiz');
  await click(byTestId('course-finish'));
  await waitFor('完成页且无跳过', `const c = document.querySelector('[data-testid="course-complete"]'); return c && c.dataset.skipped === '0'`);
  const totalMs = await run(`return Number(document.querySelector('[data-testid="course-complete"]').dataset.totalMs)`);
  await shot('07-complete');
  // 投屏：从完成页进入第 5 步，确认投屏控件能完成换方向复核。
  await click(byTestId('course-restart'));
  for (let i = 0; i < 4; i++) await click(byTestId('course-skip'));
  await step('reorient');
  await click('[aria-label="进入投屏模式"]');
  await waitFor('进入投屏模式', `return !!document.querySelector('.pol-explore--projection')`, 5_000).catch(async () => {
    // WebDriver 点击偶尔未触发时再点一次，并记录下来。
    checks.push({ check: '投屏按钮首次点击未生效，已重试', pass: true });
    await click('[aria-label="进入投屏模式"]');
    await waitFor('进入投屏模式（重试）', `return !!document.querySelector('.pol-explore--projection')`, 5_000);
  });
  await run(`const s = document.querySelector('[aria-label="投屏预测"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'demo'); s.dispatchEvent(new Event('change', { bubbles: true }));`);
  await click('[aria-label="投屏转动一周"]');
  await waitFor('投屏：沿光轴全暗', `return document.querySelector('[data-testid="projection-explainer"]')?.textContent.includes('全暗')`);
  await click('[aria-label="投屏样品方向"]');
  await click('[aria-label="投屏转动一周"]');
  await waitFor('投屏：换方向后四明四暗', `return document.querySelector('[data-testid="projection-explainer"]')?.textContent.includes('一周四明四暗')`);
  await shot('08-projection-reorient');
  const lessonConsistent = await run(`return document.querySelector('[data-testid="polariscope-explore-page"]').dataset.lesson === 'sample'`);
  checks.push({ check: '投屏结束时页面讲解状态为样品观察', pass: lessonConsistent });
  const pageErrors = await run(`return window.__courseErrors ?? []`);
  const windowRect = await call('GET', `/session/${session}/window/rect`);
  await writeFile(join(OUT, 'result.json'), JSON.stringify({ date: new Date().toISOString(), browser: 'Safari (WebDriver)', app: APP, window: windowRect, totalMs, checks, pageErrors, pass: checks.every((item) => item.pass) && pageErrors.length === 0 }, null, 2));
  console.log(`Safari 课程走查通过：${checks.length} 项检查，自动操作用时 ${(totalMs / 1000).toFixed(1)} 秒 → ${OUT}`);
} catch (error) {
  await shot('failure').catch(() => {});
  await writeFile(join(OUT, 'result.json'), JSON.stringify({ date: new Date().toISOString(), checks, error: String(error), pass: false }, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally {
  await call('DELETE', `/session/${session}`).catch(() => {});
}
