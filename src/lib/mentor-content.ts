/**
 * 导师 Prompt 资产加载（Node 运行时）
 *
 * 资产来源（v1.2 起）：
 *   1. 首选数据库 mentor_persona_prompts 表（key = 'global_policy' 或导师 ID）
 *   2. 回退本地文件 content/knowledge-governance/（治理管线原件，仓库外分发）
 *
 * 文件布局：
 *   - GLOBAL_MENTOR_SYSTEM_POLICY.md  全体导师共同 System Policy（最高优先级）
 *   - prompts/<mentorId>_system_prompt.md  单导师人格 Prompt
 *
 * 四层加载顺序（handoff §4）：
 *   global policy → 单导师 prompt → 权限过滤后的知识 → 会话上下文
 *
 * 仅可在 Node 运行时调用（chat route / seed / tsx 脚本）；
 * Edge/浏览器环境禁止导入。
 * 数据库异常（表未建/连接失败）一律回退文件，保证滚动发布期零中断。
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { prisma } from './prisma';
import { CANONICAL_MENTOR_IDS } from './kb-governance';

const CONTENT_DIR = resolve(process.cwd(), 'content/knowledge-governance');
const GLOBAL_POLICY_FILE = 'GLOBAL_MENTOR_SYSTEM_POLICY.md';
const GLOBAL_POLICY_KEY = 'global_policy';

let globalPolicyCache: string | null = null;
const personaCache = new Map<string, string>();

/** 去掉 md 首个 # 标题行（文件说明性标题，不发给模型） */
function stripHeading(md: string): string {
  return md.replace(/^\s*#\s+[^\n]*\n+/, '').trim();
}

function readAsset(relPath: string): string {
  const abs = resolve(CONTENT_DIR, relPath);
  if (!existsSync(abs)) {
    throw new Error(
      `知识治理资产缺失: ${abs}（数据库无记录且文件不存在，部署不完整）`,
    );
  }
  return readFileSync(abs, 'utf-8');
}

/** 数据库优先读资产；DB 异常或无记录返回 null（调用方回退文件） */
async function readAssetFromDb(key: string): Promise<string | null> {
  try {
    const row = await prisma.mentorPersonaPrompt.findUnique({
      where: { key },
      select: { content: true },
    });
    return row?.content ?? null;
  } catch {
    // 表未迁移/连接失败等一切 DB 异常：静默回退文件（滚动发布安全网）
    return null;
  }
}

/** 全体导师共同 System Policy（缓存） */
export async function getGlobalSystemPolicy(): Promise<string> {
  if (globalPolicyCache !== null) return globalPolicyCache;

  const fromDb = await readAssetFromDb(GLOBAL_POLICY_KEY);
  if (fromDb !== null) {
    globalPolicyCache = stripHeading(fromDb);
    return globalPolicyCache;
  }

  globalPolicyCache = stripHeading(readAsset(GLOBAL_POLICY_FILE));
  return globalPolicyCache;
}

/**
 * 单导师人格 Prompt（缓存）。
 * DB 有记录即加载（含 pilot 影子导师等非规范导师）；
 * DB 无记录回退文件：规范导师资产缺失视为部署错误（抛错）；其他导师回退静态文本。
 */
export async function getMentorPersonaPrompt(
  mentorId: string,
  fallback?: string,
): Promise<string> {
  const cached = personaCache.get(mentorId);
  if (cached !== undefined) return cached;

  const fromDb = await readAssetFromDb(mentorId);
  if (fromDb !== null) {
    personaCache.set(mentorId, stripHeading(fromDb));
    return personaCache.get(mentorId)!;
  }

  const assetRel = `prompts/${mentorId}_system_prompt.md`;
  if (existsSync(resolve(CONTENT_DIR, assetRel))) {
    personaCache.set(mentorId, stripHeading(readAsset(assetRel)));
    return personaCache.get(mentorId)!;
  }

  if ((CANONICAL_MENTOR_IDS as string[]).includes(mentorId)) {
    // 规范导师必须有资产：DB 与文件都缺失时抛错（部署不完整）
    throw new Error(
      `导师 ${mentorId} 的人格 Prompt 资产缺失（数据库与文件均无记录）`,
    );
  }
  if (fallback && fallback.trim()) {
    return fallback.trim();
  }
  throw new Error(`导师 ${mentorId} 没有人格 Prompt 资产，也无静态回退文本`);
}
