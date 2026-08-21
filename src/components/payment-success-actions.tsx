'use client';

import { useRouter } from 'next/navigation';

export function PaymentSuccessActions({ from }: { from?: string }) {
  const router = useRouter();

  const handleReturn = () => {
    if (from) {
      window.location.href = from;
    } else {
      router.back();
    }
  };

  return (
    <div>
      <button
        onClick={handleReturn}
        className="btn-primary block text-center w-full"
      >
        返回
      </button>
    </div>
  );
}
