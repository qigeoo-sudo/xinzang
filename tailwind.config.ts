import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 沿用 MVP PRD 设计系统的配色方案
        bg: { DEFAULT: '#FAFAF7', dark: '#F2EFE8' },
        ink: '#2D2A24',
        muted: '#6B6557',
        rule: '#D8D2C5',
        accent: {
          DEFAULT: '#5B7C5A',
          light: '#8B9D77',
          bright: '#7A9B5E',
        },
        warm: '#A67B5B',
        beige: '#F5F0E6',
        danger: '#C0654A',
        warn: '#D4A574',
        success: '#5B8C5A',
        // 原始 MVP 配色 — brand/sage/sand 三色体系
        brand: {
          25: '#f8fbfc',
          50: '#f0f7f9',
          100: '#d9eef3',
          200: '#b3dde6',
          300: '#80c5d4',
          400: '#4aadd4',
          500: '#3482a2',
          600: '#2a6b85',
          700: '#22566b',
          800: '#1a4052',
          900: '#133340',
        },
        sage: {
          25: '#f8fbf8',
          50: '#f0f7f0',
          100: '#e3f0e3',
          200: '#c7e0c7',
          300: '#9eca9e',
          400: '#7ead78',
          500: '#5e8f5a',
          600: '#4a7347',
          700: '#395c37',
        },
        sand: {
          25: '#fdfbf9',
          50: '#faf7f4',
          100: '#f3ede4',
          200: '#e8dcc8',
          300: '#dcc5a3',
          400: '#cdb293',
          500: '#b89569',
          600: '#9a7a50',
          700: '#7c6240',
          900: '#4a3a26',
        },
        slate: {
          100: '#f1f5f9',
          400: '#94a3b8',
          500: '#64748b',
        },
      },
      fontFamily: {
        sans: [
          'Noto Sans SC',
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'Microsoft YaHei',
          'sans-serif',
        ],
        serif: [
          'Noto Serif SC',
          'Georgia',
          'serif',
        ],
        mono: ['DMMono', 'JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out forwards',
        'breathe': 'breatheFirst 3s ease-in-out 1 forwards, breatheLoop 3s ease-in-out infinite',
        'hero-decor': 'heroDecorFadeIn 5s ease-in 3s forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        breatheFirst: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.04)' },
        },
        breatheLoop: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.004)' },
        },
        heroDecorFadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
