import type { InstrumentDef } from './types';

export const INSTRUMENTS: Record<string, InstrumentDef> = {
  refractometer: {
    id: 'refractometer',
    name: '折射仪',
    theme: 'refractometer',
    themeHex: '#e8a93a',
    productImage: '/assets/instruments/refractometer.png',
    intro: {
      tagline: '测定折射率与双折射率，鉴定的关键证据',
      principle: [
        '折射仪根据光的全内反射原理设计：当光线由光密介质（铅玻璃半球）进入光疏介质（宝石）时，若入射角大于宝石的临界角即发生全内反射。反射光透射到已标定的刻度尺上，通过目镜放大，便可直接读出宝石的折射率值。',
        '刻度尺上的标定读数 = 玻璃折射率 × 临界角的 sin 值。仪器使用波长 589.5 nm 的钠黄光为最理想光源，可有效避免色散造成的彩色谱带干扰。',
        '宝石的化学成分和晶体结构决定其折射率，折射率是宝石最稳定的性质之一，是宝石鉴定中最关键的证据。',
      ],
      usage: [
        '测量宝石折射率值（RI）',
        '测量双折射率值（DR），区分均质体与非均质体',
        '判断宝石光性（一轴晶 / 二轴晶 / 正光性 / 负光性）',
        '辅助宝石品种鉴别',
      ],
      limitations: [
        '测量范围 1.35 – 1.81，超出无法读数',
        '需要抛光良好的平面（刻面型）或弧面（弧面型）',
        '颗粒过小、未抛光、抛光差的宝石无法测试',
        '宝石颜色与透明度不影响测试',
      ],
    },
    components: [
      {
        id: 'prism',
        name: '棱镜测台',
        shortDesc: '高折射率单折射材料',
        description:
          '位于仪器金属台正中央，由高折射率铅玻璃（1.86–1.96）或立方氧化锆（2.16）制成。要求满足"单折射 + 高折射率"两个条件。',
        position: { x: 0.50, y: 0.38 },
        labelPosition: { y: 0.38 },
        labelSide: 'left',
      },
      {
        id: 'polarizer',
        name: '偏光片',
        shortDesc: '套于目镜外侧（可选）',
        description:
          '可选附件，套于目镜外侧。转动至振动方向与全反射光一致时可提高观察清晰度。',
        position: { x: 0.276, y: 0.54 },
        labelPosition: { y: 0.54 },
        labelSide: 'left',
      },
      {
        id: 'eyepiece',
        name: '目镜',
        shortDesc: '观察测量结果和刻度读数',
        description: '内置透镜起聚焦作用，配合标尺与偏光片观察明暗分界线，直接读取折射率。',
        position: { x: 0.28, y: 0.76 },
        labelPosition: { y: 0.76 },
        labelSide: 'left',
      },
      {
        id: 'switch',
        name: '电源开关',
        shortDesc: '控制仪器电源',
        description: '接通仪器内置光源（部分型号还支持外部光源接入）。',
        position: { x: 0.62, y: 0.72 },
        labelPosition: { y: 0.72 },
        labelSide: 'right',
      },
      {
        id: 'liquid',
        name: '折射油（接触液）',
        shortDesc: '保证良好光学接触',
        description:
          '由二碘甲烷加晶体硫制得，常见折射率 1.78（或加 18% 四碘乙烯达到 1.81）。用于消除棱镜与样品之间的空气，保证良好光学接触。',
        position: { x: 0.80, y: 0.55 },
        labelPosition: { y: 0.55 },
        labelSide: 'right',
      },
    ],
    methods: [
      {
        id: 'facet',
        name: '刻面法（大刻面宝石测定法）',
        suitableFor: '具有大而平整、抛光良好的刻面型宝石',
        steps: [
          { id: 1, iconId: 'clean', title: '擦净棱镜台与宝石', hint: '保证棱镜面与样品测试面无尘洁净' },
          { id: 2, iconId: 'power-on', title: '打开仪器电源开关' },
          { id: 3, iconId: 'liquid-drop', title: '在棱镜台正中央点 1–2 mm 折射油' },
          { id: 4, iconId: 'place-sample', title: '将样品最大平整刻面朝下，轻推至棱镜台中央' },
          {
            id: 5,
            iconId: 'observe',
            title: '通过目镜观察阴影边界',
            hint: '若边界不清晰，可加偏光片旋转观察',
          },
          {
            id: 6,
            iconId: 'rotate',
            title: '原地转动样品 360°，每隔约 15° 读一次数',
            hint: '记录至少四个不同方向的数据',
          },
          {
            id: 7,
            iconId: 'record',
            title: '取最大值与最小值（保留三位小数）',
            hint: '示例：1.545 – 1.554',
          },
        ],
      },
      {
        id: 'spot',
        name: '点测法',
        suitableFor: '弧面型宝石，或刻面太小无法用刻面法的样品',
        steps: [
          { id: 1, iconId: 'clean', title: '擦净棱镜台与宝石' },
          { id: 2, iconId: 'power-on', title: '打开仪器电源开关' },
          { id: 3, iconId: 'remove', title: '取下偏光片（部分型号取下目镜）' },
          { id: 4, iconId: 'liquid-drop', title: '在棱镜台中央点 < 1 mm 折射油', hint: '油量过大会导致影像点边界过厚' },
          { id: 5, iconId: 'place-sample', title: '将样品弧面朝下放置在棱镜台正中央' },
          { id: 6, iconId: 'observe', title: '眼睛距仪器 30–35 cm，头部上下移动找圆形影像点' },
          { id: 7, iconId: 'read-scale', title: '上半圆暗、下半圆亮时读取明暗交界处刻度' },
          { id: 8, iconId: 'record', title: '保留两位小数并标注（点）', hint: '示例：1.66（点）' },
        ],
      },
    ],
  },

  polariscope: {
    id: 'polariscope',
    name: '偏光镜',
    theme: 'polariscope',
    themeHex: '#7c3aed',
    productImage: '/assets/instruments/polariscope.png',
    intro: {
      tagline: '判别均质 / 非均质 / 多晶质集合体，进一步判定光性轴性',
      principle: [
        '偏光镜底部光源发出的自然光，经下偏光片转化为偏振光；当偏振光通过非均质体宝石时，分解为两束传播方向不同、振动方向相互垂直的偏振光。',
        '上下偏光片振动方向相互垂直时（正交），仅与上偏光片方向一致的光能通过——观察到亮；其他方向不能通过——观察到暗。转动样品 360° 即可看到明暗变化规律。',
        '通过明暗变化可判断宝石光学性质；配合锥光干涉球可观察干涉图，进一步判定轴性；上下偏光片平行时可观察多色性。',
      ],
      usage: [
        '判断均质体 / 非均质体 / 多晶质集合体',
        '配合锥光干涉球判定一轴晶 / 二轴晶',
        '观察多色性（二色性 / 三色性）',
        '识别异常消光、双晶等特殊现象',
      ],
      limitations: [
        '不透明宝石不能进行光性检测',
        '颗粒过小的宝石观察困难',
        '多孔、多裂隙、多杂质需结合其他仪器结果',
        '光泽强、火彩明显的宝石（如钻石）易出现假象',
      ],
    },
    components: [
      {
        id: 'upper-polar',
        name: '上偏光片（检偏器）',
        shortDesc: '可旋转，切换正交 / 平行状态',
        description:
          '位于支架顶端、载物台正上方，为可绕竖轴旋转的圆环式偏振片。与下偏光片配合可转到正交（消光）位置，用于区分均质体与非均质体、观察消光与干涉色。',
        position: { x: 0.62, y: 0.13 },
        labelSide: 'right',
      },
      {
        id: 'stage',
        name: '载物台',
        shortDesc: '放置待测样品的平台',
        description:
          '样品放置的圆形平台，位于上下偏光片之间。光从下往上穿过样品后再进入上偏光片。',
        position: { x: 0.52, y: 0.32 },
        labelSide: 'left',
      },
      {
        id: 'lower-polar',
        name: '下偏光片（起偏镜）',
        shortDesc: '将自然光转化为线偏振光',
        description:
          '在载物台下方、贴近光路。将 LED 出射光变为线偏振光，作为系统的起偏端，与上偏光片共同构成正交偏光（或任意夹角）的照明—观察光路。',
        position: { x: 0.52, y: 0.50 },
        labelSide: 'left',
      },
      {
        id: 'led',
        name: 'LED 光源模块',
        shortDesc: '底部均匀面照明',
        description:
          '在底座内，经窗口可见，提供自下而上的均匀面照明，保证视场亮度与观察条件稳定。',
        position: { x: 0.52, y: 0.68 },
        labelSide: 'left',
      },
      {
        id: 'condenser',
        name: '干涉球（锥光镜）',
        shortDesc: '锥光观察干涉图',
        description:
          '装在立柱上的小透镜，置于光路中可把近平行光会聚为锥形光穿过样品，便于在正交偏光下观察干涉图（如宝石光性、一轴/二轴晶干涉图样）。',
        position: { x: 0.22, y: 0.28 },
        labelSide: 'left',
      },
      {
        id: 'base',
        name: '底座主体',
        shortDesc: '整机结构主体',
        description:
          '白色壳体，承托光源、下偏光片、载物台机构及电气部分，是仪器的结构主体。',
        position: { x: 0.52, y: 0.84 },
        labelSide: 'right',
      },
      {
        id: 'switch',
        name: '电源开关',
        shortDesc: '控制光源通断（位于背面）',
        description: '控制光源通断，实际位于仪器背面。',
        position: { x: 0.82, y: 0.72 },
        labelSide: 'right',
      },
    ],
    methods: [
      {
        id: 'optical-character',
        name: '光性判定（正交偏光下）',
        suitableFor: '透明宝石的光学性质鉴定',
        steps: [
          { id: 1, iconId: 'power-on', title: '打开 LED 光源' },
          { id: 2, iconId: 'rotate', title: '转动上偏光片至视域最暗（正交状态）', hint: '此时上下偏光片振动方向垂直' },
          { id: 3, iconId: 'place-sample', title: '将透明宝石置于载物台中央' },
          { id: 4, iconId: 'rotate', title: '原地转动载物台 360°，观察明暗变化' },
          { id: 5, iconId: 'record', title: '记录明暗规律', hint: '四明四暗 / 全亮 / 全暗 / 异常消光' },
        ],
      },
      {
        id: 'interference',
        name: '干涉图观察（轴性判定）',
        suitableFor: '已确认非均质体的宝石',
        steps: [
          { id: 1, iconId: 'power-on', title: '打开光源，调至正交' },
          { id: 2, iconId: 'rotate', title: '上下、左右翻转样品寻找虹彩效应' },
          { id: 3, iconId: 'align', title: '加入锥光干涉球' },
          { id: 4, iconId: 'observe', title: '观察干涉图', hint: '黑十字 → 一轴晶；单/双臂 → 二轴晶；牛眼 → 水晶' },
        ],
      },
      {
        id: 'pleochroism',
        name: '多色性观察',
        suitableFor: '有色非均质体宝石',
        steps: [
          { id: 1, iconId: 'rotate', title: '上偏光片旋至视域全亮（平行状态）' },
          { id: 2, iconId: 'place-sample', title: '将宝石贴近载物台' },
          { id: 3, iconId: 'rotate', title: '从 2~3 个不同方向翻转宝石观察颜色' },
          { id: 4, iconId: 'record', title: '记录可见颜色数量', hint: '2 种 → 二色性；3 种 → 三色性' },
        ],
      },
    ],
  },

  spectroscope: {
    id: 'spectroscope',
    name: '分光镜',
    theme: 'spectroscope',
    themeHex: '#0ea5e9',
    productImage: '/assets/instruments/spectroscope.png',
    intro: {
      tagline: '观察特征吸收光谱，识别致色元素',
      principle: [
        '白光由不同波长的光组成。利用色散元件（棱镜或光栅），分光镜可将白光分解成连续可见光光谱。',
        '宝石中的致色元素（如 Cr³⁺、Fe³⁺、V³⁺ 等过渡金属）对特定波长的光具有选择性吸收，因此穿透或反射后的光进入分光镜后，会在连续光谱中产生黑带或黑线，这就是吸收光谱。',
        '不同元素产生不同特征光谱，同一宝石的吸收特征稳定，是辅助鉴定的重要依据，尤其能区分外观相似的宝石（如红宝石与红色尖晶石）。',
      ],
      usage: [
        '观察吸收光谱中黑带/黑线的位置与强度',
        '识别致色元素种类（Cr / Fe / V / Mn / Co 等）',
        '区分外观相似但化学组分不同的宝石',
        '部分宝石可凭特征光谱直接定名',
      ],
      limitations: [
        '观察需要在暗环境中进行',
        '颜色越深、透明度越好，光谱越清晰',
        '形状极端（过小/过大）需选择合适照明法',
        '不要用手拿宝石（人血、镜片均有吸收光谱干扰）',
      ],
    },
    components: [
      {
        id: 'objective',
        name: '物镜（光源入口）',
        shortDesc: '光线从此进入分光镜',
        description: '光线从此处进入分光镜，经棱镜或光栅色散后被观察。',
        position: { x: 0.2, y: 0.78 },
        labelSide: 'left',
      },
      {
        id: 'prism',
        name: '棱镜（色散元件）',
        shortDesc: '将白光分解为连续光谱',
        description:
          '棱镜式：光谱蓝紫区相对扩展，红光区相对压缩。透光性好，可产生明亮光谱。',
        position: { x: 0.5, y: 0.5 },
        labelSide: 'left',
      },
      {
        id: 'slit',
        name: '狭缝调节',
        shortDesc: '调节进光量与清晰度',
        description: '调节进光量与光谱清晰度。狭缝大 → 亮度大但吸收线清晰度差。',
        position: { x: 0.78, y: 0.28 },
        labelSide: 'right',
      },
      {
        id: 'focus',
        name: '焦距调节',
        shortDesc: '使光谱聚焦清晰',
        description: '调节焦距，使吸收线（黑线 / 黑带）边缘锐利清晰。',
        position: { x: 0.6, y: 0.42 },
        labelSide: 'right',
      },
      {
        id: 'eyepiece',
        name: '目镜（观察窗）',
        shortDesc: '观察光谱的窗口',
        description: '将眼睛贴近此处，观察色散后的连续光谱及吸收特征。',
        position: { x: 0.83, y: 0.16 },
        labelSide: 'right',
      },
    ],
    methods: [
      {
        id: 'transmission',
        name: '透射光法',
        suitableFor: '透明 – 半透明的宝石，形状不规则也可',
        steps: [
          { id: 1, iconId: 'place-sample', title: '将宝石置于光源上方' },
          { id: 2, iconId: 'align', title: '使光线透过宝石' },
          { id: 3, iconId: 'align', title: '分光镜方向与透光方向平行，让光线进入狭缝' },
          { id: 4, iconId: 'focus', title: '调节焦距与狭缝至光谱清晰' },
          { id: 5, iconId: 'record', title: '读取吸收光谱中黑带或黑线的位置' },
        ],
      },
      {
        id: 'internal-reflection',
        name: '内反射光法',
        suitableFor: '颜色较浅、颗粒较小的宝石',
        steps: [
          { id: 1, iconId: 'place-sample', title: '将宝石置于黑色背景上' },
          { id: 2, iconId: 'align', title: '调节入射光角度，使光在宝石内部反射' },
          { id: 3, iconId: 'align', title: '分光镜对准宝石表面露出的光亮点' },
          { id: 4, iconId: 'record', title: '读取吸收光谱黑带 / 黑线位置' },
        ],
      },
      {
        id: 'surface-reflection',
        name: '表面反射光法',
        suitableFor: '透明度差的宝石',
        steps: [
          { id: 1, iconId: 'place-sample', title: '宝石置于黑色背景上' },
          { id: 2, iconId: 'align', title: '调节入射光角度，使表面反射光进入分光镜' },
          { id: 3, iconId: 'record', title: '读取吸收光谱位置' },
        ],
      },
    ],
  },
};

export const INSTRUMENT_LIST = Object.values(INSTRUMENTS);
