/**
 * 偏光镜的短文案与讲次表：认识屏与实验屏共用（页面与新仿真三屏都从这里取）。
 * 只放界面上要显示的短标签与讲次说明，长讲解留在课程域与场景域。
 */

import { STRUCTURE_PART_IDS, type StructurePartId, type TeachingLesson as Lesson } from './polariscopeStructure';

export const LESSONS = [
  { id: 'components', title: '认识部件', caption: '转动仪器，认识各部件的位置与作用。' },
  { id: 'path', title: '跟随光路', caption: '从底座内部出发，逐步跟随光线。' },
  { id: 'principle', title: '偏振原理', caption: '转动同一台仪器，观察方向与明暗的关系。' },
  { id: 'sample', title: '样品观察', caption: '先预测，再转动一周，用目镜视场判断光性。' },
  { id: 'conoscope', title: '干涉图', caption: '放上干涉球，区分一轴晶与二轴晶。' },
] as const satisfies readonly { id: Lesson; title: string; caption: string }[];

/** 认识屏与实验屏各自的讲次（PhET 式拆分：先结构与光路，再放样与观察）。 */
export const LEARN_LESSONS: readonly Lesson[] = ['components', 'path', 'principle'];
export const LAB_LESSONS: readonly Lesson[] = ['sample', 'conoscope'];

export const PATH_STEPS = [
  { title: '底座内部光源', short: '内部光源', description: '光源在底座中发光。从光源出来的是自然光：振动方向在垂直于传播方向的平面内随机变化（图中快速变换方向的短杆）。' },
  { title: '顶部通光孔与起偏器', short: '通光孔 · 起偏', description: '光从底座顶孔向上，直接进入下偏光片。通过起偏器后，只剩一个振动方向：光变成线偏振光。' },
  { title: '经过样品位置', short: '样品位置', description: '这一段位于两片偏光片之间。当前光路讲解为空载状态；转动物台不会改变空载光的偏振方向。' },
  { title: '到达上方检偏器', short: '上片 · 检偏', description: '上片只让与自身透光轴方向对应的光分量通过。下一步，沿出射方向观察转动镜环带来的明暗变化。' },
  { title: '沿光路观察', short: '观察方向', description: '沿上方检偏器向下观察。振动在上片方向上的投影（振幅 cos α）才能通过，光强为 cos² α：平行时最亮，正交时理想空载消光。' },
] as const;

/** 部件名称、短名称与讲解（部件目录、模型标注与任务提示共用）。 */
export type PartCopy = { id: StructurePartId; name: string; shortName: string; description: string; operation: string };
const PART_COPY: PartCopy[] = [
  { id: 'base', name: '底座主体', shortName: '底座', description: '底座与上方支架是同一块金属外壳（白色），支承整台仪器，内部容纳照明组件。上表面的通光孔与下偏光片对齐。', operation: '开启“查看内部光源”，可透过外壳查看光源的位置。拆解时，光源、侧面电源按钮和一体的支架都留在原位。' },
  { id: 'frame', name: '支架（与底座一体）', shortName: '支架', description: '支架与底座外壳一体成形、材质相同，由底座向上折出，承托上方检偏器，并为中间的样品观察区域留出空间。', operation: '它不是可拆下的独立零件，拆解演示时保持不动。切换侧面视角，查看支架轮廓、顶部支撑与上下偏光片之间的关系。' },
  { id: 'light', name: '底座内部光源', shortName: '内部光源', description: '光源位于底座内部。光向上通过底座顶部洞口，直接进入下偏光片。', operation: '当前透明外壳辅助显示光源位置；轮廓线表示外壳边界。光源不会随拆解向上漂浮，内部组件的细节为位置示意。' },
  { id: 'polarizer', name: '下偏光片 · 起偏器', shortName: '下偏光片', description: '下偏光片位于底座通光孔上方，将来自内部光源的光变成线偏振光。它固定不转，与载物台是两个分开的部件。', operation: '转动物台时，下偏光片保持原位；透振方向始终作为 0° 参考。' },
  { id: 'stage', name: '可旋转载物台', shortName: '载物台', description: '载物台位于上下偏光片之间，与下偏光片分开安装，用于承放样品，并改变样品绕光轴的方位。仪器上只有载物台和检偏器可以转动。', operation: '结构模式的整机视图中，可直接拖动物台；拆解或单独查看时，使用下方角度控件。物台与检偏器分别控制，角度以模型初始位置为零点。' },
  { id: 'analyzer', name: '上偏光片 · 检偏器', shortName: '上偏光片', description: '检偏器位于样品位置上方，安装在支架顶部的旋转环内。', operation: '结构模式的整机视图中，可直接拖动上方镜环；拆解或单独查看时，使用下方角度控件。切换“偏振原理”，可用同一镜环观察空载明暗变化；样品练习可继续进入互动学习。' },
  { id: 'conoscope', name: '锥光干涉球', shortName: '干涉球', description: '锥光干涉球是用于观察干涉图的附件，平时收纳在仪器侧边。', operation: '选择后可以近看或单独查看。在“05 干涉图”中，可以把它放到样品上方，观察一轴晶与二轴晶的干涉图。' },
  { id: 'powerSwitch', name: '底座侧面电源按钮', shortName: '电源按钮', description: '电源按钮安装在底座侧面，控制底座内部光源的开启与关闭。', operation: '点击模型上的按钮即可开关电源；右侧开关和投屏控件会同步更新。拖动查看仪器时不会误触开关。' },
];
export const PARTS = STRUCTURE_PART_IDS.map((id) => PART_COPY.find((part) => part.id === id)!);
export const PARTS_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part])) as Record<StructurePartId, PartCopy>;
/** 模型上的短名称标注（勾选「显示名称」时）。 */
export const PART_SHORT = Object.fromEntries(PARTS.map((part) => [part.id, part.shortName])) as Record<StructurePartId, string>;
