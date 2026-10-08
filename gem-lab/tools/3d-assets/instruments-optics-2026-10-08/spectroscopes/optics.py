"""Transparent, uncalibrated educational prescriptions. No Blender or file writes."""
import math
GLASSES={
 'N-BK7':{'B':[1.039612120,.231792344,1.010469450],'C':[.00600069867,.0200179144,103.5606530]},
 'N-F2':{'B':[1.397570370,.159201403,1.268654300],'C':[.00995906143,.0546931752,119.2483460]},
}
WAVELENGTHS=[400,450,500,550,600,650,700]
COLORS={400:'#773bdf',450:'#2854ff',500:'#0ac9b2',550:'#7fe12c',600:'#ffb227',650:'#fb6038',700:'#e83849'}
HALF_WIDTH=.0056
HALF_HEIGHT=.004
INNER_NORMAL_DEG=40.
INNER_INTERCEPT=.0048
OUTER_INTERCEPT=.0118
DESIGN_NM=550.
def index(glass,nm):
 q=(nm/1000)**2;g=GLASSES[glass]
 return math.sqrt(1+sum(b*q/(q-c) for b,c in zip(g['B'],g['C'])))
def deviation(phi,nm):
 theta=0.;ns=[1,index('N-BK7',nm),index('N-F2',nm),index('N-BK7',nm),1]
 for normal,n0,n1 in zip([-phi,math.radians(INNER_NORMAL_DEG),-math.radians(INNER_NORMAL_DEG),phi],ns,ns[1:]):
  theta=normal+math.asin(n0/n1*math.sin(theta-normal))
 return theta

def solve_phi():
 lo,hi=0,math.radians(35)
 for _ in range(80):
  mid=(lo+hi)/2
  if deviation(mid,DESIGN_NM)>0:lo=mid
  else:hi=mid
 return (lo+hi)/2
PHI=solve_phi()
# Each real interface is z = intercept + slope*x, in glTF coordinates.
PLANES=[[-OUTER_INTERCEPT,math.tan(PHI)],[-INNER_INTERCEPT,-math.tan(math.radians(INNER_NORMAL_DEG))],[INNER_INTERCEPT,math.tan(math.radians(INNER_NORMAL_DEG))],[OUTER_INTERCEPT,-math.tan(PHI)]]
def sections():
 out=[]
 for front,rear in zip(PLANES,PLANES[1:]):
  out.append([(x,a+b*x) for x,a,b in [(-HALF_WIDTH,*front),(HALF_WIDTH,*front),(HALF_WIDTH,*rear),(-HALF_WIDTH,*rear)]])
 return out

def grating_angle(nm,density,order):
 argument=order*nm*1e-6*density
 return None if abs(argument)>1 else math.asin(argument)

def prescription():
 return {'scope':'educational compound prism, not a manufacturer prescription','coordinateSystem':'glTF Y-up; optical axis +Z; grooves +Y; dispersion in XZ','designWavelengthNm':DESIGN_NM,'outerNormalMagnitudeDegrees':math.degrees(PHI),'innerNormalMagnitudeDegrees':INNER_NORMAL_DEG,'planesZEqualsInterceptPlusSlopeX':PLANES,'sectionsXZ':sections(),'halfHeightMeters':HALF_HEIGHT,'glassSequence':['N-BK7','N-F2','N-BK7'],'sellmeierWavelengthUnit':'micrometers','sellmeierFormula':'n^2 = 1 + sum(B_i*lambda^2/(lambda^2-C_i))','glasses':GLASSES,'analyticExitDegrees':{str(w):math.degrees(deviation(PHI,w)) for w in WAVELENGTHS}}

def update_prism_metadata(manifest):
 """Replace inherited geometry fields together, so no old interface survives."""
 a=manifest['amiciAssembly'];a['designWavelengthNm']=DESIGN_NM;a['prescription']='prescription.json'
 a['interfaces']=[{'node':f'PrismSpectroscope_amici_cement_interface_{i+1}','planeXZ':{'zInterceptMeters':plane[0],'zSlopePerX':plane[1]},'between':(['N-BK7','N-F2'] if i==0 else ['N-F2','N-BK7']),'edgeGuidesOnly':True,'guideOffsetAlongZMeters':.00004,'depthMeters':.00003,'guideFaces':['+Y','-Y']} for i,plane in enumerate(PLANES[1:3])]
 a['allRefractingPlanesXZ']=[{'zInterceptMeters':p[0],'zSlopePerX':p[1]} for p in PLANES]
 a['materialAppearance']['crown']['ior']=index('N-BK7',DESIGN_NM)
 a['materialAppearance']['flint']['ior']=index('N-F2',DESIGN_NM)
 a['materialAppearance']['crown']['glass']='N-BK7'
 a['materialAppearance']['flint']['glass']='N-F2'
 a['materialAppearance']['iorWavelengthNm']=DESIGN_NM
 manifest['createdAt']='2026-10-08'
 manifest['opticalPath']=['adjustableSlit','idealizedAchromaticCollimator','AmiciNBK7NF2NBK7','eyepieceFrontTermination']
 manifest['teachingComparison']['grating']='光栅式角度随波长为反正弦关系；小角度下近似线性。本袖珍款狭缝和焦距固定，真实刻线密度未确认。'
 manifest['teachingComparison']['prism']='本教学处方蓝紫端角分散较大，550 nm 直视；谱线亮度、分辨率与真实厂家视野未校准。'
 return manifest
