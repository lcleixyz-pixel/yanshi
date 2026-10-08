// UI and optical state are independent from the freely orbiting camera.
export const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
// Three independent switches follow the 2014 paper Fig. 1 (#8 side, #9 bottom, #10 top).
export const initialState = () => ({ power: true, field: 'darkfield', brightness: .75, irisOpen: 1, explode: 0,
  topOn: false, topBrightness: .6, sideOn: false, sideBrightness: .6,
  selectedId: null, isolated: false, cutaway: true, showRays: false, showSample: true, viewMode: 'chamber' });
export function reduceState(state, event) {
  const next = { ...state };
  switch (event.type) {
    case 'reset': return initialState();
    case 'mode':
      if (!['off', 'darkfield', 'brightfield'].includes(event.value)) throw Error('未知照明模式');
      next.power = event.value !== 'off'; if (next.power) next.field = event.value; break;
    case 'toggleField': next.field = state.field === 'darkfield' ? 'brightfield' : 'darkfield'; break;
    case 'iris': next.irisOpen = clamp01(event.value); break;
    case 'brightness': next.brightness = clamp01(event.value); break;
    case 'topPower': next.topOn = !!event.value; break;
    case 'topBrightness': next.topBrightness = clamp01(event.value); break;
    case 'sidePower': next.sideOn = !!event.value; break;
    case 'sideBrightness': next.sideBrightness = clamp01(event.value); break;
    case 'explode': next.explode = clamp01(event.value); break;
    case 'select': next.selectedId = event.id || null; if (!next.selectedId) next.isolated = false; break;
    case 'isolate': next.isolated = !!event.value && !!next.selectedId; break;
    case 'cutaway': next.cutaway = !!event.value; break;
    case 'rays': next.showRays = !!event.value; break;
    case 'sample': next.showSample = !!event.value; break;
    case 'view':
      if (!['structure', 'chamber', 'sample'].includes(event.value)) throw Error('未知观察视图');
      next.viewMode = event.value; next.isolated = false;
      next.cutaway = event.value === 'chamber';
      if (event.value === 'chamber') next.showRays = true;
      if (event.value === 'sample') { next.showSample = true; next.showRays = false; }
      break;
    default: throw Error('未知操作：' + event.type);
  }
  return next;
}
export function deriveState(state, contract) {
  const suspended = state.explode > .001 || state.isolated;
  const range = contract.optics.irisRadiusRange;
  const irisRadius = range[0] + (range[1] - range[0]) * state.irisOpen;
  const active = state.power && state.brightness > 0 && !suspended;
  const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  const reflectedBeams = contract.optics.twoReflectionPaths.map((ray, index) => {
    const pupilOffset = distance(ray.irisPoint, contract.optics.irisCenter);
    // Finite sample illumination proxy; beamRadius in the contract is radial
    // position in the parallel incident beam, not the finite footprint radius.
    const footprintRadius = contract.sampleRadius * distance(ray.outerPoint, ray.irisPoint) / distance(ray.outerPoint, ray.samplePoint);
    return { index, pupilOffset, footprintRadius, transmission: apertureTransmission(irisRadius, footprintRadius, pupilOffset), centerPasses: pupilOffset <= irisRadius };
  });
  const axialTransmission = Math.min(1, (irisRadius / contract.optics.collimatedBeamRadius) ** 2);
  const someRingLightPasses = reflectedBeams.some(beam => beam.transmission > 0);
  // Top and side lights are incident from above the stage; the iris and cone do not affect them.
  const topActive = state.topOn && state.topBrightness > 0 && !suspended;
  const sideActive = state.sideOn && state.sideBrightness > 0 && !suspended;
  return { mode: state.power ? state.field : 'off', irisRadius, coneOpen: state.field === 'brightfield', illuminationActive: active,
    axialActive: active && state.field === 'brightfield', ringActive: active && state.field === 'darkfield' && someRingLightPasses,
    topActive, sideActive,
    topMessage: suspended ? '拆解或隔离时暂停。' : !state.topOn ? '顶光已关闭。' : state.topBrightness === 0 ? '亮度为零。'
      : 'LED 灯珠群经漫射板均匀柔和地照射宝石表面，用于观察表面特征（反射照明）。',
    sideMessage: suspended ? '拆解或隔离时暂停。' : !state.sideOn ? '侧光已关闭。' : state.sideBrightness === 0 ? '亮度为零。'
      : '鹅颈光导从侧上方定向照射，可随意调整角度，突出表面起伏或局部特征。',
    reflectedBeams, axialTransmission, rayVisible: active && state.showRays, sampleVisible: state.showSample && !suspended, suspended,
    message: suspended ? '拆解或隔离时暂停照明、散射体与光路；装配复位后继续。'
      : !state.power ? '底灯已关闭；中央组件与光阑保留当前位置。'
      : state.brightness === 0 ? '亮度为零；机械位置不变。'
      : state.field === 'darkfield' ? '中央锥体进入光轴，经锥面与外围反射器两次反射，斜向照射样品。' + (!someRingLightPasses ? ' 当前光阑截断示意斜光，请增大开度。' : '')
      : '中央组件退出轴向光束，仅保留明域直通光；外围反射器不再得到这束光。' };
}

// Circle–circle area overlap: finite oblique beams are clipped independently by the iris.
export function apertureTransmission(apertureRadius, beamRadius, offset) {
  if (!(apertureRadius > 0) || !(beamRadius > 0)) return 0;
  if (offset + beamRadius <= apertureRadius) return 1;
  if (offset >= apertureRadius + beamRadius) return 0;
  if (offset + apertureRadius <= beamRadius) return (apertureRadius / beamRadius) ** 2;
  const clamp = value => Math.max(-1, Math.min(1, value));
  const a = Math.acos(clamp((offset ** 2 + beamRadius ** 2 - apertureRadius ** 2) / (2 * offset * beamRadius)));
  const b = Math.acos(clamp((offset ** 2 + apertureRadius ** 2 - beamRadius ** 2) / (2 * offset * apertureRadius)));
  const area = beamRadius ** 2 * a + apertureRadius ** 2 * b - .5 * Math.sqrt(Math.max(0,
    (-offset + beamRadius + apertureRadius) * (offset + beamRadius - apertureRadius) *
    (offset - beamRadius + apertureRadius) * (offset + beamRadius + apertureRadius)));
  return clamp01(area / (Math.PI * beamRadius ** 2));
}
