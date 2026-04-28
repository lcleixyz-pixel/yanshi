import { useEffect, useState } from 'react';
import Hotspot from '@/components/workbench/Hotspot';
import OnboardingModal from '@/components/workbench/OnboardingModal';
import { INSTRUMENT_LIST } from '@/data/instruments';
import { SAMPLES } from '@/data/samples';
import { useProgress } from '@/store/progressStore';

export default function HomePage() {
  const visited = useProgress((s) => s.visitedKnowledgeBases);
  const completedDemos = useProgress((s) => s.completedDemos);
  const detectionHistory = useProgress((s) => s.detectionHistory);
  const totalPoints = useProgress((s) => s.totalPoints);
  const reset = useProgress((s) => s.reset);

  const [bgLoaded, setBgLoaded] = useState(false);
  useEffect(() => {
    const img = new Image();
    img.onload = () => setBgLoaded(true);
    img.src = '/assets/scenes/workbench.png';
  }, []);

  const knowledgeProgress = `${visited.length} / ${INSTRUMENT_LIST.length}`;
  const demoProgress = `${completedDemos.filter((d) => d.mode === 'learning').length} / ${INSTRUMENT_LIST.length}`;
  const detectionCount = detectionHistory.length;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-workbench-gradient text-white">
      {/* 噪点纹理 */}
      <div className="pointer-events-none absolute inset-0 noise opacity-[0.04]" />

      {/* 顶部桌灯光晕 */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[820px] -translate-x-1/2"
        style={{
          background:
            'radial-gradient(ellipse at top, rgba(103,212,240,0.20), rgba(103,212,240,0.05) 45%, transparent 75%)',
        }}
      />

      {/* 顶部品牌栏 */}
      <header className="absolute left-0 right-0 top-0 z-30 flex items-start justify-between px-10 pt-8">
        <div className="animate-drop-in">
          <div className="text-[11px] tracking-[0.25em] text-lab-cyan/80">
            教学演示
          </div>
          <h1 className="mt-1 font-display text-[34px] font-semibold leading-tight">
            宝石检测 <span className="italic text-lab-cyan">实验工作台</span>
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            选择一件仪器开启知识学习 · 或点击样品盘开始实战检测
          </p>
        </div>
        <div className="flex animate-drop-in items-center gap-3">
          <ProgressChip label="知识库" value={knowledgeProgress} />
          <ProgressChip label="演示" value={demoProgress} />
          <ProgressChip label="检测" value={`${detectionCount} 次`} />
          <ProgressChip label="积分" value={`${totalPoints}`} highlight />
          <button
            onClick={() => {
              if (confirm('确定重置全部学习进度？此操作不可恢复。')) reset();
            }}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/10"
          >
            重置进度
          </button>
        </div>
      </header>

      {/* 主舞台：背景图 + 热区 */}
      <main className="absolute inset-0 z-10 flex items-center justify-center px-6 pt-28 pb-16">
        <div className="relative aspect-[16/9] w-full max-w-[1500px] overflow-hidden rounded-[28px] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
          {/* 背景图 */}
          <img
            src="/assets/scenes/workbench.png"
            alt="实验工作台"
            className={
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ' +
              (bgLoaded ? 'opacity-100' : 'opacity-0')
            }
            draggable={false}
          />

          {/* 顶部渐变（让品牌栏更易读） */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-lab-ink/60 to-transparent" />
          {/* 底部渐变 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-lab-ink/70 to-transparent" />

          {/* 顶部状态提示 */}
          <div className="absolute inset-x-0 top-5 z-20 flex items-center justify-center px-6">
            <div className="flex items-center gap-2 rounded-full border border-white/15 bg-lab-navy/70 px-4 py-2 text-xs text-slate-300 backdrop-blur">
              <span className="inline-block h-1.5 w-1.5 animate-soft-pulse rounded-full bg-emerald-400 align-middle" />
              <span>系统就绪</span>
              <span className="hidden text-slate-500 md:inline">· 悬停查看仪器 · 点击进入</span>
            </div>
          </div>

          {/* 折射仪热区 */}
          <Hotspot
            id="refractometer"
            rect={{ left: '11%', top: '58%', width: '19%', height: '32%' }}
            badgePosition="top"
            to="/knowledge/refractometer"
            title="折射仪"
            themeHex="#e8a93a"
            visited={visited.includes('refractometer')}
          />

          {/* 偏光镜热区 */}
          <Hotspot
            id="polariscope"
            rect={{ left: '39%', top: '55%', width: '20%', height: '32%' }}
            badgePosition="top"
            to="/knowledge/polariscope"
            title="偏光镜"
            themeHex="#a78bfa"
            visited={visited.includes('polariscope')}
          />

          {/* 分光镜热区 */}
          <Hotspot
            id="spectroscope"
            rect={{ left: '69%', top: '81%', width: '11%', height: '10%' }}
            badgePosition="top"
            to="/knowledge/spectroscope"
            title="分光镜"
            themeHex="#67d4f0"
            visited={visited.includes('spectroscope')}
          />

          {/* 样品盘热区 */}
          <Hotspot
            id="sample-tray"
            rect={{ left: '35%', top: '88%', width: '30%', height: '11%' }}
            badgePosition="bottom"
            to="/detection"
            title="样品盘 · 开始检测"
            subtitle={`SAMPLES · ${SAMPLES.length} GEMS`}
            themeHex="#fbbf24"
            variant="sample"
          />

        </div>
      </main>

      <OnboardingModal />
    </div>
  );
}

function ProgressChip({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur">
      <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
      <span
        className={
          'font-display text-sm font-semibold ' +
          (highlight ? 'text-amber-300' : 'text-white')
        }
      >
        {value}
      </span>
    </div>
  );
}
