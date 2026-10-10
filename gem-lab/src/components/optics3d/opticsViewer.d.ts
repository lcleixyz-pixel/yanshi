export interface OpticsLegendItem { label: string; color: string }
export interface OpticsSnapshotReady {
  status: 'ready';
  state: { view: 'optics' | 'whole'; caseId: string | null; rays: boolean; explode: number; selectedId: string | null; isolated: boolean };
  suspended: boolean;
  /** 从部件实际姿态测出：如 slitControlDegrees、slitGapMm、focusTubeMm、sample。 */
  controls: Record<string, number | string>;
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
  /** 可动部件位置 0–1（按清单的转角 / 行程）；联动部件跟随控制部件。 */
  setControls(controls: Record<string, number>): void;
  /** 样品与入射光示意：through 光穿过样品，aside 样品移开、光直接进入狭缝；null 不显示。 */
  setSample(sample: { position: 'through' | 'aside' } | null): void;
  /** 视野对准指定部件（可同时切换整机 / 内部光路视图）。 */
  /** direction 为模型坐标中从目标指向相机的方向，省略时沿用当前视角。 */
  focusParts(ids: string[], view?: 'optics' | 'whole', direction?: [number, number, number]): void;
  reset(): void;
  dispose(): void;
}
export function createOpticsViewer(options: { container: HTMLElement; instrument: string; assetBase: string; onChange?: (snapshot: OpticsSnapshot) => void }): OpticsViewer;
