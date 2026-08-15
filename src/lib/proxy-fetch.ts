/**
 * 带代理支持的 fetch 封装
 *
 * Node.js 内置 fetch (undici) 不会自动读取 HTTP_PROXY/HTTPS_PROXY 环境变量，
 * 在沙箱等需要代理出网的环境中会导致连接失败。
 * 使用 undici ProxyAgent 手动注入代理。
 */
import { ProxyAgent } from 'undici';

const proxyUrl =
  process.env.HTTPS_PROXY || process.env.HTTP_PROXY ||
  process.env.https_proxy || process.env.http_proxy;

const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

export function proxyFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  return fetch(input, {
    ...init,
    ...(dispatcher ? { dispatcher } : {}),
  } as RequestInit);
}
