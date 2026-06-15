import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import i18n from '../core/i18n';
import { navigationRef } from '../navigation/navigationRef';

/**
 * 🚀 글로벌 15개국어 적용 푸시 알림 코어 서비스
 * (Firebase Messaging + Notifee 오픈소스 통합본)
 * ✅ 딥링크 라우팅 완전 연동
 */
class PushNotificationService {
  /** 딥링크 대기열 — 앱 부팅 전 수신된 백그라운드 딥링크 임시 저장 */
  private _pendingDeepLink: { screen: string; params?: Record<string, unknown> } | null = null;

  get pendingDeepLink() {
    const link = this._pendingDeepLink;
    this._pendingDeepLink = null;
    return link;
  }

  /**
   * 알림 권한 및 채널 초기화 (안드로이드/iOS)
   */
  async initialize() {
    await messaging().requestPermission();
    
    // Notifee 안드로이드 채널 셋업 (프리미엄 알림을 위한 커스텀 진동/소리)
    await notifee.createChannel({
      id: 'default_channel',
      name: 'Default Channel',
      importance: AndroidImportance.HIGH,
    });

    // Foreground(앱 내부) 수신 시 Notifee를 통해 OS 알림으로 띄워주기
    messaging().onMessage(async remoteMessage => {
      await this.displayLocalNotification(remoteMessage);
    });

    // Background 리스너 등록
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      await this.displayLocalNotification(remoteMessage);
    });
  }

  /**
   * 💡 수신된 키(Key)를 15개국어로 번역하여 단말기 화면 밖으로 던지는 렌더러
   */
  async displayLocalNotification(remoteMessage: any) {
    const { data } = remoteMessage;

    if (!data || !data.type) return;

    // 15개국어 i18n 엔진으로 현재 유저의 설정 언어에 맞게 텍스트 파싱
    const params = data.params ? JSON.parse(data.params) : {};
    const title = String(i18n.t('push_system_event', { defaultValue: 'Check out the new system event!' }));
    const body = String(
      i18n.t(data.type, {
        ...params,
        defaultValue: title,
      }),
    );

    // 실제 OS 화면에 뿌려질 노티피 모듈 (UI/UX 커스텀 지원)
    await notifee.displayNotification({
      title: `✨ ${title}`,
      body: body,
      data: data, // ✅ 딥링크 데이터 전달
      android: {
        channelId: 'default_channel',
        smallIcon: 'ic_launcher',
        pressAction: {
          id: 'default',
        },
        actions: [
          {
            title: String(i18n.t('action_read', { defaultValue: 'Read Now' })),
            pressAction: { id: 'read_action' },
          },
          {
            title: String(i18n.t('action_dismiss', { defaultValue: 'Dismiss' })),
            pressAction: { id: 'dismiss_action' },
          }
        ]
      },
    });
  }

  /**
   * ✅ 딥링크 라우팅 — 알림 데이터에서 화면/파라미터를 추출하여 네비게이션 실행
   */
  navigateFromNotification(data: Record<string, any> | undefined) {
    if (!data?.type) return;

    if (!navigationRef.isReady()) {
      // 네비게이션 준비 안 됨 → 대기열에 저장 (앱 부팅 후 처리)
      this._pendingDeepLink = this.resolveRoute(data);
      return;
    }

    const route = this.resolveRoute(data);
    if (route) {
      (navigationRef as any).navigate(route.screen, route.params);
    }
  }

  /** 알림 타입 → 화면/파라미터 매핑 */
  private resolveRoute(data: Record<string, any>): { screen: string; params?: Record<string, unknown> } | null {
    switch (data.type) {
      case 'push_new_chapter':
        return {
          screen: 'WebNovelReader',
          params: { novelId: data.novelId, source: 'community' as const },
        };
      case 'push_chat_message':
        return {
          screen: 'Conversations',
          params: undefined,
        };
      case 'push_like':
      case 'push_follow':
        return {
          screen: 'Notifications',
          params: undefined,
        };
      case 'push_announcement':
        return {
          screen: 'Notifications',
          params: undefined,
        };
      default:
        return null;
    }
  }
}

const pushService = new PushNotificationService();

// ✅ OS 백그라운드에서 유저가 푸시 알림의 액션(읽기 등)을 눌렀을 때 라우팅 핸들러
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'read_action') {
    const data = detail.notification?.data as Record<string, any> | undefined;
    pushService.navigateFromNotification(data);
  }
  // 기본 탭 → 알림 자체 화면으로 라우팅
  if (type === EventType.PRESS) {
    const data = detail.notification?.data as Record<string, any> | undefined;
    pushService.navigateFromNotification(data);
  }
});

// ✅ 앱이 열려있는 상태에서 액션을 눌렀을 때의 핸들러
notifee.onForegroundEvent(({ type, detail }) => {
  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'read_action') {
    const data = detail.notification?.data as Record<string, any> | undefined;
    pushService.navigateFromNotification(data);
  }
  if (type === EventType.PRESS) {
    const data = detail.notification?.data as Record<string, any> | undefined;
    pushService.navigateFromNotification(data);
  }
});

export default pushService;
