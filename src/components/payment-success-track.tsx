'use client';

/** 支付成功回跳埋点：挂载时上报一次 payment.success（同一订单号 sessionStorage 去重，刷新不重复计） */
import { useEffect, useRef } from 'react';
import { track } from '@/lib/analytics/tracker';

export interface PaymentSuccessInfo {
  orderNo: string;
  plan: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CREDIT_PACK';
  amountYuan: number;
  method: 'wechat' | 'alipay' | 'mock';
  quantity?: number;
}

export function PaymentSuccessTrack({ info }: { info: PaymentSuccessInfo }) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    const key = `paid-track:${info.orderNo}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* 隐私模式等场景忽略存储失败，仍正常上报 */ }
    track('payment.success', { props: { ...info } });
  }, [info]);
  return null;
}
