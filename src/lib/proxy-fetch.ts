/**
 * 带代理支持的 fetch 封装
 *
 * Node.js 内置 fetch (undici) 不会自动读取 HTTP_PROXY/HTTPS_PROXY 环境变量，
 * 在沙箱等需要代理出网的环境中会导致连接失败。
 * 使用 undici ProxyAgent 手动注入代理。
 *
 * 生产环境（如 CloudBase）无代理时直接使用原生 fetch
 */
import { ProxyAgent } from 'undici';

const proxyUrl =
  process.env.HTTPS_PROXY || process.env.HTTP_PROXY ||
  process.env.https_proxy || process.env.http_proxy;

// 只在有代理环境变量时创建 ProxyAgent
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export async function proxyFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  // 无代理时直接使用原生 fetch（CloudBase 生产环境）
  if (!dispatcher) {
    return fetch(input, init);
  }

  // 有代理时使用 ProxyAgent（沙箱开发环境）
  return fetch(input, {
    ...init,
    dispatcher,
  } as RequestInit);
}
