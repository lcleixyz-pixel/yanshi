import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans SC"', '"PingFang SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'],
        display: ['Manrope', '"Noto Sans SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      colors: {
        // 蓝白学术风（内页）
        ink: {
          DEFAULT: '#1a2332',
          2: '#3d4a5e',
          3: '#5b6b80',
          4: '#8a97ab',
        },
        line: {
          DEFAULT: '#e3ebf5',
          2: '#d4dfee',
        },
        brand: {
          DEFAULT: '#1f5ba8',
          dark: '#174685',
          light: '#3d7ed0',
          50: '#eef4fb',
          100: '#dbe8f6',
          200: '#bcd3ed',
          300: '#8eb3df',
          400: '#5d8fcd',
          500: '#3d7ed0',
          600: '#1f5ba8',
          700: '#174685',
          800: '#13386b',
          900: '#0e2a52',
        },
        accent: {
          DEFAULT: '#e8a93a',
          dark: '#c98c1f',
          light: '#ffca5a',
        },
        // 沉浸式工作台（主页）
        lab: {
          ink: '#0a1628',
          navy: '#0f2545',
          deep: '#1e3a5f',
          cyan: '#67d4f0',
          gold: '#fbbf24',
        },
        // 仪器主题色
        refractometer: '#e8a93a', // 折射仪：橙
        polariscope: '#7c3aed',   // 偏光镜：紫
        spectroscope: '#0ea5e9',  // 分光镜：青
        // 功能色
        success: '#22a86a',
        danger: '#d35454',
        warn: '#f59e0b',
        info: '#2196F3',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26, 35, 50, 0.05)',
        card: '0 4px 12px rgba(26, 35, 50, 0.08)',
        lift: '0 12px 32px rgba(26, 35, 50, 0.12)',
        glow: '0 0 0 8px rgba(31, 91, 168, 0), 0 12px 32px rgba(31, 91, 168, 0.25)',
        hotspot: '0 0 0 0 rgba(232, 169, 58, 0.6), 0 0 30px rgba(232, 169, 58, 0.5)',
      },
      backgroundImage: {
        'workbench-gradient':
          'radial-gradient(ellipse at 50% 0%, #1e3a5f 0%, #0f2545 40%, #0a1628 100%)',
        'spectrum':
          'linear-gradient(to right, #2d0a14 0%, #8b0000 8%, #ff0000 18%, #ff7300 28%, #ffd000 40%, #c9ff00 50%, #00ff44 60%, #00d4ff 72%, #0044ff 82%, #4b0082 92%, #2d0040 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out both',
        'fade-in-up': 'fadeInUp 0.5s ease-out both',
        'drop-in': 'dropIn 0.5s cubic-bezier(.34,1.56,.64,1) both',
        'slide-in': 'slideIn 0.4s ease-out both',
        'soft-pulse': 'softPulse 2.4s ease-in-out infinite',
        'hotspot-glow': 'hotspotGlow 2s ease-in-out infinite',
        'pulse-ring': 'pulseRing 1.8s ease-out infinite',
        'bounce-in': 'bounceIn 0.6s cubic-bezier(.34,1.56,.64,1) both',
        'scale-in': 'scaleIn 0.4s cubic-bezier(.34,1.56,.64,1) both',
        shake: 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both',
        sparkle: 'sparkle 1.4s ease-in-out infinite',
        'arrow-slide': 'arrowSlide 1.6s ease-in-out infinite',
        float: 'float 4s ease-in-out infinite',
        shimmer: 'shimmer 1.6s linear infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        dropIn: {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(-12px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        softPulse: {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        hotspotGlow: {
          '0%, 100%': {
            boxShadow:
              '0 0 0 0 rgba(232,169,58,0.6), 0 0 20px rgba(232,169,58,0.5)',
          },
          '50%': {
            boxShadow:
              '0 0 0 10px rgba(232,169,58,0), 0 0 30px rgba(232,169,58,0.8)',
          },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.95)', opacity: '0.7' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        bounceIn: {
          '0%': { opacity: '0', transform: 'scale(0.4)' },
          '60%': { opacity: '1', transform: 'scale(1.12)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.85)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '10%, 90%': { transform: 'translateX(-1px)' },
          '20%, 80%': { transform: 'translateX(2px)' },
          '30%, 50%, 70%': { transform: 'translateX(-4px)' },
          '40%, 60%': { transform: 'translateX(4px)' },
        },
        sparkle: {
          '0%, 100%': { opacity: '0', transform: 'scale(0.4) rotate(0deg)' },
          '50%': { opacity: '1', transform: 'scale(1) rotate(180deg)' },
        },
        arrowSlide: {
          '0%, 100%': { transform: 'translateX(0)' },
          '50%': { transform: 'translateX(6px)' },
        },
      },
      borderRadius: {
        '4xl': '1.75rem',
      },
    },
  },
  plugins: [],
};

export default config;
