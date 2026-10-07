/**
 * 控制平面 HTTP 客户端（Bearer runnerToken）。
 * 端点契约（M3 实现）：
 *   POST /api/content-ops/runner/register
 *   POST /api/content-ops/runner/heartbeat      → { commands: [...] }
 *   POST /api/content-ops/runner/commands/result
 * 所有请求只走 HTTPS（本地开发允许 http://localhost）；错误含 HTTP 状态与服务端消息。
 */

export class ApiError extends Error {
  constructor(status, body) {
    super(`控制平面返回 ${status}: ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

function assertSafeBaseUrl(baseUrl) {
  const u = new URL(baseUrl);
  const isLocalDev = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !isLocalDev) {
    throw new Error(`拒绝非 HTTPS 控制平面地址: ${baseUrl}（localhost 开发除外）`);
  }
  return u;
}

async function postJson(baseUrl, urlPath, body, token, runnerId, timeoutMs = 60_000) {
  assertSafeBaseUrl(baseUrl);
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (runnerId) headers['x-runner-id'] = runnerId;
  const res = await fetch(new URL(urlPath, baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // 结果上报可能触发服务端 AI 评分（S8，两份文件并行调用约 30-60 秒），给 180 秒
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }
  if (!res.ok) throw new ApiError(res.status, parsed);
  return parsed;
}

export function register(baseUrl, registrationToken, machineKey, name, version) {
  return postJson(baseUrl, '/api/content-ops/runner/register', {
    registrationToken,
    machineKey,
    name,
    version,
  });
}

export function heartbeat(baseUrl, token, runnerId, body) {
  return postJson(baseUrl, '/api/content-ops/runner/heartbeat', body, token, runnerId);
}

export function reportResult(baseUrl, token, runnerId, body) {
  return postJson(baseUrl, '/api/content-ops/runner/commands/result', body, token, runnerId, 180_000);
}
