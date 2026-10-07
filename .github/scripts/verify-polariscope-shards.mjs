import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const EXPECTED_CASE_COUNT = 55;
export const SHARD_COUNT = 3;

function collectCases(report, label, errors) {
  const rows = [];
  if (!report || !Array.isArray(report.suites)) {
    errors.push(`${label}: missing Playwright suites`);
    return rows;
  }
  if (!Array.isArray(report.errors) || report.errors.length !== 0)
    errors.push(`${label}: missing or nonempty global errors`);
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      if (typeof spec.id !== 'string' || !spec.id || !Array.isArray(spec.tests) || spec.tests.length === 0) {
        errors.push(`${label}: malformed test specification`);
        continue;
      }
      for (const test of spec.tests) {
        const project = test.projectId ?? test.projectName;
        if (typeof project !== 'string' || !project) {
          errors.push(`${label}: missing project for ${spec.id}`);
          continue;
        }
        rows.push({ key: JSON.stringify([spec.id, project]), test });
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(report);
  return rows;
}

const passed = ({ test }) => test.expectedStatus === 'passed' && test.status === 'expected' &&
  Array.isArray(test.results) && test.results.length > 0 &&
  test.results.every(result => result.status === 'passed');

/** Compare actual test identities, not only reporter totals, and fail closed. */
export function verifyShardReports(expectedReport, shardReports, shardJobResult) {
  const errors = [];
  const expected = collectCases(expectedReport, 'Expected list', errors);
  const wanted = new Set(expected.map(row => row.key));
  if (expected.length !== EXPECTED_CASE_COUNT || wanted.size !== EXPECTED_CASE_COUNT)
    errors.push(`Expected list must contain ${EXPECTED_CASE_COUNT} unique cases; found ${expected.length} rows / ${wanted.size} unique`);
  if (shardJobResult !== 'success') errors.push(`Shard job result is ${shardJobResult ?? 'missing'}, not success`);
  if (shardReports.length !== SHARD_COUNT) errors.push(`Expected ${SHARD_COUNT} shard reports; found ${shardReports.length}`);

  const actual = [];
  const shardNumbers = new Set();
  const shards = shardReports.map(({ shard, report }) => {
    if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT || shardNumbers.has(shard))
      errors.push(`Invalid or duplicate shard number: ${shard}`);
    shardNumbers.add(shard);
    if (report?.config?.shard?.current !== shard || report?.config?.shard?.total !== SHARD_COUNT)
      errors.push(`Shard ${shard}: report metadata does not match ${shard}/${SHARD_COUNT}`);
    const rows = collectCases(report, `Shard ${shard}`, errors);
    actual.push(...rows);
    return { shard, cases: rows.length, passed: rows.filter(passed).length };
  });
  const seen = new Set();
  for (const row of actual) {
    if (seen.has(row.key)) errors.push(`Duplicate executed case: ${row.key}`);
    seen.add(row.key);
    if (!wanted.has(row.key)) errors.push(`Unexpected executed case: ${row.key}`);
    if (!passed(row)) errors.push(`Case did not pass cleanly: ${row.key}`);
  }
  for (const key of wanted) if (!seen.has(key)) errors.push(`Missing executed case: ${key}`);
  if (actual.length !== EXPECTED_CASE_COUNT)
    errors.push(`Expected ${EXPECTED_CASE_COUNT} executed cases; found ${actual.length}`);

  return {
    ok: errors.length === 0,
    expectedCases: expected.length,
    executedCases: actual.length,
    uniqueCases: seen.size,
    passedCases: actual.filter(passed).length,
    shards,
    errors,
  };
}

function main() {
  const { values } = parseArgs({ options: {
    expected: { type: 'string' }, 'reports-dir': { type: 'string' }, output: { type: 'string' },
  } });
  if (!values.expected || !values['reports-dir'] || !values.output)
    throw new Error('Required: --expected <list.json> --reports-dir <directory> --output <summary.json>');
  let result;
  try {
    const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
    const shards = Array.from({ length: SHARD_COUNT }, (_, index) => ({
      shard: index + 1,
      report: read(path.join(values['reports-dir'], `polariscope-shard-${index + 1}`, 'results.json')),
    }));
    result = verifyShardReports(read(values.expected), shards, process.env.SHARDS_RESULT);
  } catch (error) {
    result = { ok: false, errors: [`Cannot read complete test evidence: ${error.message}`] };
  }
  fs.writeFileSync(values.output, `${JSON.stringify(result, null, 2)}\n`);
  const summary = [
    '### Polariscope completeness',
    ...(result.shards ?? []).map(shard => `- Shard ${shard.shard}: ${shard.passed} / ${shard.cases} passed`),
    `- Unique executed cases: ${result.uniqueCases ?? 0} / ${EXPECTED_CASE_COUNT}`,
    `- Clean passes: ${result.passedCases ?? 0} / ${EXPECTED_CASE_COUNT}`,
    `- Complete: ${result.ok ? 'PASS' : 'FAIL'}`,
    ...result.errors.map(error => `- ${error}`),
    '',
  ].join('\n');
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
