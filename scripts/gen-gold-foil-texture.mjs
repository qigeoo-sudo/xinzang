// 生成深蓝色洒金宣纸纹理（无缝平铺）
// 背景色接近 #2F4257，金色箔片随机散布，有聚有散，不规则金簇
import sharp from 'sharp';

const SIZE = 1024; // 纹理尺寸（正方形，便于无缝平铺）
const OUT = 'public/textures/blue-gold-foil-paper.png';

// 基础背景色：深灰蓝 #1E2E3F（更深，压住画面）
const BASE_R = 30, BASE_G = 46, BASE_B = 63;

// ---- 工具函数 ----
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

// gold 调色板：亮金属金（保持原色值，亮度通过系数控制）
const GOLD_PALETTE = [
  [255, 215, 0],    // 亮金
  [245, 222, 139],  // 淡金
  [238, 201, 101],  // 浅金
  [255, 223, 100],  // 明金
  [212, 175, 55],   // 深金
  [255, 240, 180],  // 高光金
];

// 初始化像素缓冲（RGBA）
const buf = Buffer.alloc(SIZE * SIZE * 4);
const setPx = (x, y, r, g, b, a = 255) => {
  const i = (y * SIZE + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
};
const blendPx = (x, y, r, g, b, a) => {
  // alpha 混合到背景
  const i = (y * SIZE + x) * 4;
  const bgR = buf[i], bgG = buf[i + 1], bgB = buf[i + 2];
  const f = a / 255;
  buf[i] = Math.round(bgR * (1 - f) + r * f);
  buf[i + 1] = Math.round(bgG * (1 - f) + g * f);
  buf[i + 2] = Math.round(bgB * (1 - f) + b * f);
};

// ---- 1. 铺纯色底（宁静纯净，无噪点/纤维/暗斑）----
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    setPx(x, y, BASE_R, BASE_G, BASE_B);
  }
}

// ---- 2. 金箔碎屑：有聚有散 ----
// 先生成若干"金簇中心"（密集区），其余区域稀疏散布
const CLUSTER_CENTERS = [];
const numClusters = randInt(7, 12);
for (let i = 0; i < numClusters; i++) {
  CLUSTER_CENTERS.push({
    x: rand(0, SIZE),
    y: rand(0, SIZE),
    radius: rand(40, 130),
    density: rand(0.6, 1.0), // 簇内密度
  });
}

// 判断某点是否在某个簇内，并返回局部密度
function clusterDensityAt(x, y) {
  let maxDensity = 0;
  for (const c of CLUSTER_CENTERS) {
    // 环形距离（无缝）
    let dx = Math.abs(x - c.x);
    let dy = Math.abs(y - c.y);
    dx = Math.min(dx, SIZE - dx);
    dy = Math.min(dy, SIZE - dy);
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < c.radius) {
      const local = (1 - d / c.radius) * c.density;
      if (local > maxDensity) maxDensity = local;
    }
  }
  return maxDensity;
}

// 绘制一个不规则金箔碎片（小多边形 + 柔化边缘）
function drawFlake(cx, cy, size) {
  const col = GOLD_PALETTE[randInt(0, GOLD_PALETTE.length - 1)];
  const [gr, gg, gb] = col;
  const sides = randInt(5, 9);
  const rot = rand(0, Math.PI * 2);
  const radii = [];
  for (let i = 0; i < sides; i++) {
    radii.push(size * rand(0.5, 1.2));
  }
  // 生成多边形点集
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const ang = rot + (i / sides) * Math.PI * 2;
    pts.push({
      x: cx + Math.cos(ang) * radii[i],
      y: cy + Math.sin(ang) * radii[i],
    });
  }
  // 多边形填充（扫描线 + 抗锯齿用多次偏移实现软边）
  const minX = Math.floor(Math.min(...pts.map(p => p.x)) - 1);
  const maxX = Math.ceil(Math.max(...pts.map(p => p.x)) + 1);
  const minY = Math.floor(Math.min(...pts.map(p => p.y)) - 1);
  const maxY = Math.ceil(Math.max(...pts.map(p => p.y)) + 1);

  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      if (pointInPolygon(px + 0.5, py + 0.5, pts)) {
        // 距离中心越远越透明（柔化边缘 + 哑光感）
        let dx = px - cx, dy = py - cy;
        // 环形无缝：如果碎片靠近边缘，允许越界绘制到对面
        const wx = ((px % SIZE) + SIZE) % SIZE;
        const wy = ((py % SIZE) + SIZE) % SIZE;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const norm = dist / (size * 1.2);
        // 减少边缘柔化，金屑更锐利清晰
        const edgeFade = Math.max(0, 1 - norm * norm * 0.5);
        // 加入金色亮度随机变化（恢复初始亮度）
        const bright = rand(0.7, 1.15);
        const a = Math.min(255, edgeFade * 255 * rand(0.7, 0.9));
        blendPx(wx, wy, gr * bright, gg * bright, gb * bright, a);
      }
    }
  }
}

function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// 撒金箔：总数量根据面积决定
const TOTAL_FLAKES = 175;
let placed = 0;
let attempts = 0;
while (placed < TOTAL_FLAKES && attempts < TOTAL_FLAKES * 20) {
  attempts++;
  const x = rand(0, SIZE);
  const y = rand(0, SIZE);
  const cd = clusterDensityAt(x, y);
  // 簇内更容易被选中；非簇区域也有少量散布
  const baseChance = 0.15;
  const chance = baseChance + cd * 0.85;
  if (Math.random() > chance) continue;

  // 大小：簇内偏大，散布偏小
  const baseSize = cd > 0.1 ? rand(1.5, 5.5) : rand(0.8, 3);
  // 偶尔出现大碎片
  const size = Math.random() < 0.03 ? rand(5, 9) : baseSize;
  drawFlake(x, y, size);
  placed++;
}

console.log(`Placed ${placed} gold flakes across ${numClusters} clusters.`);

// ---- 4. 整体细微颗粒（哑光纸感）----
for (let i = 0; i < SIZE * SIZE * 0.008; i++) {
  const x = randInt(0, SIZE - 1);
  const y = randInt(0, SIZE - 1);
  const v = (Math.random() - 0.5) * 30;
  const j = (y * SIZE + x) * 4;
  buf[j] = Math.max(0, Math.min(255, buf[j] + v));
  buf[j + 1] = Math.max(0, Math.min(255, buf[j + 1] + v));
  buf[j + 2] = Math.max(0, Math.min(255, buf[j + 2] + v));
}

// ---- 输出 PNG ----
await sharp(buf, {
  raw: { width: SIZE, height: SIZE, channels: 4 },
})
  .png({ compressionLevel: 9 })
  .toFile(OUT);

console.log(`Saved: ${OUT} (${SIZE}x${SIZE})`);
