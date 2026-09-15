/**
 * 导师 Prompt 资产加载（Node 运行时）
 *
 * 唯一资产入口：content/knowledge-governance/
 *   - GLOBAL_MENTOR_SYSTEM_POLICY.md  全体导师共同 System Policy（最高优先级）
 *   - prompts/<mentorId>_system_prompt.md  单导师人格 Prompt
 *
 * 四层加载顺序（handoff §4）：
 *   global policy → 单导师 prompt → 权限过滤后的知识 → 会话上下文
 *
 * 仅可在 Node 运行时调用（chat route / seed / tsx 脚本）；
 * Edge/浏览器环境禁止导入。
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { CANONICAL_MENTOR_IDS } from './kb-governance';

const CONTENT_DIR = resolve(process.cwd(), 'content/knowledge-governance');
const GLOBAL_POLICY_FILE = 'GLOBAL_MENTOR_SYSTEM_POLICY.md';

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
      `知识治理资产缺失: ${abs}（content/ 目录必须随仓库/镜像一起分发）`,
    );
  }
  return readFileSync(abs, 'utf-8');
}

/** 全体导师共同 System Policy（缓存） */
export function getGlobalSystemPolicy(): string {
  if (globalPolicyCache === null) {
    globalPolicyCache = stripHeading(readAsset(GLOBAL_POLICY_FILE));
  }
  return globalPolicyCache;
}

/**
 * 单导师人格 Prompt（缓存）。
 * 规范六位导师从 md 资产读取；其他（如 comingSoon 占位）允许回退到调用方提供的静态文本。
 */
export function getMentorPersonaPrompt(
  mentorId: string,
  fallback?: string,
): string {
  const cached = personaCache.get(mentorId);
  if (cached !== undefined) return cached;

  let prompt: string;
  if ((CANONICAL_MENTOR_IDS as string[]).includes(mentorId)) {
    prompt = stripHeading(readAsset(`prompts/${mentorId}_system_prompt.md`));
  } else if (fallback && fallback.trim()) {
    prompt = fallback.trim();
  } else {
    throw new Error(`导师 ${mentorId} 没有人格 Prompt 资产，也无静态回退文本`);
  }
  personaCache.set(mentorId, prompt);
  return prompt;
}
