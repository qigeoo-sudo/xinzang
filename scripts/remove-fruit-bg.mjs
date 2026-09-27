// 去除水果图片的浅色纯色背景（从四边泛洪填充，只把与边缘相连的近白色像素变透明，
// 不会误伤水果内部的高光和水珠）。用法：node scripts/remove-fruit-bg.mjs <fruit-en> [阈值=232]
import sharp from 'sharp';
import { copyFileSync } from 'node:fs';

const name = process.argv[2];
const threshold = Number(process.argv[3] ?? 232);
if (!name) {
  console.error('用法：node scripts/remove-fruit-bg.mjs <fruit-en> [阈值=232]');
  process.exit(1);
}
const file = `public/fruits/${name}.webp`;

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;

const isBg = (i) => data[i] > threshold && data[i + 1] > threshold && data[i + 2] > threshold;
const visited = new Uint8Array(w * h);
const stack = [];
for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);

let removed = 0;
while (stack.length) {
  const p = stack.pop();
  if (visited[p]) continue;
  visited[p] = 1;
  const i = p * 4;
  if (!isBg(i)) continue;
  data[i + 3] = 0;
  removed++;
  const x = p % w;
  const y = (p / w) | 0;
  if (x > 0) stack.push(p - 1);
  if (x < w - 1) stack.push(p + 1);
  if (y > 0) stack.push(p - w);
  if (y < h - 1) stack.push(p + w);
}

copyFileSync(file, `${process.env.TEMP}\\${name}.webp.bak`); // 原图备份到临时目录
const tmpOut = `${process.env.TEMP}\\${name}.webp.out`;
await sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp().toFile(tmpOut); // sharp 不能原地读写同一文件
copyFileSync(tmpOut, file);
console.log(`${name}: ${w}x${h}，透明化 ${removed} 像素（${((removed / (w * h)) * 100).toFixed(1)}%）`);
