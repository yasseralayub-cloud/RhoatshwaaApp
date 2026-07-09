import React, { useState, useEffect } from 'react';
import { LanguageProvider, useLanguage } from './components/LanguageContext';
import { Header } from './components/Header';
import { CategoryNav } from './components/CategoryNav';
import { MenuCard } from './components/MenuCard';
import { CartDrawer } from './components/CartDrawer';
import { OrderTracker } from './components/OrderTracker';
import { AdminPanel } from './components/AdminPanel';
import { CATEGORIES, INITIAL_MENU_ITEMS, DEFAULT_BUSINESS_SETTINGS } from './initialData';
import { MenuItem, Promotion, BusinessSettings, CartItem, CartItemOption } from './types';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Flame, Star, Coffee, AlertCircle, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PromotionCountdown } from './components/PromotionCountdown';
import { WelcomePortalModal } from './components/WelcomePortalModal';
import { SandwichCustomizationModal, isSandwichItem, isFriesItem } from './components/SandwichCustomizationModal';

function MenuAndOrdersApp() {
  const { language, t, isRtl } = useLanguage();

  // Selected State variables
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    // Check if there is an existing local cache, otherwise start with initial
    const saved = localStorage.getItem('simulated_menu');
    return saved ? JSON.parse(saved) : INITIAL_MENU_ITEMS;
  });

  const [cart, setCart] = useState<CartItem[]>([]);
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('main');
  const [activeTab, setActiveTab] = useState<'menu' | 'tracker' | 'admin'>('menu');
  const [showAdminTab, setShowAdminTab] = useState(() => {
    return localStorage.getItem('show_admin_tab') === 'true';
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  
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

  // Check for admin query parameter to reveal the hidden Admin tab
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
      setShowAdminTab(true);
      localStorage.setItem('show_admin_tab', 'true');
      
      // Clean up the address bar cleanly so the admin suffix doesn't linger
      const cleanParams = new URLSearchParams(window.location.search);
      cleanParams.delete('admin');
      const suffix = cleanParams.toString();
      const newUrl = window.location.pathname + (suffix ? `?${suffix}` : '');
      window.history.replaceState({}, document.title, newUrl);
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
        onWelcomeClick={() => setIsWelcomeOpen(true)}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 font-sans">
        
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

            {/* Elegant Restaurant Location section with Embedded Map */}
            <div className="mt-12 bg-white rounded-[2rem] border border-black/5 p-6 md:p-8 shadow-xs hover:shadow-md transition-all text-start space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-black/5 pb-4">
                <div>
                  <h3 className="font-serif font-black text-xl text-dark flex items-center gap-2">
                    <span>📍</span>
                    {language === 'ar' ? 'موقعنا على الخارطة' : 'Our Location on the Map'}
                  </h3>
                  <p className="text-xs text-dark/50 mt-1">
                    {language === 'ar' 
                      ? 'شرفنا بزيارتك واستمتع بأجواء الشواء الطازجة واللذيذة!' 
                      : 'Visit us and savor fresh, delicious grilling in our welcoming branch!'}
                  </p>
                </div>
                <div className="text-xs space-y-1 font-mono text-dark/60 bg-neutral-50 px-4 py-2.5 rounded-xl border border-black/5">
                  <p className="font-bold text-amber-600">{language === 'ar' ? '🕒 أوقات العمل:' : '🕒 Opening Hours:'}</p>
                  <p>{language === 'ar' ? 'يومياً: من الساعة ١٢:٣٠ ظهراً حتى ٢:٠٠ صباحاً' : 'Daily: 12:30 PM till 2:00 AM'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                <div className="lg:col-span-2 rounded-2xl overflow-hidden border border-black/10 shadow-inner bg-neutral-100 h-[280px] w-full relative">
                  <iframe 
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3570.163484495013!2d43.6468382255101!3d26.514866077076427!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x1578a9860620016b%3A0x9c1444742cb50351!2z2LHYrdmE2Kkg2LTZiNin2KE!5e0!3m2!1sar!2ssa!4v1783554084700!5m2!1sar!2ssa" 
                    width="100%" 
                    height="100%" 
                    style={{ border: 0 }} 
                    allowFullScreen={true} 
                    loading="lazy" 
                    referrerPolicy="strict-origin-when-cross-origin"
                  ></iframe>
                </div>

                <div className="space-y-4">
                  <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 space-y-3">
                    <h4 className="font-bold text-sm text-amber-800 flex items-center gap-1.5">
                      <span>🍢</span>
                      {language === 'ar' ? 'فرع رحلة شواء - القصيم' : 'Rehla BBQ Branch - Qassim'}
                    </h4>
                    <p className="text-xs text-dark/70 leading-relaxed font-sans">
                      {language === 'ar' 
                        ? 'القصيم، عيون الجواء، حي المرقب، طريق الملك فهد. يسعدنا استقبال طلباتكم المحلية واستلامكم من الفرع مباشرة مع خدمة سريعة وجودة لا تضاهى.'
                        : 'Al-Qassim, Uyun Al-Jiwa, Al-Murqab Dist, King Fahd Road. We are delighted to welcome your dine-in, takeaway, and pickup orders with superb quality and rapid service.'}
                    </p>
                  </div>

                  <a 
                    href="https://maps.google.com/?q=26.514866077076427,43.6468382255101"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 px-4 bg-yellow hover:bg-yellow/90 text-black font-extrabold rounded-xl transition-all shadow-xs text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>🧭</span>
                    {language === 'ar' ? 'افتح في خرائط جوجل' : 'Open in Google Maps'}
                  </a>
                </div>
              </div>
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

      {/* Decorative footer */}
      <footer className="bg-neutral-50 border-t border-black/5 text-dark/60 py-8 text-center text-xs mt-16 font-mono">
        <p className="text-dark/80 uppercase tracking-widest font-semibold">{t('appName')} • Traditional Taste</p>
        <p className="text-dark/40 mt-2">© {new Date().getFullYear()} {t('appName')} Co. All rights reserved.</p>
        <button
          type="button"
          onClick={() => setIsPrivacyOpen(true)}
          className="mt-3 text-amber-600 hover:text-amber-700 hover:underline cursor-pointer font-bold transition-all block mx-auto text-xs"
        >
          {language === 'ar' ? '🔒 سياسة الخصوصية وحماية البيانات' : '🔒 Privacy Policy & Data Protection'}
        </button>
        <a
          href="https://wa.me/966502163363"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2.5 text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer font-bold transition-all block mx-auto text-xs"
        >
          {language === 'ar' ? '💬 الدعم الفني والشكاوى والاقتراحات' : '💬 Support, Complaints & Suggestions'}
        </a>
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
      />

      {/* Privacy Policy Modal */}
      <AnimatePresence>
        {isPrivacyOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-neutral-100 flex flex-col max-h-[85vh]"
            >
              <div className="p-5 border-b border-neutral-100 flex items-center justify-between bg-stone-50">
                <div className="flex items-center gap-2 text-amber-600 font-extrabold text-lg text-start">
                  <span>🔒</span>
                  <h3 className="font-bold">{language === 'ar' ? 'سياسة الخصوصية وحماية البيانات' : 'Privacy Policy & Data Protection'}</h3>
                </div>
                <button
                  onClick={() => setIsPrivacyOpen(false)}
                  className="w-8 h-8 rounded-full bg-neutral-200/80 hover:bg-neutral-200 text-stone-600 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6 text-start text-xs md:text-sm leading-relaxed text-stone-700">
                {language === 'ar' ? (
                  <div className="space-y-4 font-sans text-right" dir="rtl">
                    <p className="font-extrabold text-amber-700 text-sm">أهلاً بك في تطبيق "رحلة شواء" الرسمي.</p>
                    <p>نحن نولي خصوصية بياناتك أهمية قصوى ونلتزم بحمايتها وفق أعلى معايير الأمان الثنائية والتشريعات المحلية.</p>
                    
                    <div className="space-y-2">
                      <h4 className="font-bold text-stone-800 text-xs">١. ما هي البيانات التي نجمعها؟</h4>
                      <ul className="list-disc list-inside space-y-1 text-stone-600 pr-2">
                        <li><strong>رقم الجوال:</strong> لنتمكن من تأكيد طلبك وإرسال تحديثات حالة طلبك عبر الواتساب وتنسيق الاستلاف أو التوصيل.</li>
                        <li><strong>الإحداثيات الجغرافية (الموقع):</strong> في حال اختيارك لخدمة "التوصيل"، نقوم بطلب الوصول لموقعك الحالي لتسهيل وصول المندوب إليك بدقة تامة.</li>
                        <li><strong>تفاصيل الطلب:</strong> وتشمل قائمة المأكولات، الملاحظات الإضافية، والاسم المفضل لطباعته في الفاتورة وتنسيق الطلب.</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-bold text-stone-800 text-xs">٢. كيف نستخدم بياناتك؟</h4>
                      <p className="text-stone-600 font-sans">تُستخدم هذه البيانات حصرياً من أجل معالجة طلبك، طباعة فاتورة التحضير للمطبخ، تعيين المندوب المناسب، وتحديثك بحالة الطلب في الوقت الحقيقي. لا نقوم بمشاركة أي من بياناتك مع أطراف ثالثة لأغراض تسويقية أو تجارية على الإطلاق.</p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-bold text-stone-800 text-xs">٣. تخزين البيانات وأمنها</h4>
                      <p className="text-stone-600">يتم تخزين بيانات طلبك بشكل آمن عبر سحابة Google Firebase الموثوقة والمحمية بأحدث بروتوكولات الأمان الإلكتروني وقواعد التحقق الثنائية لمنع أي وصول غير مصرح به.</p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-bold text-stone-800 text-xs">٤. تواصل معنا</h4>
                      <p className="text-stone-600 font-sans">إذا كان لديك أي استفسار أو ترغب في طلب حذف بياناتك من سجلاتنا، يسعدنا تواصلك معنا مباشرة عبر رقم الواتساب الموضح في التطبيق.</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 font-sans text-left" dir="ltr">
                    <p className="font-extrabold text-amber-700 text-sm">Welcome to the official "Grilling Journey" application.</p>
                    <p>We hold your privacy in the highest regard and are fully committed to protecting your personal data in accordance with best safety practices.</p>
                    
                    <div className="space-y-2">
                      <h4 className="font-bold text-stone-800 text-xs">1. What Information Do We Collect?</h4>
                      <ul className="list-disc list-inside space-y-1 text-stone-600 pl-2">
                        <li><strong>Mobile Phone Number:</strong> Collected to verify orders, transmit real-time WhatsApp updates, and facilitate driver delivery.</li>
                        <li><strong>Geographical Coordinates (Location):</strong> If "Delivery" is selected, we request one-time geolocation access to deliver your fresh meals with perfect precision.</li>
                        <li><strong>Order Contents:</strong> Selected meals, customer notes, and preference details for kitchen invoice printouts.</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-bold text-stone-800 text-xs">2. How Do We Use Your Data?</h4>
                      <p className="text-stone-600">Your details are exclusively processed to manage and prepare your orders, route them to designated drivers, and notify you of delivery milestones. We strictly never sell, trade, or share your data with external marketing parties.</p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-bold text-stone-800 text-xs">3. Secure Storage & Encryption</h4>
                      <p className="text-stone-600">Your data is stored securely using hardened cloud servers via Google Firebase, equipped with industry-standard rules to deny unauthorized or illegal network access.</p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="font-bold text-stone-800 text-xs">4. Contact Us</h4>
                      <p className="text-stone-600">For inquiries, or to request complete erasure of your active logs and data records, reach out directly through our registered WhatsApp portal listed in the application.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-neutral-100 flex justify-end bg-stone-50">
                <button
                  onClick={() => setIsPrivacyOpen(false)}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'فهمت وموافق' : 'I Understand & Agree'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      {/* Floating WhatsApp Support Button */}
      <a
        href="https://wa.me/966502163363"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 left-6 z-[9999] bg-emerald-500 hover:bg-emerald-600 text-white p-3 md:p-3.5 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 group cursor-pointer"
        title={language === 'ar' ? 'الدعم الفني والشكاوى' : 'Support & Complaints'}
        id="floating-support-btn"
      >
        <MessageCircle className="w-5 h-5 md:w-6 md:h-6 animate-pulse" />
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 ease-out font-sans font-bold text-xs whitespace-nowrap">
          {language === 'ar' ? 'الدعم الفني والشكاوى' : 'Support & Complaints'}
        </span>
      </a>

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
