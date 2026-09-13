/**
 * 组卷：每个维度从题池里随机抽 perDim 题，再做维度均衡打乱
 * （当前策略：60 题池中六维各抽 5 题，组成 30 题）
 */
export function sampleBalanced<T>(
  input: readonly T[],
  perDim: number,
  getDim: (item: T) => string
): T[] {
  const buckets = new Map<string, T[]>();
  for (const item of input) {
    const dim = getDim(item);
    const bucket = buckets.get(dim);
    if (bucket) bucket.push(item);
    else buckets.set(dim, [item]);
  }

  const picked: T[] = [];
  for (const bucket of buckets.values()) {
    shuffleInPlace(bucket);
    picked.push(...bucket.slice(0, Math.min(perDim, bucket.length)));
  }

  return shuffleBalanced(picked, getDim);
}

/**
 * Fisher-Yates 洗牌 — 每次测试题目顺序随机
 * 优先使用 crypto.getRandomValues，旧环境回退 Math.random
 */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random32() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 按维度均衡洗牌（题库 v0.3 §5.1）：
 * - 60 题全部打乱，不按维度分组
 * - 避免连续出现三道以上同一维度的题
 * 思路：各维度内部先独立洗牌，再贪心合并——每次从剩余题目中按剩余量
 * 加权随机抽一个维度（连续两题同维度时该维度本轮禁选）。
 */
export function shuffleBalanced<T>(
  input: readonly T[],
  getDim: (item: T) => string
): T[] {
  // 贪心排盘在尾部有小概率被迫三连，整盘重抽即可（命中率 >97%，通常一次即成）
  for (let attempt = 0; attempt < 50; attempt++) {
    const built = buildOnce(input, getDim);
    if (built.ok) return built.result;
  }
  // 理论上到不了；兜底返回最后一盘（允许三连），不阻塞作答
  return buildOnce(input, getDim).result;
}

function buildOnce<T>(
  input: readonly T[],
  getDim: (item: T) => string
): { result: T[]; ok: boolean } {
  const buckets = new Map<string, T[]>();
  for (const item of input) {
    const dim = getDim(item);
    const bucket = buckets.get(dim);
    if (bucket) bucket.push(item);
    else buckets.set(dim, [item]);
  }
  for (const bucket of buckets.values()) shuffleInPlace(bucket);

  const remaining = new Map<string, T[]>();
  for (const [dim, bucket] of buckets) remaining.set(dim, bucket);

  const result: T[] = [];
  let prevDim = '';
  let prevPrevDim = '';
  let forcedTriple = false;

  while (result.length < input.length) {
    const candidates: string[] = [];
    for (const [dim, bucket] of remaining) {
      if (bucket.length === 0) continue;
      // 最近两题已是同一维度，本轮禁选，保证不出现三连
      if (dim === prevDim && dim === prevPrevDim) continue;
      candidates.push(dim);
    }
    // 只剩一个维度有余题时三连不可避免，标记本盘作废交由外层重抽
    if (candidates.length === 0) {
      forcedTriple = true;
      for (const [dim, bucket] of remaining) {
        if (bucket.length > 0) candidates.push(dim);
      }
    }
    // 加权：剩余题越多的维度被抽中概率越大，防止末尾某一维堆积
    const weights = candidates.map((d) => remaining.get(d)!.length);
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = random32() * total;
    let chosen = candidates[0];
    for (let i = 0; i < candidates.length; i++) {
      roll -= weights[i];
      if (roll < 0) {
        chosen = candidates[i];
        break;
      }
    }

    const bucket = remaining.get(chosen)!;
    result.push(bucket.pop()!);
    if (bucket.length === 0) remaining.delete(chosen);
    prevPrevDim = prevDim;
    prevDim = chosen;
  }

  return { result, ok: !forcedTriple };
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random32() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function random32(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 4294967296;
  }
  return Math.random();
}
