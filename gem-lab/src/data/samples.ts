import type { SampleDef } from './types';

/**
 * 28 个常见宝石样品数据。
 * 折射率/双折射率/光谱等数据来自通用宝石学参考（GIA、《系统宝石学》），
 * 红宝石、祖母绿、尖晶石等的光谱细节摘自项目内 PDF 讲义。
 */
export const SAMPLES: SampleDef[] = [
  // ==================== 初级（特征明显，常见） ====================
  {
    id: 'ruby',
    name: '红宝石',
    nameEn: 'Ruby',
    category: '刚玉族',
    difficulty: 'beginner',
    image: '/assets/samples/ruby.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.762, 1.770],
      birefringence: 0.008,
      opticalCharacter: 'uniaxial-negative',
      pleochroism: '强；橙红 / 紫红',
      color: '红色',
      transparency: '透明-半透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 694, intensity: 'strong', description: 'Cr 致色 R 双线' },
        { type: 'line', wavelength: 692, intensity: 'medium' },
        { type: 'line', wavelength: 668, intensity: 'medium' },
        { type: 'line', wavelength: 659, intensity: 'medium' },
        { type: 'band', wavelength: 580, width: 80, intensity: 'strong', description: '黄绿区吸收带' },
        { type: 'line', wavelength: 476, intensity: 'strong' },
        { type: 'line', wavelength: 475, intensity: 'strong' },
        { type: 'line', wavelength: 468, intensity: 'weak' },
        { type: 'band', wavelength: 410, width: 20, intensity: 'medium', description: '紫区吸收' },
      ],
      description:
        '红区有 694/692/668/659 nm 吸收线，620–540 nm 黄绿区吸收带，476/475 nm 强吸收线，468 nm 弱线，420–400 nm 紫区吸收带。',
    },
    detectionTips: [
      'RI 1.762–1.770 范围内，DR ≈ 0.008（较小）',
      '偏光镜下转动 360° 应见四明四暗（透明样品）',
      '分光镜下重点观察 694 nm 强吸收线及黄绿区吸收带',
    ],
  },
  {
    id: 'sapphire',
    name: '蓝宝石',
    nameEn: 'Sapphire',
    category: '刚玉族',
    difficulty: 'beginner',
    image: '/assets/samples/sapphire.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.762, 1.770],
      birefringence: 0.008,
      opticalCharacter: 'uniaxial-negative',
      pleochroism: '强；蓝/蓝绿',
      color: '蓝色',
      transparency: '透明-半透明',
    },
    spectrum: {
      features: [
        { type: 'band', wavelength: 450, width: 10, intensity: 'strong', description: 'Fe³⁺ 特征吸收线' },
        { type: 'line', wavelength: 460, intensity: 'medium' },
        { type: 'line', wavelength: 470, intensity: 'medium' },
      ],
      description: '蓝区 450 nm 强吸收线（Fe³⁺ 致色），460/470 nm 中等强度吸收线，是蓝宝石的特征。',
    },
    detectionTips: [
      '与红宝石同属刚玉族，RI/DR/光性完全相同，仅颜色不同',
      'Fe 致色蓝宝石光谱特征是 450 nm 三线',
      '注意区分铁致色与钴致色合成蓝宝石',
    ],
  },
  {
    id: 'emerald',
    name: '祖母绿',
    nameEn: 'Emerald',
    category: '绿柱石族',
    difficulty: 'beginner',
    image: '/assets/samples/emerald.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.577, 1.583],
      birefringence: 0.006,
      opticalCharacter: 'uniaxial-negative',
      pleochroism: '中-强；蓝绿/黄绿',
      color: '绿色',
      transparency: '透明-半透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 683, intensity: 'strong', description: 'Cr³⁺ 双线之一' },
        { type: 'line', wavelength: 680, intensity: 'strong' },
        { type: 'line', wavelength: 662, intensity: 'weak' },
        { type: 'line', wavelength: 646, intensity: 'weak' },
        { type: 'band', wavelength: 605, width: 50, intensity: 'medium', description: '黄绿区部分吸收' },
        { type: 'band', wavelength: 420, width: 40, intensity: 'strong', description: '紫区全吸收' },
      ],
      description: '683/680 nm 强吸收线（Cr 致色），662/646 nm 弱线，630–580 nm 部分吸收，紫区全吸收。',
    },
    detectionTips: [
      'RI 1.577–1.583，DR 较小约 0.006',
      '查尔斯滤色镜下变红（铬致色）',
      '光谱与红宝石都有铬致色双线，但波长不同',
    ],
  },
  {
    id: 'amethyst',
    name: '紫水晶',
    nameEn: 'Amethyst',
    category: '石英族',
    difficulty: 'beginner',
    image: '/assets/samples/amethyst.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.544, 1.553],
      birefringence: 0.009,
      opticalCharacter: 'uniaxial-positive',
      pleochroism: '弱；紫/紫红',
      color: '紫色',
      transparency: '透明',
    },
    spectrum: {
      features: [],
      description: '一般无特征吸收光谱。',
    },
    detectionTips: [
      'RI 1.544–1.553 是水晶族的标志',
      '偏光镜下可见水晶特有的牛眼干涉图',
      '常见双晶现象',
    ],
  },
  {
    id: 'citrine',
    name: '黄水晶',
    nameEn: 'Citrine',
    category: '石英族',
    difficulty: 'beginner',
    image: '/assets/samples/citrine.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.544, 1.553],
      birefringence: 0.009,
      opticalCharacter: 'uniaxial-positive',
      pleochroism: '弱',
      color: '黄色',
      transparency: '透明',
    },
    spectrum: {
      features: [],
      description: '一般无明显吸收光谱。',
    },
    detectionTips: [
      'RI 与紫水晶完全一致，仅颜色不同',
      '与黄色托帕石（RI 1.62）的关键区别在折射率',
    ],
  },
  {
    id: 'garnet',
    name: '石榴石',
    nameEn: 'Garnet',
    category: '石榴石族',
    difficulty: 'beginner',
    image: '/assets/samples/garnet.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: 1.74,
      birefringence: 0,
      opticalCharacter: 'isotropic',
      color: '红色',
      transparency: '透明',
    },
    spectrum: {
      features: [
        { type: 'band', wavelength: 504, width: 10, intensity: 'strong', description: 'Fe²⁺ 强吸收带' },
        { type: 'band', wavelength: 520, width: 10, intensity: 'strong' },
        { type: 'band', wavelength: 573, width: 10, intensity: 'strong' },
        { type: 'line', wavelength: 423, intensity: 'weak' },
        { type: 'line', wavelength: 460, intensity: 'weak' },
        { type: 'line', wavelength: 610, intensity: 'weak' },
      ],
      description: '504/520/573 nm 强吸收带（铁铝榴石特征），423/460/610/680–690 nm 弱吸收带。',
    },
    detectionTips: [
      '均质体，单折射率约 1.74',
      '偏光镜下通常呈现异常消光',
      '光谱中的 504/520/573 nm 三线是铁铝榴石的"指纹"',
    ],
  },
  {
    id: 'peridot',
    name: '橄榄石',
    nameEn: 'Peridot',
    category: '橄榄石族',
    difficulty: 'beginner',
    image: '/assets/samples/peridot.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.654, 1.69],
      birefringence: 0.036,
      opticalCharacter: 'biaxial-positive',
      pleochroism: '弱；黄绿/绿',
      color: '黄绿色',
      transparency: '透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 493, intensity: 'medium' },
        { type: 'line', wavelength: 473, intensity: 'medium' },
        { type: 'line', wavelength: 453, intensity: 'strong', description: 'Fe²⁺ 三联线' },
      ],
      description: '蓝区 453/473/493 nm 三联线（铁致色）。',
    },
    detectionTips: [
      'DR ≈ 0.036 较大，肉眼可见双折射重影',
      '二轴晶（+）光性',
    ],
  },
  {
    id: 'topaz',
    name: '托帕石',
    nameEn: 'Topaz',
    category: '托帕石族',
    difficulty: 'beginner',
    image: '/assets/samples/topaz.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.619, 1.627],
      birefringence: 0.008,
      opticalCharacter: 'biaxial-positive',
      pleochroism: '中等',
      color: '蓝色 / 黄色 / 无色',
      transparency: '透明',
    },
    spectrum: {
      features: [],
      description: '一般无明显特征吸收光谱。',
    },
    detectionTips: [
      'RI 1.619–1.627 是关键鉴定数据',
      'DR ≈ 0.008，二轴晶（+）',
      '某些方向因 Np ≈ Nm 表现为"假一轴晶"',
    ],
  },
  // ==================== 中级 ====================
  {
    id: 'tourmaline',
    name: '碧玺',
    nameEn: 'Tourmaline',
    category: '电气石族',
    difficulty: 'intermediate',
    image: '/assets/samples/tourmaline.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.624, 1.644],
      birefringence: 0.02,
      opticalCharacter: 'uniaxial-negative',
      pleochroism: '强',
      color: '多色（绿/红/蓝/双色）',
      transparency: '透明',
    },
    spectrum: {
      features: [
        { type: 'band', wavelength: 640, width: 30, intensity: 'medium', description: '随颜色变化' },
      ],
      description: '吸收光谱随颜色变化较大，蓝色碧玺常见 730/498 nm 吸收。',
    },
    detectionTips: [
      'DR 较大（0.018–0.040）是关键鉴别特征',
      '强多色性',
      '一轴晶（-）',
    ],
  },
  {
    id: 'spinel',
    name: '尖晶石',
    nameEn: 'Spinel',
    category: '尖晶石族',
    difficulty: 'intermediate',
    image: '/assets/samples/spinel.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: 1.718,
      birefringence: 0,
      opticalCharacter: 'isotropic',
      color: '红/蓝/紫/粉',
      transparency: '透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 685, intensity: 'strong', description: 'Cr 致色风琴管状光谱' },
        { type: 'line', wavelength: 684, intensity: 'strong' },
        { type: 'band', wavelength: 656, width: 10, intensity: 'weak' },
        { type: 'band', wavelength: 540, width: 100, intensity: 'strong', description: '风琴管状吸收带' },
      ],
      description: '红色尖晶石呈现 685/684 nm 强吸收线及 595–490 nm 强吸收带（风琴管状光谱）。',
    },
    detectionTips: [
      '均质体，RI 单值 1.718',
      '与红宝石的关键区分：尖晶石光谱呈"风琴管状"，红宝石为单条强线',
    ],
  },
  {
    id: 'tanzanite',
    name: '坦桑石',
    nameEn: 'Tanzanite',
    category: '黝帘石族',
    difficulty: 'intermediate',
    image: '/assets/samples/tanzanite.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.691, 1.7],
      birefringence: 0.009,
      opticalCharacter: 'biaxial-positive',
      pleochroism: '极强；蓝/紫/黄绿（三色性）',
      color: '蓝紫色',
      transparency: '透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 595, intensity: 'medium' },
        { type: 'line', wavelength: 528, intensity: 'medium' },
        { type: 'line', wavelength: 455, intensity: 'medium' },
      ],
      description: '595 / 528 / 455 nm 中等强度吸收（钒致色）。',
    },
    detectionTips: [
      '极强三色性是首要鉴别特征',
      'RI 在 1.691–1.700 之间',
    ],
  },
  {
    id: 'aquamarine',
    name: '海蓝宝石',
    nameEn: 'Aquamarine',
    category: '绿柱石族',
    difficulty: 'intermediate',
    image: '/assets/samples/aquamarine.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.577, 1.583],
      birefringence: 0.006,
      opticalCharacter: 'uniaxial-negative',
      pleochroism: '强；天蓝/无色',
      color: '海蓝色',
      transparency: '透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 537, intensity: 'weak' },
        { type: 'line', wavelength: 456, intensity: 'medium', description: 'Fe²⁺ 致色' },
        { type: 'line', wavelength: 427, intensity: 'medium' },
      ],
      description: '弱铁谱：537 / 456 / 427 nm 吸收线。',
    },
    detectionTips: [
      'RI 与祖母绿相同（同为绿柱石族），但光谱完全不同',
      '强多色性是辨认特征',
    ],
  },
  {
    id: 'zircon',
    name: '锆石',
    nameEn: 'Zircon',
    category: '锆石族',
    difficulty: 'intermediate',
    image: '/assets/samples/zircon.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.93, 1.987],
      birefringence: 0.059,
      opticalCharacter: 'uniaxial-positive',
      pleochroism: '弱-中',
      color: '蓝/黄/无色',
      transparency: '透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 653.5, intensity: 'strong', description: 'U 致色特征线' },
      ],
      description: '653.5 nm 是锆石的特征吸收线（铀致色）。',
    },
    detectionTips: [
      'RI 超出折射仪量程（>1.81），表现为"负读数"',
      'DR 极大（≈ 0.059），重影现象明显',
    ],
  },
  {
    id: 'moonstone',
    name: '月光石',
    nameEn: 'Moonstone',
    category: '长石族',
    difficulty: 'intermediate',
    image: '/assets/samples/moonstone.png',
    refractometerShape: 'cabochon',
    characteristics: {
      refractiveIndex: [1.518, 1.526],
      birefringence: 0.008,
      opticalCharacter: 'biaxial-negative',
      color: '无色-奶白带蓝月光效应',
      transparency: '透明-半透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      'RI 1.518–1.526',
      '特征蓝白月光效应（钠长石与正长石聚片双晶）',
    ],
  },
  {
    id: 'amber',
    name: '琥珀',
    nameEn: 'Amber',
    category: '有机宝石',
    difficulty: 'intermediate',
    image: '/assets/samples/amber.png',
    refractometerShape: 'fancy',
    characteristics: {
      refractiveIndex: 1.54,
      opticalCharacter: 'isotropic',
      color: '黄/橙/红/绿',
      transparency: '透明-半透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      '非晶体，单折射率 1.54',
      '常见异常消光，应与玻璃区分（密度盐水浮起测试）',
    ],
  },
  {
    id: 'pearl',
    name: '珍珠',
    nameEn: 'Pearl',
    category: '有机宝石',
    difficulty: 'intermediate',
    image: '/assets/samples/pearl.png',
    refractometerShape: 'cabochon',
    characteristics: {
      refractiveIndex: [1.53, 1.685],
      opticalCharacter: 'aggregate',
      color: '白/粉/黑/金',
      transparency: '不透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      '点测法读数 1.53 – 1.69',
      '不能用刻面法',
      '偏光镜下呈集合体特征',
    ],
  },
  {
    id: 'turquoise',
    name: '绿松石',
    nameEn: 'Turquoise',
    category: '玉石',
    difficulty: 'intermediate',
    image: '/assets/samples/turquoise.png',
    refractometerShape: 'cabochon',
    characteristics: {
      refractiveIndex: [1.61, 1.65],
      opticalCharacter: 'aggregate',
      color: '蓝/绿',
      transparency: '不透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 432, intensity: 'medium' },
        { type: 'line', wavelength: 460, intensity: 'weak' },
      ],
      description: '432/460 nm 蓝紫区吸收（铜致色）。',
    },
    detectionTips: [
      '不透明，多用点测法读 RI ≈ 1.61',
      '偏光镜下因不透明出现"全暗假象"',
    ],
  },
  // ==================== 高级 ====================
  {
    id: 'jadeite',
    name: '翡翠',
    nameEn: 'Jadeite',
    category: '玉石',
    difficulty: 'advanced',
    image: '/assets/samples/jadeite.png',
    refractometerShape: 'carved',
    characteristics: {
      refractiveIndex: [1.66, 1.68],
      opticalCharacter: 'aggregate',
      color: '绿/白/紫/红',
      transparency: '透明-不透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 437, intensity: 'medium', description: '翡翠特征线' },
        { type: 'line', wavelength: 691, intensity: 'weak' },
        { type: 'line', wavelength: 655, intensity: 'weak' },
      ],
      description: '437 nm 是翡翠的特征吸收线；染色翡翠 650 nm 处可见铬染色带。',
    },
    detectionTips: [
      '点测法 RI ≈ 1.66',
      '多晶质集合体，偏光镜下应呈全亮',
      '437 nm 吸收线为天然翡翠重要鉴定证据',
    ],
  },
  {
    id: 'nephrite',
    name: '和田玉',
    nameEn: 'Nephrite',
    category: '玉石',
    difficulty: 'advanced',
    image: '/assets/samples/nephrite.png',
    refractometerShape: 'carved',
    characteristics: {
      refractiveIndex: [1.6, 1.63],
      opticalCharacter: 'aggregate',
      color: '白/青/黄/碧',
      transparency: '半透明-不透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      '透闪石质多晶质集合体，点测 RI ≈ 1.61',
      '油脂光泽是宏观鉴定特征',
    ],
  },
  {
    id: 'nephrite-jasper',
    name: '和田玉碧玉',
    nameEn: 'Nephrite (Jasper)',
    category: '玉石',
    difficulty: 'advanced',
    image: '/assets/samples/nephrite-jasper.png',
    refractometerShape: 'fancy',
    characteristics: {
      refractiveIndex: [1.6, 1.63],
      opticalCharacter: 'aggregate',
      color: '深绿色',
      transparency: '半透明-不透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 689, intensity: 'weak' },
        { type: 'band', wavelength: 460, width: 30, intensity: 'medium', description: '铁致色' },
      ],
      description: '常见 689 nm 弱线 + 460 nm 蓝区吸收（铁致色）。',
    },
    detectionTips: [
      '碧玉是含铁较多的和田玉品种',
      'RI 与白玉一致，靠颜色与铁吸收区分',
    ],
  },
  {
    id: 'opal',
    name: '欧泊',
    nameEn: 'Opal',
    category: '宝石',
    difficulty: 'advanced',
    image: '/assets/samples/opal.png',
    refractometerShape: 'cabochon',
    characteristics: {
      refractiveIndex: [1.42, 1.47],
      opticalCharacter: 'isotropic',
      color: '多变色（变彩效应）',
      transparency: '透明-不透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 700, intensity: 'weak' },
        { type: 'line', wavelength: 660, intensity: 'weak' },
      ],
      description: '一般无特征光谱。',
    },
    detectionTips: [
      'RI 1.42–1.47 极低',
      '非晶质，但常见变彩效应（结构色）',
    ],
  },
  {
    id: 'agate',
    name: '玛瑙',
    nameEn: 'Agate',
    category: '玉髓族',
    difficulty: 'advanced',
    image: '/assets/samples/agate.png',
    refractometerShape: 'cabochon',
    characteristics: {
      refractiveIndex: [1.535, 1.539],
      opticalCharacter: 'aggregate',
      color: '多色条带',
      transparency: '半透明-不透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      '隐晶质石英集合体（玉髓的条带状品种）',
      '点测 RI ≈ 1.54',
    ],
  },
  {
    id: 'chalcedony',
    name: '玉髓',
    nameEn: 'Chalcedony',
    category: '玉髓族',
    difficulty: 'advanced',
    image: '/assets/samples/chalcedony.png',
    refractometerShape: 'cabochon',
    characteristics: {
      refractiveIndex: [1.535, 1.539],
      opticalCharacter: 'aggregate',
      color: '多色',
      transparency: '半透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      '隐晶质石英，无条带为玉髓，有条带为玛瑙',
    ],
  },
  {
    id: 'diamond',
    name: '钻石',
    nameEn: 'Diamond',
    category: '钻石族',
    difficulty: 'advanced',
    image: '/assets/samples/diamond.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: 'over-1.81',
      opticalCharacter: 'isotropic',
      color: '无色 / 彩色',
      transparency: '透明',
    },
    spectrum: {
      features: [
        { type: 'line', wavelength: 415, intensity: 'medium', description: 'Cape 系列特征线' },
      ],
      description: '开普系列钻石可见 415 nm 吸收线（N3 缺陷）。',
    },
    detectionTips: [
      'RI 2.417 远超折射仪量程（呈"负读数"）',
      '均质体，但全反射切工常导致"假全暗"现象',
      '色散明显，火彩强',
    ],
  },
  {
    id: 'marble',
    name: '大理石（汉白玉）',
    nameEn: 'Marble',
    category: '玉石',
    difficulty: 'advanced',
    image: '/assets/samples/marble.png',
    refractometerShape: 'fancy',
    characteristics: {
      refractiveIndex: [1.486, 1.658],
      opticalCharacter: 'aggregate',
      color: '白/灰',
      transparency: '半透明-不透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      '方解石质多晶质集合体',
      '盐酸滴试起泡（碳酸盐反应）',
    ],
  },
  {
    id: 'prehnite',
    name: '葡萄石',
    nameEn: 'Prehnite',
    category: '葡萄石族',
    difficulty: 'advanced',
    image: '/assets/samples/prehnite.png',
    refractometerShape: 'faceted',
    characteristics: {
      refractiveIndex: [1.611, 1.669],
      birefringence: 0.022,
      opticalCharacter: 'biaxial-positive',
      color: '黄绿',
      transparency: '透明-半透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      'RI 1.611–1.669，DR 较大',
      '常见放射状纤维结构',
    ],
  },
  {
    id: 'serpentine',
    name: '岫玉',
    nameEn: 'Serpentine',
    category: '玉石',
    difficulty: 'advanced',
    image: '/assets/samples/serpentine.png',
    refractometerShape: 'carved',
    characteristics: {
      refractiveIndex: [1.55, 1.57],
      opticalCharacter: 'aggregate',
      color: '黄绿/白',
      transparency: '半透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      '蛇纹石质多晶质集合体，点测 RI ≈ 1.56',
      '硬度较低（2.5–5.5）',
    ],
  },
  {
    id: 'jinsi-jade',
    name: '金丝玉',
    nameEn: 'Jinsi Jade',
    category: '玉石',
    difficulty: 'advanced',
    image: '/assets/samples/jinsi-jade.png',
    refractometerShape: 'carved',
    characteristics: {
      refractiveIndex: [1.535, 1.539],
      opticalCharacter: 'aggregate',
      color: '黄/红/白',
      transparency: '半透明-不透明',
    },
    spectrum: { features: [], description: '一般无明显吸收。' },
    detectionTips: [
      '石英质玉，常含铁致色丝状包体',
      '点测 RI ≈ 1.54',
    ],
  },
];

export const SAMPLES_BY_ID = Object.fromEntries(
  SAMPLES.map((s) => [s.id, s]),
) as Record<string, SampleDef>;

export const SAMPLES_BY_DIFFICULTY: Record<'beginner' | 'intermediate' | 'advanced', SampleDef[]> = {
  beginner: SAMPLES.filter((s) => s.difficulty === 'beginner'),
  intermediate: SAMPLES.filter((s) => s.difficulty === 'intermediate'),
  advanced: SAMPLES.filter((s) => s.difficulty === 'advanced'),
};

export const JADE_SAMPLES = SAMPLES.filter((s) => s.category === '玉石');

type JadeSampleBuildMode = 'test' | 'demo';

interface JadeSampleBuildOptions {
  mode?: JadeSampleBuildMode;
  limit?: number;
}

function cloneSample(sample: SampleDef): SampleDef {
  return {
    ...sample,
    characteristics: {
      ...sample.characteristics,
      refractiveIndex: Array.isArray(sample.characteristics.refractiveIndex)
        ? [...sample.characteristics.refractiveIndex]
        : sample.characteristics.refractiveIndex,
    },
    spectrum: {
      ...sample.spectrum,
      features: sample.spectrum.features.map((f) => ({ ...f })),
    },
    detectionTips: [...sample.detectionTips],
  };
}

export function buildJadeSamples(options: JadeSampleBuildOptions = {}): SampleDef[] {
  const { mode = 'demo', limit } = options;
  const pool = mode === 'test' ? [...JADE_SAMPLES].sort((a, b) => a.id.localeCompare(b.id)) : [...JADE_SAMPLES];
  const picked = typeof limit === 'number' && limit > 0 ? pool.slice(0, limit) : pool;
  return picked.map(cloneSample);
}

export function buildJadeSamplesForTest(limit = 3): SampleDef[] {
  return buildJadeSamples({ mode: 'test', limit });
}

export function buildJadeSamplesForDemo(limit = JADE_SAMPLES.length): SampleDef[] {
  return buildJadeSamples({ mode: 'demo', limit });
}
