import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token, ActionPerformed, PushNotificationSchema } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
const API_BASE_URL = Capacitor.isNativePlatform()
  ? 'https://rhoatshwaa-app.vercel.app'
  : '';
let pushListenersInstalled = false;
let pushRegistrationCompleted = false;
let pushRegistrationInFlight: Promise<void> | null = null;
let activePushCallbacks: {
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  onNotificationActionPerformed?: (action: ActionPerformed) => void;
} = {};

export interface NotificationState {
  isSupported: boolean;
  isNative: boolean;
  permission: 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale' | 'default';
  token?: string;
}

const ORDERS_CHANNEL_ID = 'rehla_orders_channel';
/**
 * Registers this device with the server for public promotion notifications.
 * This registration is independent of customer login.
 */
async function registerDeviceToken(token: string): Promise<void> {
  try {
    const platform = Capacitor.getPlatform();

    const response = await fetch(`${API_BASE_URL}/api/push/register-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token,
        platform: platform === 'android' ? 'android' :
                  platform === 'ios' ? 'ios' : 'web'
      })
    });

    if (!response.ok) {
      throw new Error(`Device registration failed: ${response.status}`);
    }

    console.log('Push device registered with server.');
  } catch (error) {
    console.warn('Push server registration warning:', error);
  }
}

export async function attachCustomerPushToken(idToken: string): Promise<void> {
  const token = localStorage.getItem('fcm_push_token');
  if (!token || !idToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/push/attach-customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`Customer association failed: ${response.status}`);
    }

    console.log('Push device associated with customer.');
  } catch (error) {
    console.warn('Customer push association warning:', error);
  }
}
/**
 * Detaches the customer account from this device.
 * Keeps the device token registered for public promotions.
 */
export async function detachCustomerPushToken(idToken: string): Promise<void> {
  const token = localStorage.getItem('fcm_push_token');
  if (!token || !idToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/push/detach-customer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`Customer detachment failed: ${response.status}`);
    }

    console.log('Customer account detached; promotion notifications remain enabled.');
  } catch (error) {
    console.warn('Customer push detachment warning:', error);
  }
}
/**
 * Associates this device with the Firebase-verified driver.
 */
export async function attachDriverPushToken(idToken: string): Promise<void> {
  const token = localStorage.getItem('fcm_push_token');
  if (!token || !idToken) return;

  try {
const response = await fetch(`${API_BASE_URL}/api/push/attach-driver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`Driver association failed: ${response.status}`);
    }

    console.log('Push device associated with verified driver.');
  } catch (error) {
    console.warn('Driver push association warning:', error);
  }
}

/**
 * Detaches the verified driver while preserving public promotion registration.
 */
export async function detachDriverPushToken(idToken: string): Promise<void> {
  const token = localStorage.getItem('fcm_push_token');
  if (!token || !idToken) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/push/detach-driver`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ token })
    });

    if (!response.ok) {
      throw new Error(`Driver detachment failed: ${response.status}`);
    }

    console.log('Driver account detached; public promotions remain enabled.');
  } catch (error) {
    console.warn('Driver push detachment warning:', error);
  }
}
/**
 * Ensures notification channels exist on Android (API 26+)
 */
export async function setupNotificationChannels(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.createChannel({
      id: ORDERS_CHANNEL_ID,
      name: 'تحديثات طلبات رحلة شواء',
      description: 'تنبيهات تأكيد الطلب وتحديث حالته',
      importance: 5, // High importance (heads-up banner)
      visibility: 0, // Keep order details private on the lock screen
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
async function installPushListeners(): Promise<void> {
  if (!Capacitor.isNativePlatform() || pushListenersInstalled) return;

  // Install listeners before register(): Android may emit the token immediately.
  await PushNotifications.addListener('registration', (token: Token) => {
  console.log('FCM device token registered.');

  localStorage.setItem('fcm_push_token', token.value);

  void registerDeviceToken(token.value);
});
  await PushNotifications.addListener('registrationError', (error: any) => {
    console.warn('FCM registration error:', error);
  });
  await PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
    activePushCallbacks.onNotificationReceived?.(notification);
  });
  await PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
    activePushCallbacks.onNotificationActionPerformed?.(action);
  });
  pushListenersInstalled = true;
}

async function registerForPushIfAllowed(requestIfPrompt: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform() || pushRegistrationCompleted) return;
  if (pushRegistrationInFlight) return pushRegistrationInFlight;

  pushRegistrationInFlight = (async () => {
    try {
      let status = await PushNotifications.checkPermissions();
      if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
        if (!requestIfPrompt) return;
        status = await PushNotifications.requestPermissions();
      }
      if (status.receive !== 'granted') return;
      await installPushListeners();
      await PushNotifications.register();
      pushRegistrationCompleted = true;
    } catch (error) {
      console.warn('Push registration warning:', error);
    }
  })();

  try {
    await pushRegistrationInFlight;
  } finally {
    pushRegistrationInFlight = null;
  }
}

/**
 * Requests notification permission only after an explicit user action.
 * The app does not display a permission prompt automatically on launch.
 */

export async function requestNotificationPermission(): Promise<'granted' | 'denied'> {
  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotificationChannels();
      let status = await LocalNotifications.checkPermissions();

      if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
        status = await LocalNotifications.requestPermissions();
      }

      if (status.display !== 'granted') return 'denied';

      await registerForPushIfAllowed(true);
      return 'granted';
    } catch (err) {
      console.warn('Native notification permission request error:', err);
      return 'denied';
    }
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const result = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission;

      return result === 'granted' ? 'granted' : 'denied';
    } catch (error) {
      console.warn('Web notification permission error:', error);
      return 'denied';
    }
  }

  return 'denied';
}

/**
 * Triggers a real system-level notification.
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
      message: 'تم رفض إذن الإشعارات من إعدادات النظام. يُرجى تفعيل الإشعارات للتطبيق من إعدادات الهاتف لتصلك التنبيهات.'
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
            title: '🔔 رحلة شواء - فحص إشعار النظام',
            body: 'هذا إشعار تجريبي للتأكد من أن التطبيق يستطيع عرض إشعارات النظام على جهازك.',
            channelId: ORDERS_CHANNEL_ID,
            smallIcon: 'ic_stat_name',
            schedule: { at: new Date(Date.now() + 500) }
          }
        ]
      });

      return {
        success: true,
        isNative: true,
        message: 'تمت جدولة إشعار تجريبي على الهاتف. اسحب الشاشة من الأعلى للتحقق من ظهوره.'
      };
    } catch (nativeErr: any) {
      console.error('LocalNotifications schedule error:', nativeErr);

      return {
        success: false,
        isNative: true,
        message: `تعذّر جدولة الإشعار على النظام: ${nativeErr?.message || 'خطأ غير معروف'}`
      };
    }
  }

  // Web Browser / PWA Notification
  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      new Notification('🔔 رحلة شواء - فحص إشعار المتصفح', {
        body: 'هذا إشعار تجريبي للتأكد من أن المتصفح يستطيع عرض الإشعارات.',
        icon: '/pwa-icon.jpg',
        badge: '/pwa-icon.jpg'
      });

      return {
        success: true,
        isNative: false,
        message: 'تم عرض إشعار تجريبي من المتصفح.'
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
 * Sends an administrative push notification request to the server.
 */
export async function sendAdminPushNotification(
  idToken: string,
  endpoint: 'notify-order-status' | 'notify-driver-assigned' | 'notify-promotion',
  payload: Record<string, string>
): Promise<void> {
  if (!idToken) {
    throw new Error('Admin authentication token is missing.');
  }

  const response = await fetch(`${API_BASE_URL}/api/push/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);

    throw new Error(
      responseBody?.message || `Push notification request failed: ${response.status}`
    );
  }
}

/**
 * Displays a system notification using the native plugin on Android/iOS
 * and the browser Notification API on web.
 * It never asks for permission itself.
 */
export async function sendSystemNotification(
  title: string,
  body: string,
  tag?: string
): Promise<void> {
  if (await checkNotificationPermission() !== 'granted') return;

  if (Capacitor.isNativePlatform()) {
    try {
      await setupNotificationChannels();

      const stableId = tag
        ? Array.from(tag).reduce(
            (hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0,
            7
          )
        : Date.now();

      const notificationId = Math.abs(stableId % 2147483647) || 1;

      await LocalNotifications.schedule({
        notifications: [
          {
            id: notificationId,
            title,
            body,
            channelId: ORDERS_CHANNEL_ID,
            smallIcon: 'ic_stat_name',
            schedule: { at: new Date(Date.now() + 100) }
          }
        ]
      });

      return;
    } catch (error) {
      console.warn('Failed to display native system notification:', error);
      return;
    }
  }

  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, {
        body,
        icon: '/pwa-icon.jpg',
        badge: '/pwa-icon.jpg',
        tag
      });
    } catch (error) {
      console.warn('Failed to display browser system notification:', error);
    }
  }
}

/** Displays a customer's order status update locally on the current device. */
export async function sendOrderTrayNotification(
  orderId: string,
  statusText: string,
  note?: string
): Promise<void> {
  const title = `🔔 طلبك #${orderId.slice(-4)}`;

  const body = note
    ? `${statusText} - ${note}`
    : `حالة طلبك الحالية: ${statusText}`;

  await sendSystemNotification(
    title,
    body,
    `order-${orderId}-${statusText}`
  );
}

/**
 * Initializes push notifications (FCM) listeners if native.
 */
export async function initializePushNotifications(options?: {
  onNotificationReceived?: (notification: PushNotificationSchema) => void;
  onNotificationActionPerformed?: (action: ActionPerformed) => void;
}): Promise<NotificationState> {
  activePushCallbacks = {
    onNotificationReceived: options?.onNotificationReceived,
    onNotificationActionPerformed: options?.onNotificationActionPerformed
  };

  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      await setupNotificationChannels();

      const localStatus = await LocalNotifications.checkPermissions();
      const pushStatus = await PushNotifications.checkPermissions();

      const permission = localStatus.display === 'granted'
        ? 'granted'
        : localStatus.display === 'denied'
          ? 'denied'
          : 'prompt';

      // Do not prompt at startup.
      // Register silently only if the user has already granted access.
      if (permission === 'granted' && pushStatus.receive === 'granted') {
        await registerForPushIfAllowed(false);
      }

      return {
        isSupported: true,
        isNative: true,
        permission,
        token: localStorage.getItem('fcm_push_token') || undefined
      };
    } catch (error) {
      console.warn('Native push initialization warning:', error);

      return {
        isSupported: false,
        isNative: true,
        permission: 'denied'
      };
    }
  }

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
