import type { MicroscopeDerived, MicroscopeEvent, MicroscopeState } from './reviewState.js';

export interface MicroscopePartInfo { id: string; label: string; note: string; exterior: boolean }
export type MicroscopeSnapshot =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; state: MicroscopeState; derived: MicroscopeDerived; parts: MicroscopePartInfo[]; selected: Omit<MicroscopePartInfo, 'exterior'> | null };

export interface MicroscopeViewer {
  dispatch(event: MicroscopeEvent, focus?: boolean): void;
  select(id: string): void;
  focusSelected(): void;
  fit(): void;
  dispose(): void;
}

export function createMicroscopeViewer(options: {
  container: HTMLElement;
  assetBase: string;
  onChange?: (snapshot: MicroscopeSnapshot) => void;
  /** Optional camera in asset coordinates: px, py, pz, tx, ty, tz. */
  camera?: number[];
}): MicroscopeViewer;
