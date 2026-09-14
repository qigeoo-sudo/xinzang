// 解析教育部 2024 年全国普通高等学校名单（xls）→ JSON
// 数据源：http://www.moe.gov.cn/.../W020240621412769813275.xls
// 输出：scripts/data/universities-cn.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SRC = join(root, 'scripts', 'data', 'moe-2024.xls');
const OUT = join(root, 'scripts', 'data', 'universities-cn.json');

const buf = readFileSync(SRC);
const wb = XLSX.read(buf, { type: 'buffer' });

console.log('Sheets:', wb.SheetNames);
const sheet = wb.Sheets[wb.SheetNames[0]];

// 转成行数组，header 行跳过
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
console.log('Total rows:', rows.length);
console.log('First row sample:', JSON.stringify(rows[0]));
console.log('Sample row 2:', JSON.stringify(rows[1]));
console.log('Sample row 3:', JSON.stringify(rows[2]));
console.log('Sample row 4:', JSON.stringify(rows[3]));

// 教育部 xls 格式：每省级分组行 + 数据行
// 分组行如 "北京市（92所）"，数据行 [序号, 学校名称, 学校标识码, 主管部门, 所在地, 办学层次, 备注]
const universities = [];
let currentProvince = '';
let count = 0;
for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  if (!row || row.length === 0) continue;
  const firstCell = String(row[0] ?? '').trim();
  // 分组行：含括号的省级标题
  if (firstCell.includes('（') && firstCell.includes('所')) {
    const m = firstCell.match(/^(.+?)（\d+所）/);
    if (m) {
      currentProvince = m[1];
      continue;
    }
  }
  // 数据行：第一个字段是序号（数字）
  if (/^\d+$/.test(firstCell) && row[1]) {
    const name = String(row[1]).trim();
    if (!name) continue;
    universities.push({
      name,
      province: currentProvince,
      location: String(row[4] ?? '').trim(),
      level: String(row[5] ?? '').trim(),
    });
    count++;
  }
}

console.log(`Parsed ${count} universities`);
console.log('First 3:', JSON.stringify(universities.slice(0, 3), null, 2));
console.log('Last 3:', JSON.stringify(universities.slice(-3), null, 2));

writeFileSync(OUT, JSON.stringify(universities, null, 2), 'utf8');
console.log(`Output: ${OUT}`);
