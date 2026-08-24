export function getLockDurationMinutes(loginAttempts: number): number {
  if (loginAttempts < 5) return 0;
  const earlyDurations = [1, 3, 10, 30];
  const idx = loginAttempts - 5;
  if (idx < earlyDurations.length) return earlyDurations[idx];
  return Math.min(60 * Math.pow(2, loginAttempts - 9), 7680);
}

export function formatLockDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  return `${days}天`;
}
