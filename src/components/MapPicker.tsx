import React, { useState } from 'react';
import { Search, MapPin, Loader2, Navigation, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { useLanguage } from './LanguageContext';

interface MapPickerProps {
  latitude?: number;
  longitude?: number;
  onChange: (lat: number, lng: number) => void;
  onAddressSelect?: (address: string) => void;
}

// Regex to parse coordinates from any text or link (handles @lat,lng, q=lat,lng, /place/lat,lng etc.)
export const parseCoordinatesFromText = (text: string) => {
  if (!text) return null;
  
  // Try to find coordinates in any string containing numbers separated by comma (with optional spaces)
  const regex = /([-+]?\d{1,2}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    
    // Validate bounds - Saudi Arabia roughly lat 15 to 33, lng 34 to 56
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

  // Default coordinates centered on Uyun Al-Jiwa, Al-Qassim (عيون الجواء)
  const defaultLat = 26.5057;
  const defaultLng = 43.7915;

  const currentLat = latitude || defaultLat;
  const currentLng = longitude || defaultLng;

  // Reverse geocodes lat/lng into human readable Arabic address name
  const fetchAddress = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`
      );
      const data = await res.json();
      if (data && data.display_name) {
        if (onAddressSelect) {
          let cleanAddress = data.display_name;
          const parts = cleanAddress.split('،').map((p: string) => p.trim());
          if (parts.length > 3) {
            cleanAddress = parts.slice(0, Math.min(4, parts.length)).join('، ');
          }
          onAddressSelect(cleanAddress);
        }
      }
    } catch (err) {
      console.error('Error in reverse geocoding:', err);
    }
  };

  // Handle Locate Me via Geolocation API
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
              ? 'تنبيه لأجهزة الآيفون:\nيرجى الذهاب إلى الإعدادات ⚙️ -> الخصوصية والأمن -> خدمات الموقع، وتأكد من تفعيل خدمات الموقع والسماح لمتصفحك بالوصول للموقع، أو يمكنك البحث عن موقعك يدوياً.'
              : 'For iPhone & iOS users:\nPlease go to Settings ⚙️ -> Privacy & Security -> Location Services, ensure they are enabled, and allow your browser to access your location, or search manually.'
          );
        } else {
          // Fallback to low accuracy
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
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

  // Handle Search using OpenStreetMap Nominatim Geocoder
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const queryTerm = searchQuery.trim();
    if (!queryTerm) return;

    setSearching(true);
    try {
      // Append "عيون الجواء" if it's not present to localize the search
      let localizedQuery = queryTerm;
      const lowerQuery = queryTerm.toLowerCase();
      const hasLocationKeywords = 
        lowerQuery.includes('عيون') || 
        lowerQuery.includes('جواء') || 
        lowerQuery.includes('al-jiwa') || 
        lowerQuery.includes('uyun') || 
        lowerQuery.includes('jiwa');
      
      if (!hasLocationKeywords) {
        localizedQuery = `${queryTerm}, عيون الجواء`;
      }

      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(localizedQuery)}&limit=1`
      );
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        onChange(lat, lon);

        if (onAddressSelect && data[0].display_name) {
          let cleanAddress = data[0].display_name;
          const parts = cleanAddress.split('،').map((p: string) => p.trim());
          if (parts.length > 3) {
            cleanAddress = parts.slice(0, Math.min(4, parts.length)).join('، ');
          }
          onAddressSelect(cleanAddress);
        }
      } else {
        alert(
          language === 'ar' 
            ? 'عذراً! لم نجد هذا الحي أو العنوان في عيون الجواء. يرجى كتابة اسم الحي بشكل صحيح.' 
            : 'Sorry, we could not find this address. Try searching with a different name.'
        );
      }
    } catch (err) {
      console.error('Nominatim Geocoding Error:', err);
    } finally {
      setSearching(false);
    }
  };

  // Parse pasted link on the fly (supporting server-side URL expansion for goo.gl/maps shortlinks)
  const handlePasteChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setPastedLink(text);
    setParseError(false);
    
    if (!text.trim()) return;

    // 1. Try raw coordinates parsing first
    const parsed = parseCoordinatesFromText(text);
    if (parsed) {
      onChange(parsed.lat, parsed.lng);
      fetchAddress(parsed.lat, parsed.lng);
      return;
    }

    // 2. Try URL expansion if it's a link
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
    <div className="space-y-3.5 w-full text-start" id="map-picker-container">
      {/* Primary Action Button: Locate Me */}
      <button
        type="button"
        onClick={handleLocateMe}
        disabled={locating}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-yellow hover:bg-yellow-500 text-black font-extrabold text-sm rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
      >
        {locating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Navigation className="w-4 h-4 fill-black/25 rotate-45" />
        )}
        <span>{language === 'ar' ? 'تحديد الموقع' : 'Locate Position'}</span>
      </button>

      {/* Subtle Divider */}
      <div className="relative flex py-1 items-center">
        <div className="flex-grow border-t border-black/5"></div>
        <span className="flex-shrink mx-3 text-[10px] font-bold text-dark/30 uppercase tracking-wider">
          {language === 'ar' ? 'أو طرق أخرى' : 'Or alternative methods'}
        </span>
        <div className="flex-grow border-t border-black/5"></div>
      </div>

      {/* Search Input Area */}
      <form onSubmit={handleSearch} className="flex gap-1.5 w-full">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              language === 'ar' 
                ? 'ابحث عن اسم الحي أو الشارع' 
                : 'Search district or street name'
            }
            className="w-full text-xs bg-neutral-50 border border-black/10 rounded-xl pl-8 pr-3 py-2 outline-none focus:border-yellow text-dark placeholder-dark/30 shadow-xs"
          />
          <Search className="w-3.5 h-3.5 text-dark/30 absolute left-2.5 top-1/2 -translate-y-1/2" />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="px-3 bg-neutral-100 hover:bg-neutral-200 text-dark font-bold text-xs rounded-xl border border-black/10 transition-all shadow-xs flex items-center justify-center gap-1 min-w-[70px] cursor-pointer disabled:bg-neutral-200"
        >
          {searching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <span>{language === 'ar' ? 'بحث' : 'Search'}</span>
          )}
        </button>
      </form>

      {/* Dynamic Google Maps Link Paste Area */}
      <div className="bg-neutral-50 border border-black/5 p-2.5 rounded-xl text-start">
        <label className="block text-[10px] font-bold text-dark/50 mb-1">
          {language === 'ar' 
            ? '💡 خيار سريع: الصق رابط قوقل ماب من واتساب مباشرة!' 
            : '💡 Quick Option: Paste Google Maps link directly!'}
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
          className="w-full text-xs bg-white border border-black/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-yellow text-dark placeholder-dark/20 shadow-xs"
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
