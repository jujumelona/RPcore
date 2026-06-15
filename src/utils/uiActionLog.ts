export type UiAction = {
  label: string;
  ts: number;
};

let lastUiAction: UiAction | null = null;

export function recordUiAction(label: string): void {
  if (!label) return;
  lastUiAction = { label, ts: Date.now() };
  if (__DEV__) console.log('[UIAction]', label);
}

export function getLastUiAction(): UiAction | null {
  return lastUiAction;
}
