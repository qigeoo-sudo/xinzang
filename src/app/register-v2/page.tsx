'use client';

/**
 * 注册流程 v2 — 三步分步注册（正式页，接真实后端）
 * 路由：/register-v2
 *
 * 表单主体在共享组件 RegisterWizard（mode="register"），
 * /dashboard/profile/edit 以 mode="edit" 复用同一向导。
 */

import { RegisterWizard } from '@/components/register-wizard';

export default function RegisterV2Page() {
  return <RegisterWizard mode="register" />;
}
