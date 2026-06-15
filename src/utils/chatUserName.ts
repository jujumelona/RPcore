export const CHAT_USER_PLACEHOLDER = '{U}';

function normalizeUserNameValue(value?: string): string {
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/\uFF08/g, '(')
        .replace(/\uFF09/g, ')')
        .replace(/\s+/g, ' ')
    : '';
}

function normalizeUserNameKey(value?: string): string {
  return normalizeUserNameValue(value).toLocaleLowerCase();
}

const DISPLAY_NAME_MAP = new Map<string, string>([
  [normalizeUserNameKey('\uB098 (\uC720\uC800)'), CHAT_USER_PLACEHOLDER],
  [normalizeUserNameKey('\uC0AC\uC6A9\uC790 (\uB098)'), CHAT_USER_PLACEHOLDER],
  [normalizeUserNameKey('User (me)'), CHAT_USER_PLACEHOLDER],
]);

const GENERIC_USER_NAME_KEYS = new Set<string>([
  '',
  normalizeUserNameKey(CHAT_USER_PLACEHOLDER),
  '{user}',
  'user',
  'me',
  'player',
  'the player',
  normalizeUserNameKey('\uB098'),
  normalizeUserNameKey('\uC720\uC800'),
  normalizeUserNameKey('\uC0AC\uC6A9\uC790'),
]);

for (const key of DISPLAY_NAME_MAP.keys()) {
  GENERIC_USER_NAME_KEYS.add(key);
}

export function getChatUserDisplayName(value?: string): string {
  const normalized = normalizeUserNameValue(value);
  if (!normalized) return CHAT_USER_PLACEHOLDER;

  return DISPLAY_NAME_MAP.get(normalizeUserNameKey(normalized)) ?? normalized;
}

export function getVisibleChatUserName(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const normalized = normalizeUserNameValue(candidate);
    if (!normalized) continue;
    if (GENERIC_USER_NAME_KEYS.has(normalizeUserNameKey(normalized))) {
      continue;
    }
    return normalized;
  }

  return '나';
}

export function sanitizeChatUserNameForPrompt(value?: string): string {
  const normalized = normalizeUserNameValue(value);
  if (!normalized) return '';
  if (GENERIC_USER_NAME_KEYS.has(normalizeUserNameKey(normalized))) {
    return '';
  }
  return normalized;
}

export function resolveChatUserName(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const sanitized = sanitizeChatUserNameForPrompt(candidate);
    if (sanitized) {
      return sanitized;
    }
  }
  return '';
}
