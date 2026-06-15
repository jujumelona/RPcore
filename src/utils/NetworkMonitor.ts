/* eslint-disable @typescript-eslint/no-unused-vars */
// src/utils/NetworkMonitor.ts
// ═══════════════════════════════════════════════════════════════════
// 네트워크 상태 모니터링 — @react-native-community/netinfo
//
//  제공 기능:
//   ✅ 온라인/오프라인 상태 추적
//   ✅ 연결 타입 (WiFi / Cellular / None)
//   ✅ 대용량 다운로드 전 WiFi 여부 확인
//   ✅ 오프라인 전환 시 진행 중 다운로드 일시중지 이벤트 발행
//   ✅ React Hook: useNetworkStatus()
// ═══════════════════════════════════════════════════════════════════

import NetInfo, {
  NetInfoState,
  NetInfoSubscription } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

// ── 타입 ──────────────────────────────────────────────────────────

export type ConnectionType = 'wifi' | 'cellular' | 'none' | 'unknown';

export interface NetworkStatus {
  isConnected: boolean;
  isWifi: boolean;
  isCellular: boolean;
  connectionType: ConnectionType;
  /** WiFi이거나 셀룰러 강도가 충분할 때 true */
  isGoodForDownload: boolean;
}

type NetworkListener = (status: NetworkStatus) => void;

// ── 유틸 ─────────────────────────────────────────────────────────

function mapState(state: NetInfoState): NetworkStatus {
  const connected = state.isConnected ?? false;
  const type = state.type;
  let connectionType: ConnectionType = 'unknown';

  if (!connected || type === 'none') connectionType = 'none';
  else if (type === 'wifi')         connectionType = 'wifi';
  else if (type === 'cellular')     connectionType = 'cellular';

  return {
    isConnected:       connected,
    isWifi:            connectionType === 'wifi',
    isCellular:        connectionType === 'cellular',
    connectionType,
    /** 2GB+ 모델 다운로드: WiFi 권장, 셀룰러면 경고 표시용 */
    isGoodForDownload: connectionType === 'wifi' };
}

// ── NetworkMonitor 클래스 ──────────────────────────────────────────

class NetworkMonitor {
  private _status: NetworkStatus = {
    isConnected:       true,
    isWifi:            false,
    isCellular:        false,
    connectionType:    'unknown',
    isGoodForDownload: false };
  private _listeners  = new Set<NetworkListener>();
  private _sub:        NetInfoSubscription | null = null;
  private _initialized = false;

  /** 앱 시작 시 1회 호출 (AppNavigator 또는 App.tsx) */
  start(): void {
    if (this._initialized) return;
    this._initialized = true;

    // 즉시 현재 상태 fetch
    NetInfo.fetch().then(state => {
      this._status = mapState(state);
      this._emit();
    });

    // 변화 구독
    this._sub = NetInfo.addEventListener(state => {
      const prev = this._status;
      this._status = mapState(state);

      // ✅ [FIX #10] 오프라인 전환 이벤트가 두 개의 독립 if 블록으로 분리되어
      // console.warn + Analytics 로그가 각각 별도 조건 체크로 실행됨.
      // 논리는 동일하므로 하나의 if/else-if 체인으로 병합.
      if (prev.isConnected && !this._status.isConnected) {
        // 오프라인 전환
        console.warn('[NetworkMonitor] 오프라인 전환 — 다운로드 중이라면 일시중지 권장');
        try {
          const { AnalyticsService, EVENT } = require('../services/AnalyticsService');
          AnalyticsService.logEvent(EVENT.OFFLINE_DETECTED);
        } catch {}
      } else if (!prev.isConnected && this._status.isConnected) {
        // 온라인 복귀
        if (__DEV__) console.log('[NetworkMonitor] ✅ 온라인 복귀');
        try {
          const { AnalyticsService, EVENT } = require('../services/AnalyticsService');
          AnalyticsService.logEvent(EVENT.ONLINE_RESTORED);
        } catch {}
      }

      this._emit();
    });
  }

  stop(): void {
    this._sub?.();
    this._sub = null;
    this._initialized = false;
  }

  getStatus(): NetworkStatus {
    return this._status;
  }

  /**
   * 대용량 다운로드 전 확인용
   * @returns null이면 OK, string이면 경고 메시지
   */
  getDownloadWarning(fileSizeMB: number): string | null {
    if (!this._status.isConnected) {
      return 'No network connection.';
    }
    if (this._status.isCellular && fileSizeMB > 200) {
      return `Downloading ${fileSizeMB}MB over mobile data may incur charges. WiFi is recommended.`;
    }
    return null;
  }

  /** 연결 복귀까지 대기 (타임아웃 선택적) */
  async waitForConnection(timeoutMs = 30_000): Promise<boolean> {
    if (!this._initialized) this.start();
    
    // 즉시 현재 상태 확인 (fetch 완료 대기)
    const state = await NetInfo.fetch();
    this._status = mapState(state);
    if (this._status.isConnected) return true;

    return new Promise(resolve => {
      let resolved = false;
      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        unsub();
        resolve(false);
      }, timeoutMs);

      const unsub = this.addListener(status => {
        if (status.isConnected && !resolved) {
          resolved = true;
          clearTimeout(timer);
          unsub();
          resolve(true);
        }
      });
    });
  }

  addListener(fn: NetworkListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  private _emit(): void {
    this._listeners.forEach(fn => fn(this._status));
  }
}

let _networkMonitorInstance: NetworkMonitor | null = null;
function getNetworkMonitorInstance(): NetworkMonitor {
  if (!_networkMonitorInstance) _networkMonitorInstance = new NetworkMonitor();
  return _networkMonitorInstance;
}
export const networkMonitor = new Proxy({} as NetworkMonitor, {
  get(_t, p) { return (getNetworkMonitorInstance() as unknown as Record<string|symbol, unknown>)[p as string]; },
  set(_t, p, v) { (getNetworkMonitorInstance() as unknown as Record<string|symbol, unknown>)[p as string] = v; return true; } });
export default networkMonitor;

// ── React Hook ────────────────────────────────────────────────────

/**
 * 네트워크 상태를 실시간으로 구독하는 훅
 *
 * @example
 * const { isConnected, isWifi, getDownloadWarning } = useNetworkStatus();
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState<NetworkStatus>(
    networkMonitor.getStatus(),
  );

  useEffect(() => {
    const unsub = networkMonitor.addListener(setStatus);
    // 마운트 시 최신 상태로 즉시 동기화
    setStatus(networkMonitor.getStatus());
    return unsub;
  }, []);

  return {
    ...status,
    getDownloadWarning: (sizeMB: number) =>
      networkMonitor.getDownloadWarning(sizeMB) };
}
