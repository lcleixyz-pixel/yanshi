import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import RefractometerDemo from '@/components/refractometer/RefractometerDemo';
import PolariscopeDemo from '@/components/polariscope/PolariscopeDemo';
import SpectroscopeDemo from '@/components/spectroscope/SpectroscopeDemo';
import type { InstrumentId } from '@/data/types';

export default function InteractiveDemoPage() {
  const { instrumentId } = useParams<{ instrumentId: InstrumentId }>();
  const [searchParams] = useSearchParams();
  const sample = searchParams.get('sample') ?? undefined;
  const embedded = searchParams.get('mode') === 'detection';
  const qaReady = searchParams.get('qa') === 'ready';

  switch (instrumentId) {
    case 'refractometer':
      return <RefractometerDemo forcedSampleId={sample} embedded={embedded} qaReady={qaReady} />;
    case 'polariscope':
      return <PolariscopeDemo forcedSampleId={sample} embedded={embedded} qaReady={qaReady} />;
    case 'spectroscope':
      return <SpectroscopeDemo forcedSampleId={sample} embedded={embedded} qaReady={qaReady} />;
    default:
      return <Navigate to="/" replace />;
  }
}
