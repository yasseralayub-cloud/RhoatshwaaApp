import React, { useState, useEffect, useRef } from 'react';
import { LanguageProvider, useLanguage } from './components/LanguageContext';
import { Header } from './components/Header';
import { CategoryNav } from './components/CategoryNav';
import { MenuCard } from './components/MenuCard';
import { CartDrawer } from './components/CartDrawer';
import { OrderTracker } from './components/OrderTracker';
import { AdminPanel } from './components/AdminPanel';
import { DriverPortal } from './components/DriverPortal';
import { MyAccount } from './components/MyAccount';
import { CATEGORIES, INITIAL_MENU_ITEMS, DEFAULT_BUSINESS_SETTINGS } from './initialData';
import { MenuItem, Promotion, BusinessSettings, CartItem, CartItemOption } from './types';
import { collection, onSnapshot, doc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Flame, Star, Coffee, AlertCircle, Building2, ShieldCheck, CheckCircle2, ExternalLink, Code2, Sparkles, Globe, FileText, Eye, Download, X, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PromotionCountdown } from './components/PromotionCountdown';
import { WelcomePortalModal } from './components/WelcomePortalModal';
import { SandwichCustomizationModal, isSandwichItem, isFriesItem } from './components/SandwichCustomizationModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { ChatBot } from './components/ChatBot';
import { getAppVersion } from './version';

const openCertificateFullscreen = async (url: string, defaultFallback: string) => {
  const targetUrl = url || defaultFallback;
  if (targetUrl.startsWith('data:')) {
    try {
      const res = await fetch(targetUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (e) {
      window.open(targetUrl, '_blank');
    }
  } else {
    window.open(targetUrl, '_blank');
  }
};

function MenuAndOrdersApp() {
  const { language, t, isRtl } = useLanguage();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Selected State variables
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(() => {
    return localStorage.getItem('rehla_privacy_accepted') !== 'true';
  });

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  // Certificate Lightbox Modal state
  const [activeCertificateModal, setActiveCertificateModal] = useState<{
    title: string;
    number: string;
    url?: string;
    type: 'cr' | 'tax' | 'sbc';
  } | null>(null);

  // PWA & iOS install prompt detectors
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Detect iOS standalone & browser type
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isIosDevice && !isStandalone) {
      setIsIos(true);
      const dismissed = sessionStorage.getItem('ios_pwa_dismissed');
      if (dismissed !== 'true') {
        setShowIosPrompt(true);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`PWA install prompt outcome: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleInstallOrWelcomeClick = async () => {
    const promptEvent = (window as any).deferredPrompt || deferredPrompt;
    if (promptEvent) {
      try {
        promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        console.log(`Native PWA install prompt response: ${outcome}`);
        (window as any).deferredPrompt = null;
        setDeferredPrompt(null);
        setShowInstallBanner(false);
      } catch (err) {
        console.error("Error launching native PWA prompt:", err);
        setIsWelcomeOpen(true);
      }
    } else {
      setIsWelcomeOpen(true);
    }
  };
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    // Check if there is an existing local cache, otherwise start with initial
    const saved = localStorage.getItem('simulated_menu');
    if (saved) {
      try {
        const parsed: MenuItem[] = JSON.parse(saved);
        const map = new Map<string, MenuItem>();
        parsed.forEach(item => map.set(item.id, item));
        
        INITIAL_MENU_ITEMS.forEach(def => {
          const existing = map.get(def.id);
          if (!existing) {
            map.set(def.id, def);
          } else {
            map.set(def.id, {
              ...existing,
              category: def.category,
              nameAr: existing.nameAr || def.nameAr,
              name: existing.name || def.name,
              price: (typeof existing.price === 'number' && !isNaN(existing.price) && existing.price >= 0) ? existing.price : def.price,
              image: existing.isCustomImage ? existing.image : def.image
            });
          }
        });
        
        return Array.from(map.values());
      } catch {
        return INITIAL_MENU_ITEMS;
      }
    }
    return INITIAL_MENU_ITEMS;
  });

  // Custom Categories state
  const [customCategories, setCustomCategories] = useState<import('./types').Category[]>(() => {
    try {
      const saved = localStorage.getItem('simulated_custom_categories');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return [];
  });

  const allCategories = React.useMemo(() => {
    const existingIds = new Set(CATEGORIES.map(c => c.id));
    const newOnes = customCategories.filter(c => !existingIds.has(c.id));
    return [...CATEGORIES, ...newOnes];
  }, [customCategories]);

  const checkInitialDriverPortal = () => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    const portalParam = urlParams.get('portal');
    const tabParam = urlParams.get('tab');
    const hash = window.location.hash;

    if (portalParam === 'driver' || tabParam === 'driver' || hash === '#driver') {
      return true;
    }
    return false;
  };

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('main');
  const [activeTab, setActiveTab] = useState<'menu' | 'tracker' | 'admin' | 'driver' | 'account'>(() => {
    return checkInitialDriverPortal() ? 'driver' : 'menu';
  });
  const [quotaExceeded, setQuotaExceeded] = useState(() => {
    return (window as any).firestoreQuotaExceeded === true;
  });

  const [showAdminTab, setShowAdminTab] = useState(() => {
    return localStorage.getItem('show_admin_tab') === 'true';
  });
  const [showDriverTab, setShowDriverTab] = useState(true);

  // Dynamic PWA Manifest & Driver Portal route synchronization
  useEffect(() => {
    localStorage.setItem('saved_active_tab', activeTab);
    const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    const appleIcon = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]') as HTMLMetaElement | null;

    if (activeTab === 'driver') {
      setShowDriverTab(true);
      localStorage.setItem('show_driver_tab', 'true');
      document.title = "مناديب رحلة شواء - تطبيق التوصيل";
      if (manifestLink) manifestLink.href = "/driver-manifest.json";
      if (appleIcon) appleIcon.href = "/driver-icon.jpg";
      if (appleTitle) appleTitle.content = "مناديب رحلة شواء";

      if (window.location.hash !== '#driver' && !window.location.search.includes('portal=driver')) {
        window.history.replaceState(null, '', '/?portal=driver#driver');
      }
    } else {
      document.title = "مطعم رحلة شواء - تتبع وتوصيل فوري";
      if (manifestLink) manifestLink.href = "/manifest.json";
      if (appleIcon) appleIcon.href = "/pwa-icon.jpg";
      if (appleTitle) appleTitle.content = "رحلة شواء";

      if (window.location.hash === '#driver') {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [activeTab]);

  useEffect(() => {
    const handleQuota = () => {
      setQuotaExceeded(true);
    };
    window.addEventListener('firestore-quota-exceeded', handleQuota);
    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuota);
    };
  }, []);

  // Custom tab navigation listener
  useEffect(() => {
    const handleNavigateTab = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setActiveTab(customEvent.detail);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('navigate-tab', handleNavigateTab);
    return () => {
      window.removeEventListener('navigate-tab', handleNavigateTab);
    };
  }, []);

  const isManualScrolling = useRef(false);

  // Smooth scroll click handler for Categories selection
  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategory(categoryId);
    const hadSearch = Boolean(searchTerm);
    if (hadSearch) {
      setSearchTerm('');
    }
    isManualScrolling.current = true;

    // Scroll category button into view in the horizontal nav
    const btn = document.getElementById(`cat-btn-${categoryId}`);
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    const scrollToTarget = () => {
      const element = document.getElementById(`category-sec-${categoryId}`);
      if (element) {
        const headerEl = document.querySelector('header');
        const headerHeight = headerEl ? headerEl.offsetHeight : 160;
        const rect = element.getBoundingClientRect();
        const absoluteTop = window.pageYOffset + rect.top;
        const targetPosition = Math.max(0, absoluteTop - headerHeight - 12);

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    };

    if (hadSearch) {
      setTimeout(scrollToTarget, 60);
    } else {
      scrollToTarget();
    }

    setTimeout(() => {
      isManualScrolling.current = false;
    }, 1000);
  };

  // Scroll spy listener to auto-highlight categories as user scrolls
  useEffect(() => {
    if (activeTab !== 'menu') return;

    const handleScroll = () => {
      if (isManualScrolling.current) return;

      // Find all rendered category sections
      const categorySections = allCategories.map(cat => ({
        id: cat.id,
        element: document.getElementById(`category-sec-${cat.id}`)
      })).filter(item => item.element !== null) as { id: string; element: HTMLElement }[];

      if (categorySections.length === 0) return;

      const headerEl = document.querySelector('header');
      const headerHeight = headerEl ? headerEl.offsetHeight : 160;
      const offset = headerHeight + 35;

      let activeId = categorySections[0].id;
      for (const section of categorySections) {
        const rect = section.element.getBoundingClientRect();
        if (rect.top <= offset) {
          activeId = section.id;
        } else {
          break;
        }
      }

      setSelectedCategory((prev) => {
        if (prev !== activeId) {
          // Gently scroll the CategoryNav tab item into view in the horizontal scrollbar
          const btn = document.getElementById(`cat-btn-${activeId}`);
          if (btn) {
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
          return activeId;
        }
        return prev;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [activeTab, allCategories, menuItems, searchTerm]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [socialAlertMessage, setSocialAlertMessage] = useState<string | null>(null);

  const handleSocialClick = (e: React.MouseEvent, url?: string) => {
    if (!url || url.trim() === '' || url.trim() === '#') {
      e.preventDefault();
      const msg = language === 'ar' ? 'سوف يتم إنشاؤه قريباً' : 'Coming soon';
      setSocialAlertMessage(msg);
      setTimeout(() => {
        setSocialAlertMessage((prev) => (prev === msg ? null : prev));
      }, 3500);
    }
  };

  const getFormattedWaUrl = (rawNumber?: string) => {
    if (!rawNumber || rawNumber.trim() === '') return '';
    const cleanNum = rawNumber.replace(/\D/g, '');
    if (!cleanNum) return '';
    const formatted = cleanNum.startsWith('0') ? '966' + cleanNum.slice(1) : cleanNum;
    return `https://wa.me/${formatted}`;
  };
  
  // Tracked last placed order to automatically show status tracking screen
  const [lastPlacedOrderId, setLastPlacedOrderId] = useState('');

  // Active Promo
  const [activePromo, setActivePromo] = useState<Promotion | null>(() => {
    const saved = localStorage.getItem('simulated_promotion');
    return saved ? JSON.parse(saved) : null;
  });

  // Business settings state from cloud store or default constants fallback
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(() => {
    const saved = localStorage.getItem('simulated_business_settings');
    return saved ? JSON.parse(saved) : DEFAULT_BUSINESS_SETTINGS;
  });

  // 1. Establish Realtime Sync with Firestore for the Menu catalog!
  // Any toggles / availability switches marked by an admin instantly update on the client screens!
  useEffect(() => {
    // Listen to collection 'menuItems'
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        collection(db, 'menuItems'),
        (snapshot) => {
          if (!snapshot.empty) {
            const docs: MenuItem[] = [];
            const structuralConflicts: { id: string; issues: string[]; rawData: any }[] = [];

            snapshot.forEach((snap) => {
              const data = snap.data() || {};
              const docId = snap.id;

              // Verify field integrity against MenuItem interface
              const issues: string[] = [];
              if (data.nameAr === undefined && data.name === undefined) {
                issues.push('Missing both name and nameAr');
              }
              if (data.price === undefined) {
                issues.push('Missing price property');
              } else if (typeof data.price !== 'number' && isNaN(Number(data.price))) {
                issues.push(`Invalid price value (${typeof data.price}: ${data.price})`);
              }
              if (data.category === undefined) {
                issues.push('Missing category property');
              }

              if (issues.length > 0) {
                structuralConflicts.push({ id: docId, issues, rawData: data });
              }

              // Find matching default item to preserve original image links and data
              const defaultItem = INITIAL_MENU_ITEMS.find((item) => item.id === docId);

              // Image Resolution Strategy:
              // Strictly rely on defaultItem.image from INITIAL_MENU_ITEMS for pre-defined menu items,
              // unless data.isCustomImage is true OR the item was newly created by the admin (!defaultItem).
              let resolvedImage = defaultItem !== undefined ? defaultItem.image : String(data.image || '');
              if (data.isCustomImage && data.image !== undefined) {
                resolvedImage = String(data.image);
              }

              // Precise mapping with strict document ID binding and type safe coercions
              const menuItem: MenuItem = {
                ...defaultItem,
                ...data,
                id: docId, // Ensure Firestore Document ID always overrides any embedded id property
                name: String(data.name || defaultItem?.name || data.nameAr || 'Item'),
                nameAr: String(data.nameAr || defaultItem?.nameAr || data.name || 'صنف'),
                description: String(data.description || defaultItem?.description || ''),
                descriptionAr: String(data.descriptionAr || defaultItem?.descriptionAr || ''),
                price: typeof data.price === 'number' ? data.price : (Number(data.price) || defaultItem?.price || 0),
                category: String(data.category || defaultItem?.category || 'general'),
                image: resolvedImage,
                calories: typeof data.calories === 'number' ? data.calories : (Number(data.calories) || defaultItem?.calories || 0),
                isPopular: data.isPopular !== undefined ? Boolean(data.isPopular) : Boolean(defaultItem?.isPopular),
                isAvailable: data.isAvailable !== undefined ? Boolean(data.isAvailable) : (defaultItem?.isAvailable ?? true),
                dineInOnly: data.dineInOnly !== undefined ? Boolean(data.dineInOnly) : Boolean(defaultItem?.dineInOnly),
                isCustomImage: Boolean(data.isCustomImage),
              };

              docs.push(menuItem);
            });

            if (structuralConflicts.length > 0) {
              console.error(
                `🚨 [Firestore Sync Error] Found ${structuralConflicts.length} document(s) in 'menuItems' with schema conflicts:`,
                structuralConflicts
              );
            } else {
              console.log(`✅ [Firestore Sync] Successfully synchronized ${docs.length} menu items from 'menuItems' collection.`);
            }

            setMenuItems(docs);
            localStorage.setItem('simulated_menu', JSON.stringify(docs));
          } else {
            console.log('Firestore menuItems collection is empty. Showing default items.');
            // Automatically seed the empty database with default items and business settings!
            // This is perfect for the user's brand new database so they don't have to do it manually.
            const autoSeedDatabase = async () => {
              try {
                console.log('Auto-seeding empty database...');
                const updatedItems = INITIAL_MENU_ITEMS.map(item => ({ ...item, isAvailable: true }));
                for (const item of updatedItems) {
                  await setDoc(doc(db, 'menuItems', item.id), item);
                }
                await setDoc(doc(db, 'settings', 'business'), DEFAULT_BUSINESS_SETTINGS);
                console.log('Auto-seeding completed successfully!');
              } catch (err) {
                console.error('Error during auto-seeding:', err);
              }
            };
            autoSeedDatabase();
          }
        },
        (error: any) => {
          console.warn('Could not establish live Firestore menu connection. Defaulting to cached data:', error);
          const errMsg = error?.message || String(error);
          if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted') || error?.code === 'resource-exhausted') {
            console.warn('Quota exceeded. Auto-unsubscribing menu listener to save memory & prevent connection retries.');
            if (unsub) unsub();
            setQuotaExceeded(true);
            (window as any).firestoreQuotaExceeded = true;
          }
        }
      );
    } catch (e) {
      console.warn('Failed to initialize menuItems listener:', e);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // 1.5 Establish Realtime Sync with Firestore for active promotion!
  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        doc(db, 'promotions', 'active'),
        (snapshot) => {
          if (snapshot.exists()) {
            const promo = snapshot.data() as Promotion;
            setActivePromo(promo);
            localStorage.setItem('simulated_promotion', JSON.stringify(promo));
          } else {
            console.log('No active promotion document in Firestore. Using offline/local.');
          }
        },
        (error: any) => {
          console.warn('Could not establish live Firestore promotion connection:', error);
          const errMsg = error?.message || String(error);
          if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted') || error?.code === 'resource-exhausted') {
            console.warn('Quota exceeded. Auto-unsubscribing active promo listener.');
            if (unsub) unsub();
            setQuotaExceeded(true);
            (window as any).firestoreQuotaExceeded = true;
          }
        }
      );
    } catch (e) {
      console.warn('Failed to initialize active promo listener:', e);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // 1.8 Real-time Sync with Firestore for business settings doc
  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      unsub = onSnapshot(
        doc(db, 'settings', 'business'),
        (snapshot) => {
          if (snapshot.exists()) {
            const settingsObj = snapshot.data() as BusinessSettings;
            setBusinessSettings(settingsObj);
            localStorage.setItem('simulated_business_settings', JSON.stringify(settingsObj));
          } else {
            console.log('No settings document found in Firestore. Using offline default.');
          }
        },
        (error: any) => {
          console.warn('Could not establish live Firestore settings connection:', error);
          const errMsg = error?.message || String(error);
          if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted') || error?.code === 'resource-exhausted') {
            console.warn('Quota exceeded. Auto-unsubscribing settings listener.');
            if (unsub) unsub();
            setQuotaExceeded(true);
            (window as any).firestoreQuotaExceeded = true;
          }
        }
      );
    } catch (e) {
      console.warn('Failed to initialize settings listener:', e);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Synchronically update the website icon (favicon / apple-touch-icon) from business logo settings
  useEffect(() => {
    if (businessSettings?.logoUrl) {
      // 1. Synchronize the Apple Touch Icon (Mobile launchers / homescreen meta tag)
      let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
      if (!appleIcon) {
        appleIcon = document.createElement('link');
        appleIcon.setAttribute('rel', 'apple-touch-icon');
        document.head.appendChild(appleIcon);
      }
      appleIcon.setAttribute('href', businessSettings.logoUrl);

      // 2. Synchronize standard favicon links for modern browsers
      let favIcon = document.querySelector('link[rel="icon"]');
      if (!favIcon) {
        favIcon = document.createElement('link');
        favIcon.setAttribute('rel', 'icon');
        favIcon.setAttribute('type', 'image/jpeg');
        document.head.appendChild(favIcon);
      }
      favIcon.setAttribute('href', businessSettings.logoUrl);

      // 3. Keep the document title updated with the Arabic / English restaurant name dynamically
      const resName = language === 'ar' 
        ? (businessSettings.restaurantNameAr || 'رحلة شواء')
        : (businessSettings.restaurantNameEn || 'Grilling Journey');
      document.title = `${resName} - ${language === 'ar' ? 'طلب وتوصيل فوري' : 'Order & Fast Delivery'}`;
    }
  }, [businessSettings?.logoUrl, language]);

  // Check for admin/driver query parameter or pathname to reveal and switch tabs
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const path = window.location.pathname;
    let changed = false;
    let is_admin = false;
    let is_driver = false;

    if (params.get('admin') === 'true' || path === '/admin' || path.startsWith('/admin/')) {
      setShowAdminTab(true);
      localStorage.setItem('show_admin_tab', 'true');
      localStorage.setItem('admin_quick_access', 'true');
      setActiveTab('admin');
      changed = true;
      is_admin = true;
    }

    if (params.get('driver') === 'true' || path === '/driver' || path.startsWith('/driver/')) {
      setShowDriverTab(true);
      localStorage.setItem('show_driver_tab', 'true');
      setActiveTab('driver');
      changed = true;
      is_driver = true;
    }

    if (changed) {
      // Clean up search params if needed
      const cleanParams = new URLSearchParams(window.location.search);
      cleanParams.delete('admin');
      cleanParams.delete('driver');
      const suffix = cleanParams.toString();
      
      let newPath = path;
      if (is_admin) {
        newPath = '/admin';
      } else if (is_driver) {
        newPath = '/driver';
      }
      
      const newUrl = newPath + (suffix ? `?${suffix}` : '');
      window.history.replaceState({}, document.title, newUrl);
      setCurrentPath(newPath);
    }
  }, []);

  // Dynamic Manifest Link Updater based on path for co-existing installable PWAs
  useEffect(() => {
    const path = window.location.pathname;
    let manifestUrl = '/manifest.json';
    if (path === '/driver' || path.startsWith('/driver/')) {
      manifestUrl = '/manifest.json?type=driver';
    } else if (path === '/admin' || path.startsWith('/admin/')) {
      manifestUrl = '/manifest.json?type=admin';
    }
    
    let link = document.querySelector('link[rel="manifest"]');
    if (link) {
      link.setAttribute('href', manifestUrl);
    } else {
      link = document.createElement('link');
      link.setAttribute('rel', 'manifest');
      link.setAttribute('href', manifestUrl);
      document.head.appendChild(link);
    }
  }, [currentPath]);

  // 1.95 Check if PWA installer / welcome wizard should show automatically on first visit
  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('has_seen_welcome_wizard_rehlabbq_v2');
    if (!hasSeenWelcome) {
      const timer = setTimeout(() => {
        setIsWelcomeOpen(true);
      }, 1200); // Elegant delay for clean entrance and visual weight
      localStorage.setItem('has_seen_welcome_wizard_rehlabbq_v2', 'true');
      return () => clearTimeout(timer);
    }
  }, []);

  // 1.9 Parse Tap Payment URL Parameters on mount to verify and auto-track checkout receipts!
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlOrderId = params.get('orderId');
    const tapId = params.get('tap_id');

    if (urlOrderId) {
      setActiveTab('tracker');
      setLastPlacedOrderId(urlOrderId);
      localStorage.setItem('last_order_id', urlOrderId);

      // Clean up the URL search parameters to prevent infinite tracking triggers on reload
      try {
        const newUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
      } catch (e) {
        console.warn('Could not clean up payment parameters from URL:', e);
      }

      // If we also got a Tap transaction ID to verify:
      if (tapId) {
        const verifyPayment = async () => {
          try {
            console.log(`Verifying payment of ID: ${tapId} for Order: ${urlOrderId}`);
            const checkRes = await fetch(`/api/check-tap-status/${tapId}`);
            const checkData = await checkRes.json();

            if (checkRes.ok && checkData.success && checkData.status === 'CAPTURED') {
              // Upgrades order state dynamically in Firestore
              const { doc, getDoc, updateDoc } = await import('firebase/firestore');
              const orderRef = doc(db, 'orders', urlOrderId);
              const snap = await getDoc(orderRef);

              if (snap.exists()) {
                const orderData = snap.data();
                const updatedOrder = {
                  ...orderData,
                  id: urlOrderId,
                  status: 'preparing'
                };

                await updateDoc(orderRef, {
                  status: 'preparing',
                  whatsappSent: true
                });

                // Securely trigger server-side Telegram bot order notification dispatch for verified online payment
                try {
                  fetch('/api/notify-telegram', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      order: updatedOrder,
                      telegramBotToken: businessSettings?.telegramBotToken,
                      telegramChatId: businessSettings?.telegramChatId,
                      telegramBotEnabled: businessSettings?.telegramBotEnabled
                    })
                  }).catch(e => console.warn('Telegram payment notification dispatcher error:', e));
                } catch (teleErr) {
                  console.warn('Telegram payment notification trigger failed:', teleErr);
                }
              }

              // Sync down status into cache
              try {
                const stored = localStorage.getItem('simulated_orders');
                if (stored) {
                  const parsedList: any[] = JSON.parse(stored);
                  const foundIdx = parsedList.findIndex(o => o.id === urlOrderId);
                  if (foundIdx !== -1) {
                    parsedList[foundIdx].status = 'preparing';
                    localStorage.setItem('simulated_orders', JSON.stringify(parsedList));
                  }
                }
              } catch (cacheErr) {
                console.warn('Update local cache error:', cacheErr);
              }

              alert(language === 'ar'
                ? `🎉 رائع! تم تأكيد وتوثيق عملية الدفع الإلكتروني بنجاح للطلب ${urlOrderId}.`
                : `🎉 Magnificent! Electronic payment verified and processed successfully for order ${urlOrderId}.`);
            } else {
              console.warn('Payment check returned unsuccessful:', checkData);
            }
          } catch (e) {
            console.error('Exception performing state verification:', e);
          } finally {
            // Clean up the address bar queries cleanly
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        };

        verifyPayment();
      } else {
        // Just clean URL params if we only had orderId
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [language]);

  // Sync state between App & children panels
  const handleMenuUpdate = (newMenu: MenuItem[]) => {
    setMenuItems(newMenu);
    try {
      localStorage.setItem('simulated_menu', JSON.stringify(newMenu));
    } catch (e) {
      console.warn('Failed to save menu items to localStorage:', e);
    }
  };

  const handleSettingsUpdate = (newSettings: BusinessSettings) => {
    setBusinessSettings(newSettings);
    localStorage.setItem('simulated_business_settings', JSON.stringify(newSettings));
  };

  const handlePromoUpdate = (newPromo: Promotion | null) => {
    setActivePromo(newPromo);
    if (!newPromo) {
      localStorage.removeItem('simulated_promotion');
    } else {
      localStorage.setItem('simulated_promotion', JSON.stringify(newPromo));
    }
  };

  // Cart operations
  const handleAddToCart = (itemOrCartItem: MenuItem | CartItem) => {
    // Check if it is a CartItem object (from drawer)
    if ('item' in itemOrCartItem && 'id' in itemOrCartItem) {
      const cartItem = itemOrCartItem as CartItem;
      setCart((prevCart) => 
        prevCart.map((c) => c.id === cartItem.id ? { ...c, quantity: c.quantity + 1 } : c)
      );
      return;
    }

    // It's a MenuItem (from main card addition)
    const item = itemOrCartItem as MenuItem;
    const hasSizing = ['s2', 's4', 'g1', 'g5', 'g7', 'g10'].includes(item.id);
    const isSodasGroup = item.id === 'drinks-soft-group';
    if (isSandwichItem(item) || isFriesItem(item) || hasSizing || isSodasGroup) {
      setCustomizingItem(item);
    } else {
      setCart((prevCart) => {
        const existing = prevCart.find((c) => c.item.id === item.id && !c.customizations);
        if (existing) {
          return prevCart.map((c) =>
            (c.item.id === item.id && !c.customizations) ? { ...c, quantity: c.quantity + 1 } : c
          );
        }
        return [...prevCart, { id: item.id, item, quantity: 1 }];
      });
    }
  };

  const handleCustomSandwichConfirm = (item: MenuItem, qty: number, options: CartItemOption) => {
    setCart((prevCart) => {
      // Unique hash for customized variants
      const optionsHash = JSON.stringify(options);
      const uniqueCartItemId = `${item.id}-${optionsHash}`;

      const existingIndex = prevCart.findIndex((c) => c.id === uniqueCartItemId);
      if (existingIndex > -1) {
        return prevCart.map((c, idx) =>
          idx === existingIndex ? { ...c, quantity: c.quantity + qty } : c
        );
      }

      return [...prevCart, {
        id: uniqueCartItemId,
        item,
        quantity: qty,
        customizations: options
      }];
    });
  };

  const handleRemoveFromCart = (itemOrCartItem: MenuItem | CartItem) => {
    if ('item' in itemOrCartItem && 'id' in itemOrCartItem) {
      const cartItem = itemOrCartItem as CartItem;
      setCart((prevCart) => {
        const existing = prevCart.find((c) => c.id === cartItem.id);
        if (existing && existing.quantity > 1) {
          return prevCart.map((c) =>
            c.id === cartItem.id ? { ...c, quantity: c.quantity - 1 } : c
          );
        }
        return prevCart.filter((c) => c.id !== cartItem.id);
      });
      return;
    }

    const item = itemOrCartItem as MenuItem;
    setCart((prevCart) => {
      const existing = prevCart.find((c) => c.item.id === item.id && !c.customizations);
      if (existing && existing.quantity > 1) {
        return prevCart.map((c) =>
          (c.item.id === item.id && !c.customizations) ? { ...c, quantity: c.quantity - 1 } : c
        );
      }
      return prevCart.filter((c) => !(c.item.id === item.id && !c.customizations));
    });
  };

  const handleClearCart = () => {
    setCart([]);
  };

  // Redirect to tracker panel on order completion
  const handleOrderSuccess = (orderId: string) => {
    setLastPlacedOrderId(orderId);
    setActiveTab('tracker');
    // Jump scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Convert old order items back to cart, cancel the old order, and load the cart drawer for modifications
  const handleModifyOrder = async (order: any) => {
    const loadedCartItems: CartItem[] = order.items.map((orderIt: any) => {
      const braceIndex = orderIt.id.indexOf('-{');
      const baseItemId = braceIndex > -1 ? orderIt.id.substring(0, braceIndex) : orderIt.id;

      const matchItem = menuItems.find((m) => m.id === baseItemId) || {
        id: baseItemId,
        name: orderIt.name,
        nameAr: orderIt.nameAr,
        price: orderIt.price,
        description: '',
        descriptionAr: '',
        category: 'main',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600',
        calories: 0,
        isAvailable: true
      };

      let options: CartItemOption | undefined = undefined;
      if (braceIndex > -1) {
        try {
          options = JSON.parse(orderIt.id.substring(braceIndex + 1));
        } catch (e) {
          console.warn('Failed to parse options JSON during modification:', e);
        }
      }

      return {
        id: orderIt.id,
        item: matchItem,
        quantity: orderIt.quantity,
        customizations: options
      };
    });

    setCart(loadedCartItems);

    try {
      await updateDoc(doc(db, 'orders', order.id), { status: 'cancelled' });
    } catch (firebaseErr) {
      console.warn('Could not cancel old order on modification:', firebaseErr);
    }

    try {
      const stored = localStorage.getItem('simulated_orders');
      if (stored) {
        const parsedList: any[] = JSON.parse(stored);
        const updatedList = parsedList.map(o => 
          o.id === order.id ? { ...o, status: 'cancelled' } : o
        );
        localStorage.setItem('simulated_orders', JSON.stringify(updatedList));
      }
    } catch (e) {
      console.warn('Local storage sync failed:', e);
    }

    setActiveTab('menu');
    setIsCartOpen(true);
  };

  // Reorder items from account history
  const handleReorder = (items: any[]) => {
    const loadedCartItems: CartItem[] = items.map((orderIt: any) => {
      const braceIndex = orderIt.id.indexOf('-{');
      const baseItemId = braceIndex > -1 ? orderIt.id.substring(0, braceIndex) : orderIt.id;

      const matchItem = menuItems.find((m) => m.id === baseItemId) || {
        id: baseItemId,
        name: orderIt.name,
        nameAr: orderIt.nameAr,
        price: orderIt.price,
        description: '',
        descriptionAr: '',
        category: 'main',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600',
        calories: 0,
        isAvailable: true
      };

      let options: CartItemOption | undefined = undefined;
      if (braceIndex > -1) {
        try {
          options = JSON.parse(orderIt.id.substring(braceIndex + 1));
        } catch (e) {
          console.warn('Failed to parse options JSON during reordering:', e);
        }
      }

      return {
        id: orderIt.id,
        item: matchItem,
        quantity: orderIt.quantity,
        customizations: options
      };
    });

    setCart(loadedCartItems);
    setActiveTab('menu');
    setIsCartOpen(true);
  };

  // Filters catalog list matching both Arabic & English titles / descriptions plus keywords
  const filteredMenuItems = menuItems.filter((item) => {
    // Exclude redundant merged items from display
    const MERGED_IDS_TO_EXCLUDE = new Set([
      'g2', 'g8', 'g9', 'g4', 's5'
    ]);
    if (MERGED_IDS_TO_EXCLUDE.has(item.id)) return false;

    // Filter by input search text
    if (!searchTerm.trim()) return true;
    const cleanSearch = searchTerm.toLowerCase();
    
    return (
      item.name.toLowerCase().includes(cleanSearch) ||
      item.nameAr.includes(cleanSearch) ||
      (item.description && item.description.toLowerCase().includes(cleanSearch)) ||
      (item.descriptionAr && item.descriptionAr.includes(cleanSearch))
    );
  });

  const cartTotalItemsCount = cart.reduce((sum, c) => sum + c.quantity, 0);

  // Check if we are on standalone sub-pages
  const isStandaloneDriver = currentPath === '/driver' || currentPath.startsWith('/driver/') || window.location.search.includes('driver=true') || window.location.search.includes('mode=driver');
  const isStandaloneAdmin = currentPath === '/admin' || currentPath.startsWith('/admin/') || window.location.search.includes('admin=true');

  if (isStandaloneDriver) {
    return (
      <div className="min-h-screen bg-[#F9F9FB] text-dark select-none py-6 px-4">
        <div className="max-w-7xl mx-auto">
          <DriverPortal businessSettings={businessSettings} />
        </div>
      </div>
    );
  }

  if (isStandaloneAdmin) {
    return (
      <div className="min-h-screen bg-[#F9F9FB] text-dark select-none py-2 md:py-6 px-1 md:px-4">
        <div className="max-w-full w-full mx-auto">
          <AdminPanel 
            onMenuUpdate={handleMenuUpdate} 
            menuItems={menuItems} 
            onPromoUpdate={handlePromoUpdate}
            activePromo={activePromo}
            businessSettings={businessSettings}
            onSettingsUpdate={handleSettingsUpdate}
            onHideAdminTab={() => {
              window.location.href = '/';
            }}
          />
        </div>
      </div>
    );
  }

  // Standalone full-screen Driver Portal View (eliminates clash with Client store header/nav)
  if (activeTab === 'driver') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans select-none text-start">
        <main className="max-w-4xl mx-auto p-2 sm:p-6">
          <DriverPortal 
            businessSettings={businessSettings} 
            onExitToClient={() => setActiveTab('menu')}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#FCFCFB] text-dark select-none selection:bg-yellow/30 selection:text-black">
      
      {/* Premium Header toolbar */}
      <Header
        cartCount={cartTotalItemsCount}
        onCartClick={() => setIsCartOpen(true)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'admin') {
            setShowAdminTab(true);
            localStorage.setItem('show_admin_tab', 'true');
          }
          if (tab === 'driver') {
            setShowDriverTab(true);
            localStorage.setItem('show_driver_tab', 'true');
          }
          setActiveTab(tab);
        }}
        isAdminAuthenticated={localStorage.getItem('last_order_id') !== null}
        businessSettings={businessSettings}
        showAdminTab={showAdminTab}
        showDriverTab={showDriverTab}
        onWelcomeClick={handleInstallOrWelcomeClick}
        categories={allCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={handleSelectCategory}
      />


      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 md:px-6 py-6 font-sans">
        
        {activeTab === 'menu' && (
          <div className="space-y-6">

            {/* Active Promotion Countdown bar */}
            {activePromo && activePromo.isActive && (
              <PromotionCountdown promotion={activePromo} onExpired={() => console.log('Promotion expired')} />
            )}

            {/* Menu items display GRID layout */}
            <div className="space-y-12">
              {filteredMenuItems.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-dark/40 text-center border border-dashed border-black/10 rounded-[2rem] bg-neutral-50 p-6 animate-fade-in">
                  <AlertCircle className="w-10 h-10 text-dark/30 stroke-[1.5] mb-2" />
                  <p className="font-semibold text-dark/80 text-sm mb-0.5">{language === 'ar' ? 'لم يعثر على نتائج للبحث' : 'No Items Found'}</p>
                  <p className="text-xs text-dark/50 max-w-sm">{language === 'ar' ? 'جرّب البحث عن صنف آخر كالشاورما أو الكباب أو القهوة العربية الممتازة' : 'Try searching for items in our specific catalog.'}</p>
                </div>
              ) : (
                allCategories.map((category) => {
                  const categoryItems = filteredMenuItems.filter(item => item.category === category.id);
                  if (categoryItems.length === 0) return null;

                  return (
                    <div
                      key={category.id}
                      id={`category-sec-${category.id}`}
                      className="space-y-6 pt-6 scroll-mt-[175px] md:scroll-mt-[190px]"
                    >
                      <div className="flex justify-between items-center text-dark border-b border-black/5 pb-2 text-start">
                        <div>
                          <h3 className="font-bold font-serif text-xl flex items-center gap-1.5 uppercase tracking-wide">
                            <Flame className="w-4 h-4 text-yellow animate-pulse" />
                            {language === 'ar' ? category.nameAr : category.name}
                          </h3>
                          <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                            {categoryItems.length} {language === 'ar' ? 'خيارات لذيذة' : 'choices found'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence mode="popLayout">
                          {categoryItems.map((item) => {
                            const cartQty = cart.filter((c) => c.item.id === item.id).reduce((sum, c) => sum + c.quantity, 0);
                            return (
                              <MenuCard
                                key={item.id}
                                item={item}
                                cartQuantity={cartQty}
                                onAdd={handleAddToCart}
                                onRemove={handleRemoveFromCart}
                                activePromo={activePromo}
                              />
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>
        )}

        {/* Tracker status panel */}
        {activeTab === 'tracker' && (
          <OrderTracker 
            initialOrderId={lastPlacedOrderId} 
            businessSettings={businessSettings} 
            onModifyOrder={handleModifyOrder}
          />
        )}

        {/* Admin administrative controllers */}
        {activeTab === 'admin' && (
          <AdminPanel 
            onMenuUpdate={handleMenuUpdate} 
            menuItems={menuItems} 
            onPromoUpdate={handlePromoUpdate}
            activePromo={activePromo}
            businessSettings={businessSettings}
            onSettingsUpdate={handleSettingsUpdate}
            onHideAdminTab={() => {
              setShowAdminTab(false);
              localStorage.removeItem('show_admin_tab');
              setActiveTab('menu');
            }}
          />
        )}

        {/* Customer Account & Addresses portal */}
        {activeTab === 'account' && (
          <MyAccount 
            onReorder={handleReorder} 
            activePromo={activePromo} 
          />
        )}

      </main>

      {/* Cart Slider modal drawer overlay */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onAdd={handleAddToCart}
        onRemove={handleRemoveFromCart}
        onClear={handleClearCart}
        onOrderSuccess={handleOrderSuccess}
        activePromo={activePromo}
        businessSettings={businessSettings}
      />

      {/* Official Business Accreditation & Social Media Footer */}
      <footer className="bg-[#242629] text-white pt-10 pb-0 mt-20 font-sans shadow-inner border-t border-[#333]">
        <div className="max-w-6xl mx-auto space-y-6 px-4">
          
          <div className="text-center">
            <h3 className="text-lg font-bold mb-6">
              {language === 'ar' ? 'تابعنا' : 'Follow Us'}
            </h3>
            
            {/* Social Icons */}
            <div className="flex items-center justify-center gap-5">
              {/* WhatsApp */}
              <a 
                href={getFormattedWaUrl(businessSettings?.whatsappNumber || '0502163363')} 
                onClick={(e) => handleSocialClick(e, getFormattedWaUrl(businessSettings?.whatsappNumber || '0502163363'))}
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-white hover:opacity-80 transition hover:scale-110"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                  <path d="M12.031 0C5.385 0 0 5.388 0 12.031c0 2.128.552 4.195 1.603 6.015L.141 23.4l5.52-1.449A11.967 11.967 0 0012.031 24c6.643 0 12.028-5.387 12.028-12.03S18.674 0 12.031 0zM12.03 21.96c-1.802 0-3.568-.485-5.116-1.402l-.367-.217-3.8.997 1.018-3.704-.239-.38C2.502 15.541 1.95 13.805 1.95 12.032 1.95 6.47 6.467 1.95 12.03 1.95c5.565 0 10.082 4.52 10.082 10.082 0 5.562-4.517 10.08-10.082 10.08zm5.534-7.56c-.303-.153-1.796-.887-2.074-.988-.278-.102-.482-.153-.684.153-.203.306-.783.988-.961 1.192-.178.204-.356.23-.66.077-1.838-.925-3.32-2.315-4.226-4.237-.15-.316.143-.294.437-.872.102-.204.051-.383-.025-.536-.076-.153-.684-1.646-.938-2.254-.247-.591-.498-.51-.684-.52-.177-.008-.382-.01-.586-.01-.204 0-.535.076-.814.382C6.012 7.03 5.15 7.846 5.15 9.502c0 1.656 1.144 3.261 1.303 3.475.158.214 2.373 3.621 5.751 5.08.803.346 1.43.553 1.918.708.805.257 1.538.22 2.115.133.645-.097 1.796-.734 2.05-1.442.254-.709.254-1.317.178-1.443-.077-.126-.28-.203-.584-.356z"/>
                </svg>
              </a>
              {/* Snapchat */}
              <a 
                href={businessSettings?.socialSnapchat || '#'} 
                onClick={(e) => handleSocialClick(e, businessSettings?.socialSnapchat)}
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:opacity-80 transition hover:scale-110"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="-153.591 -252.05 1331.122 1512.3" fill="currentColor" className="h-8 w-auto text-white">
                  <path d="M1020.263 737.6c-7.1-19.4-20.7-29.7-36.1-38.3-2.9-1.7-5.6-3.1-7.8-4.1-4.6-2.4-9.3-4.7-14-7.1-48.1-25.5-85.7-57.7-111.7-95.8-8.8-12.9-14.9-24.5-19.2-34-2.2-6.4-2.1-10-.5-13.3 1.2-2.5 4.4-5.1 6.2-6.4 8.3-5.5 16.8-11 22.6-14.7 10.3-6.7 18.5-12 23.7-15.6 19.8-13.8 33.6-28.5 42.2-44.9 12.2-23.1 13.7-49.5 4.3-74.3-13-34.4-45.6-55.8-85-55.8-8.2 0-16.5.9-24.7 2.7-2.2.5-4.3 1-6.4 1.5.4-23.4-.2-48.4-2.3-72.8-7.4-86-37.5-131.1-68.9-167-13.1-15-35.9-36.9-70.1-56.5-47.7-27.4-101.7-41.2-160.6-41.2-58.7 0-112.7 13.8-160.4 41.1-34.4 19.6-57.2 41.6-70.2 56.5-31.4 35.9-61.5 81-68.9 167-2.1 24.4-2.6 49.4-2.3 72.8-2.1-.5-4.3-1-6.4-1.5-8.2-1.8-16.6-2.7-24.7-2.7-39.4 0-72 21.4-85 55.8-9.4 24.8-7.9 51.2 4.3 74.3 8.6 16.4 22.5 31.1 42.2 44.9 5.3 3.7 13.4 9 23.7 15.6 5.6 3.6 13.7 8.9 21.7 14.2 1.2.8 5.5 4 7 7 1.7 3.4 1.7 7.1-.8 13.9-4.2 9.3-10.3 20.7-18.9 33.3-25.5 37.3-62 68.9-108.5 94.1-24.7 13.1-50.3 21.8-61.1 51.2-8.2 22.2-2.8 47.5 17.9 68.8 6.8 7.3 15.4 13.8 26.2 19.8 25.4 14 47 20.9 64 25.6 3 .9 9.9 3.1 12.9 5.8 7.6 6.6 6.5 16.6 16.6 31.2 6.1 9.1 13.1 15.3 18.9 19.3 21.1 14.6 44.9 15.5 70.1 16.5 22.7.9 48.5 1.9 77.9 11.6 12.2 4 24.9 11.8 39.5 20.8 35.2 21.7 83.5 51.3 164.2 51.3 80.8 0 129.3-29.8 164.8-51.5 14.6-8.9 27.2-16.7 39-20.6 29.4-9.7 55.2-10.7 77.9-11.6 25.2-1 48.9-1.9 70.1-16.5 6.6-4.6 15-12.1 21.6-23.5 7.2-12.3 7.1-21 13.9-26.9 2.8-2.4 8.9-4.5 12.2-5.5 17.1-4.7 39-11.6 64.9-25.9 11.5-6.3 20.4-13.2 27.5-21.1l.3-.3c19.3-21 24.2-45.5 16.2-67.2zm-71.7 38.5c-43.8 24.2-72.9 21.6-95.5 36.1-19.2 12.4-7.9 39.1-21.8 48.7-17.2 11.9-67.9-.8-133.4 20.8-54 17.9-88.5 69.2-185.8 69.2-97.5 0-131-51.1-185.8-69.2-65.5-21.6-116.3-8.9-133.4-20.8-13.9-9.6-2.6-36.3-21.8-48.7-22.6-14.6-51.7-12-95.5-36.1-27.9-15.4-12.1-24.9-2.8-29.4 158.6-76.7 183.8-195.3 185-204.2 1.4-10.6 2.9-19-8.8-29.9-11.3-10.5-61.6-41.6-75.5-51.3-23.1-16.1-33.2-32.2-25.7-52 5.2-13.7 18-18.8 31.5-18.8 4.2 0 8.5.5 12.6 1.4 25.3 5.5 49.9 18.2 64.1 21.6 2 .5 3.7.7 5.2.7 7.6 0 10.2-3.8 9.7-12.5-1.6-27.7-5.6-81.7-1.2-132.2 6-69.4 28.4-103.8 55-134.3 12.8-14.6 72.8-78 187.5-78 115 0 174.7 63.4 187.5 78 26.6 30.4 49 64.8 55 134.3 4.4 50.5.6 104.5-1.2 132.2-.6 9.1 2.2 12.5 9.7 12.5 1.5 0 3.3-.2 5.2-.7 14.2-3.4 38.8-16.1 64.1-21.6 4.1-.9 8.4-1.4 12.6-1.4 13.5 0 26.3 5.2 31.5 18.8 7.5 19.8-2.7 35.9-25.7 52-13.9 9.7-64.2 40.8-75.5 51.3-11.7 10.8-10.2 19.2-8.8 29.9 1.1 8.9 26.4 127.5 185 204.2 9 4.5 24.9 14-3 29.4z" />
                </svg>
              </a>
              {/* Tiktok */}
              <a 
                href={businessSettings?.socialTiktok || '#'} 
                onClick={(e) => handleSocialClick(e, businessSettings?.socialTiktok)}
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-white hover:opacity-80 transition hover:scale-110"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 2.23-1.02 4.41-2.62 5.91-1.74 1.63-4.22 2.39-6.57 2.06-2.52-.35-4.81-1.95-5.91-4.2-1.08-2.22-1.02-4.93.18-7.08 1.18-2.12 3.31-3.6 5.67-4.04 1.05-.19 2.13-.19 3.19-.05v4.21c-.81-.11-1.65-.04-2.43.25-1.13.43-2.07 1.34-2.45 2.47-.39 1.18-.28 2.53.31 3.63.63 1.18 1.83 2.04 3.14 2.27 1.29.23 2.68-.05 3.73-.83 1.07-.81 1.76-2.11 1.81-3.48.06-2.08.03-4.16.03-6.24V.02z"/>
                </svg>
              </a>
              {/* Instagram */}
              <a 
                href={businessSettings?.socialInstagram || '#'} 
                onClick={(e) => handleSocialClick(e, businessSettings?.socialInstagram)}
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-white hover:opacity-80 transition hover:scale-110"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
              </a>
              {/* X / Twitter */}
              <a 
                href={businessSettings?.socialX || '#'} 
                onClick={(e) => handleSocialClick(e, businessSettings?.socialX)}
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-white hover:opacity-80 transition hover:scale-110"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>

            {/* Certificates */}
            <div className="flex justify-center items-center gap-6 mt-10 mb-6">
              {/* Ministry of Commerce */}
              {businessSettings?.showCrCertificate !== false && (
                <button 
                  onClick={() => openCertificateFullscreen(businessSettings?.crCertificateUrl || '', '/moc-logo.svg')}
                  className="hover:scale-105 transition-transform outline-none"
                >
                  <img src="/moc-logo.svg" alt="شعار وزارة التجارة" className="h-16 w-auto object-contain drop-shadow-md" />
                </button>
              )}
              {/* ZATCA */}
              {businessSettings?.taxEnabled && businessSettings?.showTaxCertificate !== false && (
                <button 
                  onClick={() => openCertificateFullscreen(businessSettings?.taxCertificateUrl || '', '/vat-logo.svg')}
                  className="hover:scale-105 transition-transform outline-none"
                >
                  <img src="/vat-logo.svg" alt="هيئة الزكاة والضريبة والجمارك" className="h-16 w-auto object-contain drop-shadow-md" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="bg-[#f8f8f8] text-[#555] py-4 mt-6">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] sm:text-xs font-semibold px-6">
            
            <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2 text-center sm:text-start">
              <span className="text-[#888] text-[10px]">{language === 'ar' ? 'مدعوم بـ' : 'Powered by'}</span>
              <a 
                href="https://luxcod.online" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#03162e] via-[#0a294f] to-[#03162e] hover:from-[#062042] hover:to-[#062042] border border-amber-400/40 hover:border-cyan-400 text-amber-300 font-mono font-bold px-1.5 py-0.5 rounded transition-all duration-300 shadow-sm hover:shadow group cursor-pointer"
                title="luxcod.online"
              >
                <img 
                  src="/luxcod-logo.jpg" 
                  alt="luxcod.online" 
                  className="w-4 h-4 object-cover rounded shrink-0 shadow border border-amber-400/60 group-hover:border-cyan-400 group-hover:scale-110 transition duration-300" 
                  referrerPolicy="no-referrer"
                />
                <span className="tracking-tight bg-gradient-to-r from-amber-300 via-amber-200 to-cyan-300 bg-clip-text text-transparent group-hover:from-amber-200 group-hover:to-cyan-200 text-[9px] leading-none">luxcod.online</span>
              </a>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button onClick={() => setIsPrivacyOpen(true)} className="text-[#888] hover:text-[#555] transition font-bold underline underline-offset-2">
                {language === 'ar' ? 'سياسة الخصوصية والشروط' : 'Privacy Policy & Terms'}
              </button>
              <div className="text-center">
                {language === 'ar' 
                  ? `جميع الحقوق محفوظة © ${new Date().getFullYear()} لـ ${businessSettings?.restaurantNameAr || 'رحلة شواء'}`
                  : `© ${new Date().getFullYear()} All Rights Reserved - ${businessSettings?.restaurantNameEn || 'Rehla BBQ'}`}
              </div>
            </div>
            
          </div>
        </div>
      </footer>

      {/* Welcome & PWA Onboarding Modal Wizard */}
      <WelcomePortalModal 
        isOpen={isWelcomeOpen} 
        onClose={() => setIsWelcomeOpen(false)} 
        businessSettings={businessSettings}
      />

      {/* Sandwich Customization Options Sheet Modal */}
      <SandwichCustomizationModal
        isOpen={!!customizingItem}
        onClose={() => setCustomizingItem(null)}
        item={customizingItem}
        onConfirm={handleCustomSandwichConfirm}
        menuItems={menuItems}
      />

      {/* Mandatory Privacy Policy & Terms Modal */}
      <PrivacyPolicyModal
        isOpen={isPrivacyOpen}
        gracePeriod={businessSettings?.gracePeriod}
        onAccept={() => {
          localStorage.setItem('rehla_privacy_accepted', 'true');
          setIsPrivacyOpen(false);
        }}
        onClose={() => setIsPrivacyOpen(false)}
      />

      {/* Official Certificate Lightbox Modal */}
      {activeCertificateModal && (
        <div className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl max-w-2xl w-full p-5 sm:p-6 text-stone-100 shadow-2xl relative flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
                  <Award className="w-5 h-5" />
                </div>
                <div className="text-start">
                  <h3 className="text-sm sm:text-base font-extrabold text-stone-100">
                    {activeCertificateModal.title}
                  </h3>
                  <span className="text-xs font-mono text-amber-400">
                    {language === 'ar' ? 'رقم التوثيق / الوثيقة: ' : 'Doc ID: '}{activeCertificateModal.number}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveCertificateModal(null)}
                className="w-9 h-9 rounded-full bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center hover:bg-stone-700 transition shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-stone-950 rounded-2xl p-3 border border-stone-800 flex items-center justify-center min-h-[320px]">
              {activeCertificateModal.url ? (
                activeCertificateModal.url.startsWith('data:application/pdf') ? (
                  <iframe
                    src={activeCertificateModal.url}
                    title={activeCertificateModal.title}
                    className="w-full h-[60vh] rounded-xl border border-stone-800 bg-white"
                  />
                ) : (
                  <img
                    src={activeCertificateModal.url}
                    alt={activeCertificateModal.title}
                    className="max-h-[60vh] w-auto max-w-full object-contain rounded-xl shadow-lg"
                  />
                )
              ) : (
                <div className="text-center p-8 max-w-md space-y-3">
                  <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center border border-amber-500/20">
                    <Award className="w-8 h-8" />
                  </div>
                  <h4 className="text-sm font-bold text-stone-200">
                    {activeCertificateModal.title}
                  </h4>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    {language === 'ar'
                      ? `وثيقة رسمية رقم (${activeCertificateModal.number}) موثقة ومسجلة في النظام لـ ${businessSettings?.restaurantNameAr || 'رحلة شواء'}. يمكنك تحميل وثيقة جديدة بملف PDF أو صورة من لوحة التحكم.`
                      : `Official certificate No (${activeCertificateModal.number}) registered for ${businessSettings?.restaurantNameEn || 'Rehla BBQ'}. You can upload a PDF or image in Admin Panel.`}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-stone-800 flex items-center justify-between">
              {activeCertificateModal.url ? (
                <a
                  href={activeCertificateModal.url}
                  download={`certificate_${activeCertificateModal.type}.pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold bg-amber-500 text-stone-950 hover:bg-amber-400 px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md"
                >
                  <Download className="w-4 h-4" />
                  {language === 'ar' ? 'تحميل / فتح المستند الأصلي' : 'Download / View Full File'}
                </a>
              ) : (
                <span className="text-[11px] text-stone-500 font-medium">
                  {language === 'ar' ? 'شهادة رقمية موثقة' : 'Verified Digital Document'}
                </span>
              )}
              <button
                onClick={() => setActiveCertificateModal(null)}
                className="text-xs font-bold bg-stone-800 text-stone-300 hover:bg-stone-700 px-4 py-2.5 rounded-xl transition"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standard PWA Install Promo Overlay */}
      <AnimatePresence>
        {showInstallBanner && deferredPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 z-[9999] bg-gradient-to-br from-neutral-900 to-amber-950 text-white rounded-3xl p-5 shadow-2xl border border-white/10 text-start font-sans"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-yellow rounded-2xl shrink-0 text-black">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-extrabold text-sm tracking-wide">
                  {language === 'ar' ? 'تثبيت تطبيق رحلة شواء' : 'Install Rehla BBQ'}
                </h4>
                <p className="text-white/75 text-xs leading-relaxed">
                  {language === 'ar' 
                    ? 'ثبّت التطبيق الآن على الشاشة الرئيسية للحصول على تجربة طلب سريعة ومتابعة حية بدون تصفح!' 
                    : 'Add Rehla BBQ to your home screen for instant access and live order tracking.'}
                </p>
                <div className="flex gap-2.5 pt-2.5">
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="flex-1 py-2 px-4 bg-yellow hover:bg-yellow-500 text-black text-xs font-black rounded-xl shadow-md transition-all cursor-pointer text-center"
                  >
                    {language === 'ar' ? 'تثبيت الآن 📱' : 'Install Now 📱'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInstallBanner(false)}
                    className="py-2 px-3 bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                  >
                    {language === 'ar' ? 'لاحقاً' : 'Later'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Safari PWA Install Helper */}
      <AnimatePresence>
        {showIosPrompt && isIos && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 left-6 md:left-auto md:w-96 z-[9999] bg-gradient-to-br from-neutral-900 to-amber-950 text-white rounded-3xl p-5 shadow-2xl border border-white/10 text-start font-sans"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-yellow rounded-2xl shrink-0 text-black font-extrabold text-lg flex items-center justify-center w-12 h-12">
                📲
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="font-extrabold text-sm tracking-wide">
                  {language === 'ar' ? 'تثبيت التطبيق على الآيفون' : 'Install on iPhone / iOS'}
                </h4>
                <p className="text-white/75 text-xs leading-relaxed">
                  {language === 'ar' 
                    ? 'لتنزيل التطبيق على الآيفون: اضغط على زر "مشاركة" أسفل المتصفح 📄، ثم اختر "إضافة إلى الشاشة الرئيسية" ➕.' 
                    : 'To install on iOS: tap the "Share" button at the bottom 📄, then select "Add to Home Screen" ➕.'}
                </p>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowIosPrompt(false);
                      sessionStorage.setItem('ios_pwa_dismissed', 'true');
                    }}
                    className="py-1.5 px-4 bg-yellow text-black text-xs font-black rounded-xl cursor-pointer"
                  >
                    {language === 'ar' ? 'حسناً، فهمت' : 'Okay, Got it'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive ChatBot Smart Assistant */}
      {activeTab === 'menu' && !isCartOpen && !customizingItem && (
        <ChatBot menuItems={menuItems} businessSettings={businessSettings} language={language} />
      )}

      {/* Social Media Link Alert Toast */}
      <AnimatePresence>
        {socialAlertMessage && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[99999] bg-[#1a1c1e] text-white border border-amber-500/40 px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs sm:text-sm font-bold text-center"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
            <span>{socialAlertMessage}</span>
            <button
              onClick={() => setSocialAlertMessage(null)}
              className="text-slate-400 hover:text-white mr-1 text-xs font-bold p-1"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <MenuAndOrdersApp />
    </LanguageProvider>
  );
}
