"""Shared authoring geometry + stdlib-only round-3 checks; never imports bpy.

The builder consumes these exact parameters and mesh vertices. This checks the
teaching geometry, not a rendered GLB, measured optics, irradiance or mechanism.
Run: python3 gem-lab/tools/3d-assets/microscope_round3_geometry.py
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
from collections import Counter
from pathlib import Path

UNIT = .08325
CENTER_Y = -.23
SAMPLE = (0., CENTER_Y, 1.90)
SOURCE = (0., CENTER_Y, .87)
SOURCE_RADIUS = .035
OBJECTIVE = (0., CENTER_Y, 3.112)
OBJECTIVE_RADIUS = .185
OBJECTIVE_BELL_PROFILE = [(3.11,.23,.23),(3.13,.30,.30),(3.20,.32,.32),(3.29,.41,.41),(3.46,.42,.42)]
FOCUS_RANGE = (-.01 / UNIT, .01 / UNIT)
ELLIPSOID_A = .68
ELLIPSOID_C = (SAMPLE[2] - SOURCE[2]) / 2
ELLIPSOID_Z = (SAMPLE[2] + SOURCE[2]) / 2
ELLIPSOID_B = math.sqrt(ELLIPSOID_A ** 2 - ELLIPSOID_C ** 2)
REFLECTOR_Z_RANGE = (1.015, 1.30)
REFLECTOR_THICKNESS = .012
WELL_RADIUS = .345
STAGE_Z, STAGE_THICKNESS = 1.54, .31
STAGE_CUTTER_Z = (1.35, 1.72)
STAGE_CUTTER_RADII = (.410, WELL_RADIUS)
THROAT_Z, THROAT_THICKNESS = 1.47, .055

def stage_hole_radius(z):
    t=(z-STAGE_CUTTER_Z[0])/(STAGE_CUTTER_Z[1]-STAGE_CUTTER_Z[0])
    return STAGE_CUTTER_RADII[0]+t*(STAGE_CUTTER_RADII[1]-STAGE_CUTTER_RADII[0])

WELL_COVERAGE_RADIUS = max(WELL_RADIUS,stage_hole_radius(STAGE_Z+STAGE_THICKNESS/2))
STOP_Z, STOP_RADIUS, STOP_TRAVEL = 1.34, .10, .25
DIFFUSER_Z, POLARIZER_Z, ANALYZER_Z = 1.762, 1.805, 3.04
FILTER_RADIUS, FILTER_TRAVEL = .372, .83
ANALYZER_RADIUS, ANALYZER_TRAVEL = .222, .59
IRIS_COUNT = 12
IRIS_MIN, IRIS_MAX, IRIS_DEFAULT = .0075 / (2 * UNIT), .040 / (2 * UNIT), 1.0
IRIS_OUTER = .286
IRIS_Z, IRIS_LAYER_PITCH, IRIS_HALF_THICKNESS, IRIS_BEVEL = 1.713, .00135, .00055, .00015
IRIS_ARC_SAMPLES = 13
IRIS_LEVER_Z, IRIS_LEVER_RADIUS = 1.712, .010
IRIS_GRIP_Z, IRIS_GRIP_SIZE = 1.715, (.07,.055,.028)
TOP_CENTER = (0., CENTER_Y - .58, SAMPLE[2] + .58)
TOP_DIMENSIONS = (.65, .42, .32)
TOP_DIRECTION = (0., math.sqrt(.5), -math.sqrt(.5))
TOP_SOURCE = tuple(TOP_CENTER[i] + TOP_DIRECTION[i] * .15 for i in range(3))
TOP_KNOTS = [(0., -.96, 1.54), (0., -1.22, 1.75), (0., -1.25, 2.17), (0., -1.07, 2.65),
             tuple(TOP_CENTER[i] - TOP_DIRECTION[i] * .17 for i in range(3))]
TOP_NECK_RADIUS = .046
FIBER_CENTER = (.40, CENTER_Y, 1.96)
FIBER_KNOTS = [(.62, -.92, 1.53), (1.02, -.75, 1.70), (.99, -.13, 2.16), (.69, -.09, 2.13), FIBER_CENTER]
FIBER_NECK_RADIUS = .018
CLAMP_MOUNT = (-.55, .52)
CLAMP_PATH = [(*CLAMP_MOUNT,1.88), (-.52,.30,1.99), (-.41,-.14,1.99), (-.13,-.24,1.94)]
CLAMP_JAWS = [[(-.19, CENTER_Y+s*.035, 1.95), (-.07, CENTER_Y+s*.065, 1.91),
               (.015, CENTER_Y+s*.041, 1.89), (.034, CENTER_Y+s*.025, 1.915)] for s in (-1, 1)]
C_ARM_PROFILE = [(.48,.72), (1.02,.72), (1.09,.91), (1.09,3.29), (.99,3.51),
                 (.79,3.61), (.27,3.61), (-.35,3.49), (-.35,3.18), (.26,3.18),
                 (.48,3.09), (.64,2.89), (.69,2.59), (.69,1.05)]
STAGE_PROFILE = [(-1.09, -.98), (1.09, -.98), (1.09, .78), (-1.09, .78)]

# Round 4 keeps the already checked optical layout. Added mounting hardware is
# outside its ray envelope; the white pedestal is a structural base, not a lamp.
LAMP_CAP_Z, LAMP_CAP_DEPTH, LAMP_CAP_RADIUS = .811, .034, .545
LAMP_SOCKET_Z, LAMP_SOCKET_DEPTH, LAMP_SOCKET_RADIUS = .835, .026, .076
MOUNT_FLANGE_Z, MOUNT_FLANGE_DEPTH = 1.39, .055
MOUNT_FLANGE_INNER, MOUNT_FLANGE_OUTER = .425, .65
REFLECTOR_RETAINER_Z, REFLECTOR_RETAINER_DEPTH = 1.286, .026
REFLECTOR_RETAINER_INNER, REFLECTOR_RETAINER_OUTER = .447, .503
FILTER_GUIDES = [
    {'id':'diffuser','centerX':FILTER_TRAVEL/2,'halfY':.422,'z':DIFFUSER_Z-.014,
     'length':1.08,'radius':.012,'plateZ':DIFFUSER_Z,'plateX':FILTER_TRAVEL},
    {'id':'polarizer','centerX':-FILTER_TRAVEL/2,'halfY':.57,'z':POLARIZER_Z-.014,
     'length':1.08,'radius':.012,'plateZ':POLARIZER_Z,'plateX':-FILTER_TRAVEL},
    {'id':'analyzer','centerX':ANALYZER_TRAVEL/2,'halfY':.264,'z':ANALYZER_Z-.013,
     'length':.84,'radius':.009,'plateZ':ANALYZER_Z,'plateX':ANALYZER_TRAVEL},
]


def mounting_solids():
    """Shared closed primitives for the builder and conservative clearance test."""
    solids=[{'name':'Removable lamp chamber service cap','type':'cylinder','group':'lampHousingBase',
             'center':(0,CENTER_Y,LAMP_CAP_Z),'radius':LAMP_CAP_RADIUS,'depth':LAMP_CAP_DEPTH,'material':'black'},
            {'name':'Metal lamp socket and heat spreader','type':'cylinder','group':'lampMount',
             'center':(0,CENTER_Y,LAMP_SOCKET_Z),'radius':LAMP_SOCKET_RADIUS,'depth':LAMP_SOCKET_DEPTH,'material':'chrome'},
            {'name':'LED thermal contact collar','type':'cylinder','group':'lampMount',
             'center':(0,CENTER_Y,.864),'radius':.040,'depth':.007,'material':'chrome'},
            {'name':'Reflector outer retaining seat','type':'annulus','group':'reflector',
             'center':(0,CENTER_Y,REFLECTOR_RETAINER_Z),'inner':REFLECTOR_RETAINER_INNER,
             'outer':REFLECTOR_RETAINER_OUTER,'depth':REFLECTOR_RETAINER_DEPTH,'material':'black'}]
    for k in range(4):
        a=2*math.pi*k/4+math.pi/4
        solids.append({'name':'Captive service cap screw %d'%k,'type':'cylinder','group':'lampHousingBase',
                       'center':(.507*math.cos(a),CENTER_Y+.507*math.sin(a),.795),
                       'radius':.018,'depth':.010,'material':'chrome'})
    for g in FILTER_GUIDES:
        fixed='analyzerGuide' if g['id']=='analyzer' else 'filterGuides'
        for sign in (-1,1):
            y=CENTER_Y+sign*g['halfY']
            solids.append({'name':g['id']+' fixed guide rail '+str(sign),'type':'cylinder','group':fixed,
                           'center':(g['centerX'],y,g['z']),'radius':g['radius'],'depth':g['length'],
                           'axis':(1,0,0),'material':'chrome'})
            # The clamp-on analyzer carriage is fixed to the optical head and
            # follows focus. Stage rails have their own short fixed pedestals.
            if g['id']=='analyzer':
                solids.append({'name':'Analyzer bracket to objective '+str(sign),'type':'box','group':fixed,
                               'center':(-.10,y,3.09),'size':(.055,.040,.15),'material':'black'})
            else:
                for x in ((-.10,.93) if g['id']=='diffuser' else (-.93,.10)):
                    bottom=STAGE_Z+STAGE_THICKNESS/2-.008;top=g['z']+.006
                    solids.append({'name':g['id']+' fixed rail pedestal '+str((sign,x)),
                                   'type':'box','group':fixed,'center':(x,y,(bottom+top)/2),
                                   'size':(.058,.036,top-bottom),'material':'black'})
            # Sliding saddles move with the plate, the guide itself stays fixed.
            inner=ANALYZER_RADIUS+.007 if g['id']=='analyzer' else FILTER_RADIUS+.007
            span=g['halfY']-inner+.026
            solids.append({'name':g['id']+' sliding saddle '+str(sign),'type':'box','group':g['id'],
                           'center':(g['plateX'],CENTER_Y+sign*(inner+g['halfY'])/2,g['plateZ']-.006),
                           'size':(.10,span,.040),'material':'black',
                           'guideBore':{'center':(g['plateX'],y,g['z']),'radius':g['radius']+.002}})
    return solids


def add(a, b): return tuple(x+y for x, y in zip(a, b))
def sub(a, b): return tuple(x-y for x, y in zip(a, b))
def mul(v, k): return tuple(x*k for x in v)
def dot(a, b): return sum(x*y for x, y in zip(a, b))
def norm(v): return math.sqrt(dot(v, v))
def unit(v): return mul(v, 1/norm(v))
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def gl(v, scaled=True):
    s = UNIT if scaled else 1
    return [round(v[0]*s, 10), round(v[2]*s, 10), round(-v[1]*s, 10)]
FIBER_DIRECTION = unit(sub(SAMPLE, FIBER_CENTER))
FIBER_SOURCE = add(FIBER_CENTER, mul(FIBER_DIRECTION, .083))


def smooth_path(knots, steps=16):
    """Sample a Catmull-Rom path once; builder exports this same POLY curve."""
    result = []
    for i in range(len(knots)-1):
        p0,p1,p2,p3=knots[max(i-1,0)],knots[i],knots[i+1],knots[min(i+2,len(knots)-1)]
        for j in range(steps):
            t=j/steps
            result.append(tuple(.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t*t+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t*t*t) for k in range(3)))
    return result+[tuple(knots[-1])]


def reflector_point(z, theta):
    r=ELLIPSOID_B*math.sqrt(1-((z-ELLIPSOID_Z)/ELLIPSOID_A)**2)
    return (r*math.cos(theta), CENTER_Y+r*math.sin(theta), z)


def reflector_mesh(radial_segments=128, height_segments=24):
    """Closed ellipsoidal band; inner surface is the checked two-focus reflector."""
    verts=[];faces=[]
    for outside in (False, True):
        for j in range(height_segments+1):
            z=REFLECTOR_Z_RANGE[0]+(REFLECTOR_Z_RANGE[1]-REFLECTOR_Z_RANGE[0])*j/height_segments
            for i in range(radial_segments):
                p=reflector_point(z,2*math.pi*i/radial_segments)
                if outside:
                    n=unit((p[0]/ELLIPSOID_B**2,(p[1]-CENTER_Y)/ELLIPSOID_B**2,(p[2]-ELLIPSOID_Z)/ELLIPSOID_A**2))
                    p=add(p,mul(n,REFLECTOR_THICKNESS))
                verts.append(p)
    layer=(height_segments+1)*radial_segments
    for side in (0,1):
        base=side*layer
        for j in range(height_segments):
            for i in range(radial_segments):
                a=base+j*radial_segments+i;b=base+j*radial_segments+(i+1)%radial_segments
                f=(a,b,b+radial_segments,a+radial_segments)
                faces.append(f if side else tuple(reversed(f)))
    for j in (0,height_segments):
        for i in range(radial_segments):
            a=j*radial_segments+i;b=j*radial_segments+(i+1)%radial_segments
            faces.append((a,b,b+layer,a+layer) if j==0 else (b,a,a+layer,b+layer))
    return verts,faces


def blade_profile(k, radius):
    step=2*math.pi/IRIS_COUNT;a=k*step
    inner=[(radius*math.cos(a+step*1.90*i/(IRIS_ARC_SAMPLES-1)),
            CENTER_Y+radius*math.sin(a+step*1.90*i/(IRIS_ARC_SAMPLES-1))) for i in range(IRIS_ARC_SAMPLES)]
    outer=[(IRIS_OUTER*math.cos(a+step*(2.55-2.85*i/(IRIS_ARC_SAMPLES-1))),
            CENTER_Y+IRIS_OUTER*math.sin(a+step*(2.55-2.85*i/(IRIS_ARC_SAMPLES-1)))) for i in range(IRIS_ARC_SAMPLES)]
    return inner+outer


def inset_polygon(poly, distance):
    # Profile is clockwise; intersect adjacent parallel inset edges.
    result=[]
    area=sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))
    sign=1 if area>0 else -1
    for i,p in enumerate(poly):
        prev,nxt=poly[i-1],poly[(i+1)%len(poly)]
        d0=unit(sub(p,prev));d1=unit(sub(nxt,p))
        n0=(-d0[1]*sign,d0[0]*sign);n1=(-d1[1]*sign,d1[0]*sign)
        bis=add(n0,n1);shift=mul(bis,distance/(1+dot(n0,n1)))
        result.append(add(p,shift))
    return result


def blade_vertices(k, radius):
    """Explicit bevel loops preserve shape-target vertex correspondence."""
    poly=blade_profile(k,radius);inset=inset_polygon(poly,IRIS_BEVEL)
    z=IRIS_Z+k*IRIS_LAYER_PITCH
    loops=[(inset,-IRIS_HALF_THICKNESS),(poly,-IRIS_HALF_THICKNESS+IRIS_BEVEL),
           (poly,IRIS_HALF_THICKNESS-IRIS_BEVEL),(inset,IRIS_HALF_THICKNESS)]
    return [(x,y,z+dz) for loop,dz in loops for x,y in loop]


def blade_faces():
    n=IRIS_ARC_SAMPLES*2
    faces=[tuple(reversed(range(n))),tuple(3*n+i for i in range(n))]+[
        (j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i) for j in range(3) for i in range(n)]
    return [tuple(reversed(face)) for face in faces]  # clockwise plan, outward winding


def manifest_fields():
    def motion(part,states,default,travel,axis=(1,0,0)):
        return {'partId':part,'node':'GemMicroscope_'+part,'type':'translation','axisLocal':list(axis),
                'space':'asset-global','positionsMeters':{states[0]:0,states[1]:travel*UNIT},'defaultState':default,
                'motionIllustrative':True}
    mechanics={
        'darkfieldStop':motion('darkfieldStop',('closed','open'),'closed',STOP_TRAVEL),
        'brightfieldLever':motion('brightfieldLever',('closed','open'),'closed',STOP_TRAVEL),
        'diffuser':motion('diffuser',('out','in'),'out',-FILTER_TRAVEL),
        'polarizer':motion('polarizer',('out','in'),'out',FILTER_TRAVEL),
        'analyzer':motion('analyzer',('out','in'),'out',-ANALYZER_TRAVEL),
    }
    mechanics['brightfieldLever']['drivesPart']='darkfieldStop'
    mechanics['analyzer']['followsFocus']=True
    mechanics['analyzer']['note']='检偏夹片随物镜升降；插入后覆盖物镜入口，示意相对起偏轴为90°。'
    mode_specs=[('darkfield','暗域','closed',90,False,False,False,'bottom'),
                ('brightfield','亮域','open',90,False,False,False,'bottom'),
                ('pinpoint','点光源','open',0,False,False,False,'bottom'),
                ('diffused','漫射','open',90,True,False,False,'bottom'),
                ('polarized','偏光','open',90,False,True,True,'bottom'),
                ('shadowing','遮光','open',30,False,False,False,'bottom'),
                ('overhead','顶光','open',90,False,False,False,'top'),
                ('oblique','斜射 / 水平','open',90,False,False,False,'fiber')]
    modes=[]
    for mid,label,stop,angle,d,p,a,source in mode_specs:
        modes.append({'id':mid,'label':label,'states':{'sources':{k:k==source for k in ('bottom','top','fiber')},
                     'darkfieldStop':stop,'irisAngleDegrees':angle,'diffuser':'in' if d else 'out',
                     'polarizer':'in' if p else 'out','analyzer':'in' if a else 'out'},
                     'note':'部件位置与照明预设；明域叠加外围反射光。网页受光为等效教学示意，不代表实测照度、宝石折射/偏振或目镜成像。'})
    sources={}
    for key,part,node,col,point,direction in [('bottom','bottomLight','BottomEmission',[1,.84,.58],SOURCE,(0,0,1)),
            ('top','topLight','TopEmission',[1,.95,.86],TOP_SOURCE,TOP_DIRECTION),
            ('fiber','lightGuide','FiberEmission',[.9,.96,1],FIBER_SOURCE,FIBER_DIRECTION)]:
        sources[key]={'partId':part,'node':'GemMicroscope_'+node,'emissiveColor':col,'onIntensity':3,
                      'offIntensity':0,'defaultOn':key=='bottom','positionMeters':gl(point),'direction':gl(direction,False)}
    return {'illuminationModes':modes,'defaultIlluminationMode':'darkfield','transparentShellParts':['darkfield','lampHousingBase'],'illuminationMechanics':mechanics,
            'sourceNodes':sources,'samplePositionMeters':gl(SAMPLE),
            'objectiveEntrance':{'centerMeters':gl(OBJECTIVE),'radiusMeters':OBJECTIVE_RADIUS*UNIT,
                                 'acceptanceConeIllustrative':True,'focusTravelIncluded':True},
            'reflectorEllipsoid':{'partId':'reflector','type':'ellipsoid-of-revolution','sourceFocusMeters':gl(SOURCE),
                'sampleFocusMeters':gl(SAMPLE),'centerMeters':gl((0,CENTER_Y,ELLIPSOID_Z)),
                'semiMajorAxisMeters':ELLIPSOID_A*UNIT,'semiMinorAxisMeters':ELLIPSOID_B*UNIT,
                'surfaceAuthoringZRange':[REFLECTOR_Z_RANGE[0],REFLECTOR_Z_RANGE[1]],'dimensionsCalibrated':False},
            'topLightDirection':gl(TOP_DIRECTION,False),'fiberDirection':gl(FIBER_DIRECTION,False),
            'illuminationGeometry':{'internalOpticsIllustrative':True,'photometrySimulated':False,
                'brightfieldIncludesReflectedLight':True,'stagePlan':'rounded rectangle','topLightElevationDegrees':45,
                'report':'assets-source/instruments-2026-10-07/round4/microscope-illumination-check.json',
                'note':'双焦点椭球、物镜接收锥和附件运动均是共用参数的几何示意，不是KRÜSS内部结构复刻。'}}


def segment_distance(p,a,b):
    ab=sub(b,a);t=max(0,min(1,dot(sub(p,a),ab)/dot(ab,ab))) if dot(ab,ab)>0 else 0
    return norm(sub(p,add(a,mul(ab,t))))


def segment_pair_distance(a,b,c,d):
    """Exact minimum between two closed line segments, including end points."""
    u,v,w=sub(b,a),sub(d,c),sub(a,c)
    aa,bb,cc,dd,ee=dot(u,u),dot(u,v),dot(v,v),dot(u,w),dot(v,w)
    candidates=[segment_distance(a,c,d),segment_distance(b,c,d),segment_distance(c,a,b),segment_distance(d,a,b)]
    denominator=aa*cc-bb*bb
    if denominator>1e-14:
        t=(bb*ee-cc*dd)/denominator;q=(aa*ee-bb*dd)/denominator
        if 0<=t<=1 and 0<=q<=1:candidates.append(norm(sub(add(a,mul(u,t)),add(c,mul(v,q)))))
    return min(candidates)


def mesh_volume(vertices,faces):
    return sum(dot(vertices[f[0]],cross(vertices[f[i]],vertices[f[i+1]]))/6 for f in faces for i in range(1,len(f)-1))


def mesh_is_closed(faces):
    edges=Counter(tuple(sorted([a,b])) for face in faces for a,b in zip(face,face[1:]+face[:1]))
    return bool(edges) and all(count==2 for count in edges.values())


def simple_polygon(poly):
    def orient(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    n=len(poly)
    for i in range(n):
        a,b=poly[i],poly[(i+1)%n]
        for j in range(i+2,n):
            if i==0 and j==n-1:continue
            c,d=poly[j],poly[(j+1)%n]
            if orient(a,b,c)*orient(a,b,d)<-1e-16 and orient(c,d,a)*orient(c,d,b)<-1e-16:return False
    return True


def illumination_check():
    checks=[]
    def check(name,passed,**detail): checks.append({'name':name,'passed':bool(passed),**detail})
    # Every point of the extended circular source to every point of the objective
    # entrance has a convex-combination radial bound at the opaque stop plane.
    direct_radii=[]
    for focus in FOCUS_RANGE:
        t=(STOP_Z-SOURCE[2])/(OBJECTIVE[2]+focus-SOURCE[2])
        direct_radii.append(SOURCE_RADIUS*(1-t)+OBJECTIVE_RADIUS*t)
    direct=max(direct_radii)
    check('closed stop blocks complete source-to-objective bundle',STOP_RADIUS>direct,
          stopRadiusMeters=STOP_RADIUS*UNIT,maximumBundleRadiusMeters=direct*UNIT,
          minimumRadialMarginMeters=(STOP_RADIUS-direct)*UNIT,coverage='analytic convex bound; all source/objective disk points and full focus range')
    check('open stop clears central bundle',STOP_TRAVEL-STOP_RADIUS>direct,
          minimumMarginMeters=(STOP_TRAVEL-STOP_RADIUS-direct)*UNIT)
    max_error=0.;min_angle=90.;min_clear=1.;max_focus_error=0.;count=0
    # All azimuths share rotational symmetry. Check the actual tessellation rows
    # plus mid-row points; law of reflection is analytic on the ellipsoid.
    accept=math.degrees(math.atan(OBJECTIVE_RADIUS/(OBJECTIVE[2]+FOCUS_RANGE[0]-SAMPLE[2])))
    for j in range(49):
        z=REFLECTOR_Z_RANGE[0]+(REFLECTOR_Z_RANGE[1]-REFLECTOR_Z_RANGE[0])*j/48
        for k in range(72):
            p=reflector_point(z,2*math.pi*k/72);incident=unit(sub(p,SOURCE))
            normal=unit((p[0]/ELLIPSOID_B**2,(p[1]-CENTER_Y)/ELLIPSOID_B**2,(p[2]-ELLIPSOID_Z)/ELLIPSOID_A**2))
            reflected=sub(incident,mul(normal,2*dot(incident,normal)));target=unit(sub(SAMPLE,p))
            max_error=max(max_error,norm(sub(reflected,target)))
            max_focus_error=max(max_focus_error,abs(norm(sub(p,SOURCE))+norm(sub(p,SAMPLE))-2*ELLIPSOID_A))
            min_angle=min(min_angle,math.degrees(math.acos(target[2])))
            at_stop=add(p,mul(sub(SAMPLE,p),(STOP_Z-p[2])/(SAMPLE[2]-p[2])))
            rho=math.hypot(at_stop[0],at_stop[1]-CENTER_Y)
            min_clear=min(min_clear,rho-STOP_RADIUS)
            # Both faces of each finite solid, plus every blade height. The
            # tapered stage bore and ray radius are linear between their ends.
            planes=[(THROAT_Z-THROAT_THICKNESS/2,WELL_RADIUS),(THROAT_Z+THROAT_THICKNESS/2,WELL_RADIUS),
                    (STAGE_Z-STAGE_THICKNESS/2,stage_hole_radius(STAGE_Z-STAGE_THICKNESS/2)),
                    (STAGE_Z+STAGE_THICKNESS/2,stage_hole_radius(STAGE_Z+STAGE_THICKNESS/2)),
                    (IRIS_Z-IRIS_HALF_THICKNESS,IRIS_MAX*.998)]
            for plane,radius in planes:
                q=add(p,mul(sub(SAMPLE,p),(plane-p[2])/(SAMPLE[2]-p[2])))
                min_clear=min(min_clear,radius-math.hypot(q[0],q[1]-CENTER_Y))
            count+=1
    check('ellipsoidal reflector maps source focus to sample focus',max_error<1e-10 and max_focus_error<1e-10,
          sampledRays=count,maximumReflectedDirectionError=max_error,maximumFocusSumErrorMeters=max_focus_error*UNIT)
    check('darkfield rays outside objective cone',min_angle>accept,
          minimumIlluminationAngleDegrees=min_angle,maximumAcceptanceHalfAngleDegrees=accept,
          focusRangeMeters=[x*UNIT for x in FOCUS_RANGE])
    check('reflected rays clear stop throat stage and open iris',min_clear>0,minimumMarginMeters=min_clear*UNIT,stageBore='shared conical cutter, tested at both slab faces',stageBoreBoundaryRadiiMeters=[stage_hole_radius(STAGE_Z+d*STAGE_THICKNESS/2)*UNIT for d in (-1,1)])
    for name,radius,travel,aperture in [('diffuser',FILTER_RADIUS,FILTER_TRAVEL,WELL_COVERAGE_RADIUS),
                                      ('polarizer',FILTER_RADIUS,FILTER_TRAVEL,WELL_COVERAGE_RADIUS),
                                      ('analyzer',ANALYZER_RADIUS,ANALYZER_TRAVEL,OBJECTIVE_RADIUS)]:
        check(name+' covers opening when inserted and clears when withdrawn',radius>=aperture and travel-radius>aperture,
              insertedCoverageMarginMeters=(radius-aperture)*UNIT,withdrawnMarginMeters=(travel-radius-aperture)*UNIT)
    for name,point,direction in [('top',TOP_SOURCE,TOP_DIRECTION),('fiber',FIBER_SOURCE,FIBER_DIRECTION)]:
        err=norm(cross(sub(SAMPLE,point),direction))*UNIT
        check(name+' emission points toward sample',err<1e-10 and dot(sub(SAMPLE,point),direction)>0,
              axisMissDistanceMeters=err,emissionPositionMeters=gl(point),direction=gl(direction,False))
    check('top light is front mounted at 45 degrees',abs(TOP_CENTER[0])<1e-12 and TOP_CENTER[1]<SAMPLE[1] and abs(math.degrees(math.asin(-TOP_DIRECTION[2]))-45)<1e-8)
    # Use a conservative world AABB for the oriented lamp box. It encloses all
    # shell/window geometry, so positive margins are stronger than sparse tests.
    half_y=(TOP_DIMENSIONS[1]+TOP_DIMENSIONS[2])*math.sqrt(.5)/2
    lamp_y_max=TOP_CENTER[1]+half_y;lamp_z_min=TOP_CENTER[2]-half_y;lamp_z_max=TOP_CENTER[2]+half_y
    sample_axis_margin=SAMPLE[1]-OBJECTIVE_RADIUS-lamp_y_max
    clamp_z_max=max(p[2] for p in CLAMP_PATH+[p for jaw in CLAMP_JAWS for p in jaw])+.04
    check('top lamp avoids objective-to-sample bundle and clamp',sample_axis_margin>0 and lamp_z_min>clamp_z_max,
          opticalBundleMarginMeters=sample_axis_margin*UNIT,clampMarginMeters=(lamp_z_min-clamp_z_max)*UNIT)
    check('top lamp stays below objective and eyepiece viewing rays',lamp_z_max<OBJECTIVE[2]+FOCUS_RANGE[0]-.04,
          lowestObjectiveMarginMeters=(OBJECTIVE[2]+FOCUS_RANGE[0]-.04-lamp_z_max)*UNIT,
          ocularRays='Both ocular axes continue upward from >4 authoring units; lamp remains entirely below objective.')
    neck=smooth_path(TOP_KNOTS)
    clamp_paths=[smooth_path(path) for path in [CLAMP_PATH]+CLAMP_JAWS]
    neck_axis_margin=min(segment_distance((0.,CENTER_Y),a[:2],b[:2])-TOP_NECK_RADIUS-OBJECTIVE_RADIUS for a,b in zip(neck,neck[1:]))
    neck_clamp_margin=min(segment_pair_distance(a,b,c,d)-TOP_NECK_RADIUS-.04 for a,b in zip(neck,neck[1:]) for path in clamp_paths for c,d in zip(path,path[1:]))
    check('top gooseneck avoids viewing bundle and clamp',neck_axis_margin>0 and neck_clamp_margin>0,
          conservativeBundleMarginMeters=neck_axis_margin*UNIT,clampMarginMeters=neck_clamp_margin*UNIT,
          checkedGeometry='Shared piecewise linear sweep; interval radial bound, not unrelated control points.')
    fiber=smooth_path(FIBER_KNOTS)+[FIBER_SOURCE]
    fiber_clamp_margin=min(segment_pair_distance(a,b,c,d)-.031-.014 for a,b in zip(fiber,fiber[1:]) for path in clamp_paths for c,d in zip(path,path[1:]))
    check('fiber hardware avoids clamp',fiber_clamp_margin>0,minimumMarginMeters=fiber_clamp_margin*UNIT)
    for name,emitter in [('top',TOP_SOURCE),('fiber',FIBER_SOURCE)]:
        clearance=min(segment_pair_distance(emitter,SAMPLE,c,d)-.014 for path in clamp_paths for c,d in zip(path,path[1:]))
        check(name+' central emission ray avoids clamp',clearance>0,minimumMarginMeters=clearance*UNIT,
              limitation='central schematic ray; source beam spread is not simulated')
    rv,rf=reflector_mesh()
    check('shared reflector surface is a closed positive-volume mesh',mesh_is_closed(rf) and mesh_volume(rv,rf)>0,
          vertices=len(rv),faces=len(rf),volumeCubicMeters=mesh_volume(rv,rf)*UNIT**3)
    return {'round':3,'ok':all(x['passed'] for x in checks),'scope':'shared-parameter static mathematical geometry; no Blender, GLB, photometry or measured optical validation',
            'units':'m','dimensionsCalibrated':False,'photometrySimulated':False,'checks':checks,
            'notes':['Reflection uses the ideal analytic ellipsoid sampled by the authored mesh; tessellation is an approximation.',
                     'The brightfield stop is a generic teaching mechanism; the forum later corrects its SVH claim to GEMZ/BF-DF. No KRUSS internal mechanism is asserted.',
                     'Polarization, irradiance, stray light, refraction through a real stone and stereo image formation are not simulated.']}


def ray_intersections(poly, theta):
    d=(math.cos(theta),math.sin(theta));hits=[]
    for a0,b0 in zip(poly,poly[1:]+poly[:1]):
        a=(a0[0],a0[1]-CENTER_Y);b=(b0[0],b0[1]-CENTER_Y);edge=sub(b,a)
        den=d[0]*edge[1]-d[1]*edge[0]
        if abs(den)<1e-12:continue
        r=(a[0]*edge[1]-a[1]*edge[0])/den
        u=(a[0]*d[1]-a[1]*d[0])/den
        if r>0 and -1e-10<=u<=1+1e-10:hits.append(r)
    return sorted(hits)


def iris_check():
    checks=[];profiles_min=[blade_profile(k,IRIS_MIN) for k in range(IRIS_COUNT)]
    profiles_max=[blade_profile(k,IRIS_MAX) for k in range(IRIS_COUNT)]
    minimum_z_gap=(IRIS_LAYER_PITCH-2*IRIS_HALF_THICKNESS)*UNIT
    # Heights never change under the morph, giving a continuous-interval proof
    # that no pair of blade volumes intersects, even in the overlapping plan.
    checks.append({'name':'all blade layers disjoint for the complete morph interval','passed':minimum_z_gap>0,
                   'minimumGapMeters':minimum_z_gap,'method':'analytic disjoint Z intervals; bevel is inset and cannot enlarge a layer'})
    sampled=[];last=[0.]*720;monotonic=True;coverage=True;max_chord_error=0.;simple=True;positive_volume=True;min_volume=1.
    for angle in range(0,91,3):
        t=angle/90;r=IRIS_MIN+(IRIS_MAX-IRIS_MIN)*t
        polygons=[[add(mul(a,1-t),mul(b,t)) for a,b in zip(pa,pb)] for pa,pb in zip(profiles_min,profiles_max)]
        radii=[]
        # Twelvefold symmetry: testing one sector at 60 directions is equivalent
        # to 720 evenly spaced directions. Every leaf is still tested in that sector.
        for k in range(60):
            theta=2*math.pi*(k+.317)/720
            intervals=[]
            for poly in polygons:
                hits=ray_intersections(poly,theta)
                for i in range(0,len(hits)-1,2):intervals.append((hits[i],hits[i+1]))
            intervals.sort();inner=intervals[0][0] if intervals else 0
            end=inner
            for lo,hi in intervals:
                if lo>end+1e-8:coverage=False
                end=max(end,hi)
            coverage=coverage and end>=.274 and inner>=r*.998
            monotonic=monotonic and inner>=last[k]-1e-10;last[k]=inner;radii.append(inner)
            max_chord_error=max(max_chord_error,r-inner)
        v0,v1=blade_vertices(0,IRIS_MIN),blade_vertices(0,IRIS_MAX)
        vertices=[add(mul(a,1-t),mul(b,t)) for a,b in zip(v0,v1)]
        for loop in range(4):
            simple=simple and simple_polygon([point[:2] for point in vertices[loop*26:(loop+1)*26]])
        volume=mesh_volume(vertices,blade_faces());min_volume=min(min_volume,volume);positive_volume=positive_volume and volume>0
        sampled.append({'angleDegrees':angle,'expectedDiameterMeters':2*r*UNIT,
                        'measuredPolygonDiameterMinMeters':2*min(radii)*UNIT,
                        'measuredPolygonDiameterMaxMeters':2*max(radii)*UNIT})
    checks += [{'name':'bevelled blade topology closed positive and no planar self-intersections','passed':simple and positive_volume and mesh_is_closed(blade_faces()),
                'minimumVolumeCubicMeters':min_volume*UNIT**3,'poses':31,'note':'all four bevel loops are tested under the actual linear target interpolation'},
               {'name':'blade stack clears lower drive ring and upper trim','passed':IRIS_Z-IRIS_HALF_THICKNESS>1.705+.014/2 and IRIS_Z+11*IRIS_LAYER_PITCH+IRIS_HALF_THICKNESS<1.739-.008/2,
                'lowerGapMeters':(IRIS_Z-IRIS_HALF_THICKNESS-(1.705+.014/2))*UNIT,
                'upperGapMeters':((1.739-.008/2)-(IRIS_Z+11*IRIS_LAYER_PITCH+IRIS_HALF_THICKNESS))*UNIT},
               {'name':'aperture monotone under actual linear morph','passed':monotonic,'angles':31,'equivalentDirectionsPerPose':720},
               {'name':'no radial gaps outside circular aperture','passed':coverage,'maximumChordRadiusErrorMeters':max_chord_error*UNIT},
               {'name':'endpoint nominal aperture 7.5 to 40 mm','passed':abs(2*IRIS_MIN*UNIT-.0075)<1e-12 and abs(2*IRIS_MAX*UNIT-.04)<1e-12},
               {'name':'explicit bevel topology shared with builder','passed':len(blade_vertices(0,IRIS_MIN))==104 and len(blade_faces())==80,
                'bevelMeters':IRIS_BEVEL*UNIT,'verticesPerBlade':104,'facesPerBlade':80,'material':'dark matte metal; roughness 0.66'}]
    return {'round':3,'ok':all(x['passed'] for x in checks),'scope':'shared mesh-profile and morph mathematics; not exported GLB/reimport verification',
            'dimensionsCalibrated':False,'checks':checks,'poses':sampled,
            'continuousMotionReasoning':'The inner arc vertices scale linearly outwards while outer arcs stay fixed; the inner circular chords therefore move monotonically. All Z slabs remain disjoint for every morph weight.',
            'samplingBoundary':'31 poses and 720-direction equivalent coverage; the rendered polygon aperture approximates a circle with the recorded chord error.'}


def mounting_check():
    checks=[]
    def check(name,passed,**detail):checks.append({'name':name,'passed':bool(passed),**detail})
    cap_top=LAMP_CAP_Z+LAMP_CAP_DEPTH/2
    cap_bottom=LAMP_CAP_Z-LAMP_CAP_DEPTH/2
    socket_bottom=LAMP_SOCKET_Z-LAMP_SOCKET_DEPTH/2
    socket_top=LAMP_SOCKET_Z+LAMP_SOCKET_DEPTH/2
    check('service cap closes entire open lower lamp chamber and overlaps its wall',
          LAMP_CAP_RADIUS>.48 and cap_top>1.14-.65/2 and cap_bottom<1.14-.65/2,
          radialOverlapMeters=(LAMP_CAP_RADIUS-.48)*UNIT,axialOverlapMeters=(cap_top-(1.14-.65/2))*UNIT)
    check('continuous cap socket ceramic collar emitter support',cap_top>socket_bottom and socket_top>SOURCE[2]-.028-.02 and .864-.007/2<SOURCE[2]-.028+.02 and .864+.007/2>SOURCE[2]-.008/2,
          chain=['service cap','metal socket','ceramic LED carrier','thermal collar','emitter'],
          capToSocketOverlapMeters=(cap_top-socket_bottom)*UNIT,
          sourceLocation='within under-stage lamp chamber; not within white structural pedestal')
    check('upper mounting flange joins chamber to underside of stage',
          MOUNT_FLANGE_OUTER>.62 and MOUNT_FLANGE_Z+MOUNT_FLANGE_DEPTH/2>STAGE_Z-STAGE_THICKNESS/2 and MOUNT_FLANGE_Z-MOUNT_FLANGE_DEPTH/2<1.14+.65/2,
          flangeOuterRadiusMeters=MOUNT_FLANGE_OUTER*UNIT)
    retainer_low=REFLECTOR_RETAINER_Z-REFLECTOR_RETAINER_DEPTH/2
    p=reflector_point(retainer_low,0)
    normal=unit((p[0]/ELLIPSOID_B**2,0,(p[2]-ELLIPSOID_Z)/ELLIPSOID_A**2))
    outer_radius=p[0]+normal[0]*REFLECTOR_THICKNESS
    check('reflector retaining seat overlaps outer bowl wall and chamber wall',
          REFLECTOR_RETAINER_INNER<outer_radius and REFLECTOR_RETAINER_OUTER>.48,
          bowlWallOverlapMeters=(outer_radius-REFLECTOR_RETAINER_INNER)*UNIT,
          chamberWallOverlapMeters=(REFLECTOR_RETAINER_OUTER-.48)*UNIT)
    bracket_top=3.09+.15/2
    for a,b in zip(OBJECTIVE_BELL_PROFILE,OBJECTIVE_BELL_PROFILE[1:]):
        if a[0]<=bracket_top<=b[0]:bell_radius=a[1]+(b[1]-a[1])*(bracket_top-a[0])/(b[0]-a[0])
    check('analyzer guide brackets connect to objective bell outside viewing cylinder',
          math.hypot(.10,.264)<bell_radius and .264-.040/2>OBJECTIVE_RADIUS,
          bracketCenterToBellOverlapMeters=(bell_radius-math.hypot(.10,.264))*UNIT,
          conservativeViewingClearanceMeters=(.264-.040/2-OBJECTIVE_RADIUS)*UNIT)
    check('analyzer fixed legs outside full sliding saddle travel',-.10+.055/2<-.10/2,
          minimumAxialClearanceMeters=(-.10/2-(-.10+.055/2))*UNIT)
    grip_top=max(IRIS_LEVER_Z+IRIS_LEVER_RADIUS,IRIS_GRIP_Z+IRIS_GRIP_SIZE[2]/2)
    check('full rotating iris lever stays below diffuser glass and both guide rails',
          grip_top<DIFFUSER_Z-.014/2 and grip_top<min(g['z']-g['radius'] for g in FILTER_GUIDES[:2]),
          diffuserMinimumVerticalClearanceMeters=(DIFFUSER_Z-.014/2-grip_top)*UNIT,
          railMinimumVerticalClearanceMeters=(min(g['z']-g['radius'] for g in FILTER_GUIDES[:2])-grip_top)*UNIT)
    # X/Y-independent bounds cover the full insertion stroke and iris rotation.
    check('relocated clamp pedestal clears all stage plate and guide swept envelopes',
          CLAMP_MOUNT[1]-.055>CENTER_Y+max(g['halfY']+.036/2 for g in FILTER_GUIDES[:2]),
          minimumYClearanceMeters=(CLAMP_MOUNT[1]-.055-(CENTER_Y+max(g['halfY']+.036/2 for g in FILTER_GUIDES[:2])))*UNIT,
          note='Clamp jaws and sample location unchanged; only pedestal and upper support curve relocate.')
    # All source points lie in a horizontal disk at SOURCE.z. The reflected
    # family connects every azimuth of the same reflector band to SAMPLE.
    # Below SOURCE, or above the top of the reflector band, added hardware cannot
    # intersect any source-to-reflector segment, including the extended source.
    incoming=[];outgoing=[];viewing=[]
    # The band is below the ellipsoid equator: r(z) increases and
    # SAMPLE.z-z decreases, so r(z)/(SAMPLE.z-z) reaches its maximum at its top.
    assert REFLECTOR_Z_RANGE[1]<ELLIPSOID_Z<SAMPLE[2]
    maximum_slope=reflector_point(REFLECTOR_Z_RANGE[1],0)[0]/(SAMPLE[2]-REFLECTOR_Z_RANGE[1])
    for spec in mounting_solids():
        p=spec['center']
        if spec['type']=='annulus':
            margin=spec['inner']-max(SOURCE_RADIUS,reflector_point(REFLECTOR_Z_RANGE[1],0)[0])
            incoming.append({'name':spec['name'],'clear':margin>0})
            outgoing.append({'name':spec['name'],'clear':margin>0,'minimumConservativeMarginMeters':margin*UNIT})
            viewing.append({'name':spec['name'],'clear':p[2]+spec['depth']/2<SAMPLE[2]})
            continue
        if spec['type']=='box':half=tuple(x/2 for x in spec['size'])
        elif spec.get('axis')==(1,0,0):half=(spec['depth']/2,spec['radius'],spec['radius'])
        else:half=(spec['radius'],spec['radius'],spec['depth']/2)
        lo,hi=p[2]-half[2],p[2]+half[2]
        incoming.append({'name':spec['name'],'clear':hi<SOURCE[2] or lo>REFLECTOR_Z_RANGE[1]})
        if hi<REFLECTOR_Z_RANGE[0] or lo>SAMPLE[2]:outgoing.append({'name':spec['name'],'clear':True,'reason':'outside reflected segment height interval'})
        else:
            radial_bound=maximum_slope*max(0,SAMPLE[2]-lo)
            side_clearance=abs(p[1]-CENTER_Y)-half[1]-radial_bound
            outgoing.append({'name':spec['name'],'clear':side_clearance>0,'minimumConservativeMarginMeters':side_clearance*UNIT})
        viewing.append({'name':spec['name'],'clear':hi<SAMPLE[2] or abs(p[1]-CENTER_Y)-half[1]>OBJECTIVE_RADIUS})
    flange_low=MOUNT_FLANGE_Z-MOUNT_FLANGE_DEPTH/2
    max_flange_ray=maximum_slope*(SAMPLE[2]-flange_low)
    check('all added hardware clears complete extended-source to reflector bundle',all(x['clear'] for x in incoming) and flange_low>REFLECTOR_Z_RANGE[1],
          method='continuous Z interval exclusion; covers every point of the extended source disk and all reflector azimuths',solids=incoming)
    check('all added hardware clears complete nominal reflector to sample bundle',all(x['clear'] for x in outgoing) and MOUNT_FLANGE_INNER>max_flange_ray,
          method='analytic radial envelope at lower AABB plane; monotone ellipsoid-band slope, all azimuths and full plate travel',
          flangeMinimumMarginMeters=(MOUNT_FLANGE_INNER-max_flange_ray)*UNIT,solids=outgoing)
    check('filter guides stay outside objective viewing cylinder including focus and insertion travel',all(x['clear'] for x in viewing),
          method='full objective-radius cylinder; conservative for all focus settings and horizontal plate positions',solids=viewing)
    check('all sliding saddles have actual clearance bores around fixed guide rails',all(s['guideBore']['radius']>next(g['radius'] for g in FILTER_GUIDES if s['name'].startswith(g['id'])) for s in mounting_solids() if 'guideBore' in s),
          radialRunningClearanceMeters=.002*UNIT,scope='authoring primitive and Boolean cutter contract; exported mesh checked separately')
    guide_clearances=[]
    for name,knots,radius in [('top gooseneck',TOP_KNOTS,TOP_NECK_RADIUS),('fiber gooseneck',FIBER_KNOTS,FIBER_NECK_RADIUS)]:
        path=smooth_path(knots)
        for spec in mounting_solids():
            if spec['type']!='cylinder' or spec.get('axis')!=(1,0,0):continue
            p=spec['center'];a=(p[0]-spec['depth']/2,p[1],p[2]);b=(p[0]+spec['depth']/2,p[1],p[2])
            clearance=min(segment_pair_distance(a,b,c,d) for c,d in zip(path,path[1:]))-radius-spec['radius']
            guide_clearances.append({'neck':name,'rail':spec['name'],'clearanceMeters':clearance*UNIT})
    check('fixed guide rails avoid both lighting goosenecks',all(x['clearanceMeters']>0 for x in guide_clearances),
          method='exact pairwise distance between shared swept polyline segments and guide cylinder axes',
          minimumClearanceMeters=min(x['clearanceMeters'] for x in guide_clearances),pairs=guide_clearances)
    return {'round':4,'ok':all(c['passed'] for c in checks),'scope':'shared mounting primitives and conservative optical-clearance envelopes; no measured manufacturer mechanics or irradiance',
            'dimensionsCalibrated':False,'checks':checks,'notes':['Mounting and accessory slide hardware is a mechanically understandable teaching layout, not a KRUSS internal drawing.','No claim of sealed electrical enclosure, thermal performance or service safety.']}


def write_reports(output):
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    source_hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [Path(__file__),Path(__file__).with_name('build_gem_microscope.py')]}
    reports={'microscope-illumination-check.json':illumination_check(),'microscope-iris-math-check.json':iris_check(),'microscope-mounting-check.json':mounting_check()}
    for name,report in reports.items():
        report['round']=4
        report['sourceSha256']=source_hashes
        (output/name).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    return reports


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[2]/'assets-source/instruments-2026-10-07/round4')
    args=parser.parse_args();reports=write_reports(args.output)
    print(json.dumps({name:{'ok':r['ok'],'checks':len(r['checks']),'scope':r['scope']} for name,r in reports.items()},ensure_ascii=False,indent=2))
    raise SystemExit(0 if all(r['ok'] for r in reports.values()) else 1)
