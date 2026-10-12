// Keep the verified physical paths unchanged; split only their visual strokes.
export const WHITE_LIGHT_COLOR = '#969b9e';

export function displayPaths(instrumentId, paths = []) {
  const grating = instrumentId === 'grating-spectroscope';
  const whitePrism = instrumentId === 'prism-spectroscope'
    && new Set(paths.map(p => p.wavelengthNm).filter(Number.isFinite)).size > 1;
  if (!grating && !whitePrism) return paths;

  const incoming = new Map(), outgoing = [];
  for (const path of paths) {
    const boundary = path.interactions?.find(e => e.kind === (grating ? 'diffraction' : 'refraction'))?.pointIndex;
    if (!Number.isInteger(boundary) || boundary < 1 || boundary >= path.points.length - 1) {
      outgoing.push(path);
      continue;
    }
    const points = path.points.slice(0, boundary + 1);
    const key = JSON.stringify(points);
    if (!incoming.has(key)) incoming.set(key, {
      id: `white-input-${incoming.size}`, kind: 'incident-white', label: '入射白光（灰线）',
      color: WHITE_LIGHT_COLOR, points, opacity: 1,
    });
    outgoing.push({
      ...path, id: `${path.id}-after-dispersion`, sourcePathId: path.id,
      points: path.points.slice(boundary),
      ...(grating && path.order === 0 ? {color: WHITE_LIGHT_COLOR, label: '零级白光'} : {}),
    });
  }
  return [...incoming.values(), ...outgoing];
}
