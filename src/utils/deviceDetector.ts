// src/utils/deviceDetector.ts
// Emulator/simulator detection helpers and safe native fallbacks.

import { NativeModules, Platform } from 'react-native';

export interface DeviceTypeInfo {
  isEmulator: boolean;
  isSimulator: boolean;
  isVirtual: boolean;
  isPhysical: boolean;
  deviceType: 'emulator' | 'simulator' | 'physical' | 'unknown';
  brand: string;
  model: string;
}

let cachedDeviceInfo: DeviceTypeInfo | null = null;

export function detectVirtualDevice(): DeviceTypeInfo {
  if (cachedDeviceInfo) return cachedDeviceInfo;

  const { DeviceInfo } = NativeModules;

  let brand = 'unknown';
  let model = 'unknown';

  try {
    brand = DeviceInfo?.getBrand?.() ?? DeviceInfo?.brand ?? 'unknown';
    model = DeviceInfo?.getModel?.() ?? DeviceInfo?.model ?? 'unknown';
  } catch {
    // Ignore native read failures and keep unknown values.
  }

  const brandStr = String(brand).toLowerCase();
  const modelStr = String(model).toLowerCase();

  const isAndroidEmulator = Platform.OS === 'android' && (
    brandStr.includes('google') ||
    modelStr.includes('emulator') ||
    modelStr.includes('sdk') ||
    modelStr.startsWith('aosp') ||
    brandStr === 'generic' ||
    brandStr === 'generic_x86' ||
    brandStr === 'google_sdk' ||
    modelStr === 'google_sdk' ||
    /sdk_.*/.test(modelStr) ||
    /emulator.*/.test(modelStr) ||
    /.*virtual.*/.test(modelStr) ||
    modelStr === 'ranchu' ||
    (brandStr === 'android' && modelStr === 'android')
  );

  // [BUG FIX] iOS 시뮬레이터 오탐 수정
  // 기존: __DEV__ + !iPad + !TV → 실기기 DEV 빌드도 시뮬레이터로 오판
  // 수정: nativeIsSimulator (DeviceInfo 네이티브 메서드)에만 의존
  let nativeIsSimulator = false;
  try {
    nativeIsSimulator = DeviceInfo?.isSimulator?.() ?? DeviceInfo?.isEmulator?.() ?? false;
  } catch {
    // Native method can be absent.
  }

  // iOS는 네이티브 감지에만 의존. __DEV__ 단독으로 시뮬레이터 판정 금지.
  const isIOSSimulator = Platform.OS === 'ios' && nativeIsSimulator;

  const isEmulator = isAndroidEmulator || nativeIsSimulator;
  const isSimulator = isIOSSimulator || nativeIsSimulator;
  const isVirtual = isEmulator || isSimulator;
  const isPhysical = !isVirtual && Platform.OS !== 'web';

  let deviceType: DeviceTypeInfo['deviceType'] = 'unknown';
  if (isEmulator) deviceType = 'emulator';
  else if (isSimulator) deviceType = 'simulator';
  else if (isPhysical) deviceType = 'physical';

  cachedDeviceInfo = {
    isEmulator,
    isSimulator,
    isVirtual,
    isPhysical,
    deviceType,
    brand: brandStr,
    model: modelStr };

  return cachedDeviceInfo;
}

export async function safeNativeCall<T>(
  nativeFn: () => Promise<T> | T,
  fallbackFn: () => Promise<T> | T,
  options?: {
    silent?: boolean;
    operationName?: string;
  },
): Promise<T> {
  const deviceInfo = detectVirtualDevice();
  const operation = options?.operationName ?? 'native operation';

  if (deviceInfo.isPhysical) {
    return nativeFn();
  }

  try {
    return await nativeFn();
  } catch (error) {
    if (!options?.silent) {
      console.warn(
        `[deviceDetector] ${operation} failed on ${deviceInfo.deviceType}, falling back:`,
        error,
      );
    }
    return await fallbackFn();
  }
}

export function isNativeModuleAvailable(moduleName: string): boolean {
  try {
    const mod = NativeModules[moduleName];
    return mod !== null && mod !== undefined;
  } catch {
    return false;
  }
}

export function getVirtualDeviceLLMParams(): {
  nThreads: number;
  nGpuLayers: number;
  useMlock: boolean;
  maxTokens: number;
  timeoutMs: number;
} {
  const deviceInfo = detectVirtualDevice();

  if (!deviceInfo.isVirtual) {
    return {
      nThreads: 4,
      nGpuLayers: -1,
      useMlock: true,
      maxTokens: 400,
      timeoutMs: 30000 };
  }

  return {
    nThreads: 2,
    nGpuLayers: 0,
    useMlock: false,
    maxTokens: 256,
    timeoutMs: 60000 };
}

export function clearDeviceCache(): void {
  cachedDeviceInfo = null;
}

export default {
  detectVirtualDevice,
  safeNativeCall,
  isNativeModuleAvailable,
  getVirtualDeviceLLMParams,
  clearDeviceCache };
