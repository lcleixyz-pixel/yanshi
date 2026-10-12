import type { ComponentType, Dispatch } from 'react';
import type { SimDef, SimId } from '../../data/sims';
import type { SimAction, SimScene, SimScreenId, SimSession } from '../../domain/simSession';
import { spectroscopeInitial } from '../../domain/spectroscopeSim';
import SpectroscopeChallengeScreen from './spectroscope/SpectroscopeChallengeScreen';
import SpectroscopeLabScreen from './spectroscope/SpectroscopeLabScreen';
import SpectroscopeLearnScreen from './spectroscope/SpectroscopeLearnScreen';

/**
 * 仿真注册表：已迁入外壳的仪器按屏登记真实组件。
 * 未登记的仪器与屏幕继续由 SimPage 渲染占位屏（阶段 1 行为不变）。
 */

export interface SimScreenProps {
  sim: SimDef;
  screen: SimScreenId;
  onScreen: (screen: SimScreenId) => void;
  session: SimSession;
  dispatch: Dispatch<SimAction>;
}

export interface SimImplementation {
  /** 会话初始：各屏场景、会话选项与任务状态；深链参数在这里读取一次。 */
  initial: (search: URLSearchParams) => { scenes: Partial<Record<SimScreenId, SimScene>>; options: SimScene; taskData: SimScene; teacherUsed?: boolean };
  screens: Partial<Record<SimScreenId, ComponentType<SimScreenProps>>>;
}

export const SIM_IMPLEMENTATIONS: Partial<Record<SimId, SimImplementation>> = {
  spectroscope: {
    initial: spectroscopeInitial,
    screens: { learn: SpectroscopeLearnScreen, lab: SpectroscopeLabScreen, challenge: SpectroscopeChallengeScreen },
  },
};
