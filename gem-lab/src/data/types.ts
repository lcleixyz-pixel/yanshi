// ============================================================
// 数据模型定义
// ============================================================

export type InstrumentId = 'refractometer' | 'polariscope' | 'spectroscope';

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export type OpticalCharacter =
  | 'isotropic' // 均质体
  | 'uniaxial-positive' // 一轴晶（+）
  | 'uniaxial-negative' // 一轴晶（-）
  | 'biaxial-positive' // 二轴晶（+）
  | 'biaxial-negative' // 二轴晶（-）
  | 'aggregate'; // 多晶质集合体

/**
 * 仅用于折射仪互动：与样品展示图形态对应（主界面不单独展示本字段）
 * 刻面型 → 仅允许刻面法；其余 → 仅允许点测法
 */
export type SampleRefractometerShape = 'faceted' | 'cabochon' | 'fancy' | 'carved';

/** 偏光镜下的现象 */
export type PolariscopePhenomenon =
  | 'four-bright-four-dark' // 四明四暗（非均质体）
  | 'all-dark' // 全暗（均质体）
  | 'all-bright' // 全亮（多晶质集合体）
  | 'anomalous'; // 异常消光

export interface InstrumentComponent {
  id: string;
  name: string;
  description: string;
  /** 简短描述（用于标签卡，1 行） */
  shortDesc?: string;
  /** 在产品图上的相对位置（0-1） */
  position?: { x: number; y: number };
  /** 标签卡位置（默认跟随 position；用于手动微调说明文字） */
  labelPosition?: { y: number };
  /** 标签卡所在侧（左 / 右） */
  labelSide?: 'left' | 'right';
}

export interface InstrumentMethodStep {
  id: number;
  iconId: string; // 对应 public/assets/icons/steps/{iconId}.png
  title: string;
  hint?: string;
}

export interface InstrumentMethod {
  id: string;
  name: string;
  suitableFor: string;
  steps: InstrumentMethodStep[];
}

export interface InstrumentDef {
  id: InstrumentId;
  name: string;
  /** 主题色 className 前缀 */
  theme: 'refractometer' | 'polariscope' | 'spectroscope';
  themeHex: string;
  productImage: string;
  intro: {
    tagline: string;
    principle: string[];
    usage: string[];
    limitations: string[];
  };
  components: InstrumentComponent[];
  methods: InstrumentMethod[];
}

// ============================================================
// 样品 / 光谱
// ============================================================

export interface AbsorptionFeature {
  /** 吸收线 (line) 是单一波长，吸收带 (band) 有宽度 */
  type: 'line' | 'band';
  wavelength: number; // nm
  width?: number; // nm，仅 band
  intensity: 'strong' | 'medium' | 'weak';
  description?: string;
}

export interface GemCharacteristics {
  /** 折射率：单值（均质体）或区间（非均质体） */
  refractiveIndex: number | [number, number] | 'over-1.81';
  /** 双折射率 */
  birefringence?: number;
  /** 光学特征 */
  opticalCharacter: OpticalCharacter;
  /** 多色性描述 */
  pleochroism?: string;
  color: string;
  transparency:
    | '透明'
    | '半透明'
    | '不透明'
    | '透明-半透明'
    | '半透明-不透明'
    | '透明-不透明';
}

export interface SpectrumFeatures {
  /** 用 CSS 渐变绘制时的吸收特征 */
  features: AbsorptionFeature[];
  /** 文字描述 */
  description: string;
}

export interface SampleDef {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  difficulty: Difficulty;
  image: string;
  /** 与样品图/常规成品形态一致，供折射仪互动校验刻面/点测法；不在通用界面展示 */
  refractometerShape: SampleRefractometerShape;
  characteristics: GemCharacteristics;
  spectrum: SpectrumFeatures;
  detectionTips: string[];
}
