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
import { readFileSync } from 'node:fs';
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
function applyLarkIdentity() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) return null;
  process.env.LARKSUITE_CLI_APP_ID = process.env.FEISHU_APP_ID;
  process.env.LARKSUITE_CLI_APP_SECRET = process.env.FEISHU_APP_SECRET;
  delete process.env.LARKSUITE_CLI_USER_ACCESS_TOKEN;
  return process.env.FEISHU_APP_ID;
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
        log('ERROR', `指令执行失败 type=${type} key=${idempotencyKey}: ${message}`);
        activeCommands -= 1;
        continue;
      }
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
        log('OK', `指令完成 type=${type} key=${idempotencyKey}（${Date.now() - startedAt}ms）`);
      } catch (reportErr) {
        // 指令在本机确实执行成功，仅回报被服务端拒绝：不反向标记 failed、不写 processed，
        // 留待人工在工作台重试/重新发起，避免用失败信号污染已成功的产物
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
