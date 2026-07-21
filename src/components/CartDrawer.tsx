import React, { useState } from 'react';
import { MenuItem, Order, CartItem } from '../types';
import { useLanguage } from './LanguageContext';
import { X, Trash2, MapPin, Store, CreditCard, ChevronLeft, Plus, Minus, Send, PhoneCall, ShoppingBag, Clock, AlertTriangle, Copy, Check, Landmark, Wallet, User, Phone, AlertCircle, Loader2, Bell } from 'lucide-react';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
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

  // User Profile state for auto-populating saved data
  const [userProfile, setUserProfile] = useState<any>(null);

  // Login flow states inside cart
  const [phoneInput, setPhoneInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRegisteringNewUser, setIsRegisteringNewUser] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [showPhoneAuthHelp, setShowPhoneAuthHelp] = useState(false);

  // Format phone number to E.164 format for Firebase Phone Auth (+9665XXXXXXXX)
  const formatPhoneE164 = (phone: string): string => {
    let clean = phone.trim().replace(/\D/g, '');
    if (clean.startsWith('05') && clean.length === 10) {
      return '+966' + clean.substring(1);
    }
    if (clean.startsWith('5') && clean.length === 9) {
      return '+966' + clean;
    }
    if (clean.startsWith('9665') && clean.length === 12) {
      return '+' + clean;
    }
    if (clean.length === 9) {
      return '+966' + clean;
    }
    if (clean.startsWith('00966') && clean.length === 14) {
      return '+' + clean.substring(2);
    }
    if (!phone.startsWith('+')) {
      return '+' + clean;
    }
    return phone;
  };

  // Skip Phone Auth and use a pre-set Demo Customer account for testing
  const handleDemoBypass = () => {
    const demoProfile = {
      name: language === 'ar' ? 'عميل تجريبي' : 'Demo Customer',
      phone: '0500000000',
      addresses: []
    };
    setUserProfile(demoProfile);
    setCustomerName(demoProfile.name);
    setCustomerPhone(demoProfile.phone);
    localStorage.setItem('rehla_user_profile', JSON.stringify(demoProfile));
    localStorage.setItem('checkout_phone', '0500000000');
    localStorage.setItem('checkout_name', demoProfile.name);
    setIsVerifying(false);
    setPhoneInput('');
    setVerificationCode('');
    setConfirmationResult(null);
    setAuthError('');
    setShowPhoneAuthHelp(false);
    window.dispatchEvent(new Event('storage'));
  };

  // Helper to race firestore promises with a 1500ms timeout
  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs = 1500): Promise<T> => {
    if ((window as any).firestoreQuotaExceeded === true) {
      throw new Error('quota-exceeded-precheck');
    }
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('firestore-operation-timeout')), timeoutMs)
    );
    try {
      return await Promise.race([promise, timeout]);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.toLowerCase().includes('quota') || errMsg.toLowerCase().includes('resource-exhausted') || errMsg.toLowerCase().includes('timeout')) {
        (window as any).firestoreQuotaExceeded = true;
        try {
          window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
        } catch (e) {}
      }
      throw err;
    }
  };

  // Handle Login request (Sends OTP first via Firebase Phone Auth)
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setShowPhoneAuthHelp(false);
    
    // Clean phone number input
    const cleanPhone = phoneInput.trim();
    if (cleanPhone.length !== 9 || !cleanPhone.startsWith('5')) {
      setAuthError(language === 'ar' 
        ? 'الرجاء إدخال رقم جوال سعودي صحيح يتكون من 9 أرقام ويبدأ بـ 5 (مثال: 506572881)' 
        : 'Please enter a valid 9-digit Saudi mobile starting with 5 (e.g., 506572881)');
      return;
    }

    setAuthLoading(true);

    try {
      const e164Phone = formatPhoneE164(phoneInput);

      // Initialize reCAPTCHA verifier if not already initialized
      if (!(window as any).recaptchaVerifier) {
        (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved
          },
          'expired-callback': () => {
            // Response expired
          }
        });
      }

      const appVerifier = (window as any).recaptchaVerifier;

      // Send OTP via Firebase Phone Auth
      const confirmationResultObj = await signInWithPhoneNumber(auth, e164Phone, appVerifier);
      setConfirmationResult(confirmationResultObj);
      setIsVerifying(true);
      setVerificationCode('');
    } catch (err: any) {
      console.error('Firebase Phone Auth Error:', err);
      let friendlyError = language === 'ar'
        ? 'فشل إرسال رمز التحقق عبر Firebase Phone Auth. يرجى التحقق من رقم الجوال أو إعدادات المشروع.'
        : 'Failed to send verification code via Firebase Phone Auth. Please verify your mobile number or project configuration.';
      
      if (err?.code === 'auth/invalid-phone-number') {
        friendlyError = language === 'ar' ? 'رقم الهاتف غير صالح!' : 'Invalid phone number!';
      } else if (err?.code === 'auth/too-many-requests') {
        friendlyError = language === 'ar' ? 'تم حظر الطلبات لكثرة المحاولات. يرجى المحاولة لاحقاً.' : 'Too many requests. Please try again later.';
      } else if (err?.message?.includes('captcha') || err?.code?.includes('captcha')) {
        friendlyError = language === 'ar' ? 'خطأ في التحقق من reCAPTCHA. يرجى المحاولة لاحقاً.' : 'reCAPTCHA verification error. Please try again later.';
      } else if (
        err?.code === 'auth/operation-not-allowed' || 
        err?.message?.includes('operation-not-allowed') ||
        err?.message?.includes('region') ||
        err?.message?.includes('SMS unable to be sent')
      ) {
        setShowPhoneAuthHelp(true);
        friendlyError = language === 'ar'
          ? '⚠️ لم يتم إرسال الرمز: خيار Phone Sign-In غير مفعل أو تحتاج لتفعيل منطقة المملكة العربية السعودية (+966) من إعدادات الـ SMS في Firebase Console.'
          : '⚠️ SMS not sent: Phone Sign-In is disabled or you need to allow Saudi Arabia (+966) region in Firebase Console SMS Settings.';
      } else {
        // Append raw error details for other unhandled errors
        friendlyError += ` (${err?.code || err?.message || ''})`;
      }
      setAuthError(friendlyError);
    } finally {
      setAuthLoading(false);
    }
  };

  // Complete OTP verification and load or move to register profile
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!verificationCode || verificationCode.length < 6) {
      setAuthError(language === 'ar' ? 'الرجاء إدخال رمز التحقق المكون من 6 أرقام' : 'Please enter the correct 6-digit verification code');
      return;
    }

    setAuthLoading(true);

    let cleanPhone = phoneInput.trim();
    if (cleanPhone.startsWith('5')) cleanPhone = '0' + cleanPhone;
    else if (cleanPhone.startsWith('9665')) cleanPhone = '0' + cleanPhone.substring(3);
    else if (cleanPhone.startsWith('+9665')) cleanPhone = '0' + cleanPhone.substring(4);

    try {
      if (!confirmationResult) {
        throw new Error('No confirmation result found');
      }

      // Confirm OTP code using Firebase Phone Auth confirmationResult
      const userCredential = await confirmationResult.confirm(verificationCode);
      const fbUser = userCredential.user;
      console.log('Firebase Phone Auth successful login:', fbUser.uid);

      const userRef = doc(db, 'users', cleanPhone);
      let userSnap = null;
      let existingData: any = null;
      let found = false;

      try {
        userSnap = await withTimeout(getDoc(userRef));
        if (userSnap && userSnap.exists()) {
          existingData = userSnap.data();
          found = true;
        }
      } catch (dbErr) {
        console.warn('Firebase query failed (likely quota exceeded), using local cache:', dbErr);
        // Fallback to local storage
        const cachedStr = localStorage.getItem('rehla_user_profile');
        if (cachedStr) {
          try {
            const cached = JSON.parse(cachedStr);
            if (cached && cached.phone === cleanPhone) {
              existingData = cached;
              found = true;
            }
          } catch (e) {
            console.warn('Stale cache parse error:', e);
          }
        }
      }

      if (found && existingData) {
        // Existing user - Log in directly
        const profileData = {
          name: existingData.name || (language === 'ar' ? 'عميل' : 'Customer'),
          phone: cleanPhone,
          addresses: existingData.addresses || []
        };

        // Save user state
        setUserProfile(profileData);
        setCustomerName(profileData.name);
        setCustomerPhone(profileData.phone);
        localStorage.setItem('rehla_user_profile', JSON.stringify(profileData));
        
        localStorage.setItem('checkout_phone', cleanPhone);
        localStorage.setItem('checkout_name', profileData.name);

        // Reset verification inputs
        setIsVerifying(false);
        setPhoneInput('');
        setVerificationCode('');
        setConfirmationResult(null);

        // Dispatch storage event to keep tabs and App in sync
        window.dispatchEvent(new Event('storage'));
      } else {
        // New user - Transition to profile registration view
        setIsRegisteringNewUser(true);
        setNameInput('');
      }
    } catch (err: any) {
      console.error('OTP Verification Error:', err);
      let friendlyError = language === 'ar' 
        ? 'رمز التحقق غير صحيح أو منتهي الصلاحية.' 
        : 'Incorrect or expired verification code.';
      if (err?.code === 'auth/invalid-verification-code') {
        friendlyError = language === 'ar' ? 'رمز التحقق الذي أدخلته غير صحيح!' : 'The verification code entered is incorrect!';
      } else if (err?.code === 'auth/code-expired') {
        friendlyError = language === 'ar' ? 'انتهت صلاحية الرمز، يرجى طلب رمز جديد.' : 'The code has expired, please request a new one.';
      }
      setAuthError(friendlyError);
    } finally {
      setAuthLoading(false);
    }
  };

  // Submit new registration profile details
  const handleRegisterProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    setAuthLoading(true);
    setAuthError('');

    let cleanPhone = phoneInput.trim();
    if (cleanPhone.startsWith('5')) cleanPhone = '0' + cleanPhone;
    else if (cleanPhone.startsWith('9665')) cleanPhone = '0' + cleanPhone.substring(3);
    else if (cleanPhone.startsWith('+9665')) cleanPhone = '0' + cleanPhone.substring(4);

    try {
      const userRef = doc(db, 'users', cleanPhone);
      const profileData = {
        name: nameInput.trim(),
        phone: cleanPhone,
        addresses: []
      };

      try {
        await withTimeout(setDoc(userRef, profileData));
      } catch (dbErr) {
        console.warn('Firebase setDoc failed (likely quota exceeded), registering locally:', dbErr);
      }

      setUserProfile(profileData);
      setCustomerName(profileData.name);
      setCustomerPhone(profileData.phone);
      localStorage.setItem('rehla_user_profile', JSON.stringify(profileData));
      
      localStorage.setItem('checkout_phone', cleanPhone);
      localStorage.setItem('checkout_name', profileData.name);

      // Reset states
      setIsRegisteringNewUser(false);
      setIsVerifying(false);
      setPhoneInput('');
      setVerificationCode('');

      // Dispatch storage event to keep tabs and App in sync
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error(err);
      setAuthError(language === 'ar' ? 'فشل إتمام التسجيل، يرجى المحاولة ثانية.' : 'Failed to complete registration.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Load user profile from localStorage and auto-populate name, phone, and first saved address
  React.useEffect(() => {
    if (isOpen) {
      try {
        const cached = localStorage.getItem('rehla_user_profile');
        if (cached) {
          const profile = JSON.parse(cached);
          setUserProfile(profile);
          if (profile.name) {
            setCustomerName(profile.name);
          }
          if (profile.phone) {
            setCustomerPhone(profile.phone);
          }
          if (tableOrDelivery === 'delivery' && profile.addresses && profile.addresses.length > 0) {
            setDeliveryAddress(profile.addresses[0].details);
            if (profile.addresses[0].latitude && profile.addresses[0].longitude) {
              setLatitude(profile.addresses[0].latitude);
              setLongitude(profile.addresses[0].longitude);
              setLocSuccess(true);
            }
          }
        }
      } catch (e) {
        console.warn('Error loading user profile in CartDrawer:', e);
      }
    }
  }, [isOpen]);

  // Keep user profile in sync with localStorage in real-time when updated elsewhere
  React.useEffect(() => {
    const syncProfile = () => {
      try {
        const cached = localStorage.getItem('rehla_user_profile');
        if (cached) {
          const profile = JSON.parse(cached);
          setUserProfile(profile);
          if (profile.name) setCustomerName(profile.name);
          if (profile.phone) setCustomerPhone(profile.phone);
        } else {
          setUserProfile(null);
          setCustomerName('');
          setCustomerPhone('');
        }
      } catch (e) {
        console.warn('Sync error in CartDrawer:', e);
      }
    };

    window.addEventListener('storage', syncProfile);
    // Custom event dispatch to trigger sync on same-tab updates
    window.addEventListener('user-profile-updated', syncProfile);
    
    return () => {
      window.removeEventListener('storage', syncProfile);
      window.removeEventListener('user-profile-updated', syncProfile);
    };
  }, []);

  // When order type is changed to delivery, auto-select first saved address if available
  React.useEffect(() => {
    if (tableOrDelivery === 'delivery' && (!deliveryAddress || deliveryAddress === 'استلام من الفرع' || deliveryAddress === 'محلي')) {
      try {
        const cached = localStorage.getItem('rehla_user_profile');
        if (cached) {
          const profile = JSON.parse(cached);
          if (profile.addresses && profile.addresses.length > 0) {
            setDeliveryAddress(profile.addresses[0].details);
            if (profile.addresses[0].latitude && profile.addresses[0].longitude) {
              setLatitude(profile.addresses[0].latitude);
              setLongitude(profile.addresses[0].longitude);
              setLocSuccess(true);
            }
          } else {
            setDeliveryAddress('');
          }
        } else {
          setDeliveryAddress('');
        }
      } catch (e) {
        setDeliveryAddress('');
      }
    }
  }, [tableOrDelivery]);

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
        fetch('/api/reverse-geocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng })
        })
          .then(res => res.json())
          .then(data => {
            if (data && data.success && data.address) {
              setDeliveryAddress(data.address);
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
    const isDrinkIncluded = current.item.id === 's3' || current.item.nameAr === 'شاورما شواء وجبة' || current.item.name === 'BBQ Shawarma Meal';
    const drinkPrice = (current.customizations?.selectedDrink && !isDrinkIncluded) ? current.customizations.selectedDrink.price : 0;
    
    const sizeDiff = current.customizations?.selectedSize ? current.customizations.selectedSize.diff : 0;
    
    let sodasTotal = 0;
    if (current.item.id === 'drinks-soft-group' && current.customizations?.selectedSoftDrinks) {
      sodasTotal = current.customizations.selectedSoftDrinks.reduce((sSum, s) => sSum + (s.price * s.quantity), 0);
    }
    
    const addonsTotal = (current.customizations ? current.customizations.addons.reduce((aSum, a) => aSum + a.price, 0) : 0) 
      + drinkPrice 
      + sizeDiff 
      + sodasTotal;
      
    const baseItemPrice = current.item.id === 'drinks-soft-group' ? 0 : current.item.price;
    return sum + ((baseItemPrice + addonsTotal) * current.quantity);
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

    if (trimmedName.length < 2) {
      setErrorMsg(language === 'ar' 
        ? 'الاسم قصير جداً! يرجى كتابة حرفين على الأقل.' 
        : 'Name is too short! Please enter at least 2 characters.');
      return;
    }

    const nameWords = trimmedName.split(/\s+/);

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

    if (businessSettings?.workingHoursStart && businessSettings?.workingHoursEnd) {
      if (!isRestaurantOpen(businessSettings.workingHoursStart, businessSettings.workingHoursEnd)) {
        setErrorMsg(language === 'ar'
          ? 'المطعم خارج اوقات الدوام ونسعد باستقبال طلباتك في اوقات الدوام الرسمية'
          : 'The restaurant is currently closed outside of working hours and we are pleased to receive your orders during official working hours');
        return;
      }
    }

    setLoading(true);
    setErrorMsg('');

    // Generate unique nice order code, e.g. ORD-10293
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const orderId = `Rehla-${randNum}`;

    const itemsFormatted = cartItems.map(c => {
      const isDrinkIncluded = c.item.id === 's3' || c.item.nameAr === 'شاورما شواء وجبة' || c.item.name === 'BBQ Shawarma Meal';
      const drinkPrice = (c.customizations?.selectedDrink && !isDrinkIncluded) ? c.customizations.selectedDrink.price : 0;
      
      const sizeDiff = c.customizations?.selectedSize ? c.customizations.selectedSize.diff : 0;
      let sodasTotal = 0;
      if (c.item.id === 'drinks-soft-group' && c.customizations?.selectedSoftDrinks) {
        sodasTotal = c.customizations.selectedSoftDrinks.reduce((sSum, s) => sSum + (s.price * s.quantity), 0);
      }
      
      const addonsTotal = (c.customizations ? c.customizations.addons.reduce((aSum, a) => aSum + a.price, 0) : 0) 
        + drinkPrice 
        + sizeDiff 
        + sodasTotal;
      
      let suffixAr = '';
      let suffixEn = '';
      if (c.customizations) {
        const partsAr: string[] = [];
        const partsEn: string[] = [];
        
        if (c.customizations.selectedSize) {
          partsAr.push(c.customizations.selectedSize.labelAr);
          partsEn.push(c.customizations.selectedSize.labelEn);
        }
        if (c.customizations.selectedSoftDrinks && c.customizations.selectedSoftDrinks.length > 0) {
          c.customizations.selectedSoftDrinks.forEach(s => {
            partsAr.push(`${s.nameAr} × ${s.quantity}`);
            partsEn.push(`${s.nameEn} × ${s.quantity}`);
          });
        }
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
        if (c.customizations.selectedDrink) {
          partsAr.push(`مشروب: ${c.customizations.selectedDrink.nameAr}`);
          partsEn.push(`Drink: ${c.customizations.selectedDrink.nameEn}`);
        }
        if (partsAr.length > 0) {
          suffixAr = ` [${partsAr.join('، ')}]`;
          suffixEn = ` [${partsEn.join(', ')}]`;
        }
      }

      const baseItemPrice = c.item.id === 'drinks-soft-group' ? 0 : c.item.price;

      return {
        id: c.id || c.item.id,
        name: `${c.item.name}${suffixEn}`,
        nameAr: `${c.item.nameAr}${suffixAr}`,
        price: baseItemPrice + addonsTotal,
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
        body: JSON.stringify({
          order: orderData,
          telegramBotToken: businessSettings?.telegramBotToken,
          telegramChatId: businessSettings?.telegramChatId,
          telegramBotEnabled: businessSettings?.telegramBotEnabled
        })
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
          (taxEnabled ? `*الضريبة (${taxPercent}%):* ${tax.toFixed(2)} ريال\n` : '') +
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
          (taxEnabled ? `*Tax (${taxPercent}%):* ${tax.toFixed(2)} SAR\n` : '') +
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
    <>
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
                  const isDrinkIncluded = item.id === 's3' || item.nameAr === 'شاورما شواء وجبة' || item.name === 'BBQ Shawarma Meal';
                  const drinkPrice = (c.customizations?.selectedDrink && !isDrinkIncluded) ? c.customizations.selectedDrink.price : 0;
                  
                  const sizeDiff = c.customizations?.selectedSize ? c.customizations.selectedSize.diff : 0;
                  let sodasTotal = 0;
                  if (item.id === 'drinks-soft-group' && c.customizations?.selectedSoftDrinks) {
                    sodasTotal = c.customizations.selectedSoftDrinks.reduce((sSum, s) => sSum + (s.price * s.quantity), 0);
                  }
                  
                  const addonsTotal = (c.customizations ? c.customizations.addons.reduce((sum, a) => sum + a.price, 0) : 0) 
                    + drinkPrice 
                    + sizeDiff 
                    + sodasTotal;
                    
                  const baseItemPrice = item.id === 'drinks-soft-group' ? 0 : item.price;
                  const itemTotalPrice = (baseItemPrice + addonsTotal) * quantity;
                  
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
                              {baseItemPrice + addonsTotal} {t('sar')} / {language === 'ar' ? 'القطعة' : 'unit'}
                              {addonsTotal > 0 && ` (${language === 'ar' ? 'شامل الإضافات' : 'incl. extras'})`}
                            </p>

                            {/* Custom notes AND addons details list */}
                            {c.customizations && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {c.customizations.selectedSize && (
                                  <span className="bg-yellow text-stone-900 text-[11px] sm:text-xs px-2 py-0.5 rounded-md font-bold border border-yellow shadow-xs">
                                    📏 {language === 'ar' ? c.customizations.selectedSize.labelAr : c.customizations.selectedSize.labelEn}
                                  </span>
                                )}
                                {c.customizations.selectedSoftDrinks && c.customizations.selectedSoftDrinks.length > 0 && (
                                  c.customizations.selectedSoftDrinks.map((soda) => (
                                    <span key={soda.id} className="bg-amber-100 text-amber-850 text-[11px] sm:text-xs px-2 py-0.5 rounded-md font-bold border border-amber-200 shadow-xs">
                                      🥤 {language === 'ar' ? soda.nameAr : soda.nameEn} × {soda.quantity}
                                    </span>
                                  ))
                                )}
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
                                {c.customizations.selectedDrink && (
                                  <span className="bg-blue-50 text-blue-700 text-[11px] sm:text-xs px-2 py-0.5 rounded-md font-bold border border-blue-500/20 shadow-xs flex items-center gap-1">
                                    🥤 {language === 'ar' ? c.customizations.selectedDrink.nameAr : c.customizations.selectedDrink.nameEn}
                                  </span>
                                )}
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
                {taxEnabled && (
                  <div className="flex justify-between text-sm text-dark/50">
                    <span>
                      {language === 'ar'
                        ? `الضريبة (${taxPercent}%)`
                        : `VAT (${taxPercent}%)`}
                    </span>
                    <span className="text-dark/80">{tax.toFixed(2)} {t('sar')}</span>
                  </div>
                )}
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
              {!userProfile ? (
                <div className="border border-black/5 p-5 rounded-2xl bg-neutral-50/50 text-start mt-4 space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-black/5">
                    <div className="w-2 h-2 bg-yellow rounded-full animate-ping" />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-dark/60">
                      {language === 'ar' ? 'تسجيل الدخول إلزامي لإتمام الطلب' : 'Login Required to Complete Order'}
                    </h3>
                  </div>

                  <p className="text-xs text-dark/60 leading-relaxed">
                    {language === 'ar' 
                      ? 'يرجى تسجيل الدخول برقم جوالك لتتمكن من إرسال طلبك ومتابعته مباشرة.' 
                      : 'Please login with your mobile number to submit and track your order.'}
                  </p>

                  <AnimatePresence mode="wait">
                    {isRegisteringNewUser ? (
                      /* New User Name Registration */
                      <motion.form
                        key="cart-register-step"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onSubmit={handleRegisterProfile}
                        className="space-y-3.5"
                      >
                        <div>
                          <label className="block text-xs font-bold text-dark/60 mb-1">
                            {language === 'ar' ? 'الاسم الثنائي (حروف فقط بدون أرقام) 👤' : 'Full Name (Letters only) 👤'}
                          </label>
                          <div className="relative">
                            <input
                              required
                              type="text"
                              value={nameInput}
                              onChange={(e) => {
                                // Allow only letters (including Arabic and English) and spaces
                                const filtered = e.target.value.replace(/[^a-zA-Z\s\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '');
                                setNameInput(filtered);
                              }}
                              placeholder={language === 'ar' ? 'أدخل اسمك الثنائي' : 'Enter your full name'}
                              className="w-full text-sm bg-white border border-black/10 rounded-xl px-3 py-3 outline-none focus:border-yellow text-dark placeholder-dark/30 shadow-xs"
                            />
                          </div>
                        </div>

                        {authError && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{authError}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-full bg-yellow hover:bg-yellow/90 text-black py-3.5 px-4 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 border border-black/5"
                        >
                          {authLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <span>{language === 'ar' ? 'إتمام التسجيل والدخول 🚀' : 'Complete Registration & Enter 🚀'}</span>
                          )}
                        </button>
                      </motion.form>
                    ) : !isVerifying ? (
                      /* Phone Input Form */
                      <motion.form
                        key="cart-phone-step"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onSubmit={handleAuthSubmit}
                        className="space-y-3.5"
                      >
                        <div>
                          <label className="block text-xs font-bold text-dark/60 mb-1">
                            {language === 'ar' ? 'رقم الجوال السعودي' : 'Saudi Mobile Number'}
                          </label>
                          <div className="relative flex items-center">
                            <div className="absolute left-3 flex items-center gap-1.5 text-dark/70 font-extrabold text-sm border-r border-black/10 pr-2 pointer-events-none h-5">
                              <span>🇸🇦</span>
                              <span className="font-mono text-xs">+966</span>
                            </div>
                            <input
                              required
                              type="tel"
                              value={phoneInput}
                              onChange={(e) => {
                                let val = e.target.value.trim().replace(/\D/g, '');
                                if (val.startsWith('966')) {
                                  val = val.substring(3);
                                }
                                if (val.startsWith('0')) {
                                  val = val.substring(1);
                                }
                                if (val.length > 9) {
                                  val = val.substring(0, 9);
                                }
                                setPhoneInput(val);
                              }}
                              placeholder="5xxxxxxxx"
                              className="w-full text-sm font-mono bg-white border border-black/10 rounded-xl py-3 pl-[76px] pr-3 outline-none focus:border-yellow text-dark placeholder-dark/30 shadow-xs font-bold"
                            />
                          </div>
                        </div>

                        {authError && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{authError}</span>
                          </div>
                        )}

                        {showPhoneAuthHelp && (
                          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-3 text-start">
                            <p className="font-extrabold text-amber-800 text-sm">
                              {language === 'ar' ? '⚠️ خطوات تفعيل ميزة التحقق عبر SMS (برمجة حقيقية):' : '⚠️ Steps to enable Firebase SMS Phone Auth:'}
                            </p>
                            <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-amber-950 font-semibold leading-relaxed">
                              {language === 'ar' ? (
                                <>
                                  <li>اذهب إلى <a href="https://console.firebase.google.com/project/rehlat-shawaa-nkzzl9/authentication/providers" target="_blank" rel="noopener noreferrer" className="underline font-black text-amber-700 hover:text-amber-900">لوحة تحكم Firebase</a></li>
                                  <li>اختر تبويب <b>Sign-in method</b> ثم اضغط على <b>Add new provider</b> واختر <b>Phone</b> ثم قم بـ <b>تفعيله</b> وحفظه.</li>
                                  <li><b>تفعيل المنطقة (هام جداً):</b> اذهب لتبويب <b>Settings</b> (الإعدادات) بجوار Sign-in method. اختر <b>SMS Region Policy</b> ثم اختر <b>Allow</b> وقم بإضافة <b>Saudi Arabia (+966)</b> إلى القائمة المسموحة، ثم اضغط <b>Save</b>.</li>
                                  <li><b>إضافة النطاقات المصرحة (هام للويب):</b> في نفس تبويب <b>Settings</b>، اختر <b>Authorized domains</b> ثم اضغط <b>Add domain</b> وأضف النطاقين التاليين:
                                    <div className="my-1.5 p-1.5 bg-amber-100 rounded-lg font-mono text-[9px] select-all break-all leading-normal text-amber-950 font-bold">
                                      ais-dev-hdbiwbg6h7t5kss4yemaad-739645737905.europe-west2.run.app<br/>
                                      ais-pre-hdbiwbg6h7t5kss4yemaad-739645737905.europe-west2.run.app
                                    </div>
                                  </li>
                                  <li><b>الفتح في نافذة جديدة:</b> نظراً لقيود الأمان على الـ iFrame، يرجى الضغط على زر <b>"فتح في نافذة جديدة" (Open in new tab)</b> بأعلى صفحة المعاينة لكي يظهر اختبار الـ reCAPTCHA بشكل سليم وتصلك الرسالة بدون حظر المتصفح.</li>
                                </>
                              ) : (
                                <>
                                  <li>Go to the <a href="https://console.firebase.google.com/project/rehlat-shawaa-nkzzl9/authentication/providers" target="_blank" rel="noopener noreferrer" className="underline font-black text-amber-700 hover:text-amber-900">Firebase Console</a></li>
                                  <li>Select the <b>Sign-in method</b> tab, click <b>Add new provider</b>, select <b>Phone</b>, toggle <b>Enable</b>, and click <b>Save</b>.</li>
                                  <li><b>Enable Region (Crucial):</b> Go to the <b>Settings</b> tab (next to Sign-in method). Select <b>SMS Region Policy</b>, choose <b>Allow</b>, add <b>Saudi Arabia (+966)</b>, and click <b>Save</b>.</li>
                                  <li><b>Add Authorized Domains (Crucial):</b> In the same <b>Settings</b> tab, select <b>Authorized domains</b>, click <b>Add domain</b>, and add these two domains:
                                    <div className="my-1.5 p-1.5 bg-amber-100 rounded-lg font-mono text-[9px] select-all break-all leading-normal text-amber-950 font-bold">
                                      ais-dev-hdbiwbg6h7t5kss4yemaad-739645737905.europe-west2.run.app<br/>
                                      ais-pre-hdbiwbg6h7t5kss4yemaad-739645737905.europe-west2.run.app
                                    </div>
                                  </li>
                                  <li><b>Open in New Tab:</b> Due to iframe cross-origin security restrictions, please click the <b>"Open in new tab"</b> button at the top of the preview pane to run the app outside the iframe so reCAPTCHA works smoothly and SMS can be sent.</li>
                                </>
                              )}
                            </ol>
                            <div className="pt-2 border-t border-amber-200/60">
                              <button
                                type="button"
                                onClick={handleDemoBypass}
                                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-extrabold py-2 px-3 rounded-xl transition-all shadow-sm active:scale-98 text-[11px] cursor-pointer"
                              >
                                {language === 'ar' 
                                  ? 'تخطي والتسجيل كحساب تجريبي (للتجربة الفورية)' 
                                  : 'Skip & Log in as Test Account (For Instant Test)'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Recaptcha container for invisible verification */}
                        <div id="recaptcha-container" className="my-1"></div>

                        <button
                          type="submit"
                          disabled={authLoading}
                          className="w-full bg-yellow hover:bg-yellow/90 text-black py-3.5 px-4 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 border border-black/5"
                        >
                          {authLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <span>{language === 'ar' ? 'أرسل رمز التحقق' : 'Send Verification Code'}</span>
                          )}
                        </button>
                      </motion.form>
                    ) : (
                      /* OTP Input Form */
                      <motion.form
                        key="cart-otp-step"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onSubmit={handleVerifyOtp}
                        className="space-y-3.5"
                      >
                        <div>
                          <label className="block text-xs font-bold text-dark/60 mb-1">
                            {language === 'ar' ? 'رمز التحقق المكون من 6 أرقام' : '6-Digit Code'}
                          </label>
                          <input
                            required
                            type="text"
                            maxLength={6}
                            value={verificationCode}
                            onChange={(e) => setVerificationCode(e.target.value)}
                            placeholder="xxxxxx"
                            className="w-full text-center text-lg font-mono tracking-widest bg-white border border-black/10 rounded-xl px-3 py-3 outline-none focus:border-yellow text-dark placeholder-dark/30 shadow-xs font-black"
                          />
                        </div>

                        {authError && (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{authError}</span>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setIsVerifying(false)}
                            className="w-1/3 border border-black/10 hover:bg-neutral-100 text-dark/70 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            {language === 'ar' ? 'السابق' : 'Back'}
                          </button>
                          <button
                            type="submit"
                            disabled={authLoading}
                            className="flex-1 bg-yellow hover:bg-yellow/90 text-black py-3 rounded-xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50 border border-black/5"
                          >
                            {authLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <span>{language === 'ar' ? 'تحقق ودخول' : 'Verify & Log In'}</span>
                            )}
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
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
                        placeholder={language === 'ar' ? 'الاسم' : 'Name'}
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
                        readOnly
                        disabled
                        placeholder={language === 'ar' ? '05xxxxxxxx' : '05xxxxxxxx'}
                        className="w-full text-sm bg-neutral-150 border border-black/10 rounded-xl px-3 py-2.5 outline-none text-dark/50 cursor-not-allowed shadow-xs font-mono font-bold"
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
                      {/* Saved Addresses Buttons Selector */}
                      {userProfile?.addresses && userProfile.addresses.length > 0 && (
                        <div className="space-y-1 bg-stone-50 border border-stone-200/50 p-2 rounded-xl text-start">
                          <label className="block text-[10px] font-black text-stone-500 uppercase tracking-wider">
                            {language === 'ar' ? 'العناوين المحفوظة 🏠' : 'Saved Addresses 🏠'}
                          </label>
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {userProfile.addresses.map((addr: any) => {
                              const isSelected = deliveryAddress === addr.details;
                              return (
                                <button
                                  key={addr.id}
                                  type="button"
                                  onClick={() => {
                                  setDeliveryAddress(addr.details);
                                  if (addr.latitude && addr.longitude) {
                                    setLatitude(addr.latitude);
                                    setLongitude(addr.longitude);
                                    setLocSuccess(true);
                                  }
                                }}
                                  className={`text-[11px] py-1 px-2.5 rounded-lg border font-bold transition-all cursor-pointer ${
                                    isSelected 
                                      ? 'bg-yellow text-stone-900 border-yellow shadow-xs'
                                      : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-100'
                                  }`}
                                >
                                  📍 {addr.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

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

                      {/* MADA / CARD / NETWORK */}
                      <button
                        type="button"
                        disabled={businessSettings?.onlinePaymentEnabled === false}
                        onClick={() => {
                          if (businessSettings?.onlinePaymentEnabled !== false) {
                            setPaymentMethod('mada');
                          }
                        }}
                        className={`p-3 rounded-2xl border text-center flex flex-col items-center justify-center gap-1 transition-all ${
                          businessSettings?.onlinePaymentEnabled === false
                            ? 'border-dashed border-slate-300 bg-slate-100/50 text-slate-450 opacity-80 cursor-not-allowed'
                            : paymentMethod === 'mada'
                              ? 'border-yellow bg-yellow/10 text-yellow-900 font-extrabold shadow-xs cursor-pointer'
                              : 'border-black/5 bg-neutral-50 text-dark/60 hover:border-black/15 hover:text-dark cursor-pointer'
                        }`}
                      >
                        <CreditCard className={`w-5 h-5 ${businessSettings?.onlinePaymentEnabled === false ? 'text-slate-400' : 'text-yellow-750'}`} />
                        <span className="text-[11px] font-bold whitespace-nowrap">{language === 'ar' ? 'شبكة / مدى' : 'Mada / Card'}</span>
                        {businessSettings?.onlinePaymentEnabled === false && (
                          <span className="text-[8px] font-black text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200">
                            {language === 'ar' ? 'قريباً لراحتكم' : 'Soon'}
                          </span>
                        )}
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
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-start">
                    <p className="text-[11px] font-bold text-red-800">
                      {language === 'ar' 
                        ? 'المطعم خارج اوقات الدوام ونسعد باستقبال طلباتك في اوقات الدوام الرسمية' 
                        : 'The restaurant is currently closed outside of working hours and we are pleased to receive your orders during official working hours'}
                    </p>
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
                  {loading ? 
                    (language === 'ar' ? 'برجاء الانتظار...' : 'Processing...')
                   : 
                    ((paymentMethod === 'mada' || paymentMethod === 'applepay')
                      ? (language === 'ar' ? 'ادفع الآن' : 'Pay Now')
                      : (language === 'ar' ? 'اطلب الآن' : 'Order Now'))
                  }
                </button>
              </form>
          )}
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
    </>
  );
};
