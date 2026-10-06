/**
 * 龙虾工作台展示层中文标签（P1 覆盖 S0-S7 会出现的状态；未知值回退显示原码）。
 */

export const RUN_STATUS_LABELS: Record<string, string> = {
  waiting_runner: '等待 Runner 接上',
  waiting_round1_submission: '等待第一轮材料',
  round1_material_received: '第一轮材料已收到',
  round1_archiving: '归档中',
  round1_archived: '第一轮已归档',
  vpn_check_failed: 'VPN 探测未过',
  claude_manual_step: 'Claude 人工提交中',
  claude_output_archived: 'Claude 产物已归档',
  codex_round1_assembly: 'Codex Assembly 执行中',
  round1_docs_qc: '第一轮阅览文件比对中',
  round1_docs_qc_failed: '第一轮比对未过',
  // 干预态/通用
  waiting_human_input: '等待人工处理',
  failed: '失败（可重试）',
  interrupted_resumable: '已停在检查点',
  cancelled: '已终止',
  completed: '已完成',
};

export const OWNER_LABELS: Record<string, string> = {
  human: '人工',
  runner: 'Runner',
  codex: 'Codex',
  claude: 'Claude',
  trae: 'Trae',
  control_plane: '控制平面',
};

export const STEP_STATUS_LABELS: Record<string, string> = {
  pending: '待开始',
  running: '进行中',
  done: '已完成',
  failed: '失败',
  blocked: '阻塞',
  waiting_human: '待人工',
  skipped: '跳过',
};

export const COMMAND_STATUS_LABELS: Record<string, string> = {
  none: '无指令',
  queued: '排队中',
  dispatched: '已下发',
  done: '已回报',
  failed: '回报失败',
};

export const AGENT_LABELS: Record<string, string> = {
  human: '人工',
  runner: 'Runner',
  codex: 'Codex',
  claude: 'Claude',
  trae: 'Trae',
  control_plane: '控制平面',
  feishu: '飞书',
};

export const ARTIFACT_KIND_LABELS: Record<string, string> = {
  round1_source: '第一轮原始材料',
  claude_output: 'Claude 产物',
  codex_assembly: 'Codex Assembly',
  start_here: '00_START_HERE 索引',
  other: '其他',
};

export function labelOf(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return '—';
  return map[key] ?? key;
}

export function timeAgo(iso: string | null, nowMs: number = Date.now()): string {
  if (!iso) return '从未';
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 10) return '刚刚';
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
