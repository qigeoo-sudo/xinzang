/**
 * 单导师龙虾流水线详情（服务端鉴权 + 首屏数据，客户端轮询刷新）。
 */
import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { isAdminRole } from '@/lib/admin';
import { getRunDetail, EngineError } from '@/lib/content-ops/engine';
import { RunDetailView } from '@/components/content-ops/run-detail';
import { ContentOpsGate } from '@/components/content-ops/content-ops-gate';

export const dynamic = 'force-dynamic';

export default async function ContentOpsRunPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user) {
    return <ContentOpsGate />;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const role = user?.role;
  const canWrite = isAdminRole(role);
  if (!canWrite && role !== 'CONTENT_VIEWER') {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-stone-800">🦞 无法访问龙虾工作台</h1>
        <p className="mt-3 text-sm leading-6 text-stone-500">
          这里仅对内容运营成员开放。如果你应该有权限，请联系管理员确认账号角色。
        </p>
      </main>
    );
  }

  try {
    const detail = await getRunDetail(params.id);
    return <RunDetailView initial={JSON.parse(JSON.stringify(detail))} canWrite={canWrite} />;
  } catch (e) {
    if (e instanceof EngineError && e.status === 404) notFound();
    throw e;
  }
}
