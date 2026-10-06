/**
 * VPN 提示条策略（纯函数）—— 设计文档 §6.0
 *
 * 提示跟随「下一步要做什么」，不是简单显示 VPN 开关：
 * - red   下一步需要 Claude/Codex/GitHub，所需端点探测不通 → 请开启 VPN
 * - green 所需条件满足，收成一行不打扰
 * - amber 下一步走飞书直连，却探测到 VPN 开启 → 建议关闭（仅提示）
 * - gray  Runner 离线 / 探测数据过期 → 明确「无法探测」，不用旧数据冒充
 */

import type { StepDef } from './state-machine';

export type EndpointKey = 'feishu' | 'claude' | 'codex' | 'github' | 'vpnIndicator' | 'cnBase';

export interface EndpointProbe {
  reachable: boolean;
  /** 毫秒耗时，仅展示用 */
  latencyMs?: number;
}

export interface VpnSnapshot {
  checkedAt: string; // ISO 时间
  endpoints: Record<EndpointKey, EndpointProbe>;
}

export type VpnHintLevel = 'red' | 'green' | 'amber' | 'gray';

export interface EndpointStatus {
  key: EndpointKey;
  label: string;
  reachable: boolean;
  required: boolean;
}

export interface VpnHint {
  level: VpnHintLevel;
  title: string;
  endpoints: EndpointStatus[];
}

export const ENDPOINT_LABELS: Record<EndpointKey, string> = {
  feishu: '飞书',
  claude: 'Claude',
  codex: 'Codex',
  github: 'GitHub',
  vpnIndicator: 'VPN 指示点',
  cnBase: '国内参照点',
};

/** 心跳间隔 30s；超过 3 个间隔无新探测视为过期 */
export const PROBE_FRESH_MS = 90_000;

/** 各步骤需要 VPN 访问的端点（与 state-machine STEP_DEFS 口径一致） */
function requiredEndpoints(step: StepDef): EndpointKey[] {
  if (!step.needsVpn) return step.isFeishu ? ['feishu'] : [];
  switch (step.code) {
    case 'S4':
      return ['claude'];
    case 'S6':
    case 'S11':
    case 'S14':
    case 'S16':
      return ['codex'];
    case 'S21':
    case 'S22':
      return ['github'];
    default:
      return ['codex'];
  }
}

export function evaluateVpnHint(
  step: StepDef | null,
  runnerOnline: boolean,
  snapshot: VpnSnapshot | null,
  nowMs: number = Date.now(),
): VpnHint {
  const statuses = (keys: EndpointKey[], required: (k: EndpointKey) => boolean): EndpointStatus[] =>
    keys.map((key) => ({
      key,
      label: ENDPOINT_LABELS[key],
      reachable: snapshot?.endpoints[key]?.reachable ?? false,
      required: required(key),
    }));

  // gray：Runner 离线
  if (!runnerOnline) {
    return {
      level: 'gray',
      title: '无法探测：Runner 未启动，请先在 Windows 启动 Local Runner',
      endpoints: statuses(['feishu', 'claude', 'codex', 'github'], () => false),
    };
  }

  // gray：探测数据缺失或过期（不拿旧数据冒充）
  const fresh =
    snapshot !== null && nowMs - new Date(snapshot.checkedAt).getTime() <= PROBE_FRESH_MS;
  if (!snapshot || !fresh) {
    return {
      level: 'gray',
      title: '无法探测：等待 Runner 上报最新端点探测结果',
      endpoints: statuses(['feishu', 'claude', 'codex', 'github'], () => false),
    };
  }

  const vpnOn = snapshot.endpoints.vpnIndicator.reachable;

  // gray：国内参照点也不通 → 本机可能断网（比「请开 VPN」更准确，优先判定）
  if (!snapshot.endpoints.cnBase.reachable) {
    return {
      level: 'gray',
      title: '无法探测：国内参照点不可达，本机网络可能未连接，请检查网络后等待下一次心跳',
      endpoints: statuses(['cnBase', 'feishu', 'claude', 'codex', 'github'], () => false),
    };
  }

  // 没有下一步（终态 / 无活动步骤）
  if (!step) {
    return {
      level: 'green',
      title: 'Runner 在线，当前没有需要网络的待办步骤',
      endpoints: statuses(['feishu', 'claude', 'codex', 'github'], () => false),
    };
  }

  const required = requiredEndpoints(step);

  // red：下一步需要 VPN 端点，任一不通
  const blocked = required.filter((k) => !snapshot.endpoints[k].reachable);
  if (required.length > 0 && blocked.length > 0) {
    const names = blocked.map((k) => ENDPOINT_LABELS[k]).join('、');
    return {
      level: 'red',
      title: `下一步 ${step.code} · ${step.title} —— 需要 VPN，当前探测：${names} 不可达，请开启 VPN`,
      endpoints: statuses(['feishu', 'claude', 'codex', 'github'], (k) => required.includes(k)),
    };
  }

  // amber：下一步走飞书直连，VPN 却开着（仅提示，不强制确认）
  if (step.isFeishu && vpnOn) {
    return {
      level: 'amber',
      title: `下一步 ${step.code} · ${step.title} —— 飞书收发建议直连，检测到 VPN 开启，建议关闭`,
      endpoints: statuses(['feishu', 'claude', 'codex', 'github'], (k) => k === 'feishu'),
    };
  }

  // green
  if (required.length > 0) {
    return {
      level: 'green',
      title: `VPN 已开启且可用 —— ${ENDPOINT_LABELS[required[0]]} 等所需端点均通，可以继续 ${step.code}`,
      endpoints: statuses(['feishu', 'claude', 'codex', 'github'], (k) => required.includes(k)),
    };
  }
  return {
    level: 'green',
    title: `Runner 在线，网络环境满足下一步 ${step.code}（${step.isFeishu ? '飞书直连' : '本地操作'}）`,
    endpoints: statuses(['feishu', 'claude', 'codex', 'github'], (k) =>
      step.isFeishu ? k === 'feishu' : false,
    ),
  };
}
