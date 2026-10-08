/** Node-only protocol regression; never creates a WebGL context or launches Blender. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {illuminationContractErrors, illuminationPlan, defaultHiddenNodes} from './instruments-review-state.mjs';
import {verifyIrisMorphGeometry, verifyRound3Contract} from './verify-round3-contract.mjs';

let input = ''; for await (const chunk of process.stdin) input += chunk;
const manifest = JSON.parse(input);
// The shared Python module supplies real mode/geometry rules. These minimal part
// references are fixtures; only verify-instruments checks the exported GLB nodes.
manifest.parts = [...new Set([...Object.values(manifest.illuminationMechanics).map(m => m.partId), ...Object.values(manifest.sourceNodes).map(s => s.partId)])].map(id => ({id}));
manifest.irisMechanics = {angleRangeDegrees:[0,90]};
const names = [...Object.values(manifest.illuminationMechanics), ...Object.values(manifest.sourceNodes)].map(x => x.node);
const checks = [];
function check(name, run) { run(); checks.push({name, passed:true}); }
check('eight complete mode contracts', () => assert.deepEqual(illuminationContractErrors(manifest,names), []));
check('every mode drives five mechanisms and three independent emissions', () => {
  for (const mode of manifest.illuminationModes) {
    const before = JSON.stringify(mode.states), plan = illuminationPlan(manifest,mode.states);
    assert.equal(plan.transforms.length,5); assert.equal(plan.emissions.length,3);
    assert.equal(plan.emissions.filter(e => e.intensity > 0).length,1);
    assert.equal(plan.irisAngleDegrees,mode.states.irisAngleDegrees);
    assert.equal(JSON.stringify(mode.states),before);
    assert.equal(plan.transforms.find(m => m.partId === 'darkfieldStop').distance,plan.transforms.find(m => m.partId === 'brightfieldLever').distance);
  }
});
check('darkfield brightfield darkfield restores identical default plan', () => {
  const dark = manifest.illuminationModes.find(m => m.id === 'darkfield'), bright = manifest.illuminationModes.find(m => m.id === 'brightfield');
  const initial = illuminationPlan(manifest,dark.states);
  assert.notDeepEqual(illuminationPlan(manifest,bright.states).transforms,initial.transforms);
  assert.deepEqual(illuminationPlan(manifest,dark.states),initial);
});
check('missing mode, source, plate state and wrong stop are rejected', () => {
  for (const mutate of [m => m.illuminationModes.pop(), m => delete m.sourceNodes.fiber, m => delete m.illuminationModes[0].states.analyzer, m => m.illuminationModes[0].states.darkfieldStop = 'open']) {
    const broken = structuredClone(manifest); mutate(broken); assert.ok(illuminationContractErrors(broken,names).length);
  }
  assert.ok(illuminationContractErrors(manifest,names.filter(n => n !== 'GemMicroscope_TopEmission')).length);
});
check('optical overlay hidden independently of accessory visibility', () => assert.deepEqual(defaultHiddenNodes({parts:[{node:'path',teachingOverlay:true,defaultVisible:false},{node:'bottle',accessory:true,defaultVisible:true}]}),['path']));

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.join(app,'public/assets/3d/gem-microscope/structure-v1');
const current = JSON.parse(await fs.readFile(path.join(folder,'manifest.json'),'utf8')), bytes = await fs.readFile(path.join(folder,'model.glb'));
const json = JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)).trim());
check('GLB decoder accepts existing Blender sparse morph accessors', () => assert.equal(verifyIrisMorphGeometry(current,json,bytes).ok,true));
check('incorrect aperture mapping is rejected against real morph positions', () => {
  const broken = structuredClone(current); broken.irisMechanics.apertureDiameterRangeMeters=[.015,.06];
  assert.equal(verifyIrisMorphGeometry(broken,json,bytes).ok,false);
});
check('round 3 gate refuses a previous revision', () => {
  const old = {...current,version:'structure-2',revision:'repair-v2'};
  assert.match(verifyRound3Contract('gem-microscope',old,{},json,bytes).errors.join(' '),/has not been generated/);
});
console.log(JSON.stringify({ok:true,scope:'Node protocol and validator regression; no browser or round-3 export acceptance',existingGLBRevision:current.revision,checks},null,2));
