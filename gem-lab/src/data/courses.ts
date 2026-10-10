import type { InstrumentId } from './types';

/** 有 3D 引导课程的仪器：知识库以课程为主线，经典 2D 演示降为备用链接。 */
export interface InstrumentCourse {
  student: string;
  teacher: string;
  /** 「交互演示」一节的标题与说明。 */
  title: string;
  summary: string;
}

export const INSTRUMENT_COURSES: Partial<Record<InstrumentId, InstrumentCourse>> = {
  polariscope: {
    student: '/explore/polariscope?course=basic&mode=student',
    teacher: '/explore/polariscope?course=basic',
    title: '在 3D 偏光镜上完成引导课程',
    summary: '约 8 分钟：认识部件、跟随光路、空载调正、放样旋转、换方向复核、解释。学员可以自学，讲师可以投屏演示；学完后到检测练习中独立判断未知样品。',
  },
  refractometer: {
    student: '/explore/optics/refractometer?course=basic&mode=student',
    teacher: '/explore/optics/refractometer?course=basic&mode=teacher',
    title: '在 3D 折射仪上完成基础读数课',
    summary: '约 9 分钟：认识部件、跟随光路、开灯滴液放样、恢复光学接触、先读数再核对、换方向复核、解释与清洁复位。学员可以自学，讲师可以投屏演示；学完后到检测练习中独立读数。',
  },
  spectroscope: {
    student: '/explore/optics/prism-spectroscope?course=basic&mode=student',
    teacher: '/explore/optics/prism-spectroscope?course=basic&mode=teacher',
    title: '在 3D 棱镜式分光镜上完成基础观察课',
    summary: '约 8 分钟：认识部件、跟随光路、对光与照明、调节狭缝与焦距、标记红宝石的吸收特征、解释。学员可以自学，讲师可以投屏演示；学完后可再上光栅式观察课，或到检测练习中独立观察。',
  },
};
