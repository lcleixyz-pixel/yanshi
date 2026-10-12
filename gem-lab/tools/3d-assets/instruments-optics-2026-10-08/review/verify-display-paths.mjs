import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { displayPaths, WHITE_LIGHT_COLOR } from './display-paths.mjs';

const root=new URL('../../../../assets-source/optics-paper-review/2026-10-08/',import.meta.url);
const checks=[];
for(const instrument of ['grating-spectroscope','prism-spectroscope']){
  const {cases}=JSON.parse(readFileSync(new URL(`${instrument}/optical-cases.json`,root)));
  for(const c of cases){
    const original=JSON.stringify(c.paths), actual=displayPaths(instrument,c.paths);
    const mustSplit=instrument==='grating-spectroscope'||new Set(c.paths.map(p=>p.wavelengthNm)).size>1;
    if(mustSplit){
      const incident=actual.filter(p=>p.kind==='incident-white');
      assert.equal(incident.length,1,'Coincident incident components must be drawn only once');
      assert.equal(incident[0].color,WHITE_LIGHT_COLOR);
      for(const originalPath of c.paths){
        const kind=instrument==='grating-spectroscope'?'diffraction':'refraction';
        const boundary=originalPath.interactions.find(e=>e.kind===kind).pointIndex;
        const outgoing=actual.find(p=>p.sourcePathId===originalPath.id);
        assert.deepEqual(incident[0].points,originalPath.points.slice(0,boundary+1));
        assert.deepEqual(outgoing.points,originalPath.points.slice(boundary));
        assert.equal(outgoing.color,instrument==='grating-spectroscope'&&originalPath.order===0?WHITE_LIGHT_COLOR:originalPath.color);
      }
      const reversed=displayPaths(instrument,[...c.paths].reverse());
      assert.deepEqual(reversed.find(p=>p.kind==='incident-white'),incident[0], 'Input color must not depend on wavelength draw order');
    }else assert.deepEqual(actual,c.paths,'Monochromatic input keeps its wavelength color');
    assert.equal(JSON.stringify(c.paths),original,'Presentation must not mutate verified ray coordinates');
    checks.push({instrument,caseId:c.id,passed:true});
  }
}
const out=new URL('publication-prep/display-path-checks.json',root);mkdirSync(new URL('.',out),{recursive:true});
writeFileSync(out,JSON.stringify({passed:checks.length,failed:0,checks},null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,failed:0,report:fileURLToPath(out)}));
