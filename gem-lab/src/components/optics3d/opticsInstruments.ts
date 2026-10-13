import type { InstrumentId } from '@/data/types';

/** Separately versioned web assets; spectroscopes keep their existing v1 packages. */
export const OPTICS_INSTRUMENTS = {
  'prism-spectroscope': { name: '棱镜式分光镜', knowledgeId: 'spectroscope', summary: '狭缝、准直镜与直视棱镜组：550 nm 直线出射，其余波长按色散分开。' },
  'grating-spectroscope': { name: '光栅式分光镜', knowledgeId: 'spectroscope', summary: '固定狭缝与透射复制光栅：零级保持白光，±1 级向两侧展开光谱。' },
  refractometer: { name: '宝石折射仪', knowledgeId: 'refractometer', summary: '高折射率半圆柱棱镜、接触液与样品：部分反射与全反射形成明暗分界。' },
} as const satisfies Record<string, { name: string; knowledgeId: InstrumentId; summary: string }>;

export type OpticsInstrumentId = keyof typeof OPTICS_INSTRUMENTS;
export const isOpticsInstrument = (id: string | undefined): id is OpticsInstrumentId => !!id && id in OPTICS_INSTRUMENTS;
export const opticsAssetBase = (id: OpticsInstrumentId) => `${import.meta.env.BASE_URL}assets/3d/${id}/${id==='refractometer'?'paper-optics-v2':'paper-optics-v1'}/`;
