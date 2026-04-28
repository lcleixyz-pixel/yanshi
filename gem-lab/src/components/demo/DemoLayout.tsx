import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import clsx from '@/utils/clsx';
import type { InstrumentDef } from '@/data/types';

export type DemoMode = 'learning' | 'detection';

export default function DemoLayout({
  instrument,
  mode,
  onModeChange,
  progressPercent,
  leftSlot,
  rightSlot,
  bottomTip,
  detectionLocked = false,
  /** 覆盖右栏宽度（如 w-[min(100%,400px)]） */
  rightAsideClassName,
  /** 覆盖右栏可滚动内容区 class（如 overflow-y-hidden） */
  rightBodyClassName,
}: {
  instrument: InstrumentDef;
  mode: DemoMode;
  onModeChange: (m: DemoMode) => void;
  /** 学习模式进度 0-100 */
  progressPercent?: number;
  leftSlot: ReactNode;
  rightSlot: ReactNode;
  bottomTip?: string;
  /** 是否在外部检测流程中（锁定模式切换） */
  detectionLocked?: boolean;
  rightAsideClassName?: string;
  rightBodyClassName?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen flex-col bg-lab-ink text-white">
      {/* 顶部条 */}
      <header
        className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-5"
        style={{
          background: `linear-gradient(90deg, ${instrument.themeHex}30 0%, rgba(15,37,69,0.85) 60%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            to={`/knowledge/${instrument.id}`}
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-300 hover:text-lab-cyan"
          >
            ← 知识库
          </Link>
          <span className="text-white/30">|</span>
          <span className="font-display text-base font-semibold">
            {instrument.name}互动演示
          </span>
          <span className="font-display text-base text-white/70">
            - {mode === 'learning' ? '学习模式' : '检测模式'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10"
          >
            ✕ 退出
          </button>
        </div>
      </header>

      {/* 主体 */}
      <div className="flex min-h-0 flex-1">
        {/* 左：仪器交互区 */}
        <section className="relative flex-[3] overflow-hidden bg-gradient-to-br from-[#f6f9fd] via-white to-[#eef4fb] text-ink">
          {leftSlot}
          {bottomTip && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line-2 bg-white/85 px-4 py-1.5 text-xs text-ink-2 shadow-card backdrop-blur">
              <span className="mr-1.5 inline-block">💡</span>
              {bottomTip}
            </div>
          )}
        </section>

        {/* 右：控制面板 */}
        <aside
          className={clsx(
            'flex w-[420px] shrink-0 flex-col border-l border-white/10 bg-[#0c1d3a] text-ink',
            rightAsideClassName,
          )}
        >
          {/* 模式切换 */}
          <div className="grid grid-cols-2 gap-1 border-b border-white/10 bg-[#08152a] p-1.5">
            <ModeBtn
              active={mode === 'learning'}
              themeHex={instrument.themeHex}
              onClick={() => onModeChange('learning')}
              icon="📖"
              label="学习模式"
            />
            <ModeBtn
              active={mode === 'detection'}
              themeHex={instrument.themeHex}
              onClick={() => !detectionLocked && onModeChange('detection')}
              icon={detectionLocked ? '🔒' : '🎯'}
              label="检测模式"
              disabled={detectionLocked}
            />
          </div>

          {/* 进度条 */}
          {progressPercent !== undefined && (
            <div className="border-b border-white/10 bg-[#0a1a32] px-4 py-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
                  Progress
                </span>
                <span className="font-mono text-[11px] tabular-nums text-slate-200">
                  {Math.round(progressPercent)}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPercent}%`,
                    background: instrument.themeHex,
                  }}
                />
              </div>
            </div>
          )}

          <div
            className={clsx(
              'scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-white px-4 py-4 text-ink',
              rightBodyClassName,
            )}
          >
            {rightSlot}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  themeHex,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  themeHex: string;
  onClick: () => void;
  icon: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex items-center justify-center gap-2 rounded-md py-1.5 text-sm font-medium transition-colors',
        active
          ? 'text-white shadow-card'
          : disabled
            ? 'cursor-not-allowed text-slate-500'
            : 'text-slate-300 hover:bg-white/5',
      )}
      style={active ? { background: themeHex } : {}}
    >
      <span className="text-base">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
