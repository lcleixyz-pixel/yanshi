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
  /** focus 为 false 时只选中、不移动镜头。 */
  select(id: string, focus?: boolean): void;
  /** 部件热点：ids 依次编号（labelMode='name' 时改用 labels 的短名称）；done 为已查看；selected 为当前选中；hideOccluded 时被不透明部件挡住的热点隐藏；coach 为「点这里」指引的部件；null 关闭。 */
  setHotspots(hotspots: { ids: string[]; done?: string[]; coach?: string | null; selected?: string | null; labels?: Record<string, string>; hideOccluded?: boolean; labelMode?: 'number' | 'name' } | null): void;
  focusSelected(): void;
  fit(): void;
  reset(): void;
  dispose(): void;
}
/** extraCasesUrl：附加案例包（折射仪逐样品光路）；取不到时只用主案例，不报错。 */
export function createOpticsViewer(options: { container: HTMLElement; instrument: string; assetBase: string; onChange?: (snapshot: OpticsSnapshot) => void; extraCasesUrl?: string }): OpticsViewer;
