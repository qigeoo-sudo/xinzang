/**
 * S13 第二轮访谈材料识别（纯函数）。
 *
 * 规范依据 D:\database\AGENTS.md §12：
 * 1. 导师在群内上传的第二个「含音频的访谈提交事件」为第二轮，第一个为第一轮；
 *    一个事件可同时含音频、文字稿和附件——这里按时间相邻把多条消息聚成事件。
 * 2. 顺序规则不能机械覆盖证据：补传/重传/多片段/轮次标注冲突必须进人工确认。
 * 3. 第二轮音频与文字稿分别落入 `<导师> audio/<导师> 第二轮 interview audio`、
 *    `<导师> word/<导师> 第二轮 interview word`。
 *
 * 策略：时间窗取 S12 大纲发送时刻（第一轮必然发生在它之前），窗内按 30 分钟间隔
 * 聚类成提交事件；窗内第一个含音频且文件名无补传/重传信号的事件标记「建议第二轮」，
 * 其余一律由人工勾选确认。任何歧义只提示不阻断（人工可以勾选任意文件归档）。
 *
 * 三条硬性排除（2026-10-09 用户定）：
 * 1. 无上传时间的文件，若已在 S1/S2/S10 归档过（按文件名比对），不再重复出现；
 * 2. 文件名含「第一轮」的一律不进本轮归档候选（直接跳过，不是提示）；
 * 3. 文件名含「审核清单」的一律不进本轮候选（那是回复类文件，归 S10/S16 管）。
 */
import type { ReplyMessageMeta } from './reply';

/** 同一提交事件内相邻消息的最大间隔（经验值，靠歧义提示+人工确认兜底） */
export const MATERIAL_GROUP_GAP_MS = 30 * 60 * 1000;

const AUDIO_EXTS = new Set([
  '.m4a', '.mp3', '.wav', '.aac', '.flac', '.ogg', '.opus', '.amr', '.wma', '.aiff', '.aif',
]);
const DOC_EXTS = new Set(['.md', '.txt', '.doc', '.docx', '.pdf']);

/** 文件名里的补传/重传冲突信号（§12.2；「第一轮」与「审核清单」已直接排除，见下） */
const ROUND_CONFLICT_RE = /(补传|重传|补发)/;

/** 硬性排除：第一轮文件、审核清单类文件一概不进第二轮材料候选 */
const FIRST_ROUND_RE = /第一轮/;
const REVIEW_DOC_RE = /审核清单/;

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
}

export interface MaterialGroup {
  id: string;
  startAt: number | null;
  endAt: number | null;
  files: MaterialFile[];
  hasAudio: boolean;
  /** 系统建议的第二轮提交事件（窗内第一个含音频且无冲突信号的组） */
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
    beforeSince: number;
    deleted: number;
    text: number;
    otherType: number;
    noFileKey: number;
    /** 文件名含「第一轮」，硬性排除 */
    firstRound: number;
    /** 文件名含「审核清单」（回复类文件，归 S10/S16），硬性排除 */
    reviewDoc: number;
    /** 无上传时间且已在 S1/S2/S10 归档过（按文件名比对），不重复出现 */
    archivedBefore: number;
  };
  sinceTime: number | null;
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

/**
 * 从群消息元数据聚类第二轮提交事件。
 * @param messages feishu_list_messages 归一化后的消息
 * @param sinceTime S12 大纲发送时刻（ms）；早于该时刻的消息是第一轮历史，不参与分组
 * @param archivedNames 本 Run 已在 S1/S2/S10 归档过的文件名（小写）；仅对无上传时间的文件生效
 */
export function groupRound2Materials(
  messages: ReplyMessageMeta[],
  sinceTime: number | null,
  archivedNames: ReadonlySet<string> = new Set(),
): Round2GroupView {
  const skipped = {
    selfSender: 0,
    beforeSince: 0,
    deleted: 0,
    text: 0,
    otherType: 0,
    noFileKey: 0,
    firstRound: 0,
    reviewDoc: 0,
    archivedBefore: 0,
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
    if (m.senderType === 'app' || m.senderType === 'bot') {
      skipped.selfSender += 1;
      continue;
    }
    const name = m.senderName ?? '';
    if (['陆秉文'].some((n) => name.includes(n))) {
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
    if (sinceTime !== null && m.createTime !== null && m.createTime < sinceTime) {
      skipped.beforeSince += 1;
      continue;
    }
    // 无上传时间的文件无法判断轮次：若已在此前步骤归档/归并过（忽略扩展名比对），不再重复列出
    if (m.createTime === null && rawName) {
      const lower = rawName.toLowerCase();
      const dot = lower.lastIndexOf('.');
      const baseNoExt = dot > 0 ? lower.slice(0, dot) : lower;
      if (archivedNames.has(baseNoExt)) {
        skipped.archivedBefore += 1;
        continue;
      }
    }
    const kind = classifyFile(m);
    files.push({
      messageId: m.messageId,
      fileKey: m.fileKey ?? null,
      fileName: m.fileName ?? (m.msgType === 'audio' ? `语音消息_${m.messageId.slice(-8)}` : '(无文件名)'),
      kind,
      senderName: m.senderName,
      createTime: m.createTime,
      msgType: m.msgType,
      conflictHint: ROUND_CONFLICT_RE.test(m.fileName ?? ''),
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

  // 建议：窗内第一个含音频且组内无冲突文件名信号的事件
  const suggested = groups.find((g) => g.hasAudio && !g.files.some((f) => f.conflictHint)) ?? null;
  if (suggested) suggested.suggested = true;

  const ambiguity: string[] = [];
  const audioGroups = groups.filter((g) => g.hasAudio);
  if (audioGroups.length === 0) {
    ambiguity.push('S12 大纲发送后未发现含音频的提交事件：导师可能尚未提交，或录音以非文件形式发送，请核对后手工勾选/登记。');
  } else if (audioGroups.length >= 2) {
    ambiguity.push(`S12 大纲发送后出现 ${audioGroups.length} 个含音频的提交事件，存在补传/分段可能，已默认勾选最早的无冲突事件，请逐组核对。`);
  }
  if (audioGroups.some((g) => g.files.some((f) => f.conflictHint))) {
    ambiguity.push('有文件名带「补传/重传/补发」信号，可能是分段或补录，请按内容确认后再归档。');
  }
  if (untimed.length > 0) {
    ambiguity.push(`${untimed.length} 个文件缺少上传时间，无法参与事件分组，已单独列出，请人工确认归属。`);
  }

  return { groups, suggestedGroupId: suggested?.id ?? null, ambiguity, skipped, sinceTime };
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
