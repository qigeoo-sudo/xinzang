'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import type { ReactNode } from 'react';

/**
 * 内页统一外壳（首页设计语言下放）
 * - PageHero：杏红金渐变封面（cover-gradient）+ 白色衬线大标题 + 等宽刊头小字
 * - StageShell：深灰蓝箔纸展台（home-backdrop），内容以暖白信纸 PaperPanel 浮在展台上
 * - PaperPanel：offer 信纸质感面板（.letter-paper 已含纸面噪点、衬纸与纸厚投影）
 * - StageTitle：展台深底上的白色衬线小标题
 * 注意：三张金属信用卡（card-gold/sage/coral）只属于首页，内页禁止使用。
 */

export function PageHero({
  eyebrow,
  title,
  subtitle,
  watermark,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** 右上角巨大的半透明装饰汉字 */
  watermark?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative z-10">
      <div className="cover-gradient absolute inset-0 overflow-hidden rounded-b-[32px]">
        {watermark && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-8 hidden select-none font-serif text-[180px] font-bold leading-none text-white/[0.08] md:block"
          >
            {watermark}
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute right-[8%] top-[36%] text-[11px] text-white/55">
          ✦
        </span>
        <span aria-hidden className="pointer-events-none absolute bottom-[20%] right-[10%] hidden text-sm text-white/40 md:block">
          ✦
        </span>
      </div>
      <div className="relative mx-auto w-full max-w-[840px] px-5 pb-10 pt-8 md:px-8 md:pb-12 md:pt-12">
        <span className="block h-[3px] w-10 rounded-full bg-white/90" aria-hidden />
        {eyebrow && (
          <p className="mt-5 font-mono text-[10px] font-medium uppercase tracking-masthead text-white/85">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 font-serif text-[26px] font-bold leading-[1.25] tracking-[-0.01em] text-[#FFF9F2] md:text-[32px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 max-w-[520px] text-[13px] leading-relaxed text-white/85 md:text-sm">
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}

export function StageShell({
  children,
  masthead,
}: {
  children: ReactNode;
  /** 展台顶部居中等宽英文小字（对应首页 masthead-label） */
  masthead?: string;
}) {
  return (
    <div className="home-backdrop relative z-0 -mt-[32px] flex-1 overflow-hidden">
      <GoldFlakes variant="dark" />
      <div className="relative z-10 mx-auto w-full max-w-[840px] px-4 pt-[58px] md:px-6">
        {masthead && (
          <p className="pb-5 text-center font-mono text-[10px] font-medium uppercase tracking-masthead text-white/45">
            {masthead}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

export function PaperPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`letter-paper rounded-[20px] p-5 md:p-6 ${className}`}>{children}</div>
  );
}

export function StageTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 px-1 font-serif text-[17px] font-bold text-[#FFF9F2]">{children}</h2>
  );
}

/**
 * 黑灰蓝展台底面的纯文字版权（替代黑卡）：
 * 用于首页之外、但保留 StageShell 深底的页面（如 dashboard）。
 * 黑卡本身只在首页出现。
 */
export function StageCredits({ lang = 'zh' }: { lang?: 'zh' | 'en' }) {
  const t = {
    zh: {
      name: 'AI Career Companion',
      slogan: '陪你一起\u00A0\u00A0见证成长',
      copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
    },
    en: {
      name: 'AI Career Companion',
      slogan: 'With you, as clarity grows.',
      copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
    },
  }[lang];
  return (
    <footer className="relative z-10 px-5 pb-10 pt-8 md:pb-12">
      <div className="mx-auto max-w-[840px] text-center">
        <p className="font-mono text-[9px] font-medium uppercase tracking-masthead text-foil">
          {t.name}
        </p>
        <p className="mt-2 font-serif text-[13px] font-bold text-foil md:text-[15px]">
          {t.slogan}
        </p>
        <p className="mt-2 text-[9px] text-white/35">{t.copyright}</p>
      </div>
    </footer>
  );
}

/**
 * 浅底信纸页面的纯文字版权（深字版）：
 * 用于职业测试 / 我的档案 / 行业导师 等浅底页面。
 * 布局同 StageCredits，配色改深字以适配浅底。
 */
export function PaperCredits({ lang = 'zh', compact = false }: { lang?: 'zh' | 'en'; compact?: boolean }) {
  const t = {
    zh: {
      name: 'AI Career Companion',
      slogan: '陪你一起\u00A0\u00A0见证成长',
      copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
    },
    en: {
      name: 'AI Career Companion',
      slogan: 'With you, as clarity grows.',
      copyright: 'Copyright © 2026 Squeezing Me Co., Ltd. All rights reserved.',
    },
  }[lang];
  return (
    <footer className={`relative z-10 px-5 ${compact ? 'pt-4 pb-1' : 'pb-10 pt-8 md:pb-12'}`}>
      <div className="mx-auto max-w-[840px] text-center">
        <p className="font-mono text-[9px] font-medium uppercase tracking-masthead text-gold-700">
          {t.name}
        </p>
        <p className="mt-1.5 font-serif text-[12px] font-bold text-ink">
          {t.slogan}
        </p>
        <p className="mt-1 text-[8px] text-muted">{t.copyright}</p>
      </div>
    </footer>
  );
}

/**
 * 洒金屑：金币贴片 + 四芒星光，位置随机。
 * 密度同首页（2 枚金币 + 2 颗星光），每次加载位置不同。
 * 放在 relative 容器内，absolute 铺满。
 *
 * 层级：z-0（背景层），金币在所有信笺上方、卡片下方——
 * 即在页面底色（bg-bg / home-backdrop）之上，但在 letter-paper/PaperPanel 卡片之下。
 * 金币本身 100% 不透明，但浅底（bg-bg）与金币金色对比度低，
 * 因此浅底场景默认加 sepia + brightness + contrast 滤镜让金色更深更显眼。
 *
 * variant：
 *  - 'light'（默认）：浅底（bg-bg）使用，金币加 filter 让金色更显眼
 *  - 'dark'：深底（home-backdrop / dashboard StageShell）使用，原样不滤镜
 *
 * 注意：Math.random 必须在 client mount 后跑，避免 SSR/hydration 位置不一致导致 mismatch。
 */
export function GoldFlakes({
  count = 2,
  stars = 2,
  variant = 'light',
}: {
  count?: number;
  stars?: number;
  variant?: 'light' | 'dark';
}) {
  const [flakes, setFlakes] = useState<{
    coins: { top: number; left: number; rotate: number; size: number }[];
    sparks: { top: number; left: number; size: number }[];
  } | null>(null);

  useEffect(() => {
    setFlakes({
      coins: Array.from({ length: count }, () => ({
        top: Math.random() * 88 + 6,
        left: Math.random() * 88 + 4,
        rotate: Math.random() * 60 - 30,
        size: Math.round(Math.random() * 10 + 22),
      })),
      sparks: Array.from({ length: stars }, () => ({
        top: Math.random() * 90 + 5,
        left: Math.random() * 90 + 5,
        size: Math.round(Math.random() * 4 + 9),
      })),
    });
  }, [count, stars]);

  if (!flakes) return null;
  // 浅底变体：给金币加 sepia + brightness + contrast，让金色在奶油底上更深更显眼
  const coinStyle =
    variant === 'light'
      ? { filter: 'sepia(0.3) brightness(0.82) contrast(1.1)' }
      : undefined;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {flakes.coins.map((c, i) => (
        <Image
          key={`coin-${i}`}
          src="/icons/icon-coin.png"
          alt=""
          width={c.size}
          height={Math.round(c.size * 0.75)}
          className="coin-debris"
          style={{
            top: `${c.top}%`,
            left: `${c.left}%`,
            transform: `rotate(${c.rotate}deg)`,
            ...(coinStyle || {}),
          }}
        />
      ))}
      {flakes.sparks.map((s, i) => (
        <span
          key={`spark-${i}`}
          className="star-spark absolute"
          style={{ top: `${s.top}%`, left: `${s.left}%`, fontSize: s.size }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}
