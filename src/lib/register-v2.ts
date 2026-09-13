/**
 * register-v2 三步注册流程的字段规范与落库映射
 * 注册接口、档案编辑接口、前端向导共享同一份口径
 */
import { z } from 'zod';

// 身份内部值 → UserProfile.status 中文值
export const IDENTITY_STATUS_MAP: Record<string, string> = {
  student: '在校',
  working: '在职',
  jobless: '待业',
};

// 所有字段均为可选（分步流程 + 编辑模式复用）；长度做上限保护
const shortText = z.string().max(50).optional().nullable();
const monthText = z
  .string()
  .regex(/^\d{4}-\d{2}$/, '年月格式不正确')
  .optional()
  .nullable();

export const registerProfileSchema = z.object({
  nickname: z.string().max(24).optional().nullable(),
  birthMonth: monthText,
  identity: z.enum(['student', 'working', 'jobless']).optional().nullable(),
  enrollMonth: monthText,
  school: z.string().max(60).optional().nullable(),
  major: shortText,
  expectedGrad: shortText,
  gradMonth: monthText,
  workGoal: shortText,
  fullTimeExp: shortText,
  partTimeExp: shortText,
  workProvince: shortText,
  workCity: shortText,
  curProvince: shortText,
  curCity: shortText,
  careers: z.array(z.string().max(40)).max(30).optional().nullable(),
});

export type RegisterProfilePayload = z.infer<typeof registerProfileSchema>;

/**
 * 转换为 prisma UserProfile 的写入字段（新列 + 少量旧列兼容）
 * 只映射存在的键，undefined 的字段不覆盖
 */
export function toUserProfileData(p: RegisterProfilePayload) {
  const data: Record<string, string | null> = {};
  const put = (key: string, v: string | null | undefined) => {
    if (v !== undefined) data[key] = v ?? null;
  };

  put('nickname', p.nickname);
  put('birthMonth', p.birthMonth);
  put('enrollMonth', p.enrollMonth);
  put('school', p.school);
  put('major', p.major);
  put('expectedGrad', p.expectedGrad);
  put('gradMonth', p.gradMonth);
  put('workGoal', p.workGoal);
  put('fullTimeExp', p.fullTimeExp);
  put('partTimeExp', p.partTimeExp);
  put('workProvince', p.workProvince);
  put('workCity', p.workCity);
  put('curProvince', p.curProvince);
  put('curCity', p.curCity);

  if (p.identity !== undefined) {
    data.status = p.identity ? IDENTITY_STATUS_MAP[p.identity] ?? null : null;
  }
  if (p.careers !== undefined) {
    data.careers = p.careers ? JSON.stringify(p.careers) : null;
  }
  return data;
}

// RIASEC 测评结果（随注册一起写入或单独 POST /api/assessment）
const dimensionSchema = z.number().min(0).max(100);
export const assessmentSchema = z.object({
  scores: z.object({
    R: dimensionSchema,
    I: dimensionSchema,
    A: dimensionSchema,
    S: dimensionSchema,
    E: dimensionSchema,
    C: dimensionSchema,
  }),
  answers: z
    .array(z.object({ qid: z.string().max(40), value: z.number().int().min(1).max(5) }))
    .max(120),
  questionVersion: z.string().max(40),
  code: z.string().max(8).optional().nullable(),
  takenAt: z.string().datetime().optional().nullable(),
});

export type AssessmentPayload = z.infer<typeof assessmentSchema>;

export function toAssessmentCreate(p: AssessmentPayload) {
  return {
    scores: JSON.stringify(p.scores),
    answers: JSON.stringify(p.answers),
    questionVersion: p.questionVersion,
    code: p.code ?? null,
    takenAt: p.takenAt ? new Date(p.takenAt) : new Date(),
  };
}
