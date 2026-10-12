"""KSW6000 exterior, independently authored compact lower-light teaching system.
Uncalibrated source scene units. Blender Z-up -> glTF Y-up.
The optical route follows 《宝石显微镜光源系统设计与改造》(2014) §3.3, not manufacturer measurements.
All surface parameters, bearings and actuator layout are authored teaching choices.
"""
import math
CX,CY=.0673,.0283
SOURCE=(CX,CY,.178)
COLLIMATOR_Z,COLLIMATED_RADIUS=.195,.0170
SAMPLE=(CX,CY,.350);SAMPLE_RADIUS=.009
OBJECTIVE=(CX,CY,.527);OBJECTIVE_RADIUS=.035
CONE_APEX,CONE_RADIUS,CONE_DEPTH,CONE_TRAVEL=.208,.023,.0007,.058
CONE_CORE_RADIUS=.0008
REFLECTOR_C=.236
REFLECTOR_Z=(.208,.233)
IRIS_Z,IRIS_MIN,IRIS_MAX,IRIS_OUTER,IRIS_COUNT=.2955,.006,.038,.064,8
IRIS_PITCH,IRIS_DEPTH=.00016,.00010
STEM_AZIMUTH_DEGREES=-90
STEM_HALF_SECTOR_DEGREES=3.0

def gl(v):return [round(v[0],9),round(v[2],9),round(-v[1],9)]
def outer_radius(z):return (REFLECTOR_C**2-(SAMPLE[2]-z)**2)/(2*REFLECTOR_C)
def outer_point(z,phi):
 r=outer_radius(z);return (CX+r*math.cos(phi),CY+r*math.sin(phi),z)
def cone_point(r,phi):return (CX+r*math.cos(phi),CY+r*math.sin(phi),CONE_APEX+r)
def mix(a,b,z):
 t=(z-a[2])/(b[2]-a[2]);return tuple(a[i]+t*(b[i]-a[i]) for i in range(3))
def contract():
 paths=[]
 for rad in [.003,.008,.014,COLLIMATED_RADIUS]:
  for k in range(24):
   phi=2*math.pi*(k+.5)/24
   co=cone_point(rad,phi);ou=outer_point(co[2],phi);ex=(co[0],co[1],COLLIMATOR_Z)
   paths.append({'exitPoint':gl(ex),'conePoint':gl(co),'outerPoint':gl(ou),'samplePoint':gl(SAMPLE),'irisPoint':gl(mix(ou,SAMPLE,IRIS_Z)),'beamRadius':rad,'azimuthDegrees':math.degrees(phi)})
 return {'schemaVersion':2,'assetId':'ksw6000-bottom-light-repair-v2','model':'model.glb','blender':'microscope.blend',
 'units':'uncalibrated source scene units','coordinateSystem':'glTF Y-up; source Blender Z-up maps x,z,-y',
 'scaleNote':'保留 KSW6000 Tripo 外形数值，内部参数为未标定教学设定；不是米或毫米实测。',
 'internalOpticsIllustrative':True,
 'internalStructureNote':'LED—准直—可退出中央锥镜—外围曲面—样品的路线参考公开论文；曲面参数、导向和横移机构为教学简化，不代表 KRUSS 或飞博尔的实际机构。',
 'parts':[], 'shellIds':['tripo_part_4','tripo_part_5','lampHousingCap'],
 'samplePosition':gl(SAMPLE),'sampleRadius':SAMPLE_RADIUS,
 'optics':{'axis':[0,1,0],'axisPoint':gl(SOURCE),'sourcePosition':gl(SOURCE),'sourceRadius':.008,
  'collimatorExit':gl((CX,CY,COLLIMATOR_Z)),'collimatedBeamRadius':COLLIMATED_RADIUS,'collimatedDirection':[0,1,0],
  'beamDefinition':'Ideal parallel beam at authored collimator exit; actual lens imaging and LED etendue are not simulated.',
  'centralAbsorbingTipRadius':CONE_CORE_RADIUS,'centralAbsorbingTipNote':'锥尖用极小黑色截顶避免退化几何；该中心束被吸收，不绘作反射环光。',
  'irisCenter':gl((CX,CY,IRIS_Z)),'irisRadiusRange':[IRIS_MIN,IRIS_MAX],
  'twoReflectionPaths':paths,
  'objectiveCenter':gl(OBJECTIVE),'objectiveRadius':OBJECTIVE_RADIUS,'objectivePlaneY':OBJECTIVE[2],'focusRange':[-.012,.012],
  'receiverNodes':['tripo_part_3'],
  'acceptanceProxyNote':'实际双路入口瞳未知；半径 .035 同轴圆盘是保守教学代理，焦程仅用于净空验证。',
  'coneReflector':{'node':'coneReflectorSurface','groupNode':'centralCone','apex':gl((CX,CY,CONE_APEX)),'radius':CONE_RADIUS,'halfAngleDegrees':45,'radialRange':[CONE_CORE_RADIUS,CONE_RADIUS],'formula':'z = .208 + r (Blender Z-up)'},
  'outerReflector':{'node':'outerReflector','radialFormula':'r(z) = (.236^2 - (.350 - z)^2) / (2 * .236)','parameterC':REFLECTOR_C,'verticalRange':list(REFLECTOR_Z),'radialRange':[outer_radius(z) for z in REFLECTOR_Z],'note':'回转外围曲面将水平径向光反射向样品；不是旧椭球，也不是厂家实测曲面。'},
  'supportOcclusion':{'azimuthDegrees':STEM_AZIMUTH_DEGREES,'halfSectorDegrees':STEM_HALF_SECTOR_DEGREES,'node':'coneSupportStem','note':'窄支杆遮住少量方位；示意光线避开此扇区，不宣称 360° 均匀照明。'},
  'protectiveWindow':'omitted: no verified physical basis',
  'modePolicy':'darkfield: cone centered, two reflections, direct beam blocked; brightfield: cone parked +X, axial parallel beam, outer reflector unilluminated; off: emitter disabled',
  'intermediateStatePolicy':'Moving cone between modes is a transition, not a stable brightfield/darkfield observation.'},
 'iris':{'bladeNodes':['irisLeaf%02d'%(k+1) for k in range(IRIS_COUNT)],'type':'morphTargets','range':[0,1],'morphTarget':'ApertureClosed','morphTargetIndex':0,'influenceExpression':'1 - irisOpen','radiusMapping':{'min':IRIS_MIN,'max':IRIS_MAX,'expression':'.006 + .032 * irisOpen'},'note':'复用旧分层叶片的教学孔径演示，不代表真实传动。'},
 'centralCone':{'node':'centralCone','axis':[1,0,0],'openOffset':[CONE_TRAVEL,0,0],'closedPosition':gl((CX,CY,CONE_APEX)),'defaultState':'centered','note':'只在灯室内短距横移；外部拨钮通过简化连杆控制，不复刻厂家传动。'},
 'controls':{'modeNode':'bottomModeLever','modeAction':'centralCone translation +X .058','modePivot':gl((CX+.029,CY-.113,.202)),'modeRotationAxis':[0,0,-1],'modeAngleRangeDegrees':[0,60],'modeNote':'外部拨钮只表达控制关系；穿壳传动未知，不构造齿轮或连杆。','collimatorNode':'collimatorAssembly','irisHandleNode':'irisHandle','irisControlRingNode':'irisControl','irisPivot':gl((CX,CY,IRIS_Z+.004)),'irisRotationAxis':[0,1,0],'irisAngleRangeDegrees':[0,32]},
 'movingAssemblyNode':'centralCone','movingSurfaceNode':'coneReflectorSurface',
 'transparentOpticalNodes':['collimatorExit'],
 'mechanicalContactPairs':[['coneSliderFoot','coneGuideLeft'],['coneSliderFoot','coneGuideRight']],
 'staticInternalNodes':['lampHousingLiner','stageWellLiner','lampHousingCap','collimatorHousing','collimatorRetainer','outerReflector','outerReflectorMount','coneGuideLeft','coneGuideRight','coneGuideMount'],
 'lampEmitterNode':'lampEmitter','collimatorExitNode':'collimatorExit','defaultMode':'darkfield',
 'chamberReview':{'center':gl((CX,CY,.233)),'radius':.12,'cutPlane':{'normal':[0,0,-1],'point':gl((CX,CY,.230)),'note':'剖切前半侧灯室只用于查看；不是移走实体光学零件。'},'hideUpperGroups':['frame','stage','tripoExterior'],'retainCloudNodes':['tripo_part_4','tripo_part_5','tripo_part_14','tripo_part_16','tripo_part_21','tripo_part_26']},
 'lampHousingEnvelope':{'center':gl((CX,CY,.221)),'heightRange':[.169,.273],'innerRadiusRange':[.1015,.1105]},
 'source':{'preservedOriginalMeshNames':['tripo_part_'+str(k) for k in range(27) if k!=25],'removedNodes':['tripo_part_25'],'note':'原 26 个云外形网格及 UV 不改；不切旧长槽，原不透明窗口片去除且不新增透明保护窗。'}}
