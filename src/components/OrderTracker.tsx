import React, { useState, useEffect, useRef } from 'react';
import { Order } from '../types';
import { useLanguage } from './LanguageContext';
import { Search, Loader2, UtensilsCrossed, CheckCircle2, Clock, Ban, User, Phone, MapPin, Clipboard, FileText, Printer, QrCode, Sparkles, Bell, X, Download, Navigation, ShoppingBag, Copy, Check, Share2 } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';

interface OrderTrackerProps {
  initialOrderId?: string;
  businessSettings?: import('../types').BusinessSettings;
  onModifyOrder?: (order: Order) => void;
}

import { generateZatcaQr } from '../utils/time';

export const OrderTracker: React.FC<OrderTrackerProps> = ({ 
  initialOrderId = '', 
  businessSettings: passedSettings,
  onModifyOrder
}) => {
  const { language, t } = useLanguage();
  const [searchId, setSearchId] = useState(() => {
    return initialOrderId || localStorage.getItem('last_order_id') || '';
  });
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [copiedInvoice, setCopiedInvoice] = useState(false);

  const getInvoiceText = () => {
    if (!order) return '';
    const dateFormatted = new Date(order.createdAt).toISOString().replace('T', ' ').substring(0, 19);
    const orderType = order.tableOrDelivery === 'table' 
      ? (language === 'ar' ? `محلي - طاولة ${order.tableNumber || 'لم تحدد'}` : `Dine-In - Table ${order.tableNumber || 'Unspecified'}`)
      : order.tableOrDelivery === 'takeaway'
      ? (language === 'ar' ? 'استلام من الفرع' : 'Takeaway (Pickup)')
      : (language === 'ar' ? `توصيل - العنوان: ${order.deliveryAddress}` : `Delivery - Address: ${order.deliveryAddress}`);

    const itemsText = order.items.map(item => `• ${language === 'ar' ? item.nameAr : item.name} (${item.quantity}x) - ${(item.price * item.quantity).toFixed(1)} ${language === 'ar' ? 'ريال' : 'SAR'}`).join('\n');
    
    return language === 'ar' 
      ? `🍢 *فاتورة طلب - مطعم رحلة شواء* 🍢\n\n` +
        `*رقم الفاتورة:* ${order.id}\n` +
        `*التاريخ:* ${dateFormatted}\n` +
        `*نوع الطلب:* ${orderType}\n` +
        `*العميل:* ${order.customerName}\n` +
        `----------------------------------------\n` +
        `*الأصناف المطلوبة:*\n${itemsText}\n` +
        `----------------------------------------\n` +
        `*المجموع الفرعي:* ${(order.subtotal).toFixed(2)} ريال\n` +
        `*ضريبة القيمة المضافة:* ${(order.tax).toFixed(2)} ريال\n` +
        `*الإجمالي النهائي:* *${(order.total).toFixed(2)} ريال*\n\n` +
        `شكراً لزيارتكم وصحة وعافية! ❤️`
      : `🍢 *Invoice - Grilling Journey Restaurant* 🍢\n\n` +
        `*Order ID:* ${order.id}\n` +
        `*Date:* ${dateFormatted}\n` +
        `*Order Type:* ${orderType}\n` +
        `*Customer:* ${order.customerName}\n` +
        `----------------------------------------\n` +
        `*Items Ordered:*\n${itemsText}\n` +
        `----------------------------------------\n` +
        `*Subtotal:* ${(order.subtotal).toFixed(2)} SAR\n` +
        `*VAT:* ${(order.tax).toFixed(2)} SAR\n` +
        `*Total Amount:* *${(order.total).toFixed(2)} SAR*\n\n` +
        `Thank you for your visit, enjoy your meal! ❤️`;
  };

  const handleCopyInvoiceText = () => {
    const text = getInvoiceText();
    navigator.clipboard.writeText(text);
    setCopiedInvoice(true);
    setTimeout(() => setCopiedInvoice(false), 2000);
  };

  const handleShareInvoice = () => {
    const text = getInvoiceText();
    if (navigator.share) {
      navigator.share({
        title: language === 'ar' ? 'فاتورة طلب رحلة شواء' : 'Rehla BBQ Invoice',
        text: text,
      }).catch(err => {
        console.log('Share failed:', err);
        // Fallback to WhatsApp
        const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
        window.open(waUrl, '_blank');
      });
    } else {
      const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
    }
  };

  // Directly trigger print system for thermal receipt printer layout
  const handleDirectPrint = () => {
    setIsInvoiceOpen(true);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  const handleDownloadPDF = async () => {
    if (!order) return;
    setGeneratingPdf(true);
    const element = document.getElementById('recept-print-area');
    if (!element) {
      setGeneratingPdf(false);
      return;
    }

    const loadHtml2Pdf = () => {
      return new Promise<any>((resolve, reject) => {
        if ((window as any).html2pdf) {
          resolve((window as any).html2pdf);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
        script.onload = () => resolve((window as any).html2pdf);
        script.onerror = () => reject(new Error('Failed to load PDF library'));
        document.body.appendChild(script);
      });
    };

    // Helper to convert oklch or oklab colors to grayscale fallback for html2canvas
    const oklchToRgb = (match: string) => {
      try {
        const clean = match.replace(/okl[ch|ab]\(/i, '').replace(/\)/, '');
        const parts = clean.split('/');
        const colorParts = parts[0].trim().split(/\s+/);
        const L = parseFloat(colorParts[0]);
        
        let alpha = '1';
        if (parts[1]) {
          const aVal = parts[1].trim();
          if (aVal.endsWith('%')) {
            alpha = (parseFloat(aVal) / 100).toString();
          } else {
            alpha = aVal;
          }
        }
        
        if (isNaN(L)) return 'rgb(120, 120, 120)';
        const val = Math.round(L * 255);
        return `rgba(${val}, ${val}, ${val}, ${alpha})`;
      } catch (e) {
        return 'rgb(120, 120, 120)';
      }
    };

    const styleElements = Array.from(document.querySelectorAll('style'));
    const restoredStyles: { element: HTMLStyleElement; originalText: string }[] = [];

    try {
      // Temporarily replace oklch/oklab values to prevent html2canvas parsing errors
      styleElements.forEach((styleEl) => {
        const text = styleEl.textContent || '';
        if (text.includes('oklch') || text.includes('oklab')) {
          restoredStyles.push({ element: styleEl, originalText: text });
          const cleanedText = text.replace(/okl[ch|ab]\([^)]+\)/gi, oklchToRgb);
          styleEl.textContent = cleanedText;
        }
      });

      const html2pdf = await loadHtml2Pdf();
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `Invoice_${order.id}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2.5, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      await html2pdf().from(element).set(opt).save();
    } catch (err) {
      console.error('PDF generation failed, falling back to print:', err);
      window.print();
    } finally {
      // Restore original oklch/oklab styles so the UI remains pristine
      restoredStyles.forEach(({ element, originalText }) => {
        element.textContent = originalText;
      });
      setGeneratingPdf(false);
    }
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
  const lastNotifiedStatusRef = useRef<string | undefined>(undefined);
  const activeCleanupRef = useRef<(() => void) | null>(null);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  // Active ticking countdown effect to maintain accuracy of grace period
  useEffect(() => {
    if (!order || order.status !== 'pending') {
      setSecondsLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const gracePeriodMs = 60 * 1000; // 60 seconds (1 minute)
      const createdAtTime = new Date(order.createdAt).getTime();
      const elapsed = Date.now() - createdAtTime;
      const remainingSeconds = Math.max(0, Math.ceil((gracePeriodMs - elapsed) / 1000));
      return remainingSeconds;
    };

    const autoConfirmOrder = async () => {
      try {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'orders', order.id), { status: 'preparing' });
      } catch (e) {
        console.warn('Could not auto-confirm in Firestore:', e);
      }

      try {
        const stored = localStorage.getItem('simulated_orders');
        if (stored) {
          const parsedList: Order[] = JSON.parse(stored);
          const updatedList = parsedList.map(o => 
            o.id === order.id ? { ...o, status: 'preparing' as const } : o
          );
          localStorage.setItem('simulated_orders', JSON.stringify(updatedList));
        }
      } catch (e) {
        console.warn(e);
      }
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
        : 'توصيل (خارج المطعم)';
      const orderTypeEnglish = order.tableOrDelivery === 'table' 
        ? 'Dine-In' 
        : order.tableOrDelivery === 'takeaway' 
        ? 'Takeaway' 
        : 'Delivery';
      
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
      const cleanPhone = (businessSettings?.whatsappNumber || '966501234567').replace(/\D/g, '');
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
      // Helper check using sessionStorage to guarantee absolute zero duplicate notifications for a given orderId + status
      const getHasNotifiedDurable = (orderId: string, status: string): boolean => {
        try {
          return sessionStorage.getItem(`notified_dur_${orderId}_${status}`) === 'true';
        } catch (e) {
          return false;
        }
      };

      const setHasNotifiedDurable = (orderId: string, status: string) => {
        try {
          sessionStorage.setItem(`notified_dur_${orderId}_${status}`, 'true');
        } catch (e) {}
      };

      // If we are tracking a different order ID, initialize tracking references to prevent noisy alerts on initial load
      if (trackedOrderIdRef.current !== order.id) {
        setHasNotifiedDurable(order.id, order.status);
        lastNotifiedStatusRef.current = order.status;
        trackedOrderIdRef.current = order.id;
        prevStatusRef.current = order.status;
        return;
      }

      // Trigger notification ONLY when the status has actually changed and we haven't notified for this status yet
      if (lastNotifiedStatusRef.current !== order.status && !getHasNotifiedDurable(order.id, order.status)) {
        let titleAr = '';
        let titleEn = '';
        let messageAr = '';
        let messageEn = '';
        let type: 'success' | 'info' | 'alert' = 'info';

        if (order.status === 'searching_driver') {
          titleAr = 'جاري البحث عن مندوب توصيل 🚗';
          titleEn = 'Searching for Delivery Driver 🚗';
          messageAr = `تم استلام طلبك رقم ${order.id} بنجاح، وجاري حالياً البحث عن مندوب لتوصيله إليك.`;
          messageEn = `Your order ${order.id} has been received. We are now searching for a delivery driver.`;
          type = 'info';
        } else if (order.status === 'preparing') {
          titleAr = 'بدأ تحضير طلبك! 👨‍🍳🔥';
          titleEn = 'Kitchen Preparing Cooking! 👨‍🍳🔥';
          messageAr = `طلبك رقم ${order.id} قيد التحضير والطهي على الجمر والطلب المباشر بالمطبخ الآن!`;
          messageEn = `Order ${order.id} is now being cooked and grilled on the coals!`;
          type = 'info';
        } else if (order.status === 'ready') {
          titleAr = 'الطلب جاهز ولذيذ! 🎉🍢';
          titleEn = 'Your Order is Ready! 🎉🍢';
          messageAr = `عزيزنا ${order.customerName || 'العميل'}، اكتمل تحضير وتجهيز وجبتك الطازجة وهي جاهزة للاستلام الآن بالعافية!`;
          messageEn = `Dear ${order.customerName || 'Customer'}, your charcoal-grilled meal is complete and freshly prepared!`;
          type = 'success';
        } else if (order.status === 'driver_picked_up') {
          titleAr = 'المندوب استلم الطلب 📦🚗';
          titleEn = 'Driver Picked Up Order 📦🚗';
          messageAr = `قائد التوصيل استلم طلبك وهو يستعد للانطلاق للتسليم.`;
          messageEn = `The delivery agent has picked up your order and is preparing to depart.`;
          type = 'info';
        } else if (order.status === 'delivering') {
          titleAr = 'الطلب في الطريق إليك! 🚀🏠';
          titleEn = 'Order is On the Way! 🚀🏠';
          messageAr = `طلبك الشهي في الطريق إليك مع المندوب الآن! ترقب وصوله قريباً.`;
          messageEn = `Your fresh order is on its way to your address now with our driver!`;
          type = 'info';
        } else if (order.status === 'delivered') {
          titleAr = 'تم تسليم الطلب بنجاح! 🎉🍢';
          titleEn = 'Order Delivered Successfully! 🎉🍢';
          messageAr = `تم تسليم طلبك بنجاح. بالعافية والشهية الطيبة يا غالي! 🌸`;
          messageEn = `Your order has been delivered. Enjoy your delicious grilled meal! 🌸`;
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

        // Lock in the notified status durably and in ref to prevent any infinite loops or multiple notifications
        setHasNotifiedDurable(order.id, order.status);
        lastNotifiedStatusRef.current = order.status;
      }

      prevStatusRef.current = order.status;
      trackedOrderIdRef.current = order.id;
    } else {
      prevStatusRef.current = undefined;
      trackedOrderIdRef.current = undefined;
      lastNotifiedStatusRef.current = undefined;
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

  // Automatically track on mount if we have an ID
  useEffect(() => {
    if (searchId) {
      handleTrack(searchId);
    }
  }, [initialOrderId]);

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

    // 1. Establish real-time Firestore document listener
    const unsub = onSnapshot(
      doc(db, 'orders', cleanId),
      (docSnap) => {
        setLoading(false);
        isFirestoreActive = true;
        if (docSnap.exists()) {
          const freshOrder = docSnap.data() as Order;
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

  const getStatusFlow = () => {
    if (!order) return ['pending', 'preparing', 'delivered'];
    if (order.tableOrDelivery === 'delivery') {
      return ['pending', 'searching_driver', 'preparing', 'ready', 'driver_picked_up', 'delivering', 'delivered'];
    }
    return ['pending', 'preparing', 'ready', 'delivered'];
  };

  const getStepStatus = (step: string) => {
    if (!order) return 'inactive';
    if (order.status === 'cancelled') return 'inactive';

    const statusFlow = getStatusFlow();
    const currentIdx = statusFlow.indexOf(order.status);
    const stepIdx = statusFlow.indexOf(step);

    if (currentIdx >= stepIdx) {
      return currentIdx === stepIdx ? 'active' : 'completed';
    }
    return 'inactive';
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
            <div className="relative py-6">
              {/* Global Progress Line Bar */}
              <div className="absolute top-1/2 left-4 right-4 h-1 bg-neutral-100 -translate-y-1/2 z-0" />
              <div
                className="absolute top-1/2 left-4 h-1 bg-yellow -translate-y-1/2 z-0 transition-all duration-500"
                style={{
                  width: (() => {
                    const flow = getStatusFlow();
                    const currentIdx = flow.indexOf(order.status);
                    if (currentIdx === -1) return '0%';
                    const pct = (currentIdx / (flow.length - 1)) * 100;
                    return `${pct}%`;
                  })(),
                  right: language === 'ar' ? '16px' : 'auto',
                  left: language === 'ar' ? 'auto' : '16px'
                }}
              />

              <div className="relative z-10 flex justify-between items-center text-center">
                {getStatusFlow().map((step) => {
                  const stepStatus = getStepStatus(step);
                  const config = (() => {
                    switch (step) {
                      case 'pending':
                        return {
                          labelAr: 'تم الاستلام',
                          labelEn: 'Received',
                          icon: Clock
                        };
                      case 'searching_driver':
                        return {
                          labelAr: 'البحث عن مندوب',
                          labelEn: 'Searching',
                          icon: MapPin
                        };
                      case 'preparing':
                        return {
                          labelAr: 'جاري التحضير',
                          labelEn: 'Preparing',
                          icon: UtensilsCrossed
                        };
                      case 'ready':
                        return {
                          labelAr: 'الطلب جاهز',
                          labelEn: 'Ready',
                          icon: ShoppingBag
                        };
                      case 'driver_picked_up':
                        return {
                          labelAr: 'استلم المندوب',
                          labelEn: 'Picked Up',
                          icon: User
                        };
                      case 'delivering':
                        return {
                          labelAr: 'في الطريق',
                          labelEn: 'Delivering',
                          icon: Navigation
                        };
                      case 'delivered':
                        return {
                          labelAr: 'تم التسليم',
                          labelEn: 'Delivered',
                          icon: CheckCircle2
                        };
                      default:
                        return {
                          labelAr: step,
                          labelEn: step,
                          icon: Clock
                        };
                    }
                  })();
                  const StepIcon = config.icon;
                  return (
                    <div key={step} className="flex flex-col items-center flex-1 min-w-0 px-0.5">
                      <div
                        className={`w-7 h-7 md:w-10 md:h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                          stepStatus === 'completed'
                            ? 'bg-yellow border-yellow text-black font-semibold shadow-xs'
                            : stepStatus === 'active'
                            ? 'bg-white border-yellow text-yellow-650 ring-4 ring-yellow/15 scale-110'
                            : 'bg-neutral-50 border-black/5 text-dark/30'
                        }`}
                      >
                        <StepIcon className={`w-3.5 h-3.5 md:w-5 md:h-5 ${stepStatus === 'active' && step === 'preparing' ? 'animate-pulse' : ''}`} />
                      </div>
                      <span className={`text-[8px] md:text-[10px] font-bold mt-2 leading-tight block text-center w-full truncate ${stepStatus === 'inactive' ? 'text-dark/40 font-normal' : 'text-dark font-black'}`}>
                        {language === 'ar' ? config.labelAr : config.labelEn}
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
                        {language === 'ar' ? 'يمكنك تعديل أو إلغاء الطلب خلال دقيقة ⏱️' : 'You can modify or cancel within 1 minute ⏱️'}
                      </h4>
                      <p className="text-[11px] text-amber-700/85 leading-relaxed md:leading-normal font-medium">
                        {language === 'ar' 
                          ? 'طلبك قيد الانتظار حالياً. سيتم تأكيد طلبك والبدء في تحضيره تلقائياً بمجرد انتهاء العداد.' 
                          : 'Your order is pending. It will be automatically confirmed and prepared as soon as the countdown ends.'}
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
                      <UtensilsCrossed className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'تعديل وتحديث الطلب' : 'Modify Order'}</span>
                    </button>
                  )}
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

            {/* Google Reviews rating request section */}
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-3xl p-6 text-center space-y-4 shadow-inner relative overflow-hidden my-4">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none"></div>
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-yellow/15 rounded-full blur-2xl -ml-8 -mb-8 pointer-events-none"></div>
              
              <div className="relative space-y-2">
                <div className="flex justify-center text-yellow gap-1 text-base">
                  <span>⭐</span><span>⭐</span><span>⭐</span><span>⭐</span><span>⭐</span>
                </div>
                <h3 className="font-serif font-black text-dark text-base">
                  {language === 'ar' ? 'رأيك يهمنا ويسعدنا جداً! 🌸' : 'Your Opinion Matters and Delights Us! 🌸'}
                </h3>
                <p className="text-xs text-dark/70 max-w-md mx-auto leading-relaxed">
                  {language === 'ar' 
                    ? 'إذا أعجبتك تجربة الطلب ونكهة المشويات الفاخرة، نسعد بمشاركتك لتقييم مميز بـ 5 نجوم على جوجل ماب لدعم فريق العمل.' 
                    : 'If you enjoyed your order and the premium flavor of our grills, we would be honored if you rate us 5 stars on Google Maps!'}
                </p>
              </div>

              <div className="relative">
                <a
                  href="https://g.page/r/CVEDtSx0RBScEAE/review"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 py-2.5 px-5 bg-yellow hover:bg-yellow/90 text-black font-black text-xs rounded-xl transition-all hover:scale-[1.02] shadow-xs cursor-pointer"
                >
                  <span>📝</span>
                  {language === 'ar' ? 'قيمنا الآن على خرائط جوجل' : 'Rate us now on Google'}
                </a>
              </div>
            </div>

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

            {/* Elegant Callout encouraging screenshot and order number saving */}
            <div className="bg-amber-500/10 border border-amber-500/15 text-amber-900 p-4 rounded-2xl text-xs md:text-sm text-start font-sans font-medium space-y-1 my-3">
              <div className="flex items-center gap-2 font-black text-amber-950">
                <span className="text-sm">💡</span>
                <span>{language === 'ar' ? 'تنبيه هام لتسهيل استلام طلبك:' : 'Important pick-up instruction:'}</span>
              </div>
              <p className="leading-relaxed text-dark/85">
                {language === 'ar' 
                  ? 'لتسريع وتسهيل استلام طلبك من الفرع، يرجى تصوير شاشة الفاتورة الحالية أو الاحتفاظ برقم الطلب وإبرازه للموظف عند الاستلام. بالهناء والشفاء! 🌸'
                  : 'To facilitate and speed up your pick-up, please take a screenshot of this invoice or save the order number to present it to the staff. Enjoy your meal! 🌸'}
              </p>
            </div>

            {/* Premium action button to trigger the customer invoice view */}
            <div className="pt-2">
              <button
                id="view-zatca-invoice-btn"
                onClick={() => setIsInvoiceOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-yellow hover:bg-yellow/90 text-black rounded-2xl font-black text-xs md:text-sm cursor-pointer transition-all hover:scale-[1.01] shadow-xs"
              >
                <FileText className="w-4.5 h-4.5 shrink-0" />
                <span>{language === 'ar' ? 'عرض فاتورة استلام الطلب' : 'View Customer Invoice'}</span>
              </button>
            </div>

          </div>
        </motion.div>
      ) : (
        <div className="h-44 flex flex-col items-center justify-center text-center text-zinc-500 border border-dashed border-zinc-850 rounded-3xl bg-zinc-950/15 p-6">
          <Clock className="w-10 h-10 text-zinc-700 stroke-[1.5] mb-2" />
          <p className="font-bold text-xs text-zinc-400">{language === 'ar' ? 'أدخل رمز الطلب بالأعلى لعرض التحديثات المباشرة' : 'Input your code to begin live meal tracking'}</p>
        </div>
      )}

      {/* Premium ZATCA Simplified Tax Invoice Modal */}
      {isInvoiceOpen && order && (
        <div 
          onClick={() => setIsInvoiceOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:relative print:z-0 cursor-pointer"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white border border-black/5 rounded-3xl overflow-hidden shadow-2xl relative text-dark flex flex-col max-h-[90vh] print:border-none print:shadow-none print:bg-white print:text-black print:max-h-full print:overflow-visible cursor-default"
          >
            
            {/* Modal Header Controls (Hidden in Print) */}
            <div className="flex justify-between items-center bg-neutral-50 p-4 border-b border-black/5 print:hidden text-start">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-yellow-650" />
                <span className="font-bold text-xs uppercase tracking-wider text-dark/70">
                  {language === 'ar' ? 'فاتورة استلام الطلب الإلكترونية' : 'Customer Digital Receipt'}
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
            <div id="recept-print-area" className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-dark/80 print:text-black print:bg-white font-sans text-start print:overflow-visible print:p-0">
              
              {/* Receipt Header */}
              <div className="text-center space-y-2 border-b border-dashed border-black/10 pb-5 print:border-black/30">
                <div className="w-20 h-20 rounded-full bg-yellow/15 flex items-center justify-center font-bold text-dark text-2xl mx-auto shadow-sm overflow-hidden border border-yellow/20 print-large-logo">
                  {businessSettings?.logoUrl ? (
                    <img src={businessSettings.logoUrl} alt="Logo" className="w-[100%] h-[100%] object-cover animate-fade-in print:w-[100%] print:h-[100%]" />
                  ) : (
                    <span>{language === 'ar' ? businessSettings.restaurantNameAr.charAt(0) : businessSettings.restaurantNameEn.charAt(0)}</span>
                  )}
                </div>
                
                <h3 className="font-bold text-lg text-dark print:text-black mt-2 font-serif print:text-xl print:font-extrabold">
                  {language === 'ar' ? businessSettings.restaurantNameAr : businessSettings.restaurantNameEn}
                </h3>
                <p className="text-[10px] text-dark/40 uppercase tracking-widest print:text-zinc-700">
                  {language === 'ar' ? businessSettings.taglineAr : businessSettings.taglineEn}
                </p>
 
                <div className="bg-yellow/15 border border-yellow/25 text-yellow-700 font-bold px-3 py-1 rounded-full text-[10px] inline-block uppercase tracking-wider print:bg-gray-150 print:border-gray-300 print:text-black mt-1">
                  {language === 'ar' ? 'فاتورة ضريبة مبسطة' : 'Simplified Tax Invoice'}
                </div>
 
                <p className="text-xs text-dark/60 print:text-zinc-700 font-mono mt-3">
                  {language === 'ar' ? 'الرقم الضريبي للبائع: ' : 'Seller VAT Registration No: '}
                  <span className="font-bold text-dark print:text-black font-mono">{businessSettings.vatNumber || '310123456700003'}</span>
                </p>
                <p className="text-[10px] text-dark/40 print:text-zinc-700">
                  {language === 'ar' ? businessSettings.addressAr : businessSettings.addressEn}
                </p>
                <div className="flex justify-center gap-3 text-[9px] text-dark/50 print:text-zinc-700 font-mono mt-1">
                  {businessSettings.phone && (
                    <span>{language === 'ar' ? `هاتف: ${businessSettings.phone}` : `Tel: ${businessSettings.phone}`}</span>
                  )}
                  {businessSettings.whatsappNumber && (
                    <span>{language === 'ar' ? `واتساب: ${businessSettings.whatsappNumber}` : `WhatsApp: ${businessSettings.whatsappNumber}`}</span>
                  )}
                </div>
              </div>
 
              {/* Bill Details Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs font-mono py-1 border-b border-dashed border-black/10 pb-5 print:border-black/30 print:text-black">
                <div className="space-y-1.5">
                  <span className="text-[9px] text-dark/40 block uppercase print:text-black/60">{language === 'ar' ? 'رقم الفاتورة' : 'Invoice Number'}</span>
                  <span className="font-bold text-dark print:text-black">{order.id}</span>
                </div>
                <div className="space-y-1.5 text-end">
                  <span className="text-[9px] text-dark/40 block uppercase print:text-black/60">{language === 'ar' ? 'تاريخ الإصدار' : 'Issue Date'}</span>
                  <span className="font-bold text-dark print:text-black font-mono">
                    {new Date(order.createdAt).toISOString().replace('T', ' ').substring(0, 19)}
                  </span>
                </div>
 
                <div className="space-y-1.5 mt-2">
                  <span className="text-[9px] text-dark/40 block uppercase print:text-black/60">{language === 'ar' ? 'نوع الطلب' : 'Billing Type'}</span>
                  <span className="font-bold text-dark print:text-black">
                    {order.tableOrDelivery === 'table' 
                      ? (language === 'ar' ? `محلي - ${order.tableNumber ? `طاولة ${order.tableNumber}` : 'بدون طاولة'}` : `Dine-In - ${order.tableNumber ? `Table #${order.tableNumber}` : 'No Table'}`)
                      : order.tableOrDelivery === 'takeaway'
                      ? (language === 'ar' ? 'استلام من الفرع' : 'Takeaway (Pickup)')
                      : (language === 'ar' ? 'توصيل منزلي' : 'Home Delivery')}
                  </span>
                </div>
                <div className="space-y-1.5 text-end mt-2">
                  <span className="text-[9px] text-dark/40 block uppercase print:text-black/60">{language === 'ar' ? 'العميل' : 'Customer'}</span>
                  <span className="font-bold text-dark print:text-black">{order.customerName}</span>
                </div>
              </div>
 
              {/* Items Summary Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] text-dark/40 font-mono tracking-wider border-b border-black/5 pb-2 print:border-black/30">
                  <span className="w-1/2 print:text-black print:font-bold">{language === 'ar' ? 'البيان' : 'Item Description'}</span>
                  <span className="w-1/6 text-center print:text-black print:font-bold">{language === 'ar' ? 'الكمية' : 'Qty'}</span>
                  <span className="w-1/3 text-end print:text-black print:font-bold">{language === 'ar' ? 'السعر' : 'Amount'}</span>
                </div>
 
                <div className="space-y-2.5 pt-1.5">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-xs text-dark/80 print:text-black font-semibold">
                      <span className="w-1/2 font-sans">{language === 'ar' ? item.nameAr : item.name}</span>
                      <span className="w-1/6 text-center font-mono">{item.quantity}</span>
                      <span className="w-1/3 text-end font-mono">{(item.price * item.quantity).toFixed(2)} {t('sar')}</span>
                    </div>
                  ))}
                </div>
              </div>
 
              {/* Math Computations Receipt Footer */}
              <div className="border-t border-dashed border-black/10 pt-4 space-y-2 font-mono text-xs print:border-black/30">
                <div className="flex justify-between text-dark/60 print:text-black">
                  <span>
                    {language === 'ar'
                      ? (businessSettings.taxEnabled ? 'المجموع الخاضع للضريبة' : 'المجموع الفرعي')
                      : (businessSettings.taxEnabled ? 'Subtotal (Excl. VAT)' : 'Subtotal')}
                  </span>
                  <span className="font-mono">{(order.subtotal - (order.promoDiscount || 0)).toFixed(2)} {t('sar')}</span>
                </div>
 
                {order.promoDiscount > 0 && (
                  <div className="flex justify-between text-red-650 font-bold print:text-black print:font-bold">
                    <span>{language === 'ar' ? 'التخفيض المطبق' : 'Applied Discount'}</span>
                    <span className="font-mono">-{order.promoDiscount.toFixed(2)} {t('sar')}</span>
                  </div>
                )}
 
                {businessSettings.taxEnabled && (
                  <div className="flex justify-between text-dark/60 print:text-black">
                    <span>
                      {language === 'ar' 
                        ? `ضريبة القيمة المضافة (${businessSettings.taxPercent}%)` 
                        : `VAT (${businessSettings.taxPercent}%)`}
                    </span>
                    <span className="font-mono">{order.tax.toFixed(2)} {t('sar')}</span>
                  </div>
                )}
 
                <div className="h-px bg-black/5 print:bg-black/30 my-2" />
                <div className="flex justify-between text-dark font-black text-sm print:text-black print:font-extrabold">
                  <span>
                    {language === 'ar'
                      ? (businessSettings.taxEnabled ? 'المجموع الإجمالي شامل الضريبة' : 'المجموع الإجمالي النهائي')
                      : (businessSettings.taxEnabled ? 'Total (VAT Inclusive)' : 'Final Estimated Total')}
                  </span>
                  <span className="text-dark print:text-black font-black font-mono print:text-base">{(order.total).toFixed(2)} {t('sar')}</span>
                </div>
              </div>
 
              {/* Compliance ZATCA QR Code at the very bottom (Exact match with AdminPanel receipt model) */}
              {businessSettings.taxEnabled && (
                <div className="flex flex-col items-center justify-center pt-3 text-center space-y-2 border-t border-dashed border-black/10 mt-2 print:break-inside-avoid">
                  <div className="bg-white p-1 rounded-lg border border-black/20">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
                        generateZatcaQr(
                          language === 'ar' ? businessSettings.restaurantNameAr : businessSettings.restaurantNameEn,
                          businessSettings.vatNumber || '310123456700003',
                          new Date(order.createdAt).toISOString(),
                          order.total.toFixed(2),
                          order.tax.toFixed(2)
                        )
                      )}`}
                      alt="ZATCA QR Compliance"
                      referrerPolicy="no-referrer"
                      className="w-28 h-28 mx-auto"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[9px] font-black uppercase text-center tracking-wider text-dark/60">
                      {language === 'ar' ? 'الهيئة العامة للزكاة والضريبة والجمارك' : 'ZATCA E-INVOICE STANDARD'}
                    </div>
                    <p className="text-[8px] text-neutral-500 max-w-xs leading-relaxed text-center mx-auto leading-normal">
                      {language === 'ar' 
                        ? (businessSettings.invoiceFooterAr || 'شكراً لزيارتكم! بالهناء والشفاء')
                        : (businessSettings.invoiceFooterEn || 'Thank you so much! Enjoy your meal')}
                    </p>
                  </div>
                </div>
              )}
 
            </div>
 
            {/* Modal Bottom Actions Row (Close Button only as requested - No save/share/print buttons) */}
            <div className="p-4 bg-neutral-50 border-t border-black/5 flex flex-col gap-2 print:hidden">
              <button
                onClick={() => setIsInvoiceOpen(false)}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-yellow text-black hover:bg-yellow/95 rounded-2xl font-black text-xs md:text-sm cursor-pointer transition-all hover:scale-[1.01] shadow-xs"
              >
                <span>{language === 'ar' ? 'إغلاق الفاتورة' : 'Close Invoice'}</span>
              </button>
            </div>
 
          </div>
        </div>
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
              <Sparkles className="w-5 h-5 text-yellow-300 animate-bounce" />
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
