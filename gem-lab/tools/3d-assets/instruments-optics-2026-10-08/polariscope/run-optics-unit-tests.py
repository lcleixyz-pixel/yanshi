#!/usr/bin/env python3
"""Run the existing test_optics.py suite and save an explicit, scoped report."""
import argparse
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import time
import unittest

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input-dir',type=Path,required=True,help='Public package used only to bind the report to model/case hashes.')
parser.add_argument('--output-dir',type=Path)
args=parser.parse_args()
asset=args.input_dir.resolve();output=args.output_dir.resolve() if args.output_dir else asset/'validation'
test_file=Path(__file__).resolve().parent.parent/'refractometer/test_optics.py'
sys.path.insert(0,str(test_file.parent))
spec=importlib.util.spec_from_file_location('public_optics_math_tests',test_file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
stream=io.StringIO();suite=unittest.defaultTestLoader.loadTestsFromModule(module);start=time.monotonic()
result=unittest.TextTestRunner(stream=stream,verbosity=2).run(suite)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
report={'schemaVersion':1,'inputDirectory':str(asset),'testFile':str(test_file),'testFileSha256':sha(test_file),
        'opticsModuleSha256':sha(test_file.parent/'optics.py'),'modelSha256':sha(asset/'model.glb'),'casesSha256':sha(asset/'optical-cases.json'),
        'scope':'Existing four mathematical unit tests from test_optics.py. These use the author formulas and generated mathematical cases; they do not read the public GLB. The public GLB is separately checked by independent_refractometer.py.',
        'pass':result.wasSuccessful(),'testsRun':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'seconds':time.monotonic()-start,'log':stream.getvalue()}
output.mkdir(parents=True,exist_ok=True);(output/'test-optics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(stream.getvalue());print(json.dumps({k:report[k] for k in ['pass','testsRun','failures','errors','modelSha256']},indent=2))
raise SystemExit(0 if result.wasSuccessful() else 1)
