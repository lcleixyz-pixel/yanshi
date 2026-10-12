import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  INTERFERENCE_KEY,
  JUDGEMENT_RULES,
  OBSERVATION_POSTURE_SUMMARY,
  OBSERVATION_RULES,
  REACTION_LABEL,
  reactionLabel,
} from '../../src/domain/polariscopeRules';
import { COURSE_RULES } from '../../src/domain/polariscopeCourse';
import { INSTRUMENTS } from '../../src/data/instruments';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

test('course, knowledge base and 2D demo draw on the same rules', () => {
  assert.equal(COURSE_RULES, JUDGEMENT_RULES);
  const interference = INSTRUMENTS.polariscope.methods.find((method) => method.id === 'interference')!;
  assert.ok(interference.steps.some((step) => step.hint === INTERFERENCE_KEY));
  assert.ok(OBSERVATION_POSTURE_SUMMARY.includes('2–3 个不同方向'));
});

test('explanations keep the caveats that prevent over-confident conclusions', () => {
  assert.match(OBSERVATION_RULES['all-dark'].text, /换 2–3 个方向复查/);
  assert.match(OBSERVATION_RULES['all-dark'].text, /始终保持全暗/);
  assert.match(OBSERVATION_RULES['four-bright-four-dark'].text, /异常双折射（ADR）/);
  assert.match(OBSERVATION_RULES['all-bright'].text, /样品区域持续透亮/);
  assert.match(OBSERVATION_RULES['not-applicable'].text, /标准透射偏光镜不适用/);
  assert.match(OBSERVATION_RULES.anomalous.text, /平行复核/);
});

test('phenomenon labels are complete and fall back explicitly', () => {
  assert.deepEqual(Object.keys(REACTION_LABEL).sort(), ['all-bright', 'all-dark', 'anomalous', 'four-bright-four-dark']);
  assert.equal(reactionLabel('all-dark'), '全暗');
  assert.equal(reactionLabel(null, '未记录'), '未记录');
});

test('rule wording is not copied back into pages (only polariscopeRules defines it)', () => {
  const fragments = [
    '须换 2–3 个方向复查',
    '标准透射偏光镜不适用，不会得到',
    "=== 'four-bright-four-dark'\n",
    "? '四明四暗'",
    '黑十字 → 一轴晶',
  ];
  const offenders = sourceFiles(SRC)
    .filter((file) => !file.endsWith('domain/polariscopeRules.ts'))
    .flatMap((file) => { const text = readFileSync(file, 'utf8'); return fragments.filter((fragment) => text.includes(fragment)).map((fragment) => `${file.replace(SRC, '')}: ${JSON.stringify(fragment)}`); });
  assert.deepEqual(offenders, []);
});
