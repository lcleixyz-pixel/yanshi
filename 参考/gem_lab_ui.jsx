import React, { useState, useEffect, useRef, useMemo } from 'react';

// ============================================================
// 珠宝玉石检测培训 — UI 原型
// 蓝白科学风 · 沉浸式工作台 · 高仿真折射仪演示
// ============================================================

const FontStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
    :root{
      --lab-ink:#0a1628;
      --lab-navy:#0f2545;
      --lab-deep:#1e3a5f;
      --lab-blue:#2563eb;
      --lab-cyan:#67d4f0;
      --lab-teal:#22d3ee;
      --lab-amber:#f59e0b;
      --lab-gold:#fbbf24;
      --lab-bone:#f8fafc;
      --lab-mist:#e2e8f0;
      --lab-slate:#64748b;
      --lab-wood:#3a2a1e;
    }
    .font-display{font-family:'Fraunces',serif;font-optical-sizing:auto;}
    .font-body{font-family:'Outfit',sans-serif;}
    .font-mono{font-family:'JetBrains Mono',monospace;}
    .noise{background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E");}
    @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
    @keyframes pulse-glow { 0%,100%{opacity:.4} 50%{opacity:.8} }
    @keyframes fade-in { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
    @keyframes slide-in { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
    @keyframes drop-in { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
    .anim-float{animation:float 4s ease-in-out infinite}
    .anim-pulse{animation:pulse-glow 2.4s ease-in-out infinite}
    .anim-fade{animation:fade-in .5s ease-out both}
    .anim-slide{animation:slide-in .4s ease-out both}
    .anim-drop{animation:drop-in .5s cubic-bezier(.34,1.56,.64,1) both}
    .stagger-1{animation-delay:.08s} .stagger-2{animation-delay:.16s} .stagger-3{animation-delay:.24s} .stagger-4{animation-delay:.32s}
  `}</style>
);

// ============================================================
// 数据:常见宝石的光学特性
// ============================================================
const GEM_DATABASE = [
  { id:'diamond', name:'钻石', en:'Diamond', color:'#f1f5f9', RI:2.417, DR:0, type:'均质',  spectrum:'无明显吸收', difficulty:'中', note:'RI 超出折射仪量程(>1.81),显示"负读数"', emoji:'◆' },
  { id:'ruby',    name:'红宝石', en:'Ruby',    color:'#dc2626', RI:[1.762,1.770], DR:0.008, type:'一轴晶(负)', spectrum:'694nm 强荧光线;468/476nm 弱线;550-580nm 宽吸收带', difficulty:'中', note:'Cr³⁺ 致色;DR 较小', emoji:'●' },
  { id:'sapphire',name:'蓝宝石', en:'Sapphire',color:'#1e3a8a', RI:[1.762,1.770], DR:0.008, type:'一轴晶(负)', spectrum:'450nm 吸收带(Fe³⁺);蓝宝石特征', difficulty:'中', note:'与红宝石同属刚玉族,仅颜色差异', emoji:'●' },
  { id:'emerald', name:'祖母绿', en:'Emerald', color:'#059669', RI:[1.577,1.583], DR:0.006, type:'一轴晶(负)', spectrum:'683/680nm 双线;630-580nm 弱吸收;红区透射', difficulty:'高', note:'Cr³⁺ 致色;查尔斯滤色镜变红', emoji:'●' },
  { id:'quartz',  name:'水晶',   en:'Quartz',  color:'#a5f3fc', RI:[1.544,1.553], DR:0.009, type:'一轴晶(正)', spectrum:'无特征吸收', difficulty:'易', note:'最常见宝石之一', emoji:'◆' },
  { id:'garnet',  name:'石榴石', en:'Garnet',  color:'#991b1b', RI:1.740, DR:0, type:'均质', spectrum:'505nm 强吸收线(铁铝榴石)', difficulty:'中', note:'均质体,单折射', emoji:'●' },
  { id:'tourmaline',name:'碧玺', en:'Tourmaline',color:'#10b981', RI:[1.624,1.644], DR:0.020, type:'一轴晶(负)', spectrum:'随颜色变化', difficulty:'中', note:'DR 较大(0.018-0.040)是鉴定特征', emoji:'●' },
  { id:'topaz',   name:'托帕石', en:'Topaz',   color:'#fde68a', RI:[1.619,1.627], DR:0.008, type:'二轴晶(正)', spectrum:'无明显特征', difficulty:'高', note:'', emoji:'●' },
];

// ============================================================
// 通用 UI 组件
// ============================================================
const Crumb = ({ path, onHome }) => (
  <div className="flex items-center gap-2 text-xs font-body tracking-wider uppercase text-slate-500">
    <button onClick={onHome} className="hover:text-blue-600 transition-colors">工作台</button>
    {path.map((p,i)=>(
      <React.Fragment key={i}>
        <span className="text-slate-300">/</span>
        <span className={i===path.length-1?'text-blue-700 font-medium':''}>{p}</span>
      </React.Fragment>
    ))}
  </div>
);

const Pill = ({ children, tone='blue' }) => {
  const tones = {
    blue:'bg-blue-50 text-blue-700 ring-blue-200',
    amber:'bg-amber-50 text-amber-700 ring-amber-200',
    slate:'bg-slate-100 text-slate-700 ring-slate-200',
    green:'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rose:'bg-rose-50 text-rose-700 ring-rose-200'
  };
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-body font-medium ring-1 ${tones[tone]}`}>{children}</span>;
};

// ============================================================
// 主工作台(沉浸式深色夜光实验室)
// ============================================================
const Workbench = ({ go }) => {
  const [hovered, setHovered] = useState(null);

  const instruments = [
    { id:'refractometer', name:'折射仪', en:'Refractometer', sub:'测量 RI / DR · 鉴定核心' },
    { id:'polariscope',   name:'偏光镜', en:'Polariscope',   sub:'判别光性均质 / 非均质' },
    { id:'spectroscope',  name:'分光镜', en:'Spectroscope',  sub:'观察特征吸收光谱' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden font-body" style={{background:'radial-gradient(ellipse at 50% 0%, #1e3a5f 0%, #0f2545 40%, #0a1628 100%)'}}>
      {/* 噪点纹理 */}
      <div className="absolute inset-0 noise opacity-[0.04] pointer-events-none"></div>

      {/* 顶部桌灯光晕 */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] pointer-events-none" style={{background:'radial-gradient(ellipse at top, rgba(103,212,240,0.18), rgba(103,212,240,0.06) 40%, transparent 70%)'}}></div>

      {/* 顶部品牌栏 */}
      <div className="relative px-10 pt-8 flex items-start justify-between">
        <div className="anim-drop">
          <div className="text-cyan-300/80 text-[11px] font-mono tracking-[0.3em] uppercase">Fable · Gemological Laboratory</div>
          <div className="font-display text-4xl text-white mt-1" style={{fontVariationSettings:"'opsz' 144, 'wght' 400"}}>
            宝石检测 <span className="italic text-cyan-200">实验工作台</span>
          </div>
          <div className="text-slate-400 text-sm mt-1">选择一件仪器开启学习 · 或从样品栏开始实战检测</div>
        </div>
        <div className="anim-drop stagger-1 flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-emerald-400 anim-pulse"></span>
            <span className="text-slate-300 text-xs font-mono">系统就绪</span>
          </div>
          <button className="px-4 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-slate-300 text-xs hover:bg-white/10 transition">帮助</button>
        </div>
      </div>

      {/* 主工作台区域 */}
      <div className="relative mt-10 mx-auto max-w-[1400px] px-10">
        {/* 桌面投影 */}
        <div className="relative">
          {/* 桌面台面 */}
          <div className="relative rounded-t-[28px] h-[520px] overflow-hidden"
               style={{
                 background:'linear-gradient(180deg, #162847 0%, #0e1e38 60%, #0a1628 100%)',
                 boxShadow:'inset 0 1px 0 rgba(103,212,240,0.15), 0 30px 80px -20px rgba(0,0,0,0.8)'
               }}>
            {/* 桌面网格(轻微) */}
            <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#67d4f0" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)"/>
            </svg>

            {/* 环境阴影光圈 */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[700px] h-[200px] rounded-full" style={{background:'radial-gradient(ellipse, rgba(103,212,240,0.12), transparent 70%)'}}></div>

            {/* 三台仪器并排 */}
            <div className="absolute inset-0 flex items-center justify-around px-8 pb-10">
              {instruments.map((it, idx) => (
                <InstrumentCard
                  key={it.id}
                  instrument={it}
                  index={idx}
                  hovered={hovered===it.id}
                  onHover={()=>setHovered(it.id)}
                  onLeave={()=>setHovered(null)}
                  onClick={()=>go(`${it.id}-knowledge`)}
                />
              ))}
            </div>

            {/* 桌面上的细节装饰 */}
            <div className="absolute bottom-4 left-8 text-cyan-300/30 text-[10px] font-mono tracking-widest">BENCH · 01</div>
            <div className="absolute bottom-4 right-8 text-cyan-300/30 text-[10px] font-mono tracking-widest">λ = 589.3 nm · Na-D</div>
          </div>

          {/* 样品栏(独立卡片) */}
          <div className="mt-8 rounded-2xl p-[1px]" style={{background:'linear-gradient(135deg, rgba(251,191,36,0.4), rgba(245,158,11,0.1), rgba(251,191,36,0.4))'}}>
            <button
              onClick={()=>go('sample-select')}
              className="w-full rounded-2xl bg-gradient-to-br from-[#162847] to-[#0a1628] p-6 flex items-center justify-between group hover:from-[#1a2f52] transition-all"
            >
              <div className="flex items-center gap-6">
                {/* 样品栏 SVG */}
                <div className="w-24 h-16 rounded-lg relative overflow-hidden ring-1 ring-amber-400/30" style={{background:'linear-gradient(135deg, #78350f, #3a2a1e)'}}>
                  <div className="absolute inset-2 grid grid-cols-4 gap-1">
                    {[0,1,2,3].map(i=>(
                      <div key={i} className="rounded-sm" style={{background:`radial-gradient(circle at 30% 30%, ${['#67d4f0','#fbbf24','#dc2626','#10b981'][i]}, ${['#1e3a5f','#78350f','#450a0a','#064e3b'][i]})`, boxShadow:'inset 0 0 4px rgba(0,0,0,0.5)'}}></div>
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-2xl text-amber-200 italic" style={{fontVariationSettings:"'opsz' 144"}}>未知样品 · Unknown</span>
                    <Pill tone="amber">实战检测</Pill>
                  </div>
                  <div className="text-slate-400 text-sm mt-1">抽取样品 → 使用三台仪器检测 → 综合现象定名</div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-amber-300 group-hover:translate-x-1 transition-transform">
                <span className="text-sm">进入检测模式</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </button>
          </div>

          {/* 底部提示 */}
          <div className="mt-6 flex items-center justify-between text-xs text-slate-500 font-mono">
            <div>点击仪器 → 学习模式 · 点击样品栏 → 检测模式</div>
            <div className="flex items-center gap-4">
              <span>v1.0 · TRAINING BUILD</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 单台仪器卡片(工作台上的 3D 感呈现)
const InstrumentCard = ({ instrument, index, hovered, onHover, onLeave, onClick }) => {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      className="group relative flex flex-col items-center anim-drop"
      style={{animationDelay:`${index*0.12 + 0.2}s`}}
    >
      {/* 底部光圈 */}
      <div className={`absolute -bottom-2 w-48 h-6 rounded-full transition-all duration-500 ${hovered?'opacity-90 scale-110':'opacity-50'}`}
           style={{background:'radial-gradient(ellipse, rgba(103,212,240,0.4), transparent 70%)'}}></div>

      {/* 仪器主体(SVG) */}
      <div className={`transition-all duration-500 ${hovered?'-translate-y-2':''} anim-float`} style={{animationDelay:`${index*0.3}s`}}>
        {instrument.id==='refractometer' && <RefractometerIcon hovered={hovered} />}
        {instrument.id==='polariscope' && <PolariscopeIcon hovered={hovered} />}
        {instrument.id==='spectroscope' && <SpectroscopeIcon hovered={hovered} />}
      </div>

      {/* 标签 */}
      <div className="mt-6 text-center">
        <div className="font-display text-2xl text-white" style={{fontVariationSettings:"'opsz' 144"}}>{instrument.name}</div>
        <div className="text-cyan-300/70 text-[10px] font-mono tracking-[0.2em] uppercase mt-1">{instrument.en}</div>
        <div className={`text-slate-400 text-xs mt-2 transition-all ${hovered?'opacity-100':'opacity-60'}`}>{instrument.sub}</div>
      </div>

      {/* 悬浮标签 */}
      <div className={`absolute -top-10 px-3 py-1.5 rounded-md bg-cyan-500/10 ring-1 ring-cyan-400/40 text-cyan-200 text-[11px] font-mono whitespace-nowrap transition-all ${hovered?'opacity-100 translate-y-0':'opacity-0 -translate-y-2 pointer-events-none'}`}>
        点击进入 →
      </div>
    </button>
  );
};

// 折射仪 SVG 图标
const RefractometerIcon = ({ hovered }) => (
  <svg width="200" height="160" viewBox="0 0 200 160">
    <defs>
      <linearGradient id="ref-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2a3a52"/>
        <stop offset="1" stopColor="#0f1a2e"/>
      </linearGradient>
      <linearGradient id="ref-top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4b5563"/>
        <stop offset="1" stopColor="#1f2937"/>
      </linearGradient>
      <radialGradient id="ref-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor={hovered?"#67d4f0":"#22d3ee"} stopOpacity="0.7"/>
        <stop offset="1" stopColor="#22d3ee" stopOpacity="0"/>
      </radialGradient>
    </defs>
    {/* 光晕 */}
    {hovered && <circle cx="100" cy="80" r="70" fill="url(#ref-glow)" opacity="0.5"/>}
    {/* 主体 */}
    <rect x="30" y="70" width="140" height="60" rx="6" fill="url(#ref-body)" stroke="#1e293b" strokeWidth="1"/>
    {/* 顶盖 */}
    <rect x="30" y="60" width="140" height="14" rx="3" fill="url(#ref-top)"/>
    {/* 前面板刻字 */}
    <rect x="45" y="90" width="60" height="28" rx="2" fill="#0a1628"/>
    <text x="75" y="108" fontSize="9" fill="#67d4f0" textAnchor="middle" fontFamily="monospace">RI · 1.30-1.81</text>
    {/* 眼罩/目镜 */}
    <rect x="110" y="35" width="40" height="10" rx="2" fill="#1f2937" transform="rotate(-15 130 40)"/>
    <rect x="115" y="42" width="30" height="30" rx="3" fill="#111827" transform="rotate(-15 130 55)"/>
    <circle cx="130" cy="55" r="8" fill="#0a1628" transform="rotate(-15 130 55)"/>
    <circle cx="130" cy="55" r="6" fill={hovered?"#67d4f0":"#1e3a5f"} opacity="0.8" transform="rotate(-15 130 55)"/>
    {/* 光源指示 */}
    <circle cx="160" cy="100" r="2.5" fill={hovered?"#22d3ee":"#0891b2"}>
      {hovered && <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite"/>}
    </circle>
    {/* 金属盖 */}
    <rect x="50" y="55" width="50" height="8" rx="2" fill="#9ca3af" stroke="#4b5563" strokeWidth="0.5"/>
    <circle cx="55" cy="59" r="1.5" fill="#4b5563"/>
    <circle cx="95" cy="59" r="1.5" fill="#4b5563"/>
    {/* 底座 */}
    <rect x="25" y="128" width="150" height="6" rx="2" fill="#111827"/>
  </svg>
);

// 偏光镜 SVG 图标
const PolariscopeIcon = ({ hovered }) => (
  <svg width="180" height="200" viewBox="0 0 180 200">
    <defs>
      <linearGradient id="pol-body" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#374151"/>
        <stop offset="1" stopColor="#111827"/>
      </linearGradient>
      <radialGradient id="pol-light" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fef3c7"/>
        <stop offset="0.5" stopColor="#fbbf24"/>
        <stop offset="1" stopColor="#f59e0b" stopOpacity="0.2"/>
      </radialGradient>
    </defs>
    {/* 上部:偏振片支架 */}
    <rect x="60" y="20" width="60" height="12" rx="2" fill="url(#pol-body)"/>
    <circle cx="90" cy="45" r="22" fill="#1e293b" stroke="#4b5563" strokeWidth="1"/>
    <circle cx="90" cy="45" r="18" fill={hovered?"#1e3a8a":"#0f172a"} opacity="0.9"/>
    {/* 偏振指示线 */}
    <line x1="72" y1="45" x2="108" y2="45" stroke="#67d4f0" strokeWidth="1" opacity="0.6"/>
    {/* 支柱 */}
    <rect x="87" y="67" width="6" height="30" fill="#4b5563"/>
    {/* 样品台 */}
    <ellipse cx="90" cy="100" rx="25" ry="5" fill="#374151"/>
    <ellipse cx="90" cy="98" rx="25" ry="5" fill="#6b7280"/>
    {/* 样品 */}
    <circle cx="90" cy="97" r="4" fill={hovered?"#dc2626":"#991b1b"} opacity="0.8">
      <animate attributeName="r" values="4;4.5;4" dur="3s" repeatCount="indefinite"/>
    </circle>
    {/* 下部支柱 */}
    <rect x="87" y="103" width="6" height="25" fill="#4b5563"/>
    {/* 底座含光源 */}
    <rect x="40" y="128" width="100" height="50" rx="8" fill="url(#pol-body)" stroke="#1e293b"/>
    <circle cx="90" cy="153" r="18" fill="url(#pol-light)" opacity={hovered?"1":"0.85"}>
      {hovered && <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite"/>}
    </circle>
    <circle cx="90" cy="153" r="10" fill="#fef3c7" opacity="0.6"/>
    {/* 底部标签 */}
    <rect x="55" y="172" width="70" height="3" rx="1" fill="#0891b2" opacity="0.5"/>
  </svg>
);

// 分光镜 SVG 图标
const SpectroscopeIcon = ({ hovered }) => (
  <svg width="200" height="160" viewBox="0 0 200 160">
    <defs>
      <linearGradient id="spec-body" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#1f2937"/>
        <stop offset="0.5" stopColor="#374151"/>
        <stop offset="1" stopColor="#1f2937"/>
      </linearGradient>
      <linearGradient id="spec-rainbow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#dc2626"/>
        <stop offset="0.2" stopColor="#f59e0b"/>
        <stop offset="0.4" stopColor="#eab308"/>
        <stop offset="0.6" stopColor="#10b981"/>
        <stop offset="0.8" stopColor="#3b82f6"/>
        <stop offset="1" stopColor="#7c3aed"/>
      </linearGradient>
    </defs>
    {/* 支架 */}
    <rect x="30" y="115" width="140" height="8" rx="2" fill="#1f2937"/>
    {/* 主镜筒 */}
    <rect x="40" y="70" width="120" height="40" rx="4" fill="url(#spec-body)"/>
    {/* 狭缝端 */}
    <rect x="35" y="75" width="10" height="30" rx="2" fill="#4b5563"/>
    <rect x="37" y="86" width="4" height="8" fill="#0a1628"/>
    {/* 刻度环 */}
    <rect x="75" y="68" width="3" height="44" fill="#6b7280"/>
    <rect x="100" y="68" width="3" height="44" fill="#6b7280"/>
    <rect x="125" y="68" width="3" height="44" fill="#6b7280"/>
    {/* 目镜 */}
    <rect x="160" y="78" width="12" height="24" rx="2" fill="#4b5563"/>
    <circle cx="166" cy="90" r="5" fill={hovered?"#67d4f0":"#1e3a5f"}/>
    {/* 光谱条(装饰) */}
    {hovered && (
      <>
        <rect x="45" y="130" width="110" height="8" rx="1" fill="url(#spec-rainbow)" opacity="0.9">
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/>
        </rect>
        <line x1="65" y1="128" x2="65" y2="140" stroke="#000" strokeWidth="1.5"/>
        <line x1="120" y1="128" x2="120" y2="140" stroke="#000" strokeWidth="1.5"/>
        <line x1="140" y1="128" x2="140" y2="140" stroke="#000" strokeWidth="1"/>
      </>
    )}
    {/* 品牌标 */}
    <text x="100" y="95" fontSize="7" fill="#67d4f0" textAnchor="middle" fontFamily="monospace" opacity="0.7">FABLE</text>
  </svg>
);

// ============================================================
// 折射仪知识库页面(完整版)
// ============================================================
const RefractometerKnowledge = ({ go }) => {
  const [tab, setTab] = useState('intro');

  return (
    <div className="min-h-screen font-body" style={{background:'linear-gradient(180deg, #f0f7ff 0%, #e0ecfe 100%)'}}>
      <FontStyles/>
      {/* 顶部导航 */}
      <div className="px-10 py-5 bg-white/70 backdrop-blur border-b border-blue-100 flex items-center justify-between sticky top-0 z-10">
        <Crumb path={['折射仪 · Refractometer']} onHome={()=>go('workbench')}/>
        <button onClick={()=>go('refractometer-demo')} className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-medium hover:shadow-lg hover:shadow-blue-500/30 transition-all flex items-center gap-2">
          <span>启动交互演示</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
      </div>

      <div className="max-w-[1400px] mx-auto px-10 py-10">
        {/* Hero */}
        <div className="grid grid-cols-[1.5fr_1fr] gap-10 items-center anim-fade">
          <div>
            <div className="text-blue-600 text-xs font-mono tracking-[0.3em] uppercase mb-3">01 · Gem Refractometer</div>
            <h1 className="font-display text-6xl text-slate-900 leading-none" style={{fontVariationSettings:"'opsz' 144, 'wght' 400"}}>
              宝石 <span className="italic" style={{fontVariationSettings:"'opsz' 144, 'wght' 300"}}>折射仪</span>
            </h1>
            <p className="text-slate-600 mt-5 leading-relaxed max-w-xl">
              测量宝石折射率(RI)与双折射率(DR)的核心仪器。通过光在宝石-棱镜界面发生全反射的临界角,直接读出折射率数值,是判定宝石种属最关键的光学参数。
            </p>
            <div className="flex gap-2 mt-6">
              <Pill tone="blue">量程 1.30 – 1.81</Pill>
              <Pill tone="blue">精度 ±0.002</Pill>
              <Pill tone="amber">飞博尔 FGR-2</Pill>
            </div>
          </div>
          {/* 大图 */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-200/30 to-cyan-200/30 rounded-3xl blur-2xl"></div>
            <div className="relative bg-white rounded-3xl p-8 ring-1 ring-blue-100 shadow-xl shadow-blue-500/5">
              <RefractometerFullDiagram labels={false}/>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-12">
          <div className="flex gap-1 bg-white/60 p-1.5 rounded-xl ring-1 ring-blue-100 w-fit">
            {[
              {k:'intro',label:'仪器介绍'},
              {k:'structure',label:'结构说明'},
              {k:'sop',label:'使用方法'},
              {k:'demo',label:'交互演示',hot:true},
            ].map(t=>(
              <button key={t.k}
                onClick={()=>t.k==='demo'?go('refractometer-demo'):setTab(t.k)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                  tab===t.k?'bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-md':'text-slate-600 hover:text-slate-900'
                }`}>
                {t.label}
                {t.hot && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-mono">GO</span>}
              </button>
            ))}
          </div>

          <div className="mt-8">
            {tab==='intro' && <IntroTab/>}
            {tab==='structure' && <StructureTab/>}
            {tab==='sop' && <SopTab go={go}/>}
          </div>
        </div>
      </div>
    </div>
  );
};

const IntroTab = () => (
  <div className="grid grid-cols-3 gap-6 anim-fade">
    <div className="col-span-2 bg-white rounded-2xl p-8 ring-1 ring-blue-100">
      <div className="text-blue-600 text-xs font-mono tracking-wider uppercase">工作原理</div>
      <h3 className="font-display text-2xl text-slate-900 mt-2">全反射临界角法</h3>
      <p className="text-slate-600 mt-4 leading-relaxed">
        当光从高折射率介质(玻璃棱镜,n≈1.87)进入低折射率介质(宝石,n&lt;1.81)时,超过某一入射角即发生<strong className="text-slate-900">全反射</strong>。该临界角与两种介质的折射率直接相关。目镜中观察到的明暗分界线位置,通过内置刻度直接换算为宝石的 RI 值。
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
          <div className="text-xs text-blue-700 font-mono uppercase tracking-wider">适用对象</div>
          <div className="text-slate-800 mt-1 text-sm">具有平整抛光面的刻面宝石;大多数单晶宝石</div>
        </div>
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-100">
          <div className="text-xs text-rose-700 font-mono uppercase tracking-wider">局限性</div>
          <div className="text-slate-800 mt-1 text-sm">RI &gt; 1.81 超出量程(钻石等);弧面/粗糙表面只能点测</div>
        </div>
      </div>
    </div>
    <div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-8 text-white">
      <div className="text-cyan-100 text-xs font-mono tracking-wider uppercase">Critical Angle</div>
      <div className="font-display text-5xl mt-4 italic" style={{fontVariationSettings:"'opsz' 144"}}>sin θ<sub className="text-2xl">c</sub></div>
      <div className="font-mono text-3xl mt-2">= n<sub>gem</sub> / n<sub>prism</sub></div>
      <p className="text-cyan-50 text-sm mt-6 leading-relaxed">
        观察到的明暗分界线对应的刻度值 = 宝石折射率
      </p>
      <div className="mt-6 pt-6 border-t border-white/20">
        <div className="flex justify-between text-xs font-mono">
          <span className="text-cyan-100">棱镜 RI</span><span>1.86</span>
        </div>
        <div className="flex justify-between text-xs font-mono mt-1">
          <span className="text-cyan-100">接触液 RI</span><span>1.81</span>
        </div>
        <div className="flex justify-between text-xs font-mono mt-1">
          <span className="text-cyan-100">光源 λ</span><span>589.3 nm</span>
        </div>
      </div>
    </div>
  </div>
);

const StructureTab = () => (
  <div className="bg-white rounded-2xl p-8 ring-1 ring-blue-100 anim-fade">
    <div className="grid grid-cols-[1.2fr_1fr] gap-10">
      <div className="relative">
        <RefractometerFullDiagram labels={true}/>
      </div>
      <div>
        <div className="text-blue-600 text-xs font-mono tracking-wider uppercase">Component Breakdown</div>
        <h3 className="font-display text-2xl text-slate-900 mt-2">核心部件</h3>
        <div className="mt-6 space-y-3">
          {[
            {n:'①',t:'目镜',d:'观察内置刻度与临界分界线;可调节屈光度'},
            {n:'②',t:'金属保护盖',d:'使用时掀开,保护棱镜免受污染/划伤'},
            {n:'③',t:'高折射率棱镜',d:'通常 n≈1.87 的重火石玻璃,样品直接放置其上'},
            {n:'④',t:'接触液滴点',d:'滴加 n=1.81 的接触液以消除气隙,保证光学耦合'},
            {n:'⑤',t:'刻度窗口',d:'显示 1.30-1.81 范围的 RI 读数'},
            {n:'⑥',t:'内置光源',d:'钠光灯(589.3nm)或白光 LED + 滤光片'},
          ].map((x,i)=>(
            <div key={i} className="flex gap-4 p-3 rounded-lg hover:bg-blue-50/50 transition anim-slide" style={{animationDelay:`${i*0.06}s`}}>
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-mono text-sm shrink-0">{x.n}</div>
              <div>
                <div className="text-slate-900 font-medium">{x.t}</div>
                <div className="text-slate-600 text-sm mt-0.5">{x.d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const SopTab = ({ go }) => (
  <div className="anim-fade">
    <div className="grid grid-cols-4 gap-4">
      {[
        {n:1,t:'准备检查',d:'确认棱镜清洁;打开仪器光源;静置预热 30 秒'},
        {n:2,t:'滴加接触液',d:'金属盖掀开,在棱镜中心滴一滴接触液(直径约 2mm)'},
        {n:3,t:'放置样品',d:'抛光面朝下,轻放于接触液上;确保充分接触,无气泡'},
        {n:4,t:'首次读数',d:'通过目镜观察分界线;记录此位置的 RI 值'},
        {n:5,t:'旋转复测',d:'每旋转 60°/90° 读取一次,共取 6-8 组数据'},
        {n:6,t:'判别光性',d:'有 2 组明暗线 = 双折射;仅 1 组 = 均质体'},
        {n:7,t:'计算 DR',d:'双折射宝石:|RI_max - RI_min| = 双折射率'},
        {n:8,t:'清洁收纳',d:'软布蘸酒精擦拭棱镜与样品;合上保护盖'},
      ].map((s,i)=>(
        <div key={i} className="relative bg-white rounded-xl p-5 ring-1 ring-blue-100 hover:ring-blue-300 hover:-translate-y-0.5 transition-all anim-fade" style={{animationDelay:`${i*0.05}s`}}>
          <div className="flex items-center justify-between">
            <div className="font-display text-4xl italic text-blue-600/30" style={{fontVariationSettings:"'opsz' 144"}}>0{s.n}</div>
            <div className="w-2 h-2 rounded-full bg-blue-400"></div>
          </div>
          <div className="mt-2 font-medium text-slate-900">{s.t}</div>
          <div className="mt-2 text-sm text-slate-600 leading-relaxed">{s.d}</div>
        </div>
      ))}
    </div>
    <div className="mt-8 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-6 flex items-center justify-between text-white">
      <div>
        <div className="text-cyan-100 text-xs font-mono tracking-wider uppercase">Ready to practice?</div>
        <div className="font-display text-2xl mt-1 italic" style={{fontVariationSettings:"'opsz' 144"}}>亲手操作一次完整流程</div>
      </div>
      <button onClick={()=>go('refractometer-demo')} className="px-6 py-3 rounded-xl bg-white text-blue-700 font-medium hover:shadow-xl transition-all flex items-center gap-2">
        <span>启动交互演示</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>
  </div>
);

// 折射仪详细图示(含标注选项)
const RefractometerFullDiagram = ({ labels }) => (
  <svg viewBox="0 0 500 360" className="w-full h-auto">
    <defs>
      <linearGradient id="body-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#475569"/>
        <stop offset="1" stopColor="#1e293b"/>
      </linearGradient>
      <linearGradient id="top-g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#64748b"/>
        <stop offset="1" stopColor="#334155"/>
      </linearGradient>
      <radialGradient id="prism-g" cx="0.5" cy="0.3" r="0.7">
        <stop offset="0" stopColor="#e0f2fe"/>
        <stop offset="0.5" stopColor="#7dd3fc"/>
        <stop offset="1" stopColor="#0c4a6e"/>
      </radialGradient>
    </defs>

    {/* 阴影 */}
    <ellipse cx="250" cy="330" rx="200" ry="10" fill="#000" opacity="0.08"/>

    {/* 主体 */}
    <rect x="60" y="170" width="380" height="150" rx="10" fill="url(#body-g)" stroke="#0f172a" strokeWidth="1.5"/>
    {/* 顶盖平台 */}
    <rect x="60" y="150" width="380" height="28" rx="6" fill="url(#top-g)"/>
    {/* 棱镜槽 */}
    <rect x="150" y="145" width="160" height="12" rx="2" fill="#0f172a"/>
    {/* 棱镜(打开状态) */}
    <rect x="160" y="138" width="140" height="14" rx="1" fill="url(#prism-g)" stroke="#0c4a6e" strokeWidth="0.5"/>
    {/* 接触液滴 */}
    <ellipse cx="230" cy="138" rx="10" ry="3" fill="#67e8f9" opacity="0.7"/>
    {/* 金属保护盖(半开) */}
    <path d="M 150 155 L 310 155 L 310 153 L 155 145 Z" fill="#9ca3af" stroke="#6b7280" strokeWidth="0.5"/>
    <path d="M 310 155 L 310 153 L 155 145 L 155 147 Z" fill="#6b7280"/>

    {/* 目镜筒 */}
    <g transform="rotate(-20 350 100)">
      <rect x="300" y="80" width="120" height="28" rx="6" fill="url(#body-g)"/>
      <rect x="395" y="75" width="35" height="40" rx="4" fill="#1e293b"/>
      <circle cx="412" cy="95" r="12" fill="#0a1628"/>
      <circle cx="412" cy="95" r="8" fill="#1e3a5f"/>
      <circle cx="410" cy="93" r="3" fill="#67d4f0" opacity="0.6"/>
    </g>

    {/* 刻度窗口 */}
    <rect x="95" y="220" width="110" height="50" rx="4" fill="#0a1628" stroke="#1e3a5f"/>
    <text x="150" y="240" fontSize="10" fill="#67d4f0" textAnchor="middle" fontFamily="monospace">RI SCALE</text>
    <line x1="105" y1="250" x2="195" y2="250" stroke="#22d3ee" strokeWidth="0.5" opacity="0.4"/>
    {[1.40,1.50,1.60,1.70,1.80].map((v,i)=>(
      <g key={i}>
        <line x1={108+i*22} y1="248" x2={108+i*22} y2="256" stroke="#67d4f0" strokeWidth="0.5"/>
        <text x={108+i*22} y="266" fontSize="6" fill="#67d4f0" textAnchor="middle" fontFamily="monospace">{v}</text>
      </g>
    ))}

    {/* 操作面板 */}
    <rect x="240" y="220" width="80" height="30" rx="3" fill="#0f172a"/>
    <circle cx="260" cy="235" r="5" fill="#22c55e"/>
    <text x="280" y="239" fontSize="8" fill="#94a3b8" fontFamily="monospace">ON</text>
    <rect x="340" y="220" width="80" height="30" rx="3" fill="#0f172a"/>
    <text x="380" y="239" fontSize="8" fill="#67d4f0" textAnchor="middle" fontFamily="monospace">FABLE FGR-2</text>

    {/* 底部标签栏 */}
    <rect x="80" y="285" width="340" height="20" rx="3" fill="#0f172a"/>
    <text x="250" y="298" fontSize="8" fill="#64748b" textAnchor="middle" fontFamily="monospace">λ = 589.3 nm · Na-D · CONTACT LIQUID n=1.81</text>

    {/* 标注线 */}
    {labels && (
      <g fontFamily="monospace" fontSize="10">
        <g>
          <line x1="412" y1="95" x2="470" y2="70" stroke="#2563eb" strokeWidth="1"/>
          <circle cx="412" cy="95" r="3" fill="#2563eb"/>
          <circle cx="470" cy="70" r="12" fill="#dbeafe" stroke="#2563eb"/>
          <text x="470" y="74" textAnchor="middle" fill="#1e40af">①</text>
        </g>
        <g>
          <line x1="155" y1="150" x2="60" y2="100" stroke="#2563eb" strokeWidth="1"/>
          <circle cx="155" cy="150" r="3" fill="#2563eb"/>
          <circle cx="50" cy="100" r="12" fill="#dbeafe" stroke="#2563eb"/>
          <text x="50" y="104" textAnchor="middle" fill="#1e40af">②</text>
        </g>
        <g>
          <line x1="230" y1="140" x2="230" y2="50" stroke="#2563eb" strokeWidth="1"/>
          <circle cx="230" cy="140" r="3" fill="#2563eb"/>
          <circle cx="230" cy="40" r="12" fill="#dbeafe" stroke="#2563eb"/>
          <text x="230" y="44" textAnchor="middle" fill="#1e40af">③</text>
        </g>
        <g>
          <line x1="230" y1="138" x2="150" y2="30" stroke="#2563eb" strokeWidth="1" strokeDasharray="3 2"/>
          <circle cx="150" cy="30" r="12" fill="#dbeafe" stroke="#2563eb"/>
          <text x="150" y="34" textAnchor="middle" fill="#1e40af">④</text>
        </g>
        <g>
          <line x1="150" y1="240" x2="40" y2="240" stroke="#2563eb" strokeWidth="1"/>
          <circle cx="150" cy="240" r="3" fill="#2563eb"/>
          <circle cx="30" cy="240" r="12" fill="#dbeafe" stroke="#2563eb"/>
          <text x="30" y="244" textAnchor="middle" fill="#1e40af">⑤</text>
        </g>
        <g>
          <line x1="395" y1="280" x2="470" y2="280" stroke="#2563eb" strokeWidth="1"/>
          <circle cx="395" cy="280" r="3" fill="#2563eb"/>
          <circle cx="480" cy="280" r="12" fill="#dbeafe" stroke="#2563eb"/>
          <text x="480" y="284" textAnchor="middle" fill="#1e40af">⑥</text>
        </g>
      </g>
    )}
  </svg>
);

// ============================================================
// 折射仪交互演示(核心 · 高仿真)
// ============================================================
const REFRACTOMETER_STEPS = [
  { id:1, key:'power',   title:'打开光源',     hint:'点击仪器右侧电源按钮,启动内置钠光灯', tool:'power' },
  { id:2, key:'cover',   title:'掀开保护盖',   hint:'推开金属盖,露出棱镜台面', tool:'cover' },
  { id:3, key:'clean',   title:'清洁棱镜',     hint:'使用软布擦拭棱镜表面,确保无污渍', tool:'cloth' },
  { id:4, key:'liquid',  title:'滴加接触液',   hint:'用滴管在棱镜中心滴一滴接触液 (n=1.81)', tool:'dropper' },
  { id:5, key:'sample',  title:'放置样品',     hint:'将样品抛光面朝下,轻放于接触液上', tool:'sample' },
  { id:6, key:'observe1',title:'首次读数',     hint:'通过目镜观察分界线并记录 RI 值', tool:'eye' },
  { id:7, key:'rotate',  title:'旋转 90° 复测', hint:'旋转样品 90°,观察 RI 变化,判断光性特征', tool:'rotate' },
  { id:8, key:'conclude',title:'得出结论',     hint:'综合读数:均质体 / 一轴晶 / 二轴晶', tool:'done' },
];

const RefractometerDemo = ({ go, mode='learn', sampleId=null, onRecord=null }) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [powerOn, setPowerOn] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [clean, setClean] = useState(false);
  const [liquidDropped, setLiquidDropped] = useState(false);
  const [samplePlaced, setSamplePlaced] = useState(false);
  const [rotated, setRotated] = useState(false);
  const [showEyepiece, setShowEyepiece] = useState(false);
  const [readings, setReadings] = useState([]); // {angle, ri1, ri2}
  const [currentAngle, setCurrentAngle] = useState(0);
  const [showHint, setShowHint] = useState(true);

  // 根据样品选择显示的 RI
  const gem = useMemo(()=>{
    if (mode==='detection' && sampleId) return GEM_DATABASE.find(g=>g.id===sampleId);
    // 学习模式默认使用红宝石作为演示
    return GEM_DATABASE.find(g=>g.id==='ruby');
  }, [sampleId, mode]);

  const currentStep = REFRACTOMETER_STEPS[stepIdx];

  const advanceStep = () => {
    if (stepIdx < REFRACTOMETER_STEPS.length - 1) setStepIdx(stepIdx+1);
  };

  const handlePower = () => {
    if (stepIdx===0) { setPowerOn(true); advanceStep(); }
    else setPowerOn(!powerOn);
  };

  const handleCover = () => {
    if (stepIdx===1 && powerOn) { setCoverOpen(true); advanceStep(); }
  };

  const handleClean = () => {
    if (stepIdx===2 && coverOpen) { setClean(true); advanceStep(); }
  };

  const handleDrop = () => {
    if (stepIdx===3 && clean) { setLiquidDropped(true); advanceStep(); }
  };

  const handlePlace = () => {
    if (stepIdx===4 && liquidDropped) { setSamplePlaced(true); advanceStep(); }
  };

  const handleEye = () => {
    if ((stepIdx===5 || stepIdx===6) && samplePlaced) {
      setShowEyepiece(true);
    }
  };

  const recordReading = () => {
    if (!gem) return;
    const [ri1, ri2] = Array.isArray(gem.RI) ? gem.RI : [gem.RI, null];
    setReadings(prev => [...prev, {
      angle: currentAngle,
      ri1: ri1 > 1.81 ? '超量程' : ri1.toFixed(3),
      ri2: ri2 ? (ri2>1.81?'超量程':ri2.toFixed(3)) : '—'
    }]);
    if (stepIdx===5) advanceStep();
  };

  const handleRotate = () => {
    if (stepIdx===6) {
      setRotated(true);
      setCurrentAngle(90);
    }
  };

  const finishObservation = () => {
    if (stepIdx===6 && rotated && readings.length>=2) advanceStep();
  };

  const handleComplete = () => {
    if (mode==='detection' && onRecord) {
      const [ri1, ri2] = Array.isArray(gem.RI) ? gem.RI : [gem.RI, null];
      onRecord({
        RI: ri2 ? `${ri1.toFixed(3)} – ${ri2.toFixed(3)}` : (ri1>1.81?'超量程':ri1.toFixed(3)),
        DR: gem.DR ? gem.DR.toFixed(3) : '0.000',
        type: gem.type
      });
    }
  };

  return (
    <div className="min-h-screen font-body" style={{background:'linear-gradient(180deg, #e0ecfe 0%, #f0f7ff 100%)'}}>
      <FontStyles/>

      {/* 顶部导航 + 进度 */}
      <div className="px-10 py-4 bg-white/80 backdrop-blur border-b border-blue-100 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <Crumb path={mode==='detection'?['检测模式','折射仪']:['折射仪','交互演示']} onHome={()=>go(mode==='detection'?'detection-mode':'workbench')}/>
          <div className="flex items-center gap-3">
            <button onClick={()=>setShowHint(!showHint)} className="px-3 py-1.5 rounded-md text-xs font-medium ring-1 ring-blue-200 text-blue-700 hover:bg-blue-50">
              {showHint?'隐藏引导':'显示引导'}
            </button>
            <button onClick={()=>{setStepIdx(0);setPowerOn(false);setCoverOpen(false);setClean(false);setLiquidDropped(false);setSamplePlaced(false);setRotated(false);setReadings([]);setCurrentAngle(0);setShowEyepiece(false);}} className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200">重置</button>
          </div>
        </div>
        {/* 步骤进度条 */}
        <div className="flex items-center gap-1">
          {REFRACTOMETER_STEPS.map((s,i)=>(
            <React.Fragment key={s.id}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${
                i===stepIdx?'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-md':
                i<stepIdx?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-400'
              }`}>
                <span className="text-[10px] font-mono w-4 text-center">{i<stepIdx?'✓':s.id}</span>
                <span className="text-[11px] font-medium whitespace-nowrap">{s.title}</span>
              </div>
              {i<REFRACTOMETER_STEPS.length-1 && <div className={`h-px w-2 ${i<stepIdx?'bg-emerald-300':'bg-slate-200'}`}></div>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-10 py-8 grid grid-cols-[1fr_380px] gap-6">
        {/* 左:主交互区 */}
        <div className="space-y-4">
          {/* 当前步骤引导 */}
          {showHint && (
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-2xl p-5 text-white anim-fade">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-mono text-sm shrink-0">{stepIdx+1}/8</div>
                <div className="flex-1">
                  <div className="text-cyan-100 text-xs font-mono tracking-wider uppercase">Step {currentStep.id} · {currentStep.key}</div>
                  <div className="font-display text-xl mt-1">{currentStep.title}</div>
                  <div className="text-cyan-50 text-sm mt-1">{currentStep.hint}</div>
                </div>
              </div>
            </div>
          )}

          {/* 仪器主视图 */}
          <div className="relative bg-white rounded-3xl p-8 ring-1 ring-blue-100 shadow-xl shadow-blue-500/5 min-h-[460px]">
            {/* 环境 */}
            <div className="absolute top-4 left-4 text-[10px] font-mono text-slate-400 tracking-wider">BENCH VIEW · LIVE</div>
            <div className="absolute top-4 right-4 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${powerOn?'bg-emerald-500 anim-pulse':'bg-slate-300'}`}></span>
              <span className="text-[10px] font-mono text-slate-500">{powerOn?'POWERED':'OFFLINE'}</span>
            </div>

            <div className="relative h-[400px] flex items-center justify-center">
              <InteractiveRefractometer
                powerOn={powerOn}
                coverOpen={coverOpen}
                clean={clean}
                liquidDropped={liquidDropped}
                samplePlaced={samplePlaced}
                rotated={rotated}
                currentAngle={currentAngle}
                gem={gem}
                stepIdx={stepIdx}
                onPower={handlePower}
                onCover={handleCover}
                onClean={handleClean}
                onDrop={handleDrop}
                onPlace={handlePlace}
                onEye={handleEye}
                onRotate={handleRotate}
              />
            </div>
          </div>
        </div>

        {/* 右:工具栏 + 读数 */}
        <div className="space-y-4">
          {/* 工具选择 */}
          <div className="bg-white rounded-2xl p-5 ring-1 ring-blue-100">
            <div className="text-xs font-mono text-blue-600 tracking-wider uppercase mb-3">Tools</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                {k:'power',   label:'电源',   icon:'⏻', active:stepIdx===0, fn:handlePower},
                {k:'cover',   label:'开盖',   icon:'▤', active:stepIdx===1, fn:handleCover},
                {k:'cloth',   label:'清洁布', icon:'□', active:stepIdx===2, fn:handleClean},
                {k:'dropper', label:'滴管',   icon:'⋎', active:stepIdx===3, fn:handleDrop},
                {k:'sample',  label:'样品',   icon:'◆', active:stepIdx===4, fn:handlePlace},
                {k:'eye',     label:'目镜',   icon:'◉', active:stepIdx===5||stepIdx===6, fn:handleEye},
              ].map(t=>(
                <button key={t.k}
                  onClick={t.fn}
                  disabled={!t.active}
                  className={`p-3 rounded-xl text-center transition-all ${
                    t.active?'bg-gradient-to-br from-blue-50 to-cyan-50 ring-2 ring-blue-400 text-blue-700 hover:shadow-md cursor-pointer':
                             'bg-slate-50 ring-1 ring-slate-200 text-slate-300 cursor-not-allowed'
                  }`}>
                  <div className="text-2xl">{t.icon}</div>
                  <div className="text-[10px] mt-1 font-medium">{t.label}</div>
                  {t.active && <div className="mt-1 w-1 h-1 bg-blue-500 rounded-full mx-auto anim-pulse"></div>}
                </button>
              ))}
            </div>
          </div>

          {/* 样品信息 */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white">
            <div className="text-xs font-mono text-cyan-300 tracking-wider uppercase mb-3">Sample</div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{background:`radial-gradient(circle at 30% 30%, ${gem?.color || '#fff'}, #0a1628)`, boxShadow:`0 0 20px ${gem?.color||'#67d4f0'}40`}}>
                {gem?.emoji || '◆'}
              </div>
              <div>
                <div className="font-display text-xl">{mode==='detection' ? '未知样品 #A' : gem?.name}</div>
                <div className="text-slate-400 text-xs font-mono mt-0.5">
                  {mode==='detection' ? '待测定 · TO BE IDENTIFIED' : gem?.en}
                </div>
              </div>
            </div>
          </div>

          {/* 读数记录 */}
          <div className="bg-white rounded-2xl p-5 ring-1 ring-blue-100">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-mono text-blue-600 tracking-wider uppercase">Readings</div>
              <span className="text-[10px] text-slate-400 font-mono">{readings.length}/2</span>
            </div>
            {readings.length===0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                暂无记录 · 通过目镜观察后记录
              </div>
            ) : (
              <div className="space-y-2">
                {readings.map((r,i)=>(
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-blue-50 anim-slide">
                    <div className="text-xs font-mono text-blue-700">#{i+1} · {r.angle}°</div>
                    <div className="font-mono text-sm text-slate-900">{r.ri1} / {r.ri2}</div>
                  </div>
                ))}
              </div>
            )}
            {readings.length>=2 && stepIdx<=6 && (
              <button onClick={finishObservation} className="mt-3 w-full py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-medium hover:shadow-md transition">
                数据充足 → 得出结论
              </button>
            )}
          </div>

          {/* 结论面板 */}
          {stepIdx===7 && (
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white anim-drop">
              <div className="text-xs font-mono text-emerald-100 tracking-wider uppercase">Conclusion</div>
              <div className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-emerald-100">RI 范围</span><span className="font-mono">{Array.isArray(gem.RI)?`${gem.RI[0]}-${gem.RI[1]}`:gem.RI}</span></div>
                <div className="flex justify-between"><span className="text-emerald-100">双折射率 DR</span><span className="font-mono">{gem.DR.toFixed(3)}</span></div>
                <div className="flex justify-between"><span className="text-emerald-100">光性特征</span><span className="font-mono">{gem.type}</span></div>
              </div>
              {mode==='detection' ? (
                <button onClick={()=>{handleComplete();go('detection-mode');}} className="mt-4 w-full py-2.5 rounded-lg bg-white text-emerald-700 text-sm font-medium hover:shadow-lg transition">
                  保存结果 → 返回检测台
                </button>
              ) : (
                <button onClick={()=>go('workbench')} className="mt-4 w-full py-2.5 rounded-lg bg-white text-emerald-700 text-sm font-medium hover:shadow-lg transition">
                  完成学习 → 返回工作台
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 目镜弹窗 */}
      {showEyepiece && <EyepieceModal gem={gem} rotated={rotated} onClose={()=>setShowEyepiece(false)} onRecord={recordReading} canRecord={samplePlaced && (stepIdx===5 || (stepIdx===6 && rotated))}/>}
    </div>
  );
};

// 可交互的折射仪主体
const InteractiveRefractometer = ({ powerOn, coverOpen, clean, liquidDropped, samplePlaced, rotated, currentAngle, gem, stepIdx, onPower, onCover, onClean, onDrop, onPlace, onEye, onRotate }) => {
  return (
    <svg viewBox="0 0 600 380" className="w-full h-auto max-h-[420px]">
      <defs>
        <linearGradient id="ibody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#64748b"/>
          <stop offset="0.5" stopColor="#475569"/>
          <stop offset="1" stopColor="#1e293b"/>
        </linearGradient>
        <linearGradient id="itop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#94a3b8"/>
          <stop offset="1" stopColor="#475569"/>
        </linearGradient>
        <radialGradient id="iprism" cx="0.5" cy="0.3" r="0.7">
          <stop offset="0" stopColor="#e0f2fe"/>
          <stop offset="0.5" stopColor="#7dd3fc"/>
          <stop offset="1" stopColor="#0c4a6e"/>
        </radialGradient>
        <radialGradient id="glow-on" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fef3c7" stopOpacity="0.9"/>
          <stop offset="1" stopColor="#fbbf24" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* 桌面阴影 */}
      <ellipse cx="300" cy="350" rx="250" ry="10" fill="#000" opacity="0.1"/>

      {/* 光源辉光 */}
      {powerOn && (
        <circle cx="500" cy="230" r="40" fill="url(#glow-on)">
          <animate attributeName="r" values="35;45;35" dur="2.5s" repeatCount="indefinite"/>
        </circle>
      )}

      {/* 主体 */}
      <rect x="80" y="180" width="440" height="170" rx="12" fill="url(#ibody)" stroke="#0f172a" strokeWidth="1.5"/>

      {/* 顶部平台 */}
      <rect x="80" y="160" width="440" height="28" rx="6" fill="url(#itop)"/>

      {/* 棱镜槽基座 */}
      <rect x="180" y="155" width="200" height="12" rx="2" fill="#0f172a"/>
      {/* 棱镜 */}
      <rect x="190" y="148" width="180" height="14" rx="1" fill="url(#iprism)" stroke="#0c4a6e" strokeWidth="0.5"/>

      {/* 清洁高亮 */}
      {!clean && coverOpen && stepIdx===2 && (
        <rect x="190" y="148" width="180" height="14" rx="1" fill="#fbbf24" opacity="0.2">
          <animate attributeName="opacity" values="0.1;0.4;0.1" dur="1.5s" repeatCount="indefinite"/>
        </rect>
      )}

      {/* 接触液滴 */}
      {liquidDropped && (
        <g className="anim-drop">
          <ellipse cx="280" cy="148" rx="14" ry="4" fill="#67e8f9" opacity="0.7"/>
          <ellipse cx="280" cy="147" rx="10" ry="2" fill="#a5f3fc" opacity="0.9"/>
        </g>
      )}

      {/* 样品 */}
      {samplePlaced && gem && (
        <g className="anim-drop" transform={`rotate(${currentAngle} 280 140)`}>
          <rect x="265" y="128" width="30" height="20" rx="2" fill={gem.color} stroke="#0f172a" strokeWidth="0.8" opacity="0.95"/>
          <rect x="268" y="130" width="24" height="4" rx="1" fill="#fff" opacity="0.3"/>
        </g>
      )}

      {/* 金属保护盖 */}
      <g transform={coverOpen?'rotate(-80 160 155)':'rotate(0 160 155)'} style={{transformOrigin:'160px 155px', transition:'transform 0.8s cubic-bezier(0.4,0,0.2,1)'}}>
        <path d="M 180 155 L 380 155 L 380 151 L 185 147 Z" fill="#9ca3af" stroke="#6b7280" strokeWidth="0.8"/>
        <path d="M 380 155 L 380 151 L 185 147 L 185 151 Z" fill="#6b7280"/>
        <circle cx="200" cy="152" r="1.5" fill="#4b5563"/>
        <circle cx="360" cy="152" r="1.5" fill="#4b5563"/>
      </g>

      {/* 目镜筒 */}
      <g transform="rotate(-18 420 110)">
        <rect x="360" y="90" width="140" height="32" rx="6" fill="url(#ibody)"/>
        <rect x="470" y="85" width="40" height="42" rx="5" fill="#1e293b"/>
        <circle cx="490" cy="106" r="14" fill="#0a1628"/>
        <circle cx="490" cy="106" r="10" fill={powerOn?"#1e3a5f":"#0f172a"}/>
        {powerOn && <circle cx="488" cy="104" r="3" fill="#67d4f0" opacity="0.8"/>}
      </g>

      {/* 显示窗 */}
      <rect x="110" y="230" width="140" height="60" rx="4" fill="#0a1628" stroke="#1e3a5f" strokeWidth="1"/>
      <text x="180" y="250" fontSize="9" fill="#67d4f0" textAnchor="middle" fontFamily="monospace">RI · INTERNAL SCALE</text>
      {powerOn && (
        <>
          <line x1="120" y1="265" x2="240" y2="265" stroke="#22d3ee" strokeWidth="0.5" opacity="0.5"/>
          {[1.40,1.50,1.60,1.70,1.80].map((v,i)=>(
            <g key={i}>
              <line x1={122+i*29} y1="262" x2={122+i*29} y2="270" stroke="#67d4f0" strokeWidth="0.5"/>
              <text x={122+i*29} y="282" fontSize="7" fill="#67d4f0" textAnchor="middle" fontFamily="monospace">{v}</text>
            </g>
          ))}
        </>
      )}

      {/* 电源按钮 */}
      <g onClick={onPower} style={{cursor: stepIdx===0?'pointer':'default'}}>
        <rect x="470" y="230" width="50" height="50" rx="6" fill="#0f172a" stroke={stepIdx===0?"#22d3ee":"#1e293b"} strokeWidth={stepIdx===0?"2":"1"}>
          {stepIdx===0 && <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="1.5s" repeatCount="indefinite"/>}
        </rect>
        <circle cx="495" cy="255" r="10" fill={powerOn?"#22c55e":"#334155"}/>
        <text x="495" y="259" fontSize="11" fill={powerOn?"#052e16":"#64748b"} textAnchor="middle" fontFamily="monospace">⏻</text>
      </g>

      {/* 品牌标 */}
      <text x="300" y="330" fontSize="10" fill="#67d4f0" textAnchor="middle" fontFamily="monospace" opacity="0.7">FABLE · FGR-2 · 589.3 nm</text>

      {/* 交互热区提示 */}
      {stepIdx===1 && powerOn && (
        <g onClick={onCover} style={{cursor:'pointer'}}>
          <circle cx="280" cy="155" r="30" fill="#22d3ee" fillOpacity="0.1" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4 3">
            <animate attributeName="r" values="25;35;25" dur="1.8s" repeatCount="indefinite"/>
          </circle>
          <text x="280" y="125" fontSize="11" fill="#0891b2" textAnchor="middle" fontFamily="monospace" fontWeight="bold">掀开保护盖 ↑</text>
        </g>
      )}

      {stepIdx===2 && coverOpen && (
        <g onClick={onClean} style={{cursor:'pointer'}}>
          <rect x="180" y="138" width="200" height="30" rx="3" fill="#22d3ee" fillOpacity="0.15" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4 3"/>
          <text x="280" y="115" fontSize="11" fill="#0891b2" textAnchor="middle" fontFamily="monospace" fontWeight="bold">擦拭棱镜 →</text>
        </g>
      )}

      {stepIdx===3 && clean && (
        <g onClick={onDrop} style={{cursor:'pointer'}}>
          <circle cx="280" cy="148" r="25" fill="#22d3ee" fillOpacity="0.15" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4 3">
            <animate attributeName="r" values="20;28;20" dur="1.5s" repeatCount="indefinite"/>
          </circle>
          <text x="280" y="100" fontSize="11" fill="#0891b2" textAnchor="middle" fontFamily="monospace" fontWeight="bold">滴加接触液 ↓</text>
          {/* 滴管动画 */}
          <g transform="translate(280, 80)">
            <rect x="-4" y="-30" width="8" height="35" rx="2" fill="#64748b"/>
            <rect x="-6" y="-35" width="12" height="6" rx="2" fill="#334155"/>
          </g>
        </g>
      )}

      {stepIdx===4 && liquidDropped && (
        <g onClick={onPlace} style={{cursor:'pointer'}}>
          <rect x="250" y="120" width="60" height="30" rx="3" fill="#22d3ee" fillOpacity="0.15" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4 3"/>
          <text x="280" y="105" fontSize="11" fill="#0891b2" textAnchor="middle" fontFamily="monospace" fontWeight="bold">放置样品 →</text>
        </g>
      )}

      {(stepIdx===5 || stepIdx===6) && samplePlaced && (
        <g onClick={onEye} style={{cursor:'pointer'}}>
          <circle cx="490" cy="106" r="25" fill="#22d3ee" fillOpacity="0.15" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4 3">
            <animate attributeName="r" values="20;28;20" dur="1.5s" repeatCount="indefinite"/>
          </circle>
          <text x="490" y="60" fontSize="11" fill="#0891b2" textAnchor="middle" fontFamily="monospace" fontWeight="bold">观察目镜 ◉</text>
        </g>
      )}

      {stepIdx===6 && samplePlaced && !rotated && (
        <g onClick={onRotate} style={{cursor:'pointer'}} transform="translate(280, 190)">
          <circle r="22" fill="#fbbf24" fillOpacity="0.2" stroke="#f59e0b" strokeWidth="2" strokeDasharray="3 2"/>
          <path d="M -12 -3 A 12 12 0 1 1 -3 12" stroke="#d97706" strokeWidth="2" fill="none"/>
          <polygon points="-5,14 -1,10 -5,8" fill="#d97706"/>
          <text y="40" fontSize="11" fill="#d97706" textAnchor="middle" fontFamily="monospace" fontWeight="bold">旋转 90°</text>
        </g>
      )}
    </svg>
  );
};

// 目镜观察弹窗
const EyepieceModal = ({ gem, rotated, onClose, onRecord, canRecord }) => {
  const [ri1, ri2] = Array.isArray(gem.RI) ? gem.RI : [gem.RI, null];
  // 根据是否旋转决定显示哪条线
  const line1Visible = !rotated;
  const line2Visible = rotated && ri2;
  const displayRi = rotated ? ri2 : ri1;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-10 anim-fade">
      <div className="relative anim-drop">
        {/* 圆形目镜视图 */}
        <div className="w-[500px] h-[500px] rounded-full relative overflow-hidden shadow-2xl" style={{background:'radial-gradient(circle at 50% 50%, #0a1628 0%, #000 70%)', border:'16px solid #1e293b'}}>
          {/* 刻度背景 */}
          <svg viewBox="0 0 500 500" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id="gradLight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#67d4f0" stopOpacity="0.9"/>
                <stop offset="1" stopColor="#0c4a6e" stopOpacity="0.3"/>
              </linearGradient>
              <linearGradient id="gradDark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#0a1628" stopOpacity="0.95"/>
                <stop offset="1" stopColor="#0a1628" stopOpacity="0.6"/>
              </linearGradient>
            </defs>

            {/* 刻度条 */}
            <rect x="80" y="100" width="340" height="300" fill="url(#gradDark)" opacity="0.3"/>

            {/* 上半(全反射亮区) */}
            {(()=>{
              // RI 范围 1.30 - 1.81 映射到 Y 100-400
              const mapY = (v) => 100 + ((v - 1.30) / (1.81 - 1.30)) * 300;
              const y1 = mapY(ri1);
              const y2 = ri2 ? mapY(ri2) : null;
              return (
                <>
                  {/* 亮区 */}
                  <rect x="80" y={line1Visible?y1:(line2Visible?y2:y1)} width="340" height={400-(line1Visible?y1:(line2Visible?y2:y1))} fill="url(#gradLight)" opacity="0.55"/>
                  {/* 分界线 */}
                  {line1Visible && (
                    <>
                      <line x1="80" y1={y1} x2="420" y2={y1} stroke="#67d4f0" strokeWidth="2.5" opacity="0.9"/>
                      <text x="430" y={y1+4} fontSize="13" fill="#67d4f0" fontFamily="monospace">{ri1.toFixed(3)}</text>
                    </>
                  )}
                  {line2Visible && (
                    <>
                      <line x1="80" y1={y2} x2="420" y2={y2} stroke="#fbbf24" strokeWidth="2.5" opacity="0.9" strokeDasharray="5 2"/>
                      <text x="430" y={y2+4} fontSize="13" fill="#fbbf24" fontFamily="monospace">{ri2.toFixed(3)}</text>
                    </>
                  )}
                </>
              );
            })()}

            {/* RI 刻度 */}
            {[1.30, 1.40, 1.50, 1.60, 1.70, 1.80].map((v,i)=>{
              const y = 100 + ((v - 1.30) / (1.81 - 1.30)) * 300;
              return (
                <g key={i}>
                  <line x1="76" y1={y} x2="84" y2={y} stroke="#94a3b8" strokeWidth="1"/>
                  <text x="70" y={y+3} fontSize="10" fill="#94a3b8" textAnchor="end" fontFamily="monospace">{v.toFixed(2)}</text>
                  {[0.02,0.04,0.06,0.08].map((sub,j)=>{
                    const ySub = 100 + ((v + sub - 1.30) / (1.81 - 1.30)) * 300;
                    return ySub<400 && <line key={j} x1="78" y1={ySub} x2="82" y2={ySub} stroke="#64748b" strokeWidth="0.5"/>;
                  })}
                </g>
              );
            })}

            {/* 十字准线 */}
            <line x1="250" y1="100" x2="250" y2="400" stroke="#67d4f0" strokeWidth="0.5" opacity="0.3" strokeDasharray="3 4"/>
          </svg>

          {/* 顶部/底部提示 */}
          <div className="absolute top-8 left-1/2 -translate-x-1/2 text-cyan-300/80 text-[10px] font-mono tracking-[0.3em] uppercase">Eyepiece View</div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-cyan-300/60 text-[10px] font-mono">{rotated?'Position @ 90°':'Position @ 0°'} · Na-D</div>
        </div>

        {/* 控制按钮 */}
        <div className="absolute -right-64 top-1/2 -translate-y-1/2 w-56 space-y-3">
          <div className="bg-white rounded-xl p-4 ring-1 ring-blue-100">
            <div className="text-[10px] font-mono text-blue-600 uppercase tracking-wider mb-2">当前读数</div>
            <div className="font-mono text-2xl text-slate-900">{displayRi?.toFixed(3)}</div>
            <div className="text-xs text-slate-500 mt-1">{rotated?'旋转后':'初始位置'}</div>
          </div>
          {canRecord && (
            <button onClick={()=>{onRecord();onClose();}} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:shadow-lg transition">
              记录此读数
            </button>
          )}
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm hover:bg-slate-200 transition">
            关闭目镜
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 偏光镜 & 分光镜(简化版演示页面)
// ============================================================
const SimpleKnowledge = ({ go, type }) => {
  const data = {
    polariscope: {
      title:'偏光镜', en:'Polariscope', idx:'02',
      desc:'通过两片正交偏振片判别宝石的光学均质性。在旋转样品 360° 过程中,均质体宝石保持全消光,非均质体则每 90° 出现明暗变化。',
      principle:'正交偏振 + 样品双折射',
      range:['判别均质 / 非均质','观察干涉图','识别多色性'],
      sop:['① 开启光源,调整上下偏振片至正交(视场最暗)','② 将宝石置于样品台中央','③ 缓慢旋转样品 360°,记录明暗变化','④ 四次明暗变化 = 双折射;始终全暗 = 均质']
    },
    spectroscope: {
      title:'分光镜', en:'Spectroscope', idx:'03',
      desc:'将白光通过宝石后分解为连续光谱,观察特征吸收线或吸收带。不同致色元素(Cr、Fe、Co 等)产生特定吸收光谱,是区分天然/合成宝石的关键工具。',
      principle:'色散 · 棱镜 / 光栅',
      range:['观察吸收光谱','判别致色元素','辅助宝石鉴定'],
      sop:['① 将宝石紧贴光源狭缝','② 调节目镜对焦至清晰连续光谱','③ 沿波长方向扫描,记录吸收线/带位置','④ 对照光谱图谱数据库比对']
    }
  }[type];

  return (
    <div className="min-h-screen font-body" style={{background:'linear-gradient(180deg, #f0f7ff 0%, #e0ecfe 100%)'}}>
      <FontStyles/>
      <div className="px-10 py-5 bg-white/70 backdrop-blur border-b border-blue-100 flex items-center justify-between sticky top-0 z-10">
        <Crumb path={[`${data.title} · ${data.en}`]} onHome={()=>go('workbench')}/>
        <button onClick={()=>go(`${type}-demo`)} className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-medium">启动交互演示 →</button>
      </div>

      <div className="max-w-[1400px] mx-auto px-10 py-10">
        <div className="grid grid-cols-[1.5fr_1fr] gap-10 items-center anim-fade">
          <div>
            <div className="text-blue-600 text-xs font-mono tracking-[0.3em] uppercase mb-3">{data.idx} · {data.en}</div>
            <h1 className="font-display text-6xl text-slate-900 leading-none" style={{fontVariationSettings:"'opsz' 144"}}>{data.title}</h1>
            <p className="text-slate-600 mt-5 leading-relaxed max-w-xl">{data.desc}</p>
            <div className="flex gap-2 mt-6">
              <Pill tone="blue">{data.principle}</Pill>
              <Pill tone="amber">飞博尔系列</Pill>
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-200/30 to-cyan-200/30 rounded-3xl blur-2xl"></div>
            <div className="relative bg-white rounded-3xl p-8 ring-1 ring-blue-100 shadow-xl shadow-blue-500/5 flex items-center justify-center h-80">
              {type==='polariscope' ? <PolariscopeIcon hovered={true}/> : <SpectroscopeIcon hovered={true}/>}
            </div>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 ring-1 ring-blue-100">
            <div className="text-xs text-blue-600 font-mono tracking-wider uppercase mb-3">核心用途</div>
            <ul className="space-y-2">
              {data.range.map((r,i)=><li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-blue-500">◆</span>{r}</li>)}
            </ul>
          </div>
          <div className="col-span-2 bg-white rounded-2xl p-6 ring-1 ring-blue-100">
            <div className="text-xs text-blue-600 font-mono tracking-wider uppercase mb-3">操作流程 SOP</div>
            <div className="grid grid-cols-2 gap-3">
              {data.sop.map((s,i)=>(
                <div key={i} className="p-3 rounded-lg bg-blue-50/50 text-sm text-slate-700">{s}</div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 p-8 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-center">
          <div className="text-cyan-300 text-xs font-mono tracking-wider uppercase">Demo Placeholder</div>
          <div className="font-display text-2xl text-white mt-2 italic">{data.title} 交互演示 · 简化版</div>
          <div className="text-slate-400 text-sm mt-2 max-w-2xl mx-auto">
            (此页为参考版式,真实项目中将按折射仪演示同等高保真度实现:可旋转样品、实时显示消光状态 / 光谱变化、步骤引导等)
          </div>
          <button onClick={()=>go(`${type}-demo`)} className="mt-5 px-6 py-2.5 rounded-lg bg-white text-slate-900 text-sm font-medium">进入简化演示</button>
        </div>
      </div>
    </div>
  );
};

// 简化版的 偏光镜/分光镜 演示
const SimpleDemo = ({ go, type, mode='learn', sampleId=null, onRecord=null }) => {
  const [rotation, setRotation] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const gem = useMemo(()=>{
    if (mode==='detection' && sampleId) return GEM_DATABASE.find(g=>g.id===sampleId);
    return GEM_DATABASE.find(g=>g.id==='ruby');
  },[sampleId,mode]);

  useEffect(()=>{
    if (animating) {
      const t = setInterval(()=>setRotation(r=>(r+3)%360), 30);
      return ()=>clearInterval(t);
    }
  },[animating]);

  // 偏光镜消光效果:非均质每 90° 一次明暗变化
  const isDark = gem && (gem.type==='均质' || Math.floor(rotation/90)%2===0);
  const intensity = gem?.type==='均质' ? 0.1 : 0.5 + 0.5*Math.abs(Math.cos(rotation*Math.PI/90));

  const record = () => {
    setRecorded(true);
    if (mode==='detection' && onRecord) {
      if (type==='polariscope') {
        onRecord({ extinction: gem.type==='均质'?'全暗(均质体)':'四明四暗(非均质体)' });
      } else {
        onRecord({ spectrum: gem.spectrum });
      }
    }
  };

  return (
    <div className="min-h-screen font-body" style={{background:'linear-gradient(180deg, #e0ecfe 0%, #f0f7ff 100%)'}}>
      <FontStyles/>
      <div className="px-10 py-5 bg-white/80 backdrop-blur border-b border-blue-100 sticky top-0 z-10 flex items-center justify-between">
        <Crumb path={mode==='detection'?['检测模式',type==='polariscope'?'偏光镜':'分光镜']:[type==='polariscope'?'偏光镜':'分光镜','交互演示']} onHome={()=>go(mode==='detection'?'detection-mode':'workbench')}/>
        <div className="text-xs text-slate-500 font-mono">简化演示 · SIMPLIFIED</div>
      </div>

      <div className="max-w-[1200px] mx-auto px-10 py-10 grid grid-cols-[1fr_340px] gap-6">
        <div className="bg-white rounded-3xl p-10 ring-1 ring-blue-100 shadow-xl shadow-blue-500/5 flex items-center justify-center min-h-[500px]">
          {type==='polariscope' ? (
            <div className="text-center">
              <div className="text-xs text-blue-600 font-mono tracking-wider uppercase mb-6">正交偏振视场 · 旋转观察</div>
              <div className="relative w-80 h-80 rounded-full flex items-center justify-center" style={{
                background:`radial-gradient(circle at 50% 50%, rgba(10,22,40,${1-intensity}) 0%, #000 100%)`,
                boxShadow:'inset 0 0 40px rgba(0,0,0,0.8), 0 0 40px rgba(103,212,240,0.2)'
              }}>
                <div className="absolute inset-4 rounded-full border border-cyan-400/20"></div>
                <div style={{transform:`rotate(${rotation}deg)`, transition:'transform 0.1s linear'}}>
                  <div className="w-24 h-24 rounded-lg" style={{background:`radial-gradient(circle at 30% 30%, ${gem?.color}, ${gem?.color}aa)`, opacity: gem?.type==='均质'?0.15:0.3+0.7*intensity, boxShadow:`0 0 30px ${gem?.color}`}}></div>
                </div>
                <div className="absolute top-6 left-1/2 -translate-x-1/2 text-cyan-300/60 text-[10px] font-mono">ROT · {rotation}°</div>
              </div>
              <div className="mt-6 text-sm text-slate-600">{gem?.type==='均质'?'始终全暗 → 判定为均质体':'明暗交替 → 判定为非均质体(双折射)'}</div>
            </div>
          ) : (
            <div className="text-center w-full">
              <div className="text-xs text-blue-600 font-mono tracking-wider uppercase mb-6">分光镜视场 · 特征吸收光谱</div>
              <div className="relative w-full max-w-lg mx-auto h-32 rounded-xl overflow-hidden" style={{background:'linear-gradient(90deg, #dc2626 0%, #f59e0b 18%, #eab308 35%, #10b981 55%, #3b82f6 75%, #7c3aed 100%)'}}>
                {/* 吸收线模拟 - 仅示例 */}
                {gem?.id==='ruby' && (
                  <>
                    <div className="absolute top-0 bottom-0 w-1 bg-black" style={{left:'3%'}} title="694nm"></div>
                    <div className="absolute top-0 bottom-0 w-0.5 bg-black/70" style={{left:'28%'}}></div>
                    <div className="absolute top-0 bottom-0 w-8 bg-black/30" style={{left:'40%'}}></div>
                  </>
                )}
                {gem?.id==='emerald' && (
                  <>
                    <div className="absolute top-0 bottom-0 w-1 bg-black" style={{left:'8%'}}></div>
                    <div className="absolute top-0 bottom-0 w-6 bg-black/40" style={{left:'50%'}}></div>
                  </>
                )}
                <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 text-[8px] font-mono text-white/80">
                  <span>700nm</span><span>600nm</span><span>500nm</span><span>400nm</span>
                </div>
              </div>
              <div className="mt-6 text-sm text-slate-600">{gem?.spectrum}</div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white">
            <div className="text-xs font-mono text-cyan-300 tracking-wider uppercase mb-3">Sample</div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{background:`radial-gradient(circle at 30% 30%, ${gem?.color}, #0a1628)`, boxShadow:`0 0 20px ${gem?.color}40`}}>{gem?.emoji}</div>
              <div>
                <div className="font-display text-xl">{mode==='detection' ? '未知样品 #A' : gem?.name}</div>
                <div className="text-slate-400 text-xs font-mono">{mode==='detection' ? '待测定' : gem?.en}</div>
              </div>
            </div>
          </div>

          {type==='polariscope' && (
            <div className="bg-white rounded-2xl p-5 ring-1 ring-blue-100 space-y-3">
              <div className="text-xs font-mono text-blue-600 tracking-wider uppercase">操作</div>
              <button onClick={()=>setAnimating(!animating)} className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium">
                {animating?'⏸ 暂停旋转':'▶ 开始旋转 360°'}
              </button>
              <div className="text-xs text-slate-500 text-center">当前角度 <span className="font-mono text-slate-700">{rotation}°</span></div>
            </div>
          )}

          <div className="bg-white rounded-2xl p-5 ring-1 ring-blue-100">
            <div className="text-xs font-mono text-blue-600 tracking-wider uppercase mb-2">观察结果</div>
            <div className="text-sm text-slate-700 leading-relaxed">
              {type==='polariscope'?(gem?.type==='均质'?'全暗,无明暗变化':'每 90° 出现一次明暗变化'):gem?.spectrum}
            </div>
            {!recorded ? (
              <button onClick={record} className="mt-3 w-full py-2.5 rounded-xl bg-blue-50 text-blue-700 font-medium text-sm hover:bg-blue-100 transition">记录现象</button>
            ) : (
              <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm text-center">✓ 已记录</div>
            )}
          </div>

          {recorded && mode==='detection' && (
            <button onClick={()=>go('detection-mode')} className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-medium">
              返回检测台 →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 样品选择 → 检测模式
// ============================================================
const SampleSelect = ({ go, setSample }) => {
  const [difficulty, setDifficulty] = useState(null);

  const draw = (level) => {
    const pool = GEM_DATABASE.filter(g=>g.difficulty===level);
    const chosen = pool[Math.floor(Math.random()*pool.length)];
    setSample(chosen);
    go('detection-mode');
  };

  return (
    <div className="min-h-screen font-body" style={{background:'radial-gradient(ellipse at 50% 0%, #1e3a5f 0%, #0f2545 40%, #0a1628 100%)'}}>
      <FontStyles/>
      <div className="px-10 py-6 flex items-center justify-between">
        <button onClick={()=>go('workbench')} className="text-cyan-300 text-sm hover:text-cyan-100 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          返回工作台
        </button>
        <div className="text-cyan-300/50 text-xs font-mono tracking-wider">SAMPLE DRAWER</div>
      </div>

      <div className="max-w-5xl mx-auto px-10 pt-16 pb-20">
        <div className="text-center anim-fade">
          <div className="text-amber-300 text-xs font-mono tracking-[0.3em] uppercase">Detection Mode</div>
          <h1 className="font-display text-6xl text-white mt-4" style={{fontVariationSettings:"'opsz' 144"}}>
            选择 <span className="italic text-amber-200">难度</span>
          </h1>
          <p className="text-slate-400 mt-4 max-w-xl mx-auto">根据你的掌握程度抽取一件未知样品。系统将随机从题库中挑选 — 你需要综合三台仪器的观察结果进行定名。</p>
        </div>

        <div className="grid grid-cols-3 gap-6 mt-16">
          {[
            {l:'易', title:'入门', en:'Beginner', color:'#10b981', desc:'常见单一特征宝石;现象明显',  stars:1},
            {l:'中', title:'进阶', en:'Intermediate', color:'#fbbf24', desc:'需要两项仪器交叉验证',  stars:2},
            {l:'高', title:'精通', en:'Advanced', color:'#f43f5e', desc:'相似光学特性宝石鉴别',  stars:3},
          ].map((d,i)=>(
            <button key={d.l} onClick={()=>draw(d.l)} className="group relative rounded-2xl p-[1px] anim-drop" style={{animationDelay:`${i*0.1}s`, background:`linear-gradient(135deg, ${d.color}60, transparent 60%)`}}>
              <div className="rounded-2xl bg-gradient-to-br from-[#162847] to-[#0a1628] p-8 h-full hover:from-[#1a2f52] transition-all text-left">
                <div className="flex items-start justify-between mb-6">
                  <div className="font-display text-5xl text-white italic" style={{fontVariationSettings:"'opsz' 144"}}>{d.title}</div>
                  <div className="text-xs font-mono" style={{color:d.color}}>{'★'.repeat(d.stars)}{'☆'.repeat(3-d.stars)}</div>
                </div>
                <div className="text-cyan-300/70 text-[10px] font-mono tracking-wider uppercase">{d.en}</div>
                <div className="text-slate-300 text-sm mt-3 leading-relaxed">{d.desc}</div>
                <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
                  <span className="text-slate-400 text-xs">题库</span>
                  <span className="font-mono text-white text-sm">{GEM_DATABASE.filter(g=>g.difficulty===d.l).length} 种</span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm group-hover:translate-x-1 transition-transform" style={{color:d.color}}>
                  <span>抽取样品</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const DetectionMode = ({ go, sample, evidence, setEvidence }) => {
  const done = evidence.refractometer && evidence.polariscope && evidence.spectroscope;

  return (
    <div className="min-h-screen font-body" style={{background:'linear-gradient(180deg, #0a1628 0%, #0f2545 100%)'}}>
      <FontStyles/>
      <div className="px-10 py-5 border-b border-white/10 flex items-center justify-between">
        <Crumb path={['检测模式']} onHome={()=>go('workbench')}/>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-400/30">
            <span className="text-amber-200 text-xs font-mono">未知样品 · {sample?.difficulty} 难度</span>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-10 py-10">
        <div className="grid grid-cols-[1fr_400px] gap-8">
          {/* 左:检测卡片 */}
          <div>
            <div className="text-amber-300 text-xs font-mono tracking-[0.3em] uppercase mb-3">Case File</div>
            <h1 className="font-display text-5xl text-white italic" style={{fontVariationSettings:"'opsz' 144"}}>未知样品 <span className="font-mono text-2xl text-slate-400 not-italic">#A-{Date.now().toString().slice(-4)}</span></h1>
            <p className="text-slate-400 mt-3">使用三台仪器分别检测,综合现象做出定名。</p>

            <div className="mt-8 space-y-4">
              {[
                {k:'refractometer', title:'折射仪检测', sub:'测定 RI / DR', icon:<RefractometerIcon hovered={false}/>},
                {k:'polariscope',   title:'偏光镜检测', sub:'判别光性特征', icon:<PolariscopeIcon hovered={false}/>},
                {k:'spectroscope',  title:'分光镜检测', sub:'观察吸收光谱', icon:<SpectroscopeIcon hovered={false}/>},
              ].map((ins,i)=>(
                <div key={ins.k} className={`rounded-2xl p-[1px] anim-drop ${evidence[ins.k]?'bg-gradient-to-r from-emerald-500/40 to-teal-500/40':'bg-white/10'}`} style={{animationDelay:`${i*0.1}s`}}>
                  <div className="rounded-2xl bg-gradient-to-br from-[#162847] to-[#0a1628] p-5 flex items-center gap-5">
                    <div className="w-20 h-16 shrink-0 flex items-center justify-center scale-50 origin-center">{ins.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-display text-xl text-white">{ins.title}</span>
                        {evidence[ins.k] ? <Pill tone="green">✓ 已完成</Pill> : <Pill tone="slate">待检测</Pill>}
                      </div>
                      <div className="text-slate-400 text-sm mt-0.5">{ins.sub}</div>
                      {evidence[ins.k] && (
                        <div className="mt-2 p-2 rounded-lg bg-emerald-500/10 text-emerald-200 text-xs font-mono">
                          {Object.entries(evidence[ins.k]).map(([k,v])=>`${k}: ${v}`).join(' · ')}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>go(`${ins.k}-demo`)} className={`px-4 py-2.5 rounded-lg text-sm font-medium transition ${
                      evidence[ins.k]?'bg-white/5 text-slate-300 ring-1 ring-white/10 hover:bg-white/10':'bg-gradient-to-r from-blue-500 to-cyan-500 text-white hover:shadow-lg'
                    }`}>
                      {evidence[ins.k]?'重新检测':'开始检测 →'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <button
                onClick={()=>done && go('identification')}
                disabled={!done}
                className={`w-full py-4 rounded-2xl font-display text-xl italic transition-all ${
                  done?'bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:shadow-xl hover:shadow-amber-500/20':'bg-white/5 text-slate-500 cursor-not-allowed'
                }`}
                style={{fontVariationSettings:"'opsz' 144"}}
              >
                {done?'进入定名考核 →':`完成全部三项检测后解锁(${[evidence.refractometer,evidence.polariscope,evidence.spectroscope].filter(Boolean).length}/3)`}
              </button>
            </div>
          </div>

          {/* 右:证据链 */}
          <div className="sticky top-28 space-y-4 h-fit">
            <div className="rounded-2xl p-6 bg-white/5 backdrop-blur ring-1 ring-white/10">
              <div className="text-xs text-cyan-300 font-mono tracking-wider uppercase">Evidence Chain</div>
              <div className="mt-4 space-y-3 text-sm">
                <EvRow label="折射率 RI" value={evidence.refractometer?.RI}/>
                <EvRow label="双折射率 DR" value={evidence.refractometer?.DR}/>
                <EvRow label="光性特征" value={evidence.refractometer?.type}/>
                <EvRow label="消光行为" value={evidence.polariscope?.extinction}/>
                <EvRow label="特征光谱" value={evidence.spectroscope?.spectrum} multi/>
              </div>
            </div>

            <div className="rounded-2xl p-6 bg-gradient-to-br from-amber-500/10 to-transparent ring-1 ring-amber-400/20">
              <div className="text-xs text-amber-300 font-mono tracking-wider uppercase">Hint</div>
              <div className="text-slate-300 text-sm mt-2 leading-relaxed">
                综合 RI、DR、光性、光谱四项特征,与宝石学数据库对比即可锁定种属。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const EvRow = ({ label, value, multi }) => (
  <div className={`flex ${multi?'flex-col gap-1':'items-center justify-between'}`}>
    <span className="text-slate-400 text-xs">{label}</span>
    <span className={`font-mono text-xs ${value?'text-cyan-200':'text-slate-600'}`}>{value||'—'}</span>
  </div>
);

// ============================================================
// 定名考核
// ============================================================
const Identification = ({ go, sample, evidence, setResult }) => {
  // 生成四选一(正确答案 + 3 个干扰项)
  const [choices] = useState(()=>{
    const others = GEM_DATABASE.filter(g=>g.id!==sample.id).sort(()=>Math.random()-0.5).slice(0,3);
    return [sample, ...others].sort(()=>Math.random()-0.5);
  });
  const [selected, setSelected] = useState(null);

  const submit = () => {
    setResult({ correct: selected?.id===sample.id, chosen: selected, truth: sample });
    go('feedback');
  };

  return (
    <div className="min-h-screen font-body" style={{background:'radial-gradient(ellipse at 50% 0%, #1e3a5f 0%, #0f2545 40%, #0a1628 100%)'}}>
      <FontStyles/>
      <div className="px-10 py-5 border-b border-white/10 flex items-center justify-between">
        <Crumb path={['检测模式','定名考核']} onHome={()=>go('workbench')}/>
        <div className="text-amber-300 text-xs font-mono tracking-wider">FINAL IDENTIFICATION</div>
      </div>

      <div className="max-w-6xl mx-auto px-10 py-16">
        <div className="text-center anim-fade">
          <div className="text-amber-300 text-xs font-mono tracking-[0.3em] uppercase">Question</div>
          <h1 className="font-display text-5xl text-white mt-4" style={{fontVariationSettings:"'opsz' 144"}}>
            基于检测证据,样品 <span className="italic text-amber-200">应定名为</span>
          </h1>
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 ring-1 ring-white/10 text-sm text-slate-300 font-mono">
            RI {evidence.refractometer?.RI} · DR {evidence.refractometer?.DR} · {evidence.refractometer?.type} · {evidence.polariscope?.extinction}
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-4">
          {choices.map((c,i)=>(
            <button
              key={c.id}
              onClick={()=>setSelected(c)}
              className={`text-left rounded-2xl p-[1px] anim-drop transition-all ${
                selected?.id===c.id?'bg-gradient-to-r from-amber-400 to-rose-500':'bg-white/10 hover:bg-white/20'
              }`}
              style={{animationDelay:`${i*0.08}s`}}
            >
              <div className="rounded-2xl bg-gradient-to-br from-[#162847] to-[#0a1628] p-6 flex items-center gap-5">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl shrink-0" style={{background:`radial-gradient(circle at 30% 30%, ${c.color}, #0a1628)`, boxShadow:`0 0 30px ${c.color}40`}}>{c.emoji}</div>
                <div>
                  <div className="font-display text-2xl text-white">{c.name}</div>
                  <div className="text-slate-400 text-xs font-mono mt-0.5">{c.en}</div>
                  <div className="text-slate-500 text-xs mt-1">RI {Array.isArray(c.RI)?`${c.RI[0]}-${c.RI[1]}`:c.RI}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-10 flex justify-center">
          <button
            onClick={submit}
            disabled={!selected}
            className={`px-10 py-4 rounded-2xl font-display text-xl italic transition-all ${
              selected?'bg-gradient-to-r from-amber-500 to-rose-500 text-white hover:shadow-2xl hover:shadow-amber-500/30':'bg-white/5 text-slate-500 cursor-not-allowed'
            }`}
            style={{fontVariationSettings:"'opsz' 144"}}
          >
            {selected?`提交答案:${selected.name}`:'请先选择'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 反馈页
// ============================================================
const Feedback = ({ go, result, evidence, resetDetection }) => {
  const correct = result.correct;
  const truth = result.truth;

  return (
    <div className="min-h-screen font-body" style={{background:correct?'radial-gradient(ellipse at 50% 0%, #065f46 0%, #064e3b 40%, #022c22 100%)':'radial-gradient(ellipse at 50% 0%, #7f1d1d 0%, #450a0a 40%, #1a0606 100%)'}}>
      <FontStyles/>
      <div className="max-w-4xl mx-auto px-10 py-20">
        <div className="text-center anim-fade">
          <div className="text-6xl mb-4">{correct?'✓':'✗'}</div>
          <div className={`text-xs font-mono tracking-[0.3em] uppercase ${correct?'text-emerald-300':'text-rose-300'}`}>{correct?'Correct · 定名正确':'Incorrect · 定名错误'}</div>
          <h1 className="font-display text-6xl text-white mt-4 italic" style={{fontVariationSettings:"'opsz' 144"}}>
            {correct?'漂亮!':'再接再厉'}
          </h1>
          <div className="text-white/70 mt-3 text-lg">
            样品真实身份:<span className="font-display italic text-white">{truth.name}</span>
            {!correct && <span className="text-white/50"> · 你的选择:{result.chosen.name}</span>}
          </div>
        </div>

        <div className="mt-12 rounded-2xl p-[1px]" style={{background:'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.05))'}}>
          <div className="rounded-2xl bg-black/40 backdrop-blur p-8">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <div className="text-xs text-white/50 font-mono tracking-wider uppercase">Your Evidence</div>
                <div className="mt-3 space-y-2 text-sm">
                  <EvidenceRow label="RI 范围" value={evidence.refractometer?.RI}/>
                  <EvidenceRow label="双折射率" value={evidence.refractometer?.DR}/>
                  <EvidenceRow label="光性" value={evidence.refractometer?.type}/>
                  <EvidenceRow label="消光" value={evidence.polariscope?.extinction}/>
                  <EvidenceRow label="光谱" value={evidence.spectroscope?.spectrum}/>
                </div>
              </div>
              <div>
                <div className="text-xs text-amber-300 font-mono tracking-wider uppercase">Truth · {truth.name}</div>
                <div className="mt-3 space-y-2 text-sm">
                  <EvidenceRow label="标准 RI" value={Array.isArray(truth.RI)?`${truth.RI[0]} – ${truth.RI[1]}`:truth.RI}/>
                  <EvidenceRow label="标准 DR" value={truth.DR.toFixed(3)}/>
                  <EvidenceRow label="光性类别" value={truth.type}/>
                  <EvidenceRow label="特征光谱" value={truth.spectrum}/>
                  <EvidenceRow label="鉴定要点" value={truth.note || '无'}/>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex gap-4 justify-center">
          <button onClick={()=>{resetDetection();go('sample-select');}} className="px-6 py-3 rounded-xl bg-white/10 ring-1 ring-white/20 text-white hover:bg-white/20 transition">再来一题</button>
          <button onClick={()=>{resetDetection();go('workbench');}} className="px-6 py-3 rounded-xl bg-white text-slate-900 font-medium hover:shadow-xl transition">返回工作台</button>
        </div>
      </div>
    </div>
  );
};

const EvidenceRow = ({ label, value }) => (
  <div className="flex items-start gap-3">
    <span className="text-white/40 text-xs min-w-[80px]">{label}</span>
    <span className="text-white/90 text-xs font-mono flex-1">{value||'—'}</span>
  </div>
);

// ============================================================
// 根组件 · 路由管理
// ============================================================
export default function App() {
  const [view, setView] = useState('workbench');
  const [sample, setSample] = useState(null);
  const [evidence, setEvidence] = useState({ refractometer:null, polariscope:null, spectroscope:null });
  const [result, setResult] = useState(null);

  const go = (v) => { window.scrollTo(0,0); setView(v); };

  const resetDetection = () => {
    setEvidence({ refractometer:null, polariscope:null, spectroscope:null });
    setSample(null);
    setResult(null);
  };

  return (
    <div className="min-h-screen">
      <FontStyles/>
      {view==='workbench' && <Workbench go={go}/>}
      {view==='refractometer-knowledge' && <RefractometerKnowledge go={go}/>}
      {view==='polariscope-knowledge' && <SimpleKnowledge go={go} type="polariscope"/>}
      {view==='spectroscope-knowledge' && <SimpleKnowledge go={go} type="spectroscope"/>}
      {view==='refractometer-demo' && <RefractometerDemo go={go} mode={sample?'detection':'learn'} sampleId={sample?.id} onRecord={(data)=>setEvidence(e=>({...e, refractometer:data}))}/>}
      {view==='polariscope-demo' && <SimpleDemo go={go} type="polariscope" mode={sample?'detection':'learn'} sampleId={sample?.id} onRecord={(data)=>setEvidence(e=>({...e, polariscope:data}))}/>}
      {view==='spectroscope-demo' && <SimpleDemo go={go} type="spectroscope" mode={sample?'detection':'learn'} sampleId={sample?.id} onRecord={(data)=>setEvidence(e=>({...e, spectroscope:data}))}/>}
      {view==='sample-select' && <SampleSelect go={go} setSample={setSample}/>}
      {view==='detection-mode' && <DetectionMode go={go} sample={sample} evidence={evidence} setEvidence={setEvidence}/>}
      {view==='identification' && <Identification go={go} sample={sample} evidence={evidence} setResult={setResult}/>}
      {view==='feedback' && <Feedback go={go} result={result} evidence={evidence} resetDetection={resetDetection}/>}
    </div>
  );
}
