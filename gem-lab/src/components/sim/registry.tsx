import type { ComponentType, Dispatch } from 'react';
import type { SimDef, SimId } from '../../data/sims';
import type { SimAction, SimScene, SimScreenId, SimSession } from '../../domain/simSession';
import { polariscopeInitial } from '../../domain/polariscopeSim';
import { refractometerInitial, refractometerSessionReducer } from '../../domain/refractometerSession';
import { spectroscopeInitial } from '../../domain/spectroscopeSim';
import { spectroscopeSessionReducer } from '../../domain/spectroscopeSession';
import PolariscopeLabScreen from './polariscope/PolariscopeLabScreen';
import PolariscopeLearnScreen from './polariscope/PolariscopeLearnScreen';
import RefractometerChallengeScreen from './refractometer/RefractometerChallengeScreen';
import RefractometerLabScreen from './refractometer/RefractometerLabScreen';
import RefractometerLearnScreen from './refractometer/RefractometerLearnScreen';
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
  reducer?: (session: SimSession, action: SimAction) => SimSession;
  screens: Partial<Record<SimScreenId, ComponentType<SimScreenProps>>>;
}

export const SIM_IMPLEMENTATIONS: Partial<Record<SimId, SimImplementation>> = {
  refractometer: {
    initial: refractometerInitial,
    reducer: refractometerSessionReducer,
    screens: { learn: RefractometerLearnScreen, lab: RefractometerLabScreen, challenge: RefractometerChallengeScreen },
  },
  // 偏光镜逐屏迁入（阶段 3b）：认识、实验屏已迁，挑战暂为占位并指向现有页面。
  polariscope: {
    initial: polariscopeInitial,
    screens: { learn: PolariscopeLearnScreen, lab: PolariscopeLabScreen },
  },
  spectroscope: {
    initial: spectroscopeInitial,
    reducer: spectroscopeSessionReducer,
    screens: { learn: SpectroscopeLearnScreen, lab: SpectroscopeLabScreen, challenge: SpectroscopeChallengeScreen },
  },
};
