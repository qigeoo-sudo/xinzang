'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Header } from '@/components/header';
import JuicerMachine, { SelectedFruit, MistParticle, BIG_SLOTS, BIG_SIZE, stackPos, extraSinkFor } from './juicer-machine';
import { PageHero, StageShell, PaperPanel, StageTitle, StageCredits } from '@/components/page-shell';

// ── 类型 ──
interface GrowthData {
  registeredAt: string;
  loginCount: number;
  mentorCount: number;
  topMentors: { id: string; name: string; messageCount: number }[];
  totalMessages: number;
  validConversationCount: number;
  unlockedCount: number;
  primes: number[];
  fruits: { zh: string; en: string }[];
  mentorNames: string[];
  milestones: {
    id: string;
    sessionId: string;
    type: 'mini' | 'major';
    atCount: number;
    content: string;
    mentorName: string;
    createdAt: string;
  }[];
  sessions: { id: string }[];
}

// ── 常量 ──
const MAX_PER_FRUIT = 9; // 每样最多 9 份（总份数另受限）
const MAX_TOTAL = 9;     // 放入榨汁机的总份数上限
const MAX_JUICE = 86;    // 满榨（9 份）时果汁最多接近杯口直壁顶（约舱高 6/7）

// 大型水果：整颗站机器外地面，每样 1 份，影响果汁颜色但不进舱（菠萝按体型归入大水果）
const BIG_FRUITS = new Set([
  'watermelon', 'hami-melon', 'durian', 'jackfruit', 'coconut', 'soursop',
  'breadfruit', 'ambarella', 'mamey', 'baobab', 'bael', 'pineapple',
]);

// 水果 → 果汁颜色（果皮色，仅作果肉色缺失时的兜底）
const JUICE_COLOR_MAP: Record<string, string> = {
  apple: '#E94F4F', banana: '#F5D76E', mandarin: '#F39C12', watermelon: '#FF6B6B',
  orange: '#E67E22', pear: '#A8E6CF', grape: '#9B59B6', melon: '#98D8C8',
  'hami-melon': '#F7DC6F', kiwi: '#6B8E23', mango: '#F0B27A', 'dragon-fruit': '#FF69B4',
  pineapple: '#F4D03F', peach: '#FFB6C1', plum: '#8E44AD', 'winter-jujube': '#C0392B',
  strawberry: '#E74C3C', pomelo: '#F5B7B1', lychee: '#FADBD8', longan: '#D5CDB5',
  cherry: '#C0392B', persimmon: '#E67E22', pomegranate: '#C0392B', bayberry: '#8E44AD',
  coconut: '#D5CDB5', hawthorn: '#C0392B', blueberry: '#2C3E50', lemon: '#F7DC6F',
  avocado: '#6B8E23', kumquat: '#F39C12', grapefruit: '#F5B7B1', nectarine: '#F0B27A',
  'passion-fruit': '#9B59B6', guava: '#FADBD8', papaya: '#F0B27A', lime: '#A8E6CF',
  durian: '#F7DC6F', loquat: '#F39C12', apricot: '#F0B27A', fig: '#8E44AD',
  mangosteen: '#2C3E50', rambutan: '#E74C3C', mulberry: '#8E44AD', jackfruit: '#F7DC6F',
  raspberry: '#E74C3C', blackberry: '#2C3E50', 'wax-apple': '#E74C3C', 'custard-apple': '#98D8C8',
  olive: '#6B8E23', crabapple: '#C0392B', carambola: '#F7DC6F', 'yacón': '#F5D76E',
  physalis: '#F39C12', phyllanthus: '#A8E6CF', cranberry: '#C0392B', 'sea-buckthorn': '#F39C12',
  cili: '#E74C3C', gooseberry: '#A8E6CF', blackcurrant: '#2C3E50', redcurrant: '#E74C3C',
  kiwano: '#F39C12', canistel: '#F0B27A', 'date-palm': '#D5CDB5', salak: '#8E44AD',
  tamarind: '#D5CDB5', langsat: '#F5D76E', 'august-melon': '#98D8C8', sapodilla: '#D5CDB5',
  'buddha-hand': '#F7DC6F', hovenia: '#D5CDB5', 'finger-lime': '#A8E6CF', jabuticaba: '#8E44AD',
  'miracle-fruit': '#E74C3C', abiu: '#F7DC6F', acai: '#2C3E50', noni: '#98D8C8',
  soursop: '#98D8C8', bacuri: '#F5D76E', 'star-apple': '#9B59B6', breadfruit: '#98D8C8',
  ambarella: '#A8E6CF', mamey: '#E67E22', akebia: '#8E44AD', 'rose-apple': '#FADBD8',
  myrtle: '#8E44AD', pandanus: '#98D8C8', baobab: '#D5CDB5', feijoa: '#A8E6CF',
  pyracantha: '#E74C3C', elaeagnus: '#C0392B', 'rosa-roxburghii': '#E74C3C',
  'kakadu-plum': '#98D8C8', 'camu-camu': '#C0392B', bael: '#D5CDB5', gynura: '#98D8C8',
  pawpaw: '#F7DC6F', salmonberry: '#E74C3C', aronia: '#2C3E50', cloudberry: '#F39C12',
  'ceylon-olive': '#6B8E23',
};

// 水果 → 果肉颜色（榨汁混色与粒子雾的依据；2026-09-27 用户提供全量 100 种映射，按原值使用）
const FLESH_COLOR_MAP: Record<string, string> = {
  apple: '#FFFFF0', banana: '#FFF5EE', mandarin: '#FF7A00', watermelon: '#DC143C',
  orange: '#FFB800', pear: '#FFFFF0', grape: '#9370DB', melon: '#C8ECB4',
  'hami-melon': '#FF8C00', kiwi: '#8BD300', mango: '#FF9F00', 'dragon-fruit': '#FCE4EC',
  pineapple: '#FFFF00', peach: '#FFDAB9', plum: '#E8A000', 'winter-jujube': '#F0FFF0',
  strawberry: '#FF0000', pomelo: '#FFC0CB', lychee: '#FFF5EE', longan: '#FFF5EE',
  cherry: '#DC143C', persimmon: '#FF8C00', pomegranate: '#FF0000', bayberry: '#DC143C',
  coconut: '#FFFFFF', hawthorn: '#FFB6C1', blueberry: '#8A2BE2', lemon: '#FFF59D',
  avocado: '#C1FFC1', kumquat: '#FFA500', grapefruit: '#FF69B4', nectarine: '#FFD700',
  mangosteen: '#FFFFFF', rambutan: '#FFFFFF', mulberry: '#8B008B', jackfruit: '#FFD700',
  'passion-fruit': '#FFA500', guava: '#FF69B4', papaya: '#FF4500', lime: '#B7E39B',
  durian: '#F5E6B8', loquat: '#FFA500', apricot: '#FFA500', fig: '#8B008B',
  raspberry: '#FF0000', blackberry: '#000000', 'wax-apple': '#F0FFF0', 'custard-apple': '#FFFFFF',
  olive: '#808000', crabapple: '#FFFFF0', carambola: '#FFFF00', 'yacón': '#FFFFF0',
  physalis: '#FFA500', phyllanthus: '#FFFFF0', cranberry: '#FF0000', 'sea-buckthorn': '#FF8C00',
  cili: '#9ACD32', gooseberry: '#32CD32', blackcurrant: '#000000', redcurrant: '#FF0000',
  kiwano: '#32CD32', canistel: '#FFFF00', 'date-palm': '#A52A2A', salak: '#FFFFF0',
  tamarind: '#8B4513', langsat: '#FFFFFF', 'august-melon': '#FFFFFF', sapodilla: '#8B4513',
  'buddha-hand': '#FFFF00', hovenia: '#D2691E', 'finger-lime': '#FF69B4', jabuticaba: '#800080',
  'miracle-fruit': '#8B008B', abiu: '#FFFFFF', acai: '#000000', noni: '#FFFFF0',
  soursop: '#FFFFFF', bacuri: '#FFFFFF', 'star-apple': '#FFFFFF', breadfruit: '#FFFFF0',
  ambarella: '#FFA500', mamey: '#FFA500', akebia: '#FFFFFF', 'rose-apple': '#FFFFFF',
  myrtle: '#000000', pandanus: '#FFFFF0', baobab: '#FFFFFF', feijoa: '#FFFF00',
  pyracantha: '#FF4500', elaeagnus: '#FFD700', 'rosa-roxburghii': '#FFA500',
  'kakadu-plum': '#F0FFF0', 'camu-camu': '#FF8C00', bael: '#A52A2A', gynura: '#000000',
  pawpaw: '#FFFFF0', salmonberry: '#FF4500', aronia: '#000000', cloudberry: '#FFA500',
  'ceylon-olive': '#32CD32',
};

// 魔法光雾粒子的发射角度
const SPARKLE_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const MIST_ANGLES = [15, 55, 100, 145, 195, 240, 285, 325];

// hex → rgb
function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// 大水果对果汁颜色的体型权重（BIG_SIZE ÷ 40：椰子 2、西瓜 3、榴莲 5、菠萝蜜 3.6…），舱内水果为 1
const weightOf = (en: string) => (BIG_SIZE[en] ? BIG_SIZE[en] / 40 : 1);

// 低出汁水果：出汁率 0.1 = 柿子/香蕉/牛油果/榴莲/无花果；0.5 = 木瓜/芒果/金桔（苹果的 1/2）；
// 1/3 = 椰枣/橄榄。这些水果以果泥形式存在，杯中液体主要是注入的水，但混色权重不衰减（果泥照样上色）
const JUICE_YIELD: Record<string, number> = {
  persimmon: 0.1, banana: 0.1, avocado: 0.1, durian: 0.1, fig: 0.1,
  papaya: 0.5, mango: 0.5, kumquat: 0.5,
  'date-palm': 1 / 3, olive: 1 / 3,
};
const juiceYield = (en: string) => JUICE_YIELD[en] ?? 1;

// 加权平均混色：份数 × 体型权重
function mixColorsWeighted(entries: { color: string; weight: number }[]) {
  let r = 0, g = 0, b = 0, w = 0;
  for (const e of entries) {
    const c = hexToRgb(e.color);
    r += c.r * e.weight;
    g += c.g * e.weight;
    b += c.b * e.weight;
    w += e.weight;
  }
  const toHex = (v: number) => Math.round(v / w).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// sin/cos 不规则液滴形状：三瓣波动半径 + 中点平滑闭合（每粒生成一次，静态复用）
function blobPath(r: number, seed: number) {
  const n = 8;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.8 + 0.25 * Math.sin(seed + a * 3)); // 三瓣 sin 波动
    pts.push({ x: rr * Math.cos(a), y: rr * Math.sin(a) });
  }
  const mid = (p: { x: number; y: number }, q: { x: number; y: number }) => ({
    x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2,
  });
  const m0 = mid(pts[n - 1], pts[0]);
  let d = `M${m0.x.toFixed(1)} ${m0.y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % n]);
    d += ` Q${p.x.toFixed(1)} ${p.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`;
  }
  return `${d}Z`;
}

export default function DashboardPage() {
  const [data, setData] = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 每种已解锁水果的选中份数（en → 1..3；大水果 0..1）
  const [counts, setCounts] = useState<Record<string, number>>({});
  // 点击循环方向：加满后转为连减，减到 0 后转为连加
  const dirRef = useRef<Record<string, 'up' | 'down'>>({});
  const [juicing, setJuicing] = useState(false);
  const [draining, setDraining] = useState(false);
  // 整个榨汁流程进行中（开榨到喝完，大水果化雾后不闪回的依据）
  const [blending, setBlending] = useState(false);
  // 刀片旋转（粒子/果肉飞入舱完成后才开始搅拌）
  const [bladeSpin, setBladeSpin] = useState(false);
  // 每份舱内水果的淡出进度 0→1（JS 逐帧驱动；1 = 完全消失）
  const [fades, setFades] = useState<number[]>([]);
  const [juiceLevel, setJuiceLevel] = useState(0);
  // 果汁不透明度三档：普通 0.9；总出汁贡献 < 1 时 0.95；近乎纯榴莲泥（含榴莲且贡献 < 1）时 1.0
  const [juiceOpacity, setJuiceOpacity] = useState(0.9);
  // 水果沉降进度 0→1（JS 逐帧驱动，保证 2~3 秒匀速下塌）
  const [sink, setSink] = useState(0);
  // 拔吸管阶段（液面见底后吸管上移淡出）
  const [strawOut, setStrawOut] = useState(false);
  // 大水果粒子雾入舱阶段（开榨后 0~MIST_DUR：粒子从站位飘入机器口）
  const [mist, setMist] = useState(false);
  // 加水阶段（总量少于 3 份时，开榨先从注水口注入纯净水）
  const [pouring, setPouring] = useState(false);
  // 开榨后经过的毫秒数（驱动碎果肉粒子沿路径飞行）
  const [mistElapsed, setMistElapsed] = useState(0);
  const mistRef = useRef<MistParticle[]>([]);
  // 搅拌窗口（粒子落舱后的榨没时间表），开榨时写入
  const grindWindowRef = useRef({ start: 0, end: 0, water: false });
  // 自创鸡尾酒配方卡：每榨完一杯自动存档一张（最新在前）
  const [recipeCards, setRecipeCards] = useState<{ id: number; color: string; recipe: string }[]>([]);
  const recipeIdRef = useRef(0);
  const rafRef = useRef(0);
  const [mixColor, setMixColor] = useState('#F6A44C');

  // 金光爆发：在最顶层（fixed）渲染，避免被滚动容器裁剪
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  // 需要弹性出现动画的水果索引（新解锁时）
  const [appearIdx, setAppearIdx] = useState<Set<number>>(new Set());
  // 回顾补生成进行中
  const [catchingUp, setCatchingUp] = useState(false);
  // 对话回顾分组展开覆盖：最上面一组默认展开，其余默认折叠，点击后覆盖默认值
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({});
  const catchupStarted = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const burstIdRef = useRef(0);

  const after = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    timersRef.current.push(t);
  }, []);

  // 在指定屏幕坐标爆发金光（顶层渲染，约 1.9s 后自动移除）
  const triggerBurst = useCallback((x: number, y: number) => {
    const id = ++burstIdRef.current;
    setBursts((prev) => [...prev, { id, x, y }]);
    const t = setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 1900);
    timersRef.current.push(t);
  }, []);

  // 在某个水果元素中心爆发金光
  const burstAtElement = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    triggerBurst(r.left + r.width / 2, r.top + r.height / 2);
  }, [triggerBurst]);

  // 卸载清理
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    cancelAnimationFrame(rafRef.current);
  }, []);

  // 获取数据 + 检测新解锁水果（魔法闪光 + 自动滚动到新水果）
  useEffect(() => {
    // 透传 URL 查询串：?preview=221 时接口强制返回 221 轮示例场景（绕过登录态）
    const growthApi = `/api/growth${typeof window !== 'undefined' ? window.location.search : ''}`;
    Promise.all([
      fetch(growthApi).then((r) => r.json()),
      fetch('/api/auth/session').then((r) => r.json()),
    ])
      .then(([d, sess]) => {
        if (d.error) throw new Error(d.error);
        setData(d);

        const uid: string = sess?.user?.id || 'anon';
        const key = `growth-seen:${uid}`;
        let seenCount = 0;
        try { seenCount = Number(localStorage.getItem(key) || 0); } catch { seenCount = 0; }

        if (d.unlockedCount > seenCount) {
          const firstFresh = seenCount;
          const fresh = new Set<number>();
          for (let i = firstFresh; i < d.unlockedCount; i++) fresh.add(i);
          // 等水果渲染完：纵向滑到新水果位置，弹性出现 + 顶层金光爆发
          setTimeout(() => {
            const scroller = scrollRef.current;
            const row = scroller?.children[firstFresh] as HTMLElement | undefined;
            if (scroller && row) {
              scroller.scrollTo({
                top: row.offsetTop - scroller.clientHeight / 2 + row.offsetHeight / 2,
                behavior: 'smooth',
              });
            }
            setAppearIdx(fresh);
            setTimeout(() => setAppearIdx(new Set()), 1500);
            // 等滚动靠近后，在每个新水果上依次爆发金光
            fresh.forEach((i, k) => {
              setTimeout(() => {
                const rowEl = scroller?.children[i] as HTMLElement | undefined;
                const fruitEl = rowEl?.querySelector('[data-fruit]') as HTMLElement | null;
                if (fruitEl) burstAtElement(fruitEl);
              }, 500 + k * 260);
            });
          }, 450);
          try { localStorage.setItem(key, String(d.unlockedCount)); } catch { /* ignore */ }
        }

        // 自动补生成漏掉的小结/总结
        if (!catchupStarted.current && d.sessions?.length > 0) {
          catchupStarted.current = true;
          setCatchingUp(true);
          (async () => {
            try {
              for (const s of d.sessions) {
                for (;;) {
                  const r = await fetch('/api/chat/summary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: s.id }),
                  }).then((x) => x.json());
                  if (!r.triggered || r.caughtUp) break;
                }
              }
              const fresh = await fetch('/api/growth').then((x) => x.json());
              if (!fresh.error) setData(fresh);
            } finally {
              setCatchingUp(false);
            }
          })();
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // 点水果：连点连加（0→1→…→9），加满转连减，减到零转连加；每次点击爆发金光
  // 总份数上限 MAX_TOTAL：已满 9 份时新水果不再放行，点已选中的水果转为开始连减它
  // 方向计算放在 updater 外，避免 StrictMode 双调用污染方向状态
  const cycleFruit = useCallback((en: string, sourceEl?: HTMLElement | null) => {
    if (juicing || draining) return;
    const max = BIG_FRUITS.has(en) ? 1 : MAX_PER_FRUIT;
    const cur = counts[en] ?? 0;
    const dir = dirRef.current[en] ?? 'up';
    let next: number;
    if (dir === 'up') {
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (total >= MAX_TOTAL) {
        if (cur === 0) {
          if (sourceEl) burstAtElement(sourceEl);
          return; // 已满 9 份，不能再加新的
        }
        // 总数已满：点已选中的水果转为开始连减它，保证总量恒不超 9
        dirRef.current[en] = 'down';
        next = cur - 1;
      } else {
        next = Math.min(cur + 1, max);
        if (next >= max) dirRef.current[en] = 'down';
      }
    } else {
      next = Math.max(cur - 1, 0);
      if (next <= 0) dirRef.current[en] = 'up';
    }
    setCounts((prev) => {
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[en];
        return copy;
      }
      return { ...prev, [en]: next };
    });
    if (sourceEl) burstAtElement(sourceEl);
  }, [juicing, draining, counts, burstAtElement]);

  // 按下开关：整个榨汁时序用 JS 逐帧驱动（沉降、逐个淡出、液面涨、吸管喝掉）
  const startBlending = useCallback((smallList: SelectedFruit[], allList: SelectedFruit[]) => {
    if (juicing || allList.length === 0) return;
    cancelAnimationFrame(rafRef.current);
    setJuicing(true);
    setDraining(false);
    setStrawOut(false);
    setSink(0);
    setFades(smallList.map(() => 0));
    setJuiceLevel(0);
    setMistElapsed(0); // 显式清零，防止上一轮残留大值让粒子瞬移
    setMixColor(mixColorsWeighted(allList.map((s) => ({ color: s.color, weight: weightOf(s.en) }))));
    // 不透明度三档：普通 0.9；总出汁贡献 < 1 → 0.95；含榴莲且贡献 < 1（近乎纯榴莲泥）→ 1.0
    const totalYield = allList.reduce((sum, s) => sum + weightOf(s.en) * juiceYield(s.en), 0);
    const hasDurian = allList.some((s) => s.en === 'durian');
    setJuiceOpacity(hasDurian && totalYield < 1 ? 1 : totalYield < 1 ? 0.95 : 0.9);

    const n = smallList.length;
    // 果汁量换算：按体型加权 —— 中小水果每份权重 1，大水果按 BIG_SIZE÷40（椰子 2、西瓜 3、菠萝蜜 3.6…），
    // 即 1 份椰子 = 2 份苹果的汁量；9 份苹果 = MAX_JUICE（接近杯口直壁顶），超大组合封顶 MAX_JUICE 不外溢。
    // 低出汁水果果汁部分按 JUICE_YIELD 折算；加水量按名义液面的 14% 计算（纯 0.1 出汁水果 ×3），所以它们的杯中液体主要是水
    const nominalTotal = allList.reduce((sum, s) => sum + weightOf(s.en), 0);
    const juiceTotal = allList.reduce((sum, s) => sum + weightOf(s.en) * juiceYield(s.en), 0);
    const nominalLevel = Math.min(Math.round((nominalTotal / 9) * MAX_JUICE), MAX_JUICE);
    // 加水量为名义液面的 14%；当非低出汁水果的贡献占比 < 1/3（杯中几乎全是果泥），加水量 ×3 补足液体
    const normalYield = allList.reduce((sum, s) => sum + (juiceYield(s.en) > 0.1 ? weightOf(s.en) * juiceYield(s.en) : 0), 0);
    const waterLevel = Math.round(nominalLevel * 0.14 * (normalYield * 3 < juiceTotal ? 3 : 1));
    let targetLevel = Math.min(waterLevel + Math.round((juiceTotal / 9) * MAX_JUICE * 0.86), MAX_JUICE);

    // 配方文案：按放入顺序去重统计（水果中文名 × 份数）
    const order: string[] = [];
    const cnt = new Map<string, number>();
    for (const f of allList) {
      if (!cnt.has(f.en)) order.push(f.en);
      cnt.set(f.en, (cnt.get(f.en) || 0) + 1);
    }
    const recipeText = order
      .map((en) => {
        const zh = data?.fruits.find((x) => x.en === en)?.zh || en;
        return `${zh}×${cnt.get(en)}`;
      })
      .join(' · ');

    // 大水果碎果肉粒子入舱：每颗发射 48~84 粒不规则果肉液滴，从站位经机器口上方弧线落入舱内
    // （不用 SMIL：其 begin 相对页面打开时刻，第二次开榨时动画已全部过期、粒子不可见；
    //   改由主 rAF 循环逐帧算坐标。配置一次性生成存 ref，避免逐帧重渲染时随机数抖动导致粒子闪烁）
    const bigs = allList.filter((f) => BIG_FRUITS.has(f.en));
    const MIST_DUR = bigs.length > 0 ? 1800 : 0;
    mistRef.current = bigs.flatMap((f) => {
      const slot = BIG_SLOTS[f.en] ?? { x: 255, g: 280 };
      const size = BIG_SIZE[f.en] ?? 120;
      const sx = slot.x;
      const sy = slot.g - size / 2;
      // 西瓜汁液最丰，粒子数近乎翻倍；其余每颗 48 粒（原 14 粒的 3.4 倍）
      const count = f.en === 'watermelon' ? 84 : 48;
      return Array.from({ length: count }, (_, k) => {
        const x2 = 215 + ((k * 37) % 80); // 舱内落点撒开（杯内壁绝对 x 207~303）
        const y2 = 200 + ((k * 23) % 28); // 贴舱底铺落（舱底绝对 232 之上）
        return {
          key: `${f.en}-${k}`,
          d: blobPath(6 + ((k * 13) % 6), k * 7 + f.en.length), // 半径 6~11（原 3~6 的两倍），边缘 sin 不规则
          color: f.color,
          delay: (k * 43) % 320,
          dur: 780 + ((k * 31) % 350),
          x0: sx,
          y0: sy,
          x1: 255,
          // 控制点抬高：让曲线实际顶点约在 y≈30（杯口盖顶 46 上方附近）
          y1: 60 - 0.5 * (sy + y2),
          x2,
          y2,
        };
      });
    });

    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

    // 时间轴（ms）：开榨一律先加纯净水（0~WATER_DUR 注水），刀片等注水/飞入完成后才旋转；
    // 刀片旋转 0.1 秒后，水果沉降、逐个榨没、液面上升三者同时开始（果汁 0.95 微透明，沉降淡出全程隐约可见）
    const needWater = true;                      // 每次开榨先加水再榨
    const WATER_DUR = 1600;                      // 注水时长
    // 纯净水位线 waterLevel 已在上方按名义液面的 14% 计算
    const bladeStart = Math.max(MIST_DUR, needWater ? WATER_DUR : 0); // 刀片等注水/飞入完成后才转
    const FADE_DUR = 900;                        // 单个水果淡出时长
    const grindStart = bladeStart + 100;         // 刀片先转 0.1 秒，搅拌期正式开始
    const perAt = 420;                           // 水果逐个榨没的间隔
    // 舱内没有中小水果（纯大水果）时，也给落舱切块一个完整的榨没窗口，避免瞬间消失
    const blendEnd = n > 0 ? grindStart + (n - 1) * perAt + FADE_DUR : grindStart + 2200;
    grindWindowRef.current = { start: grindStart, end: blendEnd, water: needWater };
    const riseStart = grindStart;                // 液面与沉降同步起涨（加水场景从水位线接力）
    const riseEnd = Math.max(blendEnd, riseStart + 1400) + 800; // 液面涨慢 800ms，给沉降更多被看见的窗口
    const riseSpan = riseEnd - riseStart;
    // 满汁基准停留 400ms；沉降速度减半（窗口加倍）后，刀片要转到水果全部沉没才停机
    const settleBase = riseEnd + 400;
    // 沉降贯穿刀片旋转全程（bladeStart→settleEnd）：刀片开始转，舱内水果就同时开始从上往下缓降，与液面上涨无关。
    // 速度减半：水果在高处停留更久，液面才来得及涨到足够高度再触发「遮挡 +3%」上限，否则液面过早封顶
    const sinkSpan = 2 * Math.max(settleBase - bladeStart, 1);
    const settleEnd = bladeStart + sinkSpan;

    // 液面遮挡上限：液面一旦盖住舱内所有仍可见的水果，最多再上涨「当前高度」的 3%。
    // 数值扫描时间轴找遮挡时刻：遮挡需求 = 最高的仍可见水果顶部所在液面；
    // 水果边沉边淡出（与 step() 同一公式），已榨没的不计入。全程未遮挡则不设限。
    if (n > 0) {
      const perFadeScan = 0.7 / n;
      const eSink = extraSinkFor(n);
      const levelAt = (t: number) => waterLevel + (targetLevel - waterLevel) * clamp01((t - riseStart) / riseSpan);
      for (let k = 0; k <= 240; k++) {
        const t = riseStart + (riseSpan * k) / 240;
        const s = clamp01((t - bladeStart) / sinkSpan);
        let need = 0;
        for (let i = 0; i < n; i++) {
          if (clamp01((s - 0.25 - perFadeScan * i) / perFadeScan) >= 1) continue; // 已榨没，无需遮挡
          const pos = stackPos(i);
          const topY = pos.y - 30 + s * (174 - pos.y + eSink);
          need = Math.max(need, (200 - topY) / 1.7); // 1.7 = 每单位液面等级对应的像素高度
        }
        const lv = levelAt(t);
        if (lv >= need) {
          targetLevel = Math.min(targetLevel, Math.round(lv * 1.03));
          break;
        }
      }
    }

    const strawAt = settleEnd + 150;             // 吸管飞入（CSS 约 400ms）
    const drinkStart = strawAt + 550;            // 插稳后开始喝
    const drinkDur = 1600 + targetLevel * 8;     // 汁多喝久一点
    const drinkEnd = drinkStart + drinkDur;      // 液面见底
    const totalDur = drinkEnd + 450;             // 留时间演拔吸管

    const t0 = performance.now();
    const step = () => {
      const el = performance.now() - t0;
      const sinkNow = clamp01((el - bladeStart) / sinkSpan);
      setSink(sinkNow);
      // 淡出绑定沉降：全体先一起沉到 sink=0.25，再从舱底（序号 0）向上逐个榨没，每个水果 fade 占 0.7/n 的 sink 区间
      const fadeTotal = 0.7;
      const perFade = n > 0 ? fadeTotal / n : fadeTotal;
      setFades(smallList.map((_, i) => clamp01((sinkNow - 0.25 - perFade * i) / perFade)));
      // 液面：加水场景先注水到水位线（刀片启动前注完），搅拌期从水位接力涨到目标；吸管插稳后匀速吸到见底
      let level: number;
      if (needWater && el < riseStart) {
        level = waterLevel * clamp01(el / WATER_DUR);
      } else if (el < drinkStart) {
        const base = needWater ? waterLevel : 0;
        level = base + (targetLevel - base) * clamp01((el - riseStart) / riseSpan);
      } else {
        level = targetLevel * (1 - clamp01((el - drinkStart) / drinkDur));
      }
      setJuiceLevel(Math.round(level));
      setPouring(needWater && el < WATER_DUR); // 注水口只在加水阶段出水
      setMist(el < blendEnd + 100); // 粒子落舱后不消失，跟随搅拌期逐个榨没
      setMistElapsed(el);
      setBlending(el < totalDur);
      setBladeSpin(el >= bladeStart && el < settleEnd); // 注水/飞入完成后刀片才开始旋转
      setJuicing(el < settleEnd);
      setDraining(el >= strawAt && el < totalDur);
      setStrawOut(el >= drinkEnd);
      if (el < totalDur) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        // 收尾：清空榨汁机，配方卡存档（最新在前）
        setCounts({});
        dirRef.current = {};
        setFades([]);
        setJuiceLevel(0);
        setSink(0);
        setJuicing(false);
        setDraining(false);
        setStrawOut(false);
        setMist(false);
        setMistElapsed(0);
        setPouring(false);
        setBlending(false);
        setBladeSpin(false);
        const id = ++recipeIdRef.current;
        setRecipeCards((prev) => [
          { id, color: mixColorsWeighted(allList.map((s) => ({ color: s.color, weight: weightOf(s.en) }))), recipe: recipeText },
          ...prev,
        ]);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [juicing, data]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center bg-[#FDF6ED]">
          <div className="text-[#F08055] text-lg">加载中……</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center bg-[#FDF6ED]">
          <div className="text-red-500">{error || '加载失败'}</div>
        </div>
      </div>
    );
  }

  // 回顾时间戳：月日 + 时分秒（单独放第二行，不再挤在头部一行）
  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    const p = (v: number) => String(v).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  // 展开选中份数：舱内小水果按份数重复，大水果各 1 份站舱外
  const smallList: SelectedFruit[] = [];
  const bigList: SelectedFruit[] = [];
  for (const fruit of data.fruits) {
    const n = counts[fruit.en] ?? 0;
    if (n === 0) continue;
    const color = FLESH_COLOR_MAP[fruit.en] || JUICE_COLOR_MAP[fruit.en] || '#F6A44C';
    if (BIG_FRUITS.has(fruit.en)) {
      bigList.push({ en: fruit.en, color });
    } else {
      for (let k = 0; k < n; k++) smallList.push({ en: fruit.en, color });
    }
  }
  const totalCount = smallList.length + bigList.length;
  const regDate = new Date(data.registeredAt);

  // 小结的累计显示：有总结的导师写成「最新总结轮次+本次又聊轮数」（如 50+7），无总结原样
  const majorAtByName = new Map<string, number>();
  for (const x of data.milestones) {
    if (x.type === 'major' && x.atCount > (majorAtByName.get(x.mentorName) ?? 0)) {
      majorAtByName.set(x.mentorName, x.atCount);
    }
  }
  const atCountLabel = (m: GrowthData['milestones'][number]) => {
    if (m.type === 'major') return `累计 ${m.atCount} 轮`;
    const base = majorAtByName.get(m.mentorName) ?? 0;
    return base > 0 && base < m.atCount ? `累计 ${base}+${m.atCount - base} 轮` : `累计 ${m.atCount} 轮`;
  };

  // 对话回顾按导师分组：data.milestones 已是时间倒序，组的出现顺序即「最新聊的导师在最上」；
  // 组内第一张是最新卡——没逢整十是小结、恰逢整十是总结（逢整十那场不出小结）
  const byMentor = new Map<string, GrowthData['milestones']>();
  for (const m of data.milestones) {
    const arr = byMentor.get(m.mentorName);
    if (arr) arr.push(m);
    else byMentor.set(m.mentorName, [m]);
  }
  const milestoneGroups = [...byMentor.entries()].map(([name, items]) => ({ name, items }));

  // 水果勋章可见槽位：193 轮前，锁定槽只展示到 223（第 48 槽）；
  // 达到 193 轮后，在已解锁数量之上保留「下一个待解锁槽 + 其后再 8 个空槽」（共 9 个空槽，
  // 后八位不含紧挨最后水果的那个槽），随解锁进度往后推移（上限 100）
  const medalLimit = data.validConversationCount >= 193
    ? Math.min(data.unlockedCount + 9, data.primes.length)
    : data.primes.filter((p) => p <= 223).length;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      {/* 页头：杏红金渐变封面 + 白衬线大标题（同原成长追踪） */}
      <PageHero
        eyebrow="Growth Tracking"
        title="成长追踪"
        subtitle="从校园到职场，让每一步都意义非凡"
        watermark="长"
      />

      <StageShell masthead=" ">
        {/* 统计卡：四张小信纸 */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          <PaperPanel className="py-5 text-center">
            <p className="font-serif text-lg font-bold leading-snug text-brand-500">
              {regDate.getFullYear()}年
              <br />
              {regDate.getMonth() + 1}月{regDate.getDate()}日
            </p>
            <p className="mt-1 text-xs text-muted">首次注册</p>
          </PaperPanel>
          <PaperPanel className="py-5 text-center">
            <p className="font-serif text-3xl font-bold text-sage-600">{data.loginCount}</p>
            <p className="mt-1 text-xs text-muted">登录次数</p>
          </PaperPanel>
          <PaperPanel className="py-5 text-center">
            <p className="font-serif text-3xl font-bold text-sage-600">
              {data.mentorCount}<span className="text-lg"> 位</span>
            </p>
            <p className="mt-1 text-xs text-muted">聊过的导师</p>
          </PaperPanel>
          <PaperPanel className="py-5 text-center">
            <p className="font-serif text-3xl font-bold text-brand-500">
              {data.validConversationCount}<span className="text-lg"> 次</span>
            </p>
            <p className="mt-1 text-xs text-muted">有效对话</p>
          </PaperPanel>
        </div>

        {/* 前三位导师 */}
        {data.topMentors.length > 0 && (
          <div className="mb-6">
            <StageTitle>聊最多的Top3导师分身</StageTitle>
            <PaperPanel className="bg-[#F3F2E6]">
              <span className="mb-3 block h-1 w-10 rounded-full bg-[#7F9C70]" aria-hidden />
              <div className="space-y-2">
                {data.topMentors.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F6A44C] text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm text-brand-900">{m.name}</span>
                    <span className="text-xs text-muted">{m.messageCount} 条消息</span>
                  </div>
                ))}
              </div>
            </PaperPanel>
          </div>
        )}

        {/* 对话回顾：每 5 轮小结、每 15 轮总结，时间线常驻 */}
        <div className="mb-6">
          <div className="mb-3 flex items-center justify-between px-1">
            <StageTitle>对话回顾</StageTitle>
            {catchingUp && (
              <span className="flex items-center gap-1 text-xs text-[#F08055]">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#F6A44C] border-t-transparent" />
                回顾生成中
              </span>
            )}
          </div>
          <PaperPanel className="bg-[#EDF1F2]">
            <span className="mb-3 block h-1 w-10 rounded-full bg-[#7FB0C9]" aria-hidden />
            {data.milestones.length === 0 ? (
              <p className="rounded-xl bg-[#FDF6ED] p-3 text-center text-xs text-muted">
                {catchingUp ? '正在补写此前对话的回顾……' : '和导师每聊完一场，这里会有一张小结；某位导师累计聊满 10 轮，会有一张完整总结留作历史'}
              </p>
            ) : (
              <div className="growth-v-scroll max-h-[312px] overflow-y-auto pr-1">
                <div className="space-y-4">
                  {milestoneGroups.map((g, gi) => {
                    const open = groupOpen[g.name] ?? gi === 0; // 最上面一组默认展开，其余默认折叠
                    const visible = open ? g.items : g.items.slice(0, 1); // 折叠时只露最新一张
                    return (
                      <div key={g.name}>
                        {/* 组头：导师名 + 折叠开关（只有一张卡时无需开关） */}
                        <div className="mb-1.5 flex items-center justify-between px-1">
                          <span className="text-xs font-bold text-brand-900">{g.name}</span>
                          {g.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setGroupOpen((prev) => ({ ...prev, [g.name]: !open }))}
                              className="flex h-5 w-5 items-center justify-center rounded-full bg-[#EBD9C2] text-xs font-bold leading-none text-[#8a6d3b]"
                              aria-label={open ? `收起${g.name}的回顾` : `展开${g.name}的回顾`}
                            >
                              {open ? '−' : '+'}
                            </button>
                          )}
                        </div>
                        <div className="relative space-y-3 pl-4">
                          {/* 时间线竖轴 */}
                          <span className="absolute bottom-2 left-[5px] top-2 w-px bg-[#EBD9C2]" aria-hidden />
                          {visible.map((m) => {
                            const major = m.type === 'major';
                            return (
                              <div key={m.id} className="relative">
                                {/* 时间线圆点 */}
                                <span
                                  className={`absolute -left-4 top-3 h-2.5 w-2.5 rounded-full border-2 border-white ${major ? 'bg-[#F08055]' : 'bg-[#7FB0C9]'}`}
                                  aria-hidden
                                />
                                <div className="rounded-xl bg-[#FDF6ED] p-3">
                                  <div className="flex items-center gap-2">
                                    <span className={`text-[11px] font-bold ${major ? 'text-[#F08055]' : 'text-[#7FB0C9]'}`}>
                                      {major ? '总结' : '小结'}
                                    </span>
                                    <span className="ml-auto flex-none text-[10px] text-muted">{atCountLabel(m)}</span>
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-muted">{formatDateTime(m.createdAt)}</p>
                                  <p className="mt-1 text-sm leading-relaxed text-brand-900/75">{m.content}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </PaperPanel>
        </div>

        {/* 榨职机 · 成长实验室：水果勋章与榨汁台合为一张卡 */}
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between px-1">
            <StageTitle>榨职机 · 成长实验室</StageTitle>
            <span className="text-xs text-white/55">
              {data.unlockedCount}/{data.fruits.length} 已解锁
            </span>
          </div>
          <PaperPanel className="bg-[#F9F0E3]">
            <span className="mb-3 block h-1 w-10 rounded-full bg-[#F08055]" aria-hidden />
            <p className="mb-3 text-xs leading-relaxed text-muted">
              你与各位导师分身对话次数越多，解锁的水果勋章就越多。点击这些解锁的水果，可以玩创意鸡尾榨汁，也许会榨出奖励哦
            </p>

          <div
            ref={scrollRef}
            className="growth-v-scroll grid h-[252px] grid-cols-4 content-start justify-items-center gap-y-3 overflow-y-auto rounded-xl bg-[#FDF6ED] px-2 py-3"
          >
            {data.primes.slice(0, medalLimit).map((prime, idx) => {
              const fruit = data.fruits[idx];
              const unlocked = idx < data.unlockedCount;
              const count = counts[fruit.en] ?? 0;
              return (
                <button
                  key={prime}
                  type="button"
                  data-fruit
                  disabled={!unlocked || juicing || draining}
                  onClick={(e) => cycleFruit(fruit.en, e.currentTarget)}
                  className={`group relative h-12 w-12 ${
                    unlocked ? 'cursor-pointer transition-transform hover:scale-110 active:scale-95' : 'cursor-default'
                  }`}
                  aria-label={unlocked ? `选择${fruit.zh}` : '未解锁'}
                >
                  {unlocked ? (
                    <>
                      <Image
                        src={`/fruits/${fruit.en}.webp`}
                        alt={fruit.zh}
                        width={48}
                        height={48}
                        className={`h-full w-full object-contain ${appearIdx.has(idx) ? 'fruit-appear' : ''}`}
                        unoptimized
                      />
                      {/* 悬停名称标签：鼠标悬停 / 手指点按水果时浮现 */}
                      <span className="pointer-events-none absolute inset-x-0 -bottom-1 z-10 hidden justify-center group-hover:flex">
                        <span className="whitespace-nowrap rounded-md bg-[#2C3E5C]/85 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-md">
                          {fruit.zh}
                        </span>
                      </span>
                      {count > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F08055] px-1 text-[11px] font-bold text-white shadow">
                          {count}
                        </span>
                      )}
                    </>
                  ) : (
                    <span
                      className="flex h-full w-full items-center justify-center font-serif text-lg font-bold text-[#C9A96E]/70"
                      title={`第 ${prime} 次对话解锁`}
                    >
                      {prime}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 榨汁台：与勋章同卡，分隔线隔开 */}
          <div className="my-4 h-px bg-[#E5D8C4]" aria-hidden />
          <div className="flex flex-col items-center">
          <JuicerMachine
            smallFruits={smallList}
            bigFruits={bigList}
            fades={fades}
            juicing={juicing}
            draining={draining}
            strawOut={strawOut}
            mist={mist}
            mistParticles={mistRef.current}
            mistElapsed={mistElapsed}
            grindStart={grindWindowRef.current.start}
            grindEnd={grindWindowRef.current.end}
            pouring={pouring}
            blending={blending}
            bladeSpinning={bladeSpin}
            juiceLevel={juiceLevel}
            juiceOpacity={juiceOpacity}
            sink={sink}
            mixColor={grindWindowRef.current.water && mistElapsed < grindWindowRef.current.start ? '#DBEEF9' : mixColor}
            canStart={totalCount > 0 && !juicing && !draining}
            onStart={() => startBlending(smallList, [...smallList, ...bigList])}
          />
          <p className="mt-2 text-center text-xs text-muted">
            {juicing
              ? '混榨中……'
              : draining
                ? '咕嘟咕嘟……插上吸管喝掉这杯'
                : totalCount > 0
                  ? `已放 ${totalCount} 份水果，按机器上的绿色开关开榨`
                  : recipeCards.length > 0
                    ? '杯子空了，再配一杯新的试试'
                    : '点上面已解锁的水果放进榨汁机，共可放 9 份，每样不限'}
          </p>
            </div>

          {/* 创自己配方：每榨完一杯自动存档一张（最新在前），右上角 ✕ 可删除 */}
          {recipeCards.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 px-1 text-center text-xs text-white/55">创自己配方 · 已榨 {recipeCards.length} 杯</p>
              <div className="year-chips-scroll flex gap-2 overflow-x-auto pb-1">
                {recipeCards.map((c) => (
                  <div key={c.id} className="animate-rise relative flex-none rounded-xl bg-white px-3 py-2 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setRecipeCards((prev) => prev.filter((r) => r.id !== c.id))}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-300 text-[10px] leading-none text-white shadow-sm transition-colors hover:bg-gray-400 active:scale-90"
                      aria-label={`删除第 ${c.id} 杯配方`}
                    >
                      ✕
                    </button>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="text-[10px] font-semibold text-gray-400">第 {c.id} 杯</span>
                    </div>
                    <p className="mt-1 max-w-[150px] text-[11px] leading-snug text-gray-600">{c.recipe}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          </PaperPanel>
        </div>

        <StageCredits lang="zh" />
      </StageShell>

      {/* 顶层金光光雾爆发（不受滚动容器裁剪） */}
      {bursts.map((b) => (
        <span
          key={b.id}
          className="burst pointer-events-none fixed z-[70]"
          style={{ left: b.x, top: b.y }}
          aria-hidden
        >
          <span className="burst-core" />
          <span className="burst-ring" />
          {SPARKLE_ANGLES.map((ang, k) => (
            <i
              key={`s${k}`}
              className="sparkle-particle"
              style={{
                ['--ang' as string]: `${ang}deg`,
                ['--dist' as string]: `${40 + (k % 3) * 12}px`,
                animationDelay: `${k * 0.02}s`,
              }}
            />
          ))}
          {MIST_ANGLES.map((ang, k) => (
            <i
              key={`m${k}`}
              className="mist-particle"
              style={{
                ['--ang' as string]: `${ang}deg`,
                ['--dist' as string]: `${55 + (k % 4) * 10}px`,
                animationDelay: `${0.05 + k * 0.04}s`,
              }}
            />
          ))}
        </span>
      ))}
    </div>
  );
}
