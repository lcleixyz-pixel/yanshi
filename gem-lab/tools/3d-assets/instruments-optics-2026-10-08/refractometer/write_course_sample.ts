/** Export the single course sample from app data before the Blender build. */
import { SAMPLES_BY_ID } from '../../../../src/data/samples';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = new URL('../../../../assets-source/refractometer/course-v2/', import.meta.url);
mkdirSync(dir, {recursive:true});
const ri = SAMPLES_BY_ID.spinel.characteristics.refractiveIndex;
if(typeof ri !== 'number') throw new Error('Course needs a single isotropic RI');
writeFileSync(fileURLToPath(new URL('sample-input.json',dir)), JSON.stringify({id:'spinel',ri},null,2)+'\n');
