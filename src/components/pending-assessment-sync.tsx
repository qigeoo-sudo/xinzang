'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import {
  getPendingAssessment,
  clearPendingAssessment,
} from '@/lib/riasec/storage';

/**
 * 登录后自动把访客暂存的 RIASEC 结果落库
 * 访客从测评弹窗点「登录」时结果已暂存；登录成功整页跳转后，
 * 落地页挂载本组件，检测到暂存结果 → POST /api/assessment → 清除暂存。
 * 注册流程由 RegisterWizard 自行消费暂存结果，两者互不冲突。
 */
export function PendingAssessmentSync() {
  const { status } = useSession();
  const synced = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || synced.current) return;
    const payload = getPendingAssessment();
    if (!payload) return;
    synced.current = true;
    (async () => {
      try {
        const res = await fetch('/api/assessment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          clearPendingAssessment();
        } else {
          // 服务端错误：保留暂存，下次进入页面再试
          synced.current = false;
        }
      } catch {
        // 网络失败不清暂存，下次进入页面重试
        synced.current = false;
      }
    })();
  }, [status]);

  return null;
}
