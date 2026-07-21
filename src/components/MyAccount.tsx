import React, { useState, useEffect } from 'react';
import { useLanguage } from './LanguageContext';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Order, CartItem } from '../types';
import { 
  User, Phone, MapPin, LogOut, Globe, ChevronDown, ChevronUp, 
  ShoppingBag, Check, Plus, Trash2, History, RotateCcw, Loader2, AlertCircle, Edit2, Navigation
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import MapPicker from './MapPicker';

interface SavedAddress {
  id: string;
  label: string;
  details: string;
  latitude?: number;
  longitude?: number;
}

interface UserProfile {
  name: string;
  phone: string;
  addresses?: SavedAddress[];
}

interface MyAccountProps {
  onReorder: (items: any[]) => void;
  onCloseCart?: () => void;
  activePromo?: any;
}

export const MyAccount: React.FC<MyAccountProps> = ({ onReorder, onCloseCart, activePromo }) => {
  const { language, setLanguage, t, isRtl } = useLanguage();
  
  // Helper to race firestore promises with a 1500ms timeout to prevent hanging under quota/offline issues
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
  
  // Auth state
  const [user, setUser] = useState<UserProfile | null>(() => {
    const cached = localStorage.getItem('rehla_user_profile');
    return cached ? JSON.parse(cached) : null;
  });

  // Synchronize state with localStorage changes (e.g. login from checkout)
  useEffect(() => {
    const handleStorageChange = () => {
      const cached = localStorage.getItem('rehla_user_profile');
      if (cached) {
        setUser(JSON.parse(cached));
      } else {
        setUser(null);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Form states
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
    setUser(demoProfile);
    localStorage.setItem('rehla_user_profile', JSON.stringify(demoProfile));
    setIsVerifying(false);
    setPhoneInput('');
    setVerificationCode('');
    setConfirmationResult(null);
    setAuthError('');
    setShowPhoneAuthHelp(false);
    window.dispatchEvent(new Event('storage'));
  };

  // Profile Edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editNameInput, setEditNameInput] = useState('');
  const [profileEditLoading, setProfileEditLoading] = useState(false);

  // App state
  const [activeSubTab, setActiveSubTab] = useState<'orders' | 'addresses' | 'support' | 'language' | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Address states
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newLat, setNewLat] = useState<number | undefined>(undefined);
  const [newLng, setNewLng] = useState<number | undefined>(undefined);
  const [addressLoading, setAddressLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  // Custom confirmation modal states
  const [addressToDeleteIndex, setAddressToDeleteIndex] = useState<number | null>(null);
  const [pendingNameChange, setPendingNameChange] = useState<string | null>(null);

  // Support & Complaints States
  const [supportMsg, setSupportMsg] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [loadingSupportTickets, setLoadingSupportTickets] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Setup live orders subscription when logged in
  useEffect(() => {
    if (!user?.phone) {
      setOrders([]);
      return;
    }

    setOrdersLoading(true);
    // Query orders for this specific customer phone
    const ordersQuery = query(
      collection(db, 'orders'),
      where('customerPhone', '==', user.phone)
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const fetchedOrders: Order[] = [];
      snapshot.forEach((doc) => {
        fetchedOrders.push({ id: doc.id, ...doc.data() } as Order);
      });

      // Sort by createdAt descending
      fetchedOrders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(fetchedOrders);
      setOrdersLoading(false);
    }, (error) => {
      console.warn('Orders subscription failed, using local storage cache:', error);
      // Fallback to local storage cached orders if any
      const cachedOrders = localStorage.getItem('simulated_orders');
      if (cachedOrders) {
        const parsed: Order[] = JSON.parse(cachedOrders);
        const filtered = parsed.filter(o => o.customerPhone === user.phone);
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setOrders(filtered);
      }
      setOrdersLoading(false);
    });

    return () => unsubscribe();
  }, [user?.phone]);

  // Setup support tickets subscription
  useEffect(() => {
    if (!user?.phone) {
      setSupportTickets([]);
      return;
    }

    setLoadingSupportTickets(true);
    const ticketsQuery = query(
      collection(db, 'support_tickets'),
      where('customerPhone', '==', user.phone)
    );

    const unsubscribe = onSnapshot(ticketsQuery, (snapshot) => {
      const fetched: any[] = [];
      snapshot.forEach((doc) => {
        fetched.push({ id: doc.id, ...doc.data() });
      });
      // Sort by createdAt desc
      fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setSupportTickets(fetched);
      setLoadingSupportTickets(false);
    }, (error) => {
      console.warn('Support subscription failed, using local storage fallback:', error);
      const cached = localStorage.getItem('simulated_support_tickets');
      if (cached) {
        const parsed = JSON.parse(cached);
        const filtered = parsed.filter((t: any) => t.customerPhone === user.phone);
        filtered.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setSupportTickets(filtered);
      }
      setLoadingSupportTickets(false);
    });

    return () => unsubscribe();
  }, [user?.phone]);

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
        const profileData: UserProfile = {
          name: existingData.name || (language === 'ar' ? 'عميل' : 'Customer'),
          phone: cleanPhone,
          addresses: existingData.addresses || []
        };

        // Save user state
        setUser(profileData);
        localStorage.setItem('rehla_user_profile', JSON.stringify(profileData));
        
        // Sync standard phone/name fields
        localStorage.setItem('checkout_phone', cleanPhone);
        localStorage.setItem('checkout_name', profileData.name);

        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new Event('user-profile-updated'));

        // Reset verification inputs
        setIsVerifying(false);
        setPhoneInput('');
        setVerificationCode('');
        setConfirmationResult(null);
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
      const profileData: UserProfile = {
        name: nameInput.trim(),
        phone: cleanPhone,
        addresses: []
      };

      try {
        await withTimeout(setDoc(userRef, profileData));
      } catch (dbErr) {
        console.warn('Firebase setDoc failed (likely quota exceeded), registering locally:', dbErr);
      }

      setUser(profileData);
      localStorage.setItem('rehla_user_profile', JSON.stringify(profileData));
      
      localStorage.setItem('checkout_phone', cleanPhone);
      localStorage.setItem('checkout_name', profileData.name);

      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('user-profile-updated'));

      // Reset states
      setIsRegisteringNewUser(false);
      setIsVerifying(false);
      setPhoneInput('');
      setNameInput('');
      setVerificationCode('');
    } catch (err) {
      console.error(err);
      setAuthError(language === 'ar' ? 'فشل حفظ الحساب بقاعدة البيانات' : 'Failed to register account');
    } finally {
      setAuthLoading(false);
    }
  };

  // Edit profile (update name) - requests confirmation
  const handleEditProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !editNameInput.trim()) return;
    setPendingNameChange(editNameInput.trim());
  };

  // Execute actual profile edit save
  const executeEditProfileSave = async () => {
    if (!user || !pendingNameChange) return;

    setProfileEditLoading(true);
    try {
      const userRef = doc(db, 'users', user.phone);
      try {
        await withTimeout(updateDoc(userRef, {
          name: pendingNameChange
        }));
      } catch (dbErr) {
        console.warn('Firebase updateDoc failed (likely quota exceeded), updating locally:', dbErr);
      }

      const updatedProfile = { ...user, name: pendingNameChange };
      setUser(updatedProfile);
      localStorage.setItem('rehla_user_profile', JSON.stringify(updatedProfile));
      localStorage.setItem('checkout_name', pendingNameChange);

      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('user-profile-updated'));

      setIsEditingProfile(false);
    } catch (err) {
      console.error(err);
      alert(language === 'ar' ? 'فشل تحديث بيانات الملف الشخصي' : 'Failed to update profile');
    } finally {
      setProfileEditLoading(false);
      setPendingNameChange(null);
    }
  };

  // Support Success Banner State
  const [supportSuccess, setSupportSuccess] = useState(false);

  // Log Out Customer (No-confirm-dialog fallback using custom confirmation state)
  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const executeLogout = () => {
    setUser(null);
    localStorage.removeItem('rehla_user_profile');
    localStorage.removeItem('checkout_phone');
    localStorage.removeItem('checkout_name');
    setShowLogoutConfirm(false);
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new Event('user-profile-updated'));
  };

  // Submit Technical Support or Complaint Message
  const handleSendSupportMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !supportMsg.trim()) return;

    setSupportSending(true);
    setSupportSuccess(false);
    const ticketId = 'ticket-' + Date.now();
    const newTicket = {
      id: ticketId,
      customerPhone: user.phone,
      customerName: user.name,
      message: supportMsg.trim(),
      createdAt: new Date().toISOString(),
      status: 'open',
      adminReply: ''
    };

    try {
      await withTimeout(setDoc(doc(db, 'support_tickets', ticketId), newTicket));
      setSupportMsg('');
      setSupportSuccess(true);
    } catch (err) {
      console.warn('Live support creation failed, fallback to local simulator:', err);
      const cached = localStorage.getItem('simulated_support_tickets');
      const parsed = cached ? JSON.parse(cached) : [];
      const updated = [newTicket, ...parsed];
      localStorage.setItem('simulated_support_tickets', JSON.stringify(updated));
      setSupportMsg('');
      setSupportTickets(prev => [newTicket, ...prev]);
      setSupportSuccess(true);
    } finally {
      setSupportSending(false);
    }
  };

  // Add Delivery Address
  const handleAddAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!newLabel.trim() || !newDetails.trim()) return;

    setAddressLoading(true);
    const newAddressItem: SavedAddress = {
      id: 'addr-' + Date.now(),
      label: newLabel.trim(),
      details: newDetails.trim(),
      latitude: newLat,
      longitude: newLng
    };

    const updatedAddresses = [...(user.addresses || []), newAddressItem];
    const updatedProfile = { ...user, addresses: updatedAddresses };

    try {
      try {
        await withTimeout(updateDoc(doc(db, 'users', user.phone), {
          addresses: updatedAddresses
        }));
      } catch (dbErr) {
        console.warn('Firebase updateDoc failed (likely quota exceeded), saving address locally:', dbErr);
      }

      setUser(updatedProfile);
      localStorage.setItem('rehla_user_profile', JSON.stringify(updatedProfile));
      
      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('user-profile-updated'));

      // Reset input fields
      setNewLabel('');
      setNewDetails('');
      setNewLat(undefined);
      setNewLng(undefined);
      setIsAddingAddress(false);
    } catch (err) {
      console.error(err);
      alert(language === 'ar' ? 'فشل حفظ العنوان في السحابة' : 'Failed to save address in cloud');
    } finally {
      setAddressLoading(false);
    }
  };

  // Step 1: Request delete address confirmation
  const requestDeleteAddress = (index: number) => {
    setAddressToDeleteIndex(index);
  };

  // Step 2: Actually execute the deletion
  const executeDeleteAddress = async () => {
    if (!user || addressToDeleteIndex === null) return;

    setAddressLoading(true);
    const updatedAddresses = (user.addresses || []).filter(
      (_, idx) => idx !== addressToDeleteIndex
    );
    const updatedProfile = { ...user, addresses: updatedAddresses };

    try {
      if (user.phone) {
        try {
          await withTimeout(updateDoc(doc(db, 'users', user.phone), {
            addresses: updatedAddresses
          }));
        } catch (dbErr) {
          console.warn('Firebase updateDoc failed (likely quota exceeded), deleting address locally:', dbErr);
        }
      }

      setUser(updatedProfile);
      localStorage.setItem('rehla_user_profile', JSON.stringify(updatedProfile));

      window.dispatchEvent(new Event('storage'));
      window.dispatchEvent(new Event('user-profile-updated'));
    } catch (err) {
      console.error(err);
      alert(language === 'ar' ? 'فشل حذف العنوان' : 'Failed to delete address');
    } finally {
      setAddressToDeleteIndex(null);
      setAddressLoading(false);
    }
  };

  // Reorder Item Action
  const handleReorderClick = (order: Order) => {
    onReorder(order.items);
  };

  const getStatusLabel = (status: string) => {
    const mapping: Record<string, { ar: string; en: string; color: string }> = {
      pending: { ar: 'بانتظار التأكيد', en: 'Pending', color: 'bg-yellow/10 text-yellow-700 border-yellow/20' },
      received: { ar: 'مقبول', en: 'Received', color: 'bg-indigo-50 text-indigo-700 border-indigo-150' },
      searching_driver: { ar: 'البحث عن كابتن', en: 'Searching Driver', color: 'bg-amber-50 text-amber-700 border-amber-150' },
      preparing: { ar: 'يجري التحضير بالمطبخ', en: 'Preparing', color: 'bg-blue-50 text-blue-700 border-blue-150 animate-pulse' },
      ready: { ar: 'جاهز للاستلام', en: 'Ready', color: 'bg-emerald-50 text-emerald-700 border-emerald-150' },
      driver_assigned: { ar: 'تم تعيين المندوب', en: 'Driver Assigned', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
      driver_picked_up: { ar: 'استلم المندوب الطلب', en: 'Picked Up', color: 'bg-sky-50 text-sky-800 border-sky-200' },
      on_the_way: { ar: 'جاري التوصيل', en: 'On the Way', color: 'bg-teal-50 text-teal-700 border-teal-200 animate-pulse' },
      delivered: { ar: 'تم التوصيل بنجاح', en: 'Delivered', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
      cancelled: { ar: 'ملغي', en: 'Cancelled', color: 'bg-red-50 text-red-700 border-red-150' },
    };

    return mapping[status] || { ar: status, en: status, color: 'bg-slate-50 text-slate-700 border-slate-200' };
  };

  // NOT LOGGED IN VIEW - SHOW PHONE REGISTRATION
  if (!user) {
    return (
      <div className="max-w-md mx-auto bg-white border border-black/5 rounded-[2.5rem] p-6 md:p-8 shadow-xl mt-4 animate-fade-in text-start relative">
        
        <div className="text-center space-y-3 mb-8">
          <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center mx-auto shadow-sm overflow-hidden shrink-0 relative">
            <svg className="w-12 h-12 text-slate-400 translate-y-1.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-serif font-black text-stone-900">
            {language === 'ar' ? 'حسابي الشخصي' : 'My Account'}
          </h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            {language === 'ar' 
              ? 'سجل برقم جوالك لمتابعة طلباتك السابقة، إدارة عناوين التوصيل، وإعادة الطلب بضغطة واحدة!'
              : 'Sign in with your mobile number to view orders history, manage addresses, and reorder instantly!'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {isRegisteringNewUser ? (
            /* New User Registration step */
            <motion.form
              key="auth-register-step"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              onSubmit={handleRegisterProfile}
              className="space-y-5"
            >
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-stone-700">
                  {language === 'ar' ? 'الاسم' : 'Name'}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3.5 w-4 h-4 text-stone-400" />
                  <input
                    required
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder={language === 'ar' ? 'الاسم' : 'Name'}
                    className="w-full text-sm bg-stone-50 border border-stone-200 rounded-xl py-3.5 pl-10 pr-4 outline-none focus:border-yellow focus:bg-white transition-all font-semibold"
                  />
                </div>
              </div>

              {authError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-yellow text-stone-900 hover:bg-yellow/90 py-4 px-6 rounded-2xl text-sm font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>{language === 'ar' ? 'إتمام التسجيل والدخول 🚀' : 'Complete Registration & Enter 🚀'}</span>
                )}
              </button>
            </motion.form>
          ) : !isVerifying ? (
            /* Step 1: Input Phone Only */
            <motion.form 
              key="auth-phone-step"
              initial={{ opacity: 0, x: isRtl ? 30 : -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRtl ? -30 : 30 }}
              onSubmit={handleAuthSubmit} 
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-stone-700">
                  {language === 'ar' ? 'رقم الجوال السعودي' : 'Saudi Mobile Number'}
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3 flex items-center gap-1.5 text-stone-600 font-extrabold text-sm border-r border-stone-200 pr-2 pointer-events-none h-5">
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
                    className="w-full text-sm font-mono bg-stone-50 border border-stone-200 rounded-xl py-3.5 pl-[76px] pr-4 outline-none focus:border-yellow focus:bg-white transition-all font-bold"
                  />
                </div>
              </div>

              {authError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-center gap-2">
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
                className="w-full bg-yellow text-stone-900 hover:bg-yellow/90 py-4 px-6 rounded-2xl text-sm font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
              >
                {authLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>{language === 'ar' ? 'أرسل رمز التحقق' : 'Send Verification Code'}</span>
                )}
              </button>
            </motion.form>
          ) : (
            /* Step 2: Input OTP */
            <motion.form 
              key="auth-otp-step"
              initial={{ opacity: 0, x: isRtl ? -30 : 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRtl ? 30 : -30 }}
              onSubmit={handleVerifyOtp} 
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold text-stone-700 text-start">
                  {language === 'ar' ? 'رمز التحقق المكون من 6 أرقام' : '6-Digit Code'}
                </label>
                <input
                  required
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="xxxxxx"
                  className="w-full text-center text-xl font-mono tracking-widest bg-stone-50 border border-stone-200 rounded-xl py-3.5 outline-none focus:border-yellow focus:bg-white transition-all font-black"
                />
              </div>

              {authError && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsVerifying(false)}
                  className="w-1/3 border border-stone-200 hover:bg-stone-50 text-stone-600 py-3.5 rounded-2xl text-xs font-bold transition-all cursor-pointer"
                >
                  {language === 'ar' ? 'السابق' : 'Back'}
                </button>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 bg-yellow text-stone-900 hover:bg-yellow/90 py-3.5 rounded-2xl text-xs font-black transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
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
    );
  }

  // LOGGED IN PORTAL - SHOW ORDERS & ADDRESSES
  const activeOrders = orders.filter(ord => ord.status !== 'delivered' && ord.status !== 'cancelled');
  const pastOrders = orders.filter(ord => ord.status === 'delivered' || ord.status === 'cancelled');

  const renderActiveHeader = (titleAr: string, titleEn: string) => {
    return (
      <div className="bg-white border border-black/5 px-5 py-4 rounded-2xl flex justify-between items-center mb-4">
        <h2 className="font-black text-stone-900 text-sm tracking-tight sm:text-base">
          {language === 'ar' ? titleAr : titleEn}
        </h2>
        <button
          onClick={() => {
            setActiveSubTab(null);
            setIsAddingAddress(false);
          }}
          className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-650 font-black flex items-center justify-center transition-colors cursor-pointer text-xs"
          title={language === 'ar' ? 'إغلاق' : 'Close'}
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in text-start pb-12">
      
      {/* Profile Header Card */}
      <div className="bg-white border border-black/5 p-6 rounded-[2rem] shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-200/80 flex items-center justify-center shadow-sm overflow-hidden shrink-0 relative">
            <svg className="w-12 h-12 text-slate-400 translate-y-1.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            {!isEditingProfile ? (
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black text-stone-850 truncate">
                    {language === 'ar' ? `أهلاً بك، ${user.name}` : `Welcome, ${user.name}`}
                  </h2>
                  <button
                    onClick={() => {
                      setEditNameInput(user.name);
                      setIsEditingProfile(true);
                    }}
                    className="p-1 rounded-lg bg-stone-100 hover:bg-yellow/20 text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
                    title={language === 'ar' ? 'تعديل الملف الشخصي' : 'Edit Profile'}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-stone-500 font-mono font-bold">
                  {language === 'ar' ? 'رقم الجوال: ' : 'Mobile: '} {user.phone}
                </p>
              </div>
            ) : (
              <form onSubmit={handleEditProfileSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                <input
                  required
                  type="text"
                  value={editNameInput}
                  onChange={(e) => setEditNameInput(e.target.value)}
                  placeholder={language === 'ar' ? 'الاسم' : 'Name'}
                  className="px-3 py-1.5 text-sm bg-stone-50 border border-stone-200 rounded-xl outline-none focus:border-yellow font-semibold flex-1"
                />
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={profileEditLoading}
                    className="px-3.5 py-1.5 bg-yellow text-stone-900 hover:bg-yellow/90 text-xs font-black rounded-lg cursor-pointer flex items-center justify-center min-w-[70px]"
                  >
                    {profileEditLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (language === 'ar' ? 'حفظ' : 'Save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="px-3 py-1.5 border border-stone-200 text-stone-500 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Highlighted Account Status Details Badge */}
        <div className="bg-stone-50 border border-black/5 px-4 py-2.5 rounded-xl flex items-center gap-2.5 self-stretch sm:self-auto justify-center shrink-0">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <div className="text-start text-xs">
            <span className="block font-bold text-stone-800">{language === 'ar' ? 'الحساب مفعل' : 'Account Active'}</span>
            <span className="text-[10px] text-stone-400 font-mono">{language === 'ar' ? 'توثيق آمن بالكامل' : 'Secured connection'}</span>
          </div>
        </div>
      </div>

      {/* Sub Tabs Content */}
      <div className="space-y-4">

        {/* Vertical Stack List (Dashboard Menu) */}
        {activeSubTab === null && (
          <div className="flex flex-col gap-3.5 pt-2 animate-fade-in max-w-md mx-auto">
            {/* 1. My Orders */}
            <button
              onClick={() => setActiveSubTab('orders')}
              className="bg-white border border-black/5 hover:border-yellow/50 hover:shadow-xs p-4 rounded-2xl text-start transition-all cursor-pointer flex items-center justify-between group focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow/15 text-stone-850 flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-850 group-hover:text-yellow transition-colors text-sm">
                    {language === 'ar' ? 'طلباتي' : 'My Orders'}
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold">
                    {language === 'ar' ? 'تتبع طلباتك الحالية وتصفح السابقة' : 'Track current and view past orders'}
                  </p>
                </div>
              </div>
              <span className="text-stone-300 group-hover:text-yellow group-hover:translate-x-0.5 transition-all text-sm font-mono">→</span>
            </button>

            {/* 2. My Addresses */}
            <button
              onClick={() => setActiveSubTab('addresses')}
              className="bg-white border border-black/5 hover:border-yellow/50 hover:shadow-xs p-4 rounded-2xl text-start transition-all cursor-pointer flex items-center justify-between group focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow/15 text-stone-850 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-850 group-hover:text-yellow transition-colors text-sm">
                    {language === 'ar' ? 'عناويني' : 'My Addresses'}
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold">
                    {language === 'ar' ? 'إضافة وتعديل مواقع التوصيل والمنزل' : 'Manage your home and work delivery points'}
                  </p>
                </div>
              </div>
              <span className="text-stone-300 group-hover:text-yellow group-hover:translate-x-0.5 transition-all text-sm font-mono">→</span>
            </button>

            {/* 3. Support & Complaints */}
            <button
              onClick={() => setActiveSubTab('support')}
              className="bg-white border border-black/5 hover:border-yellow/50 hover:shadow-xs p-4 rounded-2xl text-start transition-all cursor-pointer flex items-center justify-between group focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow/15 text-stone-850 flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-850 group-hover:text-yellow transition-colors text-sm">
                    {language === 'ar' ? 'الدعم الفني والشكاوى' : 'Support & Complaints'}
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold">
                    {language === 'ar' ? 'تواصل معنا مباشرة وأرسل شكوى أو استفسار' : 'Get in touch directly with our support team'}
                  </p>
                </div>
              </div>
              <span className="text-stone-300 group-hover:text-yellow group-hover:translate-x-0.5 transition-all text-sm font-mono">→</span>
            </button>

            {/* 4. Language Selection */}
            <button
              onClick={() => setActiveSubTab('language')}
              className="bg-white border border-black/5 hover:border-yellow/50 hover:shadow-xs p-4 rounded-2xl text-start transition-all cursor-pointer flex items-center justify-between group focus:outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-yellow/15 text-stone-850 flex items-center justify-center">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-850 group-hover:text-yellow transition-colors text-sm">
                    {language === 'ar' ? 'اللغة والترجمة' : 'Language'}
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold">
                    {language === 'ar' ? 'تغيير لغة عرض التطبيق بالكامل' : 'Switch the application language'}
                  </p>
                </div>
              </div>
              <span className="text-stone-300 group-hover:text-yellow group-hover:translate-x-0.5 transition-all text-sm font-mono">→</span>
            </button>

            {/* 5. Log Out */}
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="bg-white border border-black/5 hover:border-red-300 hover:shadow-xs p-4 rounded-2xl text-start transition-all cursor-pointer flex items-center justify-between group focus:outline-none animate-fade-in"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
                  <LogOut className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-850 group-hover:text-red-600 transition-colors text-sm">
                    {language === 'ar' ? 'تسجيل الخروج' : 'Log Out'}
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold">
                    {language === 'ar' ? 'الخروج من الحساب الحالي' : 'Sign out from the current account'}
                  </p>
                </div>
              </div>
              <span className="text-stone-300 group-hover:text-red-500 group-hover:translate-x-0.5 transition-all text-sm font-mono">→</span>
            </button>
          </div>
        )}
        
        {/* 1. ORDERS LIST TAB */}
        {activeSubTab === 'orders' && (
          <div className="space-y-4">
            {renderActiveHeader('طلباتي', 'My Orders')}

            {ordersLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-yellow animate-spin" />
                <p className="text-xs text-stone-400 font-bold">{language === 'ar' ? 'جاري جلب قائمة طلباتك...' : 'Loading your orders...'}</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="py-12 border border-dashed border-black/10 rounded-[2rem] bg-stone-50 text-center space-y-4 max-w-lg mx-auto animate-fade-in">
                <div className="space-y-1 px-4">
                  <h3 className="font-extrabold text-stone-800">{language === 'ar' ? 'لا يوجد طلبات بعد' : 'No Orders Yet'}</h3>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    {language === 'ar' 
                      ? 'ما رأيك بأن تجرب مشوياتنا الطازجة والمبخرة على الجمر الفاخر اليوم؟'
                      : 'Why not treat yourself to our fresh coal-grilled meals today?'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                
                {/* 1.1 ACTIVE ORDERS SECTION */}
                {activeOrders.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-wider flex items-center gap-1.5 text-start px-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>{language === 'ar' ? 'الطلبات الحالية' : 'Current Orders'}</span>
                    </h3>
                    <div className="space-y-3">
                      {activeOrders.map((ord) => {
                        const isExpanded = expandedOrderId === ord.id;
                        const statusInfo = getStatusLabel(ord.status);
                        const itemsCount = ord.items.reduce((sum, item) => sum + item.quantity, 0);

                        return (
                          <div 
                            key={ord.id} 
                            className={`bg-white border rounded-[1.5rem] transition-all overflow-hidden ${
                              isExpanded ? 'border-yellow ring-4 ring-yellow/5' : 'border-black/5 hover:border-black/10'
                            }`}
                          >
                            <div 
                              onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                              className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer select-none"
                            >
                              <div className="space-y-1 text-start">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-black text-stone-850 bg-stone-100 px-2 py-0.5 rounded-lg">
                                    #{ord.id.slice(-6).toUpperCase()}
                                  </span>
                                  <span className="text-xs text-stone-400 font-bold">
                                    {new Date(ord.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
                                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-stone-600">
                                  {language === 'ar' 
                                    ? `طلب ${ord.tableOrDelivery === 'delivery' ? 'توصيل منزلي' : ord.tableOrDelivery === 'table' ? `طاولة ${ord.tableNumber || ''}` : 'سفري'}`
                                    : `${ord.tableOrDelivery === 'delivery' ? 'Home Delivery' : ord.tableOrDelivery === 'table' ? `Table ${ord.tableNumber || ''}` : 'Takeaway'}`
                                  }
                                  <span className="mx-1.5 text-stone-300">•</span>
                                  {language === 'ar' ? `${itemsCount} أصناف` : `${itemsCount} items`}
                                </p>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t border-dashed border-stone-100 sm:border-0">
                                <div className="text-start sm:text-end">
                                  <span className="text-xs text-stone-400 block leading-none mb-1 font-bold">{language === 'ar' ? 'الإجمالي' : 'Total'}</span>
                                  <span className="text-base font-black text-stone-900 font-mono">
                                    {ord.total.toFixed(1)} {language === 'ar' ? 'ريال' : 'SAR'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`text-[10px] sm:text-xs font-extrabold px-2.5 py-1.5 rounded-lg border leading-none ${statusInfo.color}`}>
                                    {language === 'ar' ? statusInfo.ar : statusInfo.en}
                                  </span>
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                                </div>
                              </div>
                            </div>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-stone-100 bg-stone-50/50"
                                >
                                  <div className="p-4 sm:p-5 space-y-4">
                                    <div className="space-y-2 text-start">
                                      <h4 className="text-xs font-black text-stone-400 uppercase tracking-wider">{language === 'ar' ? 'تفاصيل الأصناف' : 'Order Items'}</h4>
                                      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden divide-y divide-stone-100">
                                        {ord.items.map((item, idx) => (
                                          <div key={idx} className="p-3 flex justify-between items-center text-xs sm:text-sm">
                                            <div className="text-start">
                                              <p className="font-extrabold text-stone-850">
                                                {language === 'ar' ? item.nameAr : item.name}
                                              </p>
                                              <p className="text-[11px] text-stone-400 font-bold mt-0.5 font-mono">
                                                {item.quantity} × {item.price.toFixed(1)} {language === 'ar' ? 'ريال' : 'SAR'}
                                              </p>
                                            </div>
                                            <span className="font-bold text-stone-700 font-mono">
                                              {(item.quantity * item.price).toFixed(1)} {language === 'ar' ? 'ريال' : 'SAR'}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {ord.tableOrDelivery === 'delivery' && ord.deliveryAddress && (
                                      <div className="bg-white border border-black/5 p-3.5 rounded-2xl text-xs space-y-1.5 text-start">
                                        <div className="flex gap-1.5 text-stone-500 font-bold">
                                          <MapPin className="w-3.5 h-3.5 text-yellow shrink-0" />
                                          <span>{language === 'ar' ? 'عنوان التوصيل للمنزل:' : 'Home Delivery Address:'}</span>
                                        </div>
                                        <p className="font-semibold text-stone-700 leading-relaxed pl-5 pr-5">
                                          {ord.deliveryAddress}
                                        </p>
                                      </div>
                                    )}

                                    <div className="pt-2 flex justify-end">
                                      <button
                                        onClick={() => handleReorderClick(ord)}
                                        className="bg-stone-900 text-white hover:bg-stone-800 text-xs font-black py-2.5 px-5 rounded-xl cursor-pointer flex items-center gap-2 transition-all shadow-md active:scale-95"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>{language === 'ar' ? 'إعادة طلب هذه الأصناف' : 'Reorder These Items'}</span>
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 1.2 PAST ORDERS SECTION */}
                {pastOrders.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-black text-stone-400 uppercase tracking-wider flex items-center gap-1.5 text-start px-2">
                      <History className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'طلباتي السابقة' : 'Past Orders'}</span>
                    </h3>
                    <div className="space-y-3">
                      {pastOrders.map((ord) => {
                        const isExpanded = expandedOrderId === ord.id;
                        const statusInfo = getStatusLabel(ord.status);
                        const itemsCount = ord.items.reduce((sum, item) => sum + item.quantity, 0);

                        return (
                          <div 
                            key={ord.id} 
                            className={`bg-white border rounded-[1.5rem] transition-all overflow-hidden ${
                              isExpanded ? 'border-yellow ring-4 ring-yellow/5' : 'border-black/5 hover:border-black/10'
                            }`}
                          >
                            <div 
                              onClick={() => setExpandedOrderId(isExpanded ? null : ord.id)}
                              className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 cursor-pointer select-none"
                            >
                              <div className="space-y-1 text-start">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-black text-stone-800 bg-stone-100 px-2 py-0.5 rounded-lg">
                                    #{ord.id.slice(-6).toUpperCase()}
                                  </span>
                                  <span className="text-xs text-stone-400 font-bold">
                                    {new Date(ord.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
                                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                  </span>
                                </div>
                                <p className="text-xs font-bold text-stone-600">
                                  {language === 'ar' 
                                    ? `طلب ${ord.tableOrDelivery === 'delivery' ? 'توصيل منزلي' : ord.tableOrDelivery === 'table' ? `طاولة ${ord.tableNumber || ''}` : 'سفري'}`
                                    : `${ord.tableOrDelivery === 'delivery' ? 'Home Delivery' : ord.tableOrDelivery === 'table' ? `Table ${ord.tableNumber || ''}` : 'Takeaway'}`
                                  }
                                  <span className="mx-1.5 text-stone-300">•</span>
                                  {language === 'ar' ? `${itemsCount} أصناف` : `${itemsCount} items`}
                                </p>
                              </div>

                              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t border-dashed border-stone-100 sm:border-0">
                                <div className="text-start sm:text-end">
                                  <span className="text-xs text-stone-400 block leading-none mb-1 font-bold">{language === 'ar' ? 'الإجمالي' : 'Total'}</span>
                                  <span className="text-base font-black text-stone-900 font-mono">
                                    {ord.total.toFixed(1)} {language === 'ar' ? 'ريال' : 'SAR'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`text-[10px] sm:text-xs font-extrabold px-2.5 py-1.5 rounded-lg border leading-none ${statusInfo.color}`}>
                                    {language === 'ar' ? statusInfo.ar : statusInfo.en}
                                  </span>
                                  {isExpanded ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                                </div>
                              </div>
                            </div>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-stone-100 bg-stone-50/50"
                                >
                                  <div className="p-4 sm:p-5 space-y-4">
                                    <div className="space-y-2 text-start">
                                      <h4 className="text-xs font-black text-stone-400 uppercase tracking-wider">{language === 'ar' ? 'تفاصيل الأصناف' : 'Order Items'}</h4>
                                      <div className="bg-white border border-black/5 rounded-2xl overflow-hidden divide-y divide-stone-100">
                                        {ord.items.map((item, idx) => (
                                          <div key={idx} className="p-3 flex justify-between items-center text-xs sm:text-sm">
                                            <div className="text-start">
                                              <p className="font-extrabold text-stone-850">
                                                {language === 'ar' ? item.nameAr : item.name}
                                              </p>
                                              <p className="text-[11px] text-stone-400 font-bold mt-0.5 font-mono">
                                                {item.quantity} × {item.price.toFixed(1)} {language === 'ar' ? 'ريال' : 'SAR'}
                                              </p>
                                            </div>
                                            <span className="font-bold text-stone-700 font-mono">
                                              {(item.quantity * item.price).toFixed(1)} {language === 'ar' ? 'ريال' : 'SAR'}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    {ord.tableOrDelivery === 'delivery' && ord.deliveryAddress && (
                                      <div className="bg-white border border-black/5 p-3.5 rounded-2xl text-xs space-y-1.5 text-start">
                                        <div className="flex gap-1.5 text-stone-500 font-bold">
                                          <MapPin className="w-3.5 h-3.5 text-yellow shrink-0" />
                                          <span>{language === 'ar' ? 'عنوان التوصيل للمنزل:' : 'Home Delivery Address:'}</span>
                                        </div>
                                        <p className="font-semibold text-stone-700 leading-relaxed pl-5 pr-5">
                                          {ord.deliveryAddress}
                                        </p>
                                      </div>
                                    )}

                                    <div className="pt-2 flex justify-end">
                                      <button
                                        onClick={() => handleReorderClick(ord)}
                                        className="bg-stone-900 text-white hover:bg-stone-800 text-xs font-black py-2.5 px-5 rounded-xl cursor-pointer flex items-center gap-2 transition-all shadow-md active:scale-95"
                                      >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        <span>{language === 'ar' ? 'إعادة طلب هذه الأصناف' : 'Reorder These Items'}</span>
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        )}

        {/* 2. SAVED ADDRESSES TAB */}
        {activeSubTab === 'addresses' && (
          <div className="space-y-4">
            {renderActiveHeader('عناويني', 'My Addresses')}
            
            {/* Address list */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(user.addresses || []).map((addr, index) => (
                <div key={addr.id || `addr-${index}`} className="bg-white border border-black/5 p-4 rounded-2xl flex flex-col justify-between gap-3 text-start hover:border-yellow transition-all">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-yellow/15 text-stone-850 text-xs font-extrabold flex items-center justify-center w-5 h-5">
                        <MapPin className="w-3.5 h-3.5 text-yellow" />
                      </span>
                      <h4 className="font-extrabold text-sm text-stone-900">{addr.label}</h4>
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed pl-1.5 font-semibold">
                      {addr.details}
                    </p>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => requestDeleteAddress(index)}
                      className="p-1.5 text-red-500 hover:bg-red-50 border border-red-100 rounded-lg transition-colors cursor-pointer"
                      title={language === 'ar' ? 'حذف العنوان' : 'Delete Address'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Empty state addresses */}
            {(!user.addresses || user.addresses.length === 0) && !isAddingAddress && (
              <div className="py-8 border border-dashed border-black/10 rounded-[2rem] bg-stone-50 text-center space-y-2 max-w-md mx-auto">
                <h4 className="font-extrabold text-stone-800 text-sm">{language === 'ar' ? 'لا يوجد عناوين مسجلة بعد' : 'No Saved Addresses'}</h4>
                <p className="text-xs text-stone-500">{language === 'ar' ? 'أضف عناوينك المعتادة لتسريع وتسهيل عملية التوصيل!' : 'Add your usual delivery points for faster checkout!'}</p>
              </div>
            )}

            {/* Add Address CTA or Form Toggle */}
            {!isAddingAddress ? (
              <button
                onClick={() => setIsAddingAddress(true)}
                className="mx-auto bg-stone-900 text-white hover:bg-stone-800 text-xs font-black py-3 px-6 rounded-xl flex items-center gap-2 transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>{language === 'ar' ? 'إضافة عنوان توصيل جديد' : 'Add New Address'}</span>
              </button>
            ) : (
              <form onSubmit={handleAddAddressSubmit} className="bg-white border border-black/5 p-5 rounded-[2rem] space-y-4 max-w-lg mx-auto text-start">
                <div className="border-b border-stone-100 pb-3 flex justify-between items-center">
                  <h3 className="font-black text-sm text-stone-800">{language === 'ar' ? 'إضافة عنوان جديد' : 'Add New Address'}</h3>
                </div>

                <div className="space-y-3">
                  {/* Embedded high-fidelity interactive map for verifying exact address position */}
                  <label className="block text-xs font-bold text-stone-600">{language === 'ar' ? 'حدد موقعك بدقة على الخريطة التفاعلية' : 'Pinpoint Your Exact Location on Map'}</label>
                  
                  {/* Dynamic Interactive Leaflet map integration */}
                  <MapPicker
                    latitude={newLat}
                    longitude={newLng}
                    onChange={(lat, lng) => {
                      setNewLat(lat);
                      setNewLng(lng);
                    }}
                    onAddressSelect={(address) => {
                      setNewDetails(address);
                    }}
                  />
                </div>

                <div className="space-y-1.5 pt-2">
                  <label className="block text-xs font-bold text-stone-600">{language === 'ar' ? 'اسم العنوان' : 'Address Label'}</label>
                  
                  {/* Quick select buttons */}
                  <div className="flex gap-1.5 flex-wrap pb-1">
                    {[
                      { labelAr: 'المنزل', labelEn: 'Home', val: 'المنزل' },
                      { labelAr: 'العمل', labelEn: 'Work', val: 'العمل' },
                      { labelAr: 'الاستراحة', labelEn: 'Rest House', val: 'الاستراحة' },
                      { labelAr: 'أخرى', labelEn: 'Other', val: 'أخرى' }
                    ].map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setNewLabel(language === 'ar' ? item.val : item.labelEn)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                          newLabel === (language === 'ar' ? item.val : item.labelEn)
                            ? 'bg-stone-900 border-stone-900 text-white'
                            : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        {language === 'ar' ? item.labelAr : item.labelEn}
                      </button>
                    ))}
                  </div>

                  <input
                    required
                    type="text"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder={language === 'ar' ? 'المنزل، الاستراحة، العمل...' : 'Home, Office, Relatives...'}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 outline-none focus:border-yellow focus:bg-white transition-all font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-stone-600">{language === 'ar' ? 'تفاصيل العنوان الكاملة والحي' : 'Full Address Details & Neighborhood'}</label>
                  <textarea
                    required
                    rows={3}
                    value={newDetails}
                    onChange={(e) => setNewDetails(e.target.value)}
                    placeholder={language === 'ar' ? 'مثال: حي الملقا، شارع الأناضول، فيلا رقم ٤ب بجوار سوبرماركت...' : 'e.g. Al-Malqa District, Anatolia Street, Villa 4B beside...'}
                    className="w-full text-xs bg-stone-50 border border-stone-200 rounded-lg p-2.5 outline-none focus:border-yellow focus:bg-white transition-all font-semibold leading-relaxed"
                  />
                </div>

                <div className="flex gap-2 pt-1.5">
                  <button
                    type="button"
                    onClick={() => setIsAddingAddress(false)}
                    className="w-1/3 border border-stone-200 hover:bg-stone-50 text-stone-600 text-xs font-bold py-2.5 rounded-lg cursor-pointer"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    disabled={addressLoading}
                    className="flex-1 bg-yellow text-stone-900 hover:bg-yellow/90 text-xs font-black py-2.5 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
                  >
                    {addressLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>{language === 'ar' ? 'حفظ العنوان' : 'Save Address'}</span>}
                  </button>
                </div>
              </form>
            )}

          </div>
        )}

        {/* 3. SUPPORT & COMPLAINTS TAB */}
        {activeSubTab === 'support' && (
          <div className="space-y-4 max-w-lg mx-auto">
            {renderActiveHeader('الدعم الفني والشكاوى', 'Support & Complaints')}

            {/* Support Message Submit Form */}
            <form onSubmit={handleSendSupportMessage} className="bg-white border border-black/5 p-5 rounded-[2rem] space-y-4 text-start">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-stone-600">
                  {language === 'ar' ? 'اكتب رسالتك أو شكواك هنا وسيرد عليك الدعم الفني فوراً' : 'Write your message or complaint here'}
                </label>
                <textarea
                  required
                  rows={4}
                  value={supportMsg}
                  onChange={(e) => {
                    setSupportMsg(e.target.value);
                    setSupportSuccess(false);
                  }}
                  placeholder={
                    language === 'ar'
                      ? 'يرجى كتابة تفاصيل الشكوى أو طلب المساعدة الفنية هنا بالتفصيل...'
                      : 'Please type the technical help or complaint details here...'
                  }
                  className="w-full text-xs bg-stone-50 border border-stone-200 rounded-xl p-3 outline-none focus:border-yellow focus:bg-white transition-all font-semibold leading-relaxed"
                />
              </div>

              {supportSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold">
                  {language === 'ar' 
                    ? 'تم إرسال رسالتك بنجاح. سنرد عليك في أقرب وقت!' 
                    : 'Your message has been sent successfully. We will reply as soon as possible!'}
                </div>
              )}

              <button
                type="submit"
                disabled={supportSending || !supportMsg.trim()}
                className="w-full bg-stone-900 text-white hover:bg-stone-850 disabled:opacity-50 py-3 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-98"
              >
                {supportSending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>{language === 'ar' ? 'إرسال الرسالة' : 'Send Message'}</span>
                )}
              </button>
            </form>

            {/* Conversation History / Ticket Responses */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-stone-400 uppercase tracking-wider text-start px-2">
                {language === 'ar' ? 'سجل المحادثات والردود' : 'Support Tickets History'}
              </h3>

              {loadingSupportTickets ? (
                <div className="py-6 flex justify-center">
                  <Loader2 className="w-5 h-5 text-yellow animate-spin" />
                </div>
              ) : supportTickets.length === 0 ? (
                <div className="p-6 border border-dashed border-black/10 rounded-2xl bg-stone-50/50 text-center text-xs text-stone-400 font-bold">
                  {language === 'ar' ? 'لا توجد شكاوى أو رسائل دعم سابقة' : 'No previous support messages'}
                </div>
              ) : (
                <div className="space-y-3">
                  {supportTickets.map((t) => (
                    <div key={t.id} className="bg-white border border-black/5 p-4 rounded-2xl text-start space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-mono font-black text-stone-400">
                          #{t.id.slice(-6).toUpperCase()}
                        </span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                          t.status === 'open' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                        }`}>
                          {t.status === 'open' 
                            ? (language === 'ar' ? 'قيد المراجعة' : 'Open') 
                            : (language === 'ar' ? 'تم الرد' : 'Resolved')}
                        </span>
                      </div>

                      <div className="bg-stone-50 p-3 rounded-xl">
                        <p className="text-xs font-bold text-stone-700 leading-relaxed">
                          {t.message}
                        </p>
                        <span className="text-[9px] text-stone-400 font-bold mt-1 block font-mono">
                          {new Date(t.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>

                      {t.adminReply && (
                        <div className="bg-amber-50/50 border border-amber-100/50 p-3 rounded-xl pl-4 pr-4 ml-2 mr-2 animate-fade-in">
                          <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider mb-0.5">
                            {language === 'ar' ? 'رد الإدارة' : 'Admin Reply'}
                          </p>
                          <p className="text-xs font-extrabold text-stone-850 leading-relaxed">
                            {t.adminReply}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. LANGUAGE TAB */}
        {activeSubTab === 'language' && (
          <div className="space-y-4 max-w-lg mx-auto">
            {renderActiveHeader('اللغة والترجمة', 'Language')}

            <div className="bg-white border border-black/5 p-6 rounded-[2rem] space-y-4 text-center animate-fade-in">
              <p className="text-xs font-bold text-stone-500">
                {language === 'ar' ? 'يرجى تحديد لغة عرض واجهات التطبيق المفضلة لديك' : 'Select your preferred application display language'}
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setLanguage('ar')}
                  className={`py-4 px-6 rounded-2xl text-sm font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 border ${
                    language === 'ar' 
                      ? 'bg-yellow border-yellow text-stone-900 shadow-md scale-[1.01]' 
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span className="text-lg">العربية</span>
                  <span className="text-[10px] text-stone-400 font-bold">اللغة الرسمية</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLanguage('en')}
                  className={`py-4 px-6 rounded-2xl text-sm font-black transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 border ${
                    language === 'en' 
                      ? 'bg-yellow border-yellow text-stone-900 shadow-md scale-[1.01]' 
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <span className="text-lg">English</span>
                  <span className="text-[10px] text-stone-400 font-bold">English Language</span>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Logout Confirmation Modal Overlay */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="logout-confirm-modal">
          <div className="bg-white rounded-[2rem] border border-black/5 shadow-2xl p-6 max-w-sm w-full space-y-5 text-center animate-scale-in">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-stone-900">
                {language === 'ar' ? 'تأكيد تسجيل الخروج' : 'Confirm Logout'}
              </h3>
              <p className="text-xs text-stone-500 font-semibold leading-relaxed">
                {language === 'ar' 
                  ? 'هل أنت متأكد من رغبتك في تسجيل الخروج من حسابك؟ سيتوجب عليك التحقق برقم الجوال عند الدخول مجدداً.' 
                  : 'Are you sure you want to log out? You will need to verify your phone number when logging back in.'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="w-1/2 py-3 border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={executeLogout}
                className="w-1/2 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
              >
                {language === 'ar' ? 'خروج' : 'Log Out'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Address Confirmation Modal Overlay */}
      {addressToDeleteIndex !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="delete-address-modal">
          <div className="bg-white rounded-[2rem] border border-black/5 shadow-2xl p-6 max-w-sm w-full space-y-5 text-center animate-scale-in">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-stone-900">
                {language === 'ar' ? 'تأكيد حذف العنوان' : 'Confirm Delete Address'}
              </h3>
              <p className="text-xs text-stone-500 font-semibold leading-relaxed">
                {language === 'ar' 
                  ? 'هل أنت متأكد من رغبتك في حذف هذا العنوان من حسابك؟' 
                  : 'Are you sure you want to delete this address from your account?'}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAddressToDeleteIndex(null)}
                className="w-1/2 py-3 border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={executeDeleteAddress}
                className="w-1/2 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
              >
                {language === 'ar' ? 'حذف' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Name Edit Confirmation Modal Overlay */}
      {pendingNameChange && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="edit-profile-modal">
          <div className="bg-white rounded-[2rem] border border-black/5 shadow-2xl p-6 max-w-sm w-full space-y-5 text-center animate-scale-in">
            <div className="space-y-2">
              <h3 className="text-lg font-black text-stone-900">
                {language === 'ar' ? 'تأكيد تعديل الاسم' : 'Confirm Profile Edit'}
              </h3>
              <p className="text-xs text-stone-500 font-semibold leading-relaxed">
                {language === 'ar' 
                  ? `هل أنت متأكد من تغيير اسمك إلى "${pendingNameChange}"؟` 
                  : `Are you sure you want to change your name to "${pendingNameChange}"?`}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPendingNameChange(null)}
                className="w-1/2 py-3 border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={executeEditProfileSave}
                className="w-1/2 py-3 bg-yellow hover:bg-yellow/90 text-stone-900 rounded-xl text-xs font-black transition-all shadow-md cursor-pointer"
              >
                {language === 'ar' ? 'تعديل' : 'Modify'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

