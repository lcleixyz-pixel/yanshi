import { BENCH_METHOD_LABELS, type BenchMethod } from './spectroscopeBench';
import { isStepId, STEP_SCREEN } from './spectroscopeSim';

/**
 * 旧入口 → 仿真新地址的纯映射（阶段 2 分光镜迁移）：
 * - 两个 3D 探索页（含课程入口）→ 认识屏 / 实验屏，保留机型、讲师 / 学员与步骤；
 * - 照明夹样练习页 → 实验屏，保留样品、观察方法与机型；
 * - 2D 演示（/demo/spectroscope）不在此列：2D 能力保留，按「设备较旧时使用」入口进入。
 * 约束见 docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 5 条（逐台迁移、保留参数）。
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
