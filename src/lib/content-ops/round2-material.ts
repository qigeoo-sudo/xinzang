/**
 * S13 第二轮访谈材料识别（纯函数）。
 *
 * 规则矩阵（2026-10-09 用户定 9 条规则，S13 适用）：
 * 1. 从群第一条开始全量拉取；
 * 2. 只抓导师的文件（排除陆秉文、陈初效、机器人）；
 * 3. 导师文件只抓音频类和文字类（妙记拆出的虚拟文件也参与）；
 * 4. 含「审核清单」→ 弃（回复类文件，归 S10/S16）；
 * 5. 含「第一轮」→ 弃；
 * 6. 含「第二轮」→ 抓；
 * 7. 其余音频/文字 → "不明"候选（列入分组，标注不明，待人工审核）。
 *
 * 策略：按 30 分钟间隔聚类成提交事件；含「第二轮」的无冲突音频事件标记「建议」，
 * "不明"文件同样分组展示但标注 unknown=true 供人工核对。
 */
import type { ReplyMessageMeta } from './reply';
import { SELF_SENDER_NAMES } from './reply';

/** 同一提交事件内相邻消息的最大间隔（经验值，靠歧义提示+人工确认兜底） */
export const MATERIAL_GROUP_GAP_MS = 30 * 60 * 1000;

const AUDIO_EXTS = new Set([
  '.m4a', '.mp3', '.wav', '.aac', '.flac', '.ogg', '.opus', '.amr', '.wma', '.aiff', '.aif',
]);
const DOC_EXTS = new Set(['.md', '.txt', '.doc', '.docx', '.pdf']);

/** 文件名里的补传/重传冲突信号 */
const ROUND_CONFLICT_RE = /(补传|重传|补发)/;

/** 硬性排除：第一轮文件、审核清单类文件一概不进第二轮材料候选 */
const FIRST_ROUND_RE = /第一轮/;
const REVIEW_DOC_RE = /审核清单/;
/** 第二轮关键词：命中为匹配，未命中为"不明"候选 */
const SECOND_ROUND_RE = /第二轮/;

export type MaterialKind = 'audio' | 'transcript' | 'other';

export interface MaterialFile {
  messageId: string;
  fileKey: string | null;
  fileName: string;
  kind: MaterialKind;
  senderName: string | null;
  createTime: number | null;
  msgType: string;
  /** 文件名命中补传/重传等冲突信号 */
  conflictHint: boolean;
  /** 妙记虚拟文件的 minute_token（有此字段时下载走妙记 API 而非消息资源 API） */
  minuteToken?: string | null;
  /** "不明"候选：文件名不含「第二轮」，需人工审核是否为第二轮材料 */
  unknown: boolean;
}

export interface MaterialGroup {
  id: string;
  startAt: number | null;
  endAt: number | null;
  files: MaterialFile[];
  hasAudio: boolean;
  /** 系统建议的第二轮提交事件（含「第二轮」关键词且含音频且无冲突信号的组） */
  suggested: boolean;
}

export interface Round2GroupView {
  groups: MaterialGroup[];
  /** 建议组 id（null=没有可建议的第二轮事件） */
  suggestedGroupId: string | null;
  /** 歧义/异常说明（人工确认前必须能看到） */
  ambiguity: string[];
  skipped: {
    selfSender: number;
    deleted: number;
    text: number;
    otherType: number;
    /** 文件名含「第一轮」，硬性排除 */
    firstRound: number;
    /** 文件名含「审核清单」（回复类文件，归 S10/S16），硬性排除 */
    reviewDoc: number;
  };
}

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function classifyFile(m: ReplyMessageMeta): MaterialKind {
  if (m.msgType === 'audio') return 'audio';
  if (m.msgType !== 'file') return 'other';
  const ext = extOf(m.fileName ?? '');
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (DOC_EXTS.has(ext)) return 'transcript';
  return 'other';
}

function isSelfSender(m: ReplyMessageMeta): boolean {
  if (m.senderType === 'app' || m.senderType === 'bot') return true;
  const name = m.senderName ?? '';
  return SELF_SENDER_NAMES.some((n) => name.includes(n));
}

/**
 * 从群消息元数据聚类第二轮提交事件。
 * @param messages feishu_list_messages 归一化后的消息（可能含妙记虚拟文件）
 */
export function groupRound2Materials(messages: ReplyMessageMeta[]): Round2GroupView {
  const skipped = {
    selfSender: 0,
    deleted: 0,
    text: 0,
    otherType: 0,
    firstRound: 0,
    reviewDoc: 0,
  };
  const files: MaterialFile[] = [];

  for (const m of messages) {
    if (m.deleted) {
      skipped.deleted += 1;
      continue;
    }
    if (m.msgType === 'text') {
      skipped.text += 1;
      continue;
    }
    if (isSelfSender(m)) {
      skipped.selfSender += 1;
      continue;
    }
    if (m.msgType !== 'file' && m.msgType !== 'audio') {
      skipped.otherType += 1;
      continue;
    }
    const rawName = m.fileName ?? '';
    // 硬性排除：审核清单类（回复文件，归 S10/S16）、第一轮文件，一概不进本轮候选
    if (REVIEW_DOC_RE.test(rawName)) {
      skipped.reviewDoc += 1;
      continue;
    }
    if (FIRST_ROUND_RE.test(rawName)) {
      skipped.firstRound += 1;
      continue;
    }
    const kind = classifyFile(m);
    const isUnknown = !SECOND_ROUND_RE.test(rawName);
    files.push({
      messageId: m.messageId,
      fileKey: m.fileKey ?? null,
      minuteToken: m.minuteToken ?? null,
      fileName: m.fileName ?? (m.msgType === 'audio' ? `语音消息_${m.messageId.slice(-8)}` : '(无文件名)'),
      kind,
      senderName: m.senderName,
      createTime: m.createTime,
      msgType: m.msgType,
      conflictHint: ROUND_CONFLICT_RE.test(m.fileName ?? ''),
      unknown: isUnknown,
    });
  }

  // 有时间的按时间聚类；无时间的各自成组（无法判断先后，不允许建议）
  const timed = files.filter((f) => f.createTime !== null).sort((a, b) => (a.createTime ?? 0) - (b.createTime ?? 0));
  const untimed = files.filter((f) => f.createTime === null);

  const groups: MaterialGroup[] = [];
  let current: MaterialFile[] = [];
  let lastTs: number | null = null;
  const pushGroup = (groupFiles: MaterialFile[]) => {
    if (groupFiles.length === 0) return;
    const ts = groupFiles.map((f) => f.createTime).filter((t): t is number => t !== null);
    groups.push({
      id: `g${groups.length}`,
      startAt: ts.length ? Math.min(...ts) : null,
      endAt: ts.length ? Math.max(...ts) : null,
      files: groupFiles,
      hasAudio: groupFiles.some((f) => f.kind === 'audio'),
      suggested: false,
    });
  };
  for (const f of timed) {
    if (lastTs !== null && (f.createTime as number) - lastTs > MATERIAL_GROUP_GAP_MS) {
      pushGroup(current);
      current = [];
    }
    current.push(f);
    lastTs = f.createTime;
  }
  pushGroup(current);
  for (const f of untimed) pushGroup([f]);

  // 建议：含「第二轮」关键词（非 unknown）的音频事件且组内无冲突文件名信号
  // （"不明"文件不影响建议——它们仅标注待人工审核，不阻止同组匹配文件的推荐）
  const suggested =
    groups.find((g) => g.hasAudio && g.files.some((f) => !f.unknown) && !g.files.some((f) => f.conflictHint)) ?? null;
  if (suggested) suggested.suggested = true;

  const ambiguity: string[] = [];
  const audioGroups = groups.filter((g) => g.hasAudio);
  if (audioGroups.length === 0) {
    ambiguity.push('未发现含音频的提交事件：导师可能尚未提交，或录音以非文件形式发送，请核对后手工勾选/登记。');
  } else if (audioGroups.length >= 2) {
    ambiguity.push(`出现 ${audioGroups.length} 个含音频的提交事件，存在补传/分段可能，已默认勾选最早的无冲突事件，请逐组核对。`);
  }
  if (audioGroups.some((g) => g.files.some((f) => f.conflictHint))) {
    ambiguity.push('有文件名带「补传/重传/补发」信号，可能是分段或补录，请按内容确认后再归档。');
  }
  const unknownCount = files.filter((f) => f.unknown).length;
  if (unknownCount > 0) {
    ambiguity.push(`${unknownCount} 个文件未含「第二轮」关键词，标注为"不明"候选，请人工确认是否为第二轮材料。`);
  }
  if (untimed.length > 0) {
    ambiguity.push(`${untimed.length} 个文件缺少上传时间，无法参与事件分组，已单独列出，请人工确认归属。`);
  }

  return { groups, suggestedGroupId: suggested?.id ?? null, ambiguity, skipped };
}

/** 第二轮归档子目录（D 盘实测布局，2026-10-08 核对 ying wang / ying wang pilot） */
export function round2DestSlot(kind: MaterialKind): 'audio' | 'word' {
  return kind === 'audio' ? 'audio' : 'word';
}

export function round2DestDir(contentRoot: string, mentorDir: string, slot: 'audio' | 'word'): string {
  // mentors/<dir>/<dir> audio/<dir> 第二轮 interview audio
  const leaf = slot === 'audio' ? `${mentorDir} 第二轮 interview audio` : `${mentorDir} 第二轮 interview word`;
  return `${contentRoot}\\mentors\\${mentorDir}\\${mentorDir} ${slot}\\${leaf}`;
}
