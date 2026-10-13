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
    id: 'refractometer', name: '折射仪', migrated: ['learn', 'lab', 'challenge'],
    screens: [
      { id: 'learn', summary: '结构与光路：拆解、透视、单色光路与部件短名称；引导任务前两步也在这屏。', current: [] },
      { id: 'lab', summary: '开灯、滴液、放样、恢复接触、读出明暗边界；引导任务后六步与自由练习都在这屏。', current: [] },
      { id: 'challenge', summary: '抽一颗未知样品独立读数并记录，保存后揭示答案；检测流程也走这一屏。', current: [] },
    ],
  },
  polariscope: {
    id: 'polariscope', name: '偏光镜', migrated: ['learn', 'lab'],
    screens: [
      { id: 'learn', summary: '部件、光路与偏振原理：拆解、内部光源、5 步光路、空载与理想双折射；引导任务前三步也在这屏。', current: [] },
      { id: 'lab', summary: '样品观察与干涉图：先预测、正交下转满一周再揭晓，换方向复核与平行复核；引导任务后三步也在这屏。', current: [] },
      { id: 'challenge', summary: '抽未知样品独立判断光性并记录。', current: [{ label: '综合检测', to: '/detection' }] },
    ],
  },
  spectroscope: {
    id: 'spectroscope', name: '分光镜', migrated: ['learn', 'lab', 'challenge'],
    screens: [
      { id: 'learn', summary: '结构与光路：棱镜式与光栅式屏内切换、部件名称、单色光路与引导任务前两步。', current: [] },
      { id: 'lab', summary: '照明与夹样工作台：调光、夹样、狭缝与调焦，标记吸收特征并记录；引导任务后四步也在这屏。', current: [] },
      { id: 'challenge', summary: '抽一颗未知样品独立观察并记录吸收特征，保存后揭示答案；检测流程也走这一屏。', current: [] },
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
