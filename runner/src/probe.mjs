/**
 * 端点探测：只判断「能否建立连接拿到响应」，不推论 VPN 软件状态。
 * 任何 HTTP 响应（含 403/405/重定向）都算可达；仅网络层失败算不可达。
 */

export const ENDPOINTS = {
  // 国内参照点：判断本机是否联网
  cnBase: { url: 'https://www.baidu.com', label: '国内参照点' },
  // 飞书收发保持直连
  feishu: { url: 'https://open.feishu.cn', label: '飞书' },
  // Claude 桌面端所需
  claude: { url: 'https://claude.ai', label: 'Claude' },
  // Codex CLI 登录/后端（chatgpt.com 系）
  codex: { url: 'https://chatgpt.com', label: 'Codex' },
  github: { url: 'https://github.com', label: 'GitHub' },
  // VPN 指示点：国内默认不可达，通则判定 VPN 已开启
  vpnIndicator: { url: 'https://www.google.com/generate_204', label: 'VPN 指示点' },
};

export const DEFAULT_TIMEOUT_MS = 5_000;

export async function probeOnce(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ac.signal,
      // 不带任何凭据/cookie，纯连通性探测
      credentials: 'omit',
    });
    return { reachable: true, latencyMs: Date.now() - started };
  } catch {
    return { reachable: false, latencyMs: null };
  } finally {
    clearTimeout(timer);
  }
}

/** 并发探测全部端点 */
export async function probeAll(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const keys = Object.keys(ENDPOINTS);
  const results = await Promise.all(
    keys.map(async (key) => [key, await probeOnce(ENDPOINTS[key].url, timeoutMs)]),
  );
  return {
    checkedAt: new Date().toISOString(),
    endpoints: Object.fromEntries(results),
  };
}
