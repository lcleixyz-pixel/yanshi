export const WHITE_LIGHT_COLOR: string;
export interface OpticalPath { id: string; kind?: string; label?: string; color?: string; points: number[][]; wavelengthNm?: number; order?: number; opacity?: number; sourcePathId?: string; interactions?: { kind: string; pointIndex: number }[] }
export function displayPaths(instrumentId: string, paths?: OpticalPath[]): OpticalPath[];
