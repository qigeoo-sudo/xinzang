const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = 'D:\\fruits';
const DST = 'public/fruits';
const fruits = [
  '苹果','香蕉','橘子','西瓜','橙子','梨','葡萄','甜瓜','哈密瓜','猕猴桃',
  '芒果','火龙果','菠萝','桃子','李子','冬枣','草莓','柚子','荔枝','龙眼',
  '樱桃','柿子','石榴','杨梅','椰子','山楂','蓝莓','柠檬','牛油果','金桔',
  '葡萄柚','油桃','百香果','番石榴','木瓜','青柠','榴莲','枇杷','杏','无花果',
  '山竹','红毛丹','桑葚','菠萝蜜','树莓','黑莓','莲雾','释迦果','橄榄','海棠果',
  '杨桃','雪莲果','酸浆','余甘子','蔓越莓','沙棘','刺梨','醋栗','黑加仑','红加仑',
  '刺角瓜','蛋黄果','椰枣','蛇皮果','酸豆','龙宫果','八月瓜','人心果','佛手','拐枣',
  '指橙','嘉宝果','神秘果','黄晶果','巴西莓','诺丽果','刺番荔枝','木奶果','星苹果','面包果',
  '香肉果','马米果','猫屎瓜','蒲桃','桃金娘','露兜果','猴面包果','费约果','火棘果','胡颓子',
  '金樱子','卡卡杜李','卡姆果','木苹果','地菍','巴婆果','鲑鱼莓','野樱莓','云莓','锡兰橄榄'
];

// 中文名 → 拼音/英文文件名映射（避免 URL 编码问题）
const pinyin = [
  'apple','banana','mandarin','watermelon','orange','pear','grape','melon','hami-melon','kiwi',
  'mango','dragon-fruit','pineapple','peach','plum','winter-jujube','strawberry','pomelo','lychee','longan',
  'cherry','persimmon','pomegranate','bayberry','coconut','hawthorn','blueberry','lemon','avocado','kumquat',
  'grapefruit','nectarine','passion-fruit','guava','papaya','lime','durian','loquat','apricot','fig',
  'mangosteen','rambutan','mulberry','jackfruit','raspberry','blackberry','wax-apple','custard-apple','olive','crabapple',
  'carambola','yacón','physalis','phyllanthus','cranberry','sea-buckthorn','cili','gooseberry','blackcurrant','redcurrant',
  'kiwano','canistel','date-palm','salak','tamarind','langsat','august-melon','sapodilla','buddha-hand','hovenia',
  'finger-lime','jabuticaba','miracle-fruit','abiu','acai','noni','soursop','bacuri','star-apple','breadfruit',
  'ambarella','mamey','akebia','rose-apple','myrtle','pandanus','baobab','feijoa','pyracantha','elaeagnus',
  'rosa-roxburghii','kakadu-plum','camu-camu','bael','gynura','pawpaw','salmonberry','aronia','cloudberry','ceylon-olive'
];

async function main() {
  if (!fs.existsSync(DST)) fs.mkdirSync(DST, { recursive: true });
  let ok = 0, fail = 0;
  for (let i = 0; i < fruits.length; i++) {
    const src = path.join(SRC, fruits[i] + '.png');
    const dst = path.join(DST, pinyin[i] + '.webp');
    if (!fs.existsSync(src)) { console.log('MISS', src); fail++; continue; }
    try {
      await sharp(src).resize(256, 256).webp({ quality: 82 }).toFile(dst);
      const sz = fs.statSync(dst).size;
      if (sz > 30720) console.log('LARGE', pinyin[i], (sz/1024).toFixed(1) + 'KB');
      ok++;
    } catch (e) { console.log('ERR', fruits[i], e.message); fail++; }
  }
  console.log(`\nDone: ${ok} OK, ${fail} fail`);
  // 生成映射表
  const map = {};
  fruits.forEach((f, i) => { map[f] = pinyin[i]; });
  fs.writeFileSync('public/fruits/index.json', JSON.stringify(map, null, 2));
}
main();
