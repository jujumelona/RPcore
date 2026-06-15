let lastResolvedStableUserName = '';

function normalizeUserName(value?: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function resetStickyUserNameCache(): void {
  lastResolvedStableUserName = '';
}

export function resolveStickyUserName(
  currentUserName: string | undefined,
  authUserName?: string,
  initialUserName?: string,
): string {
  const normalizedCurrent = normalizeUserName(currentUserName);
  const normalizedAuth = normalizeUserName(authUserName);
  const normalizedInitial = normalizeUserName(initialUserName);

  if (normalizedAuth) {
    lastResolvedStableUserName = normalizedAuth;
    return normalizedAuth;
  }

  if (normalizedCurrent && normalizedCurrent !== 'User') {
    lastResolvedStableUserName = normalizedCurrent;
    return normalizedCurrent;
  }

  if (normalizedInitial && normalizedInitial !== 'User') {
    lastResolvedStableUserName = normalizedInitial;
    return normalizedInitial;
  }

  if (lastResolvedStableUserName) {
    return lastResolvedStableUserName;
  }

  return normalizedInitial || 'User';
}
