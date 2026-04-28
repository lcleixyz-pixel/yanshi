import { useEffect, useState } from 'react';
import { useProgress } from '@/store/progressStore';

const SLIDES = [
  {
    title: '欢迎来到宝石检测实训系统',
    desc: '一个沉浸式的在线学习平台，帮助你掌握三大核心检测仪器的使用方法。',
    emoji: '💎',
  },
  {
    title: '认识三大检测仪器',
    desc: '折射仪测折射率，偏光镜判光性，分光镜看吸收光谱。点击工作台上对应的仪器即可进入学习。',
    emoji: '🔬',
  },
  {
    title: '两种学习模式',
    desc: '【学习模式】跟随步骤指引逐步掌握操作。【检测模式】独立完成样品检测并参与命名评估，赚取积分。',
    emoji: '🎯',
  },
  {
    title: '准备就绪！',
    desc: '建议先点击任意仪器进入知识库学习基础知识，再开始第一次检测挑战。',
    emoji: '🚀',
  },
];

export default function OnboardingModal() {
  const onboarded = useProgress((s) => s.onboarded);
  const setOnboarded = useProgress((s) => s.setOnboarded);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!onboarded) {
      const t = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(t);
    }
  }, [onboarded]);

  if (!open) return null;

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  const close = () => {
    setOpen(false);
    setOnboarded(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-lab-ink/80 backdrop-blur-sm">
      <div className="animate-drop-in w-[480px] rounded-3xl border border-white/10 bg-gradient-to-br from-lab-deep via-lab-navy to-lab-ink p-8 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]">
        {/* 步骤指示 */}
        <div className="mb-6 flex justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === step ? 'w-8 bg-lab-cyan' : i < step ? 'w-1.5 bg-lab-cyan/60' : 'w-1.5 bg-white/20')
              }
            />
          ))}
        </div>

        <div className="text-center">
          <div className="mb-3 text-5xl">{slide.emoji}</div>
          <h2 className="font-display text-2xl font-semibold">{slide.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-300">{slide.desc}</p>
        </div>

        <div className="mt-7 flex items-center justify-between">
          <button
            type="button"
            onClick={close}
            className="text-xs text-slate-400 hover:text-white"
          >
            跳过引导
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                上一步
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? close() : setStep((s) => s + 1))}
              className="rounded-lg bg-lab-cyan px-5 py-2 text-sm font-semibold text-lab-ink transition hover:bg-lab-cyan/90"
            >
              {isLast ? '开始探索 →' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
