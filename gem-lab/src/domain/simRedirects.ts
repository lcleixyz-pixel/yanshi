import { BENCH_METHOD_LABELS, type BenchMethod } from './spectroscopeBench';
import { isStepId, STEP_SCREEN } from './spectroscopeSim';
import { isStepId as isRefractometerStep, STEP_SCREEN as REFRACTOMETER_STEP_SCREEN } from './refractometerSim';
import { isLesson as isPolariscopeLesson, isStepId as isPolariscopeStep, STEP_SCREEN as POLARISCOPE_STEP_SCREEN } from './polariscopeSim';

/**
 * 旧入口 → 仿真新地址的纯映射（逐台迁移、保留参数）：
 * - 分光镜（阶段 2）：两个 3D 探索页（含课程入口）→ 认识屏 / 实验屏；照明夹样练习页 → 实验屏。
 * - 折射仪（阶段 3a）：3D 探索页（含基础读数课与步骤）→ 认识屏 / 实验屏。
 * - 偏光镜（阶段 3b）：3D 教学页（五讲 `?lesson=` 与引导课程）→ 认识屏 / 实验屏。
 * - 2D 演示（/demo/…）不在此列：2D 能力保留，按「设备较旧时使用」入口进入。
 * 约束见 docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 5 条。
 */

export const SPECTROSCOPE_MACHINES = ['prism', 'grating'] as const;

/** 返回新地址；不是已迁移的旧入口时返回 null（调用方照常渲染原页面）。 */
export function spectroscopeRedirect(rawPath: string, search: string): string | null {
  const params = new URLSearchParams(search);
  // 尾斜杠（/explore/spectroscope-bench/）与重复斜杠都按同一地址处理。
  const pathname = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  const explore = /^\/explore\/optics\/(prism|grating)-spectroscope$/.exec(pathname);
  if (explore) {
    const out = new URLSearchParams({ machine: explore[1] });
    // 课程入口（?course=basic）保留讲师 / 学员：未写 mode 时与旧页一致按讲师演示。
    if (params.get('course') === 'basic') {
      out.set('mode', params.get('mode') === 'student' ? 'student' : 'teacher');
      const step = params.get('step');
      if (isStepId(step)) out.set('step', step);
      return `/sim/spectroscope/${isStepId(step) ? STEP_SCREEN[step] : 'learn'}?${out.toString()}`;
    }
    return `/sim/spectroscope/learn?${out.toString()}`;
  }
  if (pathname === '/explore/spectroscope-bench') {
    const out = new URLSearchParams();
    const sample = params.get('sample');
    if (sample) out.set('sample', sample);
    const method = params.get('method');
    if (method && method in BENCH_METHOD_LABELS) out.set('method', method as BenchMethod);
    const instrument = params.get('instrument');
    if (instrument === 'prism' || instrument === 'grating') out.set('machine', instrument);
    const query = out.toString();
    return `/sim/spectroscope/lab${query ? `?${query}` : ''}`;
  }
  return null;
}

/**
 * 折射仪的旧入口 → 新地址（阶段 3a）。课程入口（?course=basic）保留讲师 / 学员与步骤（落到该步骤所在屏）；
 * 自由探索与知识库入口落到认识屏；`?sample=` 这类自由练习参数照旧留在实验屏。
 */
export function refractometerRedirect(rawPath: string, search: string): string | null {
  const params = new URLSearchParams(search);
  const pathname = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  if (pathname !== '/explore/optics/refractometer') return null;
  const step = params.get('step');
  const screen = isRefractometerStep(step) ? REFRACTOMETER_STEP_SCREEN[step] : 'learn';
  const out = new URLSearchParams();
  if (params.get('course') === 'basic') {
    out.set('mode', params.get('mode') === 'student' ? 'student' : 'teacher');
    if (isRefractometerStep(step)) out.set('step', step);
  } else {
    // 自由探索（含 ?sample=）按自由练习进入实验屏，机器与样品随参数带过去。
    const sample = params.get('sample');
    if (sample) out.set('sample', sample);
    if (screen === 'learn' && !sample) return `/sim/refractometer/learn${queryOf(out)}`;
    return `/sim/refractometer/lab${queryOf(out)}`;
  }
  return `/sim/refractometer/${screen}${queryOf(out)}`;
}

const queryOf = (out: URLSearchParams) => (out.toString() ? `?${out.toString()}` : '');

/**
 * 偏光镜的旧入口 → 新地址（阶段 3b）：部件 / 光路 / 原理三讲进认识屏，样品 / 干涉图两讲进实验屏，讲次随地址带过去；
 * 课程入口（?course=basic）保留讲师 / 学员与步骤（落到该步骤所在屏）；课堂低配画质 ?quality= 照旧保留。
 */
export function polariscopeRedirect(rawPath: string, search: string): string | null {
  const params = new URLSearchParams(search);
  const pathname = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  if (pathname !== '/explore/polariscope') return null;
  const out = new URLSearchParams();
  const lesson = params.get('lesson');
  let screen: 'learn' | 'lab' = lesson === 'sample' || lesson === 'conoscope' ? 'lab' : 'learn';
  if (isPolariscopeLesson(lesson)) out.set('lesson', lesson);
  if (params.get('course') === 'basic') {
    out.set('mode', params.get('mode') === 'student' ? 'student' : 'teacher');
    const step = params.get('step');
    if (isPolariscopeStep(step)) { out.set('step', step); screen = POLARISCOPE_STEP_SCREEN[step] as 'learn' | 'lab'; }
    else if (!isPolariscopeLesson(lesson)) screen = 'learn';
  }
  const quality = params.get('quality');
  if (quality === 'standard' || quality === 'high') out.set('quality', quality);
  return `/sim/polariscope/${screen}${queryOf(out)}`;
}

/** 显微镜的旧入口（阶段 4）：3D 三路照明页 → 认识屏。相机深链在地址的 #cam= 里，由页面层原样带过去。 */
export function microscopeRedirect(rawPath: string): string | null {
  const pathname = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  return pathname === '/explore/microscope' ? '/sim/microscope/learn' : null;
}

/** 全部已迁移仪器的旧入口映射：命中谁就转谁。 */
export function legacySimRedirect(rawPath: string, search: string): string | null {
  return spectroscopeRedirect(rawPath, search) ?? refractometerRedirect(rawPath, search) ?? polariscopeRedirect(rawPath, search) ?? microscopeRedirect(rawPath);
}
