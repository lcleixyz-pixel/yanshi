import { Link } from 'react-router-dom';
import OnboardingModal from '@/components/workbench/OnboardingModal';
import { useResponsiveViewport } from '@/components/shared/useResponsiveViewport';
import { INSTRUMENT_LIST } from '@/data/instruments';
import { SAMPLES } from '@/data/samples';
import { SIMS, type SimId } from '@/data/sims';
import { SIM_SCREEN_LABELS } from '@/domain/simSession';
import { masteryLevel } from '@/domain/practice';
import { useProgress } from '@/store/progressStore';
import '@/styles/instrument-ui.css';
import '@/styles/home.css';

/** 首页卡片顺序与说明：一台仪器一张卡（docs/整体重构规划-PhET风格-2026-10-11.md 第三节）。 */
const CARDS: readonly { id: SimId; summary: string; knowledge: boolean }[] = [
  { id: 'refractometer', summary: INSTRUMENT_LIST.find((item) => item.id === 'refractometer')!.intro.tagline, knowledge: true },
  { id: 'polariscope', summary: INSTRUMENT_LIST.find((item) => item.id === 'polariscope')!.intro.tagline, knowledge: true },
  { id: 'spectroscope', summary: INSTRUMENT_LIST.find((item) => item.id === 'spectroscope')!.intro.tagline, knowledge: true },
  { id: 'microscope', summary: '底光暗域 / 明域、顶光与侧光三路照明，认识结构与光路', knowledge: false },
];

/**
 * 首页：四台仪器各一张仿真卡（卡上标出有哪几屏，只有一个「打开仿真」主按钮），
 * 下方是综合检测与学习进度。知识库降为卡片上的次要链接。
 */
export default function HomePage() {
  // 首页按设备宽度排版（手机上卡片单列 / 双列），同仿真页。
  useResponsiveViewport();
  const visited = useProgress((s) => s.visitedKnowledgeBases);
  const completedDemos = useProgress((s) => s.completedDemos);
  const totalPoints = useProgress((s) => s.totalPoints);
  const mastery = useProgress((s) => s.sampleMastery);
  const reset = useProgress((s) => s.reset);

  // 完成过引导课程（学员自学写入的学习记录）的仪器；显微镜暂无引导课程。
  const learned: readonly string[] = [...new Set(completedDemos.filter((item) => item.mode === 'learning').map((item) => item.instrumentId))];
  const visitedIds: readonly string[] = visited;
  const masteredCount = SAMPLES.filter((sample) => masteryLevel(mastery[sample.id]) === 'mastered').length;

  return (
    <div className="home iu" data-testid="home-page">
      <header className="home__top">
        <div>
          <span className="home__eyebrow">教学演示</span>
          <h1>宝石检测实训</h1>
          <p className="home__flow" aria-label="学习顺序">认识 <i>→</i> 实验 <i>→</i> 挑战 <i>→</i> 综合检测</p>
        </div>
      </header>

      <main className="home__main">
        <nav className="home__cards" aria-label="仪器仿真">
          {CARDS.map((card) => {
            const sim = SIMS[card.id];
            const done = learned.includes(card.id);
            return (
              <article key={card.id} className="home-card iu" data-instrument={card.id} data-testid={`home-card-${card.id}`}>
                <Link to={`/sim/${card.id}/learn`} className="home-card__thumb" tabIndex={-1} aria-hidden="true">
                  <img src={`${import.meta.env.BASE_URL}assets/home/${card.id}.jpg`} alt="" loading="lazy" width={480} height={360} />
                </Link>
                <div className="home-card__body">
                  <h2>{sim.name}{done && <span className="home-card__done" title="已完成引导课程">✓ 已学</span>}</h2>
                  <p>{card.summary}</p>
                  <ul className="home-card__screens" aria-label={`${sim.name}的屏幕`}>
                    {(['learn', 'lab', 'challenge'] as const).map((id) => {
                      const has = sim.screens.some((screen) => screen.id === id);
                      return <li key={id} data-on={has}>{SIM_SCREEN_LABELS[id]}{has ? '' : ' · 待建'}</li>;
                    })}
                  </ul>
                  <div className="home-card__actions">
                    <Link to={`/sim/${card.id}/learn`} className="home-card__open" data-testid={card.id === 'microscope' ? 'home-microscope-link' : `home-open-${card.id}`}>打开仿真</Link>
                    {card.knowledge && <Link to={`/knowledge/${card.id}`} className="home-card__more">知识库{visitedIds.includes(card.id) ? ' ✓' : ''}</Link>}
                  </div>
                </div>
              </article>
            );
          })}
        </nav>

        <div className="home__row">
          <section className="home-wide home-wide--detect" aria-labelledby="home-detect-title">
            <div>
              <h2 id="home-detect-title">综合检测</h2>
              <p>抽一颗未知样品，用折射仪、偏光镜、分光镜各自检测，最后命名。样品库共 {SAMPLES.length} 颗。</p>
            </div>
            <Link to="/detection" className="home-wide__go" data-testid="home-detection-link">开始检测</Link>
          </section>
          <section className="home-wide" aria-labelledby="home-progress-title">
            <div>
              <h2 id="home-progress-title">学习进度</h2>
              <dl className="home__stats">
                <div><dt>引导课程</dt><dd>{learned.length} / {INSTRUMENT_LIST.length}</dd></div>
                <div><dt>知识库</dt><dd>{visited.length} / {INSTRUMENT_LIST.length}</dd></div>
                <div><dt>掌握样品</dt><dd>{masteredCount} / {SAMPLES.length}</dd></div>
                <div><dt>积分</dt><dd>{totalPoints}</dd></div>
              </dl>
            </div>
            <div className="home-wide__links">
              <Link to="/progress" className="home-wide__go home-wide__go--quiet">学习图鉴</Link>
              <button type="button" className="home-wide__reset" onClick={() => { if (confirm('确定重置全部学习进度？此操作不可恢复。')) reset(); }}>重置进度</button>
            </div>
          </section>
        </div>

        <p className="home__note">2D 经典演示在各仪器知识库的「交互演示」一节，设备较旧或三维无法加载时使用。</p>
      </main>

      <OnboardingModal />
    </div>
  );
}
