'use client';

/**
 * 导师管理 — 整体排序 / 对话效果汇总 / 用户画像汇总
 * 整体排序支持从高到低/从低到高切换；对话效果点表头选列、总计行右侧按钮统一切换方向，底部分页；
 * 用户画像为 9 组 Top3 表格：饼图（默认，Top3 三块带百分比、其余为其他空白）/柱图/文字三模式；
 * 导师称呼、帮助人数两列冻结，表格顶部与底部各有一根双向同步的横向滚动条；
 * 仅导师称呼/帮助人数可排序，方向按钮在权益行，底部分页。容器宽 1720px。
 * 数据区间显示在顶栏面包屑右侧。
 * 导师姓名可点击，进入导师视角预览页（该导师登录导师后台看到的一切）。
 * 审核信息：待审核可点开浮窗，逐条通过/退回（退回需填理由）；demo 阶段仅本地生效。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { useAdminApi } from '@/components/admin-console/use-admin-api';
import { Pagination, paginate } from '@/components/admin-console/pagination';
import { ViewState } from '@/components/mentor-console/stat-card';
import { GoldFlakes, PaperCredits } from '@/components/page-shell';
import { SUBSCRIPTION_PLANS } from '@/lib/plans';
import { AMORT_DAYS, CREDIT_PACK_UNIT_YUAN } from '@/lib/tier-score';

interface PendingItem { id: string; type: string; title: string; submittedAt: string }
interface Review { status: 'APPROVED' | 'PENDING' | 'REJECTED'; pendingItems: PendingItem[]; lastReviewAt: string | null; rejectReason: string | null }
interface DialogueStats {
  helpedUsers: number; validSessions: number; rounds: number; freeTrialRounds?: number;
  likes: number; dislikes: number; reports: number; avgRoundsPerSession: number;
  durationMin: number;
}
interface NameCount { label: string; count: number }
/** 知识卡匹配：≥80% 命中项（专业/职业/RIASEC），分数为匹配度 0-100 */
interface KmHit { name: string; score: number }
/** 命中知识卡（命中分布 Top3） */
interface KmCard {
  cardId: string; domain: string; title: string;
  coreView: string; applicableTo: string; demoInferred?: boolean;
}
/** 知识卡匹配 tab 数据契约（demo 阶段由生成脚本产出；真实版命中卡/主题来自问答日志）
 * 专业/兴趣展示匹配度前 3 名（不设门槛）；职业方向仅列 ≥80% 命中 */
interface KnowledgeMatch {
  majorTop3: KmHit[]; riasecTop3: KmHit[]; careerHits: KmHit[];
  topCards: KmCard[]; topThemes: string[]; demoInferred?: boolean;
}
/** 用户画像：各维度 Top3（状态为固定三项），契约对齐 UserProfile / InterestAssessment */
interface AudienceStats {
  status: NameCount[];          // 在校/在职/待业（合计=帮助人数）
  majors: NameCount[];          // 专业分类 Top3（major）
  hopeLocations: NameCount[];   // 希望地点 Top3（workProvince·workCity 复合）
  currentLocations: NameCount[];// 目前地点 Top3（curProvince·curCity 复合）
  careers: NameCount[];         // 职业方向 Top3（careers）
  anxieties: NameCount[];       // 最大焦虑 Top3（careerAnxiety 文本归一）
  helpWanted: NameCount[];      // 希望帮助 Top3（helpPriority）
  deepChat: NameCount[];        // 深聊对象 Top3（mentorPreference）
  riasec: NameCount[];          // 兴趣代码 Top3（六类型单独累加）
}
interface MentorRow {
  id: string; name: string; chineseName: string; tier: string;
  revenueYuan: number; subscribers: number; importedAt: string;
  totalDurationMin: number; rounds: number; knowledgeCards: number; caseCards: number;
  /** 订阅人次（周期内购卡张数，含续费）按月/季/年分 */
  subPlans: { monthly: number; quarterly: number; yearly: number };
  /** 经该导师专属渠道引流的注册人数 */
  referrals: number;
  /** 推荐覆盖人数（网站把该导师卡片推荐给了多少人，mentor_card.impression 去重） */
  recommendedReach: number;
  /** 主页访问人数（导师分身主页访问去重，mentor_profile.view 去重） */
  profileVisits: number;
  /** caseshare 案例提交数（一般一次提交一个 case） */
  caseCount: number;
  /** 导师后台登录次数（关心指标用） */
  loginCount: number;
  dialogue: DialogueStats & { paid: DialogueStats; free: DialogueStats };
  audience: AudienceStats & { paid: AudienceStats; free: AudienceStats };
  knowledgeMatch?: KnowledgeMatch;
  review: Review;
}
interface MentorsResponse { dateRange: { start: string | null; end: string }; mentors: MentorRow[] }

/** 排序按钮分组色（避开导航/tab 的墨绿 #55734B） */
type SortGroup = 'data' | 'identity' | 'care';
const GROUP_ACTIVE: Record<SortGroup, string> = {
  data: 'bg-[#0e7490] text-white',
  identity: 'bg-[#7c5c93] text-white',
  care: 'bg-[#be185d] text-white',
};
const GROUP_IDLE: Record<SortGroup, string> = {
  data: 'border border-cyan-200 bg-cyan-50/60 text-cyan-800 hover:bg-cyan-100/70',
  identity: 'border border-purple-200 bg-purple-50/60 text-purple-800 hover:bg-purple-100/70',
  care: 'border border-pink-200 bg-pink-50/60 text-pink-800 hover:bg-pink-100/70',
};

const SORTS = [
  { key: 'importedAt', label: '入库时间', group: 'data' },
  { key: 'revenue', label: '订阅金额', group: 'data' },
  { key: 'subCount', label: '订阅人次', group: 'data' },
  { key: 'referrals', label: '渠道引流', group: 'data' },
  { key: 'reach', label: '推荐覆盖', group: 'data' },
  { key: 'profileVisits', label: '主页访问', group: 'data' },
  { key: 'cards', label: '知识卡数量', group: 'data' },
  { key: 'cases', label: '案例提交数', group: 'data' },
  { key: 'nameEn', label: '英文名姓', group: 'identity' },
  { key: 'nameZh', label: '中文姓名', group: 'identity' },
  { key: 'review', label: '审核信息', group: 'identity' },
  { key: 'care', label: '关心度', group: 'care' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

const REVIEW_ORDER: Record<Review['status'], number> = { PENDING: 0, REJECTED: 1, APPROVED: 2 };
const REVIEW_TEXT: Record<Review['status'], string> = { PENDING: '待审核', REJECTED: '已退回', APPROVED: '已通过' };

const PLAN_PRICE: Record<'MONTHLY' | 'QUARTERLY' | 'YEARLY', number> = {
  MONTHLY: SUBSCRIPTION_PLANS.find((p) => p.id === 'MONTHLY')!.price,
  QUARTERLY: SUBSCRIPTION_PLANS.find((p) => p.id === 'QUARTERLY')!.price,
  YEARLY: SUBSCRIPTION_PLANS.find((p) => p.id === 'YEARLY')!.price,
};

/** 整体排序各维度的方向文案：[从高到低方向, 从低到高方向] */
const DIR_LABELS: Record<SortKey, [string, string]> = {
  importedAt: ['最新在前', '最早在前'],
  revenue: ['从高到低', '从低到高'],
  subCount: ['从高到低', '从低到高'],
  referrals: ['从高到低', '从低到高'],
  reach: ['从高到低', '从低到高'],
  profileVisits: ['从高到低', '从低到高'],
  cards: ['从高到低', '从低到高'],
  cases: ['从高到低', '从低到高'],
  nameEn: ['Z→A', 'A→Z'],
  nameZh: ['Z→A', 'A→Z'],
  review: ['待审核优先', '已通过优先'],
  care: ['间隔短在前', '间隔长在前'],
};

type DlgKey =
  | 'mentorName' | 'helpedUsers' | 'durationMin' | 'validSessions' | 'rounds'
  | 'avgRoundsPerSession' | 'likes' | 'dislikes' | 'reports';
type AudSortKey = 'mentorName' | 'helpedUsers';
type EquityMode = 'total' | 'paid' | 'free';

const EQUITY_OPTIONS: { key: EquityMode; label: string }[] = [
  { key: 'total', label: '总权益' },
  { key: 'paid', label: '付费权益' },
  { key: 'free', label: '免费权益' },
];
const EQUITY_TEXT: Record<EquityMode, string> = { total: '总权益', paid: '付费权益', free: '免费权益' };

const DLG_LABELS: Record<DlgKey, string> = {
  mentorName: '导师称呼',
  helpedUsers: '帮助人数', durationMin: '对话时长', validSessions: '有效线程', rounds: '轮次',
  avgRoundsPerSession: '场均轮次', likes: '赞', dislikes: '踩', reports: '报错',
};
const DLG_COLS: { key: DlgKey; right?: boolean }[] = [
  { key: 'helpedUsers', right: true },
  { key: 'durationMin', right: true },
  { key: 'validSessions', right: true },
  { key: 'rounds', right: true },
  { key: 'avgRoundsPerSession', right: true },
  { key: 'likes', right: true },
  { key: 'dislikes', right: true },
  { key: 'reports', right: true },
];
/** 用户画像列定义（前两列冻结，其余为 Top3 展示列）；宽度单位 px，供冻结列偏移对齐 */
const AUD_COLUMNS: { key: keyof AudienceStats; label: string; w: number }[] = [
  { key: 'status', label: '目前状态', w: 140 },
  { key: 'majors', label: '专业分类 Top3', w: 168 },
  { key: 'hopeLocations', label: '希望地点 Top3', w: 156 },
  { key: 'currentLocations', label: '目前地点 Top3', w: 156 },
  { key: 'careers', label: '职业方向 Top3', w: 168 },
  { key: 'anxieties', label: '最大焦虑 Top3', w: 180 },
  { key: 'helpWanted', label: '希望帮助 Top3', w: 180 },
  { key: 'deepChat', label: '深聊对象 Top3', w: 156 },
  { key: 'riasec', label: '兴趣代码 Top3', w: 140 },
];
/** 前两列冻结宽度 */
const AUD_FROZEN_W = [148, 84];
/** 表格最小宽度（冻结列 + 9 个 Top3 列） */
const AUD_TABLE_W = AUD_FROZEN_W[0] + AUD_FROZEN_W[1] + AUD_COLUMNS.reduce((s, c) => s + c.w, 0);
/** 冻结列不透明底色（表头/白行/斑马行各一份，滚动时盖住下方内容） */
const AUD_HEAD_BG = '#efeeeb';
const AUD_ROW_BG = ['#ffffff', '#f6f5f2'];

/** 知识卡匹配表列宽：冻结 导师称呼/知识卡数量 + 专业Top3/兴趣Top3/职业≥80 + 命中分布 + 匹配分析
 *  top3=取匹配度前三（无门槛）；hits=仅 ≥80% 命中（可能为空） */
const KM_FROZEN_W = [148, 92];
type KmColKey = 'majorTop3' | 'riasecTop3' | 'careerHits';
const KM_HIT_COLS: { key: KmColKey; label: string; w: number; variant: 'top3' | 'hits' }[] = [
  { key: 'majorTop3', label: '专业分类 Top3', w: 196, variant: 'top3' },
  { key: 'riasecTop3', label: '兴趣测试 Top3', w: 176, variant: 'top3' },
  { key: 'careerHits', label: '职业方向 ≥80%', w: 212, variant: 'hits' },
];
const KM_CARDS_W = 264;
const KM_THEMES_W = 224;
const KM_TABLE_W = KM_FROZEN_W[0] + KM_FROZEN_W[1] + KM_HIT_COLS.reduce((s, c) => s + c.w, 0) + KM_CARDS_W + KM_THEMES_W;

/** 入库天数（入库日期 → 数据区间末日） */
function daysSince(date: string, end: string): number {
  const a = new Date(`${date}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

/** 关心指标：平均多少天登录 1 次 = 入库天数 / 登录总次数 */
function careGapDays(m: MentorRow, end: string): number {
  return daysSince(m.importedAt, end) / Math.max(1, m.loginCount);
}

/** 订阅人次合计 */
function subCountOf(m: MentorRow): number {
  return m.subPlans.monthly + m.subPlans.quarterly + m.subPlans.yearly;
}

/** 分钟 → 「X 小时」展示（整小时） */
function hoursOf(min: number): string {
  return `${Math.round(min / 60).toLocaleString()} 小时`;
}

/**
 * 导师称呼字典序：先英文名（first name）再英文姓（last name）。
 * 返回 A→Z 方向的比较结果（负/0/正），与 localeCompare('en') 同向。
 */
function compareMentorName(a: string, b: string): number {
  const parts = (s: string): [string, string] => {
    const i = s.trim().indexOf(' ');
    return i === -1 ? [s.toLowerCase(), ''] : [s.slice(0, i).toLowerCase(), s.slice(i + 1).toLowerCase()];
  };
  const [fa, la] = parts(a);
  const [fb, lb] = parts(b);
  return fa.localeCompare(fb, 'en') || la.localeCompare(lb, 'en');
}

/** 饼图三色 + 其他空白（近纸色，只勾细边） */
const TOP3_COLORS = ['#0e7490', '#b45309', '#7c5c93'];
const OTHER_COLOR = '#efece8';

function donutArc(cx: number, cy: number, rO: number, rI: number, a0: number, a1: number): string {
  const pt = (r: number, a: number): [number, number] => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(rO, a0);
  const [x1, y1] = pt(rO, a1);
  const [ix1, iy1] = pt(rI, a1);
  const [ix0, iy0] = pt(rI, a0);
  return `M${x0} ${y0} A${rO} ${rO} 0 ${large} 1 ${x1} ${y1} L${ix1} ${iy1} A${rI} ${rI} 0 ${large} 0 ${ix0} ${iy0} Z`;
}

/**
 * 用户画像 Top3 单元格：
 * - pie 模式（默认）：环形饼图，Top3 三块各带百分比，剩余份额为近纸色空白（=其他）；右侧图例只列名称；鼠标悬停弹出放大 3.2 倍浮窗（含人数与百分比）
 * - bar 模式：三行「标签 · 人数」+ 横柱条（满长=帮助人数，各柱按人数占比；前三名青/赭/紫）
 * - text 模式：纯文本面包屑「标签 人数 · 标签 人数 …」
 */
function Top3Cell({ items, mode, w, base }: {
  items: NameCount[]; mode: 'pie' | 'bar' | 'text'; w: number; base: number;
}) {
  // 饼图/柱图共同分母：帮助人数
  const denom = Math.max(1, base);
  if (mode === 'text') {
    return (
      <span className="text-xs leading-5 text-stone-600">
        {items.map((x, i) => (
          <span key={x.label}>
            {i > 0 && <span className="mx-1 text-stone-300">·</span>}
            {x.label}
            <b className="ml-0.5 font-semibold text-stone-800">{x.count}</b>
          </span>
        ))}
      </span>
    );
  }

  if (mode === 'bar') {
    // 满长基准=帮助人数（非格内最大值），各柱长=人数/帮助人数
    const bar = ['bg-[#0e7490]', 'bg-[#b45309]', 'bg-[#7c5c93]'];
    return (
      <div className="space-y-1" style={{ width: w }}>
        {items.map((x, i) => (
          <div key={x.label}>
            <div className="flex items-baseline justify-between gap-2 text-[11px] leading-4">
              <span className="truncate text-stone-600">{x.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-stone-800">{x.count}</span>
            </div>
            <div className="mt-0.5 h-1.5 w-full rounded-full bg-stone-100">
              <div className={`h-full rounded-full ${bar[i]}`} style={{ width: `${Math.max(3, (x.count / denom) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // pie：Top3 之外为「其他」空白
  const otherN = Math.max(0, denom - items.reduce((s, x) => s + x.count, 0));
  const segs = [
    ...items.map((x, i) => ({ ...x, color: TOP3_COLORS[i], other: false })),
    ...(otherN > 0 ? [{ label: '其他', count: otherN, color: OTHER_COLOR, other: true }] : []),
  ];
  let acc = -Math.PI / 2;
  const arcs = segs.map((s) => {
    const a0 = acc;
    const a1 = acc + (s.count / denom) * Math.PI * 2;
    acc = a1;
    return { ...s, a0, a1, pct: (s.count / denom) * 100 };
  });

  return <PieWithZoom arcs={arcs} items={items} denom={denom} w={w} />;
}

/** 环形饼图本体；size 控制渲染像素，viewBox 固定 100，百分比文字随尺寸缩放 */
function PieDonut({ arcs, size, labelMinPct }: {
  arcs: { label: string; color: string; other: boolean; a0: number; a1: number; pct: number }[];
  size: number;
  labelMinPct: number;
}) {
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="shrink-0">
      {arcs.map((s) => (
        <path key={s.label} d={donutArc(50, 50, 35, 20, s.a0, s.a1)} fill={s.color} stroke="#ffffff" strokeWidth={0.8} />
      ))}
      {arcs.filter((s) => !s.other && s.pct >= labelMinPct).map((s) => {
        const mid = (s.a0 + s.a1) / 2;
        return (
          <text
            key={`t-${s.label}`}
            x={50 + 27 * Math.cos(mid)}
            y={50 + 27 * Math.sin(mid)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size > 100 ? 7 : 7.5}
            fontWeight="700"
            fill="#ffffff"
          >
            {Math.round(s.pct)}%
          </text>
        );
      })}
    </svg>
  );
}

/** 饼图单元格 + 悬停浮窗（放大 3.2 倍，fixed 定位避免被表格滚动容器裁剪） */
function PieWithZoom({ arcs, items, denom, w }: {
  arcs: { label: string; color: string; other: boolean; a0: number; a1: number; pct: number; count: number }[];
  items: NameCount[];
  denom: number;
  w: number;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);

  // 浮窗按内容自适应宽度（完整显示标签），渲染后实测尺寸再定位并钳制在视口内
  useLayoutEffect(() => {
    if (!anchor || !popRef.current) return;
    const el = popRef.current;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const x = Math.min(window.innerWidth - pw - 8, Math.max(8, anchor.left + anchor.width / 2 - pw / 2));
    // 默认在单元格下方，超出视口则翻到上方
    const below = anchor.bottom + 10 + ph < window.innerHeight;
    const y = below ? anchor.bottom + 10 : Math.max(8, anchor.top - ph - 10);
    setPlaced({ x, y });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor]);

  return (
    <div
      className="inline-flex cursor-default items-center gap-1.5"
      style={{ width: w }}
      onMouseEnter={(e) => { setAnchor(e.currentTarget.getBoundingClientRect()); }}
      onMouseLeave={() => setAnchor(null)}
    >
      <PieDonut arcs={arcs} size={56} labelMinPct={9} />
      <div className="min-w-0 flex-1 space-y-0.5">
        {items.map((x, i) => (
          <div key={x.label} className="flex items-center gap-1 text-[11px] leading-4 text-stone-600">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: TOP3_COLORS[i] }} />
            <span className="truncate">{x.label}</span>
          </div>
        ))}
      </div>
      {anchor && (
        <div
          ref={popRef}
          className="fixed z-50 w-max max-w-[calc(100vw-16px)] rounded-2xl bg-white p-3.5 opacity-0 shadow-2xl ring-1 ring-stone-900/10"
          style={placed ? { left: placed.x, top: placed.y, opacity: 1, pointerEvents: 'none' } : undefined}
        >
          <div className="flex items-center gap-3">
            <PieDonut arcs={arcs} size={179} labelMinPct={6} />
            <div className="space-y-1 pr-1">
              {arcs.map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-4 whitespace-nowrap text-xs leading-5">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                    <span className={s.other ? 'text-stone-400' : 'font-medium text-stone-700'}>{s.label}</span>
                  </span>
                  <span className="tabular-nums text-stone-500">{s.count} 人</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 border-t border-stone-100 pt-1.5 text-[10px] text-stone-400">分母：帮助人数 {denom} 人</p>
        </div>
      )}
    </div>
  );
}

/** 知识卡匹配：≥80% 命中项配色（命中块可能 1-4 个，循环取色） */
const KM_COLORS = ['#0e7490', '#b45309', '#7c5c93', '#9d3b55'];

/** 命中饼图：块面积按匹配度归一化分摊整圆，块上文字标注原始匹配度分数（非份额） */
function KmDonut({ segs, size }: {
  segs: { name: string; score: number; share: number; color: string }[];
  size: number;
}) {
  let acc = -Math.PI / 2;
  const arcs = segs.map((s) => {
    const a0 = acc;
    const a1 = acc + s.share * Math.PI * 2;
    acc = a1;
    return { ...s, a0, a1 };
  });
  return (
    <svg viewBox="0 0 100 100" style={{ width: size, height: size }} className="shrink-0">
      {arcs.map((s) => (
        <path key={s.name} d={donutArc(50, 50, 35, 20, s.a0, s.a1)} fill={s.color} stroke="#ffffff" strokeWidth={0.8} />
      ))}
      {arcs.map((s) => {
        const mid = (s.a0 + s.a1) / 2;
        // 仅一块命中时文字放圆心
        const r = segs.length === 1 ? 0 : 27;
        return (
          <text
            key={`t-${s.name}`}
            x={50 + r * Math.cos(mid)}
            y={50 + r * Math.sin(mid)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size > 100 ? 7 : 7.5}
            fontWeight="700"
            fill="#ffffff"
          >
            {s.score}%
          </text>
        );
      })}
    </svg>
  );
}

/** 命中饼图 + 悬停放大浮窗（3.2 倍），fixed 定位避免被滚动容器裁剪 */
function KmPieZoom({ segs, w, footer }: {
  segs: { name: string; score: number; share: number; color: string }[];
  w: number;
  footer: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !popRef.current) return;
    const el = popRef.current;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    const x = Math.min(window.innerWidth - pw - 8, Math.max(8, anchor.left + anchor.width / 2 - pw / 2));
    const below = anchor.bottom + 10 + ph < window.innerHeight;
    const y = below ? anchor.bottom + 10 : Math.max(8, anchor.top - ph - 10);
    setPlaced({ x, y });
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchor]);

  return (
    <div
      className="inline-flex cursor-default items-center gap-1.5"
      style={{ width: w }}
      onMouseEnter={(e) => setAnchor(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => setAnchor(null)}
    >
      <KmDonut segs={segs} size={56} />
      <div className="min-w-0 flex-1 space-y-0.5">
        {segs.map((s) => (
          <div key={s.name} className="flex items-center gap-1 text-[11px] leading-4 text-stone-600">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="truncate">{s.name}</span>
          </div>
        ))}
      </div>
      {anchor && (
        <div
          ref={popRef}
          className="fixed z-50 w-max max-w-[calc(100vw-16px)] rounded-2xl bg-white p-3.5 opacity-0 shadow-2xl ring-1 ring-stone-900/10"
          style={placed ? { left: placed.x, top: placed.y, opacity: 1, pointerEvents: 'none' } : undefined}
        >
          <div className="flex items-center gap-3">
            <KmDonut segs={segs} size={179} />
            <div className="space-y-1 pr-1">
              {segs.map((s) => (
                <div key={s.name} className="flex items-center justify-between gap-4 whitespace-nowrap text-xs leading-5">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
                    <span className="font-medium text-stone-700">{s.name}</span>
                  </span>
                  <span className="tabular-nums text-stone-500">{s.score}%</span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 border-t border-stone-100 pt-1.5 text-[10px] text-stone-400">{footer}</p>
        </div>
      )}
    </div>
  );
}

/**
 * 知识卡匹配置信格：
 * - variant=top3：固定取匹配度前 3 名（不设 80 门槛），饼/柱/文字都展示三项
 * - variant=hits：仅 ≥80% 命中项，可能为空（显示空态）
 * - pie（默认）：各项按分数归一化画饼，块上标原始匹配度
 * - bar：满格=100 分，柱长即匹配度
 * - text：面包屑「名称 88%」
 */
function KmHitCell({ hits, mode, w, variant }: {
  hits: KmHit[]; mode: 'pie' | 'bar' | 'text'; w: number; variant: 'top3' | 'hits';
}) {
  const footer = variant === 'top3'
    ? '匹配度前 3 名 · 饼块按匹配度归一化'
    : '仅列 ≥80% 命中项 · 饼块按匹配度归一化';
  if (hits.length === 0) {
    return <div style={{ width: w }} className="text-xs text-stone-300">无 ≥80% 匹配</div>;
  }
  if (mode === 'text') {
    return (
      <span className="inline-block text-xs leading-5 text-stone-600" style={{ width: w }}>
        {hits.map((x, i) => (
          <span key={x.name}>
            {i > 0 && <span className="mx-1 text-stone-300">·</span>}
            {x.name}
            <b className="ml-0.5 font-semibold text-stone-800">{x.score}%</b>
          </span>
        ))}
      </span>
    );
  }
  if (mode === 'bar') {
    return (
      <div className="space-y-1" style={{ width: w }}>
        {hits.map((x, i) => (
          <div key={x.name}>
            <div className="flex items-baseline justify-between gap-2 text-[11px] leading-4">
              <span className="truncate text-stone-600">{x.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-stone-800">{x.score}%</span>
            </div>
            <div className="mt-0.5 h-1.5 w-full rounded-full bg-stone-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${x.score}%`, backgroundColor: KM_COLORS[i % KM_COLORS.length] }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const total = hits.reduce((s, x) => s + x.score, 0);
  const segs = hits.map((x, i) => ({ ...x, share: x.score / total, color: KM_COLORS[i % KM_COLORS.length] }));
  return <KmPieZoom segs={segs} w={w} footer={footer} />;
}

/** 命中分布 Top3：单元格列摘要，点击浮窗看知识卡四要素全文 */
function TopCardsCell({ cards, w }: { cards: KmCard[]; w: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ width: w }}>
      <div className="space-y-0.5">
        {cards.map((c, i) => (
          <button
            key={c.cardId}
            onClick={() => setOpen(true)}
            title="点击查看知识卡全文"
            className="block w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-stone-100"
          >
            <div className="text-[10px] leading-4 tabular-nums text-stone-400">
              {i + 1} · {c.cardId} · {c.domain}
            </div>
            <div className="truncate text-[11px] leading-4 text-stone-700">{c.title}</div>
          </button>
        ))}
      </div>
      {open && <CardsModal cards={cards} onClose={() => setOpen(false)} />}
    </div>
  );
}

function CardsModal({ cards, onClose }: { cards: KmCard[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-stone-800">命中分布 Top3 · 知识卡全文</p>
            <p className="mt-0.5 text-[11px] text-stone-400">demo 阶段依据知识卡推断，正式版按问答检索命中次数排序</p>
          </div>
          <button onClick={onClose} className="text-xs text-stone-400 hover:text-stone-600">关闭</button>
        </div>
        <div className="mt-3 space-y-3">
          {cards.map((c, i) => (
            <div key={c.cardId} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-900/5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-[#0e7490]">#{i + 1}</span>
                <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] tabular-nums text-stone-600">{c.cardId}</span>
                <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] text-cyan-800">{c.domain}</span>
              </div>
              <p className="mt-1.5 text-sm font-medium text-stone-800">{c.title}</p>
              <p className="mt-1 text-xs leading-5 text-stone-600">{c.coreView}</p>
              <p className="mt-1 text-[11px] leading-5 text-stone-400">适用：{c.applicableTo}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 匹配分析 Top3：高频提问主题（纯文本，无图） */
function TopThemesCell({ themes, w }: { themes: string[]; w: number }) {
  return (
    <ol className="space-y-1 text-[11px] leading-4 text-stone-700" style={{ width: w }}>
      {themes.map((t, i) => (
        <li key={t} className="flex gap-1.5">
          <span className="shrink-0 font-semibold tabular-nums text-stone-400">{i + 1}</span>
          <span>{t}</span>
        </li>
      ))}
    </ol>
  );
}

function ReviewCell({ review, onOpen }: { review: Review; onOpen: () => void }) {
  if (review.status === 'PENDING') {
    return (
      <button
        onClick={(e) => { e.preventDefault(); onOpen(); }}
        className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
      >
        待审核（{review.pendingItems.length}）
      </button>
    );
  }
  if (review.status === 'REJECTED') {
    return (
      <button
        onClick={(e) => { e.preventDefault(); onOpen(); }}
        className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-200"
      >
        已退回
      </button>
    );
  }
  return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">已通过</span>;
}

function ReviewModal({
  mentor, review, onClose, onApprove, onReject,
}: {
  mentor: MentorRow;
  review: Review;
  onClose: () => void;
  onApprove: (mentorId: string, itemId: string) => void;
  onReject: (mentorId: string, itemId: string, reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState<PendingItem | null>(null);
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-stone-800">
              {mentor.name}（{mentor.chineseName}）· 审核
            </p>
            {review.lastReviewAt && (
              <p className="mt-0.5 text-xs text-stone-400">上次审核：{review.lastReviewAt}</p>
            )}
          </div>
          <button onClick={onClose} className="text-xs text-stone-400 hover:text-stone-600">关闭</button>
        </div>

        {review.status === 'REJECTED' && review.rejectReason && review.pendingItems.length === 0 && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
            退回理由：{review.rejectReason}
          </p>
        )}

        <div className="mt-3 space-y-2">
          {review.pendingItems.length === 0 && review.status !== 'REJECTED' && (
            <p className="py-4 text-center text-sm text-stone-400">没有待审核内容</p>
          )}
          {review.pendingItems.map((item) => (
            <div key={item.id} className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-900/[0.05]">
              <div className="flex items-center gap-2">
                <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] text-stone-600">{item.type}</span>
                <p className="text-sm font-medium text-stone-800">{item.title}</p>
              </div>
              <p className="mt-1 text-xs text-stone-400">提交于 {item.submittedAt}</p>
              {rejecting?.id === item.id ? (
                <div className="mt-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="请填写退回理由（必填）"
                    rows={2}
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button onClick={() => { setRejecting(null); setReason(''); }} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-600">
                      取消
                    </button>
                    <button
                      onClick={() => {
                        if (!reason.trim()) return;
                        onReject(mentor.id, item.id, reason.trim());
                        setRejecting(null);
                        setReason('');
                      }}
                      disabled={!reason.trim()}
                      className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                    >
                      确认退回
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => onApprove(mentor.id, item.id)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700"
                  >
                    通过
                  </button>
                  <button
                    onClick={() => setRejecting(item)}
                    className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
                  >
                    退回
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MentorsAdminPage() {
  const { data, loading, error } = useAdminApi<MentorsResponse>('/api/admin/mentors');
  const [tab, setTab] = useState<'list' | 'dialogue' | 'audience' | 'knowledge'>('list');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [dir, setDir] = useState<'desc' | 'asc'>('desc');
  // 整体排序分页
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(20);
  const [equity, setEquity] = useState<EquityMode>('paid');
  // 对话效果：单列排序（点表头选列）+ 全局统一方向；分页
  const [dlgSortKey, setDlgSortKey] = useState<DlgKey>('rounds');
  const [dlgDir, setDlgDir] = useState<1 | -1>(-1); // -1 从高到低，1 从低到高
  const [dlgPage, setDlgPage] = useState(1);
  const [dlgPageSize, setDlgPageSize] = useState(20);
  // 用户画像：单列排序（仅导师称呼/帮助人数）+ 全局方向；图形/文字切换；分页
  const [audSortKey, setAudSortKey] = useState<AudSortKey>('helpedUsers');
  const [audDir, setAudDir] = useState<1 | -1>(-1);
  const [audMode, setAudMode] = useState<'pie' | 'bar' | 'text'>('pie');
  const [audPage, setAudPage] = useState(1);
  const [audPageSize, setAudPageSize] = useState(20);
  // 横向滚动：顶部滚动条与表格主体双向同步；前两列冻结
  const audBodyRef = useRef<HTMLDivElement>(null);
  const audTopRef = useRef<HTMLDivElement>(null);
  const [audScrollW, setAudScrollW] = useState(0);
  // 知识卡匹配：单列排序（仅导师称呼/知识卡数量）+ 全局方向；饼/柱/文字；分页
  const [kmSortKey, setKmSortKey] = useState<'mentorName' | 'cardCount'>('cardCount');
  const [kmDir, setKmDir] = useState<1 | -1>(-1);
  const [kmMode, setKmMode] = useState<'pie' | 'bar' | 'text'>('pie');
  const [kmPage, setKmPage] = useState(1);
  const [kmPageSize, setKmPageSize] = useState(20);
  const kmBodyRef = useRef<HTMLDivElement>(null);
  const kmTopRef = useRef<HTMLDivElement>(null);
  const [kmScrollW, setKmScrollW] = useState(0);
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, Review>>({});
  const [modalMentorId, setModalMentorId] = useState<string | null>(null);
  const [showTierRule, setShowTierRule] = useState(false);

  const mentors = useMemo(() => {
    if (!data) return [];
    return data.mentors.map((m) => ({ ...m, review: reviewOverrides[m.id] ?? m.review }));
  }, [data, reviewOverrides]);

  // 整体排序：按当前 sortKey 取值 + 方向；care desc=间隔短在前（取负）；订阅金额做次级稳定排序
  const sorted = useMemo(() => {
    const sign = dir === 'desc' ? -1 : 1;
    const endDate = data?.dateRange.end ?? new Date().toISOString().slice(0, 10);
    const val = (m: MentorRow): string | number => {
      switch (sortKey) {
        case 'revenue': return m.revenueYuan;
        case 'importedAt': return m.importedAt;
        case 'subCount': return subCountOf(m);
        case 'referrals': return m.referrals;
        case 'reach': return m.recommendedReach;
        case 'profileVisits': return m.profileVisits;
        case 'cards': return m.knowledgeCards;
        case 'cases': return m.caseCount;
        case 'nameEn': return m.name;
        case 'nameZh': return m.chineseName;
        case 'review': return -REVIEW_ORDER[m.review.status];
        case 'care': return -careGapDays(m, endDate);
      }
    };
    return [...mentors].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), sortKey === 'nameZh' ? 'zh' : undefined);
      return sign * cmp || b.revenueYuan - a.revenueYuan;
    });
  }, [mentors, sortKey, dir, data]);

  // 整体排序分页（切换排序键/方向/页大小时回第 1 页）
  useEffect(() => { setListPage(1); }, [sortKey, dir, listPageSize]);
  const { paged: listPaged } = paginate(sorted, listPage, listPageSize);

  /** 对话效果：点表头只选列（方向由总计行右侧统一按钮控制） */
  function selectDlgCol(k: DlgKey) {
    setDlgSortKey(k);
    setDlgPage(1);
  }
  /** 用户画像：只有导师称呼/帮助人数两列可选 */
  function selectAudCol(k: AudSortKey) {
    setAudSortKey(k);
    setAudPage(1);
  }

  // 当前权益口径下的对话/画像数据集（总权益=合计，付费/免费=对应分项）。
  // 用户画像的「帮助人数」直接取同口径对话口径（完成有效问答的用户）。
  const dlgRows = useMemo(
    () => mentors.map((m) => ({ m, d: equity === 'total' ? m.dialogue : m.dialogue[equity] })),
    [mentors, equity],
  );
  const audRows = useMemo(
    () => mentors.map((m) => ({
      m,
      a: equity === 'total' ? m.audience : m.audience[equity],
      helped: (equity === 'total' ? m.dialogue : m.dialogue[equity]).helpedUsers,
    })),
    [mentors, equity],
  );

  // 对话效果：单列排序，方向由全局按钮统一控制；默认按轮次。
  // 导师称呼按英文字典序（先名后姓）：从低到高=A→Z，从高到低=Z→A。
  const dlgSorted = useMemo(() => {
    return [...dlgRows].sort((x, y) => {
      if (dlgSortKey === 'mentorName') {
        return dlgDir * compareMentorName(x.m.name, y.m.name) || x.m.id.localeCompare(y.m.id);
      }
      const va = x.d[dlgSortKey];
      const vb = y.d[dlgSortKey];
      if (va !== vb) return dlgDir * (va > vb ? 1 : -1);
      return x.m.id.localeCompare(y.m.id);
    });
  }, [dlgRows, dlgSortKey, dlgDir]);

  // 分页（切换权益/页大小/排序列时回到第 1 页）
  useEffect(() => { setDlgPage(1); }, [equity, dlgPageSize]);
  const dlgPageCount = Math.max(1, Math.ceil(dlgSorted.length / dlgPageSize));
  const dlgPageCur = Math.min(dlgPage, dlgPageCount);
  const dlgPaged = dlgSorted.slice((dlgPageCur - 1) * dlgPageSize, dlgPageCur * dlgPageSize);

  // 用户画像：单列排序（导师称呼/帮助人数），方向由全局按钮统一控制；默认帮助人数从高到低
  const audSorted = useMemo(() => {
    return [...audRows].sort((x, y) => {
      if (audSortKey === 'mentorName') {
        return audDir * compareMentorName(x.m.name, y.m.name) || x.m.id.localeCompare(y.m.id);
      }
      if (x.helped !== y.helped) return audDir * (x.helped > y.helped ? 1 : -1);
      return x.m.id.localeCompare(y.m.id);
    });
  }, [audRows, audSortKey, audDir]);

  useEffect(() => { setAudPage(1); }, [equity, audPageSize]);
  const audPageCount = Math.max(1, Math.ceil(audSorted.length / audPageSize));
  const audPageCur = Math.min(audPage, audPageCount);
  const audPaged = audSorted.slice((audPageCur - 1) * audPageSize, audPageCur * audPageSize);

  // 知识卡匹配：不区分权益；无 knowledgeMatch 的导师（真实 API 未接入时）不进表
  const kmRows = useMemo(
    () => mentors.filter((m) => m.knowledgeMatch).map((m) => ({ m, km: m.knowledgeMatch! })),
    [mentors],
  );
  function selectKmCol(k: 'mentorName' | 'cardCount') {
    setKmSortKey(k);
    setKmPage(1);
  }
  const kmSorted = useMemo(() => {
    return [...kmRows].sort((x, y) => {
      if (kmSortKey === 'mentorName') {
        return kmDir * compareMentorName(x.m.name, y.m.name) || x.m.id.localeCompare(y.m.id);
      }
      if (x.m.knowledgeCards !== y.m.knowledgeCards) {
        return kmDir * (x.m.knowledgeCards > y.m.knowledgeCards ? 1 : -1);
      }
      return x.m.id.localeCompare(y.m.id);
    });
  }, [kmRows, kmSortKey, kmDir]);

  useEffect(() => { setKmPage(1); }, [kmPageSize]);
  const kmPageCount = Math.max(1, Math.ceil(kmSorted.length / kmPageSize));
  const kmPageCur = Math.min(kmPage, kmPageCount);
  const kmPaged = kmSorted.slice((kmPageCur - 1) * kmPageSize, kmPageCur * kmPageSize);

  // 顶部滚动条宽度=表格真实宽度；模式/页码/数据变化时重测
  useEffect(() => {
    if (tab !== 'audience') return;
    const body = audBodyRef.current;
    if (!body) return;
    const measure = () => setAudScrollW(body.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    const table = body.querySelector('table');
    if (table) ro.observe(table);
    return () => ro.disconnect();
  }, [tab, audPaged.length, audMode, audPageSize, data]);

  // 知识卡匹配表：顶部滚动条宽度=表格真实宽度
  useEffect(() => {
    if (tab !== 'knowledge') return;
    const body = kmBodyRef.current;
    if (!body) return;
    const measure = () => setKmScrollW(body.scrollWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(body);
    const table = body.querySelector('table');
    if (table) ro.observe(table);
    return () => ro.disconnect();
  }, [tab, kmPaged.length, kmMode, kmPageSize, data]);

  // 当前口径总计：场均轮次=总轮次/总有效线程（加权，非各导师场均之和）
  const dlgTotal = useMemo(() => {
    const t = { helpedUsers: 0, durationMin: 0, validSessions: 0, rounds: 0, likes: 0, dislikes: 0, reports: 0 };
    for (const { d } of dlgRows) {
      t.helpedUsers += d.helpedUsers;
      t.durationMin += d.durationMin;
      t.validSessions += d.validSessions;
      t.rounds += d.rounds;
      t.likes += d.likes;
      t.dislikes += d.dislikes;
      t.reports += d.reports;
    }
    return { ...t, avgRoundsPerSession: t.validSessions ? Math.round((t.rounds / t.validSessions) * 10) / 10 : 0 };
  }, [dlgRows]);

  const modalMentor = mentors.find((m) => m.id === modalMentorId) ?? null;

  function approve(mentorId: string, itemId: string) {
    setReviewOverrides((prev) => {
      const base = prev[mentorId] ?? mentors.find((m) => m.id === mentorId)!.review;
      const items = base.pendingItems.filter((i) => i.id !== itemId);
      return { ...prev, [mentorId]: { ...base, pendingItems: items, status: items.length === 0 ? 'APPROVED' : 'PENDING' } };
    });
  }
  function reject(mentorId: string, itemId: string, reason: string) {
    setReviewOverrides((prev) => {
      const base = prev[mentorId] ?? mentors.find((m) => m.id === mentorId)!.review;
      return {
        ...prev,
        [mentorId]: { pendingItems: [], status: 'REJECTED', lastReviewAt: base.lastReviewAt, rejectReason: reason },
      };
    });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-bg">
      <GoldFlakes variant="light" />
      <div className="relative z-10 mx-auto w-full max-w-[1720px] px-3 pb-16 pt-6 sm:px-5">
        {/* 顶栏：与其他后台首页一致 */}
        <nav className="flex items-center justify-between gap-2" aria-label="面包屑">
          <div className="flex items-baseline gap-3">
            <p className="text-sm font-bold text-stone-700">
              <span>管理员</span>
              <span className="mx-1.5 text-stone-400">/</span>
              <span>导师管理</span>
            </p>
            {data && (
              <span className="whitespace-nowrap text-xs text-stone-400">
                数据区间：{data.dateRange.start} 至 {data.dateRange.end}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2" aria-label="AI Career Companion 首页">
              <Image src="/icons/raw-logo.png" alt="AI Career Companion" width={40} height={40} priority className="h-10 w-10" />
              <span className="text-base font-medium text-stone-600">AI Career Companion</span>
            </Link>
            <Link
              href="/admin-console"
              className="rounded-lg border border-stone-300 bg-white/80 px-3 py-1 text-xs text-stone-600 hover:border-stone-400"
            >
              平台管理
            </Link>
            <button
              onClick={async () => {
                await signOut({ redirect: false });
                window.location.href = '/admin-console';
              }}
              className="rounded-lg border border-stone-300 bg-white/80 px-3 py-1 text-xs text-stone-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              退出登录
            </button>
          </div>
        </nav>

        {/* 子导航 */}
        <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl bg-white p-1 shadow-sm ring-1 ring-stone-900/5">
          {([['list', '整体排序'], ['dialogue', '对话效果'], ['audience', '用户画像'], ['knowledge', '知识卡匹配']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`whitespace-nowrap rounded-xl px-3.5 py-2 text-sm transition-colors ${
                tab === k ? 'bg-[#55734B] text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 权益口径切换（对话效果 / 用户画像共用，默认付费权益；知识卡匹配不分权益） */}
        {data && (tab === 'dialogue' || tab === 'audience') && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="权益口径">
            <span className="text-xs text-stone-400">权益：</span>
            {EQUITY_OPTIONS.map((o) => (
              <button
                key={o.key}
                role="radio"
                aria-checked={equity === o.key}
                onClick={() => setEquity(o.key)}
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  equity === o.key
                    ? o.key === 'total'
                      ? 'bg-[#0e7490] text-white'
                      : 'bg-[#7c5c93] text-white'
                    : o.key === 'total'
                      ? GROUP_IDLE.data
                      : GROUP_IDLE.identity
                }`}
              >
                {o.label}
              </button>
            ))}
            {data && tab === 'audience' && (
              <div className="ml-auto flex items-center gap-1.5">
                {/* 饼图/柱图/文字切换：饼图 Top3 带百分比、其余为其他空白 */}
                <div className="flex overflow-hidden rounded-full border border-stone-200 bg-white text-xs">
                  {([['pie', '饼图'], ['bar', '柱图'], ['text', '文字']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => setAudMode(v)}
                      className={`px-3 py-1 transition-colors ${
                        audMode === v ? 'bg-stone-700 text-white' : 'text-stone-500 hover:bg-stone-100'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* 方向按钮：只对导师称呼/帮助人数生效 */}
                <button
                  onClick={() => setAudDir((d) => (d === -1 ? 1 : -1))}
                  title="统一切换导师称呼/帮助人数的排序方向"
                  className="rounded-full bg-[#0e7490] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#0c627a]"
                >
                  {audDir === -1 ? '从高到低 ↓' : '从低到高 ↑'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* 知识卡匹配工具栏：饼图/柱图/文字 + 全局排序方向（仅导师称呼/知识卡数量） */}
        {data && tab === 'knowledge' && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-stone-400">视图：</span>
            <div className="flex overflow-hidden rounded-full border border-stone-200 bg-white text-xs">
              {([['pie', '饼图'], ['bar', '柱图'], ['text', '文字']] as const).map(([v, label]) => (
                <button
                  key={v}
                  onClick={() => setKmMode(v)}
                  className={`px-3 py-1 transition-colors ${
                    kmMode === v ? 'bg-stone-700 text-white' : 'text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="ml-1 text-[11px] text-stone-400">专业/兴趣取匹配度前 3 名；职业方向仅列 ≥80% 命中；命中分布与提问主题为 demo 推断</span>
            <button
              onClick={() => setKmDir((d) => (d === -1 ? 1 : -1))}
              title="统一切换导师称呼/知识卡数量的排序方向"
              className="ml-auto rounded-full bg-[#0e7490] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#0c627a]"
            >
              {kmDir === -1 ? '从高到低 ↓' : '从低到高 ↑'}
            </button>
          </div>
        )}

        <div className="mt-4">
          {loading && !data && <ViewState loading />}
          {error && <ViewState error={error} />}

          {data && tab === 'list' && (
            <div className="space-y-3">
              {/* 排序选择 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-stone-400">排序：</span>
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSortKey(s.key)}
                    className={`rounded-full px-3 py-1 text-xs transition-colors ${
                      sortKey === s.key ? GROUP_ACTIVE[s.group] : GROUP_IDLE[s.group]
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
                <button
                  onClick={() => setDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                  title="点击切换排序方向"
                  className="ml-auto rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 transition-colors hover:border-stone-300"
                >
                  {DIR_LABELS[sortKey][dir === 'desc' ? 0 : 1]} {dir === 'desc' ? '↓' : '↑'}
                </button>
                <button
                  onClick={() => setShowTierRule((v) => !v)}
                  className="text-xs text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
                >
                  {showTierRule ? '收起评分标准' : '评分标准'}
                </button>
              </div>

              {showTierRule && (
                <div className="rounded-2xl bg-white/90 p-4 text-xs leading-6 text-stone-500 shadow-sm ring-1 ring-stone-900/[0.06]">
                  <p className="text-sm font-semibold text-stone-700">S / A / B / C 评分标准</p>
                  <p className="mt-1">
                    按订阅金额（按天确认口径）从高到低排名：前 5% 为 S，其后至前 20% 为 A，其后至前 50% 为 B，其余为 C。
                    当前 20 位导师即 1 / 3 / 6 / 10。
                  </p>
                  <p className="mt-2 font-medium text-stone-600">每日确认金额</p>
                  <p className="mt-0.5 rounded-lg bg-stone-50 px-2 py-1 font-mono text-[11px] leading-5 text-stone-600">
                    当日金额 = 有效月卡数 × {PLAN_PRICE.MONTHLY}/{AMORT_DAYS.MONTHLY}
                    + 有效季卡数 × {PLAN_PRICE.QUARTERLY}/{AMORT_DAYS.QUARTERLY}
                    + 有效年卡数 × {PLAN_PRICE.YEARLY}/{AMORT_DAYS.YEARLY}
                    + {CREDIT_PACK_UNIT_YUAN} × 当日加榨包消耗次数
                  </p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                    <li>有效卡含当日新增、不含到期当日；周期内逐日累加。</li>
                    <li>加榨包购买金额不计入，仅实际消耗的轮次按 {CREDIT_PACK_UNIT_YUAN} 元/轮计入。</li>
                    <li>
                      卡归属导师（按优先级）：首次触点渠道为导师专属渠道时直接归属；否则付费前最后对话的导师与付费后首个对话导师一致即归属，
                      不一致则沿付费前对话记录回溯，再沿导师主页浏览记录回溯；均不一致则归于「其他」，不参与分档。
                    </li>
                  </ul>
                </div>
              )}

              {listPaged.map((m) => (
                <div key={m.id} className="rounded-2xl bg-white/90 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin-console/mentors/${m.id}`}
                        className="text-base font-semibold text-stone-800 underline-offset-2 hover:underline"
                      >
                        {m.name}
                      </Link>
                      <span className="ml-2 text-sm text-stone-500">{m.chineseName}</span>
                      <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-500">{m.tier} 级</span>
                    </div>
                    <ReviewCell review={m.review} onOpen={() => setModalMentorId(m.id)} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone-500 sm:grid-cols-4">
                    <span>入库 <b className="text-stone-700">{m.importedAt}</b></span>
                    <span>订阅金额 <b className="text-stone-700">¥{m.revenueYuan.toLocaleString()}</b></span>
                    <span>
                      订阅人次 <b className="text-stone-700">{subCountOf(m)}</b>
                      <span className="text-stone-400">（{m.subPlans.monthly}:{m.subPlans.quarterly}:{m.subPlans.yearly}）</span>
                    </span>
                    <span>订阅 <b className="text-stone-700">{m.subscribers}</b> 人</span>
                    <span>引流 <b className="text-stone-700">{m.referrals}</b> 人</span>
                    <span>推荐覆盖 <b className="text-stone-700">{m.recommendedReach.toLocaleString()}</b> 人</span>
                    <span>主页访问 <b className="text-stone-700">{m.profileVisits.toLocaleString()}</b> 人</span>
                    <span>知识卡 <b className="text-stone-700">{m.knowledgeCards}</b> 张</span>
                    <span>案例 <b className="text-stone-700">{m.caseCount}</b> 个</span>
                    <span>
                      关心度 <b className="text-pink-700">{careGapDays(m, data.dateRange.end).toFixed(1)}</b> 天/次
                      <span className="text-stone-400">（{daysSince(m.importedAt, data.dateRange.end)}天/{m.loginCount}次）</span>
                    </span>
                  </div>
                </div>
              ))}

              {/* 底部分页 */}
              <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-sm ring-1 ring-stone-900/[0.06]">
                <Pagination
                  page={listPage}
                  pageSize={listPageSize}
                  total={sorted.length}
                  totalUnit="位"
                  onPageChange={setListPage}
                  onPageSizeChange={setListPageSize}
                />
              </div>
            </div>
          )}

          {data && tab === 'dialogue' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 text-xs text-stone-500 shadow-sm ring-1 ring-stone-900/[0.05]">
                <p>
                  当前总计（{EQUITY_TEXT[equity]}）：
                  <b className="ml-1 font-semibold text-stone-700">{dlgTotal.helpedUsers.toLocaleString()}</b> 帮助人数 ·
                  <b className="ml-1 font-semibold text-stone-700">{hoursOf(dlgTotal.durationMin)}</b> 对话时长 ·
                  <b className="ml-1 font-semibold text-stone-700">{dlgTotal.validSessions.toLocaleString()}</b> 有效线程 ·
                  <b className="ml-1 font-semibold text-stone-700">{dlgTotal.rounds.toLocaleString()}</b> 轮次 ·
                  <b className="ml-1 font-semibold text-stone-700">{dlgTotal.avgRoundsPerSession}</b> 场均轮次 ·
                  <b className="ml-1 font-semibold text-emerald-600">{dlgTotal.likes}</b> 赞 ·
                  <b className="ml-1 font-semibold text-[#a13d2d]">{dlgTotal.dislikes}</b> 踩 ·
                  <b className="ml-1 font-semibold text-stone-700">{dlgTotal.reports}</b> 报错
                </p>
                <button
                  onClick={() => setDlgDir((d) => (d === -1 ? 1 : -1))}
                  title="统一切换所有栏目的排序方向"
                  className="shrink-0 rounded-full bg-[#0e7490] px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#0c627a]"
                >
                  {dlgDir === -1 ? '从高到低 ↓' : '从低到高 ↑'}
                </button>
              </div>
              <div className="overflow-x-auto rounded-2xl bg-white/90 p-2 shadow-sm ring-1 ring-stone-900/[0.06]">
                <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="rounded-l-lg bg-stone-100/90 px-3 py-3 text-left text-xs font-medium text-stone-500">
                        <button
                          onClick={() => selectDlgCol('mentorName')}
                          title="按英文字典序（先英文名再英文姓）"
                          className={`inline-flex items-center gap-0.5 whitespace-nowrap transition-colors hover:text-cyan-800 ${
                            dlgSortKey === 'mentorName' ? 'font-semibold text-[#0e7490]' : 'text-stone-500'
                          }`}
                        >
                          导师称呼
                          {dlgSortKey === 'mentorName' && (
                            <span className="text-[10px]">{dlgDir === -1 ? '↓' : '↑'}</span>
                          )}
                        </button>
                      </th>
                      {DLG_COLS.map((c, i) => (
                        <th
                          key={c.key}
                          className={`bg-stone-100/90 px-2 py-3 text-xs font-medium ${c.right ? 'text-right' : 'text-left'} ${
                            i === DLG_COLS.length - 1 ? 'rounded-r-lg' : ''
                          }`}
                        >
                          <button
                            onClick={() => selectDlgCol(c.key)}
                            className={`inline-flex items-center gap-0.5 whitespace-nowrap transition-colors hover:text-cyan-800 ${
                              c.right ? 'flex-row-reverse' : ''
                            } ${dlgSortKey === c.key ? 'font-semibold text-[#0e7490]' : 'text-stone-500'}`}
                          >
                            {DLG_LABELS[c.key]}
                            {dlgSortKey === c.key && (
                              <span className="text-[10px]">{dlgDir === -1 ? '↓' : '↑'}</span>
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dlgPaged.map(({ m, d }, idx) => (
                      <tr key={m.id} className={idx % 2 === 1 ? 'bg-stone-50/60' : ''}>
                        <td className="border-b border-stone-100 px-3 py-2.5">
                          <Link href={`/admin-console/mentors/${m.id}`} className="font-medium text-stone-800 underline-offset-2 hover:underline">
                            {m.name}
                          </Link>
                          <span className="ml-1.5 text-xs text-stone-400">{m.chineseName}</span>
                        </td>
                        <td className="border-b border-stone-100 px-3 py-2.5 text-right">{d.helpedUsers}</td>
                        <td className="border-b border-stone-100 px-3 py-2.5 text-right text-stone-600">{Math.round(d.durationMin / 60).toLocaleString()}</td>
                        <td className="border-b border-stone-100 px-3 py-2.5 text-right">{d.validSessions}</td>
                        <td className="border-b border-stone-100 px-3 py-2.5 text-right font-medium">{d.rounds.toLocaleString()}</td>
                        <td className="border-b border-stone-100 px-3 py-2.5 text-right">{d.avgRoundsPerSession}</td>
                        <td className="border-b border-stone-100 px-3 py-2.5 text-right font-medium text-emerald-600">{d.likes}</td>
                        <td className="border-b border-stone-100 px-3 py-2.5 text-right font-medium text-[#a13d2d]">{d.dislikes}</td>
                        <td className="border-b border-stone-100 px-3 py-2.5 text-right text-stone-500">{d.reports}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* 分页栏：为上百导师记录预留 */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 pb-1 text-xs text-stone-500">
                  <div className="flex items-center gap-1">
                    <span>每页</span>
                    {[20, 50, 100].map((n) => (
                      <button
                        key={n}
                        onClick={() => setDlgPageSize(n)}
                        className={`min-w-[2rem] rounded-md px-2 py-1 transition-colors ${
                          dlgPageSize === n
                            ? 'bg-[#0e7490] font-medium text-white'
                            : 'border border-stone-200 bg-white text-stone-600 hover:border-cyan-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span>条 · 共 {dlgSorted.length} 位</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDlgPage((p) => Math.max(1, p - 1))}
                      disabled={dlgPageCur <= 1}
                      className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-stone-600 transition-colors hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <span className="tabular-nums">第 {dlgPageCur} / {dlgPageCount} 页</span>
                    <button
                      onClick={() => setDlgPage((p) => Math.min(dlgPageCount, p + 1))}
                      disabled={dlgPageCur >= dlgPageCount}
                      className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-stone-600 transition-colors hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data && tab === 'audience' && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/90 p-2 shadow-sm ring-1 ring-stone-900/[0.06]">
                {/* 顶部横向滚动条：与表格主体双向同步 */}
                <div
                  ref={audTopRef}
                  onScroll={(e) => { if (audBodyRef.current) audBodyRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
                  className="overflow-x-auto overflow-y-hidden"
                  style={{ height: 10 }}
                >
                  <div style={{ width: audScrollW || AUD_TABLE_W, height: 1 }} />
                </div>
                <div
                  ref={audBodyRef}
                  onScroll={(e) => { if (audTopRef.current) audTopRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
                  className="overflow-x-auto"
                >
                <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: AUD_TABLE_W }}>
                  <thead>
                    <tr>
                      <th
                        className="sticky z-20 rounded-l-lg px-3 py-3 text-left text-xs font-medium text-stone-500"
                        style={{ left: 0, width: AUD_FROZEN_W[0], minWidth: AUD_FROZEN_W[0], maxWidth: AUD_FROZEN_W[0], backgroundColor: AUD_HEAD_BG }}
                      >
                        <button
                          onClick={() => selectAudCol('mentorName')}
                          title="按英文字典序（先英文名再英文姓）"
                          className={`inline-flex items-center gap-0.5 whitespace-nowrap transition-colors hover:text-cyan-800 ${
                            audSortKey === 'mentorName' ? 'font-semibold text-[#0e7490]' : 'text-stone-500'
                          }`}
                        >
                          导师称呼
                          {audSortKey === 'mentorName' && (
                            <span className="text-[10px]">{audDir === -1 ? '↓' : '↑'}</span>
                          )}
                        </button>
                      </th>
                      <th
                        className="sticky z-20 border-r border-stone-300/70 px-3 py-3 text-right text-xs font-medium text-stone-500"
                        style={{ left: AUD_FROZEN_W[0], width: AUD_FROZEN_W[1], minWidth: AUD_FROZEN_W[1], maxWidth: AUD_FROZEN_W[1], backgroundColor: AUD_HEAD_BG }}
                      >
                        <button
                          onClick={() => selectAudCol('helpedUsers')}
                          className={`inline-flex items-center gap-0.5 whitespace-nowrap transition-colors hover:text-cyan-800 ${
                            audSortKey === 'helpedUsers' ? 'font-semibold text-[#0e7490]' : 'text-stone-500'
                          }`}
                        >
                          帮助人数
                          {audSortKey === 'helpedUsers' && (
                            <span className="text-[10px]">{audDir === -1 ? '↓' : '↑'}</span>
                          )}
                        </button>
                      </th>
                      {AUD_COLUMNS.map((c, i) => (
                        <th
                          key={c.key}
                          className={`whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-stone-500 ${
                            i === AUD_COLUMNS.length - 1 ? 'rounded-r-lg' : ''
                          }`}
                          style={{ backgroundColor: AUD_HEAD_BG }}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {audPaged.map(({ m, a, helped }, idx) => (
                      <tr key={m.id}>
                        <td
                          className="sticky z-10 whitespace-nowrap border-b border-stone-100 px-3 py-2.5"
                          style={{ left: 0, width: AUD_FROZEN_W[0], minWidth: AUD_FROZEN_W[0], maxWidth: AUD_FROZEN_W[0], backgroundColor: AUD_ROW_BG[idx % 2] }}
                        >
                          <Link href={`/admin-console/mentors/${m.id}`} className="font-medium text-stone-800 underline-offset-2 hover:underline">
                            {m.name}
                          </Link>
                          <span className="ml-1.5 text-xs text-stone-400">{m.chineseName}</span>
                        </td>
                        <td
                          className="sticky z-10 whitespace-nowrap border-b border-r border-stone-200 px-3 py-2.5 text-right font-medium tabular-nums"
                          style={{ left: AUD_FROZEN_W[0], width: AUD_FROZEN_W[1], minWidth: AUD_FROZEN_W[1], maxWidth: AUD_FROZEN_W[1], backgroundColor: AUD_ROW_BG[idx % 2] }}
                        >
                          {helped.toLocaleString()}
                        </td>
                        {AUD_COLUMNS.map((c) => (
                          <td key={c.key} className={`border-b border-stone-100 px-3 py-2.5 align-top ${idx % 2 === 1 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>
                            <Top3Cell items={a[c.key]} mode={audMode} w={c.w} base={helped} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {/* 分页栏 */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 pb-1 text-xs text-stone-500">
                  <div className="flex items-center gap-1">
                    <span>每页</span>
                    {[20, 50, 100].map((n) => (
                      <button
                        key={n}
                        onClick={() => setAudPageSize(n)}
                        className={`min-w-[2rem] rounded-md px-2 py-1 transition-colors ${
                          audPageSize === n
                            ? 'bg-[#0e7490] font-medium text-white'
                            : 'border border-stone-200 bg-white text-stone-600 hover:border-cyan-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span>条 · 共 {audSorted.length} 位</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAudPage((p) => Math.max(1, p - 1))}
                      disabled={audPageCur <= 1}
                      className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-stone-600 transition-colors hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <span className="tabular-nums">第 {audPageCur} / {audPageCount} 页</span>
                    <button
                      onClick={() => setAudPage((p) => Math.min(audPageCount, p + 1))}
                      disabled={audPageCur >= audPageCount}
                      className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-stone-600 transition-colors hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {data && tab === 'knowledge' && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-white/90 p-2 shadow-sm ring-1 ring-stone-900/[0.06]">
                {/* 顶部横向滚动条：与表格主体双向同步 */}
                <div
                  ref={kmTopRef}
                  onScroll={(e) => { if (kmBodyRef.current) kmBodyRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
                  className="overflow-x-auto overflow-y-hidden"
                  style={{ height: 10 }}
                >
                  <div style={{ width: kmScrollW || KM_TABLE_W, height: 1 }} />
                </div>
                <div
                  ref={kmBodyRef}
                  onScroll={(e) => { if (kmTopRef.current) kmTopRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
                  className="overflow-x-auto"
                >
                <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: KM_TABLE_W }}>
                  <thead>
                    <tr>
                      <th
                        className="sticky z-20 rounded-l-lg px-3 py-3 text-left text-xs font-medium text-stone-500"
                        style={{ left: 0, width: KM_FROZEN_W[0], minWidth: KM_FROZEN_W[0], maxWidth: KM_FROZEN_W[0], backgroundColor: AUD_HEAD_BG }}
                      >
                        <button
                          onClick={() => selectKmCol('mentorName')}
                          title="按英文字典序（先英文名再英文姓）"
                          className={`inline-flex items-center gap-0.5 whitespace-nowrap transition-colors hover:text-cyan-800 ${
                            kmSortKey === 'mentorName' ? 'font-semibold text-[#0e7490]' : 'text-stone-500'
                          }`}
                        >
                          导师称呼
                          {kmSortKey === 'mentorName' && (
                            <span className="text-[10px]">{kmDir === -1 ? '↓' : '↑'}</span>
                          )}
                        </button>
                      </th>
                      <th
                        className="sticky z-20 border-r border-stone-300/70 px-3 py-3 text-right text-xs font-medium text-stone-500"
                        style={{ left: KM_FROZEN_W[0], width: KM_FROZEN_W[1], minWidth: KM_FROZEN_W[1], maxWidth: KM_FROZEN_W[1], backgroundColor: AUD_HEAD_BG }}
                      >
                        <button
                          onClick={() => selectKmCol('cardCount')}
                          className={`inline-flex items-center gap-0.5 whitespace-nowrap transition-colors hover:text-cyan-800 ${
                            kmSortKey === 'cardCount' ? 'font-semibold text-[#0e7490]' : 'text-stone-500'
                          }`}
                        >
                          知识卡数量
                          {kmSortKey === 'cardCount' && (
                            <span className="text-[10px]">{kmDir === -1 ? '↓' : '↑'}</span>
                          )}
                        </button>
                      </th>
                      {KM_HIT_COLS.map((c) => (
                        <th
                          key={c.key}
                          className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-stone-500"
                          style={{ backgroundColor: AUD_HEAD_BG }}
                        >
                          {c.label}
                        </th>
                      ))}
                      <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium text-stone-500" style={{ backgroundColor: AUD_HEAD_BG }}>
                        命中分布 Top3
                      </th>
                      <th
                        className="whitespace-nowrap rounded-r-lg px-3 py-3 text-left text-xs font-medium text-stone-500"
                        style={{ backgroundColor: AUD_HEAD_BG }}
                      >
                        匹配分析 Top3
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {kmPaged.map(({ m, km }, idx) => (
                      <tr key={m.id}>
                        <td
                          className="sticky z-10 whitespace-nowrap border-b border-stone-100 px-3 py-2.5"
                          style={{ left: 0, width: KM_FROZEN_W[0], minWidth: KM_FROZEN_W[0], maxWidth: KM_FROZEN_W[0], backgroundColor: AUD_ROW_BG[idx % 2] }}
                        >
                          <Link href={`/admin-console/mentors/${m.id}`} className="font-medium text-stone-800 underline-offset-2 hover:underline">
                            {m.name}
                          </Link>
                          <span className="ml-1.5 text-xs text-stone-400">{m.chineseName}</span>
                        </td>
                        <td
                          className="sticky z-10 whitespace-nowrap border-b border-r border-stone-200 px-3 py-2.5 text-right font-medium tabular-nums"
                          style={{ left: KM_FROZEN_W[0], width: KM_FROZEN_W[1], minWidth: KM_FROZEN_W[1], maxWidth: KM_FROZEN_W[1], backgroundColor: AUD_ROW_BG[idx % 2] }}
                        >
                          {m.knowledgeCards.toLocaleString()}
                        </td>
                        {KM_HIT_COLS.map((c) => (
                          <td key={c.key} className={`border-b border-stone-100 px-3 py-2.5 align-top ${idx % 2 === 1 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>
                            <KmHitCell hits={km[c.key]} mode={kmMode} w={c.w} variant={c.variant} />
                          </td>
                        ))}
                        <td className={`border-b border-stone-100 px-3 py-2.5 align-top ${idx % 2 === 1 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>
                          <TopCardsCell cards={km.topCards} w={KM_CARDS_W} />
                        </td>
                        <td className={`border-b border-stone-100 px-3 py-2.5 align-top ${idx % 2 === 1 ? 'bg-[#f6f5f2]' : 'bg-white'}`}>
                          <TopThemesCell themes={km.topThemes} w={KM_THEMES_W} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
                {/* 分页栏 */}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 pb-1 text-xs text-stone-500">
                  <div className="flex items-center gap-1">
                    <span>每页</span>
                    {[20, 50, 100].map((n) => (
                      <button
                        key={n}
                        onClick={() => setKmPageSize(n)}
                        className={`min-w-[2rem] rounded-md px-2 py-1 transition-colors ${
                          kmPageSize === n
                            ? 'bg-[#0e7490] font-medium text-white'
                            : 'border border-stone-200 bg-white text-stone-600 hover:border-cyan-300'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span>条 · 共 {kmSorted.length} 位</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setKmPage((p) => Math.max(1, p - 1))}
                      disabled={kmPageCur <= 1}
                      className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-stone-600 transition-colors hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      上一页
                    </button>
                    <span className="tabular-nums">第 {kmPageCur} / {kmPageCount} 页</span>
                    <button
                      onClick={() => setKmPage((p) => Math.min(kmPageCount, p + 1))}
                      disabled={kmPageCur >= kmPageCount}
                      className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-stone-600 transition-colors hover:border-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {modalMentor && (
        <ReviewModal
          mentor={modalMentor}
          review={modalMentor.review}
          onClose={() => setModalMentorId(null)}
          onApprove={approve}
          onReject={reject}
        />
      )}

      <div className="relative z-10">
        <PaperCredits />
      </div>
    </div>
  );
}
