import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { displayPaths, WHITE_LIGHT_COLOR } from '../../src/components/optics3d/displayPaths.js';

const IDS = ['prism-spectroscope', 'grating-spectroscope', 'refractometer'] as const;
const dir = (id: string) => new URL(`../../public/assets/3d/${id}/paper-optics-v1/`, import.meta.url);
const read = (id: string, file: string) => JSON.parse(fs.readFileSync(new URL(file, dir(id)), 'utf8'));

test('三台 paper-optics-v1 网页资产哈希、大小与清单一致，光路示例齐全', () => {
  for (const id of IDS) {
    const manifest = read(id, 'manifest.json'), bytes = fs.readFileSync(new URL('model.glb', dir(id)));
    assert.equal(manifest.version, 'paper-optics-v1', id);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.modelSha256, id);
    assert.equal(bytes.length, manifest.modelBytes, id);
    assert.ok(read(id, 'optical-cases.json').cases.length > 0, id);
    assert.ok(fs.existsSync(new URL('sources.json', dir(id))) && fs.existsSync(new URL('poster.png', dir(id))), id);
  }
});

test('光栅入射段画成灰色白光且零级保持灰色；棱镜白光入射合并为一条灰线；折射仪路径不改', () => {
  const grating = read('grating-spectroscope', 'optical-cases.json');
  const shown = displayPaths('grating-spectroscope', grating.cases.find((c: { id: string }) => c.id === grating.defaultCaseId)?.paths ?? grating.cases[0].paths);
  const incident = shown.filter(p => p.kind === 'incident-white');
  assert.ok(incident.length >= 1); assert.ok(incident.every(p => p.color === WHITE_LIGHT_COLOR));
  assert.ok(!shown.some(p => p.kind !== 'incident-white' && p.order === 0 && p.color !== WHITE_LIGHT_COLOR));
  const prism = read('prism-spectroscope', 'optical-cases.json').cases.find((c: { id: string }) => c.id === 'white-light');
  assert.equal(displayPaths('prism-spectroscope', prism.paths).filter(p => p.kind === 'incident-white').length, 1);
  const refr = read('refractometer', 'optical-cases.json').cases[0].paths;
  assert.deepEqual(displayPaths('refractometer', refr), refr);
});
