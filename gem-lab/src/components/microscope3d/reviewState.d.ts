export type LightingMode = 'off' | 'darkfield' | 'brightfield';
export type ViewMode = 'structure' | 'chamber' | 'sample';

export interface MicroscopeState {
  power: boolean; field: 'darkfield' | 'brightfield'; brightness: number; irisOpen: number; explode: number;
  topOn: boolean; topBrightness: number; sideOn: boolean; sideBrightness: number;
  selectedId: string | null; isolated: boolean; cutaway: boolean; showRays: boolean; showSample: boolean; viewMode: ViewMode;
}
export interface MicroscopeDerived {
  mode: LightingMode; irisRadius: number; coneOpen: boolean; illuminationActive: boolean;
  axialActive: boolean; ringActive: boolean; topActive: boolean; sideActive: boolean;
  topMessage: string; sideMessage: string; axialTransmission: number;
  rayVisible: boolean; sampleVisible: boolean; suspended: boolean; message: string;
}
export type MicroscopeEvent =
  | { type: 'reset' } | { type: 'toggleField' }
  | { type: 'mode'; value: LightingMode } | { type: 'view'; value: ViewMode }
  | { type: 'iris' | 'brightness' | 'explode' | 'topBrightness' | 'sideBrightness'; value: number }
  | { type: 'topPower' | 'sidePower' | 'isolate' | 'cutaway' | 'rays' | 'sample'; value: boolean }
  | { type: 'select'; id: string | null };

export function clamp01(value: unknown): number;
export function initialState(): MicroscopeState;
export function reduceState(state: MicroscopeState, event: MicroscopeEvent): MicroscopeState;
export function deriveState(state: MicroscopeState, contract: unknown): MicroscopeDerived;
export function apertureTransmission(apertureRadius: number, beamRadius: number, offset: number): number;
