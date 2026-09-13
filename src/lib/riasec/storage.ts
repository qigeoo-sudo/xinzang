/**
 * 访客测评结果暂存
 * 未登录用户测完选择「储存并去注册」→ 写 localStorage
 * 注册流程提交成功后读取并随注册落库，然后清除
 */
import type { AssessmentPayload } from '@/lib/register-v2';

export const PENDING_ASSESSMENT_KEY = 'pending-riasec';

export function savePendingAssessment(payload: AssessmentPayload): void {
  try {
    localStorage.setItem(PENDING_ASSESSMENT_KEY, JSON.stringify(payload));
  } catch {
    // 隐私模式/配额不足时静默失败，用户仍可重新测试
  }
}

export function getPendingAssessment(): AssessmentPayload | null {
  try {
    const raw = localStorage.getItem(PENDING_ASSESSMENT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AssessmentPayload;
  } catch {
    return null;
  }
}

export function clearPendingAssessment(): void {
  try {
    localStorage.removeItem(PENDING_ASSESSMENT_KEY);
  } catch {
    // ignore
  }
}
