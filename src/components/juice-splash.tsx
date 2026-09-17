'use client';

import { useEffect, useRef } from 'react';

/**
 * 导航点击「榨果汁」动画 — 浓稠果汁喷溅模型
 *
 * 物理：
 * - 迸发：初速度 180-340 px/s，全角度辐射，小液滴更快
 * - 飞行：高空气阻尼 4/s（浓稠，速度每 0.17s 减半）+ 重力 220
 * - 缓降：阻尼吃掉速度后，重力缓慢下拉（蜂蜜挂壁感）
 * - 挂壁：触杏红线后摩擦 15/s，速度归零，重力 6% 蠕动
 * - 旋转：平滑系数 0.12，快速回正朝下，减少打转
 *
 * 形状：泪滴形（尖头朝上、圆头朝下），速度越快尾部越长
 * 模糊：空中/挂壁边缘绝对清晰；顶部最高点进入杏红区后迅速 blur 溶解
 */

const JUICE_MAIN = ['#F08055', '#F6A44C', '#F4A05F', '#EE8858'];
const JUICE_ACCENT = '#EC6070';

/** 物理参数 — 浓稠果汁：大初速 + 高阻尼 + 中等重力 */
const GRAVITY = 180;            // 重力 px/s²（降低，下落更慢）
const AIR_DRAG = 6.0;            // 空气阻尼 /s（浓稠！速度快速衰减）
const FRICTION = 7;              // 挂壁摩擦 /s（更大，更粘滞）
const CLING_GRAVITY_RATIO = 0.4; // 挂壁时有效重力比例（更慢滑入杏红区）
const ROTATE_SMOOTH = 0.12;      // 旋转平滑（更快回正朝下，减少打转）
const FUSE_FADE_MS = 400;        // 溶解时长（快速消失）
const HARD_LIFE_MS = 5000;       // 兜底寿命
const BURST_PARTICLES = 30;
const GENTLE_PARTICLES = 15;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  born: number;
  fusedAt: number | null;
  fuseLine: number;
  alpha: number;
  clinging: boolean;
  angle: number; // 当前朝向角（有惯性）
  stretch: number; // 沿朝向方向的拉伸比（1=圆，>1=泪滴）
  /** 泪滴形状系数 0~1：0=适中(a=.7,b=1.3) 1=瘦长(a=.55,b=1.55) */
  dropShape: number;
  /** 残留小液滴：挂在轨迹上不动，逐渐淡出 */
  isResidue: boolean;
  residueFadeAt: number | null;
  /** 大液滴是否会在滑落时留下残留（50% 概率） */
  dropsResidue: boolean;
  /** 上次留下残留的位置 */
  lastResidueY: number;
}

let triggerFn:
  | ((x: number, y: number, w: number, h: number, navBottom: number, longFall: boolean) => void)
  | null = null;
let lastBurst = 0;

export function juiceBurst(
  x: number,
  y: number,
  w: number,
  h: number,
  navBottom: number,
  longFall: boolean,
) {
  triggerFn?.(x, y, w, h, navBottom, longFall);
}

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * 生成一颗液滴
 * - 角度：全角度辐射
 * - 速度：大初速 180-320，小液滴更快（speed ∝ 1/r）
 * - 每颗液滴角度、速度、半径都不同
 */
function spawnParticle(x: number, y: number, speed: number, gentle: boolean): Particle {
  const angle = rand(0, Math.PI * 2);
  const r = rand(7, 17) * (gentle ? 0.8 : 1);
  // 小液滴初速度大（喷溅物理：小颗粒飞得远）
  const avgR = 12;
  const v = (speed * (avgR / r)) * (gentle ? 0.55 : 1);
  const color = Math.random() < 0.1 ? JUICE_ACCENT : pick(JUICE_MAIN);
  const p: Particle = {
    x: x + rand(-14, 14),
    y: y + rand(-10, 10),
    vx: Math.cos(angle) * v,
    vy: Math.sin(angle) * v,
    r,
    color,
    born: performance.now(),
    fusedAt: null,
    fuseLine: 0,
    alpha: 1,
    clinging: false,
    angle: angle - Math.PI / 2,  // 初始朝向：圆头指向发射方向
    stretch: 1 + Math.min(v / 70, 1.6),  // 初始椭圆拉伸由初速度决定：越快越长
    dropShape: Math.random(),  // 泪滴形状系数 0~1：0=适中(a=.7,b=1.3) 1=瘦长(a=.55,b=1.55)
    isResidue: false,
    residueFadeAt: null,
    dropsResidue: r >= 12 && Math.random() < 0.7,  // 大液滴才留痕，控制总量
    lastResidueY: y - 4,  // 略早于出生位置，确保大液滴（飞得低）也能留痕
  };
  return p;
}

export function JuiceOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const supportsFilter = typeof ctx.filter === 'string' && 'filter' in ctx;

    let particles: Particle[] = [];
    let rafId: number | null = null;
    let lastTs = performance.now();

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = (ts: number) => {
      const dt = Math.min((ts - lastTs) / 1000, 0.04);
      lastTs = ts;

      // 残留液滴淡出时长
      const RESIDUE_LIFE_MS = 2000;  // 残留小泪滴淡出时长（慢慢消失）
      // 大液滴滑落时每隔多少 px 留一次残留
      const RESIDUE_INTERVAL = 6;  // 下落时每隔多少 px 留一次圆点（大液滴飞得低，间隔要小）

      // ── 物理更新 ──
      const newResidues: Particle[] = [];
      for (const p of particles) {
        const age = ts - p.born;

        // 残留液滴：不动，只淡出
        if (p.isResidue) {
          if (p.residueFadeAt === null) p.residueFadeAt = ts + RESIDUE_LIFE_MS;
          const remain = p.residueFadeAt - ts;
          p.alpha = Math.max(0, remain / RESIDUE_LIFE_MS);
          continue;
        }

        if (p.fusedAt !== null) {
          p.alpha = Math.max(0, 1 - (ts - p.fusedAt) / FUSE_FADE_MS);
          continue;
        }

        if (p.clinging) {
          const sizeFactor = p.r / 12;
          p.vx *= Math.max(0, 1 - FRICTION * dt);
          p.vy *= Math.max(0, 1 - FRICTION * dt * 0.5);
          p.vy += GRAVITY * CLING_GRAVITY_RATIO * sizeFactor * dt;
        } else {
          p.vy += GRAVITY * dt;
          p.vx *= Math.max(0, 1 - AIR_DRAG * dt);
          p.vy *= Math.max(0, 1 - AIR_DRAG * 0.3 * dt);
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // 下落阶段（vy>0）留下圆形微粒痕迹
        // 微泪滴最大半径约 3.2 + 偏移余量，确保完全不出现在杏红区
        if (p.dropsResidue && p.vy > 0 && p.y < p.fuseLine - 8 && p.y - p.lastResidueY > RESIDUE_INTERVAL) {
          p.lastResidueY = p.y;
          newResidues.push({
            x: p.x + rand(-p.r * 0.3, p.r * 0.3),
            y: p.y + rand(-p.r * 0.2, p.r * 0.2),
            vx: 0,
            vy: 0,
            r: rand(0.8, 3.2),  // 尺寸有大有小，包含更小的微粒
            color: p.color,
            born: ts,
            fusedAt: null,
            fuseLine: p.fuseLine,
            alpha: 1,
            clinging: true,
            angle: 0,
            stretch: 1,
            dropShape: Math.random(),  // 用作边缘扰动种子
            isResidue: true,
            residueFadeAt: null,
            dropsResidue: false,
            lastResidueY: 0,
          });
        }

        // 动态形变：分两阶段
        // 上升（vy<=0）：椭圆，速度越快拉得越长，顶点变圆
        // 下落（vy>0）：泪滴，vy 越大越明显
        const sp = Math.hypot(p.vx, p.vy);
        if (p.vy <= 0) {
          // 上升：椭圆拉伸，由总速度驱动
          p.stretch = 1 + Math.min(sp / 70, 1.6);
        } else {
          // 下落：泪滴，由 vy 驱动
          const tailFactor = Math.min(p.vy / 60, 1);
          const targetStretch = 1 + tailFactor * 1.6;
          p.stretch += (targetStretch - p.stretch) * 0.2;
        }

        // 半高：上升时 = stretch * r（椭圆长轴），下落时 = b * r（泪滴）
        const lambdaHalf = Math.min(Math.max(p.stretch - 1, 0), 1.0);
        const halfH = p.vy <= 0
          ? p.stretch * p.r
          : (1.0 + (0.3 + 0.25 * p.dropShape) * lambdaHalf) * p.r;

        if (!p.clinging && p.y + halfH >= p.fuseLine) {
          p.clinging = true;
          p.y = p.fuseLine - halfH;
        }

        if (p.y - halfH >= p.fuseLine) {
          p.fusedAt = ts;
          continue;
        }

        if (sp > 5) {
          const target = Math.atan2(p.vy, p.vx) - Math.PI / 2;
          let diff = target - p.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          p.angle += diff * ROTATE_SMOOTH;
        }

        p.alpha = age > HARD_LIFE_MS ? Math.max(0, 1 - (age - HARD_LIFE_MS) / 600) : 1;
      }
      if (newResidues.length) particles = particles.concat(newResidues);
      particles = particles.filter((p) => p.alpha > 0.02);

      // ── 渲染 ──
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (particles.length === 0) {
        rafId = null;
        return;
      }
      ctx.globalCompositeOperation = 'source-over';

      for (const p of particles) {
        const fusing = p.fusedAt !== null;
        const fuseAge = fusing ? (ts - p.fusedAt!) / FUSE_FADE_MS : 0;

        if (supportsFilter) {
          ctx.filter = fusing ? `blur(${3 + fuseAge * 9}px)` : 'none';
        }

        ctx.save();
        ctx.translate(p.x, p.y);

        if (p.isResidue) {
          // 残留微粒：带 sin 边缘扰动的不规则液滴
          // 用 dropShape 作为随机种子，每个微粒形状不同
          const seed = p.dropShape;
          const freq = 3 + Math.floor(seed * 6);   // 波数 3-8
          const amp = 0.1 + seed * 0.18;            // 振幅 0.1-0.28
          const phase = seed * Math.PI * 2;
          const steps = 24;
          ctx.fillStyle = hexToRgba(p.color, p.alpha);
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const t = (i / steps) * Math.PI * 2;
            const wobble = 1 + amp * Math.sin(freq * t + phase);
            const rr = p.r * wobble;
            const x = Math.cos(t) * rr;
            const y = Math.sin(t) * rr;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.fill();
        } else if (!fusing) {
          ctx.rotate(p.angle);
          if (p.vy <= 0) {
            // 上升阶段：椭圆，沿速度方向（+Y）拉伸
            // stretch 越大越扁长，顶点时 stretch→1 变圆
            const sx = 1 / Math.sqrt(p.stretch);
            ctx.scale(sx, p.stretch);
            ctx.fillStyle = hexToRgba(p.color, p.alpha);
            ctx.beginPath();
            ctx.arc(0, 0, p.r, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // 下落阶段：泪滴参数方程，形状由 dropShape 决定分布
            // dropShape=0: a=0.7 b=1.3（适中），dropShape=1: a=0.55 b=1.55（瘦长）
            const lambda = Math.min((p.stretch - 1), 1.0);
            const a = 1.0 - (0.3 + 0.15 * p.dropShape) * lambda;
            const b = 1.0 + (0.3 + 0.25 * p.dropShape) * lambda;
            const tipRound = 0.22;
            const s = p.r;
            const steps = 64;
            ctx.fillStyle = hexToRgba(p.color, p.alpha);
            ctx.beginPath();
            for (let i = 0; i <= steps; i++) {
              const t = (i / steps) * Math.PI * 2;
              const cosT = Math.cos(t);
              const sinT = Math.sin(t);
              const factor = 1 - lambda * cosT + lambda * tipRound * (1 + cosT);
              const x = a * factor * sinT * s;
              const y = -b * cosT * s;
              if (i === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fill();
          }
        } else {
          // 溶解态：摊扁
          ctx.scale(1 + fuseAge * 0.5, Math.max(0.35, 1 - fuseAge * 0.65));
          ctx.fillStyle = hexToRgba(p.color, p.alpha);
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
      if (supportsFilter) ctx.filter = 'none';

      rafId = requestAnimationFrame(render);
    };

    const ensureRaf = () => {
      if (rafId === null) {
        lastTs = performance.now();
        rafId = requestAnimationFrame(render);
      }
    };

    triggerFn = (x, y, _w, _h, navBottom, longFall) => {
      const now = performance.now();
      if (now - lastBurst < 180) return;
      lastBurst = now;

      const gentle = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const count = gentle ? GENTLE_PARTICLES : BURST_PARTICLES;

      const fuseLine = longFall ? navBottom + 14 : navBottom + 2;

      const newParticles: Particle[] = [];
      const mainCount = Math.floor(count * 0.65);
      for (let i = 0; i < mainCount; i++) {
        const p = spawnParticle(x, y, rand(180, 280), gentle);
        p.fuseLine = fuseLine;
        newParticles.push(p);
      }
      const splashCount = count - mainCount;
      for (let i = 0; i < splashCount; i++) {
        const p = spawnParticle(x, y, rand(260, 340), gentle);
        p.r *= 0.7;
        p.fuseLine = fuseLine;
        newParticles.push(p);
      }
      particles = particles.concat(newParticles);
      ensureRaf();
    };

    return () => {
      window.removeEventListener('resize', resize);
      if (rafId !== null) cancelAnimationFrame(rafId);
      triggerFn = null;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
    />
  );
}
