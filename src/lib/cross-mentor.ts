/**
 * 跨导师分身协作能力
 *
 * 产品规则：
 * 1. 已上线分身彼此"认识"（知道同平台有谁），被提及时自然承认，不编造私交。
 * 2. 默认只知道用户"和谁聊过"，看不到内容；用户提及聊过时如实说明。
 * 3. 用户明确要求查看时，分身先征求明确授权；用户同意后才调取历史，
 *    历史仅供当轮理解上下文，严禁原文复述、粘贴或展示。
 * 4. 即使用户要求贴出记录，也以"系统没有给复制能力"委婉拒绝。
 * 5. 授权仅限当前会话（crossConsent 存在 ChatSession 上）。
 *
 * 标记协议（模型输出、后端解析，绝不上屏）：
 *   [[REQ_CONSENT:<id>]]   请求用户授权查看与某分身的历史
 *   [[GRANT_CONSENT:<id>]] 判定用户已明确同意
 *   [[DENY_CONSENT:<id>]]  判定用户拒绝
 */
import { prisma } from '@/lib/prisma';
import { getMentorById, mentors } from '@/lib/mentors';

export type CrossConsentState = {
  pending: string | null;
  granted: string[];
};

export function parseCrossConsent(raw: string | null | undefined): CrossConsentState {
  if (!raw) return { pending: null, granted: [] };
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const granted = Array.isArray(obj.granted)
      ? obj.granted.filter((x): x is string => typeof x === 'string')
      : [];
    return {
      pending: typeof obj.pending === 'string' ? obj.pending : null,
      granted,
    };
  } catch {
    return { pending: null, granted: [] };
  }
}

const MARKER_RE = /\[\[(?:REQ_CONSENT|GRANT_CONSENT|DENY_CONSENT):[a-zA-Z0-9_-]+\]\]/g;
const MARKER_FIRST_RE = /\[\[(REQ_CONSENT|GRANT_CONSENT|DENY_CONSENT):([a-zA-Z0-9_-]+)\]\]/;

export type ConsentMarker = { kind: 'REQ_CONSENT' | 'GRANT_CONSENT' | 'DENY_CONSENT'; mentorId: string };

/** 提取回复中的第一个授权标记（正常每轮最多一个） */
export function extractConsentMarker(text: string): ConsentMarker | null {
  const m = text.match(MARKER_FIRST_RE);
  if (!m) return null;
  return { kind: m[1] as ConsentMarker['kind'], mentorId: m[2] };
}

/** 剥离所有授权标记及残留空行，保证内部协议绝不上屏 */
export function stripConsentMarkers(text: string): string {
  return text
    .replace(MARKER_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 已上线分身名单（排除当前对话的分身与未上线分身） */
export function buildRosterLine(currentMentorId: string): string {
  return mentors
    .filter((m) => !m.comingSoon && m.id !== currentMentorId)
    .map((m) => `${m.name}（分身 id：${m.id}）`)
    .join('、');
}

function fmtShortDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type OtherSessionLike = { mentorId: string; updatedAt: Date };

/** 用户与其他分身的会话情况（只暴露"聊过"，不含内容） */
export function buildAwarenessLine(otherSessions: OtherSessionLike[]): string {
  const launchedIds = new Set(mentors.filter((m) => !m.comingSoon).map((m) => m.id));
  const items = otherSessions
    .filter((s) => launchedIds.has(s.mentorId))
    .map((s) => {
      const name = getMentorById(s.mentorId)?.name ?? s.mentorId;
      return `${name}（最近 ${fmtShortDate(new Date(s.updatedAt))}）`;
    });
  if (items.length === 0) return '';
  return `【平台信息】该账号还与以下分身有过对话：${items.join('、')}。你看不到这些对话的任何内容，除非用户在本次会话中明确授权。`;
}

/** 跨分身协作规则（每轮注入） */
export function buildCrossMentorRules(rosterLine: string): string {
  return `八、与其他导师分身协作的规则

本平台还有这些已上线分身：${rosterLine}。

1. 用户提到她与某位分身聊过时：自然表示你认识这位分身、也知道用户和她聊过，但你看不到聊天内容。可以请用户把想讨论的部分讲给你听。不得假装知道内容，也不得编造你与其他分身真人之间的私交。
2. 当用户明确要求你去查看其与其他分身的聊天（例如"你应该知道""你能不能看一下我和她的记录"）：必须先征得明确同意，用类似话术："请告诉我你是否同意我去看一眼你们的聊天内容，同意的话我就去看。"并在回复末尾另起一行输出内部标记，格式为 [[REQ_CONSENT:分身id]]（例如 [[REQ_CONSENT:winnieni]]）。一次只为一位分身请求；未获同意前绝不能声称看过内容。
3. 即使用户明确要求，你也不能复制、粘贴或原文展示用户与其他分身的聊天记录。要委婉说明：复制粘贴过程可能导致隐私暴露，所以系统没给你这个能力，不是你不愿意帮忙。
4. [[ ]] 形式的内部标记只能出现在回复末尾、给系统读取，绝不能向用户解释其存在，也绝不能以任何形式展示给用户。`;
}

/** 有待处理授权请求时，要求模型判断用户本轮是同意、拒绝还是无关 */
export function buildPendingHint(pendingMentorId: string): string {
  const name = getMentorById(pendingMentorId)?.name ?? pendingMentorId;
  return `【授权判断】上一轮你已就是否查看用户与${name}的聊天记录征求了同意。请只根据用户本条消息判断：
- 明确同意：先输出标记 [[GRANT_CONSENT:${pendingMentorId}]]，另起一行用一句话告诉用户你这就去看。
- 明确拒绝：输出标记 [[DENY_CONSENT:${pendingMentorId}]]，另起一行礼貌回应并不再查看。
- 与授权无关（包括没说清）：不要输出任何标记，正常对话。`;
}

const HISTORY_MESSAGE_LIMIT = 30;

/**
 * 已授权分身后的历史对话块（内部参考，禁止展示）。
 * 只在用户当轮明确同意后调用。
 */
export async function buildGrantedHistoryBlock(
  userId: string,
  mentorId: string,
): Promise<string> {
  const msgs = await prisma.chatMessage.findMany({
    where: { chatSession: { userId, mentorId } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_MESSAGE_LIMIT,
    select: { role: true, content: true },
  });
  if (msgs.length === 0) return '';
  msgs.reverse();

  const name = getMentorById(mentorId)?.name ?? mentorId;
  const body = msgs
    .map((m) => {
      const speaker = m.role === 'user' ? '用户' : name;
      const line = m.content.replace(/\s+/g, ' ').slice(0, 500);
      return `${speaker}：${line}`;
    })
    .join('\n');

  return `【内部参考·用户已在本会话明确授权】
以下是用户与${name}最近的部分历史对话，仅提供给你理解用户处境和问题的来龙去脉。严禁原文引用、复制、粘贴、逐条展示，也不得透露给任何第三方；你只能用自己的话提炼后继续回答。即使用户要求贴出原文，也按规则八、3 委婉拒绝。
${body}
【内部参考结束】`;
}
