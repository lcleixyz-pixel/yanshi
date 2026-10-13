/** 导出全部教学样品的折射率，供离线生成逐样品光路案例（生成器不需要 Blender）。 */
import { SAMPLES } from '../../../../src/data/samples';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../../../../assets-source/refractometer/sample-cases-v1/', import.meta.url);
mkdirSync(dir, { recursive: true });
const samples = SAMPLES.map(({ id, name, characteristics }) => ({
  id,
  name,
  refractiveIndex: characteristics.refractiveIndex,
}));
const target = new URL('sample-inputs.json', dir);
writeFileSync(fileURLToPath(target), JSON.stringify({ schemaVersion: 1, source: 'src/data/samples.ts SAMPLES', samples }, null, 2) + '\n');
console.log(`已导出 ${samples.length} 个样品 → ${fileURLToPath(target)}`);
