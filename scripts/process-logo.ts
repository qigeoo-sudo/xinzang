/**
 * Logo 图标标准化脚本（源 = raw-logo.png 原材料）
 *
 * 原材料构图：渐变圆角块 + 榨汁机 + 金币流，最底部金币垂出块底缘之外，
 * 块外有柔和阴影（半透明）。因此不能用非透明包围盒定位块体（会被金币和阴影撑大），
 * 需要用高 alpha 阈值扫描块体真实边缘。
 *
 * 输出：
 *  - icon-block-1024.png：块体铺满画布的圆角母版（封面框内主图；金币贴底平切，由贴片补全）
 *  - icon-1024/512/384/256/192.png：母版缩至 82% 居中，四周 9% 透明安全边（页头等小尺寸）
 *  - icon-maskable-512.png：放大裁切铺满（PWA maskable full-bleed）
 *  - icon-coin.png：从原图抠出的完整金币圆片（封面框外贴片，还原"金币垂出白框"）
 *
 * 换 logo：覆盖 public/icons/raw-logo.png 后重跑 npx tsx scripts/process-logo.ts，
 * 并按脚本打印的贴片参数更新 home-content.tsx 里的金币定位。
 */
import sharp from 'sharp';

const RAW = 'public/icons/raw-logo.png';
const SIZE = 1024;
const RADIUS = 230; // 母版统一圆角
const INNER = 840; // 标准版内容边长（82%）
const PAD = (SIZE - INNER) / 2;
const COIN = { cx: 531, cy: 1192, rx: 58, ry: 46 }; // 最底部金币在 raw 原图坐标系（透视椭圆）

async function main() {
  const { data, info } = await sharp(RAW).raw().toBuffer({ resolveWithObject: true });
  const A = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3];
  const med = (arr: number[]) => arr.sort((p, q) => p - q)[Math.floor(arr.length / 2)];

  // 1) 块体边缘扫描：alpha>=250 排除半透明阴影；采样列避开底部金币（中央）与左右阴影
  const cols = [0.1, 0.14, 0.18, 0.68, 0.74].map((f) => Math.round(info.width * f));
  const rows = [0.3, 0.42, 0.55, 0.65].map((f) => Math.round(info.height * f));
  const tops: number[] = [], bots: number[] = [], lefts: number[] = [], rights: number[] = [];
  for (const x of cols) {
    let t = -1, b = -1;
    for (let y = 0; y < info.height; y++) if (A(x, y) >= 250) { if (t < 0) t = y; b = y; }
    if (t >= 0) { tops.push(t); bots.push(b); }
  }
  for (const y of rows) {
    let l = -1, r = -1;
    for (let x = 0; x < info.width; x++) if (A(x, y) >= 250) { if (l < 0) l = x; r = x; }
    if (l >= 0) { lefts.push(l); rights.push(r); }
  }
  const BL = med(lefts), BR = med(rights), BT = med(tops), BB = med(bots);
  const BW = Math.min(BR - BL, BB - BT); // 块体应为正方形，取小值防偏差
  console.log('块体边缘:', { left: BL, right: BR, top: BT, bottom: BB, width: BW });

  // 2) 母版：块体裁出 -> 铺满 1024 -> 统一圆角
  const blockRaw = await sharp(RAW)
    .extract({ left: BL, top: BT, width: BW, height: BW })
    .resize(SIZE, SIZE)
    .png()
    .toBuffer();
  const roundedFull = await sharp(blockRaw)
    .composite([
      {
        input: Buffer.from(
          `<svg width="${SIZE}" height="${SIZE}"><rect width="${SIZE}" height="${SIZE}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();
  await sharp(roundedFull).png().toFile('public/icons/icon-block-1024.png');

  // 3) 标准版：82% 居中 + 四周等宽透明边
  const standard = await sharp(roundedFull)
    .resize(INNER, INNER)
    .extend({ top: PAD, bottom: PAD, left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(standard).png().toFile('public/icons/icon-1024.png');
  for (const s of [512, 384, 256, 192]) {
    await sharp(standard).resize(s, s).png().toFile(`public/icons/icon-${s}.png`);
  }

  // 4) maskable：放大裁切铺满
  const zoomed = await sharp(roundedFull).resize(1229, 1229).png().toBuffer();
  await sharp(zoomed)
    .extract({ left: 103, top: 103, width: SIZE, height: SIZE })
    .resize(512, 512)
    .png()
    .toFile('public/icons/icon-maskable-512.png');

  // 5) 金币贴片：从原图抠最底部金币（椭圆蒙版贴合透视，半径内收减少背景带入）
  const coinBoxW = COIN.rx * 2 + 8;
  const coinBoxH = COIN.ry * 2 + 8;
  const cLeft = Math.max(0, COIN.cx - COIN.rx - 4);
  const cTop = Math.max(0, COIN.cy - COIN.ry - 4);
  await sharp(RAW)
    .extract({ left: cLeft, top: cTop, width: coinBoxW, height: coinBoxH })
    .composite([
      {
        input: Buffer.from(
          `<svg width="${coinBoxW}" height="${coinBoxH}"><ellipse cx="${coinBoxW / 2}" cy="${coinBoxH / 2}" rx="${COIN.rx}" ry="${COIN.ry}" fill="#fff"/></svg>`,
        ),
        blend: 'dest-in',
      },
    ])
    .png()
    .toFile('public/icons/icon-coin.png');

  // 6) 打印封面贴片定位参数（主图 scale 1.18 中心裁切，容器=白框；金币中心恰在框缘、突出约 1/3）
  const SCALE = 1.18;
  const fx = (COIN.cx - BL) / BW;
  const fy = (COIN.cy - BT) / BW;
  const fs = ((COIN.rx * 2) / BW) * SCALE; // 贴片横向直径占容器比（含主图同倍率放大）
  const fxp = (fx - 0.5) * SCALE + 0.5;
  const fyp = (fy - 0.5) * SCALE + 0.5;
  console.log('贴片参数: left', ((fxp - fs / 2) * 100).toFixed(1) + '%', 'top', ((fyp - (COIN.ry / BW) * SCALE / 2) * 100).toFixed(1) + '%', 'width', (fs * 100).toFixed(1) + '%');

  console.log('logo 标准化完成：block/1024/512/384/256/192/maskable-512/coin');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
