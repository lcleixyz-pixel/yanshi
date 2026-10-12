import assert from 'node:assert/strict';
import test from 'node:test';
import {
  biaxialAxes,
  conoscopicLuminanceAt,
  directionFromTilt,
  ellipticalRetarderTransmission,
  linearRetarderRgb,
  luminance,
  quartzRotatoryPower,
  renderConoscopicFigure,
  retardationColor,
  retarderStackTransmission,
  type CrystalOptics,
} from '../../src/domain/polarizedLight';
import { buildSampleFieldMap, judgeObservation, meanSampleLuminance, parallelCheck, rotationCurve } from '../../src/domain/eyepieceField';
import { conoscopeCrystal, getPolariscopeProfile, POLARISCOPE_PROFILES } from '../../src/domain/polariscopeSamples';

const close = (actual: number, expected: number, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);
const crossed = { analyzerDeg: 90, thicknessMm: 3, sinThetaMax: 0.42 };
const uniaxial: CrystalOptics = { kind: 'uniaxial', birefringence: 0.008, axis: [0, 0, 1] };
const quartz: CrystalOptics = { kind: 'uniaxial', birefringence: 0.009, axis: [0, 0, 1], opticalActivity: 'quartz' };

test('interference colours are white-normalized and reach higher-order white', () => {
  const zero = retardationColor(0);
  zero.forEach((value) => close(value, 0, 1e-6));
  // 一级灰白约 250 nm 处亮度明显上升；高阶趋于各通道 0.5。
  assert.ok(luminance(retardationColor(250)) > 0.3);
  retardationColor(30000).forEach((value) => close(value, 0.5, 1e-12));
  // 平行偏光空载为白，正交空载为黑（Bloss 通式在 Γ=0 时退化为马吕斯定律）。
  linearRetarderRgb(0.3, 0, 0).forEach((value) => close(value, 1));
  linearRetarderRgb(0.3, 0, Math.PI / 2).forEach((value) => close(value, 0));
});

test('Bloss general formula equals Jones calculus for a linear retarder at any analyzer angle', () => {
  for (const psi of [0, 0.3, 0.8, 1.2]) for (const delta of [0.4, 2, 5.5]) for (const analyzer of [0, 0.7, Math.PI / 2, 2.4]) {
    const bloss = Math.cos(analyzer) ** 2 - Math.sin(2 * psi) * Math.sin(2 * (psi - analyzer)) * Math.sin(delta / 2) ** 2;
    close(ellipticalRetarderTransmission(psi, delta, 0, analyzer), bloss, 1e-12);
  }
});

test('pure optical rotation follows cos²(A − ρL) and opposite-handed layers cancel', () => {
  for (const rotation of [0.2, 0.9]) for (const analyzer of [0, 1, Math.PI / 2]) {
    close(ellipticalRetarderTransmission(0, 0, 2 * rotation, analyzer), Math.cos(analyzer - rotation) ** 2, 1e-12);
    close(retarderStackTransmission([{ psi: 0, deltaLinear: 0, deltaCircular: 2 * rotation }, { psi: 0, deltaLinear: 0, deltaCircular: -2 * rotation }], analyzer), Math.cos(analyzer) ** 2, 1e-12);
  }
  // 石英 589 nm 约 21.7°/mm，并随波长变短而增大（旋光色散）。
  close(quartzRotatoryPower(589.3), 21.72, 0.1);
  assert.ok(quartzRotatoryPower(430) > quartzRotatoryPower(650) * 2);
});

test('centred uniaxial figure: black cross along the polarizer directions that does not move with the stage', () => {
  for (const stageDeg of [0, 17, 45, 90, 133]) {
    // 沿起偏/检偏方向的臂上消光（中心附近与外圈都暗）。
    for (const r of [0.2, 0.55, 0.9]) {
      close(conoscopicLuminanceAt(uniaxial, r, 0, { ...crossed, stageDeg }), 0, 1e-9);
      close(conoscopicLuminanceAt(uniaxial, 0, r, { ...crossed, stageDeg }), 0, 1e-9);
    }
    // 45° 方向的象限不暗，且与物台角无关。
    close(conoscopicLuminanceAt(uniaxial, 0.4, 0.4, { ...crossed, stageDeg }), conoscopicLuminanceAt(uniaxial, 0.4, 0.4, { ...crossed, stageDeg: 0 }), 1e-9);
  }
  assert.ok(conoscopicLuminanceAt(uniaxial, 0.5, 0.5, { ...crossed, stageDeg: 0 }) > 0.05);
});

test('off-centre uniaxial figure: the cross translates around the field when the stage turns', () => {
  const tilted: CrystalOptics = { kind: 'uniaxial', birefringence: 0.008, axis: directionFromTilt(10, 0) };
  const at0 = renderConoscopicFigure(tilted, { ...crossed, stageDeg: 0, resolution: 64 });
  const at90 = renderConoscopicFigure(tilted, { ...crossed, stageDeg: 90, resolution: 64 });
  assert.notDeepEqual(Array.from(at0), Array.from(at90));
});

test('quartz bull’s eye: crossed polars leave a coloured centre where an inactive crystal is black', () => {
  const opts = { ...crossed, thicknessMm: 4, stageDeg: 0 };
  close(conoscopicLuminanceAt({ ...uniaxial, birefringence: 0.009 }, 0, 0, opts), 0, 1e-12);
  assert.ok(conoscopicLuminanceAt(quartz, 0, 0, opts) > 0.3, 'centre of quartz figure should be bright');
  // 离开中心较远处线性双折射占主导，十字臂恢复为暗。
  assert.ok(conoscopicLuminanceAt(quartz, 0.85, 0, opts) < 0.08);
  // 中心颜色随检偏器角度变化（旋光色散）。
  const centre = (analyzerDeg: number) => conoscopicLuminanceAt(quartz, 0, 0, { ...opts, analyzerDeg });
  assert.ok(Math.abs(centre(90) - centre(30)) > 0.1);
});

test('biaxial acute-bisectrix figure: a cross at extinction that separates into hyperbolae at 45°', () => {
  const bxa: CrystalOptics = { kind: 'biaxial', birefringence: 0.01, axes: biaxialAxes(25) };
  const opts = { ...crossed, thicknessMm: 2, sinThetaMax: 0.5 };
  // 0°：中心与两条臂均暗（十字）。
  close(conoscopicLuminanceAt(bxa, 0, 0, { ...opts, stageDeg: 0 }), 0, 1e-12);
  assert.ok(conoscopicLuminanceAt(bxa, 0, 0.5, { ...opts, stageDeg: 0 }) < 1e-6);
  assert.ok(conoscopicLuminanceAt(bxa, 0.5, 0, { ...opts, stageDeg: 0 }) < 1e-6);
  // 45°：中心变亮，黑带移到两个光轴出露点（位于 45° 对角线上）。
  assert.ok(conoscopicLuminanceAt(bxa, 0, 0, { ...opts, stageDeg: 45 }) > 0.2);
  const melatope = Math.sin(25 * Math.PI / 180) / 0.5 / Math.SQRT2;
  assert.ok(conoscopicLuminanceAt(bxa, melatope, melatope, { ...opts, stageDeg: 45 }) < 0.02);
});

test('biaxial optic-axis figure: one isogyre through the centre that turns with the stage', () => {
  const single: CrystalOptics = { kind: 'biaxial', birefringence: 0.009, axes: biaxialAxes(28, directionFromTilt(28, 180)) };
  const opts = { ...crossed, thicknessMm: 3, sinThetaMax: 0.42 };
  const darkness = (stageDeg: number, angleDeg: number) => conoscopicLuminanceAt(single, 0.5 * Math.cos(angleDeg * Math.PI / 180), 0.5 * Math.sin(angleDeg * Math.PI / 180), { ...opts, stageDeg });
  // 0°：黑带沿光轴面方向（0°/180°），与之垂直方向较亮。
  assert.ok(darkness(0, 0) < 0.02 && darkness(0, 180) < 0.02);
  assert.ok(darkness(0, 90) > 0.1);
  // 转到 45°，黑带离开 0° 方向——黑带随物台转动（一轴十字则不动）。
  assert.ok(darkness(45, 0) > 0.05);
});

test('sample profiles map to the expected polariscope phenomena', () => {
  const expect = (id: string, phenomenon: string) => assert.equal(getPolariscopeProfile(id)?.expectedPhenomenon, phenomenon, id);
  expect('spinel', 'all-dark'); expect('tourmaline', 'four-bright-four-dark'); expect('peridot', 'four-bright-four-dark');
  expect('jadeite', 'all-bright'); expect('garnet', 'anomalous'); expect('amber', 'anomalous'); expect('turquoise', 'not-applicable');
  for (const profile of POLARISCOPE_PROFILES) {
    const crystal = conoscopeCrystal(profile, 'optic-axis');
    assert.equal(crystal !== null, profile.observation === 'anisotropic', `${profile.id} conoscope availability`);
  }
});

test('orthoscopic field: singly refractive stays dark, doubly refractive blinks four times, aggregates stay bright', () => {
  const curve = (id: string, alongOpticAxis = false) => {
    const profile = getPolariscopeProfile(id)!;
    return rotationCurve(buildSampleFieldMap(profile, { orientation: alongOpticAxis ? 'optic-axis' : 'general', strain: 0 }, 72), 90, 72);
  };
  const range = (values: number[]) => Math.max(...values) - Math.min(...values);
  const spinel = curve('spinel');
  assert.ok(Math.max(...spinel) < 0.03 && range(spinel) < 1e-6);
  const tourmaline = curve('tourmaline');
  assert.ok(range(tourmaline) > 0.3, 'doubly refractive sample should blink');
  // 一周 4 次极暗：统计局部极小值数量（曲线采样 5°）。
  const minima = tourmaline.slice(0, 72).filter((value, i, all) => value < all[(i + 71) % 72] && value <= all[(i + 1) % 72]).length;
  assert.equal(minima, 4);
  const jadeite = curve('jadeite');
  assert.ok(Math.min(...jadeite) > 0.3 && range(jadeite) < 0.05, 'aggregate stays bright');
  // 沿光轴方向观察：非均质体也表现为暗，需换方向复查。
  assert.ok(Math.max(...curve('tourmaline', true)) < 0.05);
  // 不透明：没有透射光。
  assert.equal(Math.max(...curve('turquoise')), 0);
});

test('GIA ADR check: at the brightest position, turning the analyzer to parallel brightens strain but not true double refraction', () => {
  const brightest = (id: string, strain: number) => {
    const map = buildSampleFieldMap(getPolariscopeProfile(id)!, { orientation: 'general', strain }, 72);
    let best = 0, angle = 0;
    for (let a = 0; a < 90; a += 1) { const v = meanSampleLuminance(map, a, 90, 2); if (v > best) { best = v; angle = a; } }
    return { crossedValue: best, parallelValue: meanSampleLuminance(map, angle, 0, 2) };
  };
  const strained = brightest('garnet', 0.6);
  assert.ok(strained.parallelValue > strained.crossedValue * 2, 'ADR brightens strongly when analyzer is parallel');
  const doubly = brightest('tourmaline', 0);
  assert.ok(doubly.parallelValue <= doubly.crossedValue * 1.15, 'doubly refractive does not brighten markedly');
});

test('parallel check is only meaningful when the crossed field has a polarization-dependent bright position', () => {
  const check = (id: string, orientation: 'general' | 'optic-axis', strain: number) => {
    const profile = getPolariscopeProfile(id)!, settings = { orientation, strain };
    return parallelCheck(profile, settings, buildSampleFieldMap(profile, settings, 72)).verdict;
  };
  assert.equal(check('spinel', 'general', 0), 'dark-no-check');
  assert.equal(check('diamond', 'general', 0), 'dark-no-check');
  // 半透明样品的散射灰底不是应变（独立验收复现：欧泊、零应变琥珀）。
  assert.equal(check('opal', 'general', 0), 'dark-no-check');
  assert.equal(check('amber', 'general', 0), 'dark-no-check');
  assert.equal(check('tourmaline', 'optic-axis', 0), 'along-axis');
  assert.equal(check('ruby', 'optic-axis', 0), 'along-axis');
  assert.equal(check('garnet', 'general', 0.6), 'strain');
  assert.equal(check('tourmaline', 'general', 0), 'double-refraction');
});

test('non-quartz crystals along the optic axis are dark, not optically active (independent acceptance repro)', () => {
  for (const id of ['ruby', 'sapphire', 'emerald', 'moonstone']) {
    const profile = getPolariscopeProfile(id)!, settings = { orientation: 'optic-axis' as const, strain: 0 };
    assert.equal(judgeObservation(profile, settings, buildSampleFieldMap(profile, settings, 72)), 'axis-dark', id);
  }
});

test('off-axis uniaxial cross keeps its arms parallel to the polarizers while it translates', () => {
  const tilted: CrystalOptics = { kind: 'uniaxial', birefringence: 0.008, axis: directionFromTilt(10, 0) };
  const opts = { ...crossed, thicknessMm: 3 };
  for (const stageDeg of [0, 37, 90, 160]) {
    // 光轴出露点在像面上的位置：sinθ = sin10° 对应 r = sin10°/sinMax，方位随物台转动。
    const r = Math.sin(10 * Math.PI / 180) / 0.42, az = stageDeg * Math.PI / 180;
    const mx = r * Math.cos(az), my = r * Math.sin(az);
    // 沿过出露点的水平线、竖直线（偏离不远处）都应暗，即两臂仍是横竖方向。
    for (const d of [0.08, 0.15]) {
      assert.ok(conoscopicLuminanceAt(tilted, mx + d, my, { ...opts, stageDeg }) < 0.03, `horizontal arm at ${stageDeg}°`);
      assert.ok(conoscopicLuminanceAt(tilted, mx, my + d, { ...opts, stageDeg }) < 0.03, `vertical arm at ${stageDeg}°`);
    }
  }
});

test('wide-field acute-bisectrix figure of a large-2V stone shows the isogyres at 45°', () => {
  const topaz = getPolariscopeProfile('topaz')!;
  const crystal = conoscopeCrystal(topaz, 'acute-bisectrix')!;
  const sinThetaMax = Math.min(0.92, Math.sin(topaz.opticAxialAngle! / 2 * Math.PI / 180) * 1.3);
  const melatope = Math.sin(topaz.opticAxialAngle! / 2 * Math.PI / 180) / sinThetaMax / Math.SQRT2;
  assert.ok(melatope * Math.SQRT2 < 1, 'melatope inside the field');
  assert.ok(conoscopicLuminanceAt(crystal, melatope, melatope, { ...crossed, thicknessMm: 2.5, sinThetaMax, stageDeg: 45 }) < 0.03);
});

test('quartz viewed along the optic axis is not dark: optical activity gives a constant colour under crossed polars', () => {
  const quartzCurve = rotationCurve(buildSampleFieldMap(getPolariscopeProfile('citrine')!, { orientation: 'optic-axis', strain: 0 }, 72), 90, 36);
  assert.ok(Math.min(...quartzCurve) > 0.15, 'quartz along the axis transmits light');
  assert.ok(Math.max(...quartzCurve) - Math.min(...quartzCurve) < 1e-6, 'and does not blink as the stage turns');
  const tourmalineCurve = rotationCurve(buildSampleFieldMap(getPolariscopeProfile('tourmaline')!, { orientation: 'optic-axis', strain: 0 }, 72), 90, 36);
  assert.ok(Math.max(...tourmalineCurve) < 0.05, 'an optically inactive crystal along the axis stays dark');
});

test('ordinary view and conoscope share one crystal: extinction direction matches the conoscopic vibration direction', () => {
  for (const id of ['tourmaline', 'peridot']) {
    const profile = getPolariscopeProfile(id)!;
    const map = buildSampleFieldMap(profile, { orientation: 'general', strain: 0 }, 72);
    let darkest = Infinity, angle = 0;
    for (let a = 0; a < 90; a += 0.5) { const v = meanSampleLuminance(map, a, 90, 2); if (v < darkest) { darkest = v; angle = a; } }
    // 锥光图视场中心（竖直传播方向）在同一物台角下也应消光。
    const crystal = conoscopeCrystal(profile, 'general')!;
    assert.ok(conoscopicLuminanceAt(crystal, 0, 0, { ...crossed, stageDeg: angle }) < 0.02, `${id} centre dark at ${angle}°`);
  }
});

test('Brazil-twinned quartz along the optic axis is dark: opposite rotations cancel', () => {
  const curve = (brazilTwin: boolean) => rotationCurve(buildSampleFieldMap(getPolariscopeProfile('citrine')!, { orientation: 'optic-axis', strain: 0, brazilTwin }, 72), 90, 36);
  assert.ok(Math.max(...curve(true)) < 0.05);
  assert.ok(Math.min(...curve(false)) > 0.15);
});

test('verdict matrix: every sample, orientation, twin, strain and thickness follows the material mechanism', async () => {
  const failures: string[] = [];
  for (const profile of POLARISCOPE_PROFILES) {
    const orientations = profile.orientations.length ? profile.orientations : (['general'] as const);
    for (const orientation of orientations) for (const brazilTwin of profile.quartz ? [false, true] : [false]) for (const strain of profile.observation === 'isotropic' ? [0, 0.6] : [0]) for (const thicknessMm of [1, 2.5, 5]) {
      const settings = { orientation, strain, brazilTwin, thicknessMm };
      const map = buildSampleFieldMap(profile, settings, 48);
      const verdict = judgeObservation(profile, settings, map), check = parallelCheck(profile, settings, map);
      const label = `${profile.id}/${orientation}/twin=${brazilTwin}/strain=${strain}/${thicknessMm}mm`;
      let expected: string;
      if (profile.observation === 'opaque') expected = 'not-applicable';
      else if (profile.observation === 'aggregate') expected = 'all-bright';
      else if (profile.observation === 'isotropic') expected = strain > 0 ? 'anomalous' : 'all-dark';
      else if (orientation !== 'optic-axis') expected = 'four-bright-four-dark';
      else expected = profile.quartz ? (brazilTwin ? 'axis-twin-dark' : 'axis-rotation') : 'axis-dark';
      if (verdict !== expected) failures.push(`${label}: verdict ${verdict} ≠ ${expected}`);
      // ADR 只属于设置了应变的均质体；散射灰底不会被当成应变。
      if (check.verdict === 'strain' && !(profile.observation === 'isotropic' && strain > 0)) failures.push(`${label}: false ADR`);
      if (profile.observation === 'isotropic' && strain > 0 && check.verdict !== 'strain') failures.push(`${label}: missed ADR (${check.verdict})`);
      if (profile.observation === 'anisotropic' && orientation !== 'optic-axis' && check.verdict !== 'double-refraction') failures.push(`${label}: DR check ${check.verdict}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('gemology audit counterexamples', async () => {
  const { visibleOpticAxes } = await import('../../src/domain/polarizedLight');
  // 纤维状葡萄石按集合体：始终亮、无干涉图。
  const prehnite = getPolariscopeProfile('prehnite')!;
  assert.equal(prehnite.observation, 'aggregate');
  assert.equal(conoscopeCrystal(prehnite, 'optic-axis'), null);
  const settings = { orientation: 'general' as const, strain: 0 };
  assert.equal(judgeObservation(prehnite, settings, buildSampleFieldMap(prehnite, settings, 48)), 'all-bright');
  // 一般方向的橄榄石：一条光轴落在默认视场内（说明不能一律称“不在视场内”）。
  assert.equal(visibleOpticAxes(conoscopeCrystal(getPolariscopeProfile('peridot')!, 'general')!, 0.42), 1);
  assert.equal(visibleOpticAxes(conoscopeCrystal(getPolariscopeProfile('tourmaline')!, 'general')!, 0.42), 0);
  // 等厚左右旋双晶沿光轴：中心消光（说明须随双晶条件变化）。
  const twin = conoscopeCrystal(getPolariscopeProfile('citrine')!, 'optic-axis', true)!;
  assert.ok(conoscopicLuminanceAt(twin, 0, 0, { ...crossed, thicknessMm: 2.5, stageDeg: 0 }) < 1e-6);
});
