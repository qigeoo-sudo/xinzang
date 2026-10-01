import { redirect } from 'next/navigation';

/** 旧入口 /admin → 平台数据后台新入口 /admin-console（渠道管理在 /admin/channels） */
export default function AdminIndexPage() {
  redirect('/admin-console');
}
