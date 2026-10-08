/**
 * 审核清单回复：候选筛选与 `_回复` 规范命名的纯函数（S10 第一轮 / S16 第二轮共用）。
 * 规范依据：D:\database\AGENTS.md §10 / §14 + 2026-10-07 用户定的四条筛选口径：
 * 1. 不要任何音频（m4a/mp3/…）——回复只认文档文件；
 * 2. 必须排除另一轮：扫第一轮时排除文件名含「第二轮」的，反之亦然；
 * 3. 文件名必须完整命中本轮关键词（第一轮/第二轮审核清单），命中的全部列出；
 * 4. 上传人为我方（陆秉文；今后机器人 sender_type=app 同理）一律排除——
 *    群里由我方发出的阅览文件/测试文件不是导师回复。
 * 归档=下载原文件到导师目录一级位置，扩展名前加 `_回复`（已含「回复」不重复追加）；
 * 保留原始文件名、上传人、飞书消息标识、上传时间、字节数和 SHA-256，不得改写导师回复。
 */

export const REPLY_KEYWORDS = {
  1: '第一轮审核清单',
  2: '第二轮审核清单',
} as const;

export type ReplyRound = 1 | 2;

/** 我方发送者名字（当前操作者；今后 S9/S12 由机器人发，机器人走 sender_type 排除） */
export const SELF_SENDER_NAMES = ['陆秉文'];

/** 音频扩展：回复只认文档，音频一律不进候选（访谈录音属于 S1/S13 原始材料） */
const AUDIO_EXTS = new Set([
  '.m4a', '.mp3', '.wav', '.aac', '.flac', '.ogg', '.opus', '.amr', '.wma', '.aiff', '.aif',
]);

/** 飞书 sender_type：user=真人；app=机器人/应用 */
function isSelfSender(m: ReplyMessageMeta): boolean {
  if (m.senderType === 'app' || m.senderType === 'bot') return true;
  const name = m.senderName ?? '';
  return SELF_SENDER_NAMES.some((n) => name.includes(n));
}

/** Runner feishu_list_messages 元数据里与回复识别相关的字段（正文不回传） */
export interface ReplyMessageMeta {
  messageId: string;
  msgType: string;
  createTime: number | null;
  senderName: string | null;
  senderType: string | null;
  deleted: boolean;
  fileName?: string | null;
  fileKey?: string | null;
}

export interface ReplyCandidate {
  messageId: string;
  fileKey: string | null;
  fileName: string;
  senderName: string | null;
  createTime: number | null;
  /** 文件名已含「回复」，落盘时不再追加 `_回复` */
  alreadyNamedReply: boolean;
}

export interface ReplyScanView {
  /** 本轮关键词全部命中的文档文件（全部列出，按上传时间新→旧） */
  candidates: ReplyCandidate[];
  /** 纯文本消息条数（规范只认文件回复；文字回复提示人工保存后手工登记） */
  textMessageCount: number;
  /** 已删除消息条数 */
  deletedCount: number;
  /** 跳过明细（每条文件消息互斥归入一类，供人工核对过滤口径） */
  skipped: {
    selfSender: number;
    audio: number;
    otherRound: number;
    keywordMiss: number;
    noFileKey: number;
    otherType: number;
  };
}

/**
 * 从群消息元数据筛回复候选。
 * 判定顺序（互斥计数）：删除 → 文本 → 我方发送 → 音频 → 另一轮 → 关键词缺失 → 无文件标识 → 候选。
 */
export function filterReplyCandidates(messages: ReplyMessageMeta[], round: ReplyRound = 1): ReplyScanView {
  const keyword = REPLY_KEYWORDS[round];
  const otherRoundMarker = round === 1 ? '第二轮' : '第一轮';
  const candidates: ReplyCandidate[] = [];
  const skipped = { selfSender: 0, audio: 0, otherRound: 0, keywordMiss: 0, noFileKey: 0, otherType: 0 };
  let textMessageCount = 0;
  let deletedCount = 0;
  for (const m of messages) {
    if (m.deleted) {
      deletedCount += 1;
      continue;
    }
    if (m.msgType === 'text') {
      textMessageCount += 1;
      continue;
    }
    if (m.msgType !== 'file') {
      skipped.otherType += 1;
      continue;
    }
    const fileName = m.fileName ?? '';
    if (isSelfSender(m)) {
      skipped.selfSender += 1;
      continue;
    }
    const lower = fileName.toLowerCase();
    const dot = lower.lastIndexOf('.');
    const ext = dot >= 0 ? lower.slice(dot) : '';
    if (ext && AUDIO_EXTS.has(ext)) {
      skipped.audio += 1;
      continue;
    }
    // 同时含两轮关键词时按另一轮排除（如第二轮扫到「第二轮…第一轮审核清单」命名串扰件）
    if (fileName.includes(otherRoundMarker)) {
      skipped.otherRound += 1;
      continue;
    }
    if (!fileName.includes(keyword)) {
      skipped.keywordMiss += 1;
      continue;
    }
    if (!m.fileKey) {
      skipped.noFileKey += 1;
      continue;
    }
    candidates.push({
      messageId: m.messageId,
      fileKey: m.fileKey,
      fileName,
      senderName: m.senderName,
      createTime: m.createTime,
      alreadyNamedReply: fileName.includes('回复'),
    });
  }
  candidates.sort((a, b) => (b.createTime ?? 0) - (a.createTime ?? 0));
  return { candidates, textMessageCount, deletedCount, skipped };
}

/**
 * 归档命名：扩展名前加 `_回复`；已含「回复」原样返回；无扩展名（或隐藏文件 .xxx）直接尾部追加。
 * 例：`Ying_Wang_第一轮审核清单_v0.1.md` → `Ying_Wang_第一轮审核清单_v0.1_回复.md`
 */
export function buildReplyFileName(originalName: string): string {
  const name = originalName.trim();
  if (!name) throw new Error('文件名为空，无法生成归档命名');
  if (name.includes('回复')) return name;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return `${name}_回复`;
  return `${name.slice(0, dot)}_回复${name.slice(dot)}`;
}
