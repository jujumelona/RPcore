export type EmotionUITier = 'low' | 'mid' | 'high';

export function resolveEmotionUITier(totalRAM?: number): EmotionUITier {
  const mb = totalRAM ?? 6144;
  if (mb < 4096) return 'low';
  if (mb >= 8192) return 'high';
  return 'mid';
}
