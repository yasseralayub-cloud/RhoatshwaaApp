import React, { useState } from 'react';
import { MenuItem, Order, CartItem } from '../types';
import { useLanguage } from './LanguageContext';
import { X, Trash2, MapPin, Store, CreditCard, ChevronLeft, Plus, Minus, Send, PhoneCall, ShoppingBag, Clock, AlertTriangle, Copy, Check, Landmark, Wallet } from 'lucide-react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { motion, AnimatePresence } from 'motion/react';
import { isRestaurantOpen, formatTime12h } from '../utils/time';
import MapPicker from './MapPicker';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onAdd: (item: any) => void;
  onRemove: (item: any) => void;
  onClear: () => void;
  onOrderSuccess: (orderId: string) => void;
  activePromo?: import('../types').Promotion | null;
  businessSettings?: import('../types').BusinessSettings;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  cartItems,
  onAdd,
  onRemove,
  onClear,
  onOrderSuccess,
  activePromo,
  businessSettings
}) => {
  const { language, t, isRtl } = useLanguage();
  
  // Checkout particulars
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [tableOrDelivery, setTableOrDelivery] = useState<'table' | 'takeaway' | 'delivery'>('table');
  const [tableNumber, setTableNumber] = useState('محلي');
  const [deliveryAddress, setDeliveryAddress] = useState('استلام من الفرع');
  const [orderNotes, setOrderNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'applepay' | 'mada' | 'transfer'>('cod');
  
  // Geolocation states
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  const [locating, setLocating] = useState(false);
  const [locSuccess, setLocSuccess] = useState(false);

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert(language === 'ar' ? 'خدمة تحديد الموقع غير مدعومة في متصفحك' : 'Geolocation is not supported by your browser');
      return;
    }
    setLocating(true);
    setLocSuccess(false);

    // Try high accuracy first, fall back to low accuracy for faster/indoor cellular lock
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
        setLocating(false);
        setLocSuccess(true);
        
        // Auto-populate delivery address with Google Maps link as a fallback
        const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
        const fallbackAddress = language === 'ar' ? `الموقع المحدد: ${mapsLink}` : `Selected Location: ${mapsLink}`;
        setDeliveryAddress(fallbackAddress);

        // Attempt reverse geocoding to extract real neighborhood and street names in Arabic
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=ar`)
          .then(res => res.json())
          .then(data => {
            if (data && data.display_name) {
              let cleanAddress = data.display_name;
              const parts = cleanAddress.split('،').map((p: string) => p.trim());
              if (parts.length > 3) {
                cleanAddress = parts.slice(0, Math.min(4, parts.length)).join('، ');
              }
              setDeliveryAddress(cleanAddress);
            }
          })
          .catch(err => {
            console.error("Failed to reverse-geocode GPS coordinates:", err);
          });
      },
      (error) => {
        console.warn("High accuracy GPS failed or timed out, trying low-accuracy network fallback...", error);
        
        // If it's a permission denied error, or if fallback fails too, show iOS helper instructions
        if (error.code === 1) { // PERMISSION_DENIED
          setLocating(false);
          alert(language === 'ar' 
            ? 'لأجهزة الآيفون والـ iOS:\nيرجى الذهاب إلى الإعدادات ⚙️ -> الخصوصية والأمن -> خدمات الموقع، وتأكد من تفعيلها والسماح لمتصفحك (سافاري أو كروم) بالوصول للموقع أثناء استخدام التطبيق.'
            : 'For iPhone & iOS users:\nPlease go to Settings ⚙️ -> Privacy & Security -> Location Services, ensure they are enabled, and allow your browser (Safari/Chrome) to access your location.');
        } else {
          // Low-accuracy fallback
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              setLatitude(lat);
              setLongitude(lng);
              setLocating(false);
              setLocSuccess(true);
              const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
              setDeliveryAddress(language === 'ar' ? `الموقع المحدد: ${mapsLink}` : `Selected Location: ${mapsLink}`);
            },
            (fallbackErr) => {
              console.error("All geolocation attempts failed:", fallbackErr);
              setLocating(false);
              alert(language === 'ar' 
                ? 'فشل تحديد الموقع. للتفعيل على الآيفون: الإعدادات ⚙️ -> الخصوصية -> خدمات الموقع، وتأكد من السماح لمتصفحك بالوصول للموقع، أو أدخل عنوانك يدوياً بالأسفل.' 
                : 'Failed to locate. To fix on iPhone: Settings ⚙️ -> Privacy -> Location Services, verify browser access is allowed, or type your address manually below.');
            },
            { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
          );
        }
      },
      { enableHighAccuracy: true, timeout: 4500, maximumAge: 10000 }
    );
  };
  
  // Card mock state
  const [cardNumber, setCardNumber] = useState('4000 1234 5678 9010');
  const [cardHolder, setCardHolder] = useState('');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Calculations
  const subtotal = cartItems.reduce((sum, current) => {
    const addonsTotal = current.customizations ? current.customizations.addons.reduce((aSum, a) => aSum + a.price, 0) : 0;
    return sum + ((current.item.price + addonsTotal) * current.quantity);
  }, 0);
  const hasPromo = !!(activePromo && activePromo.isActive && new Date(activePromo.endsAt).getTime() > Date.now());
  const promoDiscount = hasPromo ? subtotal * ((activePromo?.discountPercent || 0) / 100) : 0;
  const discountedSubtotal = subtotal - promoDiscount;
  
  const taxEnabled = businessSettings?.taxEnabled ?? true;
  const taxPercent = businessSettings?.taxPercent ?? 15;
  const taxMethod = businessSettings?.taxMethod ?? 'inclusive';

  let tax = 0;
  let total = discountedSubtotal;

  if (taxEnabled) {
    if (taxMethod === 'inclusive') {
      // Inclusive VAT: standard prices already include the tax (ZATCA / Saudi standard).
      total = discountedSubtotal;
      tax = total - (total / (1 + (taxPercent / 100)));
    } else {
      // Exclusive VAT: tax is added on top of standard prices.
      tax = discountedSubtotal * (taxPercent / 100);
      total = discountedSubtotal + tax;
    }
  }

  const deliveryFee = tableOrDelivery === 'delivery' ? (businessSettings?.deliveryFee ?? 15) : 0;
  const finalTotal = total + deliveryFee;

  // Smart checking of Dine-In only items: popular games (الألعاب الشعبية), coffee (القهوة), tea (الشاي)
  const hasDineInOnlyItems = cartItems.some(it => {
    if (it.item.dineInOnly) return true;
    const cat = (it.item.category || '').toLowerCase();
    if (cat === 'games' || cat === 'coffee') return true;
    const arName = (it.item.nameAr || '').toLowerCase();
    const enName = (it.item.name || '').toLowerCase();
    const keywords = ['شاي', 'شاهي', 'شائ', 'ألعاب شعبية', 'العاب شعبية', 'قهوة', 'tea', 'coffee', 'games', 'game'];
    return keywords.some(kw => arName.includes(kw) || enName.includes(kw));
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) return;
    
    const trimmedName = customerName.trim();
    if (!trimmedName || !customerPhone) {
      setErrorMsg(language === 'ar' ? 'يرجى إدخال البيانات المطلوبة' : 'Please fill required customer details');
      return;
    }

    // Name regex to allow Arabic/English letters and spaces only
    const nameAllowedChars = /^[a-zA-Z\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+$/;
    if (!nameAllowedChars.test(trimmedName)) {
      setErrorMsg(language === 'ar' 
        ? 'الاسم يجب أن يحتوي على حروف فقط (العربية أو الإنجليزية) بدون أرقام أو رموز خاصة.' 
        : 'Name must contain letters only (Arabic or English) and no numbers or symbols.');
      return;
    }

    if (trimmedName.length < 4) {
      setErrorMsg(language === 'ar' 
        ? 'الاسم قصير جداً! يرجى كتابة الاسم بالكامل (4 حروف على الأقل).' 
        : 'Name is too short! Please enter your full name (at least 4 characters).');
      return;
    }

    const nameWords = trimmedName.split(/\s+/);
    if (nameWords.length < 2) {
      setErrorMsg(language === 'ar' 
        ? 'يرجى إدخال الاسم الثنائي على الأقل (الاسم واسم العائلة، مثال: محمد الربيعان).' 
        : 'Please enter at least your first and last name (e.g. Mohammed Al-Rubaian).');
      return;
    }

    // Ensure each word is at least 2 characters long
    for (const word of nameWords) {
      if (word.length < 2) {
        setErrorMsg(language === 'ar' 
          ? 'يجب أن تتكون كل كلمة في الاسم من حرفين على الأقل.' 
          : 'Each word in the name must be at least 2 characters.');
        return;
      }
    }

    // Check for repetitive gibberish (e.g. "aaaa", "هههه", or 3 identical consecutive characters)
    let hasGibberish = false;
    for (const word of nameWords) {
      if (word.length >= 3) {
        // Detect 3 or more repeating characters in a row (e.g. aaa, ههه)
        if (/(.)\1\1/.test(word.toLowerCase())) {
          hasGibberish = true;
          break;
        }
      }
      // Also block words that are just 1 repeated character of length >= 4
      if (word.length >= 4) {
        const charSet = new Set(word.toLowerCase());
        if (charSet.size === 1) {
          hasGibberish = true;
          break;
        }
      }
    }
    if (hasGibberish) {
      setErrorMsg(language === 'ar' 
        ? 'الاسم المدخل غير صحيح أو يحتوي على حروف مكررة بلا معنى.' 
        : 'The entered name is invalid or contains meaningless repeating characters.');
      return;
    }

    // Phone validation - Enforce strict Saudi Mobile formats only
    const cleanPhone = customerPhone.replace(/[\s\-\(\)]/g, '');
    const saudiPhoneRegex = /^(05[0-9]{8}|5[0-9]{8}|\+9665[0-9]{8}|9665[0-9]{8}|009665[0-9]{8})$/;
    
    if (!saudiPhoneRegex.test(cleanPhone)) {
      setErrorMsg(language === 'ar' 
        ? 'رقم الجوال غير صحيح! يرجى إدخال رقم جوال سعودي صحيح يبدأ بـ 05 أو 5 يتكون من 9 أو 10 أرقام (مثال: 05XXXXXXXX).' 
        : 'Invalid mobile number! Please enter a valid Saudi mobile phone starting with 05 or 5 (e.g., 05XXXXXXXX).');
      return;
    }

    if (tableOrDelivery === 'delivery' && hasDineInOnlyItems) {
      setErrorMsg(language === 'ar' 
        ? 'يا هلا بك! 🌸 عذراً منك يا غالي، لا يمكننا إرسال زمزمية القهوة أو ترمس الشاي أو الألعاب الشعبية استلام من الفرع. هذه الأصناف مخصصة للاستمتاع بها داخل المطعم (محلي) فقط لتجربة مميزة وصحيحة. نتشرف بخدمتك محلياً!' 
        : 'Welcome! 🌸 Gentle reminder: coffee pots, tea thermoses, and popular board games cannot be ordered for takeaway. These are exclusively for dine-in enjoyment to ensure the best experience. We would love to serve you here!');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    // Generate unique nice order code, e.g. ORD-10293
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const orderId = `Rehla-${randNum}`;

    const itemsFormatted = cartItems.map(c => {
      const addonsTotal = c.customizations ? c.customizations.addons.reduce((aSum, a) => aSum + a.price, 0) : 0;
      
      let suffixAr = '';
      let suffixEn = '';
      if (c.customizations) {
        const partsAr: string[] = [];
        const partsEn: string[] = [];
        if (c.customizations.notes.length > 0) {
          partsAr.push(...c.customizations.notes);
          const notesMap: Record<string, string> = {
            'بدون ثوم': 'No Garlic',
            'بدون مخلل': 'No Pickles',
            'بدون بطاطس': 'No Fries',
            'مع حمص': 'With Hummus',
            'مع متبل': 'With Mutabbal',
            'بدون بصل وبقدونس': 'No Onion & Parsley',
            'بهارات': 'Spices',
            'زيادة ملح': 'Extra Salt',
            'ملح خفيف': 'Light Salt'
          };
          partsEn.push(...c.customizations.notes.map(n => notesMap[n] || n));
        }
        if (c.customizations.addons.length > 0) {
          partsAr.push(...c.customizations.addons.map(a => a.nameAr));
          partsEn.push(...c.customizations.addons.map(a => a.nameEn));
        }
        if (partsAr.length > 0) {
          suffixAr = ` [${partsAr.join('، ')}]`;
          suffixEn = ` [${partsEn.join(', ')}]`;
        }
      }

      return {
        id: c.id || c.item.id,
        name: `${c.item.name}${suffixEn}`,
        nameAr: `${c.item.nameAr}${suffixAr}`,
        price: c.item.price + addonsTotal,
        quantity: c.quantity
      };
    });

    const orderData: Order = {
      id: orderId,
      customerName,
      customerPhone,
      tableOrDelivery,
      tableNumber: tableOrDelivery === 'table' ? tableNumber : '',
      deliveryAddress: tableOrDelivery === 'delivery' ? deliveryAddress : (tableOrDelivery === 'takeaway' ? 'استلام من الفرع' : ''),
      notes: orderNotes,
      items: itemsFormatted,
      subtotal,
      tax: Number(tax.toFixed(2)),
      total: Number(finalTotal.toFixed(2)),
      paymentMethod,
      status: 'pending',
      whatsappSent: true,
      createdAt: new Date().toISOString(),
      appliedPromoId: hasPromo ? (activePromo?.id || 'active') : '',
      promoDiscount: Number(promoDiscount.toFixed(2)),
    };

    if (tableOrDelivery === 'delivery') {
      if (latitude !== undefined) {
        orderData.latitude = latitude;
      }
      if (longitude !== undefined) {
        orderData.longitude = longitude;
      }
      if (deliveryFee !== undefined) {
        orderData.deliveryFee = deliveryFee;
      }
    }

    // 1. If electronic payment is selected, route through our secure Tap Payments backend API
    if (paymentMethod === 'mada' || paymentMethod === 'applepay') {
      try {
        const payRes = await fetch('/api/pay-tap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            orderId: orderId,
            amount: Number(finalTotal.toFixed(2)),
            customerName,
            customerPhone,
            redirectOrigin: window.location.origin
          })
        });

        const payData = await payRes.json();

        if (!payRes.ok || !payData.success) {
          throw new Error(payData.message || (language === 'ar' ? 'فشل إعداد اتصال بوابة سداد بـ Tap Payments.' : 'Failed to initialize session with Tap gateway.'));
        }

        const pendingOrder: Order = {
          ...orderData,
          status: 'pending',
          whatsappSent: false
        };

        // Cache locally for continuity and store in firestore
        try {
          const localOrdersStr = localStorage.getItem('simulated_orders') || '[]';
          const localOrders = JSON.parse(localOrdersStr);
          localOrders.unshift(pendingOrder);
          localStorage.setItem('simulated_orders', JSON.stringify(localOrders));
        } catch (e) {
          console.warn('Local cache storage warning:', e);
        }

        try {
          await setDoc(doc(db, 'orders', orderId), pendingOrder);
        } catch (firebaseErr) {
          console.warn('Firestore sync failure on redirect, continuing with gateway transfer:', firebaseErr);
        }

        // Redirect to secure Tap Payments interface
        window.location.href = payData.transaction.url;
        return;
      } catch (payErr: any) {
        console.error('Tap checkout session error:', payErr);
        setErrorMsg(payErr.message || (language === 'ar' ? 'حدث خطأ أثناء الانتقال لبوابة الدفع الإلكتروني. يرجى المحاولة لاحقاً.' : 'Connection failure occurred redirecting to secure portal.'));
        setLoading(false);
        return;
      }
    }

    // 2. Default Cash/COD direct checkout and WhatsApp dispatch sequence
    try {
      const localOrdersStr = localStorage.getItem('simulated_orders') || '[]';
      const localOrders = JSON.parse(localOrdersStr);
      localOrders.unshift(orderData);
      localStorage.setItem('simulated_orders', JSON.stringify(localOrders));
    } catch (err) {
      console.warn('Failed to cache order locally:', err);
    }

    try {
      // 3. Write document to Firestore securely
      await setDoc(doc(db, 'orders', orderId), orderData);
    } catch (firebaseErr) {
      console.warn('Firestore sync failed or offline. Continuing gracefully with local fallback:', firebaseErr);
    }

    // Securely trigger server-side Telegram bot order notification dispatch
    try {
      fetch('/api/notify-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: orderData })
      }).catch(e => console.warn('Telegram notification dispatcher error:', e));
    } catch (teleErr) {
      console.warn('Telegram notification trigger failed:', teleErr);
    }

    try {
      // 4. Generate WhatsApp formatted string
      const orderTypeArabic = tableOrDelivery === 'table' 
        ? 'محلي (داخل المطعم)' 
        : tableOrDelivery === 'takeaway' 
          ? 'استلام من الفرع' 
          : `توصيل (إلى العنوان: ${deliveryAddress})`;
      const orderTypeEnglish = tableOrDelivery === 'table' 
        ? 'Dine-In' 
        : tableOrDelivery === 'takeaway' 
          ? 'Pick up from branch' 
          : `Delivery (Address: ${deliveryAddress})`;
      
      const payArabic = paymentMethod === 'cod' ? 'الدفع عند الاستلام' : paymentMethod === 'transfer' ? 'تحويل بنكي الراجحي' : paymentMethod === 'applepay' ? 'آبل باي (الدفع الإلكتروني)' : 'مدى (بطاقة بنكية)';
      const payEnglish = paymentMethod === 'cod' ? 'Cash on Delivery' : paymentMethod === 'transfer' ? 'Al Rajhi Bank Transfer' : paymentMethod === 'applepay' ? 'Apple Pay (Mock)' : 'Mada (Mock)';

      const listArabic = itemsFormatted.map(c => `• ${c.nameAr} (العدد: ${c.quantity}) بسعر: ${(c.price * c.quantity).toFixed(1)} ريال`).join('\n');
      const listEnglish = itemsFormatted.map(c => `• ${c.name} (${c.quantity}x) price: ${(c.price * c.quantity).toFixed(1)} SAR`).join('\n');

      const promoArabic = hasPromo ? `*العرض المطبق:* ${activePromo?.titleAr} (خصم %${activePromo?.discountPercent}-)\n*قيمة التخفيض:* ${promoDiscount.toFixed(1)} ريال\n` : '';
      const promoEnglish = hasPromo ? `*Promo Applied:* ${activePromo?.title} (-${activePromo?.discountPercent}%)\n*Discount Value:* ${promoDiscount.toFixed(1)} SAR\n` : '';

      const notesArabicText = orderNotes ? `*ملاحظات العميل:* ${orderNotes}\n` : '';
      const notesEnglishText = orderNotes ? `*Customer Notes:* ${orderNotes}\n` : '';

      const waMessage = language === 'ar' 
        ? `*الطلب الجديد من ${businessSettings?.restaurantNameAr || t('appName')}* 🍢🥤\n\n` +
          `*رقم الطلب:* \`${orderId}\`\n` +
          `*الاسم:* ${customerName}\n` +
          `*الجوال:* ${customerPhone}\n` +
          `*نوع الطلب:* ${orderTypeArabic}\n` +
          notesArabicText + '\n' +
          `*الأصناف المطلوبة:*\n${listArabic}\n\n` +
          `*الحساب الفرعي:* ${subtotal.toFixed(2)} ريال\n` +
          promoArabic +
          (taxEnabled ? `*الضريبة (${taxPercent}%):* ${tax.toFixed(2)} ريال\n` : `*الضريبة:* معفى من الضريبة المضافة\n`) +
          (deliveryFee > 0 ? `*رسوم التوصيل:* ${deliveryFee.toFixed(2)} ريال\n` : '') +
          `*الإجمالي النهائي:* *${finalTotal.toFixed(2)} ريال*\n` +
          `*طريقة الدفع:* ${payArabic}\n\n` +
          `_تم تسجيل وتأكيد الطلب بنجاح في النظام التفاعلي! أرجو تجهيز الطلب بأقرب وقت._`
        : `*New Order from ${businessSettings?.restaurantNameEn || t('appName')}* 🍢🥤\n\n` +
          `*Order Code:* \`${orderId}\`\n` +
          `*Name:* ${customerName}\n` +
          `*Phone:* ${customerPhone}\n` +
          `*Type:* ${orderTypeEnglish}\n` +
          notesEnglishText + '\n' +
          `*Items Ordered:*\n${listEnglish}\n\n` +
          `*Subtotal:* ${subtotal.toFixed(2)} SAR\n` +
          promoEnglish +
          (taxEnabled ? `*Tax (${taxPercent}%):* ${tax.toFixed(2)} SAR\n` : `*Tax:* VAT Exempted\n`) +
          (deliveryFee > 0 ? `*Delivery Fee:* ${deliveryFee.toFixed(2)} SAR\n` : '') +
          `*Estimated Total:* *${finalTotal.toFixed(2)} SAR*\n` +
          `*Payment:* ${payEnglish}\n\n` +
          `_This order has been recorded into our live system. Looking forward to preparing it!_`;

      // Direct submit to system, no longer force-redirecting or opening WhatsApp automatically on checkout
      onOrderSuccess(orderId);
      onClear();
      onClose();

    } catch (err) {
      console.error(err);
      setErrorMsg(language === 'ar' ? 'فشل إرسال الطلب، الرجاء التحقق من الاتصال بالإنترنت.' : 'Failed to register order. Check connection.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className={`absolute inset-y-0 ${isRtl ? 'left-0' : 'right-0'} max-w-lg w-full bg-white border-black/5 text-dark shadow-2xl flex flex-col justify-between transform transition-transform duration-300 z-50 ${isRtl ? 'border-r' : 'border-l'}`}>
        {/* Header */}
        <div className="p-4 border-b border-black/5 flex items-center justify-between bg-neutral-50 text-dark">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-dark/60 hover:text-dark cursor-pointer">
              <ChevronLeft className={`w-5 h-5 ${isRtl ? 'rotate-180' : ''}`} />
            </button>
            <h2 className="font-semibold text-lg">{t('cart')}</h2>
          </div>
          {cartItems.length > 0 && (
            <button
              onClick={onClear}
              className="text-yellow-600 hover:text-yellow-700 transition-colors text-xs flex items-center gap-1 cursor-pointer font-bold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {language === 'ar' ? 'تفريغ السلة' : 'Clear Basket'}
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Cart item elements */}
          {cartItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-dark/40 py-12">
              <ShoppingBag className="w-16 h-16 text-dark/20 stroke-[1.5] mb-4" />
              <p className="font-semibold text-dark/80 mb-1">{t('emptyCart')}</p>
              <p className="text-xs text-dark/40 max-w-xs">{language === 'ar' ? 'أضف ما تشتهيه من أصناف لذيذة ومشروبات دافئة وسجل طلبك فوراً!' : 'Browse our fine food section to fill your plate!'}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-bold text-xs text-dark/40 uppercase tracking-wider text-start">{language === 'ar' ? 'الأصناف المختارة' : 'Selected Products'}</h3>
              <div className="divide-y divide-black/5 border border-black/5 rounded-2xl bg-neutral-50 p-2.5 space-y-3">
                {cartItems.map((c) => {
                  const { item, quantity } = c;
                  const addonsTotal = c.customizations ? c.customizations.addons.reduce((sum, a) => sum + a.price, 0) : 0;
                  const itemTotalPrice = (item.price + addonsTotal) * quantity;
                  
                  return (
                    <div key={c.id || item.id} className="flex gap-3 py-2 text-start flex-col sm:flex-row">
                      <div className="flex gap-3 flex-1">
                        <img
                          src={item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600'}
                          alt={language === 'ar' ? item.nameAr : item.name}
                          className="w-16 h-16 rounded-xl object-cover border border-black/5 bg-white shadow-xs shrink-0 self-start"
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <h4 className="font-bold text-sm text-dark leading-tight">
                              {language === 'ar' ? item.nameAr : item.name}
                            </h4>
                            <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                              {item.price + addonsTotal} {t('sar')} / {language === 'ar' ? 'القطعة' : 'unit'}
                              {addonsTotal > 0 && ` (${language === 'ar' ? 'شامل الإضافات' : 'incl. extras'})`}
                            </p>

                            {/* Custom notes AND addons details list */}
                            {c.customizations && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {c.customizations.notes.map((note) => (
                                  <span key={note} className="bg-orange-50 text-orange-700 text-[11px] sm:text-xs px-2 py-0.5 rounded-md font-bold border border-orange-500/20 shadow-xs">
                                    {note}
                                  </span>
                                ))}
                                {c.customizations.addons.map((addon) => (
                                  <span key={addon.nameAr} className="bg-green-50 text-green-700 text-[11px] sm:text-xs px-2 py-0.5 rounded-md font-bold border border-green-500/20 shadow-xs">
                                    {language === 'ar' ? addon.nameAr : addon.nameEn} {addon.price > 0 ? `(+${addon.price})` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex justify-between items-center mt-2.5">
                            <span className="font-black text-sm text-dark">
                              {itemTotalPrice.toFixed(1)} {t('sar')}
                            </span>
                            
                            {/* Adjuster */}
                            <div className="flex items-center gap-1.5 bg-white border border-black/5 rounded-lg p-0.5 scale-90 shadow-sm shrink-0">
                              <button
                                onClick={() => onRemove(c)}
                                className="p-1 rounded-md text-dark/60 hover:text-yellow border border-transparent hover:border-black/5 cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="font-bold text-xs w-4 text-center">{quantity}</span>
                              <button
                                onClick={() => onAdd(c)}
                                className="p-1 rounded-md text-dark/80 hover:text-yellow border border-transparent hover:border-black/5 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Subtotal list */}
              <div className="border border-black/5 p-4 rounded-2xl bg-neutral-50 space-y-2.5">
                <div className="flex justify-between text-sm text-dark/70 font-sans">
                  <span>{t('subtotal')}</span>
                  <span className="font-semibold text-dark">{subtotal.toFixed(1)} {t('sar')}</span>
                </div>
                {hasPromo && (
                  <div className="flex justify-between text-sm text-red-650 font-semibold bg-red-50 rounded-lg px-2 py-1.5 border border-red-500/10">
                    <span>{language === 'ar' ? `خصم العرض الترويجي (${activePromo?.discountPercent}%)` : `Promotion Discount (${activePromo?.discountPercent}%)`}</span>
                    <span>- {promoDiscount.toFixed(1)} {t('sar')}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-dark/50">
                  <span>
                    {language === 'ar'
                      ? `الضريبة (${taxEnabled ? taxPercent : 0}%)`
                      : `VAT (${taxEnabled ? taxPercent : 0}%)`}
                  </span>
                  <span className="text-dark/80">{tax.toFixed(2)} {t('sar')}</span>
                </div>
                {tableOrDelivery === 'delivery' && (
                  <div className="flex justify-between text-sm text-amber-650 font-semibold bg-amber-50 rounded-lg px-2 py-1.5 border border-amber-500/10">
                    <span>{language === 'ar' ? 'رسوم التوصيل' : 'Delivery Fee'}</span>
                    <span>+ {deliveryFee.toFixed(1)} {t('sar')}</span>
                  </div>
                )}
                <div className="h-px bg-black/5 my-2" />
                <div className="flex justify-between text-base font-extrabold text-dark font-sans">
                  <span>
                    {language === 'ar'
                      ? (taxEnabled ? 'الإجمالي شامل الضريبة' : 'المجموع الإجمالي النهائي')
                      : (taxEnabled ? 'Total (VAT Inclusive)' : 'Final Estimated Total')}
                  </span>
                  <span className="text-lg text-dark font-black">{finalTotal.toFixed(2)} {t('sar')}</span>
                </div>
              </div>

              {/* Delivery / Form */}
              <form onSubmit={handleSubmit} className="space-y-4 border border-black/5 p-4 rounded-2xl bg-neutral-50/50 text-start mt-4">
                <div className="flex items-center gap-2 pb-2 border-b border-black/5">
                  <div className="w-2 h-2 bg-yellow rounded-full animate-ping" />
                  <h3 className="font-bold text-xs uppercase tracking-wider text-dark/60">{t('customerDetails')}</h3>
                </div>

                <div className="space-y-3.5">
                  {/* Name field */}
                  <div>
                    <label className="block text-xs font-semibold text-dark/60 mb-1">{t('fullName')} <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="text"
                      value={customerName}
                      onChange={(e) => {
                        // Allow only letters (including Arabic and English) and spaces
                        const filtered = e.target.value.replace(/[^a-zA-Z\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '');
                        setCustomerName(filtered);
                      }}
                      placeholder={language === 'ar' ? 'مثال: محمد الربيعان' : 'e.g. Mohammed Al-Rubaian'}
                      className="w-full text-sm bg-white border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-yellow text-dark placeholder-dark/30 shadow-xs"
                    />
                  </div>

                  {/* Phone field */}
                  <div>
                    <label className="block text-xs font-semibold text-dark/60 mb-1">{language === 'ar' ? 'رقم الجوال' : 'Mobile Number'} <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => {
                        // Allow only digits and leading plus sign
                        const filtered = e.target.value.replace(/[^0-9\+]/g, '');
                        setCustomerPhone(filtered);
                      }}
                      placeholder="+966 5x xxx xxxx"
                      className="w-full text-sm bg-white border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-yellow text-dark placeholder-dark/30 shadow-xs"
                    />
                  </div>

                  {/* Order Type Toggle */}
                  <div>
                    <label className="block text-xs font-semibold text-dark/60 mb-2">{language === 'ar' ? 'طريقة الاستلام' : 'Order Type'}</label>
                    <div className="grid grid-cols-3 gap-2 bg-neutral-100 p-1 rounded-xl border border-black/5">
                      {/* DINE-IN (LOCAL) */}
                      <button
                        type="button"
                        onClick={() => {
                          setTableOrDelivery('table');
                          setTableNumber('محلي');
                        }}
                        className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-2 text-[10px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          tableOrDelivery === 'table'
                            ? 'bg-yellow text-black shadow-sm'
                            : 'text-dark/40 hover:text-dark/70'
                        }`}
                      >
                        <Store className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'محلي' : 'Dine-In'}</span>
                      </button>

                      {/* TAKEAWAY */}
                      <button
                        type="button"
                        onClick={() => {
                          setTableOrDelivery('takeaway');
                          setDeliveryAddress('استلام من الفرع');
                        }}
                        className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-2 text-[10px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          tableOrDelivery === 'takeaway'
                            ? 'bg-yellow text-black shadow-sm'
                            : 'text-dark/40 hover:text-dark/70'
                        }`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'استلام من الفرع' : 'Takeaway'}</span>
                      </button>

                      {/* DELIVERY */}
                      <button
                        type="button"
                        onClick={() => {
                          setTableOrDelivery('delivery');
                          setDeliveryAddress('');
                        }}
                        className={`flex flex-col sm:flex-row items-center justify-center gap-1 py-1.5 px-2 text-[10px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          tableOrDelivery === 'delivery'
                            ? 'bg-yellow text-black shadow-sm'
                            : 'text-dark/40 hover:text-dark/70'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'توصيل' : 'Delivery'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Delivery Address & Geolocation block when delivery is active */}
                  {tableOrDelivery === 'delivery' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-2.5 p-3 bg-white border border-black/5 rounded-2xl w-full"
                    >
                      <div>
                        <label className="block text-[11px] font-semibold text-dark/60 mb-1">
                          {language === 'ar' ? 'عنوان التوصيل بالتفصيل' : 'Detailed Delivery Address'} <span className="text-red-500">*</span>
                        </label>
                        <input
                          required={tableOrDelivery === 'delivery'}
                          type="text"
                          value={deliveryAddress === 'استلام من الفرع' || deliveryAddress === 'محلي' ? '' : deliveryAddress}
                          onChange={(e) => setDeliveryAddress(e.target.value)}
                          placeholder={language === 'ar' ? 'مثال: حي الياسمين، شارع القلم، رقم المنزل 4' : 'e.g. Alyasmin Dist, Al-Qalam St, House 4'}
                          className="w-full text-xs bg-neutral-50 border border-black/10 rounded-xl px-3 py-2 outline-none focus:border-yellow text-dark placeholder-dark/30 shadow-xs"
                        />
                      </div>

                      {/* Determine my current location button */}
                      <button
                        type="button"
                        onClick={handleGetLocation}
                        disabled={locating}
                        className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-dark hover:bg-black text-white disabled:bg-neutral-300 font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
                      >
                        <MapPin className={`w-4 h-4 ${locating ? 'text-yellow animate-spin' : 'text-yellow'}`} />
                        <span>
                          {locating 
                            ? (language === 'ar' ? 'جاري تحديد موقعك...' : 'Locating you...') 
                            : (language === 'ar' ? 'تحديد موقعي الحالي 📍' : 'Determine my current location 📍')}
                        </span>
                      </button>

                      {/* GPS coordinates & Google Maps link finder */}
                      <div className="pt-2">
                        <label className="block text-[11px] font-bold text-dark/70 mb-1.5 text-start">
                          {language === 'ar' ? 'تأكيد أو تعديل إحداثيات موقعك' : 'Confirm or Edit Your Coordinates'}
                        </label>
                        <MapPicker
                          latitude={latitude}
                          longitude={longitude}
                          onChange={(lat, lng) => {
                            setLatitude(lat);
                            setLongitude(lng);
                            setLocSuccess(true);
                          }}
                          onAddressSelect={(address) => {
                            setDeliveryAddress(address);
                          }}
                        />
                      </div>

                      {locSuccess && latitude && longitude && (
                        <div className="text-[10px] text-green-700 bg-green-50/50 border border-green-500/10 p-2 rounded-lg font-mono text-center">
                          {language === 'ar' ? '✓ تم حفظ الإحداثيات بنجاح:' : '✓ Coordinates locked successfully:'} {latitude.toFixed(6)}, {longitude.toFixed(6)}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Dine-In items warning filter */}
                  {tableOrDelivery !== 'table' && hasDineInOnlyItems && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3.5 rounded-2xl text-xs space-y-1 text-start">
                      <p className="font-bold flex items-center gap-1 text-amber-600">
                        <span>⚠️ {language === 'ar' ? 'يا هلا بك! تنبيه لطيف 🌸' : 'Welcome! Gentle Note 🌸'}</span>
                      </p>
                      <p className="text-dark/80 leading-normal font-medium">
                        {language === 'ar'
                          ? 'نود التنبيه بلطف أنه لا يمكن طلب زمزمية القهوة، ترمس الشاي، أو الألعاب الشعبية استلام من الفرع أو توصيل. يسعدنا جداً استضافتك وتقديمها لك للاستمتاع بها داخل المطعم (محلي).'
                          : 'We kindly inform you that coffee pots, tea thermoses, and board games cannot be ordered for takeaway or delivery. We would be absolutely delighted to host and serve you these items for dine-in.'}
                      </p>
                    </div>
                  )}

                  {/* General order notes (khanat al-molahadat!) */}
                  <div>
                    <label className="block text-xs font-semibold text-dark/60 mb-1">{language === 'ar' ? 'ملاحظات الطلب (اختياري)' : 'Order Notes (Optional)'}</label>
                    <textarea
                      rows={2}
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder={language === 'ar' ? 'اكتب ملاحظاتك أو طلباتك الخاصة بالتحضير هنا...' : 'Enter any special cooking or preparation notes here...'}
                      className="w-full text-sm bg-white border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-yellow resize-none text-dark placeholder-dark/30 shadow-xs"
                    />
                  </div>

                  {/* Payment selection */}
                  <div>
                    <label className="block text-xs font-bold text-dark/70 mb-2.5 text-start">
                      {language === 'ar' ? 'طريقة الدفع المتوفرة' : 'Available Payment Method'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {/* COD */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cod')}
                        className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          paymentMethod === 'cod'
                            ? 'border-yellow bg-yellow/10 text-yellow-900 font-extrabold shadow-xs'
                            : 'border-black/5 bg-neutral-50 text-dark/60 hover:border-black/15 hover:text-dark'
                        }`}
                      >
                        <Store className="w-5 h-5 text-yellow-750" />
                        <span className="text-[11px] font-bold whitespace-nowrap">{language === 'ar' ? 'كاش / نقدي' : 'Cash'}</span>
                      </button>
                      
                      {/* BANK TRANSFER */}
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('transfer')}
                        className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          paymentMethod === 'transfer'
                            ? 'border-yellow bg-yellow/10 text-yellow-900 font-extrabold shadow-xs'
                            : 'border-black/5 bg-neutral-50 text-dark/60 hover:border-black/15 hover:text-dark'
                        }`}
                      >
                        <Landmark className="w-5 h-5 text-yellow-750" />
                        <span className="text-[11px] font-bold whitespace-nowrap">{language === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</span>
                      </button>

                      {/* APPLE PAY (SOON) */}
                      <button
                        type="button"
                        onClick={() => {
                          alert(
                            language === 'ar' 
                              ? ' خدمة الدفع عبر Apple Pay سوف تتوفر قريباً جداً في الموقع لتجربة دفع أكثر سهولة وأماناً!' 
                              : ' Apple Pay will be available very soon! Please use Bank Transfer or Cash payment methods in the meantime.'
                          );
                        }}
                        className="p-3 rounded-2xl border border-black/5 bg-neutral-50 text-dark/35 relative text-center flex flex-col items-center justify-center gap-1.5 cursor-pointer opacity-70 hover:opacity-90 transition-all"
                      >
                        <span className="absolute -top-1.5 -right-1.5 bg-yellow text-[8px] font-black px-1.5 py-0.5 rounded-full text-black shadow-xs border border-white">
                          {language === 'ar' ? 'قريباً' : 'Soon'}
                        </span>
                        <CreditCard className="w-5 h-5 text-dark/30" />
                        <span className="text-[11px] font-bold whitespace-nowrap">Apple Pay</span>
                      </button>
                    </div>
                  </div>

                  {/* Bank Transfer Information Pane */}
                  {paymentMethod === 'transfer' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-neutral-50 border border-black/5 p-4.5 rounded-2xl space-y-4 text-start"
                    >
                      <div className="flex items-center justify-between border-b border-black/5 pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="bg-yellow/20 p-1.5 rounded-lg">
                            <Landmark className="w-4 h-4 text-yellow-800" />
                          </div>
                          <div>
                            <h4 className="font-extrabold text-xs text-yellow-950">
                              {businessSettings?.bankNameAr || (language === 'ar' ? 'مصرف الراجحي' : 'Al Rajhi Bank')}
                            </h4>
                            <p className="text-[10px] text-dark/40">
                              {language === 'ar' ? 'الرجاء التحويل وإرسال صورة الحوالة' : 'Please transfer and share receipt'}
                            </p>
                          </div>
                        </div>
                        {/* Little badge */}
                        <span className="bg-yellow text-black text-[9px] font-black px-2 py-0.5 rounded-md">
                          {language === 'ar' ? 'حساب رسمي' : 'Official'}
                        </span>
                      </div>

                      <div className="space-y-3">
                        {/* Account Name */}
                        <div className="bg-white border border-black/5 p-2.5 rounded-xl flex items-center justify-between gap-2 shadow-xs">
                          <div className="overflow-hidden">
                            <span className="text-[9px] text-dark/40 block font-bold">
                              {language === 'ar' ? 'اسم الحساب' : 'Account Name'}
                            </span>
                            <span className="text-xs font-black text-dark truncate block">
                              {businessSettings?.bankAccountNameAr || (language === 'ar' ? 'مؤسسة رحلة شواء لتقديم الوجبات' : 'Grilling Journey Meals Est.')}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(businessSettings?.bankAccountNameAr || 'مؤسسة رحلة شواء لتقديم الوجبات', 'acc_name')}
                            className="p-1.5 hover:bg-neutral-100 rounded-lg text-dark/60 hover:text-dark transition-all cursor-pointer shrink-0"
                          >
                            {copiedField === 'acc_name' ? (
                              <Check className="w-3.5 h-3.5 text-green-600 font-bold" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* Account Number */}
                        <div className="bg-white border border-black/5 p-2.5 rounded-xl flex items-center justify-between gap-2 shadow-xs">
                          <div>
                            <span className="text-[9px] text-dark/40 block font-bold">
                              {language === 'ar' ? 'رقم الحساب' : 'Account Number'}
                            </span>
                            <span className="text-xs font-mono font-black text-dark block tracking-wider">
                              {businessSettings?.bankAccountNumber || '432608010007890'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(businessSettings?.bankAccountNumber || '432608010007890', 'acc_num')}
                            className="p-1.5 hover:bg-neutral-100 rounded-lg text-dark/60 hover:text-dark transition-all cursor-pointer shrink-0"
                          >
                            {copiedField === 'acc_num' ? (
                              <Check className="w-3.5 h-3.5 text-green-600 font-bold" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>

                        {/* IBAN */}
                        <div className="bg-white border border-black/5 p-2.5 rounded-xl flex items-center justify-between gap-2 shadow-xs">
                          <div className="overflow-hidden">
                            <span className="text-[9px] text-dark/40 block font-bold">
                              {language === 'ar' ? 'الآيبان IBAN' : 'IBAN Number'}
                            </span>
                            <span className="text-xs font-mono font-black text-dark block tracking-wide select-all truncate">
                              {businessSettings?.bankIban || 'SA8380000432608010007890'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(businessSettings?.bankIban || 'SA8380000432608010007890', 'acc_iban')}
                            className="p-1.5 hover:bg-neutral-100 rounded-lg text-dark/60 hover:text-dark transition-all cursor-pointer shrink-0"
                          >
                            {copiedField === 'acc_iban' ? (
                              <Check className="w-3.5 h-3.5 text-green-600 font-bold" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Barcode/QR Code section */}
                      <div className="bg-white border border-black/5 p-3 rounded-2xl flex flex-col items-center justify-center text-center space-y-2.5 shadow-sm">
                        <span className="text-[10px] text-dark/50 font-bold leading-normal">
                          {language === 'ar' ? 'Scan to pay directly 📸 امسح الباركود للتحويل السريع' : 'Scan dynamic barcode/QR to complete transfer'}
                        </span>
                        <div className="relative p-2 bg-neutral-50 rounded-xl border border-black/5">
                          <img
                            src={businessSettings?.bankQrUrl || 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://qr.alrajhibank.com.sa'}
                            alt="Bank Transfer Barcode"
                            className="w-32 h-32 object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <p className="text-[9px] text-zinc-400 leading-normal max-w-xs">
                          {language === 'ar'
                            ? 'يرجى تحويل قيمة الطلب الإجمالية وإتمام الدفع، ثم تأكيد الطلب لتجهيزه فوراً.'
                            : 'Please complete the bank transfer of the total amount, and confirm order for instant prep.'}
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* Credit Card Interactive Demo Overlay for Premium styling */}
                  {paymentMethod === 'mada' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden mt-3"
                    >
                      <div className="bg-[#1a1a1a] text-white p-4 rounded-2xl relative shadow-md overflow-hidden flex flex-col justify-between aspect-[1.586] scale-95 mx-auto max-w-[280px] border border-white/5">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] uppercase font-mono tracking-widest text-yellow">
                            Mada Debit
                          </span>
                          <span className="font-extrabold text-sm font-sans italic text-white/80">
                            mada
                          </span>
                        </div>

                        {/* Card visual elements */}
                        <div className="w-8 h-6 bg-yellow/80 rounded-md my-1.5 opacity-80" />

                        <div className="font-mono text-xs md:text-sm tracking-widest text-center py-1 text-white">
                          {cardNumber}
                        </div>

                        <div className="flex justify-between items-end mt-2">
                          <div className="text-start">
                            <span className="text-[7px] text-white/40 block uppercase">{language === 'ar' ? 'حامل البطاقة' : 'CardHolder'}</span>
                            <input
                              required
                              type="text"
                              value={cardHolder}
                              onChange={(e) => setCardHolder(e.target.value)}
                              placeholder={language === 'ar' ? 'اسمك هنا' : 'Your name'}
                              className="text-[10px] bg-transparent text-white border-b border-white/25 outline-none w-24 uppercase placeholder-white/30"
                            />
                          </div>
                          <div className="text-right">
                            <span className="text-[7px] text-white/40 block uppercase font-mono">Expiry</span>
                            <span className="text-[10px] font-mono text-white/70">{cardExpiry}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-dark/45 text-center mt-2.5">
                        {t('testNotice')}
                      </p>
                    </motion.div>
                  )}
                </div>

                {/* Operating Hours Alert */}
                {businessSettings?.workingHoursStart && businessSettings?.workingHoursEnd && 
                 !isRestaurantOpen(businessSettings.workingHoursStart, businessSettings.workingHoursEnd) && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-250/20 rounded-xl text-start flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[11px] font-bold text-amber-800">
                        {language === 'ar' 
                          ? 'تنبيه: المطعم مغلق حالياً خارج أوقات العمل الرسمية' 
                          : 'Notice: Closed Outside Official Hours'}
                      </p>
                      <p className="text-[10px] text-amber-700/80 mt-0.5 leading-relaxed">
                        {language === 'ar'
                          ? `أوقات العمل الرسمية كل يوم من الساعة ${formatTime12h(businessSettings.workingHoursStart, 'ar')} إلى الساعة ${formatTime12h(businessSettings.workingHoursEnd, 'ar')}. يمكنك تقديم طلبك وسوف نقوم باستلامه وتجهيزه فور بدء ساعات العمل.`
                          : `Official operating hours are daily from ${formatTime12h(businessSettings.workingHoursStart, 'en')} to ${formatTime12h(businessSettings.workingHoursEnd, 'en')}. You may place your order, and we will process it as soon as we open.`}
                      </p>
                    </div>
                  </div>
                )}

                {errorMsg && (
                  <p className="text-xs text-red-500 font-semibold text-center mt-2">{errorMsg}</p>
                )}

                {/* Confirm order CTA */}
                <button
                  id="submit-order-checkout"
                  type="submit"
                  disabled={loading}
                  className="w-full bg-yellow hover:bg-yellow/90 text-black font-semibold py-3.5 px-4 rounded-2xl transition-all shadow-md mt-4 disabled:bg-neutral-100 disabled:text-dark/30 text-center flex items-center justify-center gap-2 cursor-pointer active:scale-98 border border-black/5"
                >
                  <Send className="w-4 h-4" />
                  {loading ? (language === 'ar' ? 'برجاء الانتظار...' : 'Processing...') : t('placeOrder')}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer info/Contact details */}
        <div className="p-4 border-t border-black/5 bg-neutral-50 flex flex-col gap-2 text-xs text-dark/50">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-dark/60">© {new Date().getFullYear()} {t('appName')} 🍢</span>
            <div className="flex flex-col items-end gap-1 font-mono text-[11px]">
              {customerPhone && (
                <div className="text-[10px] text-zinc-500 font-bold mb-1 border-b border-black/5 pb-0.5 w-full text-end">
                  {language === 'ar' ? 'جوال العميل: ' : 'Client Phone: '}{customerPhone}
                </div>
              )}
              {businessSettings?.phone && (
                <div className="flex items-center gap-1 text-slate-700 font-bold">
                  <PhoneCall className="w-3 h-3 text-slate-500" />
                  <span>{language === 'ar' ? 'هاتف المحل: ' : 'Shop Phone: '}{businessSettings.phone}</span>
                </div>
              )}
              {businessSettings?.whatsappNumber && (
                <div className="flex items-center gap-1 text-emerald-600 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{language === 'ar' ? 'واتساب المحل: ' : 'Shop WhatsApp: '}{businessSettings.whatsappNumber}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
