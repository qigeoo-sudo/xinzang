'use client';

/**
 * 行为链 · 全体用户行为拓扑图（数据：/api/admin/journey-graph，按页面/按钮 tab 总量锚定）。
 * 树状（分层拓扑）：橙色方框=页面，绿色圆圈=按钮（在所属页面方框内）；
 *   导师主页按访问量排序、每 8 位叠成一组，点击组节点展开为导师小卡矩阵。
 * 星状（热力辐射）：首页居中，其余页面按图距分层向外辐射，暗底霓虹。
 * 复合口径：次数/人数 × 累计/日均；比例 1:N 折算后 <0.1 的边/按钮/页面折叠进「其他」。
 * 拖拽位置持久化到 localStorage，切走再回来仍保留；「参数布局」按交叉+弧线综合最优重排，「重置布局」恢复默认排布。
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAdminApi } from './use-admin-api';
import { ViewState } from '@/components/mentor-console/stat-card';

interface GraphPage { id: string; label: string; sub?: string; pv: number; uv: number; main?: boolean; tail?: boolean }
interface GraphButton { key: string; label: string; page: string; clicks: number; users: number }
interface GraphEdge { source: string; sourceHandle: string; kind: 'page' | 'btn'; target: string; count: number; users: number }
interface JourneyGraph {
  dateRange: { start: string | null; end: string };
  note: string;
  pages: GraphPage[];
  buttons: GraphButton[];
  edges: GraphEdge[];
}

const OTHER_ID = '__other__';
const STACK_PREFIX = '__stack__';
const OTHER_THRESHOLD = 0.1;
const STACK_SIZE = 8; // 每组导师数
const MGRID_COLS = 4; // 展开后每行小卡数

const COLOR_PAGE = '#c2410c';
const FILL_PAGE = '#fff7ed';
const COLOR_BTN = '#15803d';
const EDGE_BTN = '#0e7490';
const EDGE_PAGE = '#b45309';
const EDGE_STACK = '#9a3412';

type Metric = 'count' | 'users';
type Span = 'total' | 'avg';
type Mode = 'tree' | 'star';
const RATIOS = [1, 10, 100, 1000, 10000] as const;
const POS_KEY = (mode: Mode) => `journey-topo-pos-v1:${mode}`;
const SLOT_KEY = (mode: Mode, metric: Metric, span: Span, ratio: number) => `journey-topo-slots-v1:${mode}:${metric}:${span}:${ratio}`;

// ---------- 记忆位 ----------
interface MemSlot {
  id: string;
  name: string;
  time: number;
  optParams: OptParams;
  positions: Record<string, { x: number; y: number }>;
  expanded: string[];
}

function loadSlots(mode: Mode, metric: Metric, span: Span, ratio: number): MemSlot[] {
  try {
    const raw = localStorage.getItem(SLOT_KEY(mode, metric, span, ratio));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveSlots(mode: Mode, metric: Metric, span: Span, ratio: number, slots: MemSlot[]) {
  try { localStorage.setItem(SLOT_KEY(mode, metric, span, ratio), JSON.stringify(slots)); } catch { /* ignore */ }
}

function fmt(v: number): string {
  if (v >= 100) return Math.round(v).toLocaleString();
  if (v >= 1) return Number.isInteger(v) ? String(v) : v.toFixed(1);
  const s = v.toFixed(2);
  return s.endsWith('.00') ? '0' : s.replace(/0$/, '');
}
function lerpColor(a: string, b: string, t: string | any): string {
  const tt = Math.max(0, Math.min(1, t as number));
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * tt);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}
const isMentorPage = (id: string) => id.startsWith('/mentors/') && id !== '/mentors' && id !== OTHER_ID;
const isStack = (id: string) => id.startsWith(STACK_PREFIX);

// 导师英文名去姓：lydiachen→lydia、winnieni→winnie；x01/x22 等长尾 id 返回 null
const MENTOR_SURNAMES = ['huang', 'zhou', 'zhang', 'wang', 'chen', 'yuan', 'gao', 'chi', 'ren', 'lin', 'liu', 'li', 'ni'];
const mentorFirstName = (id: string): string | null => {
  const slug = id.replace(/^\/mentors\//, '');
  if (/^x\d+$/i.test(slug)) return null;
  for (const sn of MENTOR_SURNAMES) {
    if (slug.endsWith(sn) && slug.length > sn.length) return slug.slice(0, -sn.length);
  }
  return slug;
};

// ---------- 折算与折叠（比例 1:N，<0.1 进其他） ----------
interface DisplayPage { id: string; label: string; sub?: string; raw: number; isOther?: boolean }
interface DisplayBtn { key: string; label: string; raw: number }
interface DisplayEdge { id: string; source: string; sourceHandle: string; kind: 'page' | 'btn' | 'other'; target: string; raw: number }
interface Display { pages: DisplayPage[]; btnsByPage: Map<string, DisplayBtn[]>; edges: DisplayEdge[] }

function buildDisplay(g: JourneyGraph, metric: Metric, ratio: number): Display {
  const pageRaw = (p: GraphPage) => (metric === 'count' ? p.pv : p.uv);
  const btnRaw = (b: GraphButton) => (metric === 'count' ? b.clicks : b.users);
  const edgeRaw = (e: GraphEdge) => (metric === 'count' ? e.count : e.users);

  const btnsByPage = new Map<string, DisplayBtn[]>();
  const otherBtns = new Map<string, number>();
  for (const b of g.buttons) {
    const raw = btnRaw(b);
    if (raw / ratio >= OTHER_THRESHOLD) {
      (btnsByPage.get(b.page) ?? btnsByPage.set(b.page, []).get(b.page)!).push({ key: b.key, label: b.label, raw });
    } else {
      otherBtns.set(b.page, (otherBtns.get(b.page) ?? 0) + raw);
    }
  }
  for (const [p, raw] of otherBtns) {
    (btnsByPage.get(p) ?? btnsByPage.set(p, []).get(p)!).push({ key: `${p}::other`, label: '其他按钮', raw });
  }

  const kept: DisplayEdge[] = [];
  const otherBySrc = new Map<string, number>();
  const inDegree = new Set<string>();
  const outDegree = new Set<string>();
  for (const e of g.edges) {
    const raw = edgeRaw(e);
    if (raw / ratio >= OTHER_THRESHOLD) {
      kept.push({ id: `${e.source}|${e.sourceHandle}->${e.target}`, source: e.source, sourceHandle: e.sourceHandle, kind: e.kind, target: e.target, raw });
      outDegree.add(e.source); inDegree.add(e.target);
    } else {
      otherBySrc.set(e.source, (otherBySrc.get(e.source) ?? 0) + raw);
    }
  }

  const folded: DisplayPage[] = [];
  const pages: DisplayPage[] = [];
  for (const p of g.pages) {
    const raw = pageRaw(p);
    if (raw / ratio < OTHER_THRESHOLD && !inDegree.has(p.id) && !outDegree.has(p.id)) {
      folded.push({ id: p.id, label: p.label, raw });
    } else {
      pages.push({ id: p.id, label: p.label, sub: p.sub, raw });
    }
  }
  if (folded.length > 0 || otherBySrc.size > 0) {
    const otherRaw = folded.reduce((a, p) => a + p.raw, 0) + [...otherBySrc.values()].reduce((a, b) => a + b, 0);
    pages.push({ id: OTHER_ID, label: `其他（含 ${folded.length} 个低量页面）`, raw: otherRaw, isOther: true });
  }
  for (const [src, raw] of otherBySrc) {
    kept.push({ id: `${src}|other->${OTHER_ID}`, source: src, sourceHandle: 'page:out', kind: 'other', target: OTHER_ID, raw });
  }
  return { pages, btnsByPage, edges: kept };
}

// ---------- 尺寸 ----------
const NODE_W = 220;
const MINI_W = 156;
const COL_GAP = 110;
const ROW_GAP = 28;
const HEADER_H = 28;
const BTN_ROW_H = 28;
const PAD_Y = 8;
const MINI_BTN_H = 20;
const STACK_COLLAPSED_H = 76;
const STACK_HEADER_H = 34;
const STACK_GRID_GAP = 12;
const STACK_BAND_W = MGRID_COLS * MINI_W + (MGRID_COLS - 1) * STACK_GRID_GAP; // 660

function pageNodeH(btnCount: number) { return HEADER_H + btnCount * BTN_ROW_H + PAD_Y * 2; }
function miniNodeH(btnCount: number) { return HEADER_H + btnCount * MINI_BTN_H + 8; }

// ---------- 树状布局：普通页面分层 + 导师页 8 位一组（折叠/展开 4×2 矩阵） ----------
interface StackInfo { id: string; members: string[]; raw: number; top: { id: string; sub?: string; raw: number }[] }

interface OptParams {
  crossCost: number;   // 每处交叉罚分（越大越优先零交叉）
  ovlCost: number;     // 每对框重叠罚分
  compactW: number;    // 紧凑度权重（越大框越往中间收）
  gridN: number;       // 粗扫网格数（gridN × gridN）
  stepStart: number;   // 细化起始步长
  stepMin: number;     // 细化最小步长
}

const DEFAULT_OPT: OptParams = {
  crossCost: 20000,
  ovlCost: 50000,
  compactW: 0,
  gridN: 9,
  stepStart: 400,
  stepMin: 16,
};

function treeLayout(
  display: Display,
  stacks: StackInfo[],
  expanded: Set<string>,
  optimize: boolean,
  opt: OptParams = DEFAULT_OPT,
) {
  const { pages, btnsByPage, edges } = display;
  const stackOf = new Map<string, string>();
  stacks.forEach((s) => s.members.forEach((m) => stackOf.set(m, s.id)));
  const entOf = (id: string) => (isMentorPage(id) ? stackOf.get(id) ?? id : id);

  // 布局实体：普通页面 + 组节点（组占整层带宽）
  const mainIds = pages.map((p) => p.id).filter((id) => !isMentorPage(id));
  const entOrder = new Map<string, number>();
  mainIds.forEach((id, i) => entOrder.set(id, i));
  stacks.forEach((s, i) => entOrder.set(s.id, mainIds.length + i));

  // 实体间边（同实体对聚合流量；质心与评分用 √w，防超大边主导）
  const entEdges = new Map<string, { s: string; t: string; w: number }>();
  for (const e of edges) {
    const s = entOf(e.source), t = entOf(e.target);
    if (s === t) continue;
    const k = `${s}->${t}`;
    const cur = entEdges.get(k);
    if (cur) cur.w += e.raw;
    else entEdges.set(k, { s, t, w: e.raw });
  }
  const layer = new Map<string, number>();
  for (const id of entOrder.keys()) layer.set(id, 0);
  const entList = [...entEdges.values()];
  for (let pass = 0; pass < entOrder.size; pass++) {
    let changed = false;
    for (const e of entList) {
      const so = entOrder.get(e.s) ?? 0, to = entOrder.get(e.t) ?? 0;
      if (so < to && (layer.get(e.t) ?? 0) < (layer.get(e.s) ?? 0) + 1) {
        layer.set(e.t, (layer.get(e.s) ?? 0) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // 每层放普通页面块 + 组块（组块行优先打包，每行 2 个折叠组，展开组独占一行）
  const layers = new Map<number, string[]>();
  for (const id of entOrder.keys()) {
    (layers.get(layer.get(id) ?? 0) ?? layers.set(layer.get(id) ?? 0, []).get(layer.get(id) ?? 0)!).push(id);
  }
  for (const arr of layers.values()) {
    arr.sort((a, b) => (entOrder.get(a) ?? 0) - (entOrder.get(b) ?? 0));
  }
  const nums = [...layers.keys()].sort((a, b) => a - b);

  // 带权邻接表
  const nbrs = new Map<string, [string, number][]>();
  for (const e of entList) {
    const w = Math.sqrt(e.w);
    (nbrs.get(e.s) ?? nbrs.set(e.s, []).get(e.s)!).push([e.t, w]);
    (nbrs.get(e.t) ?? nbrs.set(e.t, []).get(e.t)!).push([e.s, w]);
  }

  const layerW = new Map<number, number>();
  for (const l of nums) layerW.set(l, NODE_W);
  for (const s of stacks) {
    const l = layer.get(s.id) ?? 0;
    layerW.set(l, Math.max(layerW.get(l) ?? NODE_W, STACK_BAND_W));
  }
  const layerX = new Map<number, number>();
  let xCursor = 0;
  for (const l of nums) {
    layerX.set(l, xCursor);
    xCursor += (layerW.get(l) ?? NODE_W) + COL_GAP;
  }

  // 按当前层内顺序生成全部位置（普通页面独占一行，折叠组行优先打包，展开组独占整行）
  const pack = () => {
    const pos = new Map<string, { x: number; y: number }>();
    for (const l of nums) {
      const x = layerX.get(l)!;
      let y = 0;
      let rowH = 0;
      let col = 0;
      const perRow = Math.max(1, Math.floor((STACK_BAND_W + STACK_GRID_GAP) / (NODE_W + STACK_GRID_GAP)));
      const closeRow = () => { if (col > 0) { y += rowH + ROW_GAP; rowH = 0; col = 0; } };
      for (const id of layers.get(l)!) {
        if (isStack(id)) {
          if (expanded.has(id)) {
            closeRow();
            pos.set(id, { x, y });
            const members = stacks.find((s) => s.id === id)!.members;
            members.forEach((mid, i) => {
              pos.set(mid, { x: x + (i % MGRID_COLS) * (MINI_W + STACK_GRID_GAP), y: y + STACK_HEADER_H + 10 + Math.floor(i / MGRID_COLS) * (miniNodeH(btnCount.get(mid) ?? 0) + STACK_GRID_GAP) });
            });
            y += STACK_HEADER_H + 10 + Math.ceil(members.length / MGRID_COLS) * miniNodeH(4) + (Math.ceil(members.length / MGRID_COLS) - 1) * STACK_GRID_GAP + 10 + ROW_GAP;
          } else {
            if (col >= perRow) closeRow();
            pos.set(id, { x: x + col * (NODE_W + STACK_GRID_GAP), y });
            rowH = Math.max(rowH, STACK_COLLAPSED_H);
            col += 1;
          }
        } else {
          closeRow();
          pos.set(id, { x, y });
          y += pageNodeH(btnCount.get(id) ?? 0) + ROW_GAP;
        }
      }
      closeRow();
    }
    return pos;
  };

  const btnCount = new Map<string, number>();
  for (const [p, bs] of btnsByPage) btnCount.set(p, bs.length);

  const entCenter = (pos: Map<string, { x: number; y: number }>, id: string) => {
    if (isStack(id) && expanded.has(id)) {
      const members = stacks.find((s) => s.id === id)!.members;
      let sum = 0, cnt = 0;
      for (const m of members) { const p = pos.get(m); if (p) { sum += p.y + miniNodeH(btnCount.get(m) ?? 0) / 2; cnt++; } }
      if (cnt) return sum / cnt;
    }
    const p = pos.get(id);
    if (!p) return 0;
    const h = isStack(id) ? STACK_COLLAPSED_H : pageNodeH(btnCount.get(id) ?? 0);
    return p.y + h / 2;
  };
  const centerMap = (pos: Map<string, { x: number; y: number }>) => {
    const yc = new Map<string, number>();
    for (const id of entOrder.keys()) yc.set(id, entCenter(pos, id));
    return yc;
  };

  const { crossCost: CROSSING_COST, ovlCost: OVERLAP_COST, compactW: COMPACT_W, gridN: GRID_N, stepStart: STEP_START, stepMin: STEP_MIN } = opt;
  const BOX_GAP = 16;

  const score = (pos: Map<string, { x: number; y: number }>) => {
    const yc = centerMap(pos);
    let spanCost = 0;
    for (const e of entList) {
      const ls = layer.get(e.s) ?? 0, lt = layer.get(e.t) ?? 0;
      const span = ls === lt ? 0.5 : Math.abs(ls - lt);
      spanCost += Math.sqrt(e.w) * Math.abs((yc.get(e.s) ?? 0) - (yc.get(e.t) ?? 0)) * span;
    }
    let crossings = 0;
    for (let i = 0; i < nums.length - 1; i++) {
      const pa = new Map(layers.get(nums[i])!.map((id, j) => [id, j]));
      const pb = new Map(layers.get(nums[i + 1])!.map((id, j) => [id, j]));
      const es = entList.filter((e) => pa.has(e.s) && pb.has(e.t)).map((e) => [pa.get(e.s)!, pb.get(e.t)!] as const);
      for (let a = 0; a < es.length; a++) for (let b = a + 1; b < es.length; b++) if ((es[a][0] - es[b][0]) * (es[a][1] - es[b][1]) < 0) crossings++;
    }
    return spanCost + crossings * CROSSING_COST;
  };

  const defaultScore = score(pack());
  const defaultLayers = new Map([...layers].map(([l, arr]) => [l, [...arr]] as [number, string[]]));

  if (optimize && entList.length > 0) {
    // 最优布局：拆掉行列矩阵，每个框拿独立 (x, y) 坐标，只保留连线拓扑约束；
    // 爬山追求「线长 + 交叉罚 + 重叠罚 + 紧凑度」全局最小；护栏保证不劣于默认矩阵排布
    const movable = [...entOrder.keys()];

    const pos = pack();
    // 安全取坐标：比例切换瞬间 display 变了但 pos 还是旧引用，防止 undefined
    const gp = (id: string) => pos.get(id) ?? { x: 0, y: 0 };

    const boxW = (id: string) => isStack(id) ? STACK_BAND_W : NODE_W;
    const boxH = (id: string) => isStack(id) ? STACK_COLLAPSED_H : pageNodeH(btnCount.get(id) ?? 0);

    const translate = (id: string, nx: number, ny: number) => {
      const p = gp(id);
      const dx = nx - p.x, dy = ny - p.y;
      pos.set(id, { x: nx, y: ny });
      if (isStack(id) && expanded.has(id)) {
        for (const m of stacks.find((s) => s.id === id)!.members) {
          const mp = pos.get(m);
          if (mp) pos.set(m, { x: mp.x + dx, y: mp.y + dy });
        }
      }
    };
    // 边挂右边缘中心→左边缘中心（与 React Flow 连线一致）
    const edgeSegs = () => entList.map((e) => {
      const pa = gp(e.s), pb = gp(e.t);
      return {
        s: e.s, t: e.t,
        xs: pa.x + boxW(e.s), ys: pa.y + boxH(e.s) / 2,
        xt: pb.x, yt: pb.y + boxH(e.t) / 2,
      };
    });

    const countCrossings = () => {
      const segs = edgeSegs();
      let c = 0;
      for (let i = 0; i < segs.length; i++) {
        for (let j = i + 1; j < segs.length; j++) {
          const a = segs[i], b = segs[j];
          const d1 = (b.xt - b.xs) * (a.yt - a.ys) - (b.yt - b.ys) * (a.xt - a.xs);
          if (d1 === 0) continue;
          const t = ((a.xs - b.xs) * (a.yt - a.ys) - (a.ys - b.ys) * (a.xt - a.xs)) / d1;
          const u = ((a.xs - b.xs) * (b.yt - b.ys) - (a.ys - b.ys) * (b.xt - b.xs)) / d1;
          if (t > 0 && t < 1 && u > 0 && u < 1) c++;
        }
      }
      return c;
    };
    const countOverlaps = () => {
      let ovl = 0;
      for (let i = 0; i < movable.length; i++) {
        const pa = gp(movable[i]);
        for (let j = i + 1; j < movable.length; j++) {
          const pb = gp(movable[j]);
          if (
            pa.x < pb.x + boxW(movable[j]) + BOX_GAP && pb.x < pa.x + boxW(movable[i]) + BOX_GAP &&
            pa.y < pb.y + boxH(movable[j]) + BOX_GAP && pb.y < pa.y + boxH(movable[i]) + BOX_GAP
          ) ovl++;
        }
      }
      return ovl;
    };
    const freeScore = () => {
      let cost = 0;
      for (const s of edgeSegs()) cost += Math.hypot(s.xt - s.xs, s.yt - s.ys);
      cost += countCrossings() * CROSSING_COST + countOverlaps() * OVERLAP_COST;
      // 紧凑度：所有框中心两两距离之和，越大框越散
      if (COMPACT_W > 0) {
        let compact = 0;
        const cs = movable.map((id) => { const p = gp(id); return { x: p.x + boxW(id) / 2, y: p.y + boxH(id) / 2 }; });
        for (let i = 0; i < cs.length; i++) {
          for (let j = i + 1; j < cs.length; j++) {
            compact += Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y);
          }
        }
        cost += compact * COMPACT_W;
      }
      return cost;
    };

    let curScore = freeScore();

    // 试移动并评分；更优则落定，否则还原
    const tryMove = (id: string, nx: number, ny: number): number => {
      const p = gp(id);
      translate(id, nx, ny);
      const s = freeScore();
      if (s < curScore - 1e-6) { curScore = s; return s; }
      translate(id, p.x, p.y);
      return -1;
    };

    // 1) 大画布粗扫：以默认布局中心为原点，左右各扩 2000、上下各扩 1500，帮框跳出局部最优
    {
      const xs = movable.map((id) => gp(id).x);
      const ys = movable.map((id) => gp(id).y);
      const cx = (Math.min(...xs) + Math.max(...xs) + NODE_W) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys.map((y, i) => y + boxH(movable[i])))) / 2;
      for (const id of movable) {
        for (let ix = 0; ix < GRID_N; ix++) {
          for (let iy = 0; iy < GRID_N; iy++) {
            tryMove(id, cx - 2000 + (4000 * ix) / (GRID_N - 1), cy - 1500 + (3000 * iy) / (GRID_N - 1));
          }
        }
      }
    }
    // 2) 局部细化：8 方向步进，步长逐轮减半
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
    let step = STEP_START;
    while (step >= STEP_MIN) {
      let improved = false;
      for (const id of movable) {
        const p = gp(id);
        for (const [dx, dy] of dirs) {
          if (tryMove(id, p.x + dx * step, p.y + dy * step) >= 0) improved = true;
        }
      }
      if (!improved) step /= 2;
    }
    // 3) 交换动作：两框互换位置，跳出局部最优；交换后再细化一轮
    for (let round = 0; round < 3; round++) {
      let improved = false;
      for (let i = 0; i < movable.length; i++) {
        for (let j = i + 1; j < movable.length; j++) {
          const A = movable[i], B = movable[j];
          const pa = gp(A), pb = gp(B);
          translate(A, pb.x, pb.y);
          translate(B, pa.x, pa.y);
          const s = freeScore();
          if (s < curScore - 1e-6) { curScore = s; improved = true; }
          else { translate(A, pa.x, pa.y); translate(B, pb.x, pb.y); }
        }
      }
      if (!improved) break;
      let step2 = STEP_START / 2;
      while (step2 >= STEP_MIN) {
        let imp2 = false;
        for (const id of movable) {
          const p = gp(id);
          for (const [dx, dy] of dirs) {
            if (tryMove(id, p.x + dx * step2, p.y + dy * step2) >= 0) imp2 = true;
          }
        }
        if (!imp2) step2 /= 2;
      }
    }
    // 4) 整体平移到正数区间（React Flow fitView 会自动适配，但避免负坐标更稳）
    let minX = Infinity, minY = Infinity;
    for (const id of movable) {
      const p = gp(id);
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
    if (minX < 0 || minY < 0) {
      for (const id of movable) {
        const p = gp(id);
        pos.set(id, { x: p.x - minX, y: p.y - minY });
      }
    }

    // 护栏：优化结果不优于默认则回退
    if (freeScore() >= defaultScore) {
      for (const [l, arr] of defaultLayers) layers.set(l, arr);
      return pack();
    }
    return pos;
  }

  return pack();
}

// ---------- 星状布局：力导向（斥力 + 连线引力 + 径向目标 + 中心居中） ----------
function starLayout(pages: DisplayPage[], edges: DisplayEdge[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const home = pages.find((p) => p.id === '/');
  const others = pages.filter((p) => p.id !== '/');
  // 初始位置：按图距分层放射
  const ring = (d: number) => 200 + d * 180;
  const byDist = new Map<string, number>();
  for (const p of pages) byDist.set(p.id, p.id === '/' ? 0 : 1);
  for (let d = 1; d <= 3; d++) {
    const front = pages.filter((p) => byDist.get(p.id) === d - 1).map((p) => p.id);
    for (const e of edges) {
      if (front.includes(e.source) && !byDist.has(e.target)) byDist.set(e.target, d);
    }
  }
  for (const p of others) {
    const d = byDist.get(p.id) ?? 2;
    const angle = (Math.PI * 2 * (others.indexOf(p))) / others.length;
    pos.set(p.id, { x: Math.cos(angle) * ring(d), y: Math.sin(angle) * ring(d) });
  }
  pos.set('/', { x: 0, y: 0 });

  // 力导向迭代
  const nodes = [...pos.keys()];
  const k = 180; // 理想边长
  for (let iter = 0; iter < 300; iter++) {
    const disp = new Map<string, { dx: number; dy: number }>();
    for (const id of nodes) disp.set(id, { dx: 0, dy: 0 });
    // 斥力
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = pos.get(nodes[i])!, b = pos.get(nodes[j])!;
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.max(0.01, Math.hypot(dx, dy));
        const force = (k * k) / dist;
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        disp.get(nodes[i])!.dx += fx; disp.get(nodes[i])!.dy += fy;
        disp.get(nodes[j])!.dx -= fx; disp.get(nodes[j])!.dy -= fy;
      }
    }
    // 引力
    for (const e of edges) {
      const a = pos.get(e.source), b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.max(0.01, Math.hypot(dx, dy));
      const force = (dist * dist) / k;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      disp.get(e.source)!.dx += fx; disp.get(e.source)!.dy += fy;
      disp.get(e.target)!.dx -= fx; disp.get(e.target)!.dy -= fy;
    }
    // 径向约束：保持分层距离
    for (const id of nodes) {
      if (id === '/') continue;
      const p = pos.get(id)!;
      const d = byDist.get(id) ?? 2;
      const target = ring(d);
      const dist = Math.hypot(p.x, p.y);
      const radial = (dist - target) * 0.3;
      disp.get(id)!.dx -= (p.x / dist) * radial;
      disp.get(id)!.dy -= (p.y / dist) * radial;
    }
    // 更新位置
    const temp = 100 * Math.pow(0.95, iter);
    for (const id of nodes) {
      const p = pos.get(id)!;
      const d = disp.get(id)!;
      const len = Math.hypot(d.dx, d.dy);
      if (len > 0) {
        p.x += (d.dx / len) * Math.min(len, temp);
        p.y += (d.dy / len) * Math.min(len, temp);
      }
    }
  }
  // 居中
  let cx = 0, cy = 0, cnt = 0;
  for (const p of pos.values()) { cx += p.x; cy += p.y; cnt++; }
  cx /= cnt; cy /= cnt;
  for (const p of pos.values()) { p.x -= cx; p.y -= cy; }
  return pos;
}

// ---------- 主组件 ----------
export function JourneyTopology() {
  return (
    <ReactFlowProvider>
      <TopologyInner />
    </ReactFlowProvider>
  );
}

function TopologyInner() {
  const [metric, setMetric] = useState<Metric>('count');
  const [span, setSpan] = useState<Span>('total');
  const [ratio, setRatio] = useState(1);
  const [mode, setMode] = useState<Mode>('tree');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [optNonce, setOptNonce] = useState(0);
  const [optParams, setOptParams] = useState<OptParams>(DEFAULT_OPT);
  const [fitNonce, setFitNonce] = useState(0);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [tick, bump] = useReducer((x: number) => x + 1, 0);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const loadedMode = useRef<Mode | null>(null);
  const [memories, setMemories] = useState<MemSlot[]>([]);
  const [memName, setMemName] = useState('');
  const [showMemInput, setShowMemInput] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const { fitView } = useReactFlow();

  const { data: graph, loading, error } = useAdminApi<JourneyGraph>('/api/admin/journey-graph');
  const days = graph?.dateRange.start
    ? Math.max(1, Math.round((Date.parse(graph.dateRange.end) - Date.parse(graph.dateRange.start)) / 86400000) + 1)
    : 1;

  // 布局层 memo：只依赖数据与布局开关，悬停变化不重算布局
  const layout = useMemo(() => {
    if (!graph) return null;
    const display = buildDisplay(graph, metric, ratio);
    // 导师页分组 stacks（8 位一组按 raw 降序）+ memberStack
    const mentorPages = display.pages.filter((p) => isMentorPage(p.id)).sort((a, b) => b.raw - a.raw);
    const stacks: StackInfo[] = [];
    for (let i = 0; i < mentorPages.length; i += STACK_SIZE) {
      const members = mentorPages.slice(i, i + STACK_SIZE);
      stacks.push({
        id: `${STACK_PREFIX}${Math.floor(i / STACK_SIZE) + 1}`,
        members: members.map((m) => m.id),
        raw: members.reduce((a, m) => a + m.raw, 0),
        top: members.slice(0, 3).map((m) => ({ id: m.id, sub: m.sub, raw: m.raw })),
      });
    }
    const memberStack = new Map<string, string>();
    stacks.forEach((s) => s.members.forEach((m) => memberStack.set(m, s.id)));
    const pos = mode === 'tree' ? treeLayout(display, stacks, expanded, optNonce > 0, optParams) : starLayout(display.pages, display.edges);
    return { display, stacks, memberStack, pos };
  }, [graph, metric, ratio, mode, expanded, optNonce, optParams]);

  // 节点/边渲染 memo：依赖 hover/tick 等交互状态
  const { nodes, edges } = useMemo(() => {
    if (!graph || !layout) return { nodes: [] as Node[], edges: [] as Edge[] };
    const { display, stacks, memberStack, pos } = layout;
    const showV = (raw: number) => { const s = raw / ratio; return span === 'avg' ? s / days : s; };
    const days = graph.dateRange.start
      ? Math.max(1, Math.round((Date.parse(graph.dateRange.end) - Date.parse(graph.dateRange.start)) / 86400000) + 1)
      : 1;

    const nodeList: Node[] = [];
    const edgeList: Edge[] = [];

    if (mode === 'tree') {
      // 渲染位置：手动拖过的框优先用拖后位置，否则用布局位置
      const renderPos = (id: string) => posRef.current.get(id) ?? pos.get(id) ?? { x: 0, y: 0 };
      // 普通页面节点
      for (const p of display.pages) {
        if (isMentorPage(p.id)) continue;
        const posP = renderPos(p.id);
        const bs = display.btnsByPage.get(p.id) ?? [];
        nodeList.push({
          id: p.id,
          type: 'page',
          position: posP,
          data: {
            label: p.label,
            sub: p.sub,
            raw: showV(p.raw),
            btns: bs.map((b) => ({ key: b.key, label: b.label, raw: showV(b.raw) })),
            isOther: p.isOther,
            hoverNode,
            tick,
          },
        });
      }
      // 导师组节点（折叠）
      for (const s of stacks) {
        if (expanded.has(s.id)) continue;
        const posS = renderPos(s.id);
        const names = s.members.map(mentorFirstName).filter((n): n is string => !!n);
        nodeList.push({
          id: s.id,
          type: 'stack',
          position: posS,
          data: {
            label: `导师组 ${s.id.replace(STACK_PREFIX, '')}`,
            raw: showV(s.raw),
            names: names.length ? names : ['长尾导师'],
            count: s.members.length,
            expanded: false,
            hoverNode,
            tick,
          },
        });
      }
      // 展开的导师组：组标题 + 成员小卡
      for (const s of stacks) {
        if (!expanded.has(s.id)) continue;
        const posS = renderPos(s.id);
        const names = s.members.map(mentorFirstName).filter((n): n is string => !!n);
        nodeList.push({
          id: s.id,
          type: 'stack',
          position: posS,
          data: {
            label: `导师组 ${s.id.replace(STACK_PREFIX, '')}`,
            raw: showV(s.raw),
            names: names.length ? names : ['长尾导师'],
            count: s.members.length,
            expanded: true,
            hoverNode,
            tick,
          },
        });
        for (const m of s.members) {
          const posM = renderPos(m);
          const p = display.pages.find((x) => x.id === m);
          if (!p) continue;
          const bs = display.btnsByPage.get(m) ?? [];
          nodeList.push({
            id: m,
            type: 'page',
            position: posM,
            data: {
              label: p.label,
              sub: p.sub,
              raw: showV(p.raw),
              btns: bs.map((b) => ({ key: b.key, label: b.label, raw: showV(b.raw) })),
              isMini: true,
              hoverNode,
              tick,
            },
          });
        }
      }
      // 边：导师成员页的边聚合到所属组节点（组节点只有 page:out 桩），同起点同终点合并
      const agg = new Map<string, { src: string; handle: string; tgt: string; kind: DisplayEdge['kind']; raw: number }>();
      const maxRaw = Math.max(...display.edges.map((e) => e.raw), 1);
      for (const e of display.edges) {
        const fromStack = isMentorPage(e.source) && memberStack.has(e.source);
        const src = memberStack.get(e.source) ?? e.source;
        const tgt = memberStack.get(e.target) ?? e.target;
        if (src === tgt) continue;
        const handle = fromStack ? 'page:out' : e.sourceHandle;
        const k = `${src}|${handle}->${tgt}`;
        const cur = agg.get(k);
        if (cur) cur.raw += e.raw;
        else agg.set(k, { src, handle, tgt, kind: fromStack ? 'page' : e.kind, raw: e.raw });
      }
      for (const [id, a] of agg) {
        const active = hoverNode === a.src || hoverNode === a.tgt || hoverEdge === id;
        const w = Math.max(1, Math.min(12, (a.raw / maxRaw) * 10));
        edgeList.push({
          id,
          source: a.src,
          sourceHandle: a.handle,
          target: a.tgt,
          animated: false,
          style: { stroke: active ? '#be123c' : a.kind === 'btn' ? EDGE_BTN : a.kind === 'other' ? '#94a3b8' : EDGE_PAGE, strokeWidth: w, opacity: active ? 1 : 0.6 },
          markerEnd: { type: MarkerType.ArrowClosed, color: active ? '#be123c' : a.kind === 'btn' ? EDGE_BTN : a.kind === 'other' ? '#94a3b8' : EDGE_PAGE, width: 28, height: 28, markerUnits: 'userSpaceOnUse' },
          data: { raw: showV(a.raw) },
        });
      }
    } else {
      // 星状模式（拖后位置本会话内生效，不持久化）
      const renderPosStar = (id: string) => posRef.current.get(id) ?? pos.get(id) ?? { x: 0, y: 0 };
      const maxRaw = Math.max(...display.edges.map((e) => e.raw), 1);
      for (const p of display.pages) {
        const posP = renderPosStar(p.id);
        const bs = display.btnsByPage.get(p.id) ?? [];
        const isHome = p.id === '/';
        nodeList.push({
          id: p.id,
          type: 'star',
          position: posP,
          data: {
            label: p.label,
            sub: p.sub,
            raw: showV(p.raw),
            btns: bs.map((b) => ({ key: b.key, label: b.label, raw: showV(b.raw) })),
            isHome,
            isOther: p.isOther,
            hoverNode,
            tick,
          },
        });
      }
      for (const e of display.edges) {
        const active = hoverNode === e.source || hoverNode === e.target || hoverEdge === e.id;
        const w = Math.max(1, Math.min(8, (e.raw / maxRaw) * 8));
        edgeList.push({
          id: e.id,
          source: e.source,
          target: e.target,
          animated: false,
          style: { stroke: active ? '#f472b6' : e.kind === 'btn' ? '#22d3ee' : '#a78bfa', strokeWidth: w, opacity: active ? 1 : 0.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: active ? '#f472b6' : e.kind === 'btn' ? '#22d3ee' : '#a78bfa', width: 12, height: 12 },
          data: { raw: showV(e.raw) },
        });
      }
    }

    return { nodes: nodeList, edges: edgeList };
  }, [graph, layout, metric, span, ratio, mode, expanded, hoverNode, hoverEdge, tick]);

  // 模式/比例/展开/参数布局变化时重新自适应到最佳视野（手动拖拽不触发）
  useEffect(() => {
    const t = requestAnimationFrame(() => fitView({ padding: 0.12, duration: 350, minZoom: 0.15, maxZoom: 1 }));
    return () => cancelAnimationFrame(t);
  }, [fitView, mode, ratio, expanded, optNonce, fitNonce]);

  // 全屏：ESC 退出；切换后等容器尺寸稳定再 fitView
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && fullscreen) setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => fitView({ padding: fullscreen ? 0.08 : 0.12, duration: 300, minZoom: 0.1, maxZoom: 1.5 }), 80);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [fullscreen, fitView]);

  // 切组合时加载当前记忆位
  useEffect(() => {
    setMemories(loadSlots(mode, metric, span, ratio));
  }, [mode, metric, span, ratio]);

  // 加载已保存位置（仅树状模式）
  useEffect(() => {
    if (loadedMode.current === mode) return;
    loadedMode.current = mode;
    if (mode !== 'tree') return;
    try {
      const raw = localStorage.getItem(POS_KEY(mode));
      if (raw) {
        const saved = JSON.parse(raw) as Record<string, { x: number; y: number }>;
        posRef.current = new Map(Object.entries(saved));
        bump();
      }
    } catch { /* ignore */ }
  }, [mode]);

  const persist = useCallback(() => {
    if (mode !== 'tree') return;
    try {
      const obj = Object.fromEntries(posRef.current);
      localStorage.setItem(POS_KEY(mode), JSON.stringify(obj));
    } catch { /* ignore */ }
  }, [mode]);

  const dragActiveRef = useRef(false);

  const onNodesChange = useCallback((changes: NodeChange<Node>[]) => {
    let moved = false;
    for (const c of changes) {
      if (c.type !== 'position' || !c.position) continue;
      // 仅提交真实拖拽产生的位移（c.dragging 为 true 表示拖拽中/结束），过滤点击时的零位移抖动
      if (c.dragging) {
        posRef.current.set(c.id, c.position);
        moved = true;
        dragActiveRef.current = true;
      }
    }
    if (moved) {
      persist();
      bump();
    }
  }, [persist]);

  const onNodeDragStart = useCallback(() => { dragActiveRef.current = true; }, []);
  const onNodeDragStop = useCallback(() => {
    // 拖拽结束：反向估计一次参数（交叉多→加大交叉罚分，重叠多→加大重叠罚分）
    if (mode === 'tree' && layout) {
      const { display, memberStack } = layout;
      const pmap = posRef.current;
      let cross = 0, ovl = 0;
      const ids = [...pmap.keys()];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = pmap.get(ids[i])!, b = pmap.get(ids[j])!;
          if (Math.abs(a.x - b.x) < 220 + 16 && Math.abs(a.y - b.y) < 200 + 16) ovl++;
        }
      }
      const sample = display.edges.slice(0, 24);
      for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
          const a = pmap.get(memberStack.get(sample[i].source) ?? sample[i].source);
          const b = pmap.get(memberStack.get(sample[i].target) ?? sample[i].target);
          const c2 = pmap.get(memberStack.get(sample[j].source) ?? sample[j].source);
          const d = pmap.get(memberStack.get(sample[j].target) ?? sample[j].target);
          if (!a || !b || !c2 || !d) continue;
          const den = (b.x - a.x) * (d.y - c2.y) - (b.y - a.y) * (d.x - c2.x);
          if (den === 0) continue;
          const t = ((c2.x - a.x) * (d.y - c2.y) - (c2.y - a.y) * (d.x - c2.x)) / den;
          const u = ((c2.x - a.x) * (b.y - a.y) - (c2.y - a.y) * (b.x - a.x)) / den;
          if (t > 0 && t < 1 && u > 0 && u < 1) cross++;
        }
      }
      if (cross > 0 || ovl > 0) {
        setOptParams((p) => ({
          ...p,
          crossCost: Math.min(100000, Math.max(1000, p.crossCost + cross * 5000)),
          ovlCost: Math.min(200000, Math.max(1000, p.ovlCost + ovl * 10000)),
        }));
      }
    }
    // 留一拍再解锁，让紧随其后的 click 能识别出「这是拖拽不是点击」
    setTimeout(() => { dragActiveRef.current = false; }, 0);
  }, [mode, layout]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    // 拖拽结束时浏览器仍可能补发 click，这里直接忽略，避免误触发展开/收起
    if (dragActiveRef.current) return;
    if (isStack(node.id)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id); else next.add(node.id);
        return next;
      });
    }
  }, []);

  if (loading && !graph) return <ViewState loading />;
  if (error) return <ViewState error={error} />;
  if (!graph) return null;

  const clearSavedPos = () => {
    posRef.current = new Map();
    try { localStorage.removeItem(POS_KEY(mode)); } catch { /* ignore */ }
  };

  // 参数布局：清掉手动拖拽位置，按当前参数重算
  const applyParamLayout = () => {
    clearSavedPos();
    setOptNonce((n) => n + 1);
    setFitNonce((n) => n + 1);
  };

  const resetLayout = () => {
    clearSavedPos();
    setExpanded(new Set());
    setOptNonce(0);
    setFitNonce((n) => n + 1);
  };

  // 记忆位：保存当前所见（参数+位置+展开状态）
  const saveMemory = () => {
    if (memories.length >= 5) return;
    setShowMemInput(true);
    setMemName(`记忆位${memories.length + 1}`);
  };
  const confirmSaveMemory = () => {
    const name = memName.trim() || `记忆位${memories.length + 1}`;
    const slot: MemSlot = {
      id: crypto.randomUUID(),
      name,
      time: Date.now(),
      optParams: { ...optParams },
      positions: Object.fromEntries(posRef.current),
      expanded: [...expanded],
    };
    const next = [...memories, slot];
    setMemories(next);
    saveSlots(mode, metric, span, ratio, next);
    setShowMemInput(false);
    setMemName('');
  };

  const applyMemory = (slot: MemSlot) => {
    setOptParams(slot.optParams);
    posRef.current = new Map(Object.entries(slot.positions));
    setExpanded(new Set(slot.expanded));
    setOptNonce((n) => n + 1);
    setFitNonce((n) => n + 1);
    persist();
  };

  const deleteMemory = (id: string) => {
    const next = memories.filter((m) => m.id !== id);
    setMemories(next);
    saveSlots(mode, metric, span, ratio, next);
  };

  // 画布内部元素（浮层 + ReactFlow）：原位与全屏弹窗共用，同一时间只渲染一份
  const flowCanvas = (
    <>
      {/* 全屏切换：画布左上角 */}
      <button
        onClick={() => setFullscreen((v) => !v)}
        title={fullscreen ? '退出全屏（ESC）' : '全屏画布'}
        className={`absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm transition ${
          fullscreen
            ? 'border-orange-300 bg-orange-50 text-orange-600'
            : 'border-stone-200 bg-white/90 text-stone-500 hover:border-orange-300 hover:text-orange-600'
        }`}
      >
        {fullscreen ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3" />
          </svg>
        )}
      </button>
      {/* 记忆位：画布右上角，最多5个 */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        {memories.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-0.5 rounded-full border border-stone-200 bg-white/90 px-2 py-0.5 text-[10px] text-stone-600 shadow-sm backdrop-blur-sm">
            <button
              onClick={() => applyMemory(m)}
              className="hover:text-orange-600"
              title={`应用记忆位：${m.name}（${new Date(m.time).toLocaleDateString()}）`}
            >
              {m.name}
            </button>
            <button
              onClick={() => deleteMemory(m.id)}
              className="text-stone-400 hover:text-red-500"
              title="删除"
            >
              ×
            </button>
          </span>
        ))}
        {memories.length < 5 && (
          <button
            onClick={saveMemory}
            className="rounded-full border border-dashed border-stone-300 bg-white/80 px-2 py-0.5 text-[10px] text-stone-500 hover:border-orange-300 hover:text-orange-600"
            title="保存当前参数+位置为记忆位"
          >
            +存记忆
          </button>
        )}
      </div>

      {/* 记忆位命名输入框 */}
      {showMemInput && (
        <div className="absolute right-3 top-12 z-20 rounded-xl border border-orange-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs text-stone-600">记忆位名称</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={memName}
              onChange={(e) => setMemName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmSaveMemory()}
              className="w-40 rounded border border-stone-200 px-2 py-1 text-xs outline-none focus:border-orange-300"
              autoFocus
            />
            <button
              onClick={confirmSaveMemory}
              className="rounded bg-orange-500 px-3 py-1 text-xs text-white hover:bg-orange-600"
            >
              保存
            </button>
            <button
              onClick={() => setShowMemInput(false)}
              className="rounded border border-stone-200 px-3 py-1 text-xs text-stone-500 hover:border-stone-300"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <ReactFlow
        key={mode}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
        minZoom={0.05}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onNodeMouseEnter={(_, n) => setHoverNode(n.id)}
        onNodeMouseLeave={() => setHoverNode(null)}
        onEdgeMouseEnter={(_, e) => setHoverEdge(e.id)}
        onEdgeMouseLeave={() => setHoverEdge(null)}
        nodesDraggable
        zoomOnScroll
        selectNodesOnDrag={false}
      >
        {mode === 'star' ? <Background gap={22} color="#1e293b" /> : <Background gap={16} color="#e7e5e4" />}
        <Controls showInteractive={false} />
      </ReactFlow>
    </>
  );

  return (
    <div className="rounded-2xl border border-stone-200/60 bg-white/80 p-4 shadow-sm">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-stone-100 p-0.5">
          {(['count', 'users'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`rounded-full px-3 py-1 text-xs transition ${metric === m ? 'bg-orange-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              {m === 'count' ? '次数' : '人数'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-stone-100 p-0.5">
          {(['total', 'avg'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSpan(s)}
              className={`rounded-full px-3 py-1 text-xs transition ${span === s ? 'bg-orange-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              {s === 'total' ? '累计' : '日均'}
            </button>
          ))}
        </div>
        <span className="text-xs text-stone-400">{days}天</span>
        <div className="flex items-center gap-1 rounded-full bg-stone-100 p-0.5">
          {RATIOS.map((r) => (
            <button
              key={r}
              onClick={() => setRatio(r)}
              className={`rounded-full px-2.5 py-1 text-xs transition ${ratio === r ? 'bg-orange-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              1:{r}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-stone-100 p-0.5">
          {(['tree', 'star'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-xs transition ${mode === m ? 'bg-orange-500 text-white shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
            >
              {m === 'tree' ? '树状' : '星状'}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={applyParamLayout}
            title="按当前参数重新计算布局"
            className={`rounded-full border px-2.5 py-1 text-xs ${optNonce > 0 ? 'border-orange-300 bg-orange-50 text-orange-600' : 'border-stone-200 text-stone-500 hover:border-stone-300'}`}
          >
            参数布局
          </button>
          <button onClick={resetLayout} className="rounded-full border border-stone-200 px-2.5 py-1 text-xs text-stone-500 hover:border-stone-300">
            重置布局
          </button>
        </div>
      </div>

      {/* 参数面板（默认展开） */}
      <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50/60 p-3 text-[11px] text-stone-600">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-orange-700">布局参数（点击「参数布局」生效）</span>
          <button onClick={() => setOptParams(DEFAULT_OPT)} className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[10px] text-stone-500 hover:border-stone-300">恢复默认</button>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
          {([
            ['交叉罚分', 'crossCost', 1000, 100000, 1000],
            ['重叠罚分', 'ovlCost', 1000, 200000, 1000],
            ['紧凑度', 'compactW', 0, 10, 0.5],
            ['粗扫网格', 'gridN', 5, 15, 1],
            ['起始步长', 'stepStart', 100, 1000, 50],
            ['最小步长', 'stepMin', 4, 64, 4],
          ] as const).map(([label, key, min, max, step]) => (
            <label key={key} className="flex flex-col gap-0.5">
              <span className="text-stone-500">{label}</span>
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={optParams[key]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setOptParams((p) => ({ ...p, [key]: Math.max(min, Math.min(max, v)) }));
                }}
                className="rounded border border-stone-200 bg-white px-1.5 py-0.5 tabular-nums outline-none focus:border-orange-300"
              />
            </label>
          ))}
        </div>
      </div>

      {/* 画布：非全屏时原位渲染；全屏时通过 Portal 挂到 body，彻底脱离父容器层叠上下文 */}
      {!fullscreen && (
        <div className={`relative mt-2 h-[600px] overflow-hidden rounded-xl ring-1 ${mode === 'star' ? 'bg-[#0b1120] ring-slate-700' : 'bg-stone-50/60 ring-stone-900/[0.06]'}`}>
          {flowCanvas}
        </div>
      )}
      {fullscreen && createPortal(
        <div className="fixed inset-0 z-[2000] bg-black/70 p-4">
          <div className={`relative h-full w-full overflow-hidden rounded-xl ring-1 ${mode === 'star' ? 'bg-[#0b1120] ring-slate-700' : 'bg-stone-50 ring-stone-900/[0.06]'}`}>
            {flowCanvas}
          </div>
        </div>,
        document.body,
      )}

      {/* 底注 */}
      <p className="mt-2 text-[11px] text-stone-400">
        {graph.note} 比例 1:N：折算后 &lt;0.1 的连线/按钮/页面并入「其他」；虚线组为折叠的导师页（每 8 位一组，按访问量排序），点击组节点就地展开为导师小卡矩阵；拖拽位置自动记忆，「参数布局」按当前参数重排（交叉/重叠/紧凑度可调），「存记忆」保存当前参数+位置为记忆位（最多5个，按当前口径组合隔离），「重置布局」恢复默认排布。
      </p>
    </div>
  );
}

// ---------- 节点组件 ----------
const nodeTypes = {
  page: PageNode,
  stack: StackNode,
  star: StarNode,
};

function PageNode({ data }: NodeProps) {
  const { label, sub, raw, btns, isOther, isMini, hoverNode } = data as {
    label: string; sub?: string; raw: number;
    btns: { key: string; label: string; raw: number }[];
    isOther?: boolean; isMini?: boolean; hoverNode: string | null; tick: number;
  };
  const active = hoverNode === null || hoverNode === label;
  const maxBtn = Math.max(...btns.map((b) => b.raw), 1);
  return (
    <div
      className={`rounded-xl border-2 transition-opacity ${isMini ? 'w-[156px]' : 'w-[220px]'}`}
      style={{
        borderColor: isOther ? '#94a3b8' : COLOR_PAGE,
        background: isOther ? '#f1f5f9' : FILL_PAGE,
        opacity: active ? 1 : 0.3,
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-stone-400" />
      <div className="relative border-b px-2.5 py-1.5 text-xs font-medium" style={{ borderColor: isOther ? '#cbd5e1' : '#fdba74' }}>
        <div className="truncate">{label}</div>
        {sub && <div className="truncate text-[10px] font-normal text-stone-500">{sub}</div>}
        <div className="text-[10px] font-normal text-stone-500">{fmt(raw)}</div>
        {/* 页面级跳转桩 */}
        <Handle id="page:out" type="source" position={Position.Right} className="!h-2 !w-2 !bg-orange-500" />
      </div>
      <div className="px-2 py-1.5">
        {btns.map((b) => (
          <div key={b.key} className="relative flex items-center gap-1.5 py-0.5 text-[11px]">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: lerpColor('#86efac', '#15803d', b.raw / maxBtn) }}
            />
            <span className="truncate flex-1">{b.label}</span>
            <span className="tabular-nums text-stone-500">{fmt(b.raw)}</span>
            {/* 按钮级跳转桩：id 与数据 sourceHandle「btn:${key}」对应 */}
            <Handle id={`btn:${b.key}`} type="source" position={Position.Right} className="!h-2 !w-2 !bg-emerald-500" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StackNode({ data }: NodeProps) {
  const { label, raw, names, count, expanded, hoverNode } = data as {
    label: string; raw: number; names: string[];
    count: number; expanded: boolean; hoverNode: string | null; tick: number;
  };
  const active = hoverNode === null || hoverNode === label;
  return (
    <div
      className={`rounded-xl border-2 border-dashed transition-opacity ${expanded ? 'w-[660px]' : 'w-[220px]'}`}
      style={{ borderColor: '#9a3412', background: '#fff7ed', opacity: active ? 1 : 0.3 }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-stone-400" />
      <Handle id="page:out" type="source" position={Position.Right} className="!h-2 !w-2 !bg-orange-500" />
      <div className="relative border-b border-dashed px-2.5 py-1.5 text-xs font-medium" style={{ borderColor: '#fdba74' }}>
        <div className="flex items-center justify-between">
          <span>{label}</span>
          <span className="text-[10px] font-normal text-stone-500">{count}位</span>
        </div>
        <div className="text-[10px] font-normal text-stone-500">{fmt(raw)}</div>
      </div>
      {/* 导师名横排 chips（只显示英文名的名，不显示姓；长尾 x## 不显示；展开后由小卡承载，此处隐藏） */}
      {!expanded && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5">
          {names.map((n) => (
            <span key={n} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{n}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function StarNode({ data }: NodeProps) {
  const { label, sub, raw, btns, isHome, isOther, hoverNode } = data as {
    label: string; sub?: string; raw: number;
    btns: { key: string; label: string; raw: number }[];
    isHome?: boolean; isOther?: boolean; hoverNode: string | null; tick: number;
  };
  const active = hoverNode === null || hoverNode === label;
  const maxBtn = Math.max(...btns.map((b) => b.raw), 1);
  const size = isHome ? 120 : 90;
  return (
    <div
      className="flex flex-col items-center justify-center rounded-full border-2 text-center transition-opacity"
      style={{
        width: size,
        height: size,
        borderColor: isHome ? '#f472b6' : isOther ? '#64748b' : '#22d3ee',
        background: isHome ? 'rgba(244,114,182,0.15)' : isOther ? 'rgba(100,116,139,0.1)' : 'rgba(34,211,238,0.1)',
        boxShadow: isHome ? '0 0 20px rgba(244,114,182,0.4)' : '0 0 12px rgba(34,211,238,0.2)',
        opacity: active ? 1 : 0.3,
      }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-slate-500" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-slate-500" />
      <div className={`px-2 text-[10px] font-medium ${isHome ? 'text-pink-200' : 'text-cyan-100'}`}>
        {label}
      </div>
      {sub && <div className="text-[8px] text-slate-400">{sub}</div>}
      <div className="text-[9px] tabular-nums text-slate-300">{fmt(raw)}</div>
      {btns.length > 0 && (
        <div className="mt-0.5 flex flex-wrap justify-center gap-0.5 px-1">
          {btns.slice(0, 3).map((b) => (
            <span
              key={b.key}
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: lerpColor('#67e8f9', '#0e7490', b.raw / maxBtn) }}
              title={`${b.label}: ${fmt(b.raw)}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
