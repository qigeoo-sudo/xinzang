/**
 * 龙虾工作台前后端共享类型（字段与 src/lib/content-ops/engine.ts 的序列化输出逐一对齐）。
 * 仅元数据：路径、哈希、计数、状态、时间、责任方；不承载 Prompt/知识卡/访谈正文。
 */

export type VpnLevel = 'red' | 'green' | 'amber' | 'gray';

export interface EndpointStatus {
  key: string;
  label: string;
  reachable: boolean;
  required: boolean;
}

export interface VpnHint {
  level: VpnLevel;
  title: string;
  endpoints: EndpointStatus[];
}

export interface VpnSnapshot {
  checkedAt: string;
  endpoints: Record<string, { reachable: boolean; latencyMs?: number; error?: string }>;
}

export interface RunListItem {
  id: string;
  mentorDir: string;
  isPilot: boolean;
  status: string;
  currentOwner: string;
  feishuChatName: string | null;
  createdAt: string;
  startedAt: string | null;
  runner: { name: string; status: string; lastSeenAt: string | null } | null;
}

export interface RunnerInfo {
  id: string;
  name: string;
  version: string;
  online: boolean;
  lastSeenAt: string | null;
  contentRoot: string | null;
  probes: VpnSnapshot | null;
  dirs: Array<{ name: string; status: string }>;
}

export interface RunStep {
  id: string;
  code: string;
  round: number;
  title: string;
  actor: string;
  status: string;
  commandStatus: string;
  failureReason: string | null;
  evidence: unknown;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface RunArtifact {
  id: string;
  kind: string;
  displayPath: string;
  sha256: string;
  bytes: string;
  version: string | null;
  sourceType: string;
  validationStatus: string;
  approvalStatus: string;
  immutable: boolean;
  createdAt: string;
}

export interface RunEvent {
  id: string;
  agent: string;
  type: string;
  payload: unknown;
  createdAt: string;
}

export interface RunApproval {
  id: string;
  gate: string;
  stepCode: string | null;
  buttonName: string;
  status: string;
  actorId: string;
  createdAt: string;
}

export interface RunDetail {
  id: string;
  mentorDir: string;
  isPilot: boolean;
  status: string;
  currentOwner: string;
  feishuChatName: string | null;
  feishuChatId: string | null;
  lockedMainSha: string | null;
  taskContract: unknown;
  contentRoot: string | null;
  runner: {
    id: string;
    name: string;
    version: string;
    online: boolean;
    lastSeenAt: string | null;
  } | null;
  vpn: { hint: VpnHint; raw: VpnSnapshot | null };
  steps: RunStep[];
  artifacts: RunArtifact[];
  events: RunEvent[];
  approvals: RunApproval[];
  createdAt: string;
}
