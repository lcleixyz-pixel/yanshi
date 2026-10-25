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

test('折射仪 v2 窄条资产与独立检查绑定同一模型及案例，原半圆柱参数保留', () => {
  const v2 = new URL('../../public/assets/3d/refractometer/paper-optics-v2/', import.meta.url);
  const json = (file: string) => JSON.parse(fs.readFileSync(new URL(file, v2), 'utf8'));
  const mf = json('manifest.json'), bytes = fs.readFileSync(new URL('model.glb', v2));
  const hash = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(mf.modelSha256, hash(bytes)); assert.equal(mf.modelBytes, bytes.length);
  assert.equal(mf.version, 'paper-optics-v2'); assert.deepEqual(mf.contactWindow.sizeMeters, [.0036, .010]);
  // 2026-10-25：窗口长边改沿钢台长边（前后方向 T），与 axes[1] 对应。
  assert.ok(mf.contactWindow.sizeMeters[1] > mf.contactWindow.sizeMeters[0]);
  assert.equal(mf.contactWindow.directExposedPrism, true);
  const before = read('refractometer', 'manifest.json').parts.find((p: {id: string}) => p.id === 'test_prism');
  const after = mf.parts.find((p: {id: string}) => p.id === 'test_prism');
  for (const k of ['radiusMeters','lengthMeters','cylinderAxis','contactNormal','refractiveIndexIllustrative']) assert.deepEqual(after[k], before[k]);
  for (const file of ['validation/independent-refractometer.json','validation/gltf-validator.json']) {
    const report = json(file); assert.equal(report.modelSha256, mf.modelSha256); assert.equal(report.casesSha256, hash(fs.readFileSync(new URL('optical-cases.json',v2))));
    assert.equal(report.ok ?? report.pass, true);
  }
  assert.equal(json('validation/gltf-validator.json').errors, 0);
});
