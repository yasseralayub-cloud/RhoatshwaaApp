import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  isApproximate?: boolean;
}

export type LocationErrorCode = 
  | 'PERMISSION_DENIED' 
  | 'POSITION_UNAVAILABLE' 
  | 'TIMEOUT' 
  | 'NOT_SUPPORTED' 
  | 'UNKNOWN';

export interface LocationErrorDetails {
  code: LocationErrorCode;
  messageAr: string;
  messageEn: string;
  originalError?: any;
}

/**
 * High-accuracy, robust GPS locator supporting both Capacitor Android/iOS and Web.
 * Requests location permission ON DEMAND only when the user invokes the location feature.
 * Handles Granted, Denied, Approximate/Coarse location, and GPS-disabled scenarios with clear Arabic messages.
 */
export function getHighAccuracyLocation(
  onSuccess: (result: LocationResult) => void,
  onError: (error: LocationErrorDetails) => void,
  onProgress?: (accuracy: number) => void
): () => void {
  let isCancelled = false;
  let watchId: string | number | null = null;
  let timerId: any = null;

  const isNative = Capacitor.isNativePlatform();

  const handleSuccess = (lat: number, lng: number, acc: number) => {
    if (isCancelled) return;
    cleanup();
    const isApproximate = acc > 100;
    onSuccess({
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      isApproximate
    });
  };

  const handleError = (code: LocationErrorCode, messageAr: string, messageEn: string, original?: any) => {
    if (isCancelled) return;
    cleanup();
    onError({
      code,
      messageAr,
      messageEn,
      originalError: original
    });
  };

  const cleanup = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (watchId !== null) {
      if (isNative && typeof watchId === 'string') {
        Geolocation.clearWatch({ id: watchId }).catch(() => {});
      } else if (typeof window !== 'undefined' && navigator.geolocation && typeof watchId === 'number') {
        navigator.geolocation.clearWatch(watchId);
      }
      watchId = null;
    }
  };

  const runLocationLookup = async () => {
    // 1. Check & Request Permissions ON DEMAND
    if (isNative) {
      try {
        let perm = await Geolocation.checkPermissions();
        if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
          perm = await Geolocation.requestPermissions({ permissions: ['location'] });
        }

        if (perm.location === 'denied') {
          handleError(
            'PERMISSION_DENIED',
            'تم رفض إذن الوصول إلى الموقع. يرجى السماح بالإذن من إعدادات الهاتف أو اختيار العنوان يدوياً على الخريطة.',
            'Location permission was denied. Please allow location from device settings or select on map.',
            perm
          );
          return;
        }

        // Try getting quick current position first with Capacitor
        try {
          const pos = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 5000
          });

          if (pos && pos.coords) {
            handleSuccess(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
            return;
          }
        } catch (capErr: any) {
          // If GPS is disabled on Android hardware
          if (capErr?.message?.includes('location disabled') || capErr?.message?.includes('disabled')) {
            handleError(
              'POSITION_UNAVAILABLE',
              'خدمة تحديد الموقع (GPS) معطلة على جهازك. يرجى تشغيل الـ GPS من لوحة الإشعارات/الإعدادات.',
              'Location service (GPS) is disabled on your device. Please turn on GPS in settings.',
              capErr
            );
            return;
          }
          console.warn('Capacitor getCurrentPosition fallback to watchPosition:', capErr);
        }

        // Watch position for precision lock
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
          (position, err) => {
            if (err) {
              console.warn('Capacitor watchPosition error:', err);
              return;
            }
            if (position && position.coords) {
              if (onProgress) onProgress(position.coords.accuracy);
              if (position.coords.accuracy <= 25) {
                handleSuccess(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
              }
            }
          }
        );
        watchId = id;

      } catch (nativeErr: any) {
        console.warn('Capacitor Geolocation exception:', nativeErr);
      }
    }

    // 2. Web / Browser / Fallback standard Geolocation API
    if (typeof window === 'undefined' || !navigator.geolocation) {
      handleError(
        'NOT_SUPPORTED',
        'ميزة تحديد الموقع غير مدعومة في بيئة التشغيل الحالية.',
        'Geolocation is not supported in this environment.'
      );
      return;
    }

    let bestPosition: GeolocationPosition | null = null;

    try {
      const nativeWatchId = navigator.geolocation.watchPosition(
        (position) => {
          if (onProgress) onProgress(position.coords.accuracy);
          if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
            bestPosition = position;
          }
          if (position.coords.accuracy <= 25) {
            handleSuccess(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
          }
        },
        (err) => {
          console.warn('Web watchPosition warning:', err);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
      if (!isNative) watchId = nativeWatchId;
    } catch (e) {
      console.warn('Web watchPosition catch:', e);
    }

    // Safety timeout: after 6 seconds, resolve with best position or error
    timerId = setTimeout(() => {
      if (bestPosition) {
        handleSuccess(bestPosition.coords.latitude, bestPosition.coords.longitude, bestPosition.coords.accuracy);
      } else {
        navigator.geolocation.getCurrentPosition(
          (pos) => handleSuccess(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
          (geoErr) => {
            if (geoErr.code === 1) { // PERMISSION_DENIED
              handleError(
                'PERMISSION_DENIED',
                'تم رفض إذن الوصول إلى الموقع. يمكنك اختيار موقع التوصيل يدوياً من الخريطة أو البحث باسم الحي.',
                'Location permission was denied. Please select your address manually on the map.',
                geoErr
              );
            } else if (geoErr.code === 2) { // POSITION_UNAVAILABLE
              handleError(
                'POSITION_UNAVAILABLE',
                'خدمة الـ GPS غير متوفرة أو معطلة حالياً. يرجى تفعيل الموقع في الجهاز أو البحث عن العنوان.',
                'Location position unavailable. Please enable device GPS or search by neighborhood.',
                geoErr
              );
            } else if (geoErr.code === 3) { // TIMEOUT
              handleError(
                'TIMEOUT',
                'استغرق تحديد موقعك وقتاً طويلاً. يرجى التأكد من تشغيل الـ GPS واختيار موقعك على الخريطة.',
                'Location request timed out. Please verify GPS is enabled or drag the map pin.',
                geoErr
              );
            } else {
              handleError(
                'UNKNOWN',
                'تعذر تحديد الموقع الجغرافي بدقة. يرجى تحريك الدبوس على الخريطة لتثبيت العنوان.',
                'Unable to get exact location. Please position the pin on the map.',
                geoErr
              );
            }
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
        );
      }
    }, 5500);
  };

  runLocationLookup();

  return () => {
    isCancelled = true;
    cleanup();
  };
}

/**
 * Calculates Haversine distance in kilometers between two lat/lng coordinates.
 */
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}
