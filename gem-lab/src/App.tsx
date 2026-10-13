import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const HomePage = lazy(() => import('./pages/HomePage'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));
const InteractiveDemoPage = lazy(() => import('./pages/InteractiveDemoPage'));
const DetectionWorkflowPage = lazy(() => import('./pages/DetectionWorkflowPage'));
const NamingAssessmentPage = lazy(() => import('./pages/NamingAssessmentPage'));
const ProgressPage = lazy(() => import('./pages/ProgressPage'));
const PolariscopeExplorePage = lazy(() => import('./pages/PolariscopeExplorePage'));
const MicroscopeExplorePage = lazy(() => import('./pages/MicroscopeExplorePage'));
const OpticsExplorePage = lazy(() => import('./pages/OpticsExplorePage'));
const SpectroscopePractice3D = lazy(() => import('./components/spectroscope3d/SpectroscopePractice3D'));
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
        <Route path="/explore/polariscope" element={<LegacySimRedirect><PolariscopeExplorePage /></LegacySimRedirect>} />
        <Route path="/explore/microscope" element={<LegacySimRedirect><MicroscopeExplorePage /></LegacySimRedirect>} />
        {/* 已迁入仿真的仪器：旧入口转到新地址（保留参数）；未迁入的照常渲染原页面。 */}
        <Route path="/explore/optics/:instrumentId" element={<LegacySimRedirect><OpticsExplorePage /></LegacySimRedirect>} />
        <Route path="/explore/spectroscope-bench" element={<LegacySimRedirect><SpectroscopePractice3D /></LegacySimRedirect>} />
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
