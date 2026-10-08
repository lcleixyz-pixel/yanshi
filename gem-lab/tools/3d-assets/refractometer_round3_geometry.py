"""Shared metre geometry and offline ray checks; never imports Blender.

The builder consumes these surfaces, apertures, solids and polylines.  This checks
geometric routing, not wavelength-dependent lens imaging or scale calibration.
Run: python3 gem-lab/tools/3d-assets/refractometer_round3_geometry.py
"""
from pathlib import Path
import argparse
import hashlib
import json
import math


def add(a, b): return tuple(x + y for x, y in zip(a, b))
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def mul(a, s): return tuple(x * s for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def length(a): return math.sqrt(dot(a, a))
def unit(a): return mul(a, 1 / length(a))
def reflect(d, n): return sub(d, mul(n, 2 * dot(d, n)))
def gl(v): return [v[0], v[2], -v[1]]


def basis(n):
    u = unit(cross((1, 0, 0) if abs(n[0]) < .9 else (0, 1, 0), n))
    return u, cross(n, u), tuple(n)


def box(name, center, size, axes=None):
    return dict(name=name, center=center, size=size,
                axes=axes or ((1, 0, 0), (0, 1, 0), (0, 0, 1)))


def build_geometry():
    angle = math.radians(8.5)
    normal = (0, -math.sin(angle), math.cos(angle))
    tangent = (0, -math.cos(angle), -math.sin(angle))
    stage_axes = ((1, 0, 0), mul(tangent, -1), normal)
    stage = (0, .026, .0755)
    center = add(stage, mul(normal, .0012))
    incoming = add(mul(tangent, math.sin(math.radians(60))), mul(normal, .5))
    outgoing = reflect(incoming, normal)
    first = sub(center, mul(incoming, .034))
    source = (.022, .057, .053)
    first_normal = unit(sub(unit(sub(first, source)), incoming))
    down = unit(sub((0, 0, -1), mul(first_normal, dot((0, 0, -1), first_normal))))
    second = add(center, mul(outgoing, .085))
    eye_axis = unit((0, -.48, .877268))
    eye = add(second, mul(eye_axis, .025))
    second_normal = unit(sub(outgoing, eye_axis))
    surfaces = {
        'first_mirror': dict(center=add(first, mul(down, .0017)), normal=first_normal, radius=.0115, chiefPoint=first),
        'internal_scale': dict(center=add(center, mul(outgoing, .022)), normal=outgoing, radius=.009),
        'lens_group': dict(center=add(center, mul(outgoing, .046)), normal=outgoing, radius=.010),
        'second_mirror': dict(center=second, normal=second_normal, radius=.009),
        'eyepiece': dict(center=eye, normal=eye_axis, radius=.0127),
    }
    solids = [
        box('White stage step', add(stage, mul(normal, -.0048)), (.050, .070, .0096), stage_axes),
        box('Steel stage', add(stage, mul(normal, .0004)), (.044, .062, .0016), stage_axes),
        box('Internal source carrier', (.024, .057, .0505), (.002, .010, .041)),
    ]
    # Mirror carriers are on the back of the reflective face: both adjoining
    # rays lie on the opposite half-space.  Closed, finite solids are checked.
    for name in ['first_mirror', 'second_mirror']:
        s = surfaces[name]
        solids.append(box(name + ' carrier', add(s['center'], mul(s['normal'], .0012)),
                          (s['radius']*2, s['radius']*2, .0018), basis(s['normal'])))
    return dict(
        units='meter', version='structure-3', revision='repair-v3', stageCenter=stage,
        stageAxes=stage_axes, stageNormal=normal, stageTangent=tangent,
        prism=dict(center=center, radius=.006, length=.017, axis=(1, 0, 0), index=1.88),
        source=source, sourcePanel=box('Amber LED emitting panel', (.022, .057, .0505), (.0005, .008, .038)),
        incoming=incoming, outgoing=outgoing, surfaces=surfaces, eyeAxis=eye_axis,
        eyeBase=eye, focusTravel=.006, mainAngleDegrees=60,
        outerWidth=.068, innerWidth=.062,
        outerProfile=[(-.0825,.004),(.0825,.004),(.0825,.083),(-.014,.068),(-.025,.060),(-.0825,.028)],
        innerProfile=[(-.079,.007),(.079,.007),(.079,.079),(-.012,.064),(-.023,.057),(-.079,.025)],
        shellAperture=box('Stage opening through enclosure', add(stage, mul(normal, -.002)), (.045,.063,.040), stage_axes),
        eyeOpening=dict(center=eye, normal=eye_axis, radius=.0143, halfLength=.020),
        stepAperture=box('Stage step internal relief', stage, (.043,.060,.040), stage_axes),
        prismAperture=box('Dark prism window', add(stage, mul(normal, .0005)), (.0174,.0124,.022), stage_axes),
        solids=solids, fanSamples=17, stoneIndexRange=(1.35,1.80),
    )


GEOMETRY = build_geometry()


def plane_hit(origin, direction, surface):
    denominator = dot(direction, surface['normal'])
    if abs(denominator) < 1e-12:
        raise ValueError('Ray parallel to optical surface')
    t = dot(sub(surface['center'], origin), surface['normal']) / denominator
    p = add(origin, mul(direction, t))
    offset = length(sub(p, surface['center']))
    return dict(point=p, t=t, offset=offset,
                withinAperture=offset <= surface['radius'] + 1e-9)


def polygon_contains(p, polygon):
    y, z = p
    inside = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a[1] > z) != (b[1] > z) and y < (b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0]:
            inside = not inside
    return inside


def local(p, b): return tuple(dot(sub(p, b['center']), a) for a in b['axes'])
def in_box(p, b): return all(abs(x) < s/2-1e-10 for x, s in zip(local(p, b), b['size']))


def box_breaks(a, d, b):
    out = []
    for q, v, size in zip(local(a, b), (dot(d, x) for x in b['axes']), b['size']):
        if abs(v) > 1e-14:
            out.extend(((-size/2-q)/v, (size/2-q)/v))
    return out


def cylinder_breaks(a, d, c):
    q = sub(a, c['center']); n = c['normal']
    qp = sub(q, mul(n, dot(q, n))); dp = sub(d, mul(n, dot(d, n)))
    aa, bb, cc = dot(dp, dp), 2*dot(qp, dp), dot(qp, qp)-c['radius']**2
    out = []
    if aa > 1e-20 and bb*bb-4*aa*cc >= 0:
        root = math.sqrt(max(0, bb*bb-4*aa*cc))
        out.extend(((-bb-root)/(2*aa), (-bb+root)/(2*aa)))
    dn = dot(d, n)
    if abs(dn) > 1e-14:
        out.extend(((-c['halfLength']-dot(q,n))/dn,(c['halfLength']-dot(q,n))/dn))
    return out


def in_cylinder(p, c):
    q = sub(p, c['center']); axial = dot(q, c['normal'])
    return abs(axial) < c['halfLength'] and length(sub(q,mul(c['normal'],axial))) < c['radius']


def segment_obstructions(a, b, g):
    """Exact line partition at every solid boundary, then interval classification.

    Profiles are polygonal, holes/boxes planar and the eye bore cylindrical.
    This checks the nominal solids consumed by Blender; Blender booleans,
    bevel tessellation and the eventual GLB still require the separate audit.
    """
    d = sub(b, a)
    breaks = [0., 1.]
    for width in [g['outerWidth'], g['innerWidth']]:
        if abs(d[0]) > 1e-14:
            breaks.extend(((-width/2-a[0])/d[0], (width/2-a[0])/d[0]))
    for profile in [g['outerProfile'], g['innerProfile']]:
        for p, q in zip(profile, profile[1:] + profile[:1]):
            edge = (q[0]-p[0], q[1]-p[1]); normal = (-edge[1], edge[0])
            denominator = d[1]*normal[0] + d[2]*normal[1]
            if abs(denominator) > 1e-14:
                breaks.append(((p[0]-a[1])*normal[0]+(p[1]-a[2])*normal[1])/denominator)
    for item in g['solids'] + [g['shellAperture'],g['stepAperture'],g['prismAperture']]:
        breaks.extend(box_breaks(a,d,item))
    breaks.extend(cylinder_breaks(a,d,g['eyeOpening']))
    breaks = sorted(set([0.,1.] + [max(0.,min(1.,t)) for t in breaks if 0 < t < 1]))
    blocked = set()
    for lo, hi in zip(breaks,breaks[1:]):
        if hi-lo < 1e-10: continue
        p = add(a,mul(d,(lo+hi)/2))
        shell = abs(p[0]) < g['outerWidth']/2 and polygon_contains(p[1:],g['outerProfile'])
        cavity = abs(p[0]) < g['innerWidth']/2 and polygon_contains(p[1:],g['innerProfile'])
        if shell and not (cavity or in_box(p,g['shellAperture']) or in_cylinder(p,g['eyeOpening'])):
            blocked.add('opaque enclosure')
        for solid in g['solids']:
            if not in_box(p,solid): continue
            if solid['name']=='White stage step' and in_box(p,g['stepAperture']): continue
            if solid['name']=='Steel stage' and in_box(p,g['prismAperture']): continue
            blocked.add(solid['name'])
    return sorted(blocked)


def make_paths(g):
    c=g['prism']['center']; r=g['prism']['radius']; s=g['surfaces']
    main=[g['source'],s['first_mirror']['chiefPoint'],sub(c,mul(g['incoming'],r)),c,
          add(c,mul(g['outgoing'],r)),s['internal_scale']['center'],s['lens_group']['center'],
          s['second_mirror']['center'],g['eyeBase']]
    fan=[]
    low,high=[math.asin(n/g['prism']['index']) for n in g['stoneIndexRange']]
    for k in range(g['fanSamples']):
        theta=low+(high-low)*k/(g['fanSamples']-1)
        incoming=add(mul(g['stageTangent'],math.sin(theta)),mul(g['stageNormal'],math.cos(theta)))
        outgoing=reflect(incoming,g['stageNormal'])
        mh=plane_hit(c,mul(incoming,-1),s['first_mirror'])
        before=reflect(incoming,s['first_mirror']['normal'])
        source_t=(g['source'][0]-mh['point'][0])/(-before[0])
        source=add(mh['point'],mul(before,-source_t))
        sh=plane_hit(c,outgoing,s['internal_scale'])
        fan.append(dict(angleDegrees=math.degrees(theta), stoneIndex=g['prism']['index']*math.sin(theta),
                        mirrorHit=mh,scaleHit=sh,sourcePoint=source,incoming=incoming,outgoing=outgoing,
                        points=[source,mh['point'],sub(c,mul(incoming,r)),c,add(c,mul(outgoing,r)),sh['point']]))
    return main,fan


def check_geometry(g=None):
    g=g or GEOMETRY; s=g['surfaces']; checks=[]
    def check(name,passed,**details):checks.append(dict(name=name,pass_=bool(passed),**details))
    main,fan=make_paths(g); normal=g['stageNormal']; c=g['prism']['center']; r=g['prism']['radius']
    # Reflection is calculated from actual source and normals, then intersected
    # with the contact plane.  It is not inferred just from named route vertices.
    first_direction=unit(sub(s['first_mirror']['chiefPoint'],g['source']))
    reflected=reflect(first_direction,s['first_mirror']['normal'])
    contact=plane_hit(s['first_mirror']['chiefPoint'],reflected,dict(center=c,normal=normal,radius=.00001))
    incidence=math.degrees(math.acos(max(-1,min(1,dot(reflected,normal)))))
    check('first mirror sends main ray to contact centre',contact['t']>0 and contact['withinAperture'],missMeters=contact['offset'])
    check('main incidence is 60 degrees to contact normal',abs(incidence-60)<1e-9,angleDegrees=incidence)
    out=reflect(reflected,normal); hits=[]
    for name in ['internal_scale','lens_group','second_mirror']:
        hit=plane_hit(c,out,s[name]);hits.append(hit)
        check('main ray hits '+name,hit['t']>0 and hit['withinAperture'],distanceMeters=hit['t'],missMeters=hit['offset'])
    check('scale then lens then mirror are ordered',all(a['t']<b['t'] for a,b in zip(hits,hits[1:])))
    second_out=reflect(out,s['second_mirror']['normal'])
    eye_hit=plane_hit(hits[-1]['point'],second_out,s['eyepiece'])
    check('second mirror sends ray onto eyepiece axis',eye_hit['t']>0 and eye_hit['offset']<1e-9 and length(cross(second_out,g['eyeAxis']))<1e-9,missMeters=eye_hit['offset'])
    radial=[]
    for row in fan:
        pin,pout=row['points'][2],row['points'][4]
        radial.append(max(length(cross(unit(sub(pin,c)),row['incoming'])),length(cross(unit(sub(pout,c)),row['outgoing']))))
    check('all angular fan rays enter and leave curve radially',max(radial)<1e-10,maxCrossProduct=max(radial))
    check('prism cylinder axis is width X',g['prism']['axis']==(1,0,0) and abs(dot(normal,g['prism']['axis']))<1e-12)
    panel=g['sourcePanel']; source_aperture_ok=all(abs(x['sourcePoint'][1]-panel['center'][1])<=panel['size'][1]/2 and abs(x['sourcePoint'][2]-panel['center'][2])<=panel['size'][2]/2 for x in fan)
    check('fan reverse rays hit finite rear emitting panel',source_aperture_ok)
    check('fan hits finite first mirror and transparent scale',all(x['mirrorHit']['t']>0 and x['mirrorHit']['withinAperture'] and x['scaleHit']['t']>0 and x['scaleHit']['withinAperture'] for x in fan),maxMirrorRadiusMeters=max(x['mirrorHit']['offset'] for x in fan),maxScaleRadiusMeters=max(x['scaleHit']['offset'] for x in fan))
    obstructions=[]
    for tag,points in [('main',main)]+[(f'fan-{i}',x['points']) for i,x in enumerate(fan)]:
        for i,(a,b) in enumerate(zip(points,points[1:])):
            blocked=segment_obstructions(a,b,g)
            if blocked:obstructions.append(dict(path=tag,segment=i,blockedBy=blocked))
    check('checked main and extended fan segments clear nominal opaque solids',not obstructions,obstructions=obstructions)
    check('critical angle fan covers index 1.35 through 1.80',abs(fan[0]['stoneIndex']-1.35)<1e-12 and abs(fan[-1]['stoneIndex']-1.80)<1e-12)
    # Focus translates along the outgoing ray: lens intersection stays centred.
    focus_hits=[]
    for travel in [0,g['focusTravel']/2,g['focusTravel']]:
        shifted={**s['eyepiece'],'center':add(g['eyeBase'],mul(g['eyeAxis'],travel))}
        focus_hits.append(plane_hit(hits[-1]['point'],second_out,shifted)['offset'])
    check('focus endpoints and midpoint preserve main axis',max(focus_hits)<1e-9,travelMeters=g['focusTravel'])
    for item in checks:item['pass']=item.pop('pass_')
    return dict(ok=all(x['pass'] for x in checks),round=3,scope='Pure Python nominal geometry; builder consumes these same solids and optical surfaces.',
                units='meter',mainAngleDegrees=incidence,criticalAngleRangeDegrees=[fan[0]['angleDegrees'],fan[-1]['angleDegrees']],
                mainRayPointsNative=main,mainRayPointsMeters=[gl(p) for p in main],fanSamples=len(fan),fan=fan,
                mirrorNormalsNative={k:s[k]['normal'] for k in ['first_mirror','second_mirror']},checks=checks,
                limitations=['No Blender, evaluated mesh, GLB or browser execution was performed by this mathematical check.',
                            'Main ray checked through eyepiece; 17 angular fan rays checked from an extended rear LED panel through first mirror and prism to the scale. The fan is not propagated through the lens group or eyepiece.',
                            'Curved-surface normal incidence and planar mirror reflection are geometric tests. Lens aberrations, Fresnel intensity, contact liquid, wavelength-dependent refraction and scale tick calibration are not simulated.',
                            'Exact line/nominal-solid interval intersections cover shell, stage and mirror/source carriers. Exported bevels and display tick geometry require the Blender/GLB inspection.'],
                sourceSha256={name:hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                              for name in ['refractometer_round3_geometry.py','build_refractometer.py']})


def write_report(path, g=None):
    report=check_geometry(g)
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return report


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[2]/'assets-source/instruments-2026-10-07/round3/refractometer-optical-path-check.json')
    args=parser.parse_args();result=write_report(args.output)
    print(json.dumps({'ok':result['ok'],'mainAngleDegrees':result['mainAngleDegrees'],'criticalAngleRangeDegrees':result['criticalAngleRangeDegrees'],'checks':result['checks'],'report':str(args.output)},ensure_ascii=False,indent=2))
    raise SystemExit(0 if result['ok'] else 1)
