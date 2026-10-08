export interface OpticsLegendItem { label: string; color: string }
export interface OpticsSnapshotReady {
  status: 'ready';
  state: { view: 'optics' | 'whole'; caseId: string | null; rays: boolean; explode: number; selectedId: string | null; isolated: boolean };
  suspended: boolean;
  cases: { id: string; label: string }[];
  currentCase: { label: string; description: string; readout: { label: string; value: string }[]; conditionNote: string; legend: OpticsLegendItem[] };
  parts: { id: string; label: string }[];
  selected: { id: string; label: string; note: string } | null;
  boundary: string;
  sources: { title: string; url: string | null; note: string }[];
}
export type OpticsSnapshot = { status: 'loading' } | { status: 'error'; error: string } | OpticsSnapshotReady;

export interface OpticsExternalState {
  caseId: string; partVisibility: Record<string, boolean>; cover: 'open' | 'closed'; power: boolean; rays: boolean; angle: number;
}
export interface OpticsViewer {
  setState(patch: OpticsExternalState): void;
  setView(view: 'optics' | 'whole'): void;
  setCase(caseId: string): void;
  setRays(rays: boolean): void;
  setExplode(explode: number): void;
  toggleIsolate(): void;
  select(id: string): void;
  focusSelected(): void;
  fit(): void;
  reset(): void;
  dispose(): void;
}
export function createOpticsViewer(options: { container: HTMLElement; instrument: string; assetBase: string; onChange?: (snapshot: OpticsSnapshot) => void }): OpticsViewer;
