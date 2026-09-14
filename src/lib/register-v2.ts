/**
 * register-v2 三步注册流程的字段规范与落库映射
 * 注册接口、档案编辑接口、前端向导共享同一份口径
 */
import { z } from 'zod';
import { MENTOR_PREFERENCE_OPTIONS } from './register-options';

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

// 昵称按 UTF-8 字节限制（中文 8 字 = 24 字节，英文 24 字母 = 24 字节）
const NICKNAME_MAX_BYTES = 24;
const nicknameText = z
  .string()
  .optional()
  .nullable()
  .refine(
    (v) => v == null || Buffer.byteLength(v, 'utf8') <= NICKNAME_MAX_BYTES,
    { message: `昵称最多 ${NICKNAME_MAX_BYTES} 字节（中文约 ${Math.floor(NICKNAME_MAX_BYTES / 3)} 字）` }
  );

export const registerProfileSchema = z.object({
  nickname: nicknameText,
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
  // “让导师分身更懂你”选填区（复用旧问卷列：开放文本 + JSON 数组）
  // careerAnxiety：职业焦虑自述（≤100 字，前后端敏感词校验）
  careerAnxiety: z.string().max(100).optional().nullable(),
  // helpPriority：希望获得帮助的方面，单选存 0/1 元素数组；“其他”为用户原文（≤20 字，敏感词校验）
  helpPriority: z.array(z.string().max(20)).max(1).optional().nullable(),
  // mentorPreference：想深聊的人，多选固定名单（≤11 项）
  mentorPreference: z
    .array(z.string().max(20))
    .max(11)
    .optional()
    .nullable()
    .refine(
      (arr) => !arr || arr.every((v) => MENTOR_PREFERENCE_OPTIONS.some((o) => o.value === v)),
      { message: '想深聊的人包含无效选项' }
    ),
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
  put('careerAnxiety', p.careerAnxiety);
  if (p.helpPriority !== undefined) {
    data.helpPriority = p.helpPriority && p.helpPriority.length ? JSON.stringify(p.helpPriority) : null;
  }
  if (p.mentorPreference !== undefined) {
    data.mentorPreference =
      p.mentorPreference && p.mentorPreference.length ? JSON.stringify(p.mentorPreference) : null;
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
