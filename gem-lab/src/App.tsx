import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const HomePage = lazy(() => import('./pages/HomePage'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));
const InteractiveDemoPage = lazy(() => import('./pages/InteractiveDemoPage'));
const DetectionWorkflowPage = lazy(() => import('./pages/DetectionWorkflowPage'));
const NamingAssessmentPage = lazy(() => import('./pages/NamingAssessmentPage'));
const ProgressPage = lazy(() => import('./pages/ProgressPage'));
const SimPage = lazy(() => import('./pages/SimPage'));
const LegacySimRedirect = lazy(() => import('./pages/LegacySimRedirect'));

function PageFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-brand-50">
      <div className="flex items-center gap-3 text-brand">
        <span className="h-2 w-2 animate-soft-pulse rounded-full bg-brand"></span>
        <span className="font-mono text-xs tracking-widest">LOADING…</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/knowledge/:instrumentId" element={<KnowledgeBasePage />} />
        <Route path="/demo/:instrumentId" element={<InteractiveDemoPage />} />
        {/* 旧的 3D 探索页入口：四台仪器都已迁入仿真，转到新地址（保留参数）；不认识的旧地址回首页。 */}
        <Route path="/explore/*" element={<LegacySimRedirect />} />
        {/* PhET 式仿真外壳：屏幕与参数见 docs/整体重构规划-PhET风格-2026-10-11.md。 */}
        <Route path="/sim/:simId/:screen?" element={<SimPage />} />
        <Route path="/detection" element={<DetectionWorkflowPage />} />
        <Route path="/assessment" element={<NamingAssessmentPage />} />
        <Route path="/progress" element={<ProgressPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
