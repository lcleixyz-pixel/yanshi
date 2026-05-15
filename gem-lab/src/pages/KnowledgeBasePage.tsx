import { useEffect } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Header from '@/components/shared/Header';
import Breadcrumb from '@/components/shared/Breadcrumb';
import SectionNav from '@/components/knowledge/SectionNav';
import ComponentDiagram from '@/components/knowledge/ComponentDiagram';
import MethodTabs from '@/components/knowledge/MethodTabs';
import { INSTRUMENTS, INSTRUMENT_LIST } from '@/data/instruments';
import type { InstrumentId } from '@/data/types';
import { useProgress } from '@/store/progressStore';

const SECTIONS = [
  { id: 'introduction', label: '基本介绍' },
  { id: 'structure', label: '结构讲解' },
  { id: 'usage', label: '使用方法' },
  { id: 'demo-cta', label: '交互演示' },
];

export default function KnowledgeBasePage() {
  const { instrumentId } = useParams<{ instrumentId: InstrumentId }>();
  const navigate = useNavigate();
  const markVisited = useProgress((s) => s.markVisited);

  const instrument = instrumentId ? INSTRUMENTS[instrumentId] : null;

  useEffect(() => {
    if (instrument) markVisited(instrument.id);
    window.scrollTo({ top: 0 });
  }, [instrument, markVisited]);

  if (!instrument) return <Navigate to="/" replace />;

  const otherInstruments = INSTRUMENT_LIST.filter((i) => i.id !== instrument.id);
  const hasExternalComponents = instrument.components.some((c) => !c.position);

  return (
    <div className="min-h-screen bg-brand-50/40 text-ink">
      <Header
        title={instrument.name}
        subtitle="仪器知识库"
        right={
          <Link to="/" className="btn-ghost text-xs">
            返回工作台
          </Link>
        }
      />

      {/* Hero */}
      <section
        className="relative overflow-hidden border-b border-line"
        style={{
          background: `linear-gradient(135deg, ${instrument.themeHex}10 0%, #ffffff 60%)`,
        }}
      >
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-10 py-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <Breadcrumb
              items={[
                { label: '工作台', to: '/' },
                { label: '仪器知识库' },
                { label: instrument.name },
              ]}
            />
            <h1 className="mt-3 font-display text-[40px] font-semibold leading-tight">
              {instrument.name}
            </h1>
            <p className="mt-2 text-sm text-ink-3">{instrument.intro.tagline}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => navigate(`/demo/${instrument.id}`)}
                className="btn-primary"
                style={{ background: instrument.themeHex, color: '#fff' }}
              >
                进入互动学习 →
              </button>
              <a href="#structure" className="btn-ghost">
                查看结构
              </a>
              <a href="#usage" className="btn-ghost">
                了解操作步骤
              </a>
            </div>
          </div>
          <div className="relative">
            <div
              className="absolute inset-x-6 inset-y-4 rounded-3xl opacity-60 blur-3xl"
              style={{ background: instrument.themeHex }}
            />
            <img
              src={instrument.productImage}
              alt={instrument.name}
              className="relative h-full max-h-[280px] w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
      </section>

      {/* 主体：左侧栏 + 内容 */}
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-10 py-12 lg:grid-cols-[180px_1fr]">
        <aside className="hidden lg:block">
          <SectionNav items={SECTIONS} themeHex={instrument.themeHex} />
        </aside>

        <main className="min-w-0 space-y-16">
          {/* Section 1: 基本介绍 */}
          <section id="introduction" className="scroll-mt-24">
            <SectionTitle index={1} title="基本介绍" themeHex={instrument.themeHex} />

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <Card title="工作原理" tone="brand">
                {instrument.intro.principle.map((p, i) => (
                  <p key={i} className={i > 0 ? 'mt-3' : ''}>
                    {p}
                  </p>
                ))}
              </Card>

              <Card title="主要用途" tone="emerald">
                <ul className="space-y-2">
                  {instrument.intro.usage.map((u, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: instrument.themeHex }}
                      />
                      <span>{u}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="使用局限" tone="amber">
                <ul className="space-y-2">
                  {instrument.intro.limitations.map((u, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>{u}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </section>

          {/* Section 2: 结构 */}
          <section id="structure" className="scroll-mt-24">
            <SectionTitle index={2} title="结构讲解" themeHex={instrument.themeHex} />
            <p className="mb-5 max-w-3xl text-sm leading-relaxed text-ink-3">
              点击或悬停产品图上的编号热点，查看每个部件的详细说明。
              {hasExternalComponents
                ? ' 标记为外接附件的项目不在本体图片上，但会参与实际操作。'
                : ' 下方列表与图示双向联动。'}
            </p>
            <ComponentDiagram
              productImage={instrument.productImage}
              components={instrument.components}
              themeHex={instrument.themeHex}
            />
          </section>

          {/* Section 3: 使用方法 */}
          <section id="usage" className="scroll-mt-24">
            <SectionTitle index={3} title="使用方法" themeHex={instrument.themeHex} />
            <p className="mb-5 max-w-3xl text-sm leading-relaxed text-ink-3">
              切换标签查看不同观察方法的步骤。每一步对应交互演示中的一个可点击元素。
            </p>
            <MethodTabs methods={instrument.methods} themeHex={instrument.themeHex} />
          </section>

          {/* Section 4: CTA */}
          <section id="demo-cta" className="scroll-mt-24">
            <SectionTitle index={4} title="交互演示" themeHex={instrument.themeHex} />
            <div
              className="overflow-hidden rounded-3xl p-8 text-white shadow-lift"
              style={{
                background: `linear-gradient(135deg, ${instrument.themeHex} 0%, ${shade(instrument.themeHex, -0.25)} 100%)`,
              }}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-mono text-[11px] uppercase tracking-[0.3em] opacity-80">
                    INTERACTIVE DEMO · STEP-BY-STEP
                  </div>
                  <h3 className="mt-2 font-display text-2xl font-semibold">
                    在虚拟工作台上动手操作 {instrument.name}
                  </h3>
                  <p className="mt-2 max-w-xl text-sm opacity-90">
                    跟随提示完成完整的检测流程，系统会即时反馈每一步操作是否正确，并显示对应的观察现象。
                  </p>
                </div>
                <div className="flex flex-col gap-2 lg:flex-row">
                  <Link
                    to={`/demo/${instrument.id}`}
                    className="group inline-flex items-center justify-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-ink shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    <span>开始学习模式</span>
                    <span className="transition-transform duration-300 group-hover:translate-x-1.5">
                      →
                    </span>
                  </Link>
                  <Link
                    to="/detection"
                    className="group inline-flex items-center justify-center gap-2 rounded-lg border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    <span>挑战检测模式</span>
                    <span className="transition-transform duration-300 group-hover:translate-x-1">
                      →
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* 其他仪器 */}
          <section className="border-t border-line pt-10">
            <h3 className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-ink-4">
              继续探索其他仪器
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {otherInstruments.map((it) => (
                <Link
                  key={it.id}
                  to={`/knowledge/${it.id}`}
                  data-testid={`other-instrument-link-${it.id}`}
                  className="group flex items-center gap-4 rounded-2xl border-2 border-transparent bg-white p-4 ring-1 ring-line transition-all hover:-translate-y-1 hover:shadow-lift"
                  style={
                    {
                      ['--hover-border' as string]: it.themeHex,
                    } as React.CSSProperties
                  }
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = it.themeHex;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  <img
                    src={it.productImage}
                    alt={it.name}
                    className="h-16 w-16 rounded-lg bg-brand-50/40 object-contain p-1.5 transition-transform group-hover:scale-105"
                    draggable={false}
                  />
                  <div className="flex-1">
                    <div className="font-display text-base font-semibold text-ink">{it.name}</div>
                    <div className="text-xs text-ink-3">{it.intro.tagline}</div>
                  </div>
                  <span
                    className="text-xl opacity-30 transition-all group-hover:translate-x-1.5 group-hover:opacity-100"
                    style={{ color: it.themeHex }}
                  >
                    →
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function SectionTitle({
  index,
  title,
  themeHex,
}: {
  index: number;
  title: string;
  themeHex: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <span
        className="flex h-9 w-9 items-center justify-center rounded-lg font-mono text-sm font-semibold text-white"
        style={{ background: themeHex }}
      >
        {String(index).padStart(2, '0')}
      </span>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
    </div>
  );
}

function Card({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'brand' | 'emerald' | 'amber';
  children: React.ReactNode;
}) {
  const toneStyles: Record<string, string> = {
    brand: 'bg-brand-50/50 ring-brand-100',
    emerald: 'bg-emerald-50/50 ring-emerald-100',
    amber: 'bg-amber-50/50 ring-amber-100',
  };
  const titleStyles: Record<string, string> = {
    brand: 'text-brand-700',
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
  };
  return (
    <div className={`rounded-2xl p-5 ring-1 ${toneStyles[tone]}`}>
      <h3 className={`font-display text-base font-semibold ${titleStyles[tone]}`}>{title}</h3>
      <div className="mt-3 text-sm leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

// 工具：将 hex 颜色变深/变浅
function shade(hex: string, percent: number): string {
  const m = hex.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  const adj = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (percent < 0 ? c * percent : (255 - c) * percent))));
  r = adj(r);
  g = adj(g);
  b = adj(b);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
