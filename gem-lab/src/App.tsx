import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const HomePage = lazy(() => import('./pages/HomePage'));
const KnowledgeBasePage = lazy(() => import('./pages/KnowledgeBasePage'));
const InteractiveDemoPage = lazy(() => import('./pages/InteractiveDemoPage'));
const DetectionWorkflowPage = lazy(() => import('./pages/DetectionWorkflowPage'));
const NamingAssessmentPage = lazy(() => import('./pages/NamingAssessmentPage'));

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
        <Route path="/detection" element={<DetectionWorkflowPage />} />
        <Route path="/assessment" element={<NamingAssessmentPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
