import React, { useEffect, useRef, useState } from 'react';
import { Compass, ExternalLink, Bike, MapPin, Phone, ShieldCheck } from 'lucide-react';
import { calculateDistanceKm } from '../utils/geolocation';

interface InteractiveOrderMapProps {
  customerLat?: number;
  customerLng?: number;
  customerAddress?: string;
  driverLat?: number;
  driverLng?: number;
  driverName?: string;
  driverPhone?: string;
  orderStatus?: string;
  restaurantLat?: number;
  restaurantLng?: number;
  restaurantNameAr?: string;
  restaurantNameEn?: string;
  language?: 'ar' | 'en';
}

export default function InteractiveOrderMap({
  customerLat,
  customerLng,
  customerAddress = '',
  driverLat,
  driverLng,
  driverName,
  driverPhone,
  orderStatus = 'preparing',
  restaurantLat,
  restaurantLng,
  restaurantNameAr = 'مطعم رحلة شواء 🍖',
  restaurantNameEn = 'Rehla BBQ Restaurant 🍖',
  language = 'ar'
}: InteractiveOrderMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ restaurant?: any; customer?: any; driver?: any; polyline?: any }>({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tileType, setTileType] = useState<'standard' | 'satellite'>('standard');

  const isAr = language === 'ar';

  const hasCustCoords = typeof customerLat === 'number' && typeof customerLng === 'number' && !isNaN(customerLat) && !isNaN(customerLng) && customerLat !== 0;
  const hasDriverCoords = typeof driverLat === 'number' && typeof driverLng === 'number' && !isNaN(driverLat) && !isNaN(driverLng) && driverLat !== 0;
  const hasRestCoords = typeof restaurantLat === 'number' && typeof restaurantLng === 'number' && !isNaN(restaurantLat) && !isNaN(restaurantLng) && restaurantLat !== 0;

  // Fallback defaults to Riyadh center if customer coordinates not yet specified
  const custLat = hasCustCoords ? customerLat! : 24.7136;
  const custLng = hasCustCoords ? customerLng! : 46.6753;

  // Calculate distance between driver and customer (if driver available)
  const distanceKm = hasDriverCoords
    ? calculateDistanceKm(driverLat!, driverLng!, custLat, custLng)
    : (hasRestCoords ? calculateDistanceKm(restaurantLat!, restaurantLng!, custLat, custLng) : null);

  // Estimate duration (35 km/h average speed in city + 4 min buffer)
  const estimatedMin = distanceKm !== null ? Math.max(3, Math.round((distanceKm / 35) * 60 + 4)) : null;

  // Load Leaflet dynamically
  useEffect(() => {
    if ((window as any).L) {
      setMapLoaded(true);
      return;
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => setMapLoaded(true);
      document.body.appendChild(script);
    } else {
      const interval = setInterval(() => {
        if ((window as any).L) {
          setMapLoaded(true);
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, []);

  // Initialize and Update Leaflet Map instance
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || !(window as any).L) return;

    const L = (window as any).L;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([custLat, custLng], 14);

      L.control.zoom({ position: 'bottomright' }).addTo(map);
      mapRef.current = map;
    }

    const map = mapRef.current;

    // Apply Tile Layer
    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    if (tileType === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    }

    // Remove existing tile layers
    map.eachLayer((layer: any) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    L.tileLayer(tileUrl, { maxZoom: 19 }).addTo(map);

    // Clear old markers
    if (markersRef.current.restaurant) markersRef.current.restaurant.remove();
    if (markersRef.current.customer) markersRef.current.customer.remove();
    if (markersRef.current.driver) markersRef.current.driver.remove();
    if (markersRef.current.polyline) markersRef.current.polyline.remove();

    const bounds = L.latLngBounds([]);

    // 1. Customer Delivery Destination Marker
    const custIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `
        <div style="background-color: #ef4444; color: #fff; padding: 6px 12px; border-radius: 20px; font-weight: 800; font-size: 11px; display: flex; align-items: center; gap: 5px; border: 2.5px solid #fff; box-shadow: 0 4px 12px rgba(239,68,68,0.4); white-space: nowrap;">
          <span>📍</span>
          <span>${isAr ? 'موقع التوصيل' : 'Delivery Point'}</span>
        </div>
      `,
      iconSize: [100, 32],
      iconAnchor: [50, 16]
    });
    const custMarker = L.marker([custLat, custLng], { icon: custIcon }).addTo(map);
    custMarker.bindPopup(`<b>${isAr ? 'عنوان التوصيل' : 'Delivery Address'}</b><br/>${customerAddress || ''}`);
    markersRef.current.customer = custMarker;
    bounds.extend([custLat, custLng]);

    // 2. Driver Marker (If driver GPS active)
    if (hasDriverCoords) {
      const driverIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="position: relative; display: inline-block;">
            <span style="position: absolute; top: -4px; right: -4px; display: flex; height: 10px; width: 10px;">
              <span style="animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; position: absolute; inline-size: 100%; block-size: 100%; border-radius: 9999px; background-color: #10b981; opacity: 0.75;"></span>
              <span style="position: relative; inline-size: 10px; block-size: 10px; border-radius: 9999px; background-color: #059669;"></span>
            </span>
            <div style="background-color: #10b981; color: #fff; padding: 6px 12px; border-radius: 20px; font-weight: 800; font-size: 11px; display: flex; align-items: center; gap: 5px; border: 2.5px solid #fff; box-shadow: 0 4px 14px rgba(16,185,129,0.5); white-space: nowrap;">
              <span>🛵</span>
              <span>${driverName ? driverName : (isAr ? 'المندوب المباشر' : 'Live Driver')}</span>
            </div>
          </div>
        `,
        iconSize: [110, 34],
        iconAnchor: [55, 17]
      });
      const driverMarker = L.marker([driverLat!, driverLng!], { icon: driverIcon }).addTo(map);
      driverMarker.bindPopup(`<b>${isAr ? 'موقع المندوب المباشر (GPS)' : 'Driver Live GPS Position'}</b>`);
      markersRef.current.driver = driverMarker;
      bounds.extend([driverLat!, driverLng!]);

      // Route polyline connecting driver directly to customer
      const polyline = L.polyline([
        [driverLat!, driverLng!],
        [custLat, custLng]
      ], { color: '#10b981', weight: 4, dashArray: '6, 8', opacity: 0.9 }).addTo(map);
      markersRef.current.polyline = polyline;
    } else if (hasRestCoords) {
      // If no driver yet, but valid restaurant coords exist, show restaurant
      const restIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="background-color: #f59e0b; color: #000; padding: 6px 10px; border-radius: 20px; font-weight: 800; font-size: 11px; display: flex; align-items: center; gap: 4px; border: 2px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.25); white-space: nowrap;">
            <span>🍖</span>
            <span>${isAr ? restaurantNameAr : restaurantNameEn}</span>
          </div>
        `,
        iconSize: [110, 30],
        iconAnchor: [55, 15]
      });
      const restMarker = L.marker([restaurantLat!, restaurantLng!], { icon: restIcon }).addTo(map);
      markersRef.current.restaurant = restMarker;
      bounds.extend([restaurantLat!, restaurantLng!]);

      const polyline = L.polyline([
        [restaurantLat!, restaurantLng!],
        [custLat, custLng]
      ], { color: '#f59e0b', weight: 3, dashArray: '5, 8', opacity: 0.7 }).addTo(map);
      markersRef.current.polyline = polyline;
    }

    // Smoothly focus map
    if (hasDriverCoords && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    } else {
      map.setView([custLat, custLng], 15);
    }

  }, [mapLoaded, custLat, custLng, driverLat, driverLng, restaurantLat, restaurantLng, tileType, language, hasDriverCoords, hasRestCoords]);

  // Generate external navigation link
  const googleMapsUrl = hasDriverCoords
    ? `https://www.google.com/maps/dir/?api=1&origin=${driverLat},${driverLng}&destination=${custLat},${custLng}`
    : `https://www.google.com/maps?q=${custLat},${custLng}`;

  return (
    <div className="w-full space-y-3">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-stone-900 text-white p-3 rounded-2xl border border-black/10 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Compass className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h4 className="font-extrabold text-xs text-white">
              {isAr ? 'خريطة التوصيل والتتبع المباشر 📍' : 'Live Delivery & Tracking Map 📍'}
            </h4>
            <p className="text-[10px] text-stone-300">
              {hasDriverCoords
                ? (isAr ? 'المندوب متصل بالـ GPS ويحدث موقعه المباشر خطوة بخطوة' : 'Driver GPS is live & streaming coordinates')
                : (isAr ? 'جاري تجهيز الطلب بانتظار قبول المندوب لبدء التتبع المباشر' : 'Awaiting driver acceptance for live tracking')}
            </p>
          </div>
        </div>

        {/* Tile Selector */}
        <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setTileType('standard')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
              tileType === 'standard' ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:text-white'
            }`}
          >
            {isAr ? 'خريطة' : 'Map'}
          </button>
          <button
            type="button"
            onClick={() => setTileType('satellite')}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
              tileType === 'satellite' ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:text-white'
            }`}
          >
            {isAr ? 'أقمار' : 'Satellite'}
          </button>
        </div>
      </div>

      {/* Main Map Container */}
      <div className="relative w-full aspect-video sm:aspect-[21/9] min-h-[220px] rounded-2xl overflow-hidden border border-black/10 shadow-md bg-stone-100">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Status Badge */}
        <div className="absolute top-3 left-3 z-10">
          {hasDriverCoords ? (
            <div className="bg-emerald-900/90 backdrop-blur-md text-emerald-200 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-[10px] font-extrabold flex items-center gap-1.5 shadow-lg">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>{isAr ? 'تتبع المندوب حي (GPS)' : 'Live Driver GPS'}</span>
            </div>
          ) : (
            <div className="bg-stone-900/85 backdrop-blur-md text-amber-300 border border-amber-500/30 px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center gap-1.5 shadow-md">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span>{isAr ? 'موقع العميل المحدد' : 'Customer Location'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Map Footer Metrics & Direct Google Maps Navigation Link */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl flex items-center gap-2 text-amber-950 font-bold">
          <span className="text-base">📏</span>
          <div>
            <span className="text-[10px] text-amber-800/80 block">{isAr ? 'المسافة المتبقية:' : 'Remaining Distance:'}</span>
            <span className="font-extrabold font-mono text-sm">
              {distanceKm !== null ? `${distanceKm} ${isAr ? 'كم' : 'km'}` : (isAr ? 'بانتظار المندوب' : 'Pending driver')}
            </span>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center gap-2 text-emerald-950 font-bold">
          <span className="text-base">⏱️</span>
          <div>
            <span className="text-[10px] text-emerald-800/80 block">{isAr ? 'الوقت المقدر للوصول:' : 'Estimated Arrival:'}</span>
            <span className="font-extrabold font-mono text-sm">
              {estimatedMin !== null ? `~${estimatedMin} ${isAr ? 'دقيقة' : 'mins'}` : (isAr ? '20-35 دقيقة' : '20-35 mins')}
            </span>
          </div>
        </div>

        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold p-2.5 rounded-xl border border-emerald-700 transition shadow-xs flex items-center justify-center gap-2 text-center cursor-pointer active:scale-95"
        >
          <ExternalLink className="w-4 h-4" />
          <span>{isAr ? 'فتح الموقع في خرائط قوقل 📍' : 'Open in Google Maps 📍'}</span>
        </a>
      </div>
    </div>
  );
}
