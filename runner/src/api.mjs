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

async function postJson(baseUrl, urlPath, body, token) {
  assertSafeBaseUrl(baseUrl);
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(new URL(urlPath, baseUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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

export function heartbeat(baseUrl, token, body) {
  return postJson(baseUrl, '/api/content-ops/runner/heartbeat', body, token);
}

export function reportResult(baseUrl, token, body) {
  return postJson(baseUrl, '/api/content-ops/runner/commands/result', body, token);
}
