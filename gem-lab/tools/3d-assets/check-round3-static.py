"""Run round-3 syntax, shared-geometry and review-protocol checks without Blender."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys

TOOLS = Path(__file__).resolve().parent
APP = TOOLS.parents[1]
OUT = APP / 'assets-source/instruments-2026-10-07/round3'
OUT.mkdir(parents=True, exist_ok=True)
sys.dont_write_bytecode = True
sys.path.insert(0, str(TOOLS))

# Pure modules only: never import the Blender builders even for syntax checking.
import refractometer_round3_geometry as refractometer
import microscope_round3_geometry as microscope
import spectroscope_geometry as spectroscope

python_files = ['build_refractometer.py','refractometer_round3_geometry.py',
                'build_gem_microscope.py','microscope_round3_geometry.py',
                'blender/build_spectroscopes.py','spectroscope_geometry.py',
                'finalize_spectroscopes.py','spectroscope-review-sheets.py',
                'inspect_refractometer_candidate.py','render_refractometer_views.py',
                'compose_refractometer_review.py','compose_microscope_review.py','check-round3-static.py']
js_files = ['verify-instruments.mjs','verify-round3-contract.mjs','verify_refractometer.mjs',
            'instruments-review.mjs','instruments-review-state.mjs','check-round3-review.mjs']
syntax = []
for name in python_files:
    ast.parse((TOOLS/name).read_text(), filename=name)
    syntax.append({'file':name,'method':'ast.parse (no execution)','ok':True})
for name in js_files:
    subprocess.run(['node','--check',str(TOOLS/name)],check=True,capture_output=True,text=True)
    syntax.append({'file':name,'method':'node --check','ok':True})

reports = microscope.write_reports(OUT)
reports['refractometer-optical-path-check.json'] = refractometer.write_report(OUT/'refractometer-optical-path-check.json')
reports['amici-geometry-check.json'] = spectroscope.geometry_report()
(OUT/'amici-geometry-check.json').write_text(json.dumps(reports['amici-geometry-check.json'],ensure_ascii=False,indent=2)+'\n')
review = subprocess.run(['node',str(TOOLS/'check-round3-review.mjs')],input=json.dumps(microscope.manifest_fields()),capture_output=True,text=True,check=True)
reports['review-protocol-check.json'] = json.loads(review.stdout)
(OUT/'review-protocol-check.json').write_text(review.stdout)
report = {'round':3,'ok':all(r['ok'] for r in reports.values()),
          'scope':'syntax and mathematical checks only; Blender export, reimport, renders and browser review are pending',
          'syntax':syntax,'reports':{name:{'ok':r['ok'],'scope':r['scope']} for name,r in reports.items()},
          'sourceSha256':{name:hashlib.sha256((TOOLS/name).read_bytes()).hexdigest() for name in python_files+js_files}}
(OUT/'static-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'ok':report['ok'],'syntaxFiles':len(syntax),'reports':report['reports'],'output':str(OUT)},ensure_ascii=False,indent=2))
raise SystemExit(0 if report['ok'] else 1)
