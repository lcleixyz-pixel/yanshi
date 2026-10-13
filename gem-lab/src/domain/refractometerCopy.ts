/**
 * 折射仪仿真用的短文案：部件短名称与状态短语。
 * 只放「界面上要显示的短标签」，长说明留在课程域与模型清单里。
 */

/** 部件短名称（PhET 式标签：默认不显示，勾「显示名称」才出现在模型上）。 */
export const PART_SHORT: Record<string, string> = {
  body: '机身',
  metal_stage: '测台',
  test_prism: '测台棱镜',
  cover: '翻盖',
  eyepiece: '目镜',
  polarizer: '偏光片',
  power_switch: '电源开关',
  internal_light: '内置光源',
  first_mirror: '第一反射镜',
  second_mirror: '第二反射镜',
  internal_scale: '分划刻度',
  lens_group: '中继透镜',
  optical_path: '光路示意',
  oil_bottle: '接触液瓶',
  contact_layer: '接触层',
  isotropic_sample: '教学样品',
};

/** 操作台状态短语：一行说明当前条件。 */
export function benchStatusLine(scene: { power: boolean; cover: 'open' | 'closed'; liquid: 'none' | 'drop'; sample: 'none' | 'placed'; contact: 'good' | 'air-gap'; angle: number }): string {
  return [
    scene.power ? '通电' : '关机',
    `翻盖${scene.cover === 'open' ? '打开' : '闭合'}`,
    scene.liquid === 'drop' ? '已滴液' : '无接触液',
    scene.sample === 'placed' ? '已放样' : '未放样',
    scene.sample === 'placed' && scene.contact === 'air-gap' ? '空气间隙' : null,
    `方向 ${scene.angle}°`,
  ].filter(Boolean).join(' · ');
}
