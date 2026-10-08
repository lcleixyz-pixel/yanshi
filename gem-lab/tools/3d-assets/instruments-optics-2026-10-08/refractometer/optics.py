"""Isotropic, monochromatic teaching optics; SI coordinates are Blender Z-up.

Finite parallel contact film; incoherent Fresnel sum. The post-reticle relay is
an explicitly ideal thin lens, not a recovered commercial optical prescription.
"""
import math, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from refractometer_round3_geometry import GEOMETRY, add, sub, mul, dot, cross, unit, length, reflect, plane_hit, gl

G = GEOMETRY
C = G['prism']['center']
N = G['stageNormal']
T = G['stageTangent']
NG = 1.88
FILM = .00004
FOCAL = .046 * .039 / .085
INTENSITY_SEMANTICS = '强度相对于玻璃内入射光，包含玻璃—接触层—样品非相干多次反射总和；图线为代表主路径，未逐条绘出全部多次反射。空气间隙案例由玻璃—空气界面全反射。'

def fresnel(n1,n2,theta):
    si = n1*math.sin(theta)/n2
    if si >= 1-1e-12: return (1.,1.)
    a,b=math.cos(theta),math.sqrt(1-si*si)
    return (((n1*a-n2*b)/(n1*a+n2*b))**2,((n2*a-n1*b)/(n2*a+n1*b))**2)

def refract(d,n,n1,n2):
    # n points towards the destination medium.
    q=sub(d,mul(n,dot(d,n))); q=mul(q,n1/n2)
    if dot(q,q)>1+1e-10: return None
    return unit(add(q,mul(n,math.sqrt(max(0,1-dot(q,q))))))

def cylinder_exit(p,d):
    q=sub(p,C); a=d[1]**2+d[2]**2; b=2*(q[1]*d[1]+q[2]*d[2]); c=q[1]**2+q[2]**2-G['prism']['radius']**2
    ts=[(-b+s*math.sqrt(b*b-4*a*c))/(2*a) for s in [-1,1]]
    hit=add(p,mul(d,min(t for t in ts if t>1e-9)))
    outward=unit((0,hit[1]-C[1],hit[2]-C[2]))
    return hit,refract(d,outward,NG,1.)

def trace(theta,ns,nl):
    incoming=add(mul(T,math.sin(theta)),mul(N,math.cos(theta)))
    mh=plane_hit(C,mul(incoming,-1),G['surfaces']['first_mirror'])
    before=reflect(incoming,G['surfaces']['first_mirror']['normal'])
    source_x=G['sourcePanel']['center'][0]-G['sourcePanel']['size'][0]/2
    source=add(mh['point'],mul(before,-(source_x-mh['point'][0])/(-before[0])))
    entry=sub(C,mul(incoming,G['prism']['radius']))
    k=NG*math.sin(theta); p=C; bounces=[C]; transmitted=None
    r01=fresnel(NG,nl,theta)
    if k>=nl-1e-12:
        kind='contact-limit'; power=1.; opticalInterface='glass/contact'
    else:
        oil_angle=math.asin(k/nl)
        oil_dir=add(mul(T,math.sin(oil_angle)),mul(N,math.cos(oil_angle)))
        at_sample=add(C,mul(oil_dir,FILM/math.cos(oil_angle)))
        back=reflect(oil_dir,N)
        p=add(at_sample,mul(back,FILM/math.cos(oil_angle)))
        bounces=[C,at_sample,p];r12=fresnel(nl,ns,oil_angle)
        vals=[a+(1-a)**2*b/(1-a*b) for a,b in zip(r01,r12)]
        power=sum(vals)/2; opticalInterface='contact/sample'
        if abs(k-ns)<1e-9:
            kind='critical';transmitted=[at_sample,add(at_sample,mul(T,.005))]
        elif k>ns:
            kind='total-internal-reflection'
        else:
            kind='partial-reflection'; ds=add(mul(T,k/ns),mul(N,math.sqrt(1-(k/ns)**2)))
            transmitted=[at_sample,add(at_sample,mul(ds,.004))]
    out=reflect(incoming,N); exitp,d=cylinder_exit(p,out)
    scale=plane_hit(exitp,d,G['surfaces']['internal_scale'])
    lens=plane_hit(exitp,d,G['surfaces']['lens_group'])
    axis=G['outgoing']; dy=sub(lens['point'],G['surfaces']['lens_group']['center'])
    slope=mul(sub(d,mul(axis,dot(d,axis))),1/dot(d,axis))
    d2=unit(add(axis,sub(slope,mul(dy,1/FOCAL))))
    mirror=plane_hit(lens['point'],d2,G['surfaces']['second_mirror'])
    d3=reflect(d2,G['surfaces']['second_mirror']['normal'])
    eye=plane_hit(mirror['point'],d3,G['surfaces']['eyepiece'])
    pre=[source,mh['point'],entry,C]
    post=bounces+[exitp,scale['point'],lens['point'],mirror['point'],eye['point']]
    return dict(angleDegrees=math.degrees(theta),kind=kind,reflectedFraction=power,
        normalizedAt='glass-incident-before-contact-stack',intensitySemantics=INTENSITY_SEMANTICS,
        transmittedFraction=1-power,interface=opticalInterface,pre=pre,post=post,transmitted=transmitted,
        apertures={name:h for name,h in [('first_mirror',mh),('internal_scale',scale),('lens_group',lens),('second_mirror',mirror),('eyepiece',eye)]})

def make_cases():
    result=[]
    for id,label,ns,nl in [('isotropic-160','理想均质样品 · nD 1.600',1.60,1.78),('isotropic-170','理想均质样品 · nD 1.700',1.70,1.78),('air-gap','缺少光学接触 · 空气间隙',1.60,1.),('over-liquid','样品超过接触液上限',1.82,1.78)]:
        sample_critical=math.degrees(math.asin(ns/NG))
        if id in ['air-gap','over-liquid']: angles=[54.32756657358341,58.32756657358341,62.32756657358341]
        else: angles=[sample_critical-3,sample_critical,sample_critical+3]
        traces=[trace(math.radians(t),ns,nl) for t in angles];paths=[]
        for i,t in enumerate(traces):
            col={'partial-reflection':'#6ca9c9','critical':'#ffd56b','total-internal-reflection':'#edaa3d','contact-limit':'#bd79b9'}[t['kind']]
            paths.append(dict(id=f'incident-{i}',kind='incident',color='#ffe5a0',points=[gl(p) for p in t['pre']],interactions=[dict(pointIndex=1,kind='reflection',surfaceNode='Refractometer_first_mirror',normal=gl(G['surfaces']['first_mirror']['normal'])),dict(pointIndex=2,kind='refraction',surfaceNode='Refractometer_test_prism',n1=1,n2=NG,wavelengthNm=589)]))
            count=len(t['post']);interactions=[]
            if len(t['post'])==8:
                interactions=[dict(pointIndex=0,kind='refraction',surfaceNode='Refractometer_test_prism',n1=NG,n2=nl,normal=gl(N)),dict(pointIndex=1,kind=t['kind'],surfaceNode='Refractometer_isotropic_sample',n1=nl,n2=ns,normal=gl(N)),dict(pointIndex=2,kind='refraction',surfaceNode='Refractometer_test_prism',n1=nl,n2=NG,normal=gl(mul(N,-1)))]
            else:interactions=[dict(pointIndex=0,kind='total-internal-reflection',surfaceNode='Refractometer_test_prism',n1=NG,n2=nl,normal=gl(N))]
            interactions.extend([dict(pointIndex=count-5,kind='refraction',surfaceNode='Refractometer_test_prism',n1=NG,n2=1,wavelengthNm=589),dict(pointIndex=count-3,kind='ideal-thin-lens',surfaceNode='Refractometer_lens_group',focalLengthMeters=FOCAL),dict(pointIndex=count-2,kind='reflection',surfaceNode='Refractometer_second_mirror',normal=gl(G['surfaces']['second_mirror']['normal']))])
            paths.append(dict(id=f'reflected-{i}',kind=t['kind'],color=col,points=[gl(p) for p in t['post']],relativeIntensity=t['reflectedFraction'],interactions=interactions))
            if t['transmitted']:paths.append(dict(id=f'transmitted-{i}',kind='grazing-boundary' if t['kind']=='critical' else 'transmitted',color='#63d8c1',points=[gl(p) for p in t['transmitted']],relativeIntensity=t['transmittedFraction']))
        has_edge=id in ['isotropic-160','isotropic-170']
        result.append(dict(id=id,label=label,description='玻璃—接触层—理想各向同性样品；光线和示例读数由同一状态计算。接触层厚度仅为教学假设。',
          intensitySemantics=INTENSITY_SEMANTICS,
          parameters=dict(glassIndex=NG,contactIndex=nl,sampleIndex=ns,wavelengthNm=589,contactThicknessMeters=FILM,idealRelayFocalLengthMeters=FOCAL,anisotropic=False,
            angleReference='所有 angleDegrees 及 sampleCriticalAngleDegrees 均为玻璃内部光线相对于接触平面法线的角度。sampleCriticalAngleDegrees=asin(n样品/n玻璃)，不是液体—样品界面的入射角；contactCriticalAngleDegrees=asin(n接触层/n玻璃)，指玻璃—接触层界面的临界角。样品超过接触层折射率时，前者仅为不可直接到达的理论玻璃角，不产生有效样品读数。'),paths=paths,
          readout=dict(status='valid-ideal-example' if has_edge else 'no-sample-reading',sampleRI=f'{ns:.3f}' if has_edge else None,
            sampleCriticalAngleDegrees=sample_critical,contactCriticalAngleDegrees=math.degrees(math.asin(nl/NG)),
            explanation='低角度仍有部分反射；超过样品临界角的光全反射，因此形成反射强弱的边界。' if has_edge else ('空气界面已全反射，不能读成样品折射率。' if id=='air-gap' else '在所示角度内尚无样品全反射；继续增大角度将先达到玻璃—液体上限，不能据此给出样品精确 RI。'),
            rows=[{k:t[k] for k in ['angleDegrees','kind','reflectedFraction','transmittedFraction','interface','normalizedAt']} for t in traces],
            interfaceSemantics='interface 标识本条光线发生分支的界面；reflectedFraction 和 transmittedFraction 为整个接触层系统的等效能量，不是该单一界面的 Fresnel 系数。'),
          partVisibility={'contact_layer':id!='air-gap'},verification=traces))
    return result

if __name__=='__main__':
    import json
    print(json.dumps([{ 'id':c['id'],'readout':c['readout'],'aperturesPass':all(h['withinAperture'] for t in c['verification'] for h in t['apertures'].values())} for c in make_cases()],indent=2))
