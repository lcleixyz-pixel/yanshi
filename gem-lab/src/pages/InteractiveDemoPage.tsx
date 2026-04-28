import { Navigate, useParams } from 'react-router-dom';
import RefractometerDemo from '@/components/refractometer/RefractometerDemo';
import PolariscopeDemo from '@/components/polariscope/PolariscopeDemo';
import SpectroscopeDemo from '@/components/spectroscope/SpectroscopeDemo';
import type { InstrumentId } from '@/data/types';

export default function InteractiveDemoPage() {
  const { instrumentId } = useParams<{ instrumentId: InstrumentId }>();
  switch (instrumentId) {
    case 'refractometer':
      return <RefractometerDemo />;
    case 'polariscope':
      return <PolariscopeDemo />;
    case 'spectroscope':
      return <SpectroscopeDemo />;
    default:
      return <Navigate to="/" replace />;
  }
}
