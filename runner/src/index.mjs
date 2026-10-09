#!/usr/bin/env node
/**
 * 导师访谈龙虾 Windows Local Runner —— 入口
 *
 * 首次注册（在 runner/ 目录下）：
 *   node src/index.mjs --register --server http://localhost:3000 --token <管理员颁发的注册令牌>
 *   （生产把 server 换成 https://content.aihr.top）
 * 日常启动（按需手动启动，Q4）：
 *   node src/index.mjs
 *
 * 行为：每 30s 上报一次心跳（含端点探测），拉取并串行执行指令，结果幂等回报。
 * 安全：不打印令牌与指令载荷正文；文件操作限定 CONTENT_ROOT；codex 自动投递未验证前恒为 needs_validation。
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, readdirSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heartbeat as apiHeartbeat, register as apiRegister, reportResult } from './api.mjs';
import { handleCommand } from './commands.mjs';
import {
  RUNNER_VERSION,
  loadConfig,
  loadProcessed,
  newMachineKey,
  saveConfig,
  saveProcessed,
  STATE_DIR,
} from './config.mjs';
import { DEFAULT_CONTENT_ROOT, listMentorDirs } from './filer.mjs';
import { probeAll } from './probe.mjs';

// 读取仓库根目录 .env.local（存在才生效），供本地手动启动时带上自建应用等配置；已设置的环境变量不覆盖
function loadDotEnvLocal() {
  try {
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    for (const line of readFileSync(join(repoRoot, '.env.local'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
    }
  } catch {
    // .env.local 不存在则跳过（生产用容器环境变量）
  }
}

// 飞书身份切换：配置了自建应用（FEISHU_APP_ID/SECRET）则强制走应用（机器人）身份。
// 用户身份令牌（Trae 注入）受商店应用无对外共享能力限制，无法在外部群发消息（230027）。
// lark-cli 在 bot 模式不会自己用 app_id/secret 换 token（dry-run 不验证，真实调用报
// "no access token available for bot"）。需要主动调 token endpoint 换 tenant_access_token
// 注入 LARKSUITE_CLI_TENANT_ACCESS_TOKEN，lark-cli 才能真实调 API。
// token 7200s 过期，每 100 分钟刷新一次。
let larkTokenTimer = null;
async function refreshLarkTenantToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) return false;
  try {
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const data = await res.json();
    if (data.code !== 0 || !data.tenant_access_token) {
      log('ERROR', `刷新飞书 tenant_access_token 失败: ${JSON.stringify(data).slice(0, 300)}`);
      return false;
    }
    process.env.LARKSUITE_CLI_TENANT_ACCESS_TOKEN = data.tenant_access_token;
    log('OK', `刷新飞书 tenant_access_token 成功（expire=${data.expire}s）`);
    return true;
  } catch (e) {
    log('ERROR', `刷新飞书 tenant_access_token 异常: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
function applyLarkIdentity() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) return null;
  process.env.LARKSUITE_CLI_APP_ID = process.env.FEISHU_APP_ID;
  process.env.LARKSUITE_CLI_APP_SECRET = process.env.FEISHU_APP_SECRET;
  delete process.env.LARKSUITE_CLI_USER_ACCESS_TOKEN;
  // 同步触发首次换 token（async，不阻塞 main 启动；token 没就绪时 lark-cli 调用会失败，下次心跳周期能恢复）
  void refreshLarkTenantToken();
  // 每 100 分钟刷新一次（7200s 过期，留 200s 缓冲）
  if (larkTokenTimer) clearInterval(larkTokenTimer);
  larkTokenTimer = setInterval(() => { void refreshLarkTenantToken(); }, 100 * 60 * 1000);
  return process.env.FEISHU_APP_ID;
}

// ── 方案A：PID 文件守卫——启动时杀旧进程，退出时清理 PID 文件 ──
const PID_PATH = join(STATE_DIR, 'runner.pid');
function killStaleRunner() {
  if (!existsSync(PID_PATH)) return;
  let oldPid;
  try {
    oldPid = parseInt(readFileSync(PID_PATH, 'utf8').trim(), 10);
  } catch {
    return; // PID 文件损坏，忽略
  }
  if (!oldPid || !Number.isInteger(oldPid) || oldPid <= 0) return;
  try {
    process.kill(oldPid, 0); // 探测旧进程是否存活（signal 0 = no-op）
  } catch {
    return; // 旧进程已退出，正常
  }
  log('WARN', `发现旧 Runner 进程 (PID ${oldPid})，正在终止…`);
  try { process.kill(oldPid, 'SIGTERM'); } catch { /* ignore */ }
  // 等 2 秒让旧进程优雅退出
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try { process.kill(oldPid, 0); } catch { break; }
  }
  try {
    process.kill(oldPid, 0); // 还活着？
    process.kill(oldPid, 'SIGKILL'); // 强制杀
    log('WARN', `旧 Runner 进程 (PID ${oldPid}) 已强制终止`);
  } catch {
    log('OK', `旧 Runner 进程 (PID ${oldPid}) 已退出`);
  }
}
function writePidFile() {
  try {
    if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(PID_PATH, String(process.pid), 'utf8');
  } catch { /* 非致命 */ }
}
function cleanupPidFile() {
  try { unlinkSync(PID_PATH); } catch { /* 非致命 */ }
}

// ── 方案B：代码版本探测——心跳里带 codeMtime，服务端/UI 据此提示"版本过旧" ──
const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), 'src');
function computeCodeMtime() {
  let maxMs = 0;
  try {
    for (const f of readdirSync(SRC_DIR)) {
      if (f.endsWith('.mjs')) {
        const s = statSync(join(SRC_DIR, f));
        if (s.mtimeMs > maxMs) maxMs = s.mtimeMs;
      }
    }
  } catch { /* ignore */ }
  return maxMs;
}
const STARTUP_CODE_MTIME = computeCodeMtime();
function isCodeStale() {
  return computeCodeMtime() > STARTUP_CODE_MTIME + 1000; // 1s 容差
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function ts() {
  return new Date().toISOString();
}
function log(level, msg) {
  // eslint-disable-next-line no-console
  console.log(`[${ts()}] ${level.padEnd(5)} ${msg}`);
}

function digestResult(result) {
  // 幂等记录里不存结果正文，只留哈希，防本地记录膨胀也防元数据泄露
  return createHash('sha256').update(JSON.stringify(result)).digest('hex').slice(0, 16);
}

async function registerFlow(args) {
  const baseUrl = args.server || process.env.CONTENT_OPS_SERVER;
  const registrationToken = args.token || process.env.CONTENT_OPS_REGISTRATION_TOKEN;
  const contentRoot = args['content-root'] || process.env.CONTENT_ROOT || DEFAULT_CONTENT_ROOT;
  if (!baseUrl) throw new Error('缺少 --server <控制平面地址>');
  if (!registrationToken) throw new Error('缺少 --token <管理员颁发的注册令牌>');

  const machineKey = newMachineKey();
  const name = args.name || `windows-${machineKey.slice(7, 13)}`;
  log('INFO', `正在向控制平面注册 Runner：${baseUrl}`);
  const res = await apiRegister(baseUrl, registrationToken, machineKey, name, RUNNER_VERSION);
  if (!res.runnerId || !res.runnerToken) throw new Error('注册响应缺少 runnerId/runnerToken');
  await saveConfig({
    baseUrl,
    machineKey,
    runnerId: res.runnerId,
    runnerToken: res.runnerToken,
    runnerName: name,
    contentRoot,
    heartbeatMs: 30_000,
  });
  log('OK', `注册成功，配置已保存；CONTENT_ROOT=${contentRoot}`);
}

async function tick(cfg, processed, busy) {
  if (busy.current) return;
  busy.current = true;
  let activeCommands = 0;
  try {
    const [probes, dirs] = await Promise.all([
      probeAll(),
      listMentorDirs(cfg.contentRoot).catch((err) => ({ error: err.message })),
    ]);
    const reachSummary = Object.entries(probes.endpoints)
      .map(([k, v]) => `${k}${v.reachable ? '●' : '○'}`)
      .join(' ');
    log('INFO', `心跳探测 ${reachSummary}`);

    const hb = await apiHeartbeat(
      cfg.baseUrl,
      cfg.runnerToken,
      cfg.runnerId,
      {
        runnerId: cfg.runnerId,
        machineKey: cfg.machineKey,
        version: RUNNER_VERSION,
        name: cfg.runnerName,
        contentRoot: cfg.contentRoot,
        probes,
        dirs: Array.isArray(dirs) ? dirs : null,
        activeCommands,
        codeMtime: STARTUP_CODE_MTIME,
        stale: isCodeStale(),
      },
    );

    const commands = Array.isArray(hb.commands) ? hb.commands : [];
    for (const command of commands) {
      const { stepId, idempotencyKey, type } = command;
      if (!idempotencyKey) {
        log('WARN', `指令缺少 idempotencyKey（step=${stepId}），拒绝执行`);
        continue;
      }
      // 幂等去重带指令类型维度：同一幂等键的链式指令（如 S7 scan→hash 复用 :S7:0）类型不同，应放行
      if (processed[idempotencyKey] && processed[idempotencyKey].type === type) {
        log('INFO', `跳过重复指令 type=${type} step=${stepId} key=${idempotencyKey}（已处理）`);
        continue;
      }
      activeCommands += 1;
      log('INFO', `执行指令 type=${type} step=${stepId} key=${idempotencyKey}`);
      const startedAt = Date.now();
      let result;
      try {
        result = await handleCommand(command, cfg.contentRoot);
      } catch (execErr) {
        // 仅本地执行失败才回报 failed；失败不写 processed，允许控制平面重新入队
        const message = execErr instanceof Error ? execErr.message : String(execErr);
        await reportResult(cfg.baseUrl, cfg.runnerToken, cfg.runnerId, {
          stepId,
          idempotencyKey,
          status: 'failed',
          error: message,
        }).catch((reportErr) => {
          log('ERROR', `失败结果回报也失败 type=${type}: ${reportErr.message}`);
        });
        log('ERROR', `指令执行失败（Runner 侧异常）type=${type} key=${idempotencyKey}: ${message}`);
        activeCommands -= 1;
        continue;
      }

      // 区分业务结果：result.ok === false 视为 Codex 业务失败（含超时、产物验证失败等）
      const isBusinessFailure = result && typeof result === 'object' && result.ok === false;
      const reason = result?.reason || result?.error || null;
      const isTimeout = reason && /超时/.test(String(reason));

      if (isBusinessFailure) {
        const category = isTimeout ? 'Codex 超时' : 'Codex 业务失败';
        const detail = reason ? `：${String(reason).slice(0, 300)}` : '';
        await reportResult(cfg.baseUrl, cfg.runnerToken, cfg.runnerId, {
          stepId,
          idempotencyKey,
          status: 'failed',
          error: `${category}${detail}`,
          result,
        }).catch((reportErr) => {
          log('ERROR', `失败结果回报也失败 type=${type}: ${reportErr.message}`);
        });
        log('ERROR', `${category} type=${type} key=${idempotencyKey}${detail}`);
        activeCommands -= 1;
        continue;
      }

      // Codex 任务成功，回报 done
      try {
        await reportResult(cfg.baseUrl, cfg.runnerToken, cfg.runnerId, {
          stepId,
          idempotencyKey,
          status: 'done',
          result,
        });
        processed[idempotencyKey] = {
          type,
          status: 'done',
          at: new Date().toISOString(),
          ms: Date.now() - startedAt,
          resultDigest: digestResult(result),
        };
        await saveProcessed(processed);
        log('OK', `Codex 任务成功 + Runner 回报完成 type=${type} key=${idempotencyKey}（${Date.now() - startedAt}ms）`);
      } catch (reportErr) {
        // 指令在本机确实执行成功，仅回报被服务端拒绝：不反向标记 failed、不写 processed
        log('ERROR', `指令已执行但结果回报被拒 type=${type} key=${idempotencyKey}: ${reportErr.message}`);
      } finally {
        activeCommands -= 1;
      }
    }
  } catch (err) {
    log('ERROR', `心跳周期失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    busy.current = false;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  loadDotEnvLocal();
  // 方案A：启动前杀旧进程，写 PID 文件。必须在 loadConfig 之前执行，
  // 防止旧进程仍持有配置/锁导致行为错乱。
  killStaleRunner();
  writePidFile();
  const larkAppId = applyLarkIdentity();

  if (args.register) {
    await registerFlow(args);
    return;
  }

  const cfg = await loadConfig();
  if (!cfg || !cfg.runnerToken) {
    log('ERROR', '尚未注册。请先运行：');
    log('ERROR', 'node src/index.mjs --register --server http://localhost:3000 --token <注册令牌>');
    process.exitCode = 1;
    return;
  }

  const processed = await loadProcessed();
  const busy = { current: false };
  log('OK', `Runner 已启动 runnerId=${cfg.runnerId} root=${cfg.contentRoot} 间隔=${cfg.heartbeatMs}ms 飞书身份=${larkAppId ? `自建应用(${larkAppId.slice(0, 6)}…)` : '用户令牌'}`);

  // 立即执行一次，之后按间隔递归调度（避免重入）
  await tick(cfg, processed, busy);
  const timer = setInterval(() => {
    void tick(cfg, processed, busy);
  }, cfg.heartbeatMs);

  const shutdown = () => {
    log('INFO', '收到退出信号，等待当前周期结束…');
    clearInterval(timer);
    const wait = setInterval(() => {
      if (!busy.current) {
        clearInterval(wait);
        cleanupPidFile();
        if (larkTokenTimer) clearInterval(larkTokenTimer);
        log('OK', '已停止');
        process.exit(0);
      }
    }, 300);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log('FATAL', err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});
