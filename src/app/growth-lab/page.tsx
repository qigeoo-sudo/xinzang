import { redirect } from 'next/navigation';

// 成长追踪已并入 /dashboard，本路由仅做兼容重定向
// （保留 ?preview=N 查询串，开发环境免登录预览走 /dashboard?preview=N）
export default function GrowthLabRedirect({
  searchParams,
}: {
  searchParams: { preview?: string };
}) {
  const preview = Number(searchParams.preview);
  const qs = preview > 0 ? `?preview=${preview}` : '';
  redirect(`/dashboard${qs}`);
}
