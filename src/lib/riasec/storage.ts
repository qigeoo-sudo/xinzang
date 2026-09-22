/**
 * 访客测评结果暂存
 * 未登录用户测完选择「储存并去注册」→ 写 localStorage + sessionStorage 双份
 * 注册流程提交成功后读取并随注册落库，然后清除
 *
 * 为什么双写：iOS Safari（ITP）会清除脚本写入的 localStorage，隐私模式还可能整体禁用；
 * sessionStorage 在同一标签页内存活，不受 ITP 清理影响。读取时 localStorage 优先，
 * 缺失则回退 sessionStorage 并补存回 localStorage（自愈）。
 */
import type { AssessmentPayload } from '@/lib/register-v2';

const PENDING_ASSESSMENT_KEY = 'pending-riasec';

export function savePendingAssessment(payload: AssessmentPayload): void {
  try {
    localStorage.setItem(PENDING_ASSESSMENT_KEY, JSON.stringify(payload));
  } catch {
    // 隐私模式/配额不足时静默失败，由 sessionStorage 兜底
  }
  try {
    sessionStorage.setItem(PENDING_ASSESSMENT_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function getPendingAssessment(): AssessmentPayload | null {
  try {
    const raw = localStorage.getItem(PENDING_ASSESSMENT_KEY);
    if (raw) return JSON.parse(raw) as AssessmentPayload;
  } catch {
    // ignore，继续尝试 sessionStorage
  }
  try {
    const raw = sessionStorage.getItem(PENDING_ASSESSMENT_KEY);
    if (raw) {
      // localStorage 丢了（ITP 清理等）：从 sessionStorage 补存回去
      try {
        localStorage.setItem(PENDING_ASSESSMENT_KEY, raw);
      } catch {
        // ignore
      }
      return JSON.parse(raw) as AssessmentPayload;
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearPendingAssessment(): void {
  try {
    localStorage.removeItem(PENDING_ASSESSMENT_KEY);
  } catch {
    // ignore
  }
  try {
    sessionStorage.removeItem(PENDING_ASSESSMENT_KEY);
  } catch {
    // ignore
  }
}
