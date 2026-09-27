'use client';

export interface SelectedFruit {
  en: string;
  color: string;
}

/** 大水果碎果肉粒子：果肉色不规则液滴，从站位沿弧线越过杯口上方飘入舱内（JS 逐帧算坐标） */
export interface MistParticle {
  key: string;
  /** sin/cos 生成的静态不规则 blob 形状（生成一次复用，渲染时只更新位移） */
  d: string;
  color: string;
  delay: number; // ms，相对开榨时刻
  dur: number; // ms，飞行时长
  x0: number; // 起点站位
  y0: number;
  x1: number; // 控制点（机器口上方附近，决定飞行高度）
  y1: number;
  x2: number; // 舱内落点
  y2: number;
}

interface JuicerMachineProps {
  /** 已展开的舱内水果（每份一个元素），从底部往上堆叠 */
  smallFruits: SelectedFruit[];
  /** 大型水果（整颗站机器外地面上） */
  bigFruits: SelectedFruit[];
  /** 每份舱内水果的淡出进度 0→1（JS 逐帧驱动；1 = 完全消失） */
  fades: number[];
  juicing: boolean;
  /** 喝汁阶段：吸管已插入，液面正在下降 */
  draining: boolean;
  /** 拔吸管：液面见底后吸管上移淡出 */
  strawOut: boolean;
  /** 大水果粒子雾入舱阶段 */
  mist: boolean;
  mistParticles: MistParticle[];
  /** 开榨后经过的毫秒数（驱动碎果肉粒子沿路径飞行） */
  mistElapsed: number;
  /** 搅拌窗口：落舱后的切块在此期间随刀片逐个榨没（与中小型水果同节奏） */
  grindStart: number;
  grindEnd: number;
  /** 注水阶段（总量少于 3 份时先加纯净水，刀片注完水才转） */
  pouring: boolean;
  /** 榨汁全程（开榨到喝完）：大水果化雾后保持消失，不闪回 */
  blending: boolean;
  /** 刀片旋转：粒子/果肉飞入舱完成（MIST_DUR）后才开始搅拌 */
  bladeSpinning: boolean;
  juiceLevel: number;
  /** 果汁不透明度：0.9 普通 / 0.95 低出汁 / 1.0 近乎纯榴莲泥 */
  juiceOpacity: number;
  /** 水果沉降进度 0→1（JS 逐帧驱动） */
  sink: number;
  mixColor: string;
  canStart: boolean;
  onStart: () => void;
}

// 大水果尺寸（用户拍板比例：椰子=2 西瓜=3 榴莲=5 菠萝蜜=7，其余见注释；×40 缩放到画布，舱内普通水果 60px）
const BIG_SIZE: Record<string, number> = {
  coconut: 80,        // 椰子 2
  breadfruit: 100,    // 面包果 2.5
  ambarella: 100,     // 香肉果 2.5
  bael: 100,          // 木苹果 2.5
  'hami-melon': 100,  // 哈密瓜 2.5
  watermelon: 120,    // 西瓜 3
  pineapple: 120,     // 菠萝 3
  baobab: 120,        // 猴面包果 3
  mamey: 140,         // 马米果 3.5
  soursop: 160,       // 刺番荔枝 4
  durian: 200,        // 榴莲 5
  jackfruit: 144,     // 菠萝蜜 3.6
};

// 大水果站位（x = 中心，g = 底部贴地点）：左右两簇 + 机器后方双巨无霸，远者先画、近者压上，全部不出 560×340 画布
const BIG_SLOTS: Record<string, { x: number; g: number }> = {
  durian: { x: 430, g: 246 },       // 右后方
  soursop: { x: 96, g: 250 },       // 左后方高个
  mamey: { x: 496, g: 252 },        // 右侧
  baobab: { x: 366, g: 258 },       // 右中后
  jackfruit: { x: 375, g: 296 },    // 右前（左缘探到机身后面，被机器遮住一部分）
  bael: { x: 150, g: 280 },         // 左中（杯身外侧）
  ambarella: { x: 134, g: 290 },    // 左中前
  'hami-melon': { x: 420, g: 294 }, // 右中
  coconut: { x: 44, g: 318 },       // 左前
  watermelon: { x: 352, g: 322 },   // 右前（微掩于机身右角）
  breadfruit: { x: 96, g: 324 },    // 左前
  pineapple: { x: 492, g: 330 },    // 右前角
};

export { BIG_SLOTS, BIG_SIZE };

const BLADE_ANGLES = [0, 60, 120, 180, 240, 300];

// 舱内堆叠：水果互相叠加交错，从舱底往上堆，最高到舱高的 3/4 处
// （导出给页面层计算「液面盖住全部水果」的遮挡液面用，两处必须同一公式）
export function stackPos(i: number) {
  const layer = Math.floor(i / 2);
  const col = i % 2;
  const jitterX = ((i * 13) % 11) - 5;
  const x = 100 + (col === 0 ? -18 : 18) + jitterX;
  const y = Math.max(88, 172 - layer * 27);
  const r = ((i * 53) % 31) - 15;
  return { x, y, r };
}

// 沉降余量：份数越少初始堆得越低、需要沉得越深才能出视野；满舱 7 份以上则浅沉即可
export function extraSinkFor(count: number) {
  return count >= 7 ? 120 : count >= 4 ? 150 : 180;
}

export default function JuicerMachine({
  smallFruits,
  bigFruits,
  fades,
  juicing,
  draining,
  strawOut,
  mist,
  mistParticles,
  mistElapsed,
  grindStart,
  grindEnd,
  pouring,
  blending,
  bladeSpinning,
  juiceLevel,
  juiceOpacity,
  sink,
  mixColor,
  canStart,
  onStart,
}: JuicerMachineProps) {
  const bladeCenterY = 178;
  const surfaceY = 200 - (170 * juiceLevel) / 100;
  // 沉降幅度：水果只要刀片在转就该持续往下缓降，最终全部沉到舱底以下被遮挡
  // 份数越多舱内越满、初始堆得越高，需要更大 extraSink 才能确保高位水果也能沉出视野
  const extraSink = extraSinkFor(smallFruits.length);

  return (
    <div className="relative w-full max-w-[520px]">
      <svg viewBox="0 0 560 340" fill="none" className={`w-full ${juicing ? 'juicer-shake' : ''}`}>
        <defs>
          <linearGradient id="glassMain" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(220,225,230,0.4)" />
            <stop offset="25%" stopColor="rgba(200,210,220,0.08)" />
            <stop offset="100%" stopColor="rgba(180,195,210,0.25)" />
          </linearGradient>
          <linearGradient id="lidGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(200,210,220,0.5)" />
            <stop offset="50%" stopColor="rgba(230,235,240,0.15)" />
            <stop offset="100%" stopColor="rgba(180,195,210,0.4)" />
          </linearGradient>
          <linearGradient id="baseMain" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F0F0F0" />
            <stop offset="35%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#E8E8E8" />
            <stop offset="100%" stopColor="#C8C8C8" />
          </linearGradient>
          <radialGradient id="baseTopHL" cx="40%" cy="10%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <linearGradient id="baseBottom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </linearGradient>
          <radialGradient id="btnGrad" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor={canStart ? '#9ADE7C' : '#888'} />
            <stop offset="100%" stopColor={canStart ? '#4A8436' : '#555'} />
          </radialGradient>
          <clipPath id="cupClip">
            <path d="M52 50 Q52 30 100 30 Q148 30 148 50 L148 200 Q148 206 142 206 L58 206 Q52 206 52 200 Z" />
          </clipPath>
          {/* 吸管水上部分裁剪：只显示液面以上的区域（液面随喝汁下降实时跟随） */}
          <clipPath id="strawAbove">
            <rect x="80" y="0" width="80" height={surfaceY} />
          </clipPath>
        </defs>

        {/* 地面（一整条平面，机器和大水果都站在上面） */}
        <rect x="6" y="312" width="548" height="4" rx="2" fill="rgba(0,0,0,0.08)" />

        {/* ═══ 大型水果：分档尺寸，左右两簇错落堆放在机器旁地面上（远者先画，近者压上） ═══ */}
        {[...bigFruits]
          .sort((a, b) => (BIG_SLOTS[a.en]?.g ?? 300) - (BIG_SLOTS[b.en]?.g ?? 300))
          .map((f) => {
            const slot = BIG_SLOTS[f.en] ?? { x: 255, g: 300 };
            const size = BIG_SIZE[f.en] ?? 120;
            return (
              <g
                key={f.en}
                className={`fruit-appear ${blending ? 'big-fruit-vanish' : ''}`}
                style={{ transformOrigin: `${slot.x}px ${slot.g - size / 2}px` }}
              >
                <ellipse cx={slot.x} cy={slot.g + 2} rx={size * 0.42} ry={size * 0.09} fill="rgba(0,0,0,0.14)" />
                <image
                  href={`/fruits/${f.en}.webp`}
                  x={slot.x - size / 2}
                  y={slot.g - size}
                  width={size}
                  height={size}
                />
              </g>
            );
          })}

        {/* ═══ 榨汁机主体（下移 32px：底座底 280+32=312 正好站在地面线上） ═══ */}
        <g transform="translate(155,32)">
          {/* 地面投影 */}
          <ellipse cx="100" cy="282" rx="72" ry="8" fill="rgba(0,0,0,0.15)" />

          {/* 底座（白色磨砂电动机） */}
          <path
            d="M36 206
               Q30 206 30 214
               L30 262
               Q30 280 52 280
               L148 280
               Q170 280 170 262
               L170 214
               Q170 206 164 206
               Z"
            fill="url(#baseMain)"
          />
          <ellipse cx="100" cy="206" rx="70" ry="10" fill="#E2E2E2" />
          <ellipse cx="100" cy="206" rx="56" ry="6" fill="rgba(0,0,0,0.1)" />
          <path d="M36 208 Q30 206 34 206 L72 206 Q60 210 50 218 Q38 232 34 248 L30 262 L30 214 Z" fill="url(#baseTopHL)" />
          <path d="M30 262 Q30 280 52 280 L148 280 Q170 280 170 262 Z" fill="url(#baseBottom)" />
          <path d="M164 206 Q170 206 170 214 L170 262 L166 250 Q162 232 150 218 Q140 210 128 206 Z" fill="rgba(0,0,0,0.08)" />

          {/* 透明杯身（搅拌舱） */}
          <path
            d="M52 50 Q52 30 100 30 Q148 30 148 50 L148 200 Q148 206 142 206 L58 206 Q52 206 52 200 Z"
            fill="url(#glassMain)"
          />

          <g clipPath="url(#cupClip)">
            {/* 舱内水果：外层缓慢下沉（JS 逐帧），内层渐渐淡出（JS 逐帧） */}
            {smallFruits.map((f, i) => {
              const pos = stackPos(i);
              const fade = fades[i] ?? 0;
              if (fade >= 1) return null; // 完全消失后不再渲染
              const dy = sink * (174 - pos.y + extraSink);
              return (
                <g key={`${f.en}-${i}`} style={{ transform: `translateY(${dy}px)` }}>
                  <g
                    style={{
                      transformOrigin: `${pos.x}px ${pos.y}px`,
                      transform: `rotate(${pos.r}deg)`,
                      opacity: 1 - fade,
                    }}
                  >
                    <image href={`/fruits/${f.en}.webp`} x={pos.x - 30} y={pos.y - 30} width="60" height="60" />
                  </g>
                </g>
              );
            })}

            {/* 六片刀片（常驻舱内，空舱也不消失；飞入完成后才开始旋转，位于果汁之下，透汁隐约可见） */}
            <g>
              {BLADE_ANGLES.map((a) => (
                <rect
                  key={a}
                  x="96" y={bladeCenterY - 22} width="8" height="28" rx="4"
                  fill="#FFFFFF" opacity="0.92"
                  transform={`rotate(${a} 100 ${bladeCenterY})`}
                />
              ))}
              <circle cx="100" cy={bladeCenterY} r="7" fill="#F0F0F0" />
              {bladeSpinning && (
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from={`0 100 ${bladeCenterY}`}
                  to={`360 100 ${bladeCenterY}`}
                  dur="0.4s"
                  repeatCount="indefinite"
                />
              )}
            </g>

            {/* 注水动画：总量少于 3 份时先加纯净水，水柱从杯口落到液面，随液面上升变短 */}
            {pouring && (
              <rect
                  x="96" y="24" width="8" rx="4"
                  height={Math.max(surfaceY - 24, 4)}
                  fill="#DBEEF9" opacity="0.75"
                />
            )}

            {/* 果汁（最上层、略微透明 0.9：上涨时仍隐约可见下方水果沉降淡出；喝汁阶段液面匀速下降） */}
            {juiceLevel > 0 && (
              <g>
                <rect
                  x="52" y={surfaceY} width="96" height={206 - surfaceY}
                  fill={mixColor} opacity={juiceOpacity}
                  style={{ transition: 'fill 0.9s' }} // 注水（浅蓝）→ 果汁（混色）平滑过渡
                />
                <g className="juice-wave">
                  <ellipse cx="76" cy={surfaceY} rx="14" ry="4" fill="white" opacity="0.4" />
                  <ellipse cx="124" cy={surfaceY} rx="14" ry="4" fill="white" opacity="0.4" />
                </g>
                {/* 喝汁气泡：从舱底冒上来升到液面破裂；数量随果汁量 1~3 个，错峰一个接一个 */}
                {draining && juiceLevel > 6 && (() => {
                  const count = juiceLevel >= 37 ? 3 : juiceLevel >= 19 ? 2 : 1;
                  const xs = [82, 102, 119];
                  const rs = [3, 2.4, 2];
                  const rise = surfaceY - 196; // 升到液面略上方破裂（负值）
                  return (
                    <g fill="white">
                      {Array.from({ length: count }, (_, i) => (
                        <circle key={i} cx={xs[i]} cy="194" r={rs[i]} opacity="0">
                          <animateTransform
                            attributeName="transform"
                            type="translate"
                            from="0 0"
                            to={`0 ${rise}`}
                            dur="1.2s"
                            begin={`${i * 0.4}s`}
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0;0.85;0.7;0"
                            keyTimes="0;0.12;0.8;1"
                            dur="1.2s"
                            begin={`${i * 0.4}s`}
                            repeatCount="indefinite"
                          />
                        </circle>
                      ))}
                    </g>
                  );
                })()}
              </g>
            )}
          </g>

          {/* 杯身高光与杯口 */}
          <rect x="57" y="50" width="10" height="148" rx="5" fill="rgba(255,255,255,0.28)" />
          <rect x="133" y="60" width="6" height="110" rx="3" fill="rgba(255,255,255,0.12)" />
          <path
            d="M52 50 Q52 30 100 30 Q148 30 148 50"
            fill="none" stroke="rgba(180,190,200,0.6)" strokeWidth="2.5"
          />

          {/* 圆顶杯盖 */}
          <path
            d="M56 40 Q56 14 100 14 Q144 14 144 40"
            fill="url(#lidGrad)"
            stroke="rgba(180,190,200,0.5)" strokeWidth="2"
          />
          <path d="M62 36 Q66 18 92 16" stroke="rgba(255,255,255,0.4)" strokeWidth="4" strokeLinecap="round" fill="none" />

          {/* 吸管（喝汁阶段出现：先飞入插稳、一直伸到舱底，见底后上移拔出；
              液面以下只显示 20% 颜色——先画整根 0.2，再用跟随液面的裁剪区把水上部分画全色；
              果汁 100% 不透明（低出汁水果）时水下部分完全不可见） */}
          {draining && (
            <g className={strawOut ? 'straw-out' : 'straw-in'}>
              {juiceOpacity < 1 && (
                <path
                  d="M131 2 L120 28 L107 196"
                  stroke="#F08055" strokeOpacity="0.2" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"
                />
              )}
              <g clipPath="url(#strawAbove)">
                <path
                  d="M131 2 L120 28 L107 196"
                  stroke="#F08055" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" fill="none"
                />
                <path
                  d="M132 4 L122 26"
                  stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" fill="none"
                />
              </g>
            </g>
          )}

          {/* 电源按钮 */}
          <ellipse cx="100" cy="244" rx="20" ry="24" fill="rgba(0,0,0,0.08)" />
          <circle cx="100" cy="244" r="17" fill="url(#btnGrad)" />
          <circle cx="100" cy="244" r="17" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <path
            d="M100 234 v8 M95 240 a7 7 0 1 0 10 0"
            stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none"
          />
        </g>

        {/* ═══ 大水果碎果肉粒子：果肉色不规则液滴，从站位沿弧线越过杯口上方落入舱内；
                落舱后不消失，刀片工作时与中小型水果同节奏逐个榨没（淡出+微微沉底） ═══ */}
        {mist && (
          <g>
            {mistParticles.map((p, i) => {
              const t = Math.min(1, Math.max(0, (mistElapsed - p.delay) / p.dur));
              const u = 1 - t;
              // 二次贝塞尔插值（t=1 时停在舱内落点）
              const x = u * u * p.x0 + 2 * u * t * p.x1 + t * t * p.x2;
              let y = u * u * p.y0 + 2 * u * t * p.y1 + t * t * p.y2;
              let o = t < 0.15 ? (t / 0.15) * 0.85 : 0.85 - t * 0.1; // 落定后保持 0.75
              // 搅拌期：落定后的切块按序淡出，同时微微沉向舱底（不超过舱底 230）
              if (mistElapsed > grindStart && grindEnd > grindStart) {
                const span = Math.max(grindEnd - grindStart - 600, 1);
                const g = Math.min(1, Math.max(0, (mistElapsed - grindStart - (i / Math.max(mistParticles.length, 1)) * span) / 600));
                o *= 1 - g;
                y = Math.min(y + g * 10, 230);
              }
              if (o <= 0) return null;
              return (
                <path
                  key={p.key}
                  d={p.d}
                  fill={p.color}
                  opacity={o}
                  transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
                />
              );
            })}
          </g>
        )}
      </svg>

      {/* 开关热区（跟随机器中心 255/560, 276/340） */}
      <button
        type="button"
        onClick={onStart}
        disabled={!canStart}
        aria-label="开始榨汁"
        className={`absolute h-[34px] w-[34px] rounded-full ${
          canStart ? 'cursor-pointer switch-pulse' : 'cursor-not-allowed'
        }`}
        style={{ left: '45.5%', top: '81.2%', transform: 'translate(-50%,-50%)' }}
      />
    </div>
  );
}
