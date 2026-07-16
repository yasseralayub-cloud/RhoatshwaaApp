import React, { useState, useEffect } from 'react';
import { LanguageProvider, useLanguage } from './components/LanguageContext';
import { Header } from './components/Header';
import { CategoryNav } from './components/CategoryNav';
import { MenuCard } from './components/MenuCard';
import { CartDrawer } from './components/CartDrawer';
import { OrderTracker } from './components/OrderTracker';
import { AdminPanel } from './components/AdminPanel';
import { DriverPortal } from './components/DriverPortal';
import { CATEGORIES, INITIAL_MENU_ITEMS, DEFAULT_BUSINESS_SETTINGS } from './initialData';
import { MenuItem, Promotion, BusinessSettings, CartItem, CartItemOption } from './types';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Flame, Star, Coffee, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PromotionCountdown } from './components/PromotionCountdown';
import { WelcomePortalModal } from './components/WelcomePortalModal';
import { SandwichCustomizationModal, isSandwichItem, isFriesItem } from './components/SandwichCustomizationModal';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';

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
    return saved ? JSON.parse(saved) : INITIAL_MENU_ITEMS;
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('main');
  const [activeTab, setActiveTab] = useState<'menu' | 'tracker' | 'admin' | 'driver'>('menu');
  const [showAdminTab, setShowAdminTab] = useState(() => {
    return localStorage.getItem('show_admin_tab') === 'true';
  });
  const [showDriverTab, setShowDriverTab] = useState(() => {
    return localStorage.getItem('show_driver_tab') === 'true';
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  
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
    const unsub = onSnapshot(
      collection(db, 'menuItems'),
      (snapshot) => {
        if (!snapshot.empty) {
          const docs: MenuItem[] = [];
          snapshot.forEach((snap) => {
            docs.push(snap.data() as MenuItem);
          });
          setMenuItems(docs);
          localStorage.setItem('simulated_menu', JSON.stringify(docs));
        } else {
          // If collection exists but is empty, use initial provided records
          console.log('Firestore menuItems collection is empty. Showing default items.');
        }
      },
      (error) => {
        console.warn('Could not establish live Firestore menu connection (Offline or fresh setup). Defaulting to cached data:', error);
      }
    );

    return () => unsub();
  }, []);

  // 1.5 Establish Realtime Sync with Firestore for active promotion!
  useEffect(() => {
    const unsub = onSnapshot(
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
      (error) => {
        console.warn('Could not establish live Firestore promotion connection:', error);
      }
    );

    return () => unsub();
  }, []);

  // 1.8 Real-time Sync with Firestore for business settings doc
  useEffect(() => {
    const unsub = onSnapshot(
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
      (error) => {
        console.warn('Could not establish live Firestore settings connection:', error);
      }
    );

    return () => unsub();
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

  // Check for admin/driver query parameter to reveal the hidden tabs
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let changed = false;
    let is_admin = false;
    let is_driver = false;

    if (params.get('admin') === 'true') {
      setShowAdminTab(true);
      localStorage.setItem('show_admin_tab', 'true');
      changed = true;
      is_admin = true;
    }

    if (params.get('driver') === 'true') {
      setShowDriverTab(true);
      localStorage.setItem('show_driver_tab', 'true');
      setActiveTab('driver');
      changed = true;
      is_driver = true;
    }

    if (changed) {
      // Clean up the address bar cleanly so the suffix doesn't linger
      const cleanParams = new URLSearchParams(window.location.search);
      cleanParams.delete('admin');
      cleanParams.delete('driver');
      const suffix = cleanParams.toString();
      
      let newPath = window.location.pathname;
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
                    body: JSON.stringify({ order: updatedOrder })
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
    if (isSandwichItem(item) || isFriesItem(item)) {
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
      const matchItem = menuItems.find((m) => m.id === orderIt.id) || {
        id: orderIt.id,
        name: orderIt.name,
        nameAr: orderIt.nameAr,
        price: orderIt.price,
        description: '',
        descriptionAr: '',
        category: 'skewers',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600',
        calories: 0,
        isAvailable: true
      };

      return {
        id: orderIt.id,
        item: matchItem,
        quantity: orderIt.quantity
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

  // Filters catalog list matching both Arabic & English titles / descriptions plus keywords
  const filteredMenuItems = menuItems.filter((item) => {
    // Filter by tab category
    if (item.category !== selectedCategory) return false;

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

  return (
    <div className="flex flex-col min-h-screen bg-[#FCFCFB] text-dark select-none selection:bg-yellow/30 selection:text-black">
      
      {/* Premium Header toolbar */}
      <Header
        cartCount={cartTotalItemsCount}
        onCartClick={() => setIsCartOpen(true)}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        isAdminAuthenticated={localStorage.getItem('last_order_id') !== null}
        businessSettings={businessSettings}
        showAdminTab={showAdminTab}
        showDriverTab={showDriverTab}
        onWelcomeClick={handleInstallOrWelcomeClick}
      />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 md:px-6 py-6 font-sans">
        
        {activeTab === 'menu' && (
          <div className="space-y-6">
            
            {/* Heritage Welcome Hero Card */}
            <div className="bg-neutral-50 border border-black/5 p-8 rounded-[2rem] text-dark relative overflow-hidden shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6 text-start">
              <div className="absolute -bottom-16 -end-16 w-64 h-64 bg-yellow/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -top-16 -start-16 w-64 h-64 bg-yellow/10 rounded-full blur-3xl pointer-events-none" />
              <div className="z-10 space-y-2 md:max-w-xl">
                <div className="flex items-center gap-1.5 text-yellow-600 font-mono text-[10px] uppercase font-bold tracking-widest">
                  <Star className="w-3.5 h-3.5 fill-yellow text-yellow" />
                  <span>{language === 'ar' ? 'طاقة إيجابية وهويّة أصيلة' : 'Authentic Saudi Hospitality'}</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-serif font-bold text-dark tracking-wide leading-tight">
                  {language === 'ar' ? (businessSettings?.restaurantNameAr || 'رحلة شواء') : (businessSettings?.restaurantNameEn || 'Grill Journey')}
                </h2>
                <p className="text-xs text-dark/60 leading-relaxed max-w-lg">
                  {language === 'ar'
                    ? (businessSettings?.taglineAr || 'استمتع بأشهى قطع المشويات المحمرة على جمر الغضا الطازج.')
                    : (businessSettings?.taglineEn || 'Savor premium flame-grilled skewers over organic charcoal.')}
                </p>
              </div>

              {/* Decorative side badge */}
              <div className="bg-white border border-black/5 p-4 rounded-xl flex items-center gap-3 z-10 shrink-0 font-mono text-xs shadow-sm">
                <Coffee className="w-5 h-5 text-yellow shrink-0" />
                <div className="text-start">
                  <span className="block font-bold text-dark">{language === 'ar' ? 'الرّحلة دائماً دافئة' : 'Warm & Fresh'}</span>
                  <span className="text-[10px] text-dark/40">{language === 'ar' ? 'لحوم محلية ١٠٠٪' : '100% Local Meats'}</span>
                </div>
              </div>
            </div>

            {/* Active Promotion Countdown bar */}
            {activePromo && activePromo.isActive && (
              <PromotionCountdown promotion={activePromo} onExpired={() => console.log('Promotion expired')} />
            )}

            {/* Scrolling Categories selection line bar */}
            <CategoryNav
              categories={CATEGORIES}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />

            {/* Menu items display GRID layout */}
            <div className="space-y-4">
              <div className="flex justify-between items-center text-dark border-b border-black/5 pb-2 text-start">
                <div>
                  <h3 className="font-bold font-serif text-xl flex items-center gap-1.5 uppercase tracking-wide">
                    <Flame className="w-4 h-4 text-yellow animate-pulse" />
                    {language === 'ar' 
                      ? CATEGORIES.find(c => c.id === selectedCategory)?.nameAr 
                      : CATEGORIES.find(c => c.id === selectedCategory)?.name}
                  </h3>
                  <p className="text-[10px] text-dark/40 font-mono mt-0.5">{filteredMenuItems.length} {language === 'ar' ? 'خيارات لذيذة' : 'choices found'}</p>
                </div>
              </div>

              {filteredMenuItems.length === 0 ? (
                <div className="h-56 flex flex-col items-center justify-center text-dark/40 text-center border border-dashed border-black/10 rounded-[2rem] bg-neutral-50 p-6 animate-fade-in">
                  <AlertCircle className="w-10 h-10 text-dark/30 stroke-[1.5] mb-2" />
                  <p className="font-semibold text-dark/80 text-sm mb-0.5">{language === 'ar' ? 'لم يعثر على نتائج للبحث' : 'No Items Found'}</p>
                  <p className="text-xs text-dark/50 max-w-sm">{language === 'ar' ? 'جرّب البحث عن صنف آخر كالشاورما أو الكباب أو القهوة العربية الممتازة' : 'Try searching for items in our specific catalog.'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <AnimatePresence mode="popLayout">
                    {filteredMenuItems.map((item) => {
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
        {activeTab === 'admin' && showAdminTab && (
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

        {/* Independent Driver logistics hub */}
        {activeTab === 'driver' && showDriverTab && (
          <DriverPortal businessSettings={businessSettings} />
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

      {/* Decorative footer with independent access ports */}
      <footer className="bg-neutral-50 border-t border-black/5 text-dark/60 py-8 text-center text-xs mt-16 font-mono">
        <p className="text-dark/80 uppercase tracking-widest font-semibold">{t('appName')} • Traditional Taste</p>
        <p className="text-dark/40 mt-2">© {new Date().getFullYear()} {t('appName')} Co. All rights reserved.</p>
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
      />

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
