import { Navigate, useLocation } from 'react-router-dom';
import { legacySimRedirect } from '../domain/simRedirects';

/**
 * 旧的 3D 探索页入口重定向：命中映射表就转到新地址（保留机型、样品、观察方法、讲师 / 学员与步骤），
 * 没命中的旧地址回首页（四台仪器都已迁入仿真，旧页面已删除）。
 * 见 docs/整体重构规划-PhET风格-2026-10-11.md 第六节第 5 条。
 */
export default function LegacySimRedirect() {
  const { pathname, search, hash } = useLocation();
  const to = legacySimRedirect(pathname, search);
  // 地址里的 #…（显微镜的相机深链 #cam=）原样带到新地址。
  return <Navigate to={to ? `${to}${hash}` : '/'} replace />;
}
