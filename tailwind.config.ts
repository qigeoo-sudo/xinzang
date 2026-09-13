import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 2026 新首页设计系统（home-sample-2）：暖米底 + 藏青墨 + 橙/金/鼠尾草绿 + 珊瑚红
        bg: { DEFAULT: '#F2E6D8', dark: '#E8D9C4' },
        ink: '#2C3E5C',
        muted: '#5A6B7E',
        rule: '#D1D5DB',
        accent: {
          DEFAULT: '#5B7C5A',
          light: '#8B9D77',
          bright: '#7A9B5E',
        },
        warm: '#A67B5B',
        beige: '#FBF0E0',
        danger: '#C0654A',
        warn: '#D4A574',
        success: '#5B8C5A',
        // brand：橙色行动色；900 为藏青墨色（标题/深色底）
        brand: {
          50: '#FDF5EC',
          100: '#FAEBD4',
          200: '#F5D7A9',
          300: '#F0C17D',
          400: '#F9B34A',
          500: '#F5A623',
          600: '#D4881A',
          700: '#B37015',
          800: '#8A5510',
          900: '#2C3E5C',
        },
        sage: {
          50: '#F0F5ED',
          100: '#E4EEDD',
          200: '#CDE0C0',
          300: '#A7BF94',
          400: '#7A9E6E',
          500: '#6B8E5E',
          600: '#55734B',
          700: '#435B3B',
        },
        // 暖棕中性面（全站既有表面色，保留）
        sand: {
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
        // 珊瑚红（新首页关键词卡等强调色，模板中称 sand-500）
        coral: {
          50: '#FCF2F0',
          100: '#FAE8E8',
          200: '#F5D3D3',
          300: '#E8B5B5',
          400: '#F28383',
          500: '#F05A5A',
          600: '#D04848',
          700: '#B83C3C',
          800: '#C03838',
          900: '#932424',
        },
        // 金黄（新首页第三张卡/高亮，模板中称 --blue）
        gold: {
          50: '#FFF8E1',
          100: '#FFF3CC',
          200: '#FDE89E',
          300: '#FBDC6F',
          400: '#F8C741',
          500: '#F0B429',
          600: '#D9A82E',
          700: '#B88A1E',
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
        'card-in': 'cardIn .5s ease-out both',
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
        cardIn: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(.97)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
