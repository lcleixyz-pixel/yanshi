export const PARTS = [
  {id:'analyzer', label:'上偏光片', title:'上偏光片（检偏器）', description:'旋转上偏光片，改变它与下偏光片透振方向的夹角。空载时可观察从明亮到消光的变化。', offset:[0,0.14,0]},
  {id:'stage', label:'载物台', title:'旋转载物台', description:'放置并旋转样品。这里的旋转仅用于认识结构和操作位置，尚未计算真实宝石的光学响应。', offset:[0,0.07,0]},
  {id:'polarizer', label:'下偏光片', title:'下偏光片（起偏器）', description:'固定在光源上方，将自然光转化为线偏振光。片上的绿色标线表示透振方向。', offset:[0,0.035,0]},
  {id:'light', label:'光源', title:'LED 光源模块', description:'提供自下而上的照明。光源关闭后仍保留场景环境光，以便观察仪器结构。', offset:[0,0.012,0]},
  {id:'sample', label:'示意样品', title:'刻面样品 · 位置示意', description:'用来演示放样与旋转位置。外形和材质为程序生成，未指定宝石品种、光轴方向或检测结论。', offset:[0,0.105,0]},
  {id:'conoscope', label:'干涉球', title:'干涉球组件', description:'表示辅助锥光观察的部件及收纳位置；本样件未模拟实际锥光光路或干涉图。', offset:[-0.06,0.035,0]},
  {id:'frame', label:'支架', title:'机身支架', description:'连接底座与检偏器，维持主要部件的位置。几何结构依据项目图片概括，尚未按实物尺寸校准。', offset:[0,0,-0.055]},
  {id:'base', label:'底座', title:'底座与控制开关', description:'支撑仪器并容纳照明组件。此模型用于结构教学，不含可制造的内部电路或机械设计。', offset:[0,0,0]},
];

export function observationState({power, sample, exploded, angle}) {
  if (exploded) return {mode:'exploded', ratio:null, title:'结构关系示意', note:'拆解时暂停光路与读数'};
  if (!power) return {mode:'off', ratio:null, title:'光源关闭', note:'相对透光率 —'};
  if (sample) return {mode:'sample', ratio:null, title:'样品响应未建模', note:'仅示意放置位置，不显示光学读数'};
  const ratio = Math.min(1, Math.max(0, Math.cos(angle * Math.PI / 180) ** 2));
  return {mode:'empty', ratio, title:ratio<0.0001?'正交消光':ratio>0.9999?'平行透光':'部分透光', note:`相对透光率 ${Math.round(ratio*100)}%（以平行为 100%）`};
}
