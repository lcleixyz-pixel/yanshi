import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runShardVerifier, verifyShardReports as verifyReports } from './shard-completeness.mjs';

export const EXPECTED_CASE_COUNT = 91;
export const SHARD_COUNT = 3;
const options = { expectedCaseCount: EXPECTED_CASE_COUNT, shardCount: SHARD_COUNT };

/** 其他仪器的独立集合：完整执行原有规格，不能用报告总数代替用例身份。 */
export function verifyShardReports(expectedReport, shardReports, shardJobResult) {
  return verifyReports(expectedReport, shardReports, shardJobResult, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  runShardVerifier({ ...options, reportPrefix: 'instrument-shard', title: 'Other instrument' });
