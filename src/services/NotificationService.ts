/* eslint-disable @typescript-eslint/no-unused-vars */
// src/services/NotificationService.ts
// ═══════════════════════════════════════════════════════════════════
// Firebase Messaging + Notifee 통합 알림 서비스 (Android 전용)
//
//  기능:
//   ✅ FCM 토큰 발급 및 서버 등록
//   ✅ 포그라운드 알림 (Notifee 고급 채널)
//   ✅ 백그라운드 / 종료 상태 알림 처리
//   ✅ 알림 탭 → 화면 딥링크 자동 이동
//   ✅ 채팅 메시지 알림 채널 (진동 패턴 + 소리)
//   ✅ 공지 알림 채널 (조용한 채널)
//   ✅ 권한 요청 흐름 (Android 13+)
//   ✅ [NEW] FCM 토큰 + 언어 코드 서버 동기화
//   ✅ [NEW] 언어 변경 시 자동 FCM 토픽 재구독 + 서버 업데이트
//   ✅ [NEW] 공지사항 FCM 토픽 구독 (announce_${lang})
// ═══════════════════════════════════════════════════════════════════

import { getMessaging,
  getToken,
  onTokenRefresh,
  onMessage,
  subscribeToTopic,
  unsubscribeFromTopic,
  requestPermission,
  getInitialNotification,
  AuthorizationStatus,
  FirebaseMessagingTypes } from '@react-native-firebase/messaging';
let _fcmI: ReturnType<typeof getMessaging> | null = null;
const _fcm = () => { if (!_fcmI) _fcmI = getMessaging(); return _fcmI; };
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidColor,
  EventType,
  Event,
  Notification } from '@notifee/react-native';
import { Platform } from 'react-native';
import { navigationRef } from '../navigation/navigationRef';
import { mmkv } from '../utils/storage';
import { SERVER_BASE } from '../config/ApiConfig';
import { LanguageCode } from '../i18n/languages';

// ── 채널 ID ───────────────────────────────────────────────────────

const CHANNEL_CHAT      = 'rp_chat';
const CHANNEL_STORY     = 'rp_story';
const CHANNEL_ANNOUNCE  = 'rp_announce';
const CHANNEL_SYSTEM    = 'rp_system';

// ── 저장 키 ───────────────────────────────────────────────────────
const FCM_TOKEN_KEY      = 'fcm_token';
const FCM_LANG_KEY       = 'fcm_lang_synced';   // 마지막으로 서버에 동기화한 언어

// ── 타입 ──────────────────────────────────────────────────────────

export interface PushPayload {
  type:     'chat' | 'story_update' | 'story_approved' | 'story_rejected' | 'new_story' | 'announcement' | 'system' | 'model_switch_required';
  title:    string;
  body:     string;
  imageUrl?: string;
  data?: {
    storyId?:        string;
    conversationId?: string;
    targetScreen?:   string;
    rejectReason?:   string;
    announcementId?: string;
    currentModelId?: string;
    requiredModelId?: string;
    [key: string]:   string | undefined;
  };
}

// ── 모델 전환 필요 알림 메시지 (15개국어) ─────────────────────────────
export const MODEL_SWITCH_MESSAGES: Record<string, { title: string; body: (model: string) => string }> = {
  en:    { title: 'Model Change Required', body: (m) => `This story requires "${m}" model. Please select it to continue.` },
  es:    { title: 'Cambio de Modelo Requerido', body: (m) => `Esta historia requiere el modelo "${m}". Por favor, selecciónalo para continuar.` },
  pt:    { title: 'Mudança de Modelo Necessária', body: (m) => `Esta história requer o modelo "${m}". Por favor, selecione-o para continuar.` },
  fr:    { title: 'Changement de Modèle Requis', body: (m) => `Cette histoire nécessite le modèle "${m}". Veuillez le sélectionner pour continuer.` },
  de:    { title: 'Modellwechsel Erforderlich', body: (m) => `Diese Geschichte erfordert das Modell "${m}". Bitte wählen Sie es aus, um fortzufahren.` },
  it:    { title: 'Cambio Modello Richiesto', body: (m) => `Questa storia richiede il modello "${m}". Per favore, selezionalo per continuare.` },
  ru:    { title: 'Требуется Смена Модели', body: (m) => `Для этой истории требуется модель "${m}". Пожалуйста, выберите её, чтобы продолжить.` },
  ko:    { title: '모델 변경 필요', body: (m) => `이 스토리는 "${m}" 모델이 필요합니다. 계속하려면 해당 모델을 선택해주세요.` },
  ja:    { title: 'モデル変更が必要', body: (m) => `このストーリーには "${m}" モデルが必要です。続行するには選択してください。` },
  'zh-CN': { title: '需要切换模型', body: (m) => `此故事需要 "${m}" 模型。请选择它以继续。` },
  'zh-TW': { title: '需要切換模型', body: (m) => `此故事需要 "${m}" 模型。請選擇它以繼續。` },
  th:    { title: 'ต้องเปลี่ยนโมเดล', body: (m) => `เรื่องนี้ต้องการโมเดล "${m}" กรุณาเลือกเพื่อดำเนินต่อ` },
  tr:    { title: 'Model Değişimi Gerekli', body: (m) => `Bu hikaye "${m}" modelini gerektirir. Devam etmek için lütfen seçin.` },
  hi:    { title: 'मॉडल परिवर्तन आवश्यक', body: (m) => `इस कहानी के लिए "${m}" मॉडल आवश्यक है। जारी रखने के लिए कृपया चुनें।` },
  ar:    { title: 'تغيير النموذج مطلوب', body: (m) => `يتطلب هذا القصة النموذج "${m}". يرجى تحديده للمتابعة.` },
};

// ── 내부 유틸 ─────────────────────────────────────────────────────

function resolveChannelId(type: PushPayload['type']): string {
  switch (type) {
    case 'chat':             return CHANNEL_CHAT;
    case 'story_update':
    case 'story_approved':
    case 'story_rejected':
    case 'new_story':        return CHANNEL_STORY;
    case 'announcement':     return CHANNEL_ANNOUNCE;
    case 'model_switch_required': return CHANNEL_SYSTEM;
    default:                 return CHANNEL_SYSTEM;
  }
}

async function navigateFromPayload(data?: PushPayload['data']): Promise<void> {
  if (!data || !navigationRef.isReady()) return;
  try {
    const { targetScreen, storyId } = data;

    if ((targetScreen === 'Chat' || targetScreen === 'StoryDetail') && storyId) {
      // Story 전체 객체를 fetch 후 navigate — storyId만 전달하면 화면에서 story가 undefined
      const { StoryAPI } = await import('../api/StoryAPI');
      // ✅ [BUG FIX] lang 파라미터 없음 → 푸시 탭 시 원문 스토리로 이동
      const { useLanguageStore: _ls } = await import('../store/languageStore');
      const _lang = _ls.getState().appLanguage;
      const story = await StoryAPI.getStory(storyId, _lang || undefined);
      if (!story) {
        console.warn('[NotificationService] story fetch 실패 — storyId:', storyId);
        return;
      }
      if (targetScreen === 'Chat') {
        navigationRef.navigate('Chat', { story });
      } else {
        navigationRef.navigate('StoryDetail', { story });
      }
    } else if (targetScreen === 'StoryEditor' && storyId) {
      // StoryEditor: storyId를 prefill로 전달해 기존 스토리 편집 화면 진입
      navigationRef.navigate('StoryEditor', { storyId });
    } else if (targetScreen === 'Notifications') {
      navigationRef.navigate('Notifications');
    }
  } catch (e) {
    console.warn('[NotificationService] 네비게이션 실패:', e);
  }
}

// ── NotificationService ───────────────────────────────────────────

class NotificationService {
  private _initialized      = false;
  private _onServerRegister?: (token: string, lang: string) => Promise<void>;
  private _getAuthToken?:    () => string | undefined;
  private _unsubscribers:   (() => void)[] = [];
  private _initNavTimers:   ReturnType<typeof setTimeout>[] = [];

  /**
   * 앱 시작 시 1회 호출
   * @param onServerRegister FCM 토큰 + 언어를 서버에 등록하는 콜백
   * @param getAuthToken     현재 JWT 토큰 반환 함수 (없으면 내부 직접 호출 생략)
   */
  async initialize(
    onServerRegister?: (token: string, lang: string) => Promise<void>,
    getAuthToken?:     () => string | undefined,
  ): Promise<void> {
    if (this._initialized) return;
    this._initialized      = true;
    this._onServerRegister = onServerRegister;
    this._getAuthToken     = getAuthToken;

    await this._createChannels();

    const granted = await this._requestPermission();
    if (!granted) {
      console.warn('[NotificationService] 알림 권한 미허용');
      return;
    }

    await this._registerToken();

    // 토큰 갱신 리스너
    const unsubTokenRefresh = onTokenRefresh(_fcm(), async token => {
      mmkv.set(FCM_TOKEN_KEY, token);
      const lang = this._getCurrentLang();
      await this._onServerRegister?.(token, lang);
      await this._syncPushToken(token, lang);
    });
    this._unsubscribers.push(unsubTokenRefresh);

    // 포그라운드 FCM
    const unsubForeground = onMessage(_fcm(), async remote => {
      await this._handleForeground(remote);
    });
    this._unsubscribers.push(unsubForeground);

    // Notifee 이벤트
    const unsubNotifee = notifee.onForegroundEvent((event: Event) => {
      this._handleNotifeeEvent(event);
    });
    this._unsubscribers.push(unsubNotifee);

    await this._handleInitialNotification();
  }

  /** 언어 변경 시 호출 — 토픽 재구독 + 서버 언어 업데이트 */
  async onLanguageChanged(newLang: LanguageCode): Promise<void> {
    const prevLang = mmkv.getString(FCM_LANG_KEY) as LanguageCode | undefined;

    // 이전 언어 토픽 구독 해제
    if (prevLang && prevLang !== newLang) {
      try {
        await unsubscribeFromTopic(_fcm(), `announce_${prevLang}`);
      } catch {}
    }

    // 새 언어 토픽 구독
    try {
      await subscribeToTopic(_fcm(), `announce_${newLang}`);
      mmkv.set(FCM_LANG_KEY, newLang);
    } catch (e) {
      console.warn('[NotificationService] 토픽 구독 실패:', e);
    }

    // 서버 업데이트
    const token = mmkv.getString(FCM_TOKEN_KEY);
    if (token) {
      await this._syncPushToken(token, newLang);
    }
  }

  /** 앱 종료 / 언마운트 시 정리 */
  destroy(): void {
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers = [];
    this._initialized   = false;
    this._initNavTimers.forEach(id => clearTimeout(id));
    this._initNavTimers = [];
  }

  /** 로컬 알림 직접 발행 */
  async displayLocal(payload: PushPayload): Promise<void> {
    const channelId = resolveChannelId(payload.type);
    await notifee.displayNotification({
      title: payload.title,
      body:  payload.body,
      data:  payload.data as Record<string, any>,
      android: {
        channelId,
        importance:        AndroidImportance.HIGH,
        smallIcon:         'ic_launcher_foreground',  // Lucide 아이콘 사용
        largeIcon:         payload.imageUrl,
        color:             AndroidColor.PURPLE,
        circularLargeIcon: true } });
  }

  /** 현재 FCM 토큰 반환 */
  getToken(): string | undefined {
    return mmkv.getString(FCM_TOKEN_KEY) ?? undefined;
  }

  // ── 내부 메서드 ──────────────────────────────────────────────────

  private async _createChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await notifee.createChannels([
      {
        id:               CHANNEL_CHAT,
        name:             '채팅 메시지',
        importance:       AndroidImportance.HIGH,
        visibility:       AndroidVisibility.PUBLIC,
        vibration:        true,
        vibrationPattern: [300, 250, 300, 250],
        sound:            'default',
        description:      '새 채팅 메시지 알림' },
      {
        id:          CHANNEL_STORY,
        name:        '스토리 업데이트',
        importance:  AndroidImportance.DEFAULT,
        visibility:  AndroidVisibility.PUBLIC,
        sound:       'default',
        description: 'New chapter and story update notifications' },
      {
        id:          CHANNEL_ANNOUNCE,
        name:        'Announcements',
        importance:  AndroidImportance.LOW,
        visibility:  AndroidVisibility.PUBLIC,
        vibration:   false,
        description: 'Service announcement notifications' },
      {
        id:          CHANNEL_SYSTEM,
        name:        'System',
        importance:  AndroidImportance.DEFAULT,
        visibility:  AndroidVisibility.PRIVATE,
        description: 'Account and system notifications' },
    ]);
  }

  private async _requestPermission(): Promise<boolean> {
    const auth = await requestPermission(_fcm());
    return (
      auth === AuthorizationStatus.AUTHORIZED ||
      auth === AuthorizationStatus.PROVISIONAL
    );
  }

  private async _registerToken(): Promise<void> {
    try {
      const token = await getToken(_fcm());
      const prev  = mmkv.getString(FCM_TOKEN_KEY);
      const lang  = this._getCurrentLang();
      const syncedLang = mmkv.getString(FCM_LANG_KEY);

      if (token !== prev) {
        // 토큰 변경: 저장 + 서버 동기화 (1회만)
        mmkv.set(FCM_TOKEN_KEY, token);
        await this._onServerRegister?.(token, lang);
        await this._syncPushToken(token, lang);
      } else if (syncedLang !== lang) {
        // 토큰 동일, 언어만 변경: 서버 동기화 (1회만)
        // ✅ [BUG FIX] 기존: 토큰 변경 경로에서 _syncPushToken 후 토픽 구독 경로에서 또 _syncPushToken 호출
        await this._syncPushToken(token, lang);
      }

      // 공지사항 토픽 구독 (최초 1회 or 언어 변경 시)
      // ✅ [BUG FIX] _syncPushToken이 이미 FCM_LANG_KEY를 갱신하므로 토픽 구독만 처리
      if (!syncedLang || syncedLang !== lang) {
        try {
          if (syncedLang) await unsubscribeFromTopic(_fcm(), `announce_${syncedLang}`);
          await subscribeToTopic(_fcm(), `announce_${lang}`);
          // _syncPushToken이 아직 호출 안 된 경우(토큰 동일 + 언어 동일)를 위해 여기서도 갱신
          mmkv.set(FCM_LANG_KEY, lang);
        } catch (e) {
          console.warn('[NotificationService] 토픽 초기 구독 실패:', e);
        }
      }
    } catch (e) {
      console.error('[NotificationService] 토큰 발급 실패:', e);
    }
  }

  /**
   * POST /user/push-token 으로 FCM 토큰 + 언어 서버 동기화
   * auth token이 없으면 onServerRegister 콜백에만 의존
   */
  private async _syncPushToken(token: string, lang: string): Promise<void> {
    const authToken = this._getAuthToken?.();
    if (!authToken) return;
    try {
      await fetch(`${SERVER_BASE}/user/push-token`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ fcmToken: token, lang }) });
      mmkv.set(FCM_LANG_KEY, lang);
    } catch (e) {
      console.warn('[NotificationService] push-token 동기화 실패:', e);
    }
  }

  /** zustand 의존 없이 현재 언어 반환 (동기적으로 store 접근) */
  private _getCurrentLang(): string {
    try {
      // lazy import — 순환 의존 방지
      const { useLanguageStore } = require('../store/languageStore');
      return useLanguageStore.getState().currentLanguage ?? 'en';
    } catch {
      return 'en';
    }
  }

  private async _handleForeground(
    remote: FirebaseMessagingTypes.RemoteMessage,
  ): Promise<void> {
    const { notification, data } = remote;
    if (!notification?.title) return;

    const type = (data?.type as PushPayload['type']) ?? 'system';
    await this.displayLocal({
      type,
      title:    notification.title,
      body:     notification.body ?? '',
      imageUrl: notification.android?.imageUrl,
      data:     data as PushPayload['data'] });
  }

  private _handleNotifeeEvent(event: Event): void {
    const { type, detail } = event;
    if (type === EventType.PRESS) {
      const data = detail.notification?.data as PushPayload['data'];
      // eslint-disable-next-line no-void
      void navigateFromPayload(data);
      notifee.getBadgeCount().then(c => {
        if (c > 0) notifee.setBadgeCount(c - 1);
      });
    }
  }

  private async _handleInitialNotification(): Promise<void> {
    // [BUG FIX] FCM과 Notifee 양쪽 모두 initialNotification을 체크하면
    // 같은 알림이 두 곳 모두에 저장돼 navigateFromPayload가 2번 실행될 수 있음.
    // FCM을 먼저 확인하고, 없을 때만 Notifee를 확인 (early return 유지).
    const remoteMsg = await getInitialNotification(_fcm());
    if (remoteMsg?.data) {
      const t = setTimeout(() => {
        // eslint-disable-next-line no-void
        void navigateFromPayload(remoteMsg.data as PushPayload['data']);
      }, 1000);
      this._initNavTimers.push(t);
      // FCM에서 처리했으면 Notifee 확인 생략 — 중복 네비게이션 방지
      return;
    }

    const notifeeNotif: Notification | null =
      await notifee.getInitialNotification()
        .then(r => r?.notification ?? null)
        .catch(() => null);

    if (notifeeNotif?.data) {
      const t = setTimeout(() => {
        // eslint-disable-next-line no-void
        void navigateFromPayload(notifeeNotif.data as PushPayload['data']);
      }, 1000);
      this._initNavTimers.push(t);
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;

// ════════════════════════════════════════════════════════════════
// App.tsx 또는 AppNavigator.tsx 사용 예시
// ════════════════════════════════════════════════════════════════
//
// import notificationService from './NotificationService';
// import { useAuthStore } from '../store/authStore';       // JWT 토큰 store
// import { useLanguageStore } from '../store/languageStore';
//
// // (1) 앱 시작 시 초기화
// await notificationService.initialize(
//   async (token, lang) => {
//     // onServerRegister 콜백 — 여기서 서버 등록 (백업용)
//     // _syncPushToken 이 직접 처리하지만, 추가 로직 있으면 여기에
//     console.log('[App] FCM token registered, lang:', lang);
//   },
//   () => useAuthStore.getState().accessToken,   // getAuthToken
// );
//
// // (2) 언어 변경 시 (MyPageScreen 등 언어 설정 변경 후 호출)
// await notificationService.onLanguageChanged(newLang);
//
// ════════════════════════════════════════════════════════════════
// index.js 백그라운드 핸들러 (변경 없음, 그대로 유지)
// ════════════════════════════════════════════════════════════════
//
//  messaging.setBackgroundMessageHandler(async remoteMessage => {
//    const { notification, data } = remoteMessage;
//    if (!notification?.title) return;
//    await notifee.displayNotification({
//      title: notification.title,
//      body:  notification.body or '',
//      data:  data as Record<string, string>,
//      android: { channelId: 'rp_story', importance: AndroidImportance.HIGH },
//    });
//  });
