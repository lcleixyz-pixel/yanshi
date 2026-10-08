/** Use the installed official Khronos validator; never install/update dependencies. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {parseArgs} from 'node:util';
import {createRequire} from 'node:module';
import validator from 'gltf-validator';

const {values:options}=parseArgs({options:{'input-dir':{type:'string'},'output-dir':{type:'string'},help:{type:'boolean'}}});
if(options.help||!options['input-dir']){console.log('node validate-public-asset.mjs --input-dir ASSET_DIR [--output-dir VALIDATION_DIR]');process.exit(options.help?0:2);}
const input=path.resolve(options['input-dir']), output=path.resolve(options['output-dir']??path.join(input,'validation'));
const data=await fs.readFile(path.join(input,'model.glb')),manifest=JSON.parse(await fs.readFile(path.join(input,'manifest.json'),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex'),modelSha256=hash(data);
const require=createRequire(import.meta.url),validatorPackage=JSON.parse(await fs.readFile(path.join(path.dirname(require.resolve('gltf-validator')),'package.json'),'utf8'));
const raw=await validator.validateBytes(new Uint8Array(data),{uri:'model.glb',maxIssues:1000,
  externalResourceFunction:uri=>Promise.reject(new Error(`External resource is not self-contained: ${uri}`))});
const checks=[{name:'manifest.modelSha256 equals delivered GLB',pass:manifest.modelSha256===modelSha256},
  {name:'manifest.modelBytes equals delivered GLB size',pass:manifest.modelBytes===data.length},
  {name:'legacy sha256 agrees where present',pass:manifest.sha256===undefined||manifest.sha256===modelSha256},
  {name:'independent public version label',pass:manifest.version==='paper-optics-v1'},
  {name:'glTF Validator zero errors',pass:raw.issues.numErrors===0}];
const report={schemaVersion:1,checkedAt:new Date().toISOString(),inputDirectory:input,modelSha256,modelBytes:data.length,
  casesSha256:hash(await fs.readFile(path.join(input,'optical-cases.json'))),validator:{name:'gltf-validator',version:validatorPackage.version,node:process.version},
  entrySha256:hash(await fs.readFile(fileURLToPath(import.meta.url))),errors:raw.issues.numErrors,warnings:raw.issues.numWarnings,infos:raw.issues.numInfos,
  pass:checks.every(c=>c.pass),checks,scope:'Binary format and local package metadata only; independent optics and browser checks are separate.',report:raw};
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'gltf-validator.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,modelSha256,modelBytes:data.length,errors:report.errors,warnings:report.warnings,checks},null,2));
if(!report.pass)process.exitCode=1;
