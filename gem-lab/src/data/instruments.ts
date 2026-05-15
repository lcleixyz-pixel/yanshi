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
        '本演示默认使用 nD≈1.78 折射油；高于此值只能记录 > 1.780，无法直接给出精确 RI',
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
          '本演示按常规 nD≈1.78 折射油处理。折射油用于消除棱镜与样品之间的空气，保证良好光学接触；样品 RI 高于油液上限时只能判定为 > 1.780。',
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
    /* ═══════════════════════════════════════════════════════════════════
     * 偏光镜结构讲解 — 部件热点配置
     *
     * ★ 调整热点圆点位置 → 改 position.x / position.y
     * ★ 调整标签卡纵向位置 → 改 labelPosition.y（不加此字段则标签 y 跟随圆点 y）
     * ★ 调整标签卡出现在图片的哪一侧 → 改 labelSide（'left' | 'right'）
     *
     * position.x  : 水平坐标，0 = 图片最左，1 = 图片最右
     * position.y  : 垂直坐标，0 = 图片最上，1 = 图片最下
     * labelPosition.y : 标签卡的垂直位置（0–1），不设则自动跟随 position.y
     *                    若同侧标签过近（< 0.18），代码会自动下推防重叠
     * labelSide   : 'left' 标签显示在图片左侧，'right' 显示在右侧
     *
     * 注意：x/y 均为相对于图片内容区域的百分比（0–1），不是像素值
     * ═══════════════════════════════════════════════════════════════════ */
    components: [
      {
        id: 'upper-polar',
        name: '上偏光片（检偏器）',
        shortDesc: '可旋转，切换正交 / 平行状态',
        description:
          '位于支架顶端、载物台正上方，为可绕竖轴旋转的圆环式偏振片。与下偏光片配合可转到正交（消光）位置，用于区分均质体与非均质体、观察消光与干涉色。',
        // ▼▼▼ 圆点位置：x 水平(0–1)，y 垂直(0–1) ▼▼▼
        position: { x: 0.66, y: 0.14 },
        // ▼▼▼ 标签侧：'left' 或 'right' ▼▼▼
        labelSide: 'right',
        // ▼▼▼ 标签纵向位置（可选，不设则跟随 y 值）▼▼▼
        // labelPosition: { y: 0.13 },
      },
      {
        id: 'stage',
        name: '载物台',
        shortDesc: '可旋转，放置待测样品的平台',
        description:
          '样品放置的圆形平台，位于上下偏光片之间。光从下往上穿过样品后再进入上偏光片。',
        // ▼▼▼ 圆点位置：x 水平(0–1)，y 垂直(0–1) ▼▼▼
        position: { x: 0.66, y: 0.40 },
        // ▼▼▼ 标签侧：'left' 或 'right' ▼▼▼
        labelSide: 'right',
        // ▼▼▼ 标签纵向位置（可选，不设则跟随 y 值）▼▼▼
        // labelPosition: { y: 0.32 },
      },
      {
        id: 'lower-polar',
        name: '下偏光片（起偏镜）',
        shortDesc: '固定，将自然光转化为线偏振光',
        description:
          '在载物台下方、贴近光路。将 LED 出射光变为线偏振光，作为系统的起偏端，与上偏光片共同构成正交偏光（或任意夹角）的照明—观察光路。',
        // ▼▼▼ 圆点位置：x 水平(0–1)，y 垂直(0–1) ▼▼▼
        position: { x: 0.565, y: 0.56 },
        // ▼▼▼ 标签侧：'left' 或 'right' ▼▼▼
        labelSide: 'right',
        // ▼▼▼ 标签纵向位置（可选，不设则跟随 y 值）▼▼▼
        // labelPosition: { y: 0.50 },
      },
      {
        id: 'led',
        name: 'LED 光源模块',
        shortDesc: '底部均匀面照明',
        description:
          '在底座内，经窗口可见，提供自下而上的均匀面照明，保证视场亮度与观察条件稳定。',
        // ▼▼▼ 圆点位置：x 水平(0–1)，y 垂直(0–1) ▼▼▼
        position: { x: 0.565, y: 0.74 },
        // ▼▼▼ 标签侧：'left' 或 'right' ▼▼▼
        labelSide: 'right',
        // ▼▼▼ 标签纵向位置（可选，不设则跟随 y 值）▼▼▼
        // labelPosition: { y: 0.68 },
      },
      {
        id: 'condenser',
        name: '干涉球（锥光镜）',
        shortDesc: '锥光观察干涉图',
        description:
          '装在立柱上的小透镜，置于光路中可把近平行光会聚为锥形光穿过样品，便于在正交偏光下观察干涉图（如宝石光性、一轴/二轴晶干涉图样）。',
        // ▼▼▼ 圆点位置：x 水平(0–1)，y 垂直(0–1) ▼▼▼
        position: { x: 0.24, y: 0.28 },
        // ▼▼▼ 标签侧：'left' 或 'right' ▼▼▼
        labelSide: 'left',
        // ▼▼▼ 标签纵向位置（可选，不设则跟随 y 值）▼▼▼
        // labelPosition: { y: 0.28 },
      },
      {
        id: 'base',
        name: '底座主体',
        shortDesc: '整机结构主体',
        description:
          '白色壳体，承托光源、下偏光片、载物台机构及电气部分，是仪器的结构主体。',
        // ▼▼▼ 圆点位置：x 水平(0–1)，y 垂直(0–1) ▼▼▼
        position: { x: 0.44, y: 0.84 },
        // ▼▼▼ 标签侧：'left' 或 'right' ▼▼▼
        labelSide: 'left',
        // ▼▼▼ 标签纵向位置（可选，不设则跟随 y 值）▼▼▼
        // labelPosition: { y: 0.84 },
      },
      {
        id: 'switch',
        name: '电源开关',
        shortDesc: '控制光源通断（位于背面）',
        description: '控制光源通断，实际位于仪器背面。',
        // ▼▼▼ 圆点位置：x 水平(0–1)，y 垂直(0–1) ▼▼▼
        position: { x: 0.18, y: 0.60 },
        // ▼▼▼ 标签侧：'left' 或 'right' ▼▼▼
        labelSide: 'left',
        // ▼▼▼ 标签纵向位置（可选，不设则跟随 y 值）▼▼▼
        // labelPosition: { y: 0.72 },
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
      tagline: '观察特征吸收光谱，识别致色元素与宝石品种',
      principle: [
        '白光由 400–700 nm 不同波长的可见光组成。分光镜利用色散元件（棱镜或光栅）将白光分解为连续可见光谱。',
        '宝石中的致色离子——以过渡金属 Cr³⁺、Fe²⁺/³⁺、V³⁺、Co²⁺、Mn²⁺ 及稀土元素 U、Nd 为代表——对特定波长的光产生选择性吸收，因此穿透或反射出宝石的光进入分光镜后，会在连续光谱中形成稳定的吸收线（窄黑线）或吸收带（黑带）。',
        '同种致色离子产生相似的"特征谱"——铬谱（红宝石/祖母绿/翡翠）、铁谱（蓝宝石/橄榄石）、钴谱（合成蓝色尖晶石）、锰谱（粉色电气石）、铀谱（锆石）、稀土谱（磷灰石）。这是分光镜区分外观相似宝石（如红宝石 vs 红色尖晶石、天然 vs 合成）的核心依据。',
      ],
      usage: [
        '识别致色元素：依据吸收线/带位置推断 Cr / Fe / V / Co / Mn / U / 稀土等致色离子',
        '区分外观相似宝石：红宝石（铬谱）vs 红玻璃（稀土谱）；天然蓝色尖晶石（铁谱）vs 合成蓝色尖晶石（钴谱）',
        '辅助处理鉴定：天然翡翠红区 630–690 nm 三阶梯谱 vs 染色翡翠模糊吸收带',
        '部分宝石可凭典型谱直接定名：锆石 653.5 nm、钻石 415.5 nm 等典型吸收线',
      ],
      limitations: [
        '不能区分某些天然 / 合成宝石（如天然与合成红宝石的吸收谱几乎相同）',
        '颜色过浅、透明度过差或颗粒过小的样品光谱微弱，常需切换照明法',
        '观察须在暗环境进行；环境杂光、屏幕反光均会降低对比度',
        '日光灯 / 节能灯本身具有发射谱线，不能作为分光镜光源；务必使用光纤灯（冷光源）',
        '不要用手指持小型宝石——手指血液血红蛋白在 592 nm 处具吸收线，干扰读数',
      ],
    },
    components: [
      {
        id: 'fiber-light',
        name: '光纤灯（冷光源）',
        shortDesc: '外接连续白光源，不属于分光镜本体',
        description:
          '分光镜实操需要外接连续白光源。光纤灯经光导纤维输出强而集中的连续光谱白光，本身无特征吸收；冷光源也能避免热量损伤宝石。日光灯 / 节能灯有发射谱线，不能替代。',
        labelPosition: { y: 0.18 },
        labelSide: 'left',
      },
      {
        id: 'objective',
        name: '入光端 / 狭缝',
        shortDesc: '接收样品出射光并形成窄光束',
        description:
          '入光端对准待测样品，样品透射或反射后的光由此进入分光镜。狭缝控制进入仪器的光束宽度：接近闭合时谱线最锐，过宽会使吸收线/带边缘发糊，过窄则视场过暗。',
        position: { x: 0.19, y: 0.73 },
        labelPosition: { y: 0.72 },
        labelSide: 'left',
      },
      {
        id: 'dispersion',
        name: '色散元件（棱镜 / 光栅）',
        shortDesc: '将白光分解为连续光谱',
        description:
          '棱镜式：由一组光学接触的棱镜组成，透光性好、视场明亮，但色区分布不均——蓝紫区被相对扩展、红区被相对压缩，便于观察短波端但红区分辨率较低。光栅式：基于衍射光栅，色区线性等距、红区分辨率高，适合识别锆石 653.5 nm、稀土谱等红区谱线，但透光弱、需更强光源。教学常用棱镜式。',
        position: { x: 0.50, y: 0.52 },
        labelPosition: { y: 0.48 },
        labelSide: 'left',
      },
      {
        id: 'focus',
        name: '调焦 / 标尺窗口',
        shortDesc: '使谱线清晰并辅助定位读数',
        description:
          '调节内部物—像距，使吸收线/带边缘锐利；镜筒上的标尺窗口用于辅助重复调焦位置。焦距偏离时谱线虚化模糊，居中后边界最实。每次更换样品或照明方法后均应微调一次。',
        position: { x: 0.74, y: 0.34 },
        labelPosition: { y: 0.40 },
        labelSide: 'right',
      },
      {
        id: 'eyepiece',
        name: '目镜（观察窗）',
        shortDesc: '人眼贴近的观察端',
        description:
          '将眼睛贴近目镜端观察色散后的连续光谱及吸收特征。务必在暗背景、暗环境下观察，单眼对光轴；从红区扫至紫区记录主要吸收线/带的位置（nm）与强度。',
        position: { x: 0.78, y: 0.22 },
        labelPosition: { y: 0.20 },
        labelSide: 'right',
      },
    ],
    methods: [
      {
        id: 'transmission',
        name: '透射光法（首选）',
        suitableFor: '透明—半透明、颗粒较大、颜色较深的宝石（红宝石、祖母绿、紫水晶、橄榄石等）',
        steps: [
          {
            id: 1,
            iconId: 'power-on',
            title: '开启光纤灯（冷光源）',
            hint: '严禁使用日光灯/节能灯（自身有发射谱线，会污染观察光谱）',
          },
          {
            id: 2,
            iconId: 'place-sample',
            title: '将宝石置于带小孔的黑板（锁光圈）上',
            hint: '黑板小孔仅放过透过宝石的光，避免周边漏光稀释吸收特征。小型宝石不要直接用手指持拿（手指血液 592 nm 吸收线会干扰）',
          },
          {
            id: 3,
            iconId: 'align',
            title: '光纤灯从下方垂直入射宝石',
            hint: '光纤灯—宝石—分光镜入光端呈一条同轴直线；微调样品位置至透光最强',
          },
          {
            id: 4,
            iconId: 'focus',
            title: '调狭缝至接近闭合，再微调焦距',
            hint: '狭缝由宽到窄缓慢收紧，至吸收线/带边缘最实；焦距旋转至谱线最锐',
          },
          {
            id: 5,
            iconId: 'record',
            title: '由红到紫依次扫描，记录吸收位置（nm）',
            hint: '红宝石：694/692/668/659、580 黄绿带、476/475；祖母绿：683/680、670–650 弱、630 黄绿带、477；锆石：653.5 等十余条铀谱线',
          },
        ],
      },
      {
        id: 'internal-reflection',
        name: '内反射光法',
        suitableFor: '颜色较浅、颗粒较小的透明刻面型宝石（浅色蓝宝、海蓝宝、变石、浅色碧玺等）',
        steps: [
          {
            id: 1,
            iconId: 'power-on',
            title: '开启光纤灯',
            hint: '该法目的是延长光在样品内部的光程，增强弱吸收特征的可读性',
          },
          {
            id: 2,
            iconId: 'place-sample',
            title: '宝石台面向下置于黑色背景上（亭部朝上）',
            hint: '黑色背景吸收漏光、提升对比度；台面贴黑底使光从亭部再反回冠部',
          },
          {
            id: 3,
            iconId: 'align',
            title: '调节入射光与分光镜约成 45°',
            hint: '光从冠部一侧斜入 → 在亭部刻面全反射 → 从冠部另一侧出射进入分光镜，光程被延长 1.5–2 倍',
          },
          {
            id: 4,
            iconId: 'align',
            title: '分光镜入光端对准冠部出射的光亮点',
            hint: '在样品上方略偏对侧可见一明显亮点；微动分光镜对准并锁定',
          },
          {
            id: 5,
            iconId: 'focus',
            title: '调狭缝/焦距（浅色样品狭缝可稍宽以保证亮度）',
            hint: '吸收特征往往比透射法弱；可结合细微样品姿态调整找到最强谱位',
          },
          {
            id: 6,
            iconId: 'record',
            title: '只记录有把握识别的强吸收线/带',
            hint: '内反射法读数误差大于透射法；不确定的弱线建议留疑或用透射法复测',
          },
        ],
      },
      {
        id: 'surface-reflection',
        name: '表面反射光法',
        suitableFor: '透明度差或不透明的宝石与玉石（翡翠、绿松石、孔雀石、青金石等）',
        steps: [
          {
            id: 1,
            iconId: 'power-on',
            title: '开启光纤灯',
            hint: '反射光通常较弱，光源应近距离对准抛光面',
          },
          {
            id: 2,
            iconId: 'place-sample',
            title: '将宝石/玉石抛光面朝上置于黑色背景上',
            hint: '表面越光滑越平整，反射越强；粗糙表面会因漫反射使光谱过弱',
          },
          {
            id: 3,
            iconId: 'align',
            title: '调入射角，使尽量多白光从表面反射进入分光镜',
            hint: '镜面反射规律：入射角 = 反射角；常用范围 30°–60°，先在此范围试探找到最强反射方向',
          },
          {
            id: 4,
            iconId: 'focus',
            title: '调节狭缝（可稍宽换取亮度）与焦距',
            hint: '反射光通常较弱，狭缝在保证谱线可分辨前提下可适度放宽',
          },
          {
            id: 5,
            iconId: 'record',
            title: '识别经典玉石谱线',
            hint: '翡翠：红区 630–660–690 nm 三阶梯吸收带（"翡翠三脚架"）；染色翡翠仅显模糊吸收带，可凭此区分',
          },
        ],
      },
    ],
  },
};

export const INSTRUMENT_LIST = Object.values(INSTRUMENTS);
