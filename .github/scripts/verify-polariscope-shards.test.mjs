import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyShardReports } from './verify-polariscope-shards.mjs';

function fixture() {
  const specs = Array.from({ length: 55 }, (_, index) => ({
    id: `case-${index}`, title: `Case ${index}`, tests: [{
      projectId: 'chromium', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }],
    }],
  }));
  const report = (rows, shard = null) => ({ config: { shard }, errors: [], suites: [{ specs: rows }] });
  return {
    expected: report(structuredClone(specs).map(spec => ({ ...spec, tests: spec.tests.map(item => ({ ...item, status: 'skipped', results: [] })) }))),
    shards: [[0, 19], [19, 37], [37, 55]].map(([start, end], index) => ({
      shard: index + 1,
      report: report(structuredClone(specs.slice(start, end)), { current: index + 1, total: 3 }),
    })),
  };
}

test('accepts the complete 55-case set exactly once across 19/18/18 shards', () => {
  const { expected, shards } = fixture();
  const result = verifyShardReports(expected, shards, 'success');
  assert.equal(result.ok, true);
  assert.equal(result.passedCases, 55);
  assert.equal(result.uniqueCases, 55);
  assert.deepEqual(result.shards.map(shard => shard.cases), [19, 18, 18]);
});

test('rejects missing, duplicate and unexpected identities even when totals claim 55 passes', () => {
  for (const change of ['missing', 'duplicate', 'unexpected', 'duplicate-expected']) {
    const { expected, shards } = fixture();
    const specs = shards[1].report.suites[0].specs;
    if (change === 'missing') specs.pop();
    if (change === 'duplicate') specs[0] = structuredClone(shards[0].report.suites[0].specs[0]);
    if (change === 'unexpected') specs[0].id = 'not-in-collected-list';
    if (change === 'duplicate-expected') expected.suites[0].specs[0].id = expected.suites[0].specs[1].id;
    for (const shard of shards) shard.report.stats = { expected: 55, unexpected: 0, skipped: 0, flaky: 0 };
    assert.equal(verifyShardReports(expected, shards, 'success').ok, false, change);
  }
});

test('rejects failures, timeouts, skipped, interrupted, flaky and absent execution results', () => {
  for (const state of ['failed', 'timedOut', 'skipped', 'interrupted', 'flaky', 'not-run', 'expected-failure', 'retry-failure']) {
    const { expected, shards } = fixture();
    const item = shards[0].report.suites[0].specs[0].tests[0];
    if (state === 'flaky') item.status = 'flaky';
    else if (state === 'not-run') item.results = [];
    else if (state === 'expected-failure') item.expectedStatus = 'failed';
    else if (state === 'retry-failure') item.results.unshift({ status: 'failed' });
    else item.results[0].status = state;
    assert.equal(verifyShardReports(expected, shards, 'success').ok, false, state);
  }
});

test('rejects missing or mismatched shards, global errors and unsuccessful matrix jobs', () => {
  for (const change of ['missing-shard', 'duplicate-shard', 'wrong-metadata', 'global-error', 'failed-job', 'missing-job']) {
    const { expected, shards } = fixture();
    let status = 'success';
    if (change === 'missing-shard') shards.pop();
    if (change === 'duplicate-shard') shards[1].shard = 1;
    if (change === 'wrong-metadata') shards[0].report.config.shard.total = 4;
    if (change === 'global-error') shards[0].report.errors.push({ message: 'global teardown failed' });
    if (change === 'failed-job') status = 'failure';
    if (change === 'missing-job') status = undefined;
    assert.equal(verifyShardReports(expected, shards, status).ok, false, change);
  }
});

test('CLI writes a summary and exits nonzero for missing or malformed artifact reports', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'polariscope-shard-check-'));
  try {
    const { expected, shards } = fixture();
    const expectedPath = path.join(directory, 'expected.json'), output = path.join(directory, 'summary.json');
    const stepSummary = path.join(directory, 'step-summary.md');
    fs.writeFileSync(expectedPath, JSON.stringify(expected));
    for (const shard of shards) {
      const folder = path.join(directory, `polariscope-shard-${shard.shard}`);
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'results.json'), JSON.stringify(shard.report));
    }
    const run = () => spawnSync(process.execPath, [
      fileURLToPath(new URL('./verify-polariscope-shards.mjs', import.meta.url)),
      '--expected', expectedPath, '--reports-dir', directory, '--output', output,
    ], { encoding: 'utf8', env: { ...process.env, SHARDS_RESULT: 'success', GITHUB_STEP_SUMMARY: stepSummary } });
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).ok, true);
    assert.match(fs.readFileSync(stepSummary, 'utf8'), /Complete: PASS/);
    const missing = path.join(directory, 'polariscope-shard-3', 'results.json');
    fs.unlinkSync(missing);
    assert.equal(run().status, 1);
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).ok, false);
    fs.writeFileSync(missing, '{broken json');
    assert.equal(run().status, 1);
    assert.match(JSON.parse(fs.readFileSync(output, 'utf8')).errors[0], /Cannot read complete test evidence/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
