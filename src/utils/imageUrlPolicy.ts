import { SERVER_BASE } from '../config/ApiConfig';

const BLOCKED_IMAGE_HOST_PATTERNS = [
  /googleusercontent\.com/i,
  /googleapis\.com/i,
  /gstatic\.com/i,
  /ggpht\.com/i,
];

export function isBlockedImageUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return BLOCKED_IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function sanitizeImageUrl(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed || isBlockedImageUrl(trimmed)) return '';
  
  // ✅ [BUG FIX] 로컬 file:// 혹은 전체 http(s) URL이 아니라면 SERVER_BASE에 붙여줌
  // 예: "beta/profile/xxx.png" -> "https://.../beta/profile/xxx.png"
  if (!trimmed.startsWith('http') && !trimmed.startsWith('file:/') && !trimmed.startsWith('data:')) {
    const sep = trimmed.startsWith('/') ? '' : '/';
    return `${SERVER_BASE}${sep}${trimmed}`;
  }
  
  return trimmed;
}

export function sanitizeNullableImageUrl(url: unknown): string | null {
  const safe = sanitizeImageUrl(url);
  return safe || null;
}
