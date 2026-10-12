import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { spectroscopeRedirect } from '../domain/simRedirects';

/**
 * 已迁入仿真的旧入口重定向：命中映射表就转到新地址（保留机型、样品、观察方法、讲师 / 学员与步骤），
 * 没命中的地址照常渲染原页面 —— 逐台迁移，其余仪器与 2D 演示不受影响。
 * 见 docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 5 条。
 */
export default function LegacySimRedirect({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const to = spectroscopeRedirect(pathname, search);
  return to ? <Navigate to={`${to}`} replace /> : <>{children}</>;
}
