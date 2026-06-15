import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { ToastService } from '../components/Toast';
import { getRuntimeMessages } from '../i18n/runtimeMessages';
import { logger } from './logger';

export type AppUpdatePhase = 'idle' | 'checking' | 'downloading' | 'ready' | 'disabled' | 'error';

export interface AppUpdateState {
  installed: boolean;
  enabled: boolean;
  canOpenDevMenu: boolean;
  phase: AppUpdatePhase;
  channel: string | null;
  runtimeVersion: string | null;
  projectId: string | null;
  updateUrl: string | null;
  currentUpdateId: string | null;
  downloadedUpdateId: string | null;
  lastCheckedAt: number | null;
  lastError: string | null;
}

type AppUpdateContext = {
  appVersion?: string;
  language?: string;
  currentModelId?: string | null;
};

type CheckOptions = {
  silent?: boolean;
  autoDownload?: boolean;
  reloadOnApply?: boolean;
};

type ApplyOptions = {
  silent?: boolean;
};

type UpdatesModuleLike = {
  isEnabled?: boolean;
  channel?: string;
  runtimeVersion?: string;
  updateId?: string;
  setExtraParamAsync?: (key: string, value: string) => Promise<void>;
  checkForUpdateAsync?: () => Promise<{isAvailable?: boolean; manifest?: {id?: string}} | null | undefined>;
  fetchUpdateAsync?: () => Promise<{manifest?: {id?: string}} | null | undefined>;
  reloadAsync?: () => Promise<void>;
};

type DevClientModuleLike = {
  openMenu?: () => void;
  registerDevMenuItems?: (items: Array<{name: string; callback: () => void}>) => Promise<void>;
};

type ConstantsModuleLike = {
  expoConfig?: {
    extra?: {
      eas?: {
        projectId?: string | null;
      };
    };
    updates?: {
      url?: string | null;
    };
  } | null;
};

type StateListener = (next: AppUpdateState) => void;

let updatesModuleCache: UpdatesModuleLike | null | undefined;
let devClientModuleCache: DevClientModuleLike | null | undefined;
let constantsModuleCache: ConstantsModuleLike | null | undefined;
let devMenuRegistered = false;
let currentContext: AppUpdateContext = {};

const listeners = new Set<StateListener>();

let state: AppUpdateState = {
  installed: false,
  enabled: false,
  canOpenDevMenu: false,
  phase: 'disabled',
  channel: null,
  runtimeVersion: null,
  projectId: null,
  updateUrl: null,
  currentUpdateId: null,
  downloadedUpdateId: null,
  lastCheckedAt: null,
  lastError: null };

function loadUpdatesModule(): UpdatesModuleLike | null {
  if (updatesModuleCache !== undefined) {
    return updatesModuleCache;
  }
  try {
    updatesModuleCache = require('expo-updates') as UpdatesModuleLike;
  } catch {
    updatesModuleCache = null;
  }
  return updatesModuleCache;
}

function loadDevClientModule(): DevClientModuleLike | null {
  if (devClientModuleCache !== undefined) {
    return devClientModuleCache;
  }
  try {
    devClientModuleCache = require('expo-dev-client') as DevClientModuleLike;
  } catch {
    devClientModuleCache = null;
  }
  return devClientModuleCache;
}

function loadConstantsModule(): ConstantsModuleLike | null {
  if (constantsModuleCache !== undefined) {
    return constantsModuleCache;
  }
  try {
    constantsModuleCache = require('expo-constants') as ConstantsModuleLike;
  } catch {
    constantsModuleCache = null;
  }
  return constantsModuleCache;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return getRuntimeMessages(currentContext.language).updateCheckFailed;
}

function isUpdateRuntimeEnabled(): boolean {
  const Updates = loadUpdatesModule();
  return Boolean(Updates?.isEnabled) && !__DEV__;
}

function buildState(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  const Updates = loadUpdatesModule();
  const DevClient = loadDevClientModule();
  const Constants = loadConstantsModule();
  const enabled = isUpdateRuntimeEnabled();
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? null;
  const updateUrl = Constants?.expoConfig?.updates?.url ?? null;

  return {
    installed: Boolean(Updates),
    enabled,
    canOpenDevMenu: Boolean(DevClient?.openMenu),
    phase: overrides.phase ?? state.phase ?? (enabled ? 'idle' : 'disabled'),
    channel: overrides.channel ?? Updates?.channel ?? (__DEV__ && DevClient ? 'dev-client' : null),
    runtimeVersion: overrides.runtimeVersion ?? Updates?.runtimeVersion ?? null,
    projectId: overrides.projectId ?? projectId,
    updateUrl: overrides.updateUrl ?? updateUrl,
    currentUpdateId: overrides.currentUpdateId ?? Updates?.updateId ?? null,
    downloadedUpdateId: overrides.downloadedUpdateId ?? state.downloadedUpdateId ?? null,
    lastCheckedAt: overrides.lastCheckedAt ?? state.lastCheckedAt ?? null,
    lastError: overrides.lastError ?? state.lastError ?? null };
}

function emit(overrides: Partial<AppUpdateState> = {}): AppUpdateState {
  state = buildState(overrides);
  listeners.forEach(listener => listener(state));
  return state;
}

function toastInfo(message: string, silent?: boolean): void {
  if (!silent) {
    ToastService.info(message);
  }
}

function toastSuccess(message: string, silent?: boolean): void {
  if (!silent) {
    ToastService.success(message);
  }
}

function toastError(message: string, silent?: boolean): void {
  if (!silent) {
    ToastService.error(message);
  }
}

async function registerDevMenuItems(): Promise<void> {
  if (devMenuRegistered) {
    return;
  }

  if (Platform.OS === 'android' && AppState.currentState !== 'active') {
    return;
  }

  const DevClient = loadDevClientModule();
  if (!DevClient?.registerDevMenuItems) {
    return;
  }

  try {
    await DevClient.registerDevMenuItems([
      {
        name: 'Check OTA Update',
        callback: () => {
          // eslint-disable-next-line no-void
          void checkForAppUpdate({silent: false, autoDownload: true, reloadOnApply: false});
        } },
      {
        name: 'Apply Downloaded OTA Update',
        callback: () => {
          // eslint-disable-next-line no-void
          void applyDownloadedAppUpdate({silent: false});
        } },
      {
        name: 'Show OTA Runtime Info',
        callback: () => {
          const snapshot = getAppUpdateState();
          ToastService.info(
            'channel=' + (snapshot.channel ?? 'n/a') +
              ' runtime=' + (snapshot.runtimeVersion ?? 'n/a') +
              ' projectId=' + (snapshot.projectId ?? 'n/a') +
              ' phase=' + snapshot.phase,
          );
        } },
    ]);
    devMenuRegistered = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/current activity is no longer available/i.test(message)) {
      return;
    }
    logger.warn('[AppUpdateService] Failed to register dev menu items:', error);
  }
}

export function getAppUpdateState(): AppUpdateState {
  return emit();
}

export function subscribeToAppUpdateState(listener: StateListener): () => void {
  listeners.add(listener);
  listener(getAppUpdateState());
  return () => {
    listeners.delete(listener);
  };
}

export function useAppUpdateState(): AppUpdateState {
  const [snapshot, setSnapshot] = useState<AppUpdateState>(() => getAppUpdateState());

  useEffect(() => subscribeToAppUpdateState(setSnapshot), []);

  return snapshot;
}

export async function syncAppUpdateContext(context: AppUpdateContext = {}): Promise<void> {
  currentContext = {
    ...currentContext,
    ...context };

  const Updates = loadUpdatesModule();
  if (!Updates?.setExtraParamAsync || !isUpdateRuntimeEnabled()) {
    emit();
    return;
  }

  const pairs: Array<[string, string | null | undefined]> = [
    ['appVersion', currentContext.appVersion],
    ['lang', currentContext.language],
    ['model', currentContext.currentModelId ?? 'none'],
    ['platform', Platform.OS],
  ];

  await Promise.all(
    pairs.map(async ([key, value]) => {
      if (value === undefined || value === null || value === '') {
        return;
      }
      try {
        await Updates.setExtraParamAsync?.(key, String(value));
      } catch (error) {
        logger.warn('[AppUpdateService] Failed to set update extra param:', key, error);
      }
    }),
  );

  emit();
}

export async function bootstrapAppUpdates(context: AppUpdateContext = {}): Promise<void> {
  emit({phase: isUpdateRuntimeEnabled() ? 'idle' : 'disabled'});
  await syncAppUpdateContext(context);
  if (__DEV__) {
    return;
  }
  await registerDevMenuItems();
}

export async function checkForAppUpdate(options: CheckOptions = {}): Promise<'disabled' | 'up-to-date' | 'downloaded' | 'reloading' | 'error'> {
  const Updates = loadUpdatesModule();
  const messages = getRuntimeMessages(currentContext.language);

  if (!Updates?.checkForUpdateAsync) {
    emit({phase: 'disabled'});
    toastInfo(messages.installExpoUpdatesToEnable, options.silent);
    return 'disabled';
  }

  if (!isUpdateRuntimeEnabled()) {
    emit({phase: 'disabled'});
    toastInfo(messages.otaDisabledInDev, options.silent);
    return 'disabled';
  }

  emit({phase: 'checking', lastError: null});

  try {
    const result = await Updates.checkForUpdateAsync();

    if (!result?.isAvailable) {
      emit({
        phase: 'idle',
        lastCheckedAt: Date.now(),
        lastError: null,
        downloadedUpdateId: null });
      toastInfo(messages.appUpToDate, options.silent);
      return 'up-to-date';
    }

    if (options.autoDownload && Updates.fetchUpdateAsync) {
      emit({phase: 'downloading', lastError: null});
      const fetched = await Updates.fetchUpdateAsync();
      const downloadedUpdateId = fetched?.manifest?.id ?? result?.manifest?.id ?? 'downloaded';
      emit({
        phase: 'ready',
        lastCheckedAt: Date.now(),
        downloadedUpdateId,
        lastError: null });

      if (options.reloadOnApply && Updates.reloadAsync) {
        toastInfo(messages.restartingIntoUpdate, options.silent);
        await Updates.reloadAsync();
        return 'reloading';
      }

      toastSuccess(messages.updateDownloaded, options.silent);
      return 'downloaded';
    }

    emit({
      phase: 'ready',
      lastCheckedAt: Date.now(),
      downloadedUpdateId: result?.manifest?.id ?? 'available',
      lastError: null });
    toastSuccess(messages.newUpdateAvailable, options.silent);
    return 'downloaded';
  } catch (error) {
    const message = formatErrorMessage(error);
    emit({phase: 'error', lastCheckedAt: Date.now(), lastError: message});
    toastError(message, options.silent);
    return 'error';
  }
}

export async function applyDownloadedAppUpdate(options: ApplyOptions = {}): Promise<'disabled' | 'reloading' | 'error'> {
  const Updates = loadUpdatesModule();
  const messages = getRuntimeMessages(currentContext.language);

  if (!Updates?.reloadAsync || !isUpdateRuntimeEnabled()) {
    emit({phase: 'disabled'});
    toastInfo(messages.noDownloadedUpdateReady, options.silent);
    return 'disabled';
  }

  if (!state.downloadedUpdateId) {
    toastInfo(messages.checkForUpdatesFirst, options.silent);
    return 'disabled';
  }

  try {
    toastInfo(messages.restartingIntoUpdate, options.silent);
    await Updates.reloadAsync();
    return 'reloading';
  } catch (error) {
    const message = formatErrorMessage(error);
    emit({phase: 'error', lastError: message});
    toastError(message, options.silent);
    return 'error';
  }
}

export function openDevClientMenu(): boolean {
  const DevClient = loadDevClientModule();
  if (DevClient?.openMenu) {
    DevClient.openMenu();
    return true;
  }

  ToastService.info(getRuntimeMessages(currentContext.language).installDevClient);
  return false;
}

// Backward-compatible named export used by older imports
export const AppUpdateService = {
  getAppUpdateState,
  subscribeToAppUpdateState,
  useAppUpdateState,
  syncAppUpdateContext,
  bootstrapAppUpdates,
  checkForAppUpdate,
  applyDownloadedAppUpdate,
  openDevClientMenu };
