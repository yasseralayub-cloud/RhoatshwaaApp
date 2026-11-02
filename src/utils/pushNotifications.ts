import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface NotificationState {
  isSupported: boolean;
  isNative: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'default';
  token?: string;
}

const ORDERS_CHANNEL_ID = 'rehla_orders_channel';

/**
 * Ensures notification channels exist on Android (API 26+)
 */
export async function setupNotificationChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: ORDERS_CHANNEL_ID,
      name: 'تحديثات طلبات رحلة شواء',
      description: 'إشعارات فورية لتأكيد الطلب وتحديثات المطبخ وموقع المندوب',
      importance: 5, // High importance (heads-up banner)
      visibility: 1, // Public on lockscreen
      sound: 'beep.wav',
      vibration: true,
      lights: true,
      lightColor: '#eab308'
    });
  } catch (err) {
    console.warn('Notification channel setup warning:', err);
  }
}

/**
 * Checks current notification permission without prompting
 */
export async function checkNotificationPermission(): Promise<'granted' | 'denied' | 'prompt' | 'default'> {
  if (Capacitor.isNativePlatform()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return 'granted';
      if (status.display === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'prompt';
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    return Notification.permission as any;
  }

  return 'default';
}

/**
 * Requests POST_NOTIFICATIONS permission compliant with Android 13+ and iOS.
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied'> {
  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotificationChannels();
      const status = await LocalNotifications.requestPermissions();
      if (status.display === 'granted') {
        // Also register PushNotifications for FCM token reception
        try {
          const pushStatus = await PushNotifications.requestPermissions();
          if (pushStatus.receive === 'granted') {
            await PushNotifications.register();
          }
        } catch (e) {
          console.warn('Push registration follow-up:', e);
        }
        return 'granted';
      }
      return 'denied';
    } catch (err) {
      console.warn('Native permission request error:', err);
      return 'denied';
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const result = await Notification.requestPermission();
      return result === 'granted' ? 'granted' : 'denied';
    } catch (e) {
      console.warn('Web notification permission error:', e);
      return 'denied';
    }
  }

  return 'denied';
}

/**
 * Triggers a real system-level notification (appears in system notification shade/tray).
 * Verifies true permission before firing.
 */
export async function triggerRealTestNotification(): Promise<{
  success: boolean;
  message: string;
  isNative: boolean;
}> {
  const isNative = Capacitor.isNativePlatform();

  // 1. Verify or prompt for permission
  const perm = await requestNotificationPermission();
  if (perm !== 'granted') {
    return {
      success: false,
      isNative,
      message: 'تم رفض إذن الإشعارات من إعدادات النظام. يرجى تفعيل الإشعارات للتطبيق من إعدادات الهاتف لتصلك التنبيهات.'
    };
  }

  // 2. Fire real notification
  if (isNative) {
    try {
      await setupNotificationChannels();
      const notifId = Math.floor(Date.now() % 100000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: '🍗 رحلة شواء - فحص إشعار النظام',
            body: 'إشعار تجريبي ناجح! تم تفعيل إشعارات التطبيق الرسمية وستصلك تنبيهات الطلبات والمندوب فورياً.',
            channelId: ORDERS_CHANNEL_ID,
            smallIcon: 'ic_stat_name',
            schedule: { at: new Date(Date.now() + 500) }
          }
        ]
      });

      return {
        success: true,
        isNative: true,
        message: 'تم إرسال إشعار حقيقي إلى شريط إشعارات الهاتف بنجاح! اسحب الشاشة من الأعلى لمشاهدته.'
      };
    } catch (nativeErr: any) {
      console.error('LocalNotifications schedule error:', nativeErr);
      return {
        success: false,
        isNative: true,
        message: `تعذر جدولة الإشعار على النظام: ${nativeErr?.message || 'خطأ غير معروف'}`
      };
    }
  }

  // Web Browser / PWA Notification
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      new Notification('🍗 رحلة شواء - فحص إشعار المتصفح', {
        body: 'تم تفعيل إشعارات المتصفح بنجاح! ستصلك تنبيهات طلباتك أولاً بأول.',
        icon: '/pwa-icon.jpg',
        badge: '/pwa-icon.jpg'
      });
      return {
        success: true,
        isNative: false,
        message: 'تم إرسال إشعار المتصفح بنجاح إلى مركز إشعارات نظامك.'
      };
    } catch (webErr: any) {
      console.warn('Web notification display error:', webErr);
      return {
        success: false,
        isNative: false,
        message: 'المتصفح منع إظهار الإشعار. تأكد من تفعيل الإشعارات في إعدادات المتصفح.'
      };
    }
  }

  return {
    success: false,
    isNative: false,
    message: 'جهازك أو متصفحك الحالي لا يدعم ميزة الإشعارات.'
  };
}

/**
 * Dispatches an order status change notification directly to the device tray
 */
export async function sendOrderTrayNotification(orderId: string, statusText: string, note?: string): Promise<void> {
  const perm = await checkNotificationPermission();
  if (perm !== 'granted') return;

  const title = `🍗 طلبك #${orderId.slice(-4)}`;
  const body = note ? `${statusText} - ${note}` : `حالة طلبك الحالية: ${statusText}`;

  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotificationChannels();
      const notifId = Math.floor(Date.now() % 100000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title,
            body,
            channelId: ORDERS_CHANNEL_ID,
            smallIcon: 'ic_stat_name',
            schedule: { at: new Date(Date.now() + 100) }
          }
        ]
      });
    } catch (e) {
      console.warn('Failed to send order tray notification:', e);
    }
  } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/pwa-icon.jpg',
        badge: '/pwa-icon.jpg'
      });
    } catch (e) {
      console.warn('Failed to send web order notification:', e);
    }
  }
}

/**
 * Initializes push notifications (FCM) listeners if native
 */
export async function initializePushNotifications(options?: {
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  onNotificationActionPerformed?: (action: ActionPerformed) => void;
}): Promise<NotificationState> {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      await setupNotificationChannels();
      let permStatus = await PushNotifications.checkPermissions();

      if (permStatus.receive === 'prompt' || permStatus.receive === 'prompt-with-rationale') {
        permStatus = await PushNotifications.requestPermissions();
      }

      if (permStatus.receive === 'granted') {
        await PushNotifications.register();

        PushNotifications.addListener('registration', (token: Token) => {
          console.log('FCM Device Token registered:', token.value);
          localStorage.setItem('fcm_push_token', token.value);
        });

        PushNotifications.addListener('registrationError', (error: any) => {
          console.warn('FCM registration error:', error);
        });

        if (options?.onNotificationReceived) {
          PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
            options.onNotificationReceived!(notification);
          });
        }

        if (options?.onNotificationActionPerformed) {
          PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
            options.onNotificationActionPerformed!(action);
          });
        }

        return {
          isSupported: true,
          isNative: true,
          permission: 'granted',
          token: localStorage.getItem('fcm_push_token') || undefined
        };
      }

      return {
        isSupported: true,
        isNative: true,
        permission: permStatus.receive as any
      };
    } catch (err) {
      console.warn('Capacitor Push Notifications initialization warning:', err);
      return {
        isSupported: false,
        isNative: true,
        permission: 'denied'
      };
    }
  }

  // Graceful fallback for web browser / PWA
  if (typeof window !== 'undefined' && 'Notification' in window) {
    return {
      isSupported: true,
      isNative: false,
      permission: Notification.permission as any
    };
  }

  return {
    isSupported: false,
    isNative: false,
    permission: 'default'
  };
}
