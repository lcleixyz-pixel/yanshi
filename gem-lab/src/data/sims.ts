import type { InstrumentId } from './types';
import type { SimScreenId } from '../domain/simSession';

export type SimId = InstrumentId | 'microscope';

export interface SimScreenDef {
  id: SimScreenId;
  /** 本屏一句话用途。 */
  summary: string;
  /** 迁移完成前，本屏内容所在的现有页面（逐台迁移；迁完后再把旧入口重定向到新屏幕）。 */
  current: { label: string; to: string }[];
}

export interface SimDef {
  id: SimId;
  name: string;
  /** 已迁入新外壳的屏幕；未迁入的屏幕显示占位并指向现有页面。 */
  migrated: readonly SimScreenId[];
  screens: readonly SimScreenDef[];
}

/** 各仪器仿真的屏幕划分（docs/整体重构规划-PhET风格-2026-10-11.md 第三节）。 */
export const SIMS: Record<SimId, SimDef> = {
  refractometer: {
    id: 'refractometer', name: '折射仪', migrated: [],
    screens: [
      { id: 'learn', summary: '结构与光路：拆解、透视、单色光路与部件名称。', current: [{ label: '3D 结构与光路', to: '/explore/optics/refractometer' }, { label: '基础读数课', to: '/explore/optics/refractometer?course=basic&mode=student' }] },
      { id: 'lab', summary: '开灯、滴液、放样、恢复接触，读出明暗边界。', current: [{ label: '基础读数课', to: '/explore/optics/refractometer?course=basic&mode=student' }, { label: '2D 全样品读数', to: '/demo/refractometer' }] },
      { id: 'challenge', summary: '抽未知样品独立读数并记录。', current: [{ label: '综合检测', to: '/detection' }] },
    ],
  },
  polariscope: {
    id: 'polariscope', name: '偏光镜', migrated: [],
    screens: [
      { id: 'learn', summary: '部件、光路与偏振原理。', current: [{ label: '认识部件', to: '/explore/polariscope?lesson=components' }, { label: '光路', to: '/explore/polariscope?lesson=path' }, { label: '原理', to: '/explore/polariscope?lesson=principle' }] },
      { id: 'lab', summary: '放样旋转、换方向复核、锥光干涉图。', current: [{ label: '样品观察', to: '/explore/polariscope?lesson=sample' }, { label: '引导课程', to: '/explore/polariscope?course=basic&mode=student' }] },
      { id: 'challenge', summary: '抽未知样品独立判断光性并记录。', current: [{ label: '综合检测', to: '/detection' }] },
    ],
  },
  spectroscope: {
    id: 'spectroscope', name: '分光镜', migrated: ['learn', 'lab'],
    screens: [
      { id: 'learn', summary: '结构与光路：棱镜式与光栅式屏内切换、部件名称、单色光路与引导任务前两步。', current: [] },
      { id: 'lab', summary: '照明与夹样工作台：调光、夹样、狭缝与调焦，标记吸收特征并记录；引导任务后四步也在这屏。', current: [] },
      { id: 'challenge', summary: '抽未知样品独立观察并记录吸收特征。', current: [{ label: '综合检测', to: '/detection' }] },
    ],
  },
  microscope: {
    id: 'microscope', name: '显微镜', migrated: [],
    screens: [
      { id: 'learn', summary: '底光、顶光、侧光三路照明与暗域 / 明域。', current: [{ label: '3D 三路照明', to: '/explore/microscope' }] },
    ],
  },
};

export const isSimId = (value: string | undefined): value is SimId => !!value && value in SIMS;
