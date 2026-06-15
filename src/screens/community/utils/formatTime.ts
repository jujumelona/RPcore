// src/screens/community/utils/formatTime.ts
export function formatTime(timestamp: number, t: Record<string, string | undefined>): string {
  const diffSeconds = Math.max(0, (Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return t?.timeJustNow ?? '';
  if (diffSeconds < 3600) return (t?.timeMinAgo ?? '').replace('{n}', String(Math.floor(diffSeconds / 60)));
  if (diffSeconds < 86400) return (t?.timeHourAgo ?? '').replace('{n}', String(Math.floor(diffSeconds / 3600)));
  return (t?.timeDayAgo ?? '').replace('{n}', String(Math.floor(diffSeconds / 86400)));
}
