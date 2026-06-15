import { logger } from './logger';

const activeReasons = new Set<string>();

export function suspendRuntimeInterference(reason = 'unknown'): () => void {
  activeReasons.add(reason);
  logger.log(
    `[RuntimeInterferenceGuard] suspend++ (${reason}) => ${activeReasons.size}`,
  );

  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeReasons.delete(reason);
    logger.log(
      `[RuntimeInterferenceGuard] suspend-- (${reason}) => ${activeReasons.size}`,
    );
  };
}

export function isRuntimeInterferenceSuspended(): boolean {
  return activeReasons.size > 0;
}

export function getRuntimeInterferenceReasons(): string[] {
  return Array.from(activeReasons.values());
}
