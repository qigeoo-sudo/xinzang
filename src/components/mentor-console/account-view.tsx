'use client';

/**
 * 账号与安全：账号信息、修改密码（走短信验证码重置）。
 * 退出登录按钮已移到顶部面包屑右侧。
 * 登录账号、角色、绑定分身均不可自行修改。
 */

interface Props {
  mentorName: string;
  accountName: string;
  lastLoginAt: string | null;
  loginCount: number;
}

function formatTime(iso: string | null): string {
  if (!iso) return '无记录';
  const d = new Date(iso);
  const bj = new Date(d.getTime() + 8 * 3600_000);
  return bj.toISOString().slice(0, 16).replace('T', ' ');
}

export function AccountView({ mentorName, accountName, lastLoginAt, loginCount }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-t-2 border-t-indigo-300 bg-gradient-to-br from-indigo-50 to-violet-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="text-sm font-medium text-stone-800">账号信息</p>
        <dl className="mt-3 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-stone-500">账号称呼</dt>
            <dd className="text-stone-800">{accountName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">绑定分身</dt>
            <dd className="text-stone-800">{mentorName}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">最近登录</dt>
            <dd className="text-stone-800">{formatTime(lastLoginAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-500">累计登录</dt>
            <dd className="text-stone-800">{loginCount} 次</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-5 text-stone-400">
          登录账号、账号角色与绑定分身由平台统一管理，如需变更请联系管理员。
        </p>
      </div>

      <div className="rounded-2xl border-t-2 border-t-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm ring-1 ring-stone-900/[0.06]">
        <p className="text-sm font-medium text-stone-800">修改密码</p>
        <p className="mt-1 text-xs leading-5 text-stone-500">
          通过手机短信验证码重置密码，重置成功后需要用新密码重新登录。
        </p>
        <div className="mt-3">
          <a
            href="/forgot-password"
            className="inline-block rounded-xl border border-stone-300 px-4 py-2 text-sm text-stone-700 hover:border-stone-400"
          >
            前往重置密码
          </a>
        </div>
      </div>
    </div>
  );
}
