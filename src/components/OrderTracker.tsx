import React, { useState, useEffect, useRef } from 'react';
import { Order } from '../types';
import { useLanguage } from './LanguageContext';
import { Search, Loader2, ChefHat, CheckCircle2, Clock, Ban, User, Phone, MapPin, Clipboard, FileText, Printer, QrCode, Sparkles, Bell, X, Truck, ShoppingBag } from 'lucide-react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

interface OrderTrackerProps {
  initialOrderId?: string;
  businessSettings?: import('../types').BusinessSettings;
  onModifyOrder?: (order: Order) => void;
}

import { generateZatcaQr } from '../utils/time';
import { ZatcaFatooraCard } from './ZatcaFatooraCard';
import { normalizePhone, phonesMatch, getPhoneVariants } from '../utils/phone';

export const OrderTracker: React.FC<OrderTrackerProps> = ({ 
  initialOrderId = '', 
  businessSettings: passedSettings,
  onModifyOrder
}) => {
  const { language, t } = useLanguage();
  const [activeUserOrders, setActiveUserOrders] = useState<Order[]>([]);
  const [activeOrdersLoaded, setActiveOrdersLoaded] = useState(false);

  // User Profile state for checking if logged in
  const [userProfile, setUserProfile] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('rehla_user_profile');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  // Keep user profile in sync in real-time
  useEffect(() => {
    const syncProfile = () => {
      try {
        const saved = localStorage.getItem('rehla_user_profile');
        setUserProfile(saved ? JSON.parse(saved) : null);
      } catch (e) {
        setUserProfile(null);
      }
    };
    window.addEventListener('storage', syncProfile);
    window.addEventListener('user-profile-updated', syncProfile);
    return () => {
      window.removeEventListener('storage', syncProfile);
      window.removeEventListener('user-profile-updated', syncProfile);
    };
  }, []);

  const [searchId, setSearchId] = useState(() => {
    return initialOrderId || '';
  });
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Directly trigger print system for thermal receipt printer layout
  const handleDirectPrint = () => {
    setIsInvoiceOpen(true);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  // States & Refs for Visual Toast Notifications
  const [toast, setToast] = useState<{
    show: boolean;
    orderId: string;
    customerName: string;
    titleAr: string;
    titleEn: string;
    messageAr: string;
    messageEn: string;
    type: 'success' | 'info' | 'alert';
  }>({
    show: false,
    orderId: '',
    customerName: '',
    titleAr: '',
    titleEn: '',
    messageAr: '',
    messageEn: '',
    type: 'info'
  });

  const prevStatusRef = useRef<string | undefined>(undefined);
  const trackedOrderIdRef = useRef<string | undefined>(undefined);
  const activeCleanupRef = useRef<(() => void) | null>(null);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Subscribe to real-time driver coordinates from Firestore if order has an assigned driver and is in transit
  useEffect(() => {
    if (!order || !order.driverId || order.driverId === 'broadcast' || order.tableOrDelivery !== 'delivery') {
      setDriverCoords(null);
      return;
    }

    // Live tracking is active for preparing, ready, driver_assigned, driver_picked_up, and on_the_way statuses
    const activeStatuses = ['preparing', 'ready', 'driver_assigned', 'driver_picked_up', 'on_the_way'];
    if (!activeStatuses.includes(order.status)) {
      setDriverCoords(null);
      return;
    }

    const unsubDriver = onSnapshot(
      doc(db, 'drivers', order.driverId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            setDriverCoords({ lat: data.latitude, lng: data.longitude });
          }
        }
      },
      (error) => {
        console.warn('Could not subscribe to driver location updates:', error);
      }
    );

    return () => unsubDriver();
  }, [order?.driverId, order?.status, order?.tableOrDelivery]);

  // Active ticking countdown effect to maintain accuracy of grace period
  useEffect(() => {
    if (!order || order.status !== 'pending') {
      setSecondsLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const gracePeriodSec = businessSettings?.gracePeriod ?? 30;
      const gracePeriodMs = gracePeriodSec * 1000;
      const createdAtTime = new Date(order.createdAt).getTime();
      const elapsed = Date.now() - createdAtTime;
      const remainingSeconds = Math.max(0, Math.ceil((gracePeriodMs - elapsed) / 1000));
      return remainingSeconds;
    };

    const autoConfirmOrder = () => {
      console.log('Grace period ended. Order is now locked and awaiting supervisor approval.');
    };

    const initialRemaining = calculateTimeLeft();
    setSecondsLeft(initialRemaining);

    if (initialRemaining <= 0) {
      autoConfirmOrder();
      return;
    }

    const t = setInterval(() => {
      const currentRemaining = calculateTimeLeft();
      setSecondsLeft(currentRemaining);
      if (currentRemaining <= 0) {
        clearInterval(t);
        autoConfirmOrder();
      }
    }, 1000);

    return () => clearInterval(t);
  }, [order]);

  const handleCancelOrder = async () => {
    if (!order) return;
    
    const confirmCancel = window.confirm(
      language === 'ar'
        ? 'هل أنت متأكد من رغبتك في إلغاء هذا الطلب بالكامل؟'
        : 'Are you sure you want to completely cancel this order?'
    );
    if (!confirmCancel) return;

    try {
      const { updateDoc, doc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'orders', order.id), { status: 'cancelled' });
    } catch (e) {
      console.warn('Could not update Firestore. Slicing with local cache updates:', e);
    }

    try {
      const stored = localStorage.getItem('simulated_orders');
      if (stored) {
        const parsedList: Order[] = JSON.parse(stored);
        const updatedList = parsedList.map(o => 
          o.id === order.id ? { ...o, status: 'cancelled' as const } : o
        );
        localStorage.setItem('simulated_orders', JSON.stringify(updatedList));
      }
    } catch (e) {
      console.warn(e);
    }

    alert(
      language === 'ar'
        ? 'تم إلغاء الطلب بنجاح ❌'
        : 'Order cancelled successfully ❌'
    );
  };

  const handleEditOrderClick = () => {
    if (!order || !onModifyOrder) return;
    const confirmEdit = window.confirm(
      language === 'ar'
        ? 'تعديل الطلب سيقوم بإلغاء هذا الطلب الحالي وتحميل كافة الأصناف مجدداً بداخل سلة التسوق لتتمكن من تعديلها أو الإضافة عليها وإعادة إرسال طلب جديد ومعدّل. هل ترغب بالاستمرار؟'
        : 'Modifying this order will cancel the current one, and load all ordered items back into your cart so you can add, change, or finish details and place a revised order. Proceed?'
    );
    if (confirmEdit) {
      onModifyOrder(order);
    }
  };

  const getWhatsAppMessageLink = () => {
    if (!order) return '';
    try {
      const orderTypeArabic = order.tableOrDelivery === 'table' 
        ? 'محلي (داخل المطعم)' 
        : order.tableOrDelivery === 'takeaway' 
          ? 'استلام من الفرع' 
          : `توصيل (العنوان: ${order.deliveryAddress})`;
      const orderTypeEnglish = order.tableOrDelivery === 'table' 
        ? 'Dine-In' 
        : order.tableOrDelivery === 'takeaway' 
          ? 'Pick up from branch' 
          : `Delivery (Address: ${order.deliveryAddress})`;
      
      const payArabic = order.paymentMethod === 'cod' ? 'الدفع عند الاستلام' : order.paymentMethod === 'applepay' ? 'آبل باي' : 'مدى';
      const payEnglish = order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod === 'applepay' ? 'Apple Pay' : 'Mada';

      const listArabic = order.items.map(c => `• ${c.nameAr} (العدد: ${c.quantity}) بسعر: ${(c.price * c.quantity).toFixed(1)} ريال`).join('\n');
      const listEnglish = order.items.map(c => `• ${c.name} (${c.quantity}x) price: ${(c.price * c.quantity).toFixed(1)} SAR`).join('\n');

      const notesArabicText = order.notes ? `*ملاحظات العميل:* ${order.notes}\n` : '';
      const notesEnglishText = order.notes ? `*Customer Notes:* ${order.notes}\n` : '';

      const waMessage = language === 'ar' 
        ? `*تفاصيل طلب جديد رقم:* \`${order.id}\` 🍢🥤\n\n` +
          `*الاسم:* ${order.customerName}\n` +
          `*الجوال:* ${order.customerPhone}\n` +
          `*نوع الطلب:* ${orderTypeArabic}\n` +
          notesArabicText + '\n' +
          `*الأصناف المطلوبة:*\n${listArabic}\n\n` +
          `*الإجمالي النهائي:* *${order.total.toFixed(2)} ريال*\n` +
          `*طريقة الدفع:* ${payArabic}\n\n` +
          `_تم إرسال هذا الطلب عبر النظام التفاعلي بانتظار التجهيز._`
        : `*New Order Details for:* \`${order.id}\` 🍢🥤\n\n` +
          `*Name:* ${order.customerName}\n` +
          `*Phone:* ${order.customerPhone}\n` +
          `*Type:* ${orderTypeEnglish}\n` +
          notesEnglishText + '\n' +
          `*Items Ordered:*\n${listEnglish}\n\n` +
          `*Estimated Total:* *${order.total.toFixed(2)} SAR*\n` +
          `*Payment:* ${payEnglish}\n\n` +
          `_This order has been submitted into the active restaurant system._`;

      const encodedMessage = encodeURIComponent(waMessage);
      let cleanPhone = (businessSettings?.whatsappNumber || '966501234567').replace(/\D/g, '');
      if (cleanPhone.startsWith('00966')) {
        cleanPhone = cleanPhone.substring(2);
      }
      if (cleanPhone.startsWith('96605')) {
        cleanPhone = '966' + cleanPhone.substring(4);
      }
      if (cleanPhone.startsWith('05') && cleanPhone.length === 10) {
        cleanPhone = '966' + cleanPhone.substring(1);
      } else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) {
        cleanPhone = '966' + cleanPhone;
      } else if (cleanPhone.startsWith('005') && cleanPhone.length === 11) {
        cleanPhone = '966' + cleanPhone.substring(2);
      }
      return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
    } catch(e) {
      return '';
    }
  };

  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
  });

  // Release any active Firestore listeners and polling intervals on component unmount
  useEffect(() => {
    return () => {
      if (activeCleanupRef.current) {
        activeCleanupRef.current();
      }
    };
  }, []);

  // Synthesis utility for playing premium live acoustic chime using Web Audio API (highly robust, no external file dependencies)
  const playNotificationSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      osc1.start(audioCtx.currentTime);
      osc1.stop(audioCtx.currentTime + 0.4);
      
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.00, audioCtx.currentTime + 0.12); // A5
      gain2.gain.setValueAtTime(0.12, audioCtx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
      
      osc2.start(audioCtx.currentTime + 0.12);
      osc2.stop(audioCtx.currentTime + 0.6);
    } catch (error) {
      console.warn("Synthesized chime audio is blocked/unsupported:", error);
    }
  };

  const requestNotificationAuth = async () => {
    if (!('Notification' in window)) {
      alert(language === 'ar' 
        ? '⚠️ متصفحك الحالي لا يدعم ميزة الإشعارات لتلقي التحديثات.' 
        : '⚠️ This browser does not support the Notifications API.');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        new Notification(language === 'ar' ? (businessSettings?.restaurantNameAr || 'مطعم رحلة شواء 🍖') : (businessSettings?.restaurantNameEn || 'Rehla BBQ Restaurant 🍖'), {
          body: language === 'ar' 
            ? '🚀 تم تفعيل الإشعارات والتنبيهات الصوتية بنجاح لتتبع طلباتك!' 
            : '🚀 Notifications and chime alerts successfully activated for your meals!',
          icon: businessSettings?.logoUrl || '/pwa-icon.jpg',
        });
      }
    } catch (err) {
      console.error('Error requesting notifications permission:', err);
    }
  };

  // Observe active order statuses to fire premium Toast notification when status transitions
  useEffect(() => {
    if (order) {
      if (trackedOrderIdRef.current === order.id && prevStatusRef.current && prevStatusRef.current !== order.status) {
        let titleAr = '';
        let titleEn = '';
        let messageAr = '';
        let messageEn = '';
        let type: 'success' | 'info' | 'alert' = 'info';

        if (prevStatusRef.current === 'pending' && order.status === 'preparing') {
          titleAr = 'بدأ تحضير طلبك! 👨‍🍳🔥';
          titleEn = 'Kitchen Preparing Cooking! 👨‍🍳🔥';
          messageAr = `طلبك رقم ${order.id} قيد التحضير والطهي على الجمر والطلب المباشر بالمطبخ الآن!`;
          messageEn = `Order ${order.id} is now being cooked and grilled on the coals!`;
          type = 'info';
        } else if (prevStatusRef.current === 'preparing' && order.status === 'delivered') {
          titleAr = 'طلبك جاهز ولذيذ! 🎉🍢';
          titleEn = 'Your Order is Ready! 🎉🍢';
          messageAr = `عزيزنا ${order.customerName || 'العميل'}، اكتمل طهي وتجهيز وجبتك الطازجة وهي جاهزة للاستلام الآن بالعافية!`;
          messageEn = `Dear ${order.customerName || 'Customer'}, your charcoal-grilled meal is complete and freshly prepared!`;
          type = 'success';
        } else if (order.status === 'cancelled') {
          titleAr = 'تم إلغاء الطلب ❌';
          titleEn = 'Order Cancelled ❌';
          messageAr = `نعتذر منك، تم إلغاء طلبك رقم ${order.id}. يرجى مراجعة إدارة المطعم لمزيد من التفاصيل.`;
          messageEn = `We apologize, your order ${order.id} has been cancelled. Please check with restaurant administration.`;
          type = 'alert';
        }

        if (titleAr) {
          setToast({
            show: true,
            orderId: order.id,
            customerName: order.customerName || '',
            titleAr,
            titleEn,
            messageAr,
            messageEn,
            type
          });
          playNotificationSound();

          // Native device push notification trigger
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(language === 'ar' ? titleAr : titleEn, {
                body: language === 'ar' ? messageAr : messageEn,
                icon: businessSettings?.logoUrl || '/pwa-icon.jpg',
                tag: `order-status-${order.id}-${order.status}`,
                requireInteraction: true
              });
            } catch (err) {
              console.warn("Could not fire native background notification:", err);
            }
          }
        }
      }
      prevStatusRef.current = order.status;
      trackedOrderIdRef.current = order.id;
    } else {
      prevStatusRef.current = undefined;
      trackedOrderIdRef.current = undefined;
    }
  }, [order]);
  
  const [businessSettings, setBusinessSettings] = useState(() => {
    if (passedSettings) return passedSettings;
    try {
      const saved = localStorage.getItem('simulated_business_settings');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return {
      restaurantNameAr: "رحلة شواء",
      restaurantNameEn: "Grilling Journey",
      taglineAr: "مذاق المشويات الفاخرة على أصولها",
      taglineEn: "The Authentic Taste of Premium Grills",
      logoUrl: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=200",
      phone: "0501234567",
      whatsappNumber: "966501234567",
      addressAr: "الرياض، المملكة العربية السعودية",
      addressEn: "Riyadh, Kingdom of Saudi Arabia",
      taxEnabled: true,
      taxPercent: 15,
      vatNumber: "310123456700003"
    };
  });

  // Keep business settings synced from prop
  useEffect(() => {
    if (passedSettings) {
      setBusinessSettings(passedSettings);
    }
  }, [passedSettings]);

  // Keep business settings synced inside the order tracker as well if no prop is passed!
  useEffect(() => {
    if (passedSettings) return;
    const unsub = onSnapshot(
      doc(db, 'settings', 'business'),
      (snapshot) => {
        if (snapshot.exists()) {
          const settingsObj = snapshot.data();
          setBusinessSettings(settingsObj as any);
          localStorage.setItem('simulated_business_settings', JSON.stringify(settingsObj));
        }
      },
      (error) => {
        console.warn('Could not establish real-time settings on tracker:', error);
      }
    );
    return () => unsub();
  }, [passedSettings]);

  // Subscribe to the customer's active/ongoing orders
  useEffect(() => {
    let unsubFirestore: (() => void) | null = null;
    let phone = '';
    try {
      const saved = localStorage.getItem('rehla_user_profile');
      if (saved) {
        const u = JSON.parse(saved);
        phone = u.phone || '';
      }
    } catch (e) {}

    const loadActiveOrders = (firestoreOrders: Order[] = []) => {
      // If user is NOT logged in or has no phone number, DO NOT display any active orders list!
      if (!phone || !normalizePhone(phone)) {
        setActiveUserOrders([]);
        setActiveOrdersLoaded(true);
        return;
      }

      let localOrders: Order[] = [];
      try {
        const stored = localStorage.getItem('simulated_orders');
        if (stored) {
          const parsed: Order[] = JSON.parse(stored);
          // Strictly filter local orders to only those belonging to the current logged-in phone
          localOrders = parsed.filter(o => phonesMatch(o.customerPhone, phone));
        }
      } catch (e) {}

      // Strictly filter firestore orders to only those belonging to the current logged-in phone
      const filteredFirestoreOrders = firestoreOrders.filter(o => phonesMatch(o.customerPhone, phone));

      // Combine both sources
      const combined = [...localOrders, ...filteredFirestoreOrders];
      const uniqueMap = new Map<string, Order>();
      combined.forEach(o => {
        if (o && o.id) {
          uniqueMap.set(o.id, o);
        }
      });

      // Filter only active orders (status is not delivered or cancelled)
      let activeList = Array.from(uniqueMap.values()).filter(o => 
        o.status !== 'delivered' && o.status !== 'cancelled' && phonesMatch(o.customerPhone, phone)
      );

      // Sort by createdAt descending
      activeList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setActiveUserOrders(activeList);
      setActiveOrdersLoaded(true);
    };

    const phoneVars = getPhoneVariants(phone);
    if (phone && phoneVars.length > 0) {
      try {
        const q = query(collection(db, 'orders'), where('customerPhone', 'in', phoneVars.slice(0, 10)));
        unsubFirestore = onSnapshot(q, (snapshot) => {
          const fOrders: Order[] = [];
          snapshot.forEach(docSnap => {
            fOrders.push({ id: docSnap.id, ...docSnap.data() } as Order);
          });
          loadActiveOrders(fOrders);
        }, (err) => {
          console.warn("Tracker active orders Firestore fetch failed:", err);
          loadActiveOrders([]);
        });
      } catch (err) {
        console.warn(err);
        loadActiveOrders([]);
      }
    } else {
      loadActiveOrders([]);
    }

    return () => {
      if (unsubFirestore) {
        unsubFirestore();
      }
    };
  }, [userProfile?.phone]);

  // Handle automatic tracking of active orders on mount
  useEffect(() => {
    if (!activeOrdersLoaded) return;

    if (initialOrderId) {
      // If initialOrderId is passed, check if it's active.
      const isActive = activeUserOrders.some(o => o.id === initialOrderId);
      if (isActive) {
        setSearchId(initialOrderId);
        handleTrack(initialOrderId);
      } else {
        // If initialOrderId is completed, but we have other active orders, track the first active one!
        if (activeUserOrders.length > 0) {
          const firstActive = activeUserOrders[0];
          setSearchId(firstActive.id);
          handleTrack(firstActive.id);
        } else {
          // No active orders at all!
          setSearchId('');
          setOrder(null);
          setErrorMsg('');
        }
      }
    } else if (activeUserOrders.length > 0) {
      // No initialOrderId, but we have active orders
      const firstActive = activeUserOrders[0];
      setSearchId(firstActive.id);
      handleTrack(firstActive.id);
    } else {
      // No initialOrderId and no active orders
      setSearchId('');
      setOrder(null);
      setErrorMsg('');
    }
  }, [initialOrderId, activeOrdersLoaded]);

  const findLocalOrder = (orderIdToFind: string): Order | null => {
    try {
      const storedStr = localStorage.getItem('simulated_orders');
      if (storedStr) {
        const storedList: Order[] = JSON.parse(storedStr);
        return storedList.find(o => o.id === orderIdToFind) || null;
      }
    } catch (e) {
      console.warn("localStorage order lookup failed:", e);
    }
    return null;
  };

  const handleTrack = (idToTrack: string) => {
    // 1. Clean up any previous active listener/interval to prevent database read loops or memory leaks
    if (activeCleanupRef.current) {
      try {
        activeCleanupRef.current();
      } catch (e) {
        console.warn("Error cleaning up previous order tracking listener:", e);
      }
      activeCleanupRef.current = null;
    }

    const cleanId = idToTrack.trim();
    if (!cleanId) return;

    setLoading(true);
    setErrorMsg('');
    setOrder(null);

    // Save/cache for convenient tracker return
    localStorage.setItem('last_order_id', cleanId);

    let isFirestoreActive = false;

    // Helper to verify order belongs to currently logged in user
    const verifyOwnership = (ord: Order): boolean => {
      let currentPhone = '';
      try {
        const saved = localStorage.getItem('rehla_user_profile');
        if (saved) {
          const u = JSON.parse(saved);
          currentPhone = u.phone || '';
        }
      } catch (e) {}

      if (currentPhone && !phonesMatch(ord.customerPhone, currentPhone)) {
        return false;
      }
      return true;
    };

    // 1. Establish real-time Firestore document listener
    const unsub = onSnapshot(
      doc(db, 'orders', cleanId),
      (docSnap) => {
        setLoading(false);
        isFirestoreActive = true;
        if (docSnap.exists()) {
          const freshOrder = docSnap.data() as Order;
          
          if (!verifyOwnership(freshOrder)) {
            setOrder(null);
            setErrorMsg(
              language === 'ar'
                ? 'عذراً، هذا الطلب غير تابع لرقم جوالك ولا يمكن استعراضه حفاظاً على الخصوصية 🔐'
                : 'Sorry, this order does not belong to your logged-in mobile number for privacy reasons 🔐'
            );
            return;
          }

          setOrder(freshOrder);
          
          // ALWAYS sync the fresh order back to local storage so they are both in perfect alignment!
          try {
            const stored = localStorage.getItem('simulated_orders');
            let parsedList: Order[] = [];
            if (stored) {
              parsedList = JSON.parse(stored);
            }
            const foundIdx = parsedList.findIndex(o => o.id === cleanId);
            if (foundIdx !== -1) {
              parsedList[foundIdx] = freshOrder;
            } else {
              parsedList.unshift(freshOrder);
            }
            localStorage.setItem('simulated_orders', JSON.stringify(parsedList));
          } catch (e) {
            console.warn("Could not sync Firestore order back to local storage:", e);
          }
        } else {
          // Check local simulated orders fallback
          const localOrder = findLocalOrder(cleanId);
          if (localOrder) {
            if (!verifyOwnership(localOrder)) {
              setOrder(null);
              setErrorMsg(
                language === 'ar'
                  ? 'عذراً، هذا الطلب غير تابع لرقم جوالك ولا يمكن استعراضه حفاظاً على الخصوصية 🔐'
                  : 'Sorry, this order does not belong to your logged-in mobile number for privacy reasons 🔐'
              );
              return;
            }
            setOrder(localOrder);
          } else {
            setOrder(null);
            setErrorMsg(t('orderNotFound'));
          }
        }
      },
      (error) => {
        setLoading(false);
        isFirestoreActive = false;
        const localOrder = findLocalOrder(cleanId);
        if (localOrder) {
          if (!verifyOwnership(localOrder)) {
            setOrder(null);
            setErrorMsg(
              language === 'ar'
                ? 'عذراً، هذا الطلب غير تابع لرقم جوالك ولا يمكن استعراضه حفاظاً على الخصوصية 🔐'
                : 'Sorry, this order does not belong to your logged-in mobile number for privacy reasons 🔐'
            );
            return;
          }
          setOrder(localOrder);
        } else {
          setErrorMsg(t('orderNotFound'));
          console.warn('Firestore real-time tracking offline, trying local storage order fallback:', error);
        }
      }
    );

    // 2. Multi-mode sync: Local polling interval to check if status updates offline or in simulation mode
    const syncInterval = setInterval(() => {
      // If Firestore is active and updating perfectly, NEVER overwrite it with old/stale local state!
      if (isFirestoreActive) return;

      const localOrder = findLocalOrder(cleanId);
      if (localOrder) {
        setOrder((prev) => {
          if (!prev) return localOrder;
          if (prev.status !== localOrder.status) {
            return localOrder;
          }
          return prev;
        });
      }
    }, 1500);

    // Save active unsub and interval cleanup callbacks to our component-scoped mutable ref
    activeCleanupRef.current = () => {
      unsub();
      clearInterval(syncInterval);
    };
  };

  const getStepStatus = (step: 'received' | 'preparing' | 'ready' | 'transit' | 'delivered') => {
    if (!order) return 'inactive';
    if (order.status === 'cancelled') return 'inactive';

    const statusMap: Record<string, number> = {
      'pending': 0,
      'received': 1,
      'preparing': 2,
      'searching_driver': 2,
      'ready': order.tableOrDelivery === 'delivery' ? 2 : 3,
      'driver_assigned': 2,
      'driver_picked_up': 3,
      'on_the_way': 3,
      'delivered': 4,
    };

    const stepMap: Record<'received' | 'preparing' | 'ready' | 'transit' | 'delivered', number> = {
      'received': 1,
      'preparing': 2,
      'ready': 3,
      'transit': 3,
      'delivered': 4,
    };

    const currentLevel = statusMap[order.status] ?? 0;
    const stepLevel = stepMap[step];

    // For non-delivery, skip transit stage (it counts as completed if current level >= 4)
    if (order.tableOrDelivery !== 'delivery' && step === 'transit') {
      return currentLevel >= 4 ? 'completed' : 'inactive';
    }

    if (currentLevel > stepLevel) {
      return 'completed';
    } else if (currentLevel === stepLevel) {
      return 'active';
    }
    return 'inactive';
  };

  const getProgressPercentage = () => {
    if (!order) return '0%';
    if (order.status === 'cancelled') return '0%';
    const isDelivery = order.tableOrDelivery === 'delivery';
    
    switch (order.status) {
      case 'pending': return '0%';
      case 'received': return '25%';
      case 'preparing':
      case 'searching_driver':
        return '50%';
      case 'ready':
        return isDelivery ? '50%' : '75%';
      case 'driver_assigned':
        return '60%';
      case 'driver_picked_up':
        return '75%';
      case 'on_the_way':
        return '90%';
      case 'delivered':
        return '100%';
      default: return '0%';
    }
  };

  const getDriverStatusLabel = (status: string) => {
    switch (status) {
      case 'driver_assigned':
        return language === 'ar' ? 'تم قبول الطلب وجاري التجهيز 🍳' : 'Accepted & Preparing 🍳';
      case 'driver_picked_up':
        return language === 'ar' ? 'تم استلام الطلب وبدأت الرحلة 🚴' : 'Order Picked Up 🚴';
      case 'on_the_way':
        return language === 'ar' ? 'وصلت للموقع الآن 📍' : 'Arrived at Location 📍';
      case 'delivered':
        return language === 'ar' ? 'تم التوصيل بنجاح ✅' : 'Delivered successfully ✅';
      default:
        return language === 'ar' ? 'جاري التوصيل 🚚' : 'In transit 🚚';
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6 font-sans text-start">
      {/* Title */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold font-serif text-dark tracking-wide">
          {t('tracker')}
        </h2>
        <p className="text-dark/60 text-xs md:text-sm">
          {language === 'ar' ? 'تابع حالة وجبتك الشّهيّة من الجمر مباشرة من المطبخ وحتى تسليمها طازجة' : 'Follow your delicious order directly from coals to your couch!'}
        </p>
      </div>

      {!userProfile ? (
        <div className="max-w-lg mx-auto bg-white rounded-3xl border border-black/5 p-8 text-center space-y-6 shadow-xs animate-fade-in my-8">
          <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto text-dark/30 border border-black/5">
            <User className="w-8 h-8 text-yellow" />
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-dark text-base">
              {language === 'ar' ? '🔐 تتبع الطلبات النشطة محمي ومؤمن' : '🔐 Secure Active Order Tracking'}
            </h3>
            <p className="text-xs text-dark/60 leading-relaxed max-w-sm mx-auto">
              {language === 'ar' 
                ? 'حفاظاً على خصوصية طلباتك وسريتها، يرجى تسجيل الدخول برقم الجوال لتتمكن من تتبع حالة ومسار وجباتك النشطة مباشرة.' 
                : 'To protect the privacy and confidentiality of your orders, please log in with your mobile number to view and track your active orders live.'}
            </p>
          </div>
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'account' }));
            }}
            className="w-full bg-yellow text-black hover:bg-yellow/95 font-bold text-xs py-3.5 rounded-2xl transition-all shadow-sm cursor-pointer active:scale-98"
          >
            {language === 'ar' ? 'تسجيل الدخول برقم الجوال الآن' : 'Log In with Mobile Number Now'}
          </button>
        </div>
      ) : (
        <>

      {/* Tracker search pane */}
      <div className="flex gap-2.5 max-w-lg mx-auto bg-white p-2 rounded-2xl border border-black/5 shadow-xs">
        <div className="flex-1 relative">
          <input
            id="tracker-search-input-field"
            type="text"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            placeholder={t('searchOrderPlaceholder')}
            className="w-full text-sm bg-neutral-50 border border-black/5 rounded-xl px-3 py-3 outline-none focus:border-yellow text-center font-mono font-bold text-dark placeholder-dark/40"
          />
        </div>
        <button
          id="btn-trigger-track"
          onClick={() => handleTrack(searchId)}
          className="bg-yellow text-black hover:bg-yellow/90 min-w-[80px] font-bold rounded-xl px-5 transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer text-sm border border-black/5"
        >
          <Search className="w-4 h-4" />
          <span>{t('trackBtn')}</span>
        </button>
      </div>



      {/* Interactive Web Notification Authorization Request Banner */}
      {notifPermission === 'default' && (
        <div className="max-w-lg mx-auto bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/5 border border-orange-500/20 p-4 rounded-3xl flex flex-col sm:flex-row items-center gap-4 shadow-sm text-start">
          <div className="w-12 h-12 rounded-full bg-orange-600/15 flex items-center justify-center shrink-0">
            <Bell className="w-6 h-6 text-orange-600 animate-bounce" />
          </div>
          <div className="flex-1 text-center sm:text-start space-y-1">
            <h4 className="font-bold text-sm text-orange-800">
              {language === 'ar' ? 'تفعيل تنبيهات الجوال الفورية 📱' : 'Activate live mobile notifications 📱'}
            </h4>
            <p className="text-[11px] text-orange-700/90 leading-relaxed md:leading-normal">
              {language === 'ar' 
                ? 'تلقى إشعارات فورية على هاتفك لتحديثات الطبخ والاستلام حتى لو كنت خارج الموقع أو أغلقت المتصفح!' 
                : 'Receive instant notifications on your device for cooking and pickup updates, even if you close the webpage!'}
            </p>
          </div>
          <button
            onClick={requestNotificationAuth}
            className="w-full sm:w-auto bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-extrabold text-xs px-4.5 py-3 rounded-2xl shrink-0 transition-all shadow-md cursor-pointer active:scale-95 border border-orange-500/20"
          >
            {language === 'ar' ? 'تفعيل التنبيهات الآن' : 'Enable Live Alerts'}
          </button>
        </div>
      )}

      {/* Results content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-yellow-650 animate-spin mb-2" />
          <p className="text-xs text-dark/60">{language === 'ar' ? 'جارٍ جلب تفاصيل الطلب...' : 'Fetching order details...'}</p>
        </div>
      ) : errorMsg ? (
        <div className="bg-red-50 border border-red-200 text-red-650 p-4 rounded-2xl text-center text-sm font-semibold max-w-lg mx-auto">
          {errorMsg}
        </div>
      ) : !order && activeOrdersLoaded && activeUserOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-black/5 p-8 text-center max-w-lg mx-auto space-y-4">
          <div className="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mx-auto text-dark/30">
            <Clock className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-dark text-sm">
              {language === 'ar' ? 'لا توجد طلبات قائمة حالياً لمتابعتها 🍳' : 'No active orders currently tracking 🍳'}
            </h3>
            <p className="text-xs text-dark/50 leading-relaxed max-w-xs mx-auto">
              {language === 'ar' 
                ? 'عند قيامك بطلب وجبة طازجة من قائمة الطعام، ستظهر لك خطوات تحضيرها والطهي هنا مباشرة.' 
                : 'When you place a fresh order from our menu, you can track its preparation and cooking progress here in real-time.'}
            </p>
          </div>
        </div>
      ) : order ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6"
        >
          {/* Card Summary */}
          <div className="bg-white rounded-3xl border border-black/5 p-6 shadow-xs space-y-4">
            <div className="flex justify-between items-start border-b border-black/5 pb-4">
              <div>
                <span className="text-[10px] text-dark/40 font-mono block uppercase">{t('orderIdText')}</span>
                <span className="text-base font-bold text-dark font-mono">{order.id}</span>
              </div>
              <div className="text-end">
                <span className="text-[10px] text-dark/40 block uppercase">{t('orderTimeText')}</span>
                <span className="text-xs text-dark/60 font-medium font-mono">
                  {new Date(order.createdAt).toLocaleTimeString(language === 'ar' ? 'ar-SA' : 'en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            </div>

            {/* Step Line Indicator */}
            <div className="relative py-6 px-1">
              {/* Global Progress Line Bar */}
              <div className="absolute top-[28px] left-6 right-6 h-1 bg-neutral-100 z-0" />
              <div
                className="absolute top-[28px] h-1 bg-yellow z-0 transition-all duration-500"
                style={{
                  width: getProgressPercentage(),
                  right: language === 'ar' ? '24px' : 'auto',
                  left: language === 'ar' ? 'auto' : '24px'
                }}
              />

              <div className="relative z-10 flex justify-between items-center text-center">
                {(order.tableOrDelivery === 'delivery' ? [
                  { key: 'received', labelAr: 'تم استلام الطلب', labelEn: 'Received', icon: Clock },
                  { key: 'preparing', labelAr: 'جاري التحضير', labelEn: 'Preparing', icon: ChefHat },
                  { key: 'transit', labelAr: 'مع المندوب', labelEn: 'With Driver', icon: Truck },
                  { key: 'delivered', labelAr: 'تم التوصيل 🎉', labelEn: 'Delivered 🎉', icon: CheckCircle2 }
                ] : [
                  { key: 'received', labelAr: 'تم استلام الطلب', labelEn: 'Received', icon: Clock },
                  { key: 'preparing', labelAr: 'جاري التحضير', labelEn: 'Preparing', icon: ChefHat },
                  { key: 'ready', labelAr: 'جاهز للاستلام', labelEn: 'Ready for Pickup', icon: ShoppingBag },
                  { key: 'delivered', labelAr: 'تم التسليم 🎉', labelEn: 'Delivered 🎉', icon: CheckCircle2 }
                ]).map((st, idx) => {
                  const IconComp = st.icon;
                  const stepStatus = getStepStatus(st.key as any);
                  return (
                    <div key={idx} className="flex flex-col items-center flex-1">
                      <div
                        className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                          stepStatus === 'completed'
                            ? 'bg-yellow border-yellow text-black font-semibold shadow-xs'
                            : stepStatus === 'active'
                            ? 'bg-white border-yellow text-yellow-650 ring-4 ring-yellow/15 scale-110'
                            : 'bg-neutral-50 border-black/5 text-dark/30'
                        }`}
                      >
                        <IconComp className={`w-4 h-4 md:w-5 md:h-5 ${stepStatus === 'active' ? 'animate-pulse' : ''}`} />
                      </div>
                      <span className={`text-[9px] md:text-xs font-black mt-2.5 whitespace-nowrap ${
                        stepStatus === 'inactive' ? 'text-dark/30 font-normal' : 'text-dark'
                      }`}>
                        {language === 'ar' ? st.labelAr : st.labelEn}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cancel/Modify Active Grace Period Action Pane */}
            {order.status === 'pending' && secondsLeft !== null && secondsLeft > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-5 space-y-4 text-start">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-amber-500/10 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Clock className="w-5 h-5 text-amber-500 animate-pulse shrink-0" />
                    <div>
                      <h4 className="font-bold text-sm text-amber-800">
                        {language === 'ar' 
                          ? `يمكنك تعديل أو إلغاء الطلب خلال ${businessSettings?.gracePeriod ?? 30} ثانية ⏱️` 
                          : `You can modify or cancel within ${businessSettings?.gracePeriod ?? 30} seconds ⏱️`}
                      </h4>
                      <p className="text-[11px] text-amber-700/85 leading-relaxed md:leading-normal font-medium">
                        {language === 'ar' 
                          ? 'طلبك قيد الانتظار حالياً. سيتم إرساله للمطبخ فور انتهاء العداد وتنبيه الإدارة للمباشرة في التحضير، ولا يمكنك التعديل أو الإلغاء بعدها.' 
                          : 'Your order is pending. It will be locked for kitchen preparation and management approval once the countdown ends.'}
                      </p>
                    </div>
                  </div>
                  <div className="bg-amber-500 text-black font-mono text-xs font-black px-3.5 py-1.5 rounded-xl self-end sm:self-auto shadow-xs shrink-0 select-none">
                    ⏱️ {Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, '0')}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={handleCancelOrder}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold text-xs cursor-pointer transition-all shadow-xs"
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'إلغاء الطلب بالكامل' : 'Cancel Entire Order'}</span>
                  </button>

                  {onModifyOrder && (
                    <button
                      onClick={handleEditOrderClick}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-black rounded-2xl font-bold text-xs cursor-pointer transition-all shadow-sm"
                    >
                      <ChefHat className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'تعديل وتحديث الطلب' : 'Modify Order'}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Awaiting Management Response Card once the 60-second Customer Grace Period ends */}
            {order.status === 'pending' && secondsLeft !== null && secondsLeft <= 0 && (
              <div className="bg-zinc-50 border border-black/5 rounded-3xl p-5 space-y-3.5 text-start shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0 text-amber-600 font-extrabold text-lg">
                    ⏳
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-dark">
                      {language === 'ar' ? 'انتهت مهلة التعديل والطلب قيد التأكيد ⏱️' : 'Grace period ended, awaiting confirmation ⏱️'}
                    </h4>
                    <p className="text-xs text-dark/70 leading-relaxed mt-1">
                      {language === 'ar' 
                        ? 'انتهت مهلة الـ 60 ثانية المسموحة لتعديل أو إلغاء طلبك. تم قفل الطلب وأرسلنا تنبيهاً مباشراً مستمراً لشاشة الكاشير والمشرف للمباشرة فوراً بالتجهيز والطهي!' 
                        : 'The 60-second grace period for editing or cancellation has completed. The order is locked and we have dispatched an urgent active alert to the cashier dashboard to start cooking!'}
                    </p>
                  </div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/15 rounded-xl p-3 flex items-center gap-2.5 text-amber-800 text-[11px] font-bold animate-pulse">
                  <span>🔔</span>
                  <span>
                    {language === 'ar' 
                      ? 'تنبيه الجرس مستمر الآن في لوحة الإدارة حتى يرى الموظف طلبك ويبدأ بتجهيزه...' 
                      : 'Loud alert chime is ringing continuously on management dashboard until the crew starts preparing your meal...'}
                  </span>
                </div>
              </div>
            )}

            {/* Cancel Status Indicator */}
            {order.status === 'cancelled' && (
              <div className="bg-red-500/10 border border-red-500/15 rounded-2xl p-4 flex items-center gap-3 text-red-400">
                <Ban className="w-5 h-5 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">{language === 'ar' ? 'تم إلغاء الطلب' : 'Order Cancelled'}</h4>
                  <p className="text-xs text-red-400/80 mt-0.5">{language === 'ar' ? 'نعتذر منك، تم إلغاء الطلب من قبل الإشراف.' : 'Sorry, the order was cancelled by control.'}</p>
                </div>
              </div>
            )}

            {/* Searching for Driver Card */}
            {order.tableOrDelivery === 'delivery' && (!order.driverName || order.driverId === 'broadcast') && order.status !== 'cancelled' && (
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-3xl p-5 space-y-3.5 text-start shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0 text-amber-600 font-extrabold text-lg">
                    🔍
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-amber-800">
                      {language === 'ar' ? 'جاري البحث عن مندوبك الخاص... 🚚' : 'Searching for your private driver... 🚚'}
                    </h4>
                    <p className="text-xs text-dark/70 leading-relaxed mt-1">
                      {language === 'ar' 
                        ? 'تم إرسال الطلب بنجاح وهو الآن في حوض التوزيع. كابتن التوصيل الأقرب إليك سيباشر قبول الطلب فوراً وتأكيد تسليم الوجبة طازجة وساخنة!' 
                        : 'Your order has been dispatched. The nearest active delivery captain will accept and secure the trip shortly!'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Driver Assigned Card Info */}
            {order.tableOrDelivery === 'delivery' && order.driverName && order.driverId !== 'broadcast' && (
              <div className="bg-neutral-50 border border-black/5 rounded-3xl p-4.5 space-y-3.5 text-start shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-dark/40 uppercase tracking-wider">
                    {language === 'ar' ? '🚴 مندوب التوصيل المكلف بالطلب:' : '🚴 Assigned Delivery Driver:'}
                  </span>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                    order.status === 'delivered' 
                      ? 'bg-green-500/10 text-green-700' 
                      : order.status === 'on_the_way'
                      ? 'bg-blue-500/10 text-blue-700 animate-pulse'
                      : order.status === 'driver_picked_up'
                      ? 'bg-amber-500/10 text-amber-700 animate-pulse'
                      : 'bg-yellow/15 text-yellow-800 animate-pulse'
                  }`}>
                    {getDriverStatusLabel(order.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-yellow/15 flex items-center justify-center shrink-0">
                      <User className="w-5 h-5 text-yellow-750" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-dark">{order.driverName}</h4>
                      <p className="font-mono text-xs text-dark/60 font-semibold mt-0.5">{order.driverPhone}</p>
                    </div>
                  </div>
                  {order.driverPhone && (
                    <a
                      href={`tel:${order.driverPhone}`}
                      className="bg-yellow hover:bg-yellow/90 text-black font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'اتصال بالمندوب' : 'Call'}</span>
                    </a>
                  )}
                </div>

                {/* Driver Live Tracking Map */}
                {driverCoords && (
                  <div className="space-y-2 pt-3 border-t border-black/5">
                    <span className="text-[10px] font-bold text-dark/40 uppercase tracking-wider block">
                      {language === 'ar' ? '📍 موقع المندوب المباشر (تتبع حي):' : '📍 Live Driver Position (Real-Time Tracking):'}
                    </span>
                    <div className="relative aspect-video w-full rounded-2xl overflow-hidden border border-black/5 shadow-xs bg-neutral-100">
                      <iframe
                        title="Driver Live Tracking"
                        width="100%"
                        height="100%"
                        style={{ border: 0 }}
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${driverCoords.lng - 0.008}%2C${driverCoords.lat - 0.008}%2C${driverCoords.lng + 0.008}%2C${driverCoords.lat + 0.008}&layer=mapnik&marker=${driverCoords.lat}%2C${driverCoords.lng}`}
                      />
                    </div>
                    <div className="text-[10px] text-emerald-600 font-bold flex items-center gap-1.5 bg-emerald-500/5 p-2 rounded-xl border border-emerald-500/10 justify-center">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      <span>
                        {language === 'ar' 
                          ? 'يتلقى التطبيق الآن إحداثيات المندوب مباشرة كل 10 ثوانٍ' 
                          : 'Receiving live driver coordinates from GPS every 10 seconds'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Receipt Summary */}
            <div className="space-y-3.5 border-t border-black/5 pt-5 text-start">
              <h4 className="font-bold text-xs text-dark/40 uppercase tracking-wider">{language === 'ar' ? 'بيانات وحالة التوصيل' : 'Delivery & Client Status'}</h4>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-neutral-50 border border-black/5 rounded-2xl p-4 text-dark/80">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-dark/40" />
                    <span className="font-semibold text-dark">{order.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-dark/40" />
                    <span className="font-semibold text-dark font-mono">{order.customerPhone}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-dark/40" />
                    <span className="font-semibold text-dark">
                      {order.tableOrDelivery === 'table'
                        ? `${t('table')}: ${t('tableNum')} ${order.tableNumber}`
                        : `${t('delivery')}: ${order.deliveryAddress}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clipboard className="w-4 h-4 text-dark/40" />
                    <span className="font-semibold text-dark uppercase">
                      {order.paymentMethod === 'cod' ? t('cod') : order.paymentMethod === 'applepay' ? ' Pay' : 'Mada'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Items details table */}
            <div className="space-y-3 border-t border-black/5 pt-5">
              <h4 className="font-bold text-xs text-dark/40 uppercase tracking-wider">{language === 'ar' ? 'تفاصيل الوجبة' : 'Meal Details'}</h4>
              <div className="bg-neutral-50/50 border border-black/5 rounded-2xl p-4 space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center text-xs md:text-sm">
                    <div className="flex items-baseline gap-1 bg-white border border-black/5 rounded-lg py-1 px-2.5">
                      <span className="font-bold text-yellow-600">{item.quantity}×</span>
                      <span className="font-bold text-dark">{language === 'ar' ? item.nameAr : item.name}</span>
                    </div>
                    <span className="font-extrabold text-dark font-mono">{(item.price * item.quantity).toFixed(1)} {t('sar')}</span>
                  </div>
                ))}

                {order.deliveryFee && order.deliveryFee > 0 && (
                  <div className="flex justify-between items-center text-xs md:text-sm text-amber-700 bg-amber-50/50 rounded-lg p-2 border border-amber-500/10">
                    <span className="font-bold">{language === 'ar' ? '🚚 رسوم التوصيل' : '🚚 Delivery Fee'}</span>
                    <span className="font-extrabold font-mono">{order.deliveryFee.toFixed(1)} {t('sar')}</span>
                  </div>
                )}
                
                <div className="h-px bg-black/5 my-2" />
                <div className="flex justify-between items-center text-sm font-bold text-dark pt-2">
                  <span>
                    {language === 'ar'
                      ? (businessSettings.taxEnabled ? 'المجموع النهائي شامل الضريبة' : 'المجموع النهائي')
                      : (businessSettings.taxEnabled ? 'Final Sum (VAT Inclusive)' : 'Final Sum')}
                  </span>
                  <span className="text-base text-dark font-black font-mono">{order.total.toFixed(2)} {t('sar')}</span>
                </div>
              </div>
            </div>

            {businessSettings && businessSettings.taxEnabled && businessSettings.vatNumber && (
              <ZatcaFatooraCard 
                order={order}
                businessSettings={businessSettings}
                onViewFullInvoice={() => setIsInvoiceOpen(true)}
                onPrintInvoice={handleDirectPrint}
              />
            )}

            {/* Premium action buttons to trigger the ZATCA simplified tax compliance e-invoice & Local Printing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                id="view-zatca-invoice-btn"
                onClick={() => setIsInvoiceOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-yellow/15 hover:bg-yellow/25 text-yellow-700 border border-yellow/20 hover:border-yellow/35 rounded-2xl font-bold text-xs md:text-sm cursor-pointer transition-all uppercase tracking-wide font-sans md:py-3.5"
              >
                <FileText className="w-4 h-4 shrink-0 text-yellow-600" />
                <span>{language === 'ar' ? 'عرض الفاتورة الرقمية' : 'View Digital Invoice'}</span>
              </button>

              <button
                id="direct-print-invoice-btn"
                onClick={handleDirectPrint}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-500 rounded-2xl font-bold text-xs md:text-sm cursor-pointer transition-all uppercase tracking-wide font-sans md:py-3.5 shadow-xs"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>{language === 'ar' ? 'طباعة الفاتورة الفورية' : 'Print Thermal Invoice'}</span>
              </button>
            </div>

            {/* Optional WhatsApp Manual Notification Button */}
            {order.status !== 'cancelled' && (
              <div className="pt-2 border-t border-black/5">
                <a
                  href={getWhatsAppMessageLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-emerald-600/10 hover:bg-emerald-600/15 text-emerald-650 border border-emerald-500/15 hover:border-emerald-500/30 rounded-2xl font-bold text-xs md:text-sm cursor-pointer transition-all select-none"
                >
                  <svg className="w-4.5 h-4.5 fill-current shrink-0 text-emerald-600" viewBox="0 0 24 24">
                    <path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984a9.96 9.96 0 001.332 4.982L2 22l5.164-1.354a9.938 9.938 0 004.846 1.254h.004c5.507 0 9.991-4.479 9.992-9.986.002-2.67-1.037-5.18-2.932-7.072A9.933 9.933 0 0012.012 2zm5.725 14.115c-.252.712-1.461 1.303-2.014 1.382-.503.072-1.157.087-1.854-.138a10.873 10.873 0 01-4.49-2.795 11.236 11.236 0 01-2.457-3.693c-.419-.724-.672-1.524-.672-2.336 0-1.748.916-2.6 1.251-2.954.252-.267.671-.345.986-.345.105 0 .204.004.292.008.261.012.449.023.644.423.279.57.946 2.307 1.028 2.477.083.17.138.369.028.59-.11.22-.249.44-.393.606-.143.167-.294.349-.125.641.333.575.742 1.087 1.255 1.547.658.588 1.393.993 2.193 1.21.312.083.504.032.68-.171.213-.244.916-1.066 1.161-1.432.18-.27.42-.236.685-.138.271.098 1.716.81 2.01.949.294.14.492.21.564.332.072.122.072.712-.18 1.424z" />
                  </svg>
                  <span>{language === 'ar' ? 'إرسال تفاصيل الطلب عبر الواتساب (اختياري)' : 'Send details via WhatsApp (Optional)'}</span>
                </a>
              </div>
            )}

          </div>
        </motion.div>
      ) : (
        <div className="h-44 flex flex-col items-center justify-center text-center text-zinc-500 border border-dashed border-zinc-200 rounded-3xl bg-neutral-50 p-6">
          <Clock className="w-10 h-10 text-zinc-400 stroke-[1.5] mb-2" />
          <p className="font-bold text-xs text-zinc-500">{language === 'ar' ? 'أدخل رمز الطلب بالأعلى لعرض التحديثات المباشرة' : 'Input your code to begin live meal tracking'}</p>
        </div>
      )}

      {/* Premium ZATCA Simplified Tax Invoice Modal */}
      {isInvoiceOpen && order && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:relative print:z-0">
          <div className="w-full max-w-lg bg-white border border-black/5 rounded-3xl overflow-hidden shadow-2xl relative text-dark flex flex-col max-h-[90vh] print:border-none print:shadow-none print:bg-white print:text-black print:max-h-full print:overflow-visible">
            
            {/* Modal Header Controls (Hidden in Print) */}
            <div className="flex justify-between items-center bg-neutral-50 p-4 border-b border-black/5 print:hidden text-start">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-yellow-650" />
                <span className="font-bold text-xs uppercase tracking-wider text-dark/70">
                  {language === 'ar' ? 'نموذج الفاتورة الإلكترونية المعتمدة' : 'ZATCA Simplified Tax Invoice'}
                </span>
              </div>
              <button 
                onClick={() => setIsInvoiceOpen(false)}
                className="text-dark/40 hover:text-dark/70 text-xs font-semibold px-2.5 py-1 bg-neutral-100 rounded-lg cursor-pointer transition-all border border-black/5"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>

            {/* Print Body Container */}
            <div id="recept-print-area" ref={printAreaRef} className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-dark/80 print:text-black print:bg-white font-sans text-start print:overflow-visible print:p-0">
              
              {/* Receipt Header */}
              <div className="text-center space-y-2 border-b border-dashed border-black/10 pb-5 print:border-black/30">
                <div className="w-20 h-20 rounded-full bg-yellow/15 flex items-center justify-center font-bold text-dark text-2xl mx-auto shadow-sm overflow-hidden border border-yellow/20 print-large-logo">
                  {businessSettings?.logoUrl ? (
                    <img src={businessSettings.logoUrl} alt="Logo" className="w-[100%] h-[100%] object-cover animate-fade-in print:w-[100%] print:h-[100%]" />
                  ) : (
                    <span>{language === 'ar' ? businessSettings.restaurantNameAr.charAt(0) : businessSettings.restaurantNameEn.charAt(0)}</span>
                  )}
                </div>
                
                <h3 className="font-bold text-xl text-dark print:text-black mt-2 print:text-2xl print:font-extrabold">
                  {language === 'ar' ? businessSettings.restaurantNameAr : businessSettings.restaurantNameEn}
                </h3>
                <p className="text-[11px] font-bold text-dark/65 uppercase tracking-wide print:text-zinc-800">
                  {language === 'ar' ? businessSettings.taglineAr : businessSettings.taglineEn}
                </p>

                <div className="bg-yellow/15 border border-yellow/25 text-yellow-700 font-bold px-3 py-1 rounded-full text-[10px] inline-block uppercase tracking-wider print:bg-gray-150 print:border-gray-300 print:text-black mt-1">
                  {language === 'ar' 
                    ? (businessSettings.taxEnabled ? 'فاتورة ضريبية مبسطة' : 'فاتورة مبيعات') 
                    : (businessSettings.taxEnabled ? 'Simplified Tax Invoice' : 'Sales Receipt')
                  }
                </div>

                <p className="text-xs text-dark/60 print:text-zinc-700 font-mono mt-3">
                  {language === 'ar' ? 'المنشأة (البائع): ' : 'Seller / Business: '}
                  <span className="font-bold text-dark print:text-black">
                    {language === 'ar' ? businessSettings.restaurantNameAr : businessSettings.restaurantNameEn}
                  </span>
                </p>
                {businessSettings.taxEnabled && (
                  <p className="text-xs text-dark/60 print:text-zinc-700 font-mono">
                    {language === 'ar' ? 'الرقم الضريبي للبائع: ' : 'Seller VAT Registration No: '}
                    <span className="font-bold text-dark print:text-black font-mono">{businessSettings.vatNumber || '310123456700003'}</span>
                  </p>
                )}
                <p className="text-[10px] text-dark/40 print:text-zinc-700 font-bold">
                  {language === 'ar' ? businessSettings.addressAr : businessSettings.addressEn}
                </p>
                <div className="flex justify-center gap-3 text-[10px] text-dark/60 print:text-zinc-700 font-mono font-bold mt-1">
                  {businessSettings.phone && (
                    <span>{language === 'ar' ? `هاتف: ${businessSettings.phone}` : `Tel: ${businessSettings.phone}`}</span>
                  )}
                  {businessSettings.whatsappNumber && (
                    <span>{language === 'ar' ? `واتساب: ${businessSettings.whatsappNumber}` : `WhatsApp: ${businessSettings.whatsappNumber}`}</span>
                  )}
                </div>
              </div>

              {/* Bill Details Key-Value rows */}
              <div className="text-xs font-mono space-y-2 py-3 border-b border-dashed border-black/10 print:border-black/30 print:text-black">
                <div className="flex justify-between">
                  <span className="text-dark/50 print:text-black">{language === 'ar' ? 'رقم الفاتورة:' : 'Invoice No:'}</span>
                  <span className="font-bold text-dark print:text-black">{order.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark/50 print:text-black">{language === 'ar' ? 'التاريخ والوقت:' : 'Date & Time:'}</span>
                  <span className="font-bold text-dark print:text-black font-mono">
                    {new Date(order.createdAt).toLocaleString(language === 'ar' ? 'ar-SA' : 'en-US', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true
                    })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark/50 print:text-black">{language === 'ar' ? 'المستخدم:' : 'User:'}</span>
                  <span className="font-bold text-dark print:text-black">{language === 'ar' ? 'الموقع الإلكتروني (كاشير)' : 'Website (Cashier)'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark/50 print:text-black">{language === 'ar' ? 'نوع الطلب:' : 'Order Type:'}</span>
                  <span className="font-bold text-dark print:text-black">
                    {order.tableOrDelivery === 'table' 
                      ? (language === 'ar' ? `محلي - طاولة رقم ${order.tableNumber}` : `Dine-In - Table #${order.tableNumber}`)
                      : order.tableOrDelivery === 'takeaway'
                      ? (language === 'ar' ? 'استلام من الفرع' : 'Takeaway')
                      : (language === 'ar' ? 'توصيل منزلي' : 'Delivery Order')}
                  </span>
                </div>
                
                {/* Customer Info (Name and Phone) requested by user */}
                <div className="flex justify-between border-t border-dashed border-black/5 pt-2">
                  <span className="text-dark/50 print:text-black">{language === 'ar' ? 'اسم صاحب الطلب:' : 'Customer Name:'}</span>
                  <span className="font-bold text-dark print:text-black">{order.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark/50 print:text-black">{language === 'ar' ? 'رقم جوال العميل:' : 'Customer Phone:'}</span>
                  <span className="font-bold text-dark print:text-black font-mono">{order.customerPhone || 'N/A'}</span>
                </div>
              </div>

              {/* Items Summary List */}
              <div className="space-y-3 py-1 text-xs border-b border-dashed border-black/10 pb-4 print:border-black/30">
                {order.items.map((item) => (
                  <div key={item.id} className="space-y-1">
                    {/* Item Name */}
                    <div className="font-sans font-bold text-dark text-start print:text-black text-sm">
                      {language === 'ar' ? item.nameAr : item.name}
                    </div>
                    {/* Qty x Price and Total */}
                    <div className="flex justify-between items-center text-dark/70 font-mono text-[11px] print:text-black font-medium">
                      <span>
                        {item.quantity} x {item.price.toFixed(2)} {language === 'ar' ? 'ر.س.' : 'SAR'}
                      </span>
                      <span className="font-bold">
                        {(item.price * item.quantity).toFixed(2)} {language === 'ar' ? 'ر.س.' : 'SAR'}
                      </span>
                    </div>
                  </div>
                ))}

                <div className="border-t border-dashed border-black/5 pt-2 flex justify-between text-xs font-bold text-dark/70 print:text-black">
                  <span>{language === 'ar' ? 'عدد المنتجات:' : 'Total Items:'}</span>
                  <span>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
              </div>

              {/* Math Computations Receipt Footer */}
              <div className="pt-1 space-y-2 font-mono text-xs border-b border-dashed border-black/10 pb-4 print:border-black/30">
                <div className="flex justify-between text-dark/60 print:text-black">
                  <span>{language === 'ar' ? 'المجموع الخاضع للضريبة:' : 'Taxable Subtotal:'}</span>
                  <span>{(order.subtotal - (order.promoDiscount || 0)).toFixed(2)} {language === 'ar' ? 'ر.س.' : 'SAR'}</span>
                </div>

                {order.promoDiscount > 0 && (
                  <div className="flex justify-between text-red-650 font-bold print:text-black print:font-bold">
                    <span>{language === 'ar' ? 'التخفيض المطبق:' : 'Applied Discount:'}</span>
                    <span>-{order.promoDiscount.toFixed(2)} {language === 'ar' ? 'ر.س.' : 'SAR'}</span>
                  </div>
                )}

                {businessSettings.taxEnabled && (
                  <div className="flex justify-between text-dark/60 print:text-black">
                    <span>{language === 'ar' ? `ضريبة القيمة المضافة (${businessSettings.taxPercent}%):` : `VAT (${businessSettings.taxPercent}%):`}</span>
                    <span>{order.tax.toFixed(2)} {language === 'ar' ? 'ر.س.' : 'SAR'}</span>
                  </div>
                )}

                {order.deliveryFee && order.deliveryFee > 0 && (
                  <div className="flex justify-between text-dark/60 print:text-black font-semibold">
                    <span>{language === 'ar' ? 'رسوم التوصيل:' : 'Delivery Fee:'}</span>
                    <span>+{order.deliveryFee.toFixed(2)} {language === 'ar' ? 'ر.س.' : 'SAR'}</span>
                  </div>
                )}

                <div className="h-px bg-black/5 print:bg-black/30 my-2" />
                <div className="flex justify-between text-dark font-black text-sm print:text-black print:font-extrabold border-b border-dashed border-black/10 pb-2">
                  <span className="text-sm">
                    {language === 'ar'
                      ? (businessSettings?.taxEnabled ? 'إجمالي الدفع شامل الضريبة:' : 'إجمالي الدفع النهائي:')
                      : (businessSettings?.taxEnabled ? 'Total (VAT Inclusive):' : 'Final Total Payment:')
                    }
                  </span>
                  <span className="text-dark print:text-black font-black text-base">{(order.total).toFixed(2)} {language === 'ar' ? 'ر.س.' : 'SAR'}</span>
                </div>

                {/* Added payment details similar to photo (Card or Cash) */}
                <div className="flex justify-between text-dark/70 font-bold text-xs pt-1">
                  <span>{language === 'ar' ? 'طريقة الدفع:' : 'Payment Method:'}</span>
                  <span>
                    {order.paymentMethod === 'mada' ? (language === 'ar' ? 'بطاقة مدى (Card)' : 'Mada (Card)') :
                     order.paymentMethod === 'applepay' ? 'Apple Pay' :
                     order.paymentMethod === 'transfer' ? (language === 'ar' ? 'تحويل بنكي' : 'Bank Transfer') :
                     (language === 'ar' ? 'دفع عند الاستلام (كاش)' : 'Cash on Delivery')}
                  </span>
                </div>
                <div className="flex justify-between text-dark font-bold text-xs pb-1">
                  <span>{language === 'ar' ? 'المبلغ المدفوع:' : 'Paid Amount:'}</span>
                  <span>{(order.total).toFixed(2)} {language === 'ar' ? 'ر.س.' : 'SAR'}</span>
                </div>
              </div>

              {/* QR and Compliance Block */}
              {businessSettings.taxEnabled && (
                <div className="flex flex-col items-center justify-center pt-2 text-center space-y-2 print:break-inside-avoid">
                  <div className="bg-white p-2 inline-block rounded-xl border border-black/5">
                    {/* Real Cryptographic TLV QR code */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                        generateZatcaQr(
                          businessSettings.restaurantNameAr || 'رحلة شواء',
                          businessSettings.vatNumber || '310123456700003',
                          new Date(order.createdAt).toISOString(),
                          order.total.toFixed(2),
                          order.tax.toFixed(2)
                        )
                      )}`}
                      alt="ZATCA VAT QR Code"
                      referrerPolicy="no-referrer"
                      className="w-28 h-28 mx-auto"
                    />
                  </div>
                </div>
              )}

              {/* Receipt Footer Message */}
              <div className="text-center pt-3 border-t border-dashed border-black/10 print:border-black/30 mt-4">
                <p className="font-serif italic font-bold text-xs text-dark/70 print:text-black">
                  {language === 'ar' ? 'طعمنا غير...........وجودتنا تميزنا' : 'Our taste is unique...........Our quality is our signature'}
                </p>
                <p className="text-[9px] text-dark/40 font-mono mt-1">
                  {language === 'ar' ? 'شكراً لزيارتكم ونتمنى لكم وجبة هنيئة! ❤️' : 'Thank you for your visit, enjoy your meal! ❤️'}
                </p>
              </div>

            </div>

            {/* Modal Bottom Actions Row (Hidden in Print) */}
            <div className="p-4 bg-neutral-50 border-t border-black/5 flex print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-zinc-100 hover:bg-zinc-200 text-dark rounded-xl font-bold text-xs md:text-sm cursor-pointer transition-all border border-black/5"
              >
                <Printer className="w-4 h-4 text-dark" />
                <span>{language === 'ar' ? 'طباعة / حفظ PDF' : 'Print / Save PDF'}</span>
              </button>
            </div>

          </div>
        </div>
      )}

        </>
      )}

      {/* Visual Toast Notification Overlay */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 border p-4 rounded-2xl shadow-2xl z-[999] flex gap-3 text-start backdrop-blur-md text-white transition-all duration-300 ${
              toast.type === 'alert'
                ? 'bg-rose-600 border-rose-500'
                : toast.type === 'success'
                ? 'bg-emerald-600 border-emerald-500'
                : 'bg-indigo-600 border-indigo-500'
            }`}
          >
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-yellow-300 animate-bounce" />
            </div>
            <div className="flex-1 min-w-0 pr-2">
              <h4 className="font-bold text-sm leading-tight flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-yellow-300 shrink-0 animate-ring" />
                {language === 'ar' ? toast.titleAr : toast.titleEn}
              </h4>
              <p className="text-[11px] text-white/95 mt-1 leading-relaxed">
                {language === 'ar' ? toast.messageAr : toast.messageEn}
              </p>
              <div className="mt-2 text-[9px] font-mono text-white/60">
                {language === 'ar' ? `رقم الطلب: ${toast.orderId}` : `Order ID: ${toast.orderId}`}
              </div>
            </div>
            <button 
              onClick={() => setToast(prev => ({ ...prev, show: false }))}
              className="text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg p-1.5 self-start cursor-pointer transition-all shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
