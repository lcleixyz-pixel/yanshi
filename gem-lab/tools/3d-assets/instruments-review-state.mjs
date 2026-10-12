// Shared by the review page and the asset checker; no DOM or WebGL dependency.
export const illuminationModeIds = ['darkfield', 'brightfield', 'pinpoint', 'diffused', 'polarized', 'shadowing', 'overhead', 'oblique'];
const vector = v => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
export function illuminationContractErrors(manifest, nodeNames) {
  const errors = [], modes = manifest.illuminationModes;
  const nodes = nodeNames && new Set(nodeNames);
  const parts = new Set((manifest.parts || []).map(p => p.id));
  if (!Array.isArray(modes)) return ['illuminationModes must be an array'];
  if (modes.length !== 8 || new Set(modes.map(m => m.id)).size !== 8 || illuminationModeIds.some(id => !modes.some(m => m.id === id))) errors.push('Exactly eight distinct illumination modes are required');
  if (!modes.some(m => m.id === manifest.defaultIlluminationMode)) errors.push('Missing default illumination mode');
  for (const key of ['bottom', 'top', 'fiber']) {
    const source = manifest.sourceNodes?.[key];
    if (!source || !parts.has(source.partId) || !source.node || (nodes && !nodes.has(source.node))) errors.push('Missing independent emission node: ' + key);
    if (!vector(source?.emissiveColor) || !(source?.onIntensity > 0) || source?.offIntensity !== 0) errors.push('Invalid on/off emission: ' + key);
  }
  if (new Set(Object.values(manifest.sourceNodes || {}).map(s => s.node)).size !== 3) errors.push('Emission meshes must be independent');
  for (const key of ['darkfieldStop', 'brightfieldLever', 'diffuser', 'polarizer', 'analyzer']) {
    const mechanism = manifest.illuminationMechanics?.[key];
    const states = ['darkfieldStop', 'brightfieldLever'].includes(key) ? ['closed', 'open'] : ['out', 'in'];
    if (!mechanism || !parts.has(mechanism.partId) || !mechanism.node || (nodes && !nodes.has(mechanism.node))) errors.push('Missing illumination mechanism: ' + key);
    if (mechanism?.type !== 'translation' || !vector(mechanism.axisLocal) || Math.abs(Math.hypot(...(mechanism.axisLocal || [])) - 1) > 1e-6 || states.some(s => !Number.isFinite(mechanism.positionsMeters?.[s])) || !states.includes(mechanism.defaultState)) errors.push('Invalid illumination travel mapping: ' + key);
  }
  const range = manifest.irisMechanics?.angleRangeDegrees;
  for (const mode of modes) {
    const s = mode.states;
    if (!s || ['bottom', 'top', 'fiber'].some(k => typeof s.sources?.[k] !== 'boolean') || !['closed', 'open'].includes(s.darkfieldStop) || ['diffuser', 'polarizer', 'analyzer'].some(k => !['in', 'out'].includes(s[k])) || !Number.isFinite(s.irisAngleDegrees) || !range || s.irisAngleDegrees < range[0] || s.irisAngleDegrees > range[1]) {
      errors.push('Incomplete illumination state: ' + mode.id); continue;
    }
    const bottom = !['overhead', 'oblique'].includes(mode.id);
    if (s.sources.bottom !== bottom || s.sources.top !== (mode.id === 'overhead') || s.sources.fiber !== (mode.id === 'oblique')) errors.push('Incorrect source state: ' + mode.id);
    if (s.darkfieldStop !== (mode.id === 'darkfield' ? 'closed' : 'open')) errors.push('Incorrect stop state: ' + mode.id);
    if (s.diffuser !== (mode.id === 'diffused' ? 'in' : 'out') || s.polarizer !== (mode.id === 'polarized' ? 'in' : 'out') || s.analyzer !== (mode.id === 'polarized' ? 'in' : 'out')) errors.push('Incorrect plate state: ' + mode.id);
    if (mode.id === 'darkfield' && s.irisAngleDegrees !== range[1]) errors.push('Darkfield iris must be open');
    if (mode.id === 'pinpoint' && s.irisAngleDegrees > range[0] + .1 * (range[1] - range[0])) errors.push('Pinpoint iris must be near minimum');
    if (mode.id === 'shadowing' && !(s.irisAngleDegrees > range[0] && s.irisAngleDegrees < range[1])) errors.push('Shadowing iris must be partially closed');
  }
  return errors;
}

export function illuminationPlan(manifest, states) {
  const transforms = Object.entries(manifest.illuminationMechanics).map(([key, mechanism]) => {
    const state = key === 'brightfieldLever' ? states.darkfieldStop : states[key];
    const position = mechanism.positionsMeters[state], initial = mechanism.positionsMeters[mechanism.defaultState];
    if (!Number.isFinite(position) || !Number.isFinite(initial)) throw Error('Unknown illumination state: ' + key + '/' + state);
    return {partId: mechanism.partId, axis: mechanism.axisLocal, distance: position - initial};
  });
  const emissions = Object.entries(manifest.sourceNodes).map(([key, source]) => ({node: source.node, color: source.emissiveColor, intensity: states.sources[key] ? source.onIntensity : source.offIntensity}));
  return {transforms, emissions, irisAngleDegrees: states.irisAngleDegrees};
}

export function defaultHiddenNodes(manifest) {
  return (manifest.parts || []).filter(p => p.defaultVisible === false || p.teachingOverlay).map(p => p.node);
}
