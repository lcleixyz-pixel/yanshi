export const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v) || 0));
export const initialState = () => ({ mode: 'darkfield', lastLitMode: 'darkfield', brightness: .75, tiltDegrees: 0, focusMeters: 0,
  explode: 0, isolated: false, selectedId: null, showRays: false, showSample: true, cutaway: false, viewMode: 'structure' });
export function reduceState(state, event) {
  const next = { ...state };
  switch (event.type) {
    case 'reset': return initialState();
    case 'mode':
      if (!['off', 'darkfield', 'brightfield'].includes(event.value)) throw Error('未知照明模式');
      next.mode = event.value; if (event.value !== 'off') next.lastLitMode = event.value; break;
    case 'power': next.mode = state.mode === 'off' ? state.lastLitMode : 'off'; break;
    case 'cycleMode':
      next.lastLitMode = state.lastLitMode === 'darkfield' ? 'brightfield' : 'darkfield';
      if (state.mode !== 'off') next.mode = next.lastLitMode;
      break;
    case 'brightness': next.brightness = clamp(event.value, 0, 1); break;
    case 'tilt': next.tiltDegrees = clamp(event.value, 0, 25); break;
    case 'focus': next.focusMeters = clamp(event.value, -.012, .018); break;
    case 'explode': next.explode = clamp(event.value, 0, 1); break;
    case 'select': next.selectedId = event.id || null; if (!next.selectedId) next.isolated = false; break;
    case 'isolate': next.isolated = !!event.value && !!next.selectedId; break;
    case 'rays': next.showRays = !!event.value; break;
    case 'sample': next.showSample = !!event.value; break;
    case 'cutaway': next.cutaway = !!event.value; break;
    case 'view':
      if (!['structure', 'chamber', 'sample'].includes(event.value)) throw Error('未知视图');
      next.viewMode = event.value; next.isolated = false;
      next.cutaway = event.value === 'chamber';
      if (event.value === 'chamber') next.showRays = true;
      if (event.value === 'sample') { next.showSample = true; next.showRays = false; }
      break;
    default: throw Error('未知操作');
  }
  return next;
}
export function deriveState(state) {
  const suspended = state.explode > .0001 || state.isolated;
  const active = !suspended && state.mode !== 'off' && state.brightness > 0;
  return { suspended, brightfieldActive: active && state.mode === 'brightfield', darkfieldActive: active && state.mode === 'darkfield',
    sampleVisible: state.showSample && !suspended, raysVisible: active && state.showRays,
    message: suspended ? '拆解或隔离时暂停照明、散射体与光路；装配复位后继续。'
      : state.mode === 'off' ? '底光已关闭，仪器与背景的展示补光保持不变。'
      : state.brightness === 0 ? '亮度为零，当前没有照明光。'
      : state.mode === 'darkfield' ? '中央直射通路关闭，环形斜光照向散射体；部分改变方向的光可进入物镜。'
      : '中央扩散光源开启，环形斜光关闭；轴向光通过观察区域。' };
}
