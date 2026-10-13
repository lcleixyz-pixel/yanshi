import { useEffect, useState } from 'react';
import { useProgress } from '@/store/progressStore';

const SLIDES = [
  {
    title: '欢迎来到宝石检测实训系统',
    desc: '在网页上操作折射仪、偏光镜、分光镜与宝石显微镜，学会它们的使用方法与判断依据。',
    emoji: '💎',
  },
  {
    title: '一台仪器，一个仿真',
    desc: '点首页的仪器卡片「打开仿真」。每台仪器分「认识、实验、挑战」三屏，底部随时切换。',
    emoji: '🔬',
  },
  {
    title: '引导任务与挑战',
    desc: '想要逐步指引，就打开仿真里的「引导任务」卡；想检验自己，就进「挑战」屏或首页的「综合检测」，独立检测未知样品并命名。',
    emoji: '🎯',
  },
  {
    title: '准备就绪！',
    desc: '建议先从任意一台仪器的「认识」屏开始，再做引导任务，最后去综合检测。',
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
