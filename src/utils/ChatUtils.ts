// src/utils/ChatUtils.ts

/**
 * DB speaker_id (string)를 ChatMessage speaker (number)로 변환
 * - 'user', '1' -> 1
 * - 'narrator', '0' -> 0
 * - 기타 숫자 문자열 -> 숫자 변환
 * - 알 수 없음 -> 2 (캐릭터)
 */
export function normalizeSpeakerId(raw: string | number | null | undefined): number {
  if (raw === 'user' || raw === '1' || raw === 1) return 1;
  if (raw === 'narrator' || raw === '0' || raw === 0) return 0;
  
  if (typeof raw === 'string' && raw !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  
  return 2; // Default to character
}

/**
 * ChatMessage speaker (number)를 DB speaker_id (string)로 변환
 */
export function speakerToDbId(speaker: number): string {
  if (speaker === 1) return 'user';
  if (speaker === 0) return 'narrator';
  return String(speaker);
}
