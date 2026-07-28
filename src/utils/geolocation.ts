export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * High accuracy GPS location locator.
 * Uses watchPosition for up to 5 seconds to lock onto the highest-precision satellite/GPS signal.
 */
export function getHighAccuracyLocation(
  onSuccess: (result: LocationResult) => void,
  onError: (error: GeolocationPositionError | Error) => void,
  onProgress?: (accuracy: number) => void
): () => void {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    onError(new Error('Geolocation is not supported by this browser.'));
    return () => {};
  }

  let bestPosition: GeolocationPosition | null = null;
  let watchId: number | null = null;
  let timerId: any = null;

  const finish = (pos: GeolocationPosition) => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    onSuccess({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    });
  };

  try {
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (onProgress) {
          onProgress(position.coords.accuracy);
        }
        if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }
        // If accuracy is <= 25 meters, lock in immediately!
        if (position.coords.accuracy <= 25) {
          finish(position);
        }
      },
      (err) => {
        console.warn('Geolocation watchPosition warning:', err);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  } catch (err) {
    console.warn('Could not start watchPosition:', err);
  }

  // Fallback timer: After 5 seconds max, finish with the best position recorded
  timerId = setTimeout(() => {
    if (bestPosition) {
      finish(bestPosition);
    } else {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish(pos),
        (err) => {
          if (watchId !== null) navigator.geolocation.clearWatch(watchId);
          onError(err);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }
  }, 5000);

  return () => {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    if (timerId) clearTimeout(timerId);
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
