/**
 * VPN 自动 reconcile（仅 Windows Local Runner）。
 *
 * 控制平面在每次心跳响应里按「当前步骤」下发 desiredVpn：
 *   on  = S4-S6 / S11 / S14-S16 / S21-S22（境外端点）
 *   off = 其余步骤（飞书直连 / DeepSeek 国内 API / 本地操作），Run 全部完成也是 off
 *   null = Runner 未绑定 Run，不主动改动
 *
 * Runner 用本地心跳探测判断 VPN 三态：
 *   on      = google 指示点通（国内直连无法稳定访问 google，通则 VPN 在）
 *   off     = google 不通且百度通（确认已回直连）
 *   unknown = 两个都不通（隧道抖动 / kill switch / DNS 故障），不可信任
 *
 * 注意：Node 在 Windows 以 detached:true 直接 spawn powershell.exe 会因子进程
 * 没有控制台而立即退出、脚本不执行（实测）。因此统一经 scripts/run-hidden.vbs
 * （wscript GUI 子系统）中转，隐藏窗口、独立进程，Runner 退出也不受影响。
 * 同方向切换有冷却防抖；方向翻转（on↔off，即步骤边界）不受冷却限制，立即执行。
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ON_SCRIPT = path.join(REPO_ROOT, 'scripts', 'vpn-on.ps1');
const OFF_SCRIPT = path.join(REPO_ROOT, 'scripts', 'vpn-off.ps1');
const LAUNCHER_VBS = path.join(REPO_ROOT, 'scripts', 'run-hidden.vbs');

/** 同方向切换冷却：vpn-on 脚本自身重试窗口最长约 3 分钟，期间不重复触发 */
const SAME_DIRECTION_COOLDOWN_MS = 180_000;
/** spawn 启动后短暂占位，避免进程刚起、探测尚未翻转的同一 tick 内被重复判定 */
const INFLIGHT_HOLD_MS = 5_000;

let inFlight = false;
let lastSwitchAt = 0;
let lastSwitchKind = null; // 'on' | 'off'

export function isVpnOn(probes) {
  return probes?.endpoints?.vpnIndicator?.reachable === true;
}

/**
 * 三态判定，见模块顶部说明。
 * @returns {'on'|'off'|'unknown'}
 */
export function detectVpnState(probes) {
  const ep = probes?.endpoints ?? {};
  const googleReachable = ep.vpnIndicator?.reachable === true;
  const cnReachable = ep.cnBase?.reachable === true;
  if (googleReachable) return 'on';
  if (cnReachable) return 'off';
  return 'unknown';
}

/**
 * @param {'on'|'off'|null|undefined} desired 心跳下发的期望状态
 * @param {object} probes 本次心跳本地端点探测结果
 * @param {(level:string,msg:string)=>void} log
 */
export function reconcileVpn(desired, probes, log) {
  if (process.platform !== 'win32') return;
  if (desired !== 'on' && desired !== 'off') return; // null：不干预
  if (inFlight) return;

  const state = detectVpnState(probes);
  if (state === desired) return; // 已确认符合期望

  // 同方向冷却（VPN 正在连接/脚本重试中，不重复执行）；方向翻转立即放行。
  // unknown 也按期望方向动作：on 时尝试拉起隧道，off 时杀 GUI（幂等无害，
  // 还能消掉 hide.me 自身重连造成的抖动），避免黑洞状态下永远不收敛。
  const sinceLast = Date.now() - lastSwitchAt;
  if (lastSwitchKind === desired && sinceLast < SAME_DIRECTION_COOLDOWN_MS) return;

  const script = desired === 'on' ? ON_SCRIPT : OFF_SCRIPT;
  if (!existsSync(LAUNCHER_VBS) || !existsSync(script)) {
    log('WARN', `VPN 自动切换跳过：脚本不存在（${existsSync(LAUNCHER_VBS) ? script : LAUNCHER_VBS}）`);
    return;
  }

  inFlight = true;
  lastSwitchAt = Date.now();
  lastSwitchKind = desired;
  log('INFO', `VPN 自动切换 → ${desired}（当前探测=${state}），经 run-hidden.vbs 启动 ${path.basename(script)}`);

  try {
    const child = spawn(
      'wscript.exe',
      [LAUNCHER_VBS, script],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.unref();
    child.on('error', (e) => log('ERROR', `VPN 自动切换启动失败（${desired}）：${e.message}`));
  } catch (e) {
    log('ERROR', `VPN 自动切换异常（${desired}）：${e?.message ?? e}`);
  }

  // 只做短暂占位；后续由「探测 + 同方向冷却」共同收敛，不等待脚本跑完
  setTimeout(() => { inFlight = false; }, INFLIGHT_HOLD_MS).unref?.();
}
