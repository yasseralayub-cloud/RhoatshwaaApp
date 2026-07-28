import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, ExternalLink, Layers, Bike, Store, ShieldCheck, Compass, Phone } from 'lucide-react';
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
  restaurantLat = 26.5057,
  restaurantLng = 43.7915,
  restaurantNameAr = 'مطعم رحلة شواء 🍖',
  restaurantNameEn = 'Rehla BBQ Restaurant 🍖',
  language = 'ar'
}: InteractiveOrderMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<{ restaurant?: any; customer?: any; driver?: any; polyline?: any }>({});
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tileType, setTileType] = useState<'standard' | 'satellite' | 'terrain'>('standard');

  const isAr = language === 'ar';

  // Fallback defaults to Riyadh / Qassim if not passed
  const effectiveCustLat = customerLat || 26.5057;
  const effectiveCustLng = customerLng || 43.7915;

  // Calculate distance between driver (or restaurant) and customer
  const originLat = driverLat || restaurantLat;
  const originLng = driverLng || restaurantLng;
  const distanceKm = calculateDistanceKm(originLat, originLng, effectiveCustLat, effectiveCustLng);

  // Estimate duration (assume 30 km/h average speed in city + 5 min margin)
  const estimatedMin = Math.max(5, Math.round((distanceKm / 35) * 60 + 4));

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

  // Initialize and Update Map instance
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current || !(window as any).L) return;

    const L = (window as any).L;

    if (!mapRef.current) {
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([effectiveCustLat, effectiveCustLng], 13);

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      mapRef.current = map;
    }

    const map = mapRef.current;

    // Apply Tile Layer
    let tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    if (tileType === 'satellite') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    } else if (tileType === 'terrain') {
      tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
    }

    if (markersRef.current.polyline && typeof markersRef.current.polyline.remove === 'function') {
      markersRef.current.polyline.remove();
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

    // 1. Restaurant Marker (Rehla BBQ)
    const restIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `
        <div style="background-color: #f59e0b; color: #000; padding: 6px 10px; borderRadius: 20px; font-weight: 800; font-size: 11px; display: flex; align-items: center; gap: 4px; border: 2px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.25); white-space: nowrap;">
          <span>🍖</span>
          <span>${isAr ? 'المطعم' : 'Restaurant'}</span>
        </div>
      `,
      iconSize: [80, 30],
      iconAnchor: [40, 15]
    });
    const restMarker = L.marker([restaurantLat, restaurantLng], { icon: restIcon }).addTo(map);
    restMarker.bindPopup(`<b>${isAr ? restaurantNameAr : restaurantNameEn}</b>`);
    markersRef.current.restaurant = restMarker;
    bounds.extend([restaurantLat, restaurantLng]);

    // 2. Customer Delivery Destination Marker
    const custIcon = L.divIcon({
      className: 'custom-map-icon',
      html: `
        <div style="background-color: #ef4444; color: #fff; padding: 6px 10px; borderRadius: 20px; font-weight: 800; font-size: 11px; display: flex; align-items: center; gap: 4px; border: 2px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.25); white-space: nowrap;">
          <span>📍</span>
          <span>${isAr ? 'موقع التوصيل' : 'Delivery Address'}</span>
        </div>
      `,
      iconSize: [95, 30],
      iconAnchor: [47, 15]
    });
    const custMarker = L.marker([effectiveCustLat, effectiveCustLng], { icon: custIcon }).addTo(map);
    custMarker.bindPopup(`<b>${isAr ? 'موقع العميل' : 'Customer Location'}</b><br/>${customerAddress}`);
    markersRef.current.customer = custMarker;
    bounds.extend([effectiveCustLat, effectiveCustLng]);

    // 3. Driver Marker (if assigned & active)
    if (driverLat && driverLng) {
      const driverIcon = L.divIcon({
        className: 'custom-map-icon',
        html: `
          <div style="position: relative; display: inline-block;">
            <span style="position: absolute; top: -4px; right: -4px; display: flex; height: 10px; width: 10px;">
              <span style="animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite; position: absolute; inline-size: 100%; block-size: 100%; border-radius: 9999px; background-color: #10b981; opacity: 0.75;"></span>
              <span style="position: relative; inline-size: 10px; block-size: 10px; border-radius: 9999px; background-color: #059669;"></span>
            </span>
            <div style="background-color: #10b981; color: #fff; padding: 6px 10px; borderRadius: 20px; font-weight: 800; font-size: 11px; display: flex; align-items: center; gap: 4px; border: 2px solid #fff; box-shadow: 0 4px 12px rgba(16,185,129,0.4); white-space: nowrap;">
              <span>🛵</span>
              <span>${driverName ? driverName : (isAr ? 'المندوب' : 'Driver')}</span>
            </div>
          </div>
        `,
        iconSize: [90, 32],
        iconAnchor: [45, 16]
      });
      const driverMarker = L.marker([driverLat, driverLng], { icon: driverIcon }).addTo(map);
      driverMarker.bindPopup(`<b>${isAr ? 'موقع المندوب المباشر' : 'Live Driver Position'}</b>`);
      markersRef.current.driver = driverMarker;
      bounds.extend([driverLat, driverLng]);

      // Route line: Restaurant -> Driver -> Customer
      const polyline = L.polyline([
        [restaurantLat, restaurantLng],
        [driverLat, driverLng],
        [effectiveCustLat, effectiveCustLng]
      ], { color: '#10b981', weight: 4, dashArray: '6, 8', opacity: 0.85 }).addTo(map);
      markersRef.current.polyline = polyline;
    } else {
      // Route line: Restaurant -> Customer
      const polyline = L.polyline([
        [restaurantLat, restaurantLng],
        [effectiveCustLat, effectiveCustLng]
      ], { color: '#f59e0b', weight: 4, dashArray: '6, 8', opacity: 0.85 }).addTo(map);
      markersRef.current.polyline = polyline;
    }

    // Fit bounds smoothly with padding
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }

  }, [mapLoaded, effectiveCustLat, effectiveCustLng, driverLat, driverLng, restaurantLat, restaurantLng, tileType, language]);

  // Generate Google Maps Direction link for external navigation
  const googleMapsUrl = driverLat && driverLng
    ? `https://www.google.com/maps/dir/?api=1&origin=${driverLat},${driverLng}&destination=${effectiveCustLat},${effectiveCustLng}`
    : `https://www.google.com/maps/dir/?api=1&origin=${restaurantLat},${restaurantLng}&destination=${effectiveCustLat},${effectiveCustLng}`;

  return (
    <div className="w-full space-y-3">
      {/* Top Map Action Bar */}
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
              {driverLat
                ? (isAr ? 'المندوب متصل بالـ GPS ويحدث موقعه تلقائياً' : 'Driver GPS is live & updating')
                : (isAr ? 'موقع مطعم رحلة شواء وموقع التوصيل المحدد' : 'Restaurant & Delivery points locked')}
            </p>
          </div>
        </div>

        {/* Layer style buttons */}
        <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-xl border border-white/10">
          <button
            type="button"
            onClick={() => setTileType('standard')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
              tileType === 'standard' ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:text-white'
            }`}
          >
            {isAr ? 'عادي' : 'Standard'}
          </button>
          <button
            type="button"
            onClick={() => setTileType('satellite')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
              tileType === 'satellite' ? 'bg-amber-500 text-stone-950' : 'text-stone-300 hover:text-white'
            }`}
          >
            {isAr ? 'أقمار' : 'Satellite'}
          </button>
        </div>
      </div>

      {/* Main Map Canvas Frame */}
      <div className="relative w-full aspect-video sm:aspect-[21/9] min-h-[220px] rounded-2xl overflow-hidden border border-black/10 shadow-md bg-stone-100">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Live GPS Badge Floating Tag */}
        {driverLat && (
          <div className="absolute top-3 left-3 z-10 bg-emerald-900/90 backdrop-blur-md text-emerald-200 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-[10px] font-extrabold flex items-center gap-1.5 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span>{isAr ? 'تحديث حي للمندوب (GPS)' : 'Live Driver Coordinates'}</span>
          </div>
        )}
      </div>

      {/* Map Footer Metrics & Direct Google Maps Navigation Link */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl flex items-center gap-2 text-amber-950 font-bold">
          <span className="text-base">📏</span>
          <div>
            <span className="text-[10px] text-amber-800/80 block">{isAr ? 'المسافة المتبقية:' : 'Remaining Distance:'}</span>
            <span className="font-extrabold font-mono text-sm">{distanceKm} {isAr ? 'كم' : 'km'}</span>
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center gap-2 text-emerald-950 font-bold">
          <span className="text-base">⏱️</span>
          <div>
            <span className="text-[10px] text-emerald-800/80 block">{isAr ? 'الوقت المقدر للوصول:' : 'Estimated Arrival:'}</span>
            <span className="font-extrabold font-mono text-sm">~{estimatedMin} {isAr ? 'دقيقة' : 'mins'}</span>
          </div>
        </div>

        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold p-2.5 rounded-xl border border-emerald-700 transition shadow-xs flex items-center justify-center gap-2 text-center cursor-pointer active:scale-95"
        >
          <ExternalLink className="w-4 h-4" />
          <span>{isAr ? 'فتح المسار في خرائط قوقل 📍' : 'Open in Google Maps 📍'}</span>
        </a>
      </div>
    </div>
  );
}
