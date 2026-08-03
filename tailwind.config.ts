import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 深青色系 — 权威感主色（源自 #3482A2）
        brand: {
          50: "#f0f7f9",
          100: "#d9eef3",
          200: "#b3dde6",
          300: "#80c5d4",
          400: "#4da8bd",
          500: "#3482a2",
          600: "#2a6b85",
          700: "#22566b",
          800: "#1a4552",
          900: "#133340",
        },
        // 鼠尾草绿系 — 年轻感强调色（源自 #7EAD78）
        sage: {
          50: "#f3f8f3",
          100: "#e3f0e3",
          200: "#c7e0c7",
          300: "#a3cda3",
          400: "#7ead78",
          500: "#6a9a64",
          600: "#547e4f",
          700: "#42643f",
          800: "#355034",
          900: "#2a4029",
        },
        // 暖米色系 — 温暖辅助色（源自 #CDB293）
        sand: {
          50: "#faf7f4",
          100: "#f3ede4",
          200: "#e8dcc9",
          300: "#dbc4a8",
          400: "#cdb293",
          500: "#bd9a78",
          600: "#a8815f",
          700: "#8a6a4d",
          800: "#6f5540",
          900: "#5a4634",
        },
      },
      fontFamily: {
        sans: ['"Noto Sans SC"', '-apple-system', 'sans-serif'],
        serif: ['"Noto Serif SC"', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'hero-pattern': 'radial-gradient(ellipse at top, rgba(52, 130, 162, 0.08), transparent 60%)',
        'mesh-gradient': 'radial-gradient(at 20% 30%, rgba(52, 130, 162, 0.06) 0px, transparent 50%), radial-gradient(at 80% 70%, rgba(126, 173, 120, 0.06) 0px, transparent 50%)',
      },
    },
  },
  plugins: [],
};
export default config;
