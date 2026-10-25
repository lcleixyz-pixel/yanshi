import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runShardVerifier, verifyShardReports as verifyReports } from './shard-completeness.mjs';

export const EXPECTED_CASE_COUNT = 73;
export const SHARD_COUNT = 3;
const options = { expectedCaseCount: EXPECTED_CASE_COUNT, shardCount: SHARD_COUNT };

/** 保留偏光镜既有接口与默认基线；其他套件不能改变这条门禁。 */
export function verifyShardReports(expectedReport, shardReports, shardJobResult) {
  return verifyReports(expectedReport, shardReports, shardJobResult, options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  runShardVerifier({ ...options, reportPrefix: 'polariscope-shard', title: 'Polariscope' });
