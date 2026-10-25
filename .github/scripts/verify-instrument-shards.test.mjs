import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { EXPECTED_CASE_COUNT, SHARD_COUNT, verifyShardReports } from './verify-instrument-shards.mjs';
import { EXPECTED_CASE_COUNT as POLARISCOPE_CASE_COUNT, verifyShardReports as verifyPolariscope } from './verify-polariscope-shards.mjs';

// Playwright 分片：前 (总数 % 分片数) 片各多一项。
const SHARD_SIZES = Array.from({ length: SHARD_COUNT }, (_, index) => Math.floor(EXPECTED_CASE_COUNT / SHARD_COUNT) + (index < EXPECTED_CASE_COUNT % SHARD_COUNT ? 1 : 0));

function fixture(count = EXPECTED_CASE_COUNT) {
  const sizes = Array.from({ length: SHARD_COUNT }, (_, index) => Math.floor(count / SHARD_COUNT) + (index < count % SHARD_COUNT ? 1 : 0));
  const ranges = sizes.map((size, index) => { const start = sizes.slice(0, index).reduce((sum, value) => sum + value, 0); return [start, start + size]; });
  const specs = Array.from({ length: count }, (_, index) => ({
    id: `case-${index}`, title: `Case ${index}`, tests: [{
      projectId: 'chromium', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed' }],
    }],
  }));
  const report = (rows, shard = null) => ({ config: { shard }, errors: [], suites: [{ specs: rows }] });
  return {
    expected: report(structuredClone(specs).map(spec => ({ ...spec, tests: spec.tests.map(item => ({ ...item, status: 'skipped', results: [] })) }))),
    shards: ranges.map(([start, end], index) => ({
      shard: index + 1,
      report: report(structuredClone(specs.slice(start, end)), { current: index + 1, total: SHARD_COUNT }),
    })),
  };
}

test('instruments: accepts the complete case set exactly once across the shards', () => {
  const { expected, shards } = fixture();
  const result = verifyShardReports(expected, shards, 'success');
  assert.equal(result.ok, true);
  assert.equal(result.passedCases, EXPECTED_CASE_COUNT);
  assert.equal(result.uniqueCases, EXPECTED_CASE_COUNT);
  assert.deepEqual(result.shards.map(shard => shard.cases), SHARD_SIZES);
});

test('instruments: actual package script collects all 91 identities in disjoint 31/30/30 shards without browsers', () => {
  const project = fileURLToPath(new URL('../../gem-lab/', import.meta.url));
  const env = { ...process.env };
  delete env.PLAYWRIGHT_JSON_OUTPUT_FILE;
  delete env.PLAYWRIGHT_JSON_OUTPUT_DIR;
  delete env.PLAYWRIGHT_JSON_OUTPUT_NAME;
  const collect = (shard) => {
    const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'run', '--silent', 'test:instruments', '--', '--list', '--reporter=json',
      ...(shard ? [`--shard=${shard}/${SHARD_COUNT}`] : []),
    ], { cwd: project, env, encoding: 'utf8', timeout: 30_000 });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.errors, []);
    const keys = [];
    const visit = suite => {
      for (const spec of suite.specs ?? []) for (const item of spec.tests ?? []) {
        assert.equal(item.expectedStatus, 'passed', `${spec.title}: must not be skipped or marked as an expected failure`);
        keys.push(JSON.stringify([spec.id, item.projectId ?? item.projectName]));
      }
      for (const child of suite.suites ?? []) visit(child);
    };
    visit(report);
    return keys;
  };
  const expected = collect();
  assert.equal(expected.length, EXPECTED_CASE_COUNT, 'Update the instrument baseline when coverage changes');
  assert.equal(new Set(expected).size, EXPECTED_CASE_COUNT);
  const shards = Array.from({ length: SHARD_COUNT }, (_, index) => collect(index + 1));
  assert.deepEqual(shards.map(keys => keys.length), [31, 30, 30]);
  assert.equal(new Set(shards.flat()).size, EXPECTED_CASE_COUNT, 'Shard identities must not overlap');
  assert.deepEqual(shards.flat().sort(), expected.sort(), 'Shards must cover the complete collected set');
});

test('instruments: rejects missing, duplicate and unexpected identities even when totals claim a full pass', () => {
  for (const change of ['missing', 'duplicate', 'unexpected', 'duplicate-expected']) {
    const { expected, shards } = fixture();
    const specs = shards[1].report.suites[0].specs;
    if (change === 'missing') specs.pop();
    if (change === 'duplicate') specs[0] = structuredClone(shards[0].report.suites[0].specs[0]);
    if (change === 'unexpected') specs[0].id = 'not-in-collected-list';
    if (change === 'duplicate-expected') expected.suites[0].specs[0].id = expected.suites[0].specs[1].id;
    for (const shard of shards) shard.report.stats = { expected: EXPECTED_CASE_COUNT, unexpected: 0, skipped: 0, flaky: 0 };
    assert.equal(verifyShardReports(expected, shards, 'success').ok, false, change);
  }
});

test('instruments: rejects failures, timeouts, skipped, interrupted, flaky and absent execution results', () => {
  for (const state of ['failed', 'timedOut', 'skipped', 'interrupted', 'flaky', 'not-run', 'expected-failure', 'retry-failure', 'result-error', 'result-errors']) {
    const { expected, shards } = fixture();
    const item = shards[0].report.suites[0].specs[0].tests[0];
    if (state === 'flaky') item.status = 'flaky';
    else if (state === 'not-run') item.results = [];
    else if (state === 'expected-failure') item.expectedStatus = 'failed';
    else if (state === 'retry-failure') item.results.unshift({ status: 'failed' });
    else if (state === 'result-error') item.results[0].error = { message: 'execution error' };
    else if (state === 'result-errors') item.results[0].errors = [{ message: 'execution error' }];
    else item.results[0].status = state;
    assert.equal(verifyShardReports(expected, shards, 'success').ok, false, state);
  }
});

test('instruments: rejects missing or mismatched shards, global errors and unsuccessful matrix jobs', () => {
  for (const change of ['missing-shard', 'duplicate-shard', 'wrong-metadata', 'global-error', 'missing-errors', 'failed-job', 'cancelled-job', 'skipped-job', 'missing-job']) {
    const { expected, shards } = fixture();
    let status = 'success';
    if (change === 'missing-shard') shards.pop();
    if (change === 'duplicate-shard') shards[1].shard = 1;
    if (change === 'wrong-metadata') shards[0].report.config.shard.total = 4;
    if (change === 'global-error') shards[0].report.errors.push({ message: 'global teardown failed' });
    if (change === 'missing-errors') delete shards[0].report.errors;
    if (change === 'failed-job') status = 'failure';
    if (change === 'cancelled-job') status = 'cancelled';
    if (change === 'skipped-job') status = 'skipped';
    if (change === 'missing-job') status = undefined;
    assert.equal(verifyShardReports(expected, shards, status).ok, false, change);
  }
});

test('instruments: CLI writes a summary and exits nonzero for missing or malformed artifact reports', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'instrument-shard-check-'));
  try {
    const { expected, shards } = fixture();
    const expectedPath = path.join(directory, 'expected.json'), output = path.join(directory, 'summary.json');
    const stepSummary = path.join(directory, 'step-summary.md');
    fs.writeFileSync(expectedPath, JSON.stringify(expected));
    for (const shard of shards) {
      const folder = path.join(directory, `instrument-shard-${shard.shard}`);
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'results.json'), JSON.stringify(shard.report));
    }
    const run = (status = 'success') => spawnSync(process.execPath, [
      fileURLToPath(new URL('./verify-instrument-shards.mjs', import.meta.url)),
      '--expected', expectedPath, '--reports-dir', directory, '--output', output,
    ], { encoding: 'utf8', env: { ...process.env, SHARDS_RESULT: status, GITHUB_STEP_SUMMARY: stepSummary } });
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).ok, true);
    assert.match(fs.readFileSync(stepSummary, 'utf8'), /Other instrument completeness/);
    assert.match(fs.readFileSync(stepSummary, 'utf8'), /Clean passes: 91 \/ 91/);
    for (const status of ['failure', 'cancelled', 'skipped', '']) {
      assert.equal(run(status).status, 1, status || 'missing upstream status');
      assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).ok, false);
    }
    const missing = path.join(directory, 'instrument-shard-3', 'results.json');
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

test('instruments: separate wrappers keep the existing 73-case polariscope gate unchanged', () => {
  assert.equal(POLARISCOPE_CASE_COUNT, 73);
  const polariscope = fixture(73), instruments = fixture(91);
  assert.equal(verifyPolariscope(polariscope.expected, polariscope.shards, 'success').ok, true);
  assert.equal(verifyPolariscope(instruments.expected, instruments.shards, 'success').ok, false);
  assert.equal(verifyShardReports(polariscope.expected, polariscope.shards, 'success').ok, false);
  assert.equal(verifyShardReports(instruments.expected, instruments.shards, 'success').ok, true);
});
