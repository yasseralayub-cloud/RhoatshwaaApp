import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, Navigation, AlertCircle } from 'lucide-react';
import { useLanguage } from './LanguageContext';

interface MapPickerProps {
  latitude?: number;
  longitude?: number;
  onChange: (lat: number, lng: number) => void;
  onAddressSelect?: (address: string) => void;
}

export const parseCoordinatesFromText = (text: string) => {
  if (!text) return null;
  const regex = /([-+]?\d{1,2}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (lat >= 15 && lat <= 33 && lng >= 34 && lng <= 56) {
      return { lat, lng };
    }
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
};



export default function MapPicker({ latitude, longitude, onChange, onAddressSelect }: MapPickerProps) {
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [pastedLink, setPastedLink] = useState('');
  const [parseError, setParseError] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [tileLayerType, setTileLayerType] = useState<'standard' | 'satellite' | 'terrain'>('standard');

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);

  const [useLeaflet, setUseLeaflet] = useState(false);

  const defaultLat = 26.5057;
  const defaultLng = 43.7915;

  const [localLat, setLocalLat] = useState<number>(latitude || defaultLat);
  const [localLng, setLocalLng] = useState<number>(longitude || defaultLng);

  // Sync with incoming props if they change and are valid
  useEffect(() => {
    if (latitude !== undefined && longitude !== undefined) {
      setLocalLat(latitude);
      setLocalLng(longitude);
    }
  }, [latitude, longitude]);



  // Reset refs and state on map engine transition to ensure clean slate
  useEffect(() => {
    const oldMap = mapRef.current;
    if (oldMap && typeof oldMap.remove === 'function') {
      try {
        oldMap.remove();
      } catch (err) {
        console.warn("Error removing old Leaflet map during transition:", err);
      }
    }
    mapRef.current = null;
    markerRef.current = null;
    tileLayerRef.current = null;
    setMapLoaded(false);
  }, [useLeaflet]);

  // Setup global gm_authFailure to detect invalid Google Maps keys
  useEffect(() => {
    (window as any).gm_authFailure = () => {
      console.warn("Google Maps Auth Failure (e.g. InvalidKeyMapError). Switching to Leaflet Map Fallback.");
      setUseLeaflet(true);
    };

    const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || '';
    if (!apiKey || apiKey.includes('YOUR_KEY_HERE') || !apiKey.startsWith('AIzaSy')) {
      setUseLeaflet(true);
    }
  }, []);

  // Map tile helper for Leaflet fallback
  const getLayerUrl = (type: 'standard' | 'satellite' | 'terrain') => {
    switch (type) {
      case 'satellite':
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      case 'terrain':
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';
      case 'standard':
      default:
        return 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
  };

  // Load Map Engine Assets (Google Maps or Leaflet)
  useEffect(() => {
    let safetyTimeout: any = null;

    if (useLeaflet) {
      // Load Leaflet Assets
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
        script.onload = () => {
          setMapLoaded(true);
        };
        script.onerror = () => {
          console.error("Failed to load Leaflet script.");
        };
        document.body.appendChild(script);
      } else {
        const interval = setInterval(() => {
          if ((window as any).L) {
            setMapLoaded(true);
            clearInterval(interval);
          }
        }, 100);
        setTimeout(() => clearInterval(interval), 5000);
      }
    } else {
      // Safety backup timeout: If Google Maps loading takes > 3.5s, fall back to Leaflet instantly
      safetyTimeout = setTimeout(() => {
        if (!(window as any).google || !(window as any).google.maps) {
          console.warn("Google Maps load timed out. Falling back to Leaflet to guarantee map display.");
          setUseLeaflet(true);
        }
      }, 3500);

      // Load Google Maps Assets
      if ((window as any).google && (window as any).google.maps) {
        if (safetyTimeout) clearTimeout(safetyTimeout);
        setMapLoaded(true);
        return;
      }

      const apiKey = (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || '';
      if (!apiKey || apiKey.includes('YOUR_KEY_HERE') || !apiKey.startsWith('AIzaSy')) {
        if (safetyTimeout) clearTimeout(safetyTimeout);
        setUseLeaflet(true);
        return;
      }

      const scriptId = 'google-maps-platform-api';
      const existingScript = document.getElementById(scriptId);

      if (existingScript) {
        const interval = setInterval(() => {
          if ((window as any).google && (window as any).google.maps) {
            if (safetyTimeout) clearTimeout(safetyTimeout);
            setMapLoaded(true);
            clearInterval(interval);
          }
        }, 100);
        setTimeout(() => clearInterval(interval), 5000);
        return;
      }

      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=ar&region=SA`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Double check after small delay that authentication didn't fail
        setTimeout(() => {
          if ((window as any).google && (window as any).google.maps) {
            if (safetyTimeout) clearTimeout(safetyTimeout);
            setMapLoaded(true);
          } else {
            setUseLeaflet(true);
          }
        }, 300);
      };
      script.onerror = (err) => {
        console.error("Failed to load Google Maps JS API script:", err);
        if (safetyTimeout) clearTimeout(safetyTimeout);
        setUseLeaflet(true);
      };
      document.body.appendChild(script);
    }

    return () => {
      if (safetyTimeout) clearTimeout(safetyTimeout);
    };
  }, [useLeaflet]);

  // Sync Leaflet tile layer changes
  useEffect(() => {
    if (!useLeaflet || !mapRef.current || !tileLayerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    const layerUrl = getLayerUrl(tileLayerType);
    mapRef.current.removeLayer(tileLayerRef.current);
    const newTileLayer = L.tileLayer(layerUrl).addTo(mapRef.current);
    tileLayerRef.current = newTileLayer;
  }, [tileLayerType, useLeaflet]);

  // Sync Map Type (Standard, Satellite, Terrain) with Google Maps MapTypeID
  useEffect(() => {
    if (useLeaflet || !mapRef.current || !(window as any).google) return;
    const google = (window as any).google;

    let type = google.maps.MapTypeId.ROADMAP;
    if (tileLayerType === 'satellite') {
      type = google.maps.MapTypeId.HYBRID;
    } else if (tileLayerType === 'terrain') {
      type = google.maps.MapTypeId.TERRAIN;
    }

    mapRef.current.setMapTypeId(type);
  }, [tileLayerType, mapLoaded, useLeaflet]);

  // Initialize and Synchronize Map and Marker position (dual implementation)
  useEffect(() => {
    if (!mapLoaded) return;

    const mapContainer = document.getElementById('map-container-element');
    if (!mapContainer) return;

    if (useLeaflet) {
      const L = (window as any).L;
      if (!L) return;

      if (!mapRef.current) {
        // Clear container completely to purge previous map residues (e.g. Google Maps or older Leaflet states)
        mapContainer.innerHTML = '';

        // Create Leaflet Map
        const map = L.map('map-container-element', {
          zoomControl: true,
          scrollWheelZoom: true,
          attributionControl: false
        }).setView([localLat, localLng], 14);

        const initialUrl = getLayerUrl(tileLayerType);
        const tileLayer = L.tileLayer(initialUrl).addTo(map);
        tileLayerRef.current = tileLayer;

        // Custom red marker pin
        const customIcon = L.divIcon({
          className: 'custom-div-icon',
          html: `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 32px; height: 32px; transform: translate(-8px, -24px);">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2C7.58 2 4 5.58 4 10C4 15.25 12 22 12 22C12 22 20 15.25 20 10C20 5.58 16.42 2 12 2Z" fill="#ef4444" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
              <circle cx="12" cy="10" r="3" fill="#ffffff"/>
            </svg>
          </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        });

        const marker = L.marker([localLat, localLng], {
          draggable: true,
          icon: customIcon
        }).addTo(map);

        // Handle marker drag
        marker.on('dragend', () => {
          const position = marker.getLatLng();
          setLocalLat(position.lat);
          setLocalLng(position.lng);
          onChange(position.lat, position.lng);
          fetchAddress(position.lat, position.lng);
        });

        // Handle click on map to set position
        map.on('click', (e: any) => {
          marker.setLatLng(e.latlng);
          setLocalLat(e.latlng.lat);
          setLocalLng(e.latlng.lng);
          onChange(e.latlng.lat, e.latlng.lng);
          fetchAddress(e.latlng.lat, e.latlng.lng);
        });

        mapRef.current = map;
        markerRef.current = marker;
      } else {
        const map = mapRef.current;
        const marker = markerRef.current;
        const currentPos = marker.getLatLng();
        // Prevent micro-adjustments or dragging conflicts from resetting the position
        if (Math.abs(currentPos.lat - localLat) > 0.0001 || Math.abs(currentPos.lng - localLng) > 0.0001) {
          marker.setLatLng([localLat, localLng]);
          map.panTo([localLat, localLng]);
        }
      }
    } else {
      const google = (window as any).google;
      if (!google || !google.maps) return;

      const centerPos = { lat: localLat, lng: localLng };

      if (!mapRef.current) {
        // Clear container completely to purge previous map residues (e.g. Leaflet elements)
        mapContainer.innerHTML = '';

        let initialType = google.maps.MapTypeId.ROADMAP;
        if (tileLayerType === 'satellite') {
          initialType = google.maps.MapTypeId.HYBRID;
        } else if (tileLayerType === 'terrain') {
          initialType = google.maps.MapTypeId.TERRAIN;
        }

        // Initialize real Google Map
        const map = new google.maps.Map(mapContainer, {
          center: centerPos,
          zoom: 16,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'cooperative',
          mapTypeId: initialType
        });

        // Initialize real Google Map Marker
        const marker = new google.maps.Marker({
          position: centerPos,
          map: map,
          draggable: true,
          animation: google.maps.Animation.DROP
        });

        // Handle marker drag
        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) {
            const lat = pos.lat();
            const lng = pos.lng();
            setLocalLat(lat);
            setLocalLng(lng);
            onChange(lat, lng);
            fetchAddress(lat, lng);
          }
        });

        // Handle click on map to position marker
        map.addListener('click', (e: any) => {
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();
          marker.setPosition(e.latLng);
          setLocalLat(lat);
          setLocalLng(lng);
          onChange(lat, lng);
          fetchAddress(lat, lng);
        });

        mapRef.current = map;
        markerRef.current = marker;
      } else {
        const map = mapRef.current;
        const marker = markerRef.current;
        const currentPos = marker.getPosition();

        if (currentPos) {
          const currentLat = currentPos.lat();
          const currentLng = currentPos.lng();
          // Prevent infinite loops but sync if position difference is notable
          if (Math.abs(currentLat - localLat) > 0.0001 || Math.abs(currentLng - localLng) > 0.0001) {
            const newPos = { lat: localLat, lng: localLng };
            marker.setPosition(newPos);
            map.panTo(newPos);
          }
        }
      }
    }
  }, [mapLoaded, localLat, localLng, useLeaflet]);

  // Fetch address via Google Geocoding API directly on client, styled/translated by our backend Gemini
  const fetchAddress = async (lat: number, lng: number) => {
    if (!useLeaflet && (window as any).google && (window as any).google.maps) {
      try {
        const google = (window as any).google;
        const geocoder = new google.maps.Geocoder();

        geocoder.geocode({ location: { lat, lng } }, async (results: any, status: string) => {
          if (status === 'OK' && results && results[0]) {
            const googleAddress = results[0].formatted_address;

            // 1. Instantly update the input field and parent address state with extreme accuracy
            setSearchQuery(googleAddress);
            if (onAddressSelect) {
              onAddressSelect(googleAddress);
            }

            // 2. Fetch from backend to see if there is any refined format, updating gracefully on response
            try {
              const res = await fetch('/api/reverse-geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng })
              });
              const data = await res.json();
              if (data.success && data.address) {
                setSearchQuery(data.address);
                if (onAddressSelect) {
                  onAddressSelect(data.address);
                }
              }
            } catch (err) {
              console.warn('Silent reverse geocode error:', err);
            }
          } else {
            fallbackFetchAddress(lat, lng);
          }
        });
      } catch (err) {
        console.error('Client geocoding error, falling back:', err);
        fallbackFetchAddress(lat, lng);
      }
    } else {
      fallbackFetchAddress(lat, lng);
    }
  };

  const fallbackFetchAddress = async (lat: number, lng: number) => {
    try {
      const res = await fetch('/api/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng })
      });
      const data = await res.json();
      if (data.success && data.address) {
        setSearchQuery(data.address);
        if (onAddressSelect) {
          onAddressSelect(data.address);
        }
      }
    } catch (err) {
      console.error('Error in fallback reverse geocoding:', err);
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert(language === 'ar' ? 'تحديد الموقع غير مدعوم في هذا المتصفح' : 'Geolocation is not supported by this browser');
      return;
    }
    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLocalLat(lat);
        setLocalLng(lng);
        onChange(lat, lng);
        fetchAddress(lat, lng);
        setLocating(false);
      },
      (error) => {
        console.warn('Locate me high-accuracy error, trying low-accuracy fallback:', error);
        if (error.code === 1) { // PERMISSION_DENIED
          setLocating(false);
          alert(
            language === 'ar'
              ? 'تنبيه لأجهزة الآيفون: يرجى الذهاب إلى الإعدادات ثم الخصوصية والأمن ثم خدمات الموقع، وتأكد من تفعيل خدمات الموقع والسماح لمتصفحك بالوصول للموقع، أو يمكنك البحث عن موقعك يدوياً.'
              : 'For iPhone & iOS users: Please go to Settings then Privacy & Security then Location Services, ensure they are enabled, and allow your browser to access your location, or search manually.'
          );
        } else {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              setLocalLat(lat);
              setLocalLng(lng);
              onChange(lat, lng);
              fetchAddress(lat, lng);
              setLocating(false);
            },
            (fallbackErr) => {
              console.error('All locate attempts failed:', fallbackErr);
              setLocating(false);
              alert(
                language === 'ar'
                  ? 'تعذر تحديد موقعك تلقائياً. يرجى البحث بكتابة اسم الحي في خانة البحث بالأعلى، أو لصق رابط قوقل ماب.'
                  : 'Unable to locate you automatically. Please type your neighborhood name in the search bar above, or paste a Google Maps link.'
              );
            },
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
          );
        }
      },
      { enableHighAccuracy: true, timeout: 4500, maximumAge: 10000 }
    );
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const queryTerm = searchQuery.trim();
    if (!queryTerm) return;

    setSearching(true);

    if (!useLeaflet && (window as any).google && (window as any).google.maps) {
      try {
        const google = (window as any).google;
        const geocoder = new google.maps.Geocoder();

        let localizedQuery = queryTerm;
        const lowerQ = queryTerm.toLowerCase();
        const isBuraidah = lowerQ.includes("بريدة") || lowerQ.includes("buraidah") || lowerQ.includes("buraydah");

        if (isBuraidah) {
          if (!lowerQ.includes("قصيم") && !lowerQ.includes("qassim")) {
            localizedQuery = `${queryTerm}، بريدة، القصيم`;
          }
        } else if (!lowerQ.includes("سعود") && !lowerQ.includes("saudi") && !lowerQ.includes("قصيم") && !lowerQ.includes("جواء")) {
          const buraidahNeighborhoods = ["فايزية", "fayziyah", "إسكان", "eskan", "ريان", "rayan", "صفراء", "safra", "أفق", "ofuq", "بساتين", "basatin", "سلطانة", "sultanah", "غدير", "ghadir"];
          const isLikelyBuraidah = buraidahNeighborhoods.some(n => lowerQ.includes(n));
          
          if (isLikelyBuraidah) {
            localizedQuery = `${queryTerm}، بريدة، القصيم`;
          } else {
            localizedQuery = `${queryTerm}، القصيم، السعودية`;
          }
        }

        geocoder.geocode({
          address: localizedQuery,
          componentRestrictions: { country: 'SA' }
        }, async (results: any, status: string) => {
          if (status === 'OK' && results && results[0]) {
            const loc = results[0].geometry.location;
            const lat = loc.lat();
            const lng = loc.lng();
            const formattedAddress = results[0].formatted_address;

            setLocalLat(lat);
            setLocalLng(lng);
            onChange(lat, lng);

            // Fetch AI polished address
            try {
              const res = await fetch('/api/reverse-geocode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lat, lng })
              });
              const data = await res.json();
              if (onAddressSelect) {
                onAddressSelect(data.success && data.address ? data.address : formattedAddress);
              }
            } catch (err) {
              if (onAddressSelect) {
                onAddressSelect(formattedAddress);
              }
            }
            setSearching(false);
          } else {
            await fallbackSearch(queryTerm);
          }
        });
        return;
      } catch (err) {
        console.error('Client Geocoder error, falling back:', err);
      }
    }

    await fallbackSearch(queryTerm);
  };

  const fallbackSearch = async (queryTerm: string) => {
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryTerm })
      });
      const data = await res.json();
      if (data.success) {
        setLocalLat(data.lat);
        setLocalLng(data.lng);
        onChange(data.lat, data.lng);
        if (onAddressSelect && data.address) {
          onAddressSelect(data.address);
        }
      } else {
        alert(
          data.message || (
            language === 'ar'
              ? 'لم نجد هذا العنوان. يرجى كتابة اسم الحي والمدينة بشكل صحيح أو لصق رابط الموقع.'
              : 'Sorry, we could not find this address. Try searching with a different neighborhood/city or paste a map link.'
          )
        );
      }
    } catch (err) {
      console.error('Geocoding search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handlePasteChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setPastedLink(text);
    setParseError(false);

    if (!text.trim()) return;

    const parsed = parseCoordinatesFromText(text);
    if (parsed) {
      setLocalLat(parsed.lat);
      setLocalLng(parsed.lng);
      onChange(parsed.lat, parsed.lng);
      fetchAddress(parsed.lat, parsed.lng);
      return;
    }

    if (text.includes('http') && (text.includes('goo.gl') || text.includes('maps'))) {
      setSearching(true);
      try {
        const res = await fetch('/api/expand-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: text.trim() })
        });
        const data = await res.json();
        if (data.success && data.expandedUrl) {
          const parsedExpanded = parseCoordinatesFromText(data.expandedUrl);
          if (parsedExpanded) {
            setLocalLat(parsedExpanded.lat);
            setLocalLng(parsedExpanded.lng);
            onChange(parsedExpanded.lat, parsedExpanded.lng);
            fetchAddress(parsedExpanded.lat, parsedExpanded.lng);
          } else {
            setParseError(true);
          }
        } else {
          setParseError(true);
        }
      } catch (err) {
        console.error('Error expanding short map URL:', err);
        setParseError(true);
      } finally {
        setSearching(false);
      }
    } else {
      if (text.includes('http') || text.includes('maps') || text.includes(',')) {
        setParseError(true);
      }
    }
  };



  return (
    <div className="space-y-4 w-full text-start" id="map-picker-container">
      {/* Primary Action Button: Locate Me */}
      <button
        type="button"
        onClick={handleLocateMe}
        disabled={locating}
        className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-yellow text-stone-900 hover:bg-yellow/90 font-black text-sm rounded-2xl shadow-md transition-all cursor-pointer disabled:opacity-50 active:scale-98"
      >
        {locating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Navigation className="w-4 h-4 fill-black/20 rotate-45" />
        )}
        <span>{language === 'ar' ? 'تحديد موقعي الفعلي بشكل دقيق' : 'Locate My Precise Position'}</span>
      </button>

      {/* Actual Interactive Map Container */}
      <div className="relative">
        <div
          id="map-container-element"
          key={useLeaflet ? 'leaflet' : 'google'}
          style={{ height: '230px' }}
          className="w-full rounded-2xl border border-stone-200 overflow-hidden shadow-inner z-0 bg-stone-100"
        />

        {/* Floating Tile Layer Switcher */}
        {mapLoaded && (
          <div className="absolute top-2.5 right-2.5 z-10 flex bg-white/95 backdrop-blur-xs rounded-xl border border-stone-200/80 p-0.5 shadow-md">
            <button
              type="button"
              onClick={() => setTileLayerType('standard')}
              className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                tileLayerType === 'standard'
                  ? 'bg-yellow text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              {language === 'ar' ? 'خريطة' : 'Map'}
            </button>
            <button
              type="button"
              onClick={() => setTileLayerType('satellite')}
              className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                tileLayerType === 'satellite'
                  ? 'bg-yellow text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              {language === 'ar' ? 'قمر صناعي' : 'Satellite'}
            </button>
            <button
              type="button"
              onClick={() => setTileLayerType('terrain')}
              className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                tileLayerType === 'terrain'
                  ? 'bg-yellow text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:bg-stone-50'
              }`}
            >
              {language === 'ar' ? 'تضاريس' : 'Terrain'}
            </button>
          </div>
        )}



        {!mapLoaded && (
          <div className="absolute inset-0 bg-stone-50/90 flex items-center justify-center gap-2 rounded-2xl z-10 border border-stone-200">
            <Loader2 className="w-5 h-5 text-yellow animate-spin" />
            <span className="text-xs font-bold text-stone-500">
              {language === 'ar' ? 'جاري تحميل الخريطة التفاعلية...' : 'Loading interactive map...'}
            </span>
          </div>
        )}
      </div>

      <div className="text-[10px] text-stone-400 font-bold leading-relaxed px-1">
        {language === 'ar'
          ? 'تنبيه: يمكنك سحب السهم الأحمر على الخريطة أو الضغط في أي مكان لتحديد موقع منزلك بدقة متناهية.'
          : 'Tip: You can drag the red marker on the map or click anywhere to pinpoint your exact home location.'}
      </div>

      {/* Search Input Area */}
      <div className="flex gap-2 w-full">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder={
              language === 'ar'
                ? 'ابحث عن اسم الحي أو الشارع'
                : 'Search district or street name'
            }
            className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-2.5 outline-none focus:border-yellow text-stone-800 placeholder-stone-400 shadow-inner"
          />
          <Search className="w-3.5 h-3.5 text-stone-450 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
        <button
          type="button"
          onClick={() => handleSearch()}
          disabled={searching}
          className="px-4 bg-stone-100 hover:bg-stone-200 text-stone-850 font-black text-xs rounded-xl border border-stone-250 transition-all flex items-center justify-center gap-1 min-w-[70px] cursor-pointer disabled:bg-stone-200"
        >
          {searching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <span>{language === 'ar' ? 'بحث' : 'Search'}</span>
          )}
        </button>
      </div>

      {/* Paste Map Link Area */}
      <div className="bg-stone-50 border border-stone-200 p-3 rounded-2xl text-start space-y-1.5">
        <label className="block text-[10px] font-black text-stone-500">
          {language === 'ar'
            ? 'خيار بديل: الصق رابط قوقل ماب من واتساب مباشرة'
            : 'Alternative option: Paste Google Maps link directly from WhatsApp'}
        </label>
        <input
          type="text"
          value={pastedLink}
          onChange={handlePasteChange}
          placeholder={
            language === 'ar'
              ? 'الصق الرابط هنا...'
              : 'Paste map link here...'
          }
          className="w-full text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-yellow text-stone-800 placeholder-stone-450 shadow-inner"
        />
        {parseError && (
          <p className="text-[10px] text-red-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>
              {language === 'ar'
                ? 'الرجاء التأكد من صحة الرابط الملصق.'
                : 'Please make sure the pasted link is valid.'}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
