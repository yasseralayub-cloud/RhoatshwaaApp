import React, { useState, useEffect, useRef } from 'react';
import InteractiveOrderMap from './InteractiveOrderMap';
import { auth, db } from '../firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { Order, Driver } from '../types';
import { useLanguage } from './LanguageContext';
import { playOrderChime } from './AudioAlert';
import { normalizePhone, phonesMatch } from '../utils/phone';

// Utility helper to compress uploaded base64 photos to crisp ~40KB JPEGs to prevent Firestore document 1MB limits and payload timeouts
const compressImageDataUrl = (dataUrl: string, maxDim = 600, quality = 0.6): Promise<string> => {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      resolve(dataUrl || '');
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};
import { 
  Truck, 
  CheckCircle2, 
  MapPin, 
  Phone, 
  Navigation, 
  RotateCcw, 
  Search, 
  Plus, 
  Clock, 
  User, 
  AlertCircle, 
  ShieldCheck, 
  HelpCircle,
  TrendingUp,
  DollarSign,
  Map,
  CreditCard,
  History,
  LogOut,
  Compass,
  Bell,
  Signal,
  Menu,
  X,
  Copy,
  Check,
  Smartphone,
  Lock,
  Key,
  Fingerprint,
  Globe,
  RefreshCw,
  Send,
  MessageSquare,
  ArrowRight,
  ArrowLeft,
  UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DriverPortalProps {
  businessSettings?: import('../types').BusinessSettings;
  onExitToClient?: () => void;
}

export const DriverPortal: React.FC<DriverPortalProps> = ({ businessSettings, onExitToClient }) => {
  const { language, t } = useLanguage();

  // Driver portal language state (Arabic, English, Urdu)
  const [portalLang, setPortalLang] = useState<'ar' | 'en' | 'ur'>(() => {
    const saved = localStorage.getItem('driver_portal_lang');
    if (saved === 'ar' || saved === 'en' || saved === 'ur') return saved;
    if (language === 'ar' || language === 'en' || language === 'ur') return language as any;
    return 'ar';
  });

  const isAr = portalLang === 'ar';
  const isUr = portalLang === 'ur';
  const isEn = portalLang === 'en';
  const isRtl = isAr || isUr;

  useEffect(() => {
    localStorage.setItem('driver_portal_lang', portalLang);
  }, [portalLang]);

  // Driver context state
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(() => {
    const saved = localStorage.getItem('active_driver_profile');
    return saved ? JSON.parse(saved) : null;
  });

  // Advanced Authentication System State
  const [authStep, setAuthStep] = useState<'phone' | 'pin_entry' | 'otp_verification' | 'set_pin' | 'biometric_suggestion' | 'not_registered'>('phone');
  const [loginPhone, setLoginPhone] = useState('');
  const [unregisteredPhone, setUnregisteredPhone] = useState('');
  const [enteredPin, setEnteredPin] = useState('');
  const [foundDriverAuth, setFoundDriverAuth] = useState<Driver | null>(null);
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(0);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isForgotPinFlow, setIsForgotPinFlow] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [hasBiometricSaved, setHasBiometricSaved] = useState(false);
  const [smsDispatchState, setSmsDispatchState] = useState<'idle' | 'sending' | 'sent_gateway' | 'sent_simulated' | 'failed'>('idle');
  const [smsGatewayName, setSmsGatewayName] = useState<string>('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

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
    if (clean.startsWith('00966') && clean.length === 14) {
      return '+' + clean.substring(2);
    }
    if (!phone.startsWith('+')) {
      return '+' + clean;
    }
    return phone;
  };

  // Creation form state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [profileImg, setProfileImg] = useState<string>('');
  const [nationalIdImg, setNationalIdImg] = useState<string>('');
  const [licenseImg, setLicenseImg] = useState<string>('');
  const [carRegistrationImg, setCarRegistrationImg] = useState<string>('');
  const [bankName, setBankName] = useState<string>('Al Rajhi'); // 'Al Rajhi' or 'STC Bank'
  const [iban, setIban] = useState<string>('');
  const [bankAccountName, setBankAccountName] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationSuccessMsg, setRegistrationSuccessMsg] = useState('');

  // Orders lists state
  const [activeDeliveries, setActiveDeliveries] = useState<Order[]>([]);
  const [completedDeliveries, setCompletedDeliveries] = useState<Order[]>([]);
  const [unassignedDeliveries, setUnassignedDeliveries] = useState<Order[]>([]);

  const [loadingOrders, setLoadingOrders] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [suspensionCountdown, setSuspensionCountdown] = useState<string>('');

  // Standalone app navigation and tracking states
  const [activeTab, setActiveTab] = useState<'home' | 'map' | 'earnings' | 'bank' | 'profile'>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const [copiedDriverUrl, setCopiedDriverUrl] = useState(false);

  const lastGpsSyncRef = useRef<number>(0);
  const firestoreQuotaExceededRef = useRef<boolean>(false);

  const handleInstallDriverApp = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (promptEvent) {
      try {
        promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        console.log(`Driver app install choice: ${outcome}`);
        (window as any).deferredPrompt = null;
      } catch (err) {
        console.error("Install prompt error:", err);
        setShowInstallGuide(true);
      }
    } else {
      setShowInstallGuide(true);
    }
  };

  const handleCopyDriverUrl = () => {
    const driverUrl = `${window.location.origin}/?portal=driver#driver`;
    navigator.clipboard.writeText(driverUrl);
    setCopiedDriverUrl(true);
    setTimeout(() => setCopiedDriverUrl(false), 2500);
  };
  
  // Geolocation tracking
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsSpeed, setGpsSpeed] = useState<number | null>(null);
  const [isTrackingLive, setIsTrackingLive] = useState(false);
  const [gpsPermissionState, setGpsPermissionState] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  
  // Manual coordinates adjustment for testing/iframe compatibility
  const [simulationMode, setSimulationMode] = useState(false);

  // Helper to copy IBAN
  const handleCopyIBAN = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Edit Bank details state
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [editBankName, setEditBankName] = useState('Al Rajhi');
  const [editBankAccountName, setEditBankAccountName] = useState('');
  const [editIban, setEditIban] = useState('');
  const [isSavingBank, setIsSavingBank] = useState(false);
  const [showPressurePool, setShowPressurePool] = useState(false);

  useEffect(() => {
    if (selectedDriver) {
      setEditBankName(selectedDriver.bankName || 'Al Rajhi');
      setEditBankAccountName(selectedDriver.bankAccountName || selectedDriver.name || '');
      setEditIban(selectedDriver.iban || '');
    }
  }, [selectedDriver?.id, selectedDriver?.bankName, selectedDriver?.bankAccountName, selectedDriver?.iban]);

  const handleSaveBankDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDriver) return;
    
    setIsSavingBank(true);
    try {
      const driverRef = doc(db, 'drivers', selectedDriver.id);
      const updatedFields = {
        bankName: editBankName,
        bankAccountName: editBankAccountName,
        iban: editIban
      };
      
      await updateDoc(driverRef, updatedFields);
      
      // Update selectedDriver locally as well for immediate feedback
      const freshProfile = {
        ...selectedDriver,
        ...updatedFields
      };
      setSelectedDriver(freshProfile);
      localStorage.setItem('active_driver_profile', JSON.stringify(freshProfile));
      
      setIsEditingBank(false);
      alert(isAr ? 'تم حفظ بياناتك البنكيه بنجاح! ✅' : 'Bank details saved successfully! ✅');
    } catch (err) {
      console.error('Failed to update bank details:', err);
      alert(isAr ? 'تعذر حفظ البيانات البنكية، يرجى المحاولة مرة أخرى.' : 'Failed to save bank details, please try again.');
    } finally {
      setIsSavingBank(false);
    }
  };

  const isDriverSuspended = (drv: Driver | null) => {
    if (!drv) return false;
    if (drv.status === 'suspended') {
      if (drv.suspendedUntil) {
        const until = new Date(drv.suspendedUntil).getTime();
        if (until > Date.now()) {
          return true;
        }
      } else {
        return true;
      }
    }
    return false;
  };

  // Suspension countdown effect
  useEffect(() => {
    if (!selectedDriver || !isDriverSuspended(selectedDriver) || !selectedDriver.suspendedUntil) {
      setSuspensionCountdown('');
      return;
    }

    const updateCountdown = async () => {
      const until = new Date(selectedDriver.suspendedUntil!).getTime();
      const diff = until - Date.now();
      if (diff <= 0) {
        // Automatically lift suspension in database when countdown finishes
        setSuspensionCountdown('');
        try {
          await updateDoc(doc(db, 'drivers', selectedDriver.id), {
            status: 'available',
            suspendedUntil: null
          });
          const updated = { ...selectedDriver, status: 'available' as const, suspendedUntil: undefined };
          setSelectedDriver(updated);
          localStorage.setItem('active_driver_profile', JSON.stringify(updated));
        } catch (err) {
          console.error("Failed to lift driver suspension automatically:", err);
        }
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setSuspensionCountdown(
        isAr 
          ? `${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية` 
          : `${hours}h ${minutes}m ${seconds}s`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [selectedDriver?.suspendedUntil, selectedDriver?.status]);

  // Continuous sound alerts effect: alert driver if they have pending orders in unassigned pool
  useEffect(() => {
    // If the driver has any active deliveries, completely mute and stop all sounds/alerts!
    if (activeDeliveries.length > 0) {
      return;
    }

    if (!selectedDriver || selectedDriver.status !== 'available' || unassignedDeliveries.length === 0 || isDriverSuspended(selectedDriver)) {
      return;
    }

    // Play immediately on mount/new order
    playOrderChime();

    // Loop sound play every 4 seconds continuously
    const interval = setInterval(() => {
      playOrderChime();
    }, 4000);

    return () => clearInterval(interval);
  }, [selectedDriver?.id, unassignedDeliveries.length, selectedDriver?.status, selectedDriver?.suspendedUntil, activeDeliveries.length]);

  // Live background geolocation & permission watcher
  useEffect(() => {
    if (!selectedDriver) return;

    // Request notifications permission gracefully
    if ('Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(console.error);
      }
    }

    if (simulationMode) {
      // In simulation mode, default to a beautiful Riyadh spot if not set
      if (!coords) {
        setCoords({ lat: 24.7136, lng: 46.6753 });
      }
      return;
    }

    let watchId: number | null = null;
    if ('geolocation' in navigator) {
      setIsTrackingLive(true);
      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          const speed = position.coords.speed;

          setCoords({ lat, lng });
          setGpsAccuracy(accuracy);
          if (speed !== null) {
            setGpsSpeed(Math.round(speed * 3.6)); // km/h
          }
          setGpsPermissionState('granted');

          // Sync position to cloud Firestore for Live customer tracking map & Admin panel tracking in real-time!
          // Throttle to at most once every 30 seconds to conserve Firestore write quota
          const now = Date.now();
          if (!firestoreQuotaExceededRef.current && (now - lastGpsSyncRef.current > 30000)) {
            lastGpsSyncRef.current = now;
            try {
              await updateDoc(doc(db, 'drivers', selectedDriver.id), {
                latitude: lat,
                longitude: lng,
                lastActive: new Date().toISOString(),
                gpsAccuracy: accuracy
              });
            } catch (err: any) {
              console.warn("Failed to sync GPS position to Firestore (quota or offline):", err);
              if (err?.code === 'resource-exhausted' || String(err).includes('quota') || String(err).includes('resource-exhausted')) {
                firestoreQuotaExceededRef.current = true;
              }
            }
          }
        },
        (error) => {
          console.warn("Geolocation watch failed:", error);
          setGpsPermissionState('denied');
          setIsTrackingLive(false);
          // Set standard Riyadh coordinates as default
          if (!coords) {
            setCoords({ lat: 24.7136, lng: 46.6753 });
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else {
      setGpsPermissionState('denied');
      if (!coords) {
        setCoords({ lat: 24.7136, lng: 46.6753 });
      }
    }

    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [selectedDriver?.id, simulationMode]);

  // Handler to adjust location manually in simulation mode
  const handleManualLocationUpdate = async (newLat: number, newLng: number) => {
    setCoords({ lat: newLat, lng: newLng });
    if (selectedDriver) {
      try {
        await updateDoc(doc(db, 'drivers', selectedDriver.id), {
          latitude: newLat,
          longitude: newLng,
          lastActive: new Date().toISOString()
        });
      } catch (err) {
        console.error("Failed to update manual position in Firestore:", err);
      }
    }
  };

  // 1. Listen to drivers list in real-time
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'drivers'),
      (snapshot) => {
        const list: Driver[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Driver);
        });
        setDrivers(list);

        // Keep local profile fresh if it was updated in DB
        if (selectedDriver) {
          const matched = list.find((d) => d.id === selectedDriver.id);
          if (matched) {
            setSelectedDriver(matched);
            localStorage.setItem('active_driver_profile', JSON.stringify(matched));
          }
        }
      },
      (error) => {
        console.error('Failed to listen to drivers collection:', error);
      }
    );

    return () => unsubscribe();
  }, [selectedDriver?.id]);

  // 2. Listen to orders assigned or unassigned for delivery
  useEffect(() => {
    setLoadingOrders(true);
    // Listen to all active delivery orders (tableOrDelivery === 'delivery')
    const q = query(
      collection(db, 'orders'),
      where('tableOrDelivery', '==', 'delivery')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allDeliveryOrders: Order[] = [];
        snapshot.forEach((docSnap) => {
          allDeliveryOrders.push({ id: docSnap.id, ...docSnap.data() } as Order);
        });

        // Filter based on driver assignment status
        if (selectedDriver) {
          // Active: assigned to this driver AND status is not 'delivered' AND not 'cancelled'
          const active = allDeliveryOrders.filter(
            (o) => o.driverId === selectedDriver.id && o.status !== 'delivered' && o.status !== 'cancelled'
          );
          // Completed: assigned to this driver AND status is 'delivered'
          const completed = allDeliveryOrders.filter(
            (o) => o.driverId === selectedDriver.id && o.status === 'delivered'
          );
          
          // Sort by date (newest first)
          active.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          completed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          setActiveDeliveries(active);
          setCompletedDeliveries(completed);
        } else {
          setActiveDeliveries([]);
          setCompletedDeliveries([]);
        }

        // Available for self-assignment (searching driver and no driverId, OR driverId is 'broadcast')
        const unassigned = allDeliveryOrders.filter(
          (o) => (o.status === 'searching_driver' || o.status === 'pending' || o.status === 'received' || o.status === 'preparing') && 
                 (!o.driverId || o.driverId === 'broadcast')
        );
        unassigned.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setUnassignedDeliveries(unassigned);

        setLoadingOrders(false);
      },
      (error) => {
        console.error('Failed to listen to delivery orders:', error);
        setErrorMsg('Failed to sync orders.');
        setLoadingOrders(false);
      }
    );

    return () => unsubscribe();
  }, [selectedDriver?.id]);

  // OTP Countdown timer effect
  useEffect(() => {
    if (otpTimer <= 0) return;
    const interval = setInterval(() => {
      setOtpTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpTimer]);

  // Check saved biometric credentials in vault
  useEffect(() => {
    try {
      const vault = JSON.parse(localStorage.getItem('driver_biometric_vault') || '{}');
      if (Object.keys(vault).length > 0) {
        setHasBiometricSaved(true);
      } else {
        setHasBiometricSaved(false);
      }
    } catch {
      setHasBiometricSaved(false);
    }
  }, [loginPhone]);

  // Auto-sync logged-in customer profile from localStorage ('rehla_user_profile')
  // If customer is already verified via OTP on customer side, skip OTP verification on driver side!
  useEffect(() => {
    if (selectedDriver) return; // Driver already logged in

    try {
      const cachedCustomer = localStorage.getItem('rehla_user_profile');
      if (cachedCustomer) {
        const customerProfile = JSON.parse(cachedCustomer);
        if (customerProfile && customerProfile.phone) {
          const custPhone = customerProfile.phone;
          setLoginPhone(custPhone);

          // Check if driver exists in registered drivers list
          if (drivers.length > 0) {
            const matched = drivers.find(d => phonesMatch(d.phone, custPhone));
            if (matched) {
              // Existing registered driver! Log in automatically
              setSelectedDriver(matched);
              localStorage.setItem('active_driver_profile', JSON.stringify(matched));
            } else {
              // Not registered as driver yet. Skip OTP since phone is ALREADY verified on customer side!
              setUnregisteredPhone(custPhone);
              setNewDriverPhone(custPhone);
              if (customerProfile.name && !newDriverName) {
                setNewDriverName(customerProfile.name);
              }
              setAuthStep('not_registered');
              setShowRegisterForm(true);
            }
          }
        }
      }
    } catch (e) {
      console.error('Error auto-syncing customer profile to driver portal:', e);
    }
  }, [drivers, selectedDriver]);

  // 2b. Advanced Authentication Flow Handlers
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const isOtpDispatchingRef = useRef<boolean>(false);
  const lastOtpDispatchTimestampRef = useRef<number>(0);

  // OTP Scheduling & Deduplication Middleware to prevent duplicate triggers and ensure instant driver feedback
  const dispatchOtpMiddleware = async (phone: string, isResend: boolean = false) => {
    const now = Date.now();
    // Prevent duplicate triggers if already dispatching or clicked within 3000ms throttle window
    if (isOtpDispatchingRef.current || (now - lastOtpDispatchTimestampRef.current < 3000)) {
      console.warn('OTP dispatch request deduplicated/throttled to prevent duplicate sends.');
      return;
    }

    isOtpDispatchingRef.current = true;
    lastOtpDispatchTimestampRef.current = now;
    setIsSendingOtp(true);
    setIsLoggingIn(true);

    try {
      await triggerSendOtp(phone);
    } catch (err) {
      console.error('OTP middleware dispatch error:', err);
    } finally {
      setIsSendingOtp(false);
      setIsLoggingIn(false);
      isOtpDispatchingRef.current = false;
    }
  };

  const handleCheckPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn || isSendingOtp) return;
    setErrorMsg('');
    const cleanPhone = loginPhone.trim().replace(/[\s+]/g, '');
    if (!cleanPhone) return;

    // Search in registered approved drivers
    const matched = drivers.find(
      (d) => d.phone.trim().replace(/[\s+]/g, '') === cleanPhone
    );

    if (matched) {
      // Driver IS registered: Welcome by name and request PIN / password
      setFoundDriverAuth(matched);
      setUnregisteredPhone('');
      if (matched.pin) {
        setAuthStep('pin_entry');
        setEnteredPin('');
      } else {
        // First time login for registered driver without PIN -> Send OTP Verification
        setIsForgotPinFlow(false);
        setAuthStep('otp_verification');
        await dispatchOtpMiddleware(matched.phone);
      }
    } else {
      // Driver IS NOT registered: Send SMS OTP to verify mobile first
      setFoundDriverAuth(null);
      setUnregisteredPhone(loginPhone);
      setIsForgotPinFlow(false);
      setAuthStep('otp_verification');
      await dispatchOtpMiddleware(loginPhone);
    }
  };

  const triggerSendOtp = async (phone: string) => {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setGeneratedOtp(code);
    setEnteredOtp('');
    setOtpTimer(60);
    setErrorMsg('');
    setSmsDispatchState('sending');

    const e164Phone = formatPhoneE164(phone);

    // 1. Instant server-side SMS gateway dispatch (< 1s execution)
    const serverSmsPromise = fetch('/api/send-sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code, language: portalLang })
    }).catch((err) => console.warn('Server SMS send warning:', err));

    // 2. Firebase Phone Auth SMS (runs asynchronously in background without blocking UI)
    const firebaseSmsPromise = (async () => {
      try {
        if ((window as any).driverRecaptchaVerifier) {
          try { (window as any).driverRecaptchaVerifier.clear(); } catch (e) {}
          (window as any).driverRecaptchaVerifier = null;
        }

        const verifier = new RecaptchaVerifier(auth, 'recaptcha-container-driver', {
          size: 'invisible',
          callback: () => {},
          'expired-callback': () => {
            if ((window as any).driverRecaptchaVerifier) {
              try { (window as any).driverRecaptchaVerifier.clear(); } catch (e) {}
              (window as any).driverRecaptchaVerifier = null;
            }
          }
        });
        (window as any).driverRecaptchaVerifier = verifier;

        const confirmationObj = await signInWithPhoneNumber(auth, e164Phone, verifier);
        setConfirmationResult(confirmationObj);
      } catch (err: any) {
        if ((window as any).driverRecaptchaVerifier) {
          try { (window as any).driverRecaptchaVerifier.clear(); } catch (e) {}
          (window as any).driverRecaptchaVerifier = null;
        }
        console.warn('Firebase Phone Auth async dispatch note:', err);
      }
    })();

    // Fast completion UI transition
    await Promise.race([serverSmsPromise, new Promise(res => setTimeout(res, 800))]);
    setSmsDispatchState('sent_gateway');
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!foundDriverAuth) return;

    if (enteredPin.trim() === foundDriverAuth.pin) {
      completeDriverLogin(foundDriverAuth);
    } else {
      setErrorMsg(
        isAr 
          ? 'رمز الدخول / كلمة المرور غير صحيحة. يرجى التأكد وإعادة المحاولة.' 
          : isUr
          ? 'پن یا پاس ورڈ غلط ہے۔ دوبارہ کوشش کریں۔'
          : 'Incorrect PIN / Password. Please check and try again.'
      );
    }
  };

  const handleForgotPinClick = () => {
    if (!foundDriverAuth) return;
    setIsForgotPinFlow(true);
    triggerSendOtp(foundDriverAuth.phone);
    setAuthStep('otp_verification');
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    const cleanCode = enteredOtp.trim();
    let isCodeValid = false;

    // 1. Check Firebase confirmation session if available
    if (confirmationResult) {
      try {
        await confirmationResult.confirm(cleanCode);
        isCodeValid = true;
      } catch (err: any) {
        console.warn('Firebase OTP confirm check:', err);
      }
    }

    // 2. Fallback check against server generated OTP code
    if (!isCodeValid && generatedOtp && cleanCode === generatedOtp) {
      isCodeValid = true;
    }

    setIsSubmitting(false);

    if (isCodeValid) {
      if (foundDriverAuth) {
        // Driver is registered -> move to set / reset PIN
        setAuthStep('set_pin');
        setNewPin('');
        setConfirmPin('');
      } else {
        // Driver is NOT registered -> move to 'not_registered' notice screen
        setAuthStep('not_registered');
      }
    } else {
      setErrorMsg(
        isAr 
          ? 'رمز التحقق (OTP) الذي أدخلته غير صحيح. يرجى التأكد وإعادة المحاولة.' 
          : isUr
          ? 'تصدیقی کوڈ (OTP) غلط ہے۔'
          : 'Invalid verification OTP code. Please check and try again.'
      );
    }
  };

  const handleSaveNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!newPin || newPin.length < 4) {
      setErrorMsg(
        isAr 
          ? 'الرجاء إدخال رمز دخول مكون من 4 أرقام على الأقل.' 
          : isUr
          ? 'براہ کرم کم از کم 4 ہندسوں کا پن درج کریں۔'
          : 'Please enter a PIN with at least 4 digits.'
      );
      return;
    }

    if (newPin !== confirmPin) {
      setErrorMsg(
        isAr 
          ? 'رمزا الدخول غير متطابقين. يرجى إعادة كتابتهما بدقة.' 
          : isUr
          ? 'پن کوڈز آپس میں نہیں ملتے ہیں۔'
          : 'PINs do not match. Please retype carefully.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      if (foundDriverAuth) {
        const driverRef = doc(db, 'drivers', foundDriverAuth.id);
        await updateDoc(driverRef, { pin: newPin });

        const updatedDriver = { ...foundDriverAuth, pin: newPin };
        setFoundDriverAuth(updatedDriver);

        setAuthStep('biometric_suggestion');
      }
    } catch (err) {
      console.error('Failed to update driver PIN:', err);
      setErrorMsg(
        isAr 
          ? 'تعذر حفظ كلمة المرور، يرجى المحاولة مرة أخرى.' 
          : isUr
          ? 'پاس ورڈ محفوظ نہیں ہو سکا۔ دوبارہ کوشش کریں۔'
          : 'Failed to update PIN, please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnableBiometrics = async () => {
    if (foundDriverAuth) {
      try {
        const vault = JSON.parse(localStorage.getItem('driver_biometric_vault') || '{}');
        vault[foundDriverAuth.phone.trim().replace(/[\s+]/g, '')] = {
          phone: foundDriverAuth.phone,
          pin: foundDriverAuth.pin || newPin,
          driverId: foundDriverAuth.id,
          name: foundDriverAuth.name,
          savedAt: new Date().toISOString()
        };
        localStorage.setItem('driver_biometric_vault', JSON.stringify(vault));

        await updateDoc(doc(db, 'drivers', foundDriverAuth.id), { biometricsEnabled: true });
        
        const updated = { ...foundDriverAuth, biometricsEnabled: true };
        completeDriverLogin(updated);
      } catch (err) {
        console.error('Biometric save error:', err);
        completeDriverLogin(foundDriverAuth);
      }
    }
  };

  const handleBiometricQuickLogin = () => {
    setErrorMsg('');
    try {
      const vault = JSON.parse(localStorage.getItem('driver_biometric_vault') || '{}');
      const cleanPhone = loginPhone.trim().replace(/[\s+]/g, '');
      
      let cred = vault[cleanPhone];
      if (!cred && Object.keys(vault).length > 0) {
        cred = Object.values(vault)[0] as any;
      }

      if (!cred) {
        setErrorMsg(
          isAr 
            ? 'لم يتم العثور على بصمة قائمة لهذا الجوال. يرجى الدخول بالرمز أولاً.' 
            : isUr
            ? 'اس موبائل کے لیے بائیو میٹرک تفصیلات نہیں ملیں۔'
            : 'No saved biometric profile found for this phone. Please login with PIN first.'
        );
        return;
      }

      const matched = drivers.find(
        (d) => d.phone.trim().replace(/[\s+]/g, '') === cred.phone.trim().replace(/[\s+]/g, '')
      );

      if (matched) {
        setLoginPhone(matched.phone);
        completeDriverLogin(matched);
      }
    } catch (err) {
      console.error('Biometric login failed:', err);
    }
  };

  const completeDriverLogin = (driver: Driver) => {
    setSelectedDriver(driver);
    localStorage.setItem('active_driver_profile', JSON.stringify(driver));
    setAuthStep('phone');
    setLoginPhone('');
    setEnteredPin('');
    setNewPin('');
    setConfirmPin('');
    setErrorMsg('');
  };

  // 3. Register a new driver profile (Pending Approval & Telegram dispatch)
  const handleRegisterDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    const doubleName = newDriverName.trim();
    const phoneNum = newDriverPhone.trim();
    const cleanIban = iban.trim();

    if (!doubleName || !phoneNum || !cleanIban) {
      setErrorMsg(isAr ? 'الرجاء تعبئة جميع الحقول المطلوبة بما في ذلك الحساب البنكي.' : 'Please fill all required fields including bank details.');
      return;
    }

    // Validate double name (at least two parts)
    const nameParts = doubleName.split(/\s+/);
    if (nameParts.length < 2) {
      setErrorMsg(isAr ? 'الرجاء إدخال اسمك الثنائي (الاسم الأول واسم العائلة).' : 'Please enter your double name (First name and Last name).');
      return;
    }

    if (!profileImg) {
      setErrorMsg(isAr ? 'الرجاء إرفاق صورتك الشخصية.' : 'Please upload your profile picture.');
      return;
    }

    if (!nationalIdImg) {
      setErrorMsg(isAr ? 'الرجاء إرفاق صورة الهوية الوطنية أو الإقامة.' : 'Please upload National ID or Iqama document.');
      return;
    }

    if (!licenseImg) {
      setErrorMsg(isAr ? 'الرجاء إرفاق صورة رخصة القيادة.' : 'Please upload your driving license.');
      return;
    }

    if (!carRegistrationImg) {
      setErrorMsg(isAr ? 'الرجاء إرفاق صورة الاستمارة لتأكيد طلبك.' : 'Please upload car registration image to verify your request.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // 1. Compress uploaded photos to tiny ~40KB JPEGs to prevent Firestore document size limit errors (1MB max) and fetch payload timeouts
      const [compProfile, compId, compLicense, compCarReg] = await Promise.all([
        compressImageDataUrl(profileImg, 600, 0.6),
        compressImageDataUrl(nationalIdImg, 600, 0.6),
        compressImageDataUrl(licenseImg, 600, 0.6),
        compressImageDataUrl(carRegistrationImg, 600, 0.6)
      ]);

      const pendingData = {
        name: doubleName,
        phone: phoneNum,
        profileImg: compProfile,
        nationalIdImg: compId,
        licenseImg: compLicense,
        carRegistrationImg: compCarReg,
        bankName,
        iban: cleanIban,
        bankAccountName: bankAccountName.trim() || doubleName,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      // 2. Race Firestore write with a 4s timeout to prevent hanging under quota or network glitch
      const writePromise = addDoc(collection(db, 'pending_drivers'), pendingData);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000));

      try {
        await Promise.race([writePromise, timeoutPromise]);
      } catch (dbErr) {
        console.warn('Firestore driver registration write timed out or failed, saving locally:', dbErr);
        try {
          const existingLocal = JSON.parse(localStorage.getItem('pending_drivers_local') || '[]');
          existingLocal.push(pendingData);
          localStorage.setItem('pending_drivers_local', JSON.stringify(existingLocal));
        } catch (e) {
          console.error('Failed to write to localStorage:', e);
        }
      }

      // 3. Dispatch Telegram Bot notification with 3s timeout signal so it never blocks registration
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        await fetch('/api/notify-driver-registration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: doubleName,
            phone: phoneNum,
            carRegistrationImg: compCarReg,
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
      } catch (teleErr) {
        console.warn('Failed to dispatch telegram notification (non-blocking):', teleErr);
      }

      // Show success window
      setRegistrationSuccessMsg(
        isAr 
          ? 'تم استلام طلب التقديم كاملاً وبانتظار الموافقة وسيتم إبلاغكم بالموافقة في أقرب وقت من قبل الإدارة'
          : 'Your application has been received and is awaiting approval. You will be notified of the approval as soon as possible by the administration.'
      );

      // Clear fields
      setNewDriverName('');
      setNewDriverPhone('');
      setProfileImg('');
      setNationalIdImg('');
      setLicenseImg('');
      setCarRegistrationImg('');
      setIban('');
      setShowRegisterForm(false);
    } catch (err) {
      console.error('Failed to submit driver registration:', err);
      setErrorMsg(isAr ? 'عذراً، فشل إرسال طلب التسجيل. يرجى المحاولة لاحقاً.' : 'Failed to submit registration request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Update Driver Status
  const handleToggleDriverStatus = async () => {
    if (!selectedDriver) return;
    const nextStatus = selectedDriver.status === 'available' ? 'busy' : 'available';

    // Optimistic local state and storage updates for instantaneous response
    const updatedDriver = { ...selectedDriver, status: nextStatus as 'available' | 'busy' };
    setSelectedDriver(updatedDriver);
    localStorage.setItem('active_driver_profile', JSON.stringify(updatedDriver));

    try {
      await updateDoc(doc(db, 'drivers', selectedDriver.id), { status: nextStatus });
    } catch (err) {
      console.warn('Firestore driver status sync warning (quota or offline):', err);
    }
  };

  // 5. Pick up/Accept an order
  const handleAcceptOrder = async (orderId: string) => {
    if (!selectedDriver) return;

    if (activeDeliveries.length >= 2) {
      alert(isAr 
        ? 'عذراً، لقد استوفيت الحد الأقصى للطلبات النشطة في نفس الوقت (طلبين كحد أقصى)! يرجى تسليم طلبياتك الحالية أولاً.' 
        : 'Sorry, you have reached the maximum limit of active orders at the same time (2 orders max)! Please deliver your current orders first.');
      return;
    }

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        driverId: selectedDriver.id,
        driverName: selectedDriver.name,
        driverPhone: selectedDriver.phone,
        status: 'driver_assigned', // set to driver_assigned instead of on_the_way immediately!
      });

      // Automatically trigger WhatsApp notify on self-acceptance too!
      const order = unassignedDeliveries.find(o => o.id === orderId);
      if (order) {
        const waLink = getWhatsAppLink({
          ...order,
          driverId: selectedDriver.id,
          driverName: selectedDriver.name,
          driverPhone: selectedDriver.phone,
          status: 'driver_assigned'
        }, 'driver_assigned');
        window.open(waLink, '_blank');
      }
    } catch (err) {
      console.error('Failed to accept order:', err);
    }
  };

  // 5b. Reject/refuse an order (24h ban penalty)
  const handleRejectOrder = async (orderId: string) => {
    if (!selectedDriver) return;

    const confirmReject = window.confirm(
      isAr 
        ? 'تحذير هام: هل أنت متأكد من رفض هذا الطلب؟ رفض الطلبيات يؤدي إلى إيقاف حسابك تلقائياً لمدة 24 ساعة ومنعك من استقبال الطلبات.' 
        : 'Crucial Warning: Are you sure you want to reject this order? Rejecting orders will automatically suspend your account for 24 hours.'
    );

    if (!confirmReject) return;

    try {
      const suspensionDuration = 24 * 60 * 60 * 1000; // 24 hours
      const suspendedUntil = new Date(Date.now() + suspensionDuration).toISOString();

      // Update in database
      await updateDoc(doc(db, 'drivers', selectedDriver.id), {
        status: 'suspended',
        suspendedUntil: suspendedUntil
      });

      // Update local state and local storage immediately
      const updated = {
        ...selectedDriver,
        status: 'suspended' as any,
        suspendedUntil: suspendedUntil
      };
      setSelectedDriver(updated);
      localStorage.setItem('active_driver_profile', JSON.stringify(updated));

      alert(
        isAr 
          ? 'تم إيقاف حسابك مؤقتاً لمدة 24 ساعة بسبب رفض الطلب.' 
          : 'Your account has been suspended for 24 hours due to rejecting the order.'
      );
    } catch (err) {
      console.error('Failed to suspend driver:', err);
    }
  };

  // 6. Transition Order Status
  const handleUpdateOrderStatus = async (orderId: string, nextStatus: 'driver_picked_up' | 'on_the_way' | 'delivered') => {
    try {
      if (nextStatus === 'delivered') {
        const order = activeDeliveries.find(o => o.id === orderId);
        
        // Optimistically clear locally first
        setActiveDeliveries(prev => prev.filter(o => o.id !== orderId));

        // Open WhatsApp with delivered notification
        if (order) {
          const waLink = getWhatsAppLink(order, 'delivered');
          window.open(waLink, '_blank');
        }

        // Update driver completed count & earnings locally
        if (selectedDriver) {
          const orderFee = order?.deliveryFee || 15;
          const currentCount = selectedDriver.completedCount || 0;
          const currentEarnings = selectedDriver.totalEarnings || 0;
          const newCount = currentCount + 1;
          const newEarnings = currentEarnings + orderFee;

          const updated = {
            ...selectedDriver,
            completedCount: newCount,
            totalEarnings: newEarnings
          };
          setSelectedDriver(updated);
          localStorage.setItem('active_driver_profile', JSON.stringify(updated));

          try {
            await updateDoc(doc(db, 'drivers', selectedDriver.id), {
              completedCount: newCount,
              totalEarnings: newEarnings
            });
          } catch (err) {
            console.warn('Driver profile Firestore sync error (quota or offline):', err);
          }
        }

        // Delete order from Firestore directly
        try {
          await deleteDoc(doc(db, 'orders', orderId));
        } catch (err) {
          console.warn('Order delete Firestore sync error (quota or offline):', err);
        }
      } else {
        // Optimistically update order status locally
        setActiveDeliveries(prev => prev.map(o => o.id === orderId ? { ...o, status: nextStatus } : o));

        const order = activeDeliveries.find(o => o.id === orderId);
        if (order) {
          const waLink = getWhatsAppLink(order, nextStatus);
          window.open(waLink, '_blank');
        }

        try {
          const updateData: Partial<Order> = { status: nextStatus };
          await updateDoc(doc(db, 'orders', orderId), updateData);
        } catch (err) {
          console.warn('Order update Firestore sync error (quota or offline):', err);
        }
      }
    } catch (err) {
      console.error('Failed to update order status:', err);
    }
  };

  // 7. Clear Selected Profile
  const handleLogout = () => {
    setSelectedDriver(null);
    localStorage.removeItem('active_driver_profile');
  };

  // Helper to generate Google Maps link
  const getMapsLink = (order: Order) => {
    if (order.latitude && order.longitude) {
      return `https://www.google.com/maps/search/?api=1&query=${order.latitude},${order.longitude}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.deliveryAddress || '')}`;
  };

  // Helper to generate WhatsApp link
  const getWhatsAppLink = (order: Order, customStatus?: string) => {
    let cleanedPhone = order.customerPhone.replace(/\D/g, ''); // Keep only digits
    if (cleanedPhone.startsWith('00966')) {
      cleanedPhone = cleanedPhone.substring(2);
    }
    if (cleanedPhone.startsWith('96605')) {
      cleanedPhone = '966' + cleanedPhone.substring(4);
    }
    if (cleanedPhone.startsWith('05') && cleanedPhone.length === 10) {
      cleanedPhone = '966' + cleanedPhone.substring(1);
    } else if (cleanedPhone.startsWith('5') && cleanedPhone.length === 9) {
      cleanedPhone = '966' + cleanedPhone;
    } else if (cleanedPhone.startsWith('005') && cleanedPhone.length === 11) {
      cleanedPhone = '966' + cleanedPhone.substring(2);
    }

    const activeStatus = customStatus || order.status;
    const driverName = selectedDriver?.name || order.driverName || 'المندوب';
    const restNameAr = businessSettings?.restaurantNameAr || 'رحلة شواء';
    const restNameEn = businessSettings?.restaurantNameEn || 'Grill Journey';

    let textAr = '';
    let textEn = '';

    if (activeStatus === 'driver_assigned') {
      textAr = `أهلاً بك يا ${order.customerName || 'العميل'} 🌸 تم قبول طلبك وجاري تجهيزه للاستلام! معك كابتن التوصيل *${driverName}* لـ *${restNameAr}*. رقم الطلب: *${order.id}* 🚴`;
      textEn = `Hi ${order.customerName || 'Customer'} 🌸 Your order has been accepted by delivery captain *${driverName}* from *${restNameEn}*. Order ID: *${order.id}* 🚴`;
    } else if (activeStatus === 'driver_picked_up') {
      textAr = `أهلاً بك يا ${order.customerName || 'العميل'} 🌸 معك الكابتن *${driverName}*. لقد تم استلام طلبك رقم *${order.id}* من المطعم طازجاً وساخناً وهو الآن في الطريق إليك! 🚴 يرجى تزويدي بموقعك عبر الواتساب لتسهيل التوصيل السريع.`;
      textEn = `Hi ${order.customerName || 'Customer'} 🌸 This is captain *${driverName}*. I have picked up your order *${order.id}* and I am on my way to you! 🚴`;
    } else if (activeStatus === 'on_the_way') {
      textAr = `أهلاً بك يا ${order.customerName || 'العميل'} 🌸 معك الكابتن *${driverName}*. لقد وصلت إلى موقعك الآن! 📍 يرجى الاستعداد لاستلام طلبك الساخن.`;
      textEn = `Hi ${order.customerName || 'Customer'} 🌸 This is captain *${driverName}*. I have arrived at your location! 📍 Please prepare to receive your hot order.`;
    } else { // default or delivered
      textAr = `أهلاً بك يا ${order.customerName || 'العميل'} 🌸 معك الكابتن *${driverName}*. تم تسليم طلبك رقم *${order.id}* بنجاح! بالصحة والعافية ونتمنى لك وجبة شهية وعشاءً ممتعاً. نتشرف بخدمتكم! 🌸`;
      textEn = `Hi ${order.customerName || 'Customer'} 🌸 This is captain *${driverName}*. Your order *${order.id}* has been successfully delivered! Bon appétit! 🌸`;
    }

    const msg = isAr ? textAr : textEn;
    return `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(msg)}`;
  };

  // Stats calculation
  const totalCompleted = selectedDriver?.completedCount || 0;
  const estimatedEarnings = selectedDriver?.totalEarnings || 0;

  return (
    <div id="driver-portal-container" className="space-y-6 max-w-4xl mx-auto">
      
      {/* Title Header with Icon & 3-Language Toggle */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-black/5 pb-4">
        <div className="text-start space-y-1">
          <div className="flex items-center gap-2 text-yellow-600 text-xs font-bold leading-snug flex-wrap">
            <Truck className="w-4 h-4 text-yellow shrink-0" />
            <span>
              {isAr ? 'نظام تتبع وإدارة لوجستية للمناديب' : isUr ? 'ڈرائیور ڈسپچ اور لوجسٹک ٹریکنگ سسٹم' : 'Driver Logistics & Realtime Dispatch'}
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-serif font-bold text-dark tracking-tight leading-tight">
            {isAr ? 'بوابة كابتن التوصيل 🚴' : isUr ? 'ڈلیوری کپتان پورٹل 🚴' : 'Delivery Captain Portal 🚴'}
          </h2>
        </div>

        {/* 3-Language Selector Bar */}
        <div className="flex items-center gap-1 bg-neutral-900 p-1.5 rounded-2xl shadow-xs border border-neutral-800 self-stretch sm:self-auto justify-center">
          <button
            type="button"
            onClick={() => setPortalLang('ar')}
            className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
              isAr ? 'bg-amber-400 text-slate-950 shadow-xs scale-105' : 'text-neutral-400 hover:text-white'
            }`}
          >
            🇸🇦 العربية
          </button>
          <button
            type="button"
            onClick={() => setPortalLang('en')}
            className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
              isEn ? 'bg-amber-400 text-slate-950 shadow-xs scale-105' : 'text-neutral-400 hover:text-white'
            }`}
          >
            🇬🇧 English
          </button>
          <button
            type="button"
            onClick={() => setPortalLang('ur')}
            className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
              isUr ? 'bg-amber-400 text-slate-950 shadow-xs scale-105' : 'text-neutral-400 hover:text-white'
            }`}
          >
            🇵🇰 اردو
          </button>
        </div>

        {selectedDriver && (
          <button
            onClick={handleLogout}
            className="text-[11px] font-black text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/50 px-3 py-1.5 rounded-xl cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            {isAr ? 'تغيير الحساب 👤' : isUr ? 'پروفائل تبدیل کریں 👤' : 'Change Profile 👤'}
          </button>
        )}
      </div>

      {/* PWA Standalone Driver App Banner (مناديب رحلة شواء) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white border border-amber-500/30 rounded-3xl p-4 sm:p-5 shadow-lg space-y-3 text-start">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              <img 
                src="/driver-icon.jpg?v=2" 
                alt="مناديب رحلة شواء" 
                referrerPolicy="no-referrer"
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl object-cover border-2 border-amber-400/80 shadow-md"
              />
              <span className="absolute -bottom-1 -end-1 bg-amber-400 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full border border-slate-900 whitespace-nowrap">
                PWA
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-base sm:text-lg text-white leading-snug">
                  {isAr ? 'مناديب رحلة شواء 🛵' : 'Grill Journey Drivers 🛵'}
                </h3>
                <span className="bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
                  {isAr ? 'تطبيق مستقل' : 'Standalone App'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                {isAr 
                  ? 'قم بتثبيت تطبيق المناديب على شاشة جوالك الرئيسية ليفتح معك مباشرة على لوحة الكابتن.' 
                  : 'Install the Drivers App on your home screen to launch directly into the Captain Portal.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleInstallDriverApp}
              className="flex-1 sm:flex-none py-2.5 px-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all transform active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Smartphone className="w-4 h-4 text-slate-950 shrink-0" />
              <span>{isAr ? 'تثبيت تطبيق المناديب 📱' : 'Install Driver App 📱'}</span>
            </button>

            <button
              onClick={handleCopyDriverUrl}
              className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              title={isAr ? 'نسخ رابط تطبيق المناديب المباشر' : 'Copy Direct Driver Portal Link'}
            >
              {copiedDriverUrl ? <Check className="w-4 h-4 text-emerald-400 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
              <span>{copiedDriverUrl ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ الرابط' : 'Copy Link')}</span>
            </button>
          </div>
        </div>

        {/* Step-by-Step Installation Modal/Guide */}
        {showInstallGuide && (
          <div className="pt-3 mt-3 border-t border-slate-700/60 text-xs text-slate-300 space-y-2 bg-slate-950/50 p-3.5 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between text-amber-300 font-bold text-xs">
              <span className="flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 shrink-0" />
                <span>{isAr ? 'خطوات إضافة تطبيق (مناديب رحلة شواء) على الجوال:' : 'How to install (Grill Journey Drivers) App:'}</span>
              </span>
              <button onClick={() => setShowInstallGuide(false)} className="text-slate-400 hover:text-white shrink-0 p-1">✕</button>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-[11px] leading-relaxed">
              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                <p className="font-bold text-amber-400 mb-1">📱 أجهزة الآيفون (iPhone / Safari):</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>افتح هذا الرابط أو اضغط زر (نسخ الرابط) بالأعلى في متصفح Safari.</li>
                  <li>اضغط على زر المشاركة أسفل الشاشة <span className="font-mono bg-slate-800 px-1 rounded">⎘ Share</span>.</li>
                  <li>اختر <span className="font-bold text-white font-mono bg-slate-800 px-1 rounded">الإضافة إلى الشاشة الرئيسية ➕</span>.</li>
                  <li>اضغط (إضافة) وسيظهر التطبيق باسم <b>مناديب رحلة شواء</b>.</li>
                </ol>
              </div>

              <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                <p className="font-bold text-emerald-400 mb-1">🤖 أجهزة الأندرويد (Android / Chrome):</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>اضغط على زر التثبيت بالأعلى أو خيارات المتصفح <span className="font-mono bg-slate-800 px-1 rounded">⋮</span>.</li>
                  <li>اختر <span className="font-bold text-white font-mono bg-slate-800 px-1 rounded">التثبيت كـ تطبيق 📲</span> أو (إضافة للشاشة الرئيسية).</li>
                  <li>سيتحمل التطبيق مباشرة على جوالك وتستطيع فتحه كـ تطبيق مستقل بضغطة واحدة!</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profile Selector / Register view */}
      {!selectedDriver ? (
        <div className="bg-white border border-black/5 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-start max-w-xl mx-auto animate-fade-in">
          
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-black/5 pb-4">
            <div className="w-12 h-12 bg-yellow/10 text-yellow-700 rounded-2xl flex items-center justify-center shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-dark">
                {isAr ? 'بوابة كابتن التوصيل 🚴' : 'Delivery Captain Portal 🚴'}
              </h3>
              <p className="text-xs text-dark/50 mt-0.5">
                {isAr 
                  ? 'سجل دخولك برقم جوالك لتلقي الطلبات وإتمام خطوات التوصيل.' 
                  : 'Enter your mobile number to sign in, receive route assignments, and deliver.'}
              </p>
            </div>
          </div>

          {/* Invisible reCAPTCHA container for Firebase Phone Authentication */}
          <div id="recaptcha-container-driver"></div>

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-rose-50 border border-rose-200/50 text-rose-700 rounded-xl p-3 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Application Popup State */}
          {registrationSuccessMsg ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-4">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-extrabold text-sm text-emerald-800">
                {isAr ? 'تم إرسال طلبك بنجاح!' : 'Application Submitted Successfully!'}
              </h4>
              <p className="text-xs text-emerald-700 leading-relaxed font-medium">
                {registrationSuccessMsg}
              </p>
              <button
                type="button"
                onClick={() => setRegistrationSuccessMsg('')}
                className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                {isAr ? 'حسناً، فهمت 👍' : 'OK, Understood 👍'}
              </button>
            </div>
          ) : !showRegisterForm ? (
            /* MULTI-STEP DRIVER AUTHENTICATION FORM */
            <div>
              {/* STEP 1: PHONE NUMBER ENTRY */}
              {authStep === 'phone' && (
                <form onSubmit={handleCheckPhone} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-dark/70 block">
                      {isAr ? 'أدخل رقم جوالك المسجل بالسيستم:' : isUr ? 'اپنا رجسٹرڈ موبائل نمبر درج کریں:' : 'Enter your registered mobile number:'}
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark/40 text-xs font-bold">
                        📞
                      </span>
                      <input
                        type="tel"
                        required
                        placeholder="05xxxxxxxx"
                        value={loginPhone}
                        onChange={(e) => setLoginPhone(e.target.value)}
                        className="w-full bg-neutral-50 text-dark border border-black/10 rounded-xl pl-9 pr-4 py-3 outline-none focus:border-yellow focus:bg-white text-xs text-start font-mono font-bold transition-all shadow-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoggingIn || isSendingOtp}
                    className="w-full py-3.5 px-4 bg-yellow hover:bg-yellow-500 disabled:opacity-60 text-black font-black text-xs rounded-xl transition-all cursor-pointer text-center shadow-md uppercase tracking-wider flex items-center justify-center gap-2 transform active:scale-98"
                  >
                    {isLoggingIn || isSendingOtp ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-black" />
                        <span>{isAr ? 'جاري الإرسال...' : isUr ? 'بھیجا جا رہا ہے...' : 'Sending...'}</span>
                      </>
                    ) : (
                      <span>{isAr ? 'تأكيد ودخول الكابتن 🚴' : isUr ? 'ڈلیوری کپتان لاگ ان 🚴' : 'Delivery Login 🚴'}</span>
                    )}
                  </button>

                  {/* Quick Biometric Login Option if vault has saved profile */}
                  {hasBiometricSaved && (
                    <button
                      type="button"
                      onClick={handleBiometricQuickLogin}
                      className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                    >
                      <Fingerprint className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>
                        {isAr ? 'الدخول السريع ببصمة الوجه / الإصبع 👆' : isUr ? 'فیس آئی ڈی / فنگر پرنٹ سے سائن ان 👆' : 'Face ID / Touch ID Quick Login 👆'}
                      </span>
                    </button>
                  )}

                  <div className="pt-4 border-t border-black/5 text-center space-y-1.5">
                    <p className="text-xs text-dark/50">
                      {isAr ? 'هل أنت مندوب جديد وترغب بالانضمام إلينا؟' : isUr ? 'کیا آپ نئے ڈرائیور ہیں؟' : 'Are you a new captain wanting to join us?'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMsg('');
                        setShowRegisterForm(true);
                      }}
                      className="text-xs font-black text-yellow-600 hover:text-yellow-700 hover:underline cursor-pointer"
                    >
                      {isAr ? '🚴 للتسجيل تقديم طلب جديد' : isUr ? '🚴 نیا اکاؤنٹ رجسٹر کریں' : '🚴 Click Here to Register'}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 2: PIN ENTRY (FOR REGISTERED DRIVERS) */}
              {authStep === 'pin_entry' && (
                <form onSubmit={handleVerifyPin} className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 flex items-center gap-3">
                    <div className="w-11 h-11 bg-amber-400 text-slate-950 font-black rounded-xl flex items-center justify-center shrink-0 text-base shadow-xs">
                      {foundDriverAuth?.name.charAt(0) || '🚴'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-amber-700">
                        {isAr ? 'أهلاً وسهلاً بعودتك 👋' : 'Welcome back 👋'}
                      </p>
                      <h4 className="font-extrabold text-xs text-dark leading-snug">
                        {isAr ? `مرحباً بك يا ${foundDriverAuth?.name}!` : `Welcome, ${foundDriverAuth?.name}!`}
                      </h4>
                      <p className="text-[10px] text-dark/50 font-mono mt-0.5">{foundDriverAuth?.phone}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAuthStep('phone')}
                      className="text-[10px] font-bold text-amber-700 hover:underline shrink-0 bg-amber-100 px-2 py-1 rounded-md"
                    >
                      {isAr ? 'تغيير الرقم' : isUr ? 'نمبر تبدیل کریں' : 'Change Phone'}
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-dark/70 block">
                        {isAr ? 'يرجى إدخال كلمة المرور / رمز الدخول (PIN):' : isUr ? 'پن کوڈ / پاس ورڈ درج کریں (4 ہندسے):' : 'Enter PIN / Password (4 Digits):'}
                      </label>
                      <button
                        type="button"
                        onClick={handleForgotPinClick}
                        className="text-[11px] font-black text-rose-600 hover:text-rose-700 hover:underline"
                      >
                        {isAr ? 'نسيت كلمة المرور؟' : isUr ? 'پاس ورڈ بھول گئے؟' : 'Forgot PIN?'}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark/40 shrink-0" />
                      <input
                        type="password"
                        required
                        maxLength={6}
                        placeholder="••••"
                        value={enteredPin}
                        onChange={(e) => setEnteredPin(e.target.value)}
                        className="w-full bg-neutral-50 text-dark border border-black/10 rounded-xl pl-9 pr-4 py-3 outline-none focus:border-yellow focus:bg-white text-sm text-start font-mono font-bold tracking-widest transition-all shadow-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3.5 px-4 bg-yellow hover:bg-yellow-500 text-black font-black text-xs rounded-xl transition-all cursor-pointer text-center shadow-md uppercase tracking-wider flex items-center justify-center gap-2 transform active:scale-98"
                  >
                    <Lock className="w-4 h-4 text-slate-950 shrink-0" />
                    <span>{isAr ? 'تأكيد كلمة المرور والدخول 🔒' : isUr ? 'لاگ ان کریں 🔒' : 'Verify Password & Sign In 🔒'}</span>
                  </button>

                  {/* Biometric Quick Option */}
                  {hasBiometricSaved && (
                    <button
                      type="button"
                      onClick={handleBiometricQuickLogin}
                      className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-amber-300 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Fingerprint className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>{isAr ? 'الدخول السريع ببصمة الجوال 👆' : isUr ? 'بائیو میٹرک لاگ ان 👆' : 'Biometric Quick Login 👆'}</span>
                    </button>
                  )}
                </form>
              )}

              {/* STEP 3: OTP VERIFICATION */}
              {authStep === 'otp_verification' && (
                <form onSubmit={handleVerifyOtp} className="space-y-4 animate-fade-in">
                  <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 text-center space-y-1 shadow-xs">
                    <div className="flex items-center justify-center gap-2 text-emerald-800 font-extrabold text-sm">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>{isAr ? 'تم إرسال الرمز بنجاح ✓' : 'Code Sent Successfully ✓'}</span>
                    </div>
                    <p className="text-xs font-mono text-emerald-950 font-bold dir-ltr">
                      {foundDriverAuth?.phone || unregisteredPhone || loginPhone}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-dark/70 block">
                      {isAr ? 'أدخل رمز التحقق المرسل لجوالك (6 أرقام):' : isUr ? '6 ہندسوں کا تصدیقی کوڈ درج کریں:' : 'Enter 6-Digit SMS Code:'}
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={6}
                      placeholder="••••••"
                      value={enteredOtp}
                      onChange={(e) => setEnteredOtp(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-neutral-50 text-dark border border-black/10 rounded-xl px-4 py-3.5 outline-none focus:border-yellow focus:bg-white text-lg text-center font-mono font-black tracking-widest shadow-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || enteredOtp.length < 6}
                    className="w-full py-3.5 px-4 bg-yellow hover:bg-yellow-500 disabled:opacity-50 text-black font-black text-xs rounded-xl transition-all cursor-pointer text-center shadow-md uppercase tracking-wider flex items-center justify-center gap-2 transform active:scale-98"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin shrink-0 text-black" />
                    ) : (
                      <span>{isAr ? 'تأكيد الرمز والانتقال للتالي ➔' : isUr ? 'کوڈ کی تصدیق کریں ➔' : 'Verify Code & Proceed ➔'}</span>
                    )}
                  </button>

                  <div className="flex items-center justify-between pt-2 border-t border-black/5 text-xs">
                    {otpTimer > 0 ? (
                      <span className="text-dark/50 font-mono font-bold">
                        {isAr ? `إعادة إرسال الرمز خلال (${otpTimer} ثانية)` : isUr ? `دوبارہ بھیجیں (${otpTimer}s)` : `Resend code in (${otpTimer}s)`}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isSendingOtp || isLoggingIn}
                        onClick={() => dispatchOtpMiddleware(foundDriverAuth?.phone || unregisteredPhone || loginPhone, true)}
                        className="font-black text-yellow-600 hover:text-yellow-700 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        {isSendingOtp ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>{isAr ? 'جاري الإرسال...' : isUr ? 'بھیجا جا رہا ہے...' : 'Sending...'}</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                            <span>{isAr ? 'إعادة إرسال رمز التحقق الآن 🔄' : isUr ? 'دوبارہ کوڈ بھیجیں 🔄' : 'Resend Verification Code 🔄'}</span>
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setAuthStep('phone')}
                      className="text-dark/50 hover:text-dark font-bold underline cursor-pointer"
                    >
                      {isAr ? 'إلغاء والعودة' : isUr ? 'منسوخ کریں' : 'Cancel'}
                    </button>
                  </div>
                </form>
              )}

              {/* STEP 4: UNREGISTERED DRIVER NOTICE & REGISTRATION LINK */}
              {authStep === 'not_registered' && (
                <div className="space-y-4 animate-fade-in bg-amber-50/90 border border-amber-200/80 rounded-2xl p-5 text-start shadow-xs">
                  <div className="flex items-center gap-3 border-b border-amber-200/80 pb-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-800 rounded-xl flex items-center justify-center shrink-0 font-bold">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-xs text-emerald-800 flex items-center gap-1">
                        <span>{isAr ? 'تم التحقق من رقم الجوال بنجاح ✅' : 'Mobile Number Verified ✅'}</span>
                      </h4>
                      <p className="text-xs font-mono text-dark/70 font-bold mt-0.5">
                        {unregisteredPhone || loginPhone}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 text-xs leading-relaxed font-medium">
                    <div className="bg-rose-50 border border-rose-200/80 text-rose-800 p-3.5 rounded-xl font-bold flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>
                        {isAr 
                          ? 'عذراً، هذا الرقم غير مسجل لدينا في قائمة المناديب المعتمدين.' 
                          : isUr
                          ? 'معذرت، یہ نمبر ہمارے پاس رجسٹرڈ ڈرائیورز کی فہرست میں نہیں ہے۔'
                          : 'Sorry, this mobile number is not registered in our approved drivers list.'}
                      </span>
                    </div>

                    <p className="text-dark/80 font-bold pt-1 text-center">
                      {isAr 
                        ? 'هل ترغب بالانضمام والتسجيل كـ كابتن توصيل جديد في رحلات الشواء؟' 
                        : isUr
                        ? 'کیا آپ نیا ڈرائیور اکاؤنٹ بنانا چاہتے ہیں؟'
                        : 'Would you like to apply as a new Delivery Captain with Grill Journey?'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setNewDriverPhone(unregisteredPhone || loginPhone);
                      setShowRegisterForm(true);
                      setAuthStep('phone');
                    }}
                    className="w-full py-3.5 px-4 bg-yellow hover:bg-yellow-500 text-black font-black text-xs rounded-xl transition-all cursor-pointer text-center shadow-md flex items-center justify-center gap-2 transform active:scale-98"
                  >
                    <UserPlus className="w-4.5 h-4.5 shrink-0" />
                    <span>{isAr ? 'اضغط هنا للتقديم والتسجيل كمندوب جديد 🚴' : isUr ? 'نئے ڈرائیور کے طور پر رجسٹر ہوں 🚴' : 'Click Here to Apply & Register as New Driver 🚴'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthStep('phone')}
                    className="w-full py-2.5 text-center text-xs font-bold text-dark/60 hover:text-dark hover:underline cursor-pointer block"
                  >
                    {isAr ? 'العودة لتجربة رقم جوال آخر ↩️' : 'Try Another Phone Number ↩️'}
                  </button>
                </div>
              )}

              {/* STEP 4: CREATE / RESET PIN */}
              {authStep === 'set_pin' && (
                <form onSubmit={handleSaveNewPin} className="space-y-4 animate-fade-in">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-start space-y-1">
                    <div className="flex items-center gap-2 text-emerald-800 font-extrabold text-xs">
                      <Key className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{isAr ? 'تعيين رمز الدخول الخاص بك 🔑' : isUr ? 'نیا پن سیٹ کریں 🔑' : 'Set Your Personal Entry PIN 🔑'}</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 leading-relaxed font-medium">
                      {isAr 
                        ? 'قم بإنشاء رمز دخول مكون من 4 أرقام ليتسنى لك تسجيل الدخول مباشرة بدون الحاجة لانتظار رمز تحقق في الزيارات القادمة:' 
                        : isUr
                        ? 'آئندہ آسان لاگ ان کے لیے 4 ہندسوں کا نیا پن سیٹ کریں:'
                        : 'Create a 4-digit PIN for seamless future access without waiting for OTP:'}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-dark/70 block">
                        {isAr ? 'رمز الدخول الجديد (4 أرقام):' : isUr ? 'نیا پن کوڈ (4 ہندسے):' : 'New 4-Digit PIN:'}
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={6}
                        placeholder="••••"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        className="w-full bg-neutral-50 text-dark border border-black/10 rounded-xl px-4 py-3 outline-none focus:border-yellow focus:bg-white text-sm text-start font-mono font-bold tracking-widest shadow-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-dark/70 block">
                        {isAr ? 'تأكيد رمز الدخول الجديد:' : isUr ? 'نیا پن دوبارہ درج کریں:' : 'Confirm New PIN:'}
                      </label>
                      <input
                        type="password"
                        required
                        maxLength={6}
                        placeholder="••••"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        className="w-full bg-neutral-50 text-dark border border-black/10 rounded-xl px-4 py-3 outline-none focus:border-yellow focus:bg-white text-sm text-start font-mono font-bold tracking-widest shadow-xs"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer text-center shadow-md uppercase tracking-wider flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4 text-slate-950 shrink-0" />
                    <span>{isSubmitting ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ كلمة المرور والدخول 🔒' : isUr ? 'پن محفوظ کریں 🔒' : 'Save PIN & Sign In 🔒')}</span>
                  </button>
                </form>
              )}

              {/* STEP 5: BIOMETRIC SAVING SUGGESTION PROMPT */}
              {authStep === 'biometric_suggestion' && (
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-amber-500/30 rounded-3xl p-6 text-white text-start space-y-5 animate-fade-in shadow-xl">
                  <div className="w-14 h-14 bg-amber-400/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-400/30">
                    <Fingerprint className="w-7 h-7" />
                  </div>

                  <div className="space-y-2">
                    <h4 className="font-extrabold text-base text-amber-300">
                      {isAr ? 'حفظ كلمة المرور وتفعيل البصمة 👆' : isUr ? 'فیس آئی ڈی / فنگر پرنٹ محفوظ کریں 👆' : 'Save Credentials & Enable Face ID / Touch ID 👆'}
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      {isAr 
                        ? 'هل ترغب بتفعيل الدخول السريع ببصمة الوجه أو الأصبع (Face ID / Touch ID / رمز الدخول للجوال) ليتم ملء رقم الجوال وتأكيد دخولك بنقرة واحدة وبسرعة فائقة؟' 
                        : isUr
                        ? 'کیا آپ آئندہ فیس آئی ڈی یا فنگر پرنٹ بائیو میٹرک سے 1 کلک سائن ان فعال کرنا چاہتے ہیں؟'
                        : 'Would you like to enable Face ID / Touch ID quick login to sign in seamlessly with 1-click on future visits?'}
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleEnableBiometrics}
                      className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-black text-xs rounded-xl transition-all cursor-pointer shadow-md flex items-center justify-center gap-2 transform active:scale-95"
                    >
                      <Fingerprint className="w-4 h-4 text-slate-950 shrink-0" />
                      <span>{isAr ? 'تفعيل البصمة وحفظ البيانات 🔒' : isUr ? 'بائیو میٹرک فعال کریں 🔒' : 'Enable Biometrics & Save 🔒'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => foundDriverAuth && completeDriverLogin(foundDriverAuth)}
                      className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                    >
                      {isAr ? 'تخطي والمتابعة الآن ➔' : isUr ? 'بعد میں کریں ➔' : 'Skip & Continue ➔'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* DRIVER REGISTRATION FORM */
            <form onSubmit={handleRegisterDriver} className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark/60 block">
                    {isAr ? 'الاسم الثنائي الكامل:' : 'Full Double Name:'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={isAr ? 'الاسم' : 'Name'}
                    value={newDriverName}
                    onChange={(e) => setNewDriverName(e.target.value)}
                    className="w-full bg-neutral-50 text-dark border border-black/5 rounded-xl px-4 py-3 outline-none focus:border-yellow focus:bg-white text-xs text-start font-bold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark/60 block">
                    {isAr ? 'رقم الجوال:' : 'Mobile Number:'}
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder={isAr ? '05xxxxxxxx' : '05xxxxxxxx'}
                    value={newDriverPhone}
                    onChange={(e) => setNewDriverPhone(e.target.value)}
                    className="w-full bg-neutral-50 text-dark border border-black/5 rounded-xl px-4 py-3 outline-none focus:border-yellow focus:bg-white text-xs text-start font-mono font-bold"
                  />
                </div>

                {/* Profile Picture Upload (الصورة الشخصية) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark/60 block">
                    {isAr ? 'الصورة الشخصية:' : 'Profile Picture:'}
                  </label>
                  {profileImg ? (
                    <div className="border border-black/10 rounded-2xl p-3 bg-neutral-50 space-y-2 text-center">
                      <div className="relative inline-block mx-auto max-w-[200px]">
                        <img 
                          src={profileImg} 
                          alt="Profile preview" 
                          className="rounded-xl max-h-32 object-contain mx-auto border border-black/5"
                        />
                        <button
                          type="button"
                          onClick={() => setProfileImg('')}
                          className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-xs hover:bg-rose-700 cursor-pointer text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[10px] text-dark/40 font-bold">{isAr ? 'تم تحميل الصورة الشخصية' : 'Profile picture loaded'}</p>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-black/10 rounded-2xl p-3 bg-neutral-50 text-center hover:bg-neutral-100/50 transition-colors cursor-pointer relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setProfileImg(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        required
                      />
                      <div className="space-y-1 pointer-events-none">
                        <div className="text-lg">👤</div>
                        <p className="text-[11px] font-extrabold text-dark/70">
                          {isAr ? 'اضغط لإرفاق صورتك الشخصية' : 'Click to attach profile picture'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* National ID / Iqama Upload (الهوية الوطنية أو الإقامة) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark/60 block">
                    {isAr ? 'صورة الهوية الوطنية أو الإقامة:' : 'National ID or Iqama (Image):'}
                  </label>
                  {nationalIdImg ? (
                    <div className="border border-black/10 rounded-2xl p-3 bg-neutral-50 space-y-2 text-center">
                      <div className="relative inline-block mx-auto max-w-[200px]">
                        <img 
                          src={nationalIdImg} 
                          alt="ID preview" 
                          className="rounded-xl max-h-32 object-contain mx-auto border border-black/5"
                        />
                        <button
                          type="button"
                          onClick={() => setNationalIdImg('')}
                          className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-xs hover:bg-rose-700 cursor-pointer text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[10px] text-dark/40 font-bold">{isAr ? 'تم تحميل صورة الهوية' : 'ID document loaded'}</p>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-black/10 rounded-2xl p-3 bg-neutral-50 text-center hover:bg-neutral-100/50 transition-colors cursor-pointer relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setNationalIdImg(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        required
                      />
                      <div className="space-y-1 pointer-events-none">
                        <div className="text-lg">🪪</div>
                        <p className="text-[11px] font-extrabold text-dark/70">
                          {isAr ? 'اضغط لإرفاق صورة الهوية الوطنية أو الإقامة' : 'Click to attach National ID or Iqama'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Driving License Upload (صورة رخصة القيادة) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark/60 block">
                    {isAr ? 'صورة رخصة القيادة:' : 'Driving License (Image):'}
                  </label>
                  {licenseImg ? (
                    <div className="border border-black/10 rounded-2xl p-3 bg-neutral-50 space-y-2 text-center">
                      <div className="relative inline-block mx-auto max-w-[200px]">
                        <img 
                          src={licenseImg} 
                          alt="License preview" 
                          className="rounded-xl max-h-32 object-contain mx-auto border border-black/5"
                        />
                        <button
                          type="button"
                          onClick={() => setLicenseImg('')}
                          className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-xs hover:bg-rose-700 cursor-pointer text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[10px] text-dark/40 font-bold">{isAr ? 'تم تحميل صورة الرخصة' : 'License image loaded'}</p>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-black/10 rounded-2xl p-3 bg-neutral-50 text-center hover:bg-neutral-100/50 transition-colors cursor-pointer relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => setLicenseImg(reader.result as string);
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        required
                      />
                      <div className="space-y-1 pointer-events-none">
                        <div className="text-lg">🛞</div>
                        <p className="text-[11px] font-extrabold text-dark/70">
                          {isAr ? 'اضغط لإرفاق صورة رخصة القيادة' : 'Click to attach driving license'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Car Registration Image (صورة الاستمارة) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark/60 block">
                    {isAr ? 'صورة استمارة السيارة:' : 'Car Registration Document (Image):'}
                  </label>
                  
                  {carRegistrationImg ? (
                    <div className="border border-black/10 rounded-2xl p-3 bg-neutral-50 space-y-2 text-center">
                      <div className="relative inline-block mx-auto max-w-[200px]">
                        <img 
                          src={carRegistrationImg} 
                          alt="Car registration preview" 
                          className="rounded-xl max-h-32 object-contain mx-auto border border-black/5"
                        />
                        <button
                          type="button"
                          onClick={() => setCarRegistrationImg('')}
                          className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-xs hover:bg-rose-700 cursor-pointer text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[10px] text-dark/40 font-bold">{isAr ? 'تم تحميل صورة الاستمارة بنجاح' : 'Vehicle registration image loaded successfully'}</p>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-black/10 rounded-2xl p-3 bg-neutral-50 text-center hover:bg-neutral-100/50 transition-colors cursor-pointer relative">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = () => {
                              setCarRegistrationImg(reader.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        required
                      />
                      <div className="space-y-1 pointer-events-none">
                        <div className="text-lg">📄</div>
                        <p className="text-[11px] font-extrabold text-dark/70">
                          {isAr ? 'اضغط لإرفاق صورة الاستمارة' : 'Click to attach car registration'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bank Account Details */}
                <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4.5 space-y-3">
                  <h4 className="text-xs font-black text-amber-900 tracking-wide">
                    {isAr ? '💼 تفاصيل الحساب البنكي (المستحقات الأرباح):' : '💼 Bank Account Details (Earnings Transfer):'}
                  </h4>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-amber-800 block">
                      {isAr ? 'اختر البنك المصرفي:' : 'Select Bank:'}
                    </label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full bg-white text-dark border border-amber-200/60 rounded-xl px-3 py-2 outline-none focus:border-yellow text-xs font-bold"
                    >
                      <option value="Al Rajhi">{isAr ? 'مصرف الراجحي (Al Rajhi Bank)' : 'Al Rajhi Bank'}</option>
                      <option value="STC Bank">{isAr ? 'stc bank (STC Pay)' : 'STC Bank'}</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-amber-800 block">
                      {isAr ? 'رقم الآيبان (IBAN):' : 'IBAN:'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'مثال: SA0380000000000000000000' : 'e.g. SA038000...'}
                      value={iban}
                      onChange={(e) => setIban(e.target.value.toUpperCase())}
                      className="w-full bg-white text-dark border border-amber-200/60 rounded-xl px-3 py-2 outline-none focus:border-yellow text-xs font-mono font-bold"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-extrabold text-amber-800 block">
                      {isAr ? 'الاسم الكامل للمستفيد (كما هو بالحساب أو البطاقة البنكية):' : 'Full Cardholder Name (as on bank account):'}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={isAr ? 'مثال: أحمد عبد الله الراجحي' : 'e.g. Ahmad Abdullah Al Rajhi'}
                      value={bankAccountName}
                      onChange={(e) => setBankAccountName(e.target.value)}
                      className="w-full bg-white text-dark border border-amber-200/60 rounded-xl px-3 py-2 outline-none focus:border-yellow text-xs font-bold"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 px-4 bg-yellow hover:bg-yellow-500 text-black font-black text-xs rounded-xl transition-all cursor-pointer text-center shadow-xs"
                >
                  {isSubmitting ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال طلب التسجيل 📤' : 'Submit Registration 📤')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setShowRegisterForm(false);
                  }}
                  className="py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-dark/70 font-semibold text-xs rounded-xl cursor-pointer"
                >
                  {isAr ? 'إلغاء وعودة' : 'Cancel & Return'}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {isDriverSuspended(selectedDriver) ? (
            <div className="bg-white border border-rose-100 rounded-3xl p-8 shadow-sm space-y-6 text-center max-w-xl mx-auto animate-fade-in my-6">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-100 animate-pulse">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif font-black text-xl text-rose-800">
                  {isAr ? 'تم إيقاف حسابك مؤقتاً 🚫' : 'Account Temporarily Suspended 🚫'}
                </h3>
                <p className="text-sm text-dark/70 leading-relaxed font-medium">
                  {isAr 
                    ? 'تم إيقاف حساب المندوب الخاص بك تلقائياً لمدة 24 ساعة بسبب رفض أحد طلبات التوصيل النشطة.' 
                    : 'Your driver account has been automatically suspended for 24 hours because you rejected an active delivery assignment.'}
                </p>
              </div>

              {suspensionCountdown && (
                <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 max-w-md mx-auto space-y-1">
                  <span className="text-[10px] text-rose-700/60 font-bold block uppercase tracking-wider">
                    {isAr ? 'الوقت المتبقي لرفع الإيقاف:' : 'TIME REMAINING UNTIL REINSTATEMENT:'}
                  </span>
                  <span className="font-mono text-lg font-black text-rose-700 block">
                    {suspensionCountdown}
                  </span>
                </div>
              )}

              <div className="pt-4 border-t border-black/5">
                <button
                  onClick={handleLogout}
                  className="py-3 px-6 bg-neutral-100 hover:bg-neutral-200 text-dark/80 font-black text-xs rounded-xl cursor-pointer transition-all"
                >
                  {isAr ? 'تسجيل الخروج أو تغيير الحساب 👤' : 'Logout or Change Profile 👤'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Standalone PWA Layout Wrapper */}
              <div className="min-h-[85vh] flex flex-col lg:flex-row gap-6 text-start font-sans">
                
                {/* 1. RESPONSIVE SIDEBAR (Desktop Sidebar Panel / Large Screen View) */}
                <aside className="hidden lg:flex flex-col w-72 bg-gradient-to-b from-neutral-900 to-amber-950 text-white rounded-[2rem] p-6 shrink-0 border border-white/5 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-yellow/10 rounded-full blur-3xl pointer-events-none" />
                  
                  {/* Driver Profile Header */}
                  <div className="relative z-10 flex flex-col items-center text-center pb-5 border-b border-white/10">
                    <div className="relative">
                      {selectedDriver.profileImg ? (
                        <img 
                          src={selectedDriver.profileImg} 
                          alt={selectedDriver.name} 
                          className="w-20 h-20 rounded-2xl object-cover border-2 border-yellow shadow-md"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-yellow text-black font-serif font-black text-2xl rounded-2xl flex items-center justify-center shadow-inner">
                          {selectedDriver.name.charAt(0)}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-1 rounded-full text-[10px]" title="Active">
                        🟢
                      </span>
                    </div>

                    <h3 className="font-extrabold text-base tracking-wide mt-3 text-white flex items-center gap-1.5 justify-center">
                      {selectedDriver.name}
                    </h3>
                    <p className="text-[10px] text-yellow/90 font-mono mt-0.5">{selectedDriver.phone}</p>
                    
                    {/* Active Captain Badge */}
                    <span className="mt-2.5 inline-block bg-yellow/15 border border-yellow/25 text-yellow text-[9px] font-mono px-2.5 py-0.5 rounded-full uppercase tracking-wider font-black">
                      {isAr ? 'كابتن معتمد 🪪' : 'Active Captain 🪪'}
                    </span>
                  </div>

                  {/* Navigation List */}
                  <nav className="flex-1 space-y-1.5 mt-6 relative z-10">
                    {/* Tab: Dashboard/Orders */}
                    <button
                      onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'home'
                          ? 'bg-yellow text-black shadow-lg font-black'
                          : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Truck className="w-4 h-4 shrink-0" />
                        <span>{isAr ? 'الطلبات والمهام 📦' : 'Orders & Shipments 📦'}</span>
                      </div>
                      {(activeDeliveries.length > 0 || unassignedDeliveries.length > 0) && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${activeTab === 'home' ? 'bg-black text-white' : 'bg-yellow text-black animate-bounce'}`}>
                          {activeDeliveries.length + unassignedDeliveries.length}
                        </span>
                      )}
                    </button>

                    {/* Tab: Interactive Map */}
                    <button
                      onClick={() => { setActiveTab('map'); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'map'
                          ? 'bg-yellow text-black shadow-lg font-black'
                          : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Map className="w-4 h-4 shrink-0" />
                        <span>{isAr ? 'الخريطة التفاعلية 📍' : 'Interactive GPS Map 📍'}</span>
                      </div>
                      {isTrackingLive && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                    </button>

                    {/* Tab: Bank Details */}
                    <button
                      onClick={() => { setActiveTab('bank'); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'bank'
                          ? 'bg-yellow text-black shadow-lg font-black'
                          : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <CreditCard className="w-4 h-4 shrink-0" />
                        <span>{isAr ? 'تفاصيل البنك الخاص بك 🏦' : 'My Bank Account 🏦'}</span>
                      </div>
                    </button>

                    {/* Tab: Earnings */}
                    <button
                      onClick={() => { setActiveTab('earnings'); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'earnings'
                          ? 'bg-yellow text-black shadow-lg font-black'
                          : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <History className="w-4 h-4 shrink-0" />
                        <span>{isAr ? 'الأرباح والسجل 📜' : 'Earnings & History 📜'}</span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400 font-mono">+{estimatedEarnings} SAR</span>
                    </button>

                    {/* Tab: Profile */}
                    <button
                      onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        activeTab === 'profile'
                          ? 'bg-yellow text-black shadow-lg font-black'
                          : 'text-white/70 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <User className="w-4 h-4 shrink-0" />
                        <span>{isAr ? 'ملفي الشخصي ومستنداتي 👤' : 'My Documents 👤'}</span>
                      </div>
                    </button>
                  </nav>

                  {/* Sidebar Footer Controls */}
                  <div className="pt-4 border-t border-white/10 relative z-10 space-y-3.5 text-xs text-white/50">
                    {/* Status switch */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-mono uppercase tracking-wider block">{isAr ? 'الحالة في السيستم:' : 'SYSTEM STATUS:'}</span>
                      <button
                        onClick={handleToggleDriverStatus}
                        className={`w-full py-2 px-3 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-2 border shadow-xs ${
                          selectedDriver.status === 'available'
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${selectedDriver.status === 'available' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                        <span>{selectedDriver.status === 'available' ? (isAr ? 'متوفر للطلب' : 'Available') : (isAr ? 'مشغول بالسيستم' : 'Busy')}</span>
                      </button>
                    </div>

                    <button
                      onClick={handleLogout}
                      className="w-full py-2 px-4 bg-white/5 hover:bg-rose-950/40 text-white/70 hover:text-rose-400 border border-white/5 hover:border-rose-900/30 font-bold rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>{isAr ? 'تسجيل الخروج 🚪' : 'Logout 🚪'}</span>
                    </button>
                  </div>
                </aside>

                {/* 2. DYNAMIC CONTENT WORKSPACE */}
                <main className="flex-1 space-y-6">
                  
                  {/* Mobile header (Floating menu tab control) */}
                  <div className="lg:hidden bg-gradient-to-br from-neutral-900 to-amber-950 text-white rounded-2xl p-4 flex justify-between items-center shadow-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-yellow/10 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="flex items-center gap-3 relative z-10">
                      {selectedDriver.profileImg ? (
                        <img 
                          src={selectedDriver.profileImg} 
                          alt={selectedDriver.name} 
                          className="w-10 h-10 rounded-xl object-cover border border-yellow"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-yellow text-black font-black text-xs rounded-xl flex items-center justify-center font-serif">
                          {selectedDriver.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h4 className="font-extrabold text-sm leading-tight">{selectedDriver.name}</h4>
                        <span className="text-[10px] text-yellow tracking-wide mt-0.5 block font-mono font-bold">
                          {isAr ? 'كابتن معتمد 🪪' : 'Certified Captain 🪪'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 relative z-10">
                      <button
                        onClick={handleToggleDriverStatus}
                        className={`p-1.5 rounded-lg border text-xs ${
                          selectedDriver.status === 'available' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        }`}
                        title={isAr ? 'تغيير الحالة' : 'Change status'}
                      >
                        🟢
                      </button>
                      <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 bg-white/10 rounded-xl text-white hover:bg-white/15"
                      >
                        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  {/* Mobile navigation sliding drawer overlay */}
                  <AnimatePresence>
                    {mobileMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="lg:hidden bg-neutral-900 border border-black/10 rounded-2xl p-4 shadow-xl text-start space-y-2 relative z-20"
                      >
                        <button
                          onClick={() => { setActiveTab('home'); setMobileMenuOpen(false); }}
                          className={`w-full text-start py-3 px-4 rounded-xl text-xs font-bold flex justify-between items-center ${activeTab === 'home' ? 'bg-yellow text-black font-black' : 'text-white'}`}
                        >
                          <span>{isAr ? '📦 الطلبات والمهام' : isUr ? '📦 آرڈرز اور کام' : '📦 Orders'}</span>
                          {(activeDeliveries.length > 0 || unassignedDeliveries.length > 0) && (
                            <span className="bg-rose-500 text-white px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
                              {activeDeliveries.length + unassignedDeliveries.length}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => { setActiveTab('map'); setMobileMenuOpen(false); }}
                          className={`w-full text-start py-3 px-4 rounded-xl text-xs font-bold flex justify-between items-center ${activeTab === 'map' ? 'bg-yellow text-black font-black' : 'text-white'}`}
                        >
                          <span>{isAr ? '📍 الخريطة التفاعلية والمسار' : isUr ? '📍 لائیو نقشہ' : '📍 Interactive Live Map'}</span>
                        </button>
                        <button
                          onClick={() => { setActiveTab('bank'); setMobileMenuOpen(false); }}
                          className={`w-full text-start py-3 px-4 rounded-xl text-xs font-bold ${activeTab === 'bank' ? 'bg-yellow text-black font-black' : 'text-white'}`}
                        >
                          <span>{isAr ? '🏦 تفاصيل الحساب البنكي' : isUr ? '🏦 بینک اکاؤنٹ کی تفصیلات' : '🏦 Bank Account Details'}</span>
                        </button>
                        <button
                          onClick={() => { setActiveTab('earnings'); setMobileMenuOpen(false); }}
                          className={`w-full text-start py-3 px-4 rounded-xl text-xs font-bold flex justify-between items-center ${activeTab === 'earnings' ? 'bg-yellow text-black font-black' : 'text-white'}`}
                        >
                          <span>{isAr ? '📜 سجل الأرباح والتسليمات' : isUr ? '📜 آمدنی کا لاگ' : '📜 Earnings Log'}</span>
                          <span className="text-emerald-400 text-[11px]">+{estimatedEarnings} SAR</span>
                        </button>
                        <button
                          onClick={() => { setActiveTab('profile'); setMobileMenuOpen(false); }}
                          className={`w-full text-start py-3 px-4 rounded-xl text-xs font-bold ${activeTab === 'profile' ? 'bg-yellow text-black font-black' : 'text-white'}`}
                        >
                          <span>{isAr ? '👤 مستنداتك وملفك الشخصي' : isUr ? '👤 میری دستاویزات' : '👤 My Documents'}</span>
                        </button>
                        <div className="pt-2 border-t border-white/10 mt-2 flex gap-2">
                          <button
                            onClick={handleLogout}
                            className="flex-1 py-2 px-3 bg-rose-950/20 text-rose-400 border border-rose-900/20 rounded-xl text-xs font-bold text-center"
                          >
                            {isAr ? '🚪 خروج' : 'Logout'}
                          </button>
                          <button
                            onClick={() => setMobileMenuOpen(false)}
                            className="py-2 px-3 bg-neutral-800 text-white/70 rounded-xl text-xs text-center"
                          >
                            {isAr ? 'إغلاق' : 'Close'}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Dynamic Tab Panels */}
                  
                  {/* TAB 1: HOME (Orders Queue List) */}
                  {activeTab === 'home' && (
                    <div className="space-y-6">
                      
                      {/* Grid: Left Column (My Assigned), Right Column (Free dispatcher claim) */}
                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        
                        {/* Left larger column (Assigned Orders) */}
                        <div className="lg:col-span-8 space-y-4">
                          <div className="flex justify-between items-center text-dark border-b border-black/5 pb-2">
                            <div>
                              <h3 className="font-bold text-base flex items-center gap-1.5 uppercase tracking-wide">
                                <Truck className="w-4 h-4 text-yellow" />
                                {isAr ? 'الطلبات المسندة إليك حالياً' : 'Your Assigned Deliveries'}
                              </h3>
                              <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                                {activeDeliveries.length} {isAr ? 'طلبيات قيد التجهيز والتوصيل' : 'active assignments in transit'}
                              </p>
                            </div>
                          </div>

                          {loadingOrders ? (
                            <div className="h-44 bg-neutral-50 border border-black/5 rounded-3xl flex items-center justify-center">
                              <div className="animate-spin w-6 h-6 border-2 border-yellow border-t-transparent rounded-full" />
                            </div>
                          ) : activeDeliveries.length === 0 ? (
                            <div className="h-64 bg-neutral-50 border border-dashed border-black/10 rounded-[2rem] p-6 flex flex-col items-center justify-center text-center text-dark/40">
                              <ShieldCheck className="w-10 h-10 text-dark/30 stroke-[1.5] mb-2" />
                              <p className="font-extrabold text-xs text-dark/80">{isAr ? 'لا يوجد لديك طلبيات نشطة حالياً' : 'No active deliveries assigned'}</p>
                              <p className="text-[11px] text-dark/50 max-w-sm mt-1 leading-relaxed">
                                {isAr 
                                  ? 'يمكنك تصفح لوحة الطلبات المتاحة للتوصيل على اليسار وقبول طلب يدوي، أو انتظر إشعار الموظف عند إسناد طلب جديد.' 
                                  : 'Accept orders from the free-dispatch panel on the side, or wait for the cashier manager to assign routes.'}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <AnimatePresence mode="popLayout">
                                {activeDeliveries.map((order) => {
                                  const itemsQty = order.items.reduce((sum, i) => sum + i.quantity, 0);

                                  return (
                                    <motion.div
                                      key={order.id}
                                      initial={{ opacity: 0, scale: 0.98 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.98 }}
                                      className="bg-white border border-black/5 hover:border-black/10 rounded-3xl p-5 text-start shadow-2xs space-y-4 relative overflow-hidden"
                                    >
                                      {/* Order Status Ribbon */}
                                      <div className="flex flex-wrap justify-between items-center gap-2 border-b border-black/5 pb-3.5">
                                        <div className="space-y-0.5">
                                          <span className="text-[10px] text-dark/40 block font-mono font-bold leading-none uppercase">
                                            {isAr ? 'طلب توصيل رقم' : 'DELIVERY ORDER #'}
                                          </span>
                                          <span className="font-mono text-sm font-black text-dark">{order.id}</span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9.5px] font-black ${
                                            order.status === 'on_the_way'
                                              ? 'bg-blue-500/10 text-blue-700 animate-pulse'
                                              : order.status === 'driver_picked_up'
                                              ? 'bg-amber-500/10 text-amber-700 animate-pulse'
                                              : 'bg-yellow text-black font-extrabold'
                                          }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${
                                              order.status === 'on_the_way' 
                                                ? 'bg-blue-500 animate-ping' 
                                                : order.status === 'driver_picked_up'
                                                ? 'bg-amber-500 animate-ping'
                                                : 'bg-black'
                                            }`} />
                                            <span>
                                              {order.status === 'on_the_way' 
                                                ? (isAr ? 'وصلت للموقع 📍' : 'Arrived at Location 📍')
                                                : order.status === 'driver_picked_up'
                                                ? (isAr ? 'تم استلام الطلب وبدء التوصيل 🚴' : 'Order Picked Up 🚴')
                                                : (isAr ? 'تم قبول الطلب وجاري التحضير 🍳' : 'Accepted & Preparing 🍳')
                                              }
                                            </span>
                                          </span>
                                        </div>
                                      </div>

                                      {/* Customer & Route details */}
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                                        <div className="space-y-2">
                                          <div>
                                            <span className="text-[9px] text-dark/40 block uppercase font-bold tracking-wider">{isAr ? 'العميل المستلم' : 'CUSTOMER'}</span>
                                            <span className="font-bold text-dark text-sm block mt-0.5">{order.customerName}</span>
                                          </div>
                                          <div>
                                            <span className="text-[9px] text-dark/40 block uppercase font-bold tracking-wider">{isAr ? 'رقم الهاتف' : 'CONTACT PHONE'}</span>
                                            <a href={`tel:${order.customerPhone}`} className="font-bold text-yellow-700 hover:underline flex items-center gap-1.5 mt-0.5">
                                              <Phone className="w-3.5 h-3.5" />
                                              <span>{order.customerPhone}</span>
                                            </a>
                                          </div>
                                        </div>

                                        <div className="space-y-2">
                                          <div>
                                            <span className="text-[9px] text-dark/40 block uppercase font-bold tracking-wider">{isAr ? 'عنوان التوصيل' : 'DELIVERY ADDRESS'}</span>
                                            <span className="font-bold text-dark text-xs block mt-0.5 break-words line-clamp-2">
                                              {order.deliveryAddress || (isAr ? 'لم يحدد عنوان دقيق (يرجى الاتصال)' : 'Address not specific (contact customer)')}
                                            </span>
                                          </div>
                                          <div>
                                            <span className="text-[9px] text-dark/40 block uppercase font-bold tracking-wider">{isAr ? 'أجرة التوصيل المستحقة' : 'DELIVERY FEE'}</span>
                                            <span className="font-bold text-emerald-700 text-xs block mt-0.5">
                                              {order.deliveryFee || 15} SAR
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Quick details strip: items count & total */}
                                      <div className="bg-neutral-50 rounded-2xl p-3 border border-black/5 flex justify-between items-center text-xs font-mono">
                                        <div>
                                          <span className="text-dark/40 text-[9px] block font-bold leading-none uppercase">{isAr ? 'تفاصيل الطلبية' : 'ORDER DETAILS'}</span>
                                          <span className="font-extrabold text-dark mt-1 block">
                                            {itemsQty} {isAr ? 'أصناف مختلفة' : 'total items'}
                                          </span>
                                        </div>
                                        <div className="text-end">
                                          <span className="text-dark/40 text-[9px] block font-bold leading-none uppercase">
                                            {isAr 
                                              ? (businessSettings?.taxEnabled ? 'المجموع شامل الضريبة' : 'المجموع النهائي للطلب') 
                                              : (businessSettings?.taxEnabled ? 'TOTAL (VAT INCL.)' : 'FINAL TOTAL')
                                            }
                                          </span>
                                          <span className="font-black text-dark mt-1 block text-sm">
                                            {order.total.toFixed(2)} SAR
                                          </span>
                                        </div>
                                      </div>

                                      {/* Interactive Action Tools */}
                                      <div className="pt-3 border-t border-black/5 space-y-3">
                                        <span className="text-[10px] text-dark/40 block font-bold tracking-widest uppercase">{isAr ? 'أدوات المساعدة والتوجيه اللوجستي للمندوب:' : 'DRIVERS LOGISTICS TOOLKIT:'}</span>
                                        
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                          {/* Maps link */}
                                          <a
                                            href={getMapsLink(order)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/50 rounded-xl font-bold text-[11px] cursor-pointer transition-colors"
                                          >
                                            <Navigation className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                                            <span>{isAr ? 'خرائط جوجل 📍' : 'Maps 📍'}</span>
                                          </a>

                                          {/* WhatsApp */}
                                          <a
                                            href={getWhatsAppLink(order)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/50 rounded-xl font-bold text-[11px] cursor-pointer transition-colors"
                                          >
                                            <span className="text-sm">💬</span>
                                            <span>{isAr ? 'واتساب العميل' : 'WhatsApp'}</span>
                                          </a>

                                          {/* Telephone */}
                                          <a
                                            href={`tel:${order.customerPhone}`}
                                            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-neutral-50 hover:bg-neutral-100 text-dark border border-black/5 rounded-xl font-bold text-[11px] cursor-pointer transition-colors"
                                          >
                                            <Phone className="w-3.5 h-3.5 shrink-0 text-dark/60" />
                                            <span>{isAr ? 'اتصال مباشر' : 'Call'}</span>
                                          </a>

                                          {/* Payment indicator */}
                                          <div className="bg-neutral-50 rounded-xl px-3 py-1 flex items-center justify-center text-center border border-black/5">
                                            <span className="text-[10px] text-dark/50 leading-tight">
                                              {isAr ? 'الدفع:' : 'Pay:'} <span className="font-extrabold text-dark block">{order.paymentMethod === 'cod' ? (isAr ? 'كاش 💵' : 'COD 💵') : (isAr ? 'شبكة 💳' : 'Paid 💳')}</span>
                                            </span>
                                          </div>
                                        </div>

                                        {/* Status Update Button */}
                                        <div className="pt-2">
                                          {order.status === 'driver_assigned' ? (
                                            <button
                                              onClick={() => handleUpdateOrderStatus(order.id, 'driver_picked_up')}
                                              className="w-full py-3.5 bg-yellow hover:bg-yellow-500 text-black font-black text-xs rounded-2xl cursor-pointer transition-colors shadow-xs flex items-center justify-center gap-2 uppercase tracking-wider"
                                            >
                                              <span>🚀</span>
                                              <span>{isAr ? 'تم استلام الطلب وبدء التوصيل 🚴' : 'Order Picked Up & Start Delivery 🚴'}</span>
                                            </button>
                                          ) : order.status === 'driver_picked_up' ? (
                                            <button
                                              onClick={() => handleUpdateOrderStatus(order.id, 'on_the_way')}
                                              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs rounded-2xl cursor-pointer transition-colors shadow-xs flex items-center justify-center gap-2 uppercase tracking-wider"
                                            >
                                              <span>📍</span>
                                              <span>{isAr ? 'وصلت للموقع 📍' : 'Arrived at Location 📍'}</span>
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => handleUpdateOrderStatus(order.id, 'delivered')}
                                              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-2xl cursor-pointer transition-colors shadow-sm flex items-center justify-center gap-2 uppercase tracking-wider"
                                            >
                                              <CheckCircle2 className="w-4 h-4" />
                                              <span>{isAr ? 'تم تسليم الطلب بنجاح ✅' : 'Confirm Order Delivered Successfully ✅'}</span>
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </AnimatePresence>
                            </div>
                          )}
                        </div>

                        {/* Right claiming dispatcher pool column */}
                        <div className="lg:col-span-4 space-y-4">
                          {activeDeliveries.length >= 2 ? (
                            <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 text-center text-slate-500 text-xs shadow-xs space-y-3">
                              <span className="text-3xl block">🚴🚴</span>
                              <p className="font-extrabold text-slate-850">
                                {isAr ? 'أنت تقوم بتوصيل طلبين حالياً (الحد الأقصى)' : 'You are currently delivering 2 orders (Maximum)'}
                              </p>
                              <p className="text-[10px] text-slate-500 leading-normal font-sans">
                                {isAr 
                                  ? 'يرجى إنهاء وتسليم الطلبيات النشطة الموكلة إليك أولاً لتتمكن من استقبال أو تصفح طلبيات توصيل جديدة.' 
                                  : 'Please complete and deliver your current assigned orders first before you can browse or accept new delivery routes.'}
                              </p>
                            </div>
                          ) : activeDeliveries.length === 1 ? (
                            <div className="space-y-4">
                              <div className="bg-amber-50/80 border border-amber-200/60 rounded-2xl p-4 text-center text-xs shadow-2xs space-y-2">
                                <span className="text-2xl block animate-bounce">🔕</span>
                                <p className="font-extrabold text-amber-900 font-sans">
                                  {isAr ? 'تم إيقاف التنبيهات الصوتية مؤقتاً 🔕' : 'Sound Alerts Silenced Temporarily 🔕'}
                                </p>
                                <p className="text-[10px] text-amber-800 leading-normal font-sans">
                                  {isAr 
                                    ? 'تم كتم الصوت للتنبيهات لتتمكن من التركيز على تسليم طلبك الحالي براحة وبشكل سريع.' 
                                    : 'Sound chimes are muted so you can focus on delivering your active order safely and quickly.'}
                                </p>
                                
                                <button
                                  onClick={() => setShowPressurePool(!showPressurePool)}
                                  className="w-full mt-2 py-2 px-3 bg-white hover:bg-amber-100/50 text-amber-900 border border-amber-200/80 font-black text-[10px] rounded-xl transition-all cursor-pointer shadow-3xs"
                                >
                                  {showPressurePool 
                                    ? (isAr ? '▲ إخفاء طابور الطلبات المفتوحة' : '▲ Hide Open Deliveries List')
                                    : (isAr ? '▼ إظهار الطلبات المتاحة (في حالات ضغط العمل) 📢' : '▼ View Open Deliveries (Under High Load Pressure) 📢')
                                  }
                                </button>
                              </div>

                              {showPressurePool && (
                                <div className="space-y-4">
                                  <div className="text-start border-b border-black/5 pb-2">
                                    <h3 className="font-bold text-sm flex items-center gap-1.5 uppercase tracking-wide">
                                      <MapPin className="w-4 h-4 text-yellow" />
                                      {isAr ? 'طلب إضافي ثانٍ لضغط العمل 📢' : 'Pressure Workload Additional Order 📢'}
                                    </h3>
                                    <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                                      {unassignedDeliveries.length} {isAr ? 'طلبيات توصيل متاحة للاستلام' : 'open delivery requests available'}
                                    </p>
                                  </div>

                                  {unassignedDeliveries.length === 0 ? (
                                    <div className="bg-neutral-50 border border-dashed border-black/10 rounded-3xl p-5 text-center text-dark/40 text-[11px] py-10">
                                      <Clock className="w-8 h-8 text-dark/20 mx-auto mb-2 animate-pulse" />
                                      <span>{isAr ? 'لا توجد طلبات توصيل غير مسندة حالياً.' : 'No open deliveries at this moment.'}</span>
                                    </div>
                                  ) : (
                                    <div className="space-y-3">
                                      <AnimatePresence mode="popLayout">
                                        {unassignedDeliveries.map((order) => {
                                          const qty = order.items.reduce((sum, i) => sum + i.quantity, 0);
                                          return (
                                            <motion.div
                                              key={order.id}
                                              initial={{ opacity: 0, y: 10 }}
                                              animate={{ opacity: 1, y: 0 }}
                                              exit={{ opacity: 0, y: 10 }}
                                              className="bg-white border border-black/5 rounded-2xl p-4 text-start shadow-2xs space-y-3 relative"
                                            >
                                              <div className="flex justify-between items-start gap-2 border-b border-black/5 pb-2">
                                                <div className="space-y-0.5">
                                                  <span className="text-[8px] text-dark/40 block font-mono font-bold uppercase"># {order.id}</span>
                                                  <span className="font-extrabold text-xs text-dark">{order.customerName}</span>
                                                </div>
                                                <span className="bg-yellow/15 text-yellow-800 text-[9px] font-black px-2 py-0.5 rounded-full">
                                                  {qty} {isAr ? 'قطع' : 'pcs'}
                                                </span>
                                              </div>

                                              <div className="space-y-1 font-mono text-[10px] text-dark/70">
                                                <p className="line-clamp-2">
                                                  📍 <span className="font-bold text-dark">{isAr ? 'العنوان:' : 'Addr:'}</span> {order.deliveryAddress || (isAr ? 'غير محدد' : 'Not specified')}
                                                </p>
                                                <p className="flex justify-between">
                                                  <span>💰 {isAr ? 'القيمة:' : 'Value:'} <span className="font-bold text-dark">{order.total.toFixed(2)} SAR</span></span>
                                                  <span>🚴 {isAr ? 'التوصيل:' : 'Fee:'} <span className="font-bold text-emerald-600">{order.deliveryFee || 15} SAR</span></span>
                                                </p>
                                              </div>

                                              <div className="flex gap-2 pt-1">
                                                <button
                                                  onClick={() => handleAcceptOrder(order.id)}
                                                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1 shadow-xs"
                                                >
                                                  <span>🚴</span>
                                                  <span>{isAr ? 'قبول الطلب الثاني' : 'Accept 2nd Order'}</span>
                                                </button>
                                                <button
                                                  onClick={() => handleRejectOrder(order.id)}
                                                  className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/50 font-extrabold text-[11px] rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1"
                                                  title={isAr ? 'رفض الطلب (سيتم إيقاف حسابك 24 ساعة)' : 'Reject order (24h ban)'}
                                                >
                                                  <span>✕</span>
                                                  <span>{isAr ? 'رفض' : 'Reject'}</span>
                                                </button>
                                              </div>
                                            </motion.div>
                                          );
                                        })}
                                      </AnimatePresence>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="text-start border-b border-black/5 pb-2">
                                <h3 className="font-bold text-sm flex items-center gap-1.5 uppercase tracking-wide">
                                  <MapPin className="w-4 h-4 text-yellow" />
                                  {isAr ? 'طلبات بانتظار مندوب 📢' : 'Unassigned Dispatch Pool'}
                                </h3>
                                <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                                  {unassignedDeliveries.length} {isAr ? 'طلبيات توصيل متاحة للاستلام' : 'open delivery requests available'}
                                </p>
                              </div>

                              {unassignedDeliveries.length === 0 ? (
                                <div className="bg-neutral-50 border border-dashed border-black/10 rounded-3xl p-5 text-center text-dark/40 text-[11px] py-10">
                                  <Clock className="w-8 h-8 text-dark/20 mx-auto mb-2 animate-pulse" />
                                  <span>{isAr ? 'لا توجد طلبات توصيل غير مسندة حالياً.' : 'No open deliveries at this moment.'}</span>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  <AnimatePresence mode="popLayout">
                                    {unassignedDeliveries.map((order) => {
                                      const qty = order.items.reduce((sum, i) => sum + i.quantity, 0);
                                      return (
                                        <motion.div
                                          key={order.id}
                                          initial={{ opacity: 0, y: 10 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          exit={{ opacity: 0, y: 10 }}
                                          className="bg-white border border-black/5 rounded-2xl p-4 text-start shadow-2xs space-y-3 relative"
                                        >
                                          <div className="flex justify-between items-start gap-2 border-b border-black/5 pb-2">
                                            <div className="space-y-0.5">
                                              <span className="text-[8px] text-dark/40 block font-mono font-bold uppercase"># {order.id}</span>
                                              <span className="font-extrabold text-xs text-dark">{order.customerName}</span>
                                            </div>
                                            <span className="bg-yellow/15 text-yellow-800 text-[9px] font-black px-2 py-0.5 rounded-full">
                                              {qty} {isAr ? 'قطع' : 'pcs'}
                                            </span>
                                          </div>

                                          <div className="space-y-1 font-mono text-[10px] text-dark/70">
                                            <p className="line-clamp-2">
                                              📍 <span className="font-bold text-dark">{isAr ? 'العنوان:' : 'Addr:'}</span> {order.deliveryAddress || (isAr ? 'غير محدد' : 'Not specified')}
                                            </p>
                                            <p className="flex justify-between">
                                              <span>💰 {isAr ? 'القيمة:' : 'Value:'} <span className="font-bold text-dark">{order.total.toFixed(2)} SAR</span></span>
                                              <span>🚴 {isAr ? 'التوصيل:' : 'Fee:'} <span className="font-bold text-emerald-600">{order.deliveryFee || 15} SAR</span></span>
                                            </p>
                                          </div>

                                          <div className="flex gap-2 pt-1">
                                            <button
                                              onClick={() => handleAcceptOrder(order.id)}
                                              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1 shadow-xs"
                                            >
                                              <span>🚴</span>
                                              <span>{isAr ? 'قبول الطلب' : 'Accept'}</span>
                                            </button>
                                            <button
                                              onClick={() => handleRejectOrder(order.id)}
                                              className="py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200/50 font-extrabold text-[11px] rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1"
                                              title={isAr ? 'رفض الطلب (سيتم إيقاف حسابك 24 ساعة)' : 'Reject order (24h ban)'}
                                            >
                                              <span>✕</span>
                                              <span>{isAr ? 'رفض' : 'Reject'}</span>
                                            </button>
                                          </div>
                                        </motion.div>
                                      );
                                    })}
                                  </AnimatePresence>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                      </div>
                    </div>
                  )}

                  {/* TAB 2: INTERACTIVE GPS MAP */}
                  {activeTab === 'map' && (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-black/5 pb-2">
                        <div>
                          <h3 className="font-bold text-base flex items-center gap-1.5 uppercase tracking-wide">
                            <Compass className="w-4 h-4 text-yellow animate-spin" />
                            {isAr ? 'خريطة الموقع التفاعلية وتحديد المسار' : 'Interactive Map & Location Tracker'}
                          </h3>
                          <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                            {isAr ? 'تحديث تلقائي لموقعك الجغرافي وإسناده في الخلفية للعملاء' : 'Live real-time position mapped for customer delivery routing'}
                          </p>
                        </div>

                        {/* Simulation trigger */}
                        <button
                          onClick={() => setSimulationMode(!simulationMode)}
                          className={`py-1.5 px-3 rounded-lg text-[10px] font-black font-mono flex items-center gap-1.5 transition-all ${
                            simulationMode ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-neutral-100 text-dark/60'
                          }`}
                        >
                          <span>🛠️</span>
                          <span>{simulationMode ? (isAr ? 'وضع محاكاة الحركة: نشط' : 'GPS Simulation: ON') : (isAr ? 'تشغيل وضع محاكاة الحركة' : 'Run GPS Simulation')}</span>
                        </button>
                      </div>

                      {/* GPS Telemetry Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-neutral-50 rounded-2xl p-3 border border-black/5 flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center text-xs">🌐</div>
                          <div className="text-start">
                            <span className="text-[8px] text-dark/40 block font-mono font-bold leading-none">{isAr ? 'خط العرض' : 'LATITUDE'}</span>
                            <span className="text-xs font-black text-dark font-mono mt-1 block">{coords ? coords.lat.toFixed(5) : '—'}</span>
                          </div>
                        </div>

                        <div className="bg-neutral-50 rounded-2xl p-3 border border-black/5 flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center text-xs">🌐</div>
                          <div className="text-start">
                            <span className="text-[8px] text-dark/40 block font-mono font-bold leading-none">{isAr ? 'خط الطول' : 'LONGITUDE'}</span>
                            <span className="text-xs font-black text-dark font-mono mt-1 block">{coords ? coords.lng.toFixed(5) : '—'}</span>
                          </div>
                        </div>

                        <div className="bg-neutral-50 rounded-2xl p-3 border border-black/5 flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center text-xs">🏎️</div>
                          <div className="text-start">
                            <span className="text-[8px] text-dark/40 block font-mono font-bold leading-none">{isAr ? 'السرعة التقريبية' : 'APPROX. SPEED'}</span>
                            <span className="text-xs font-black text-dark font-mono mt-1 block">{gpsSpeed !== null ? `${gpsSpeed} km/h` : '0 km/h'}</span>
                          </div>
                        </div>

                        <div className="bg-neutral-50 rounded-2xl p-3 border border-black/5 flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs ${gpsPermissionState === 'granted' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>📡</div>
                          <div className="text-start">
                            <span className="text-[8px] text-dark/40 block font-mono font-bold leading-none">{isAr ? 'حالة إذن الـ GPS' : 'GPS PERMISSION'}</span>
                            <span className="text-xs font-black text-dark mt-1 block">
                              {gpsPermissionState === 'granted' ? (isAr ? 'مسموح ومفعّل ✅' : 'Granted ✅') : (isAr ? 'مرفوض 🛑' : 'Denied 🛑')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Manual location adjust controls when simulation mode is active */}
                      {simulationMode && (
                        <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 text-xs space-y-3">
                          <p className="font-extrabold text-amber-900 text-start flex items-center gap-1">
                            <span>🛠️</span>
                            <span>{isAr ? 'لوحة محاكاة إحداثيات الموقع (لتجربة تتبع العميل):' : 'GPS Coordinates Simulator Controls:'}</span>
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <button
                              onClick={() => handleManualLocationUpdate((coords?.lat || 24.7136) + 0.002, coords?.lng || 46.6753)}
                              className="py-2 px-3 bg-white hover:bg-neutral-50 border border-black/5 rounded-xl font-mono font-bold cursor-pointer"
                            >
                              ⬆️ {isAr ? 'شمال (+Lat)' : 'North (+Lat)'}
                            </button>
                            <button
                              onClick={() => handleManualLocationUpdate((coords?.lat || 24.7136) - 0.002, coords?.lng || 46.6753)}
                              className="py-2 px-3 bg-white hover:bg-neutral-50 border border-black/5 rounded-xl font-mono font-bold cursor-pointer"
                            >
                              ⬇️ {isAr ? 'جنوب (-Lat)' : 'South (-Lat)'}
                            </button>
                            <button
                              onClick={() => handleManualLocationUpdate(coords?.lat || 24.7136, (coords?.lng || 46.6753) + 0.002)}
                              className="py-2 px-3 bg-white hover:bg-neutral-50 border border-black/5 rounded-xl font-mono font-bold cursor-pointer"
                            >
                              ➡️ {isAr ? 'شرق (+Lng)' : 'East (+Lng)'}
                            </button>
                            <button
                              onClick={() => handleManualLocationUpdate(coords?.lat || 24.7136, (coords?.lng || 46.6753) - 0.002)}
                              className="py-2 px-3 bg-white hover:bg-neutral-50 border border-black/5 rounded-xl font-mono font-bold cursor-pointer"
                            >
                              ⬅️ {isAr ? 'غرب (-Lng)' : 'West (-Lng)'}
                            </button>
                          </div>
                          <p className="text-[10px] text-amber-700/80 font-medium text-start">
                            {isAr ? 'تنبيه: تحريك المؤشر أعلاه يحاكي حركة المندوب فورياً ويقوم بتحديث الإحداثيات في لوحة التحكم وعند العميل لمتابعة خط السير.' : 'Note: Simulating updates live GPS tracking logs for testing customer view paths.'}
                          </p>
                        </div>
                      )}

                      {/* Interactive Map Component */}
                      <InteractiveOrderMap
                        customerLat={activeDeliveries[0]?.latitude}
                        customerLng={activeDeliveries[0]?.longitude}
                        customerAddress={activeDeliveries[0]?.deliveryAddress}
                        driverLat={coords?.lat}
                        driverLng={coords?.lng}
                        driverName={selectedDriver?.name}
                        driverPhone={selectedDriver?.phone}
                        orderStatus={activeDeliveries[0]?.status || 'on_the_way'}
                        language={isAr ? 'ar' : 'en'}
                      />

                      {/* Navigation hints */}
                      <div className="bg-neutral-50 rounded-2xl p-4 border border-black/5 text-start text-[11px] leading-relaxed text-dark/60 space-y-1">
                        <p className="font-extrabold text-dark text-xs">{isAr ? 'كيف يعمل التتبع الجغرافي؟' : 'How does location tracking work?'}</p>
                        <p>{isAr ? '• يستند النظام إلى أذونات المتصفح لتحديث الإحداثيات كل 10 ثوانٍ وإرسالها إلى قاعدة البيانات السحابية.' : '• Geolocation captures and synchronizes your pathing coordinates every 10 seconds directly to Firestore.'}</p>
                        <p>{isAr ? '• يستطيع المشتري الضغط على رابط المندوب ومتابعة سيارتك مباشرة على خريطة العميل.' : '• Customers can follow your location updates on their interactive tracking screens in real-time.'}</p>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: BANK DETAILS */}
                  {activeTab === 'bank' && (
                    <div className="space-y-6">
                      <div className="border-b border-black/5 pb-2">
                        <h3 className="font-bold text-base flex items-center gap-1.5 uppercase tracking-wide">
                          <CreditCard className="w-4 h-4 text-yellow" />
                          {isAr ? 'معلومات الحساب البنكي المعتمد' : 'My Approved Bank Details'}
                        </h3>
                        <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                          {isAr ? 'الحساب المسجل في النظام لاستقبال الأرباح والعمولات' : 'Your payout credentials verified for daily settlements'}
                        </p>
                      </div>

                      {/* Bank Form or Bank Card Mockup depending on isEditingBank */}
                      {isEditingBank ? (
                        <form onSubmit={handleSaveBankDetails} className="max-w-md mx-auto w-full bg-white border border-black/5 rounded-3xl p-6 text-start space-y-4 animate-fade-in">
                          <h4 className="text-xs font-black text-dark tracking-wide uppercase border-b border-black/5 pb-2">
                            {isAr ? '✏️ تحديث الحساب البنكي' : '✏️ Edit Bank Details'}
                          </h4>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-dark/70 block">
                              {isAr ? 'اسم المصرف / البنك:' : 'Select Bank:'}
                            </label>
                            <select
                              value={editBankName}
                              onChange={(e) => setEditBankName(e.target.value)}
                              className="w-full bg-neutral-50 text-dark border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-yellow text-xs font-bold"
                            >
                              <option value="Al Rajhi">{isAr ? 'مصرف الراجحي (Al Rajhi Bank)' : 'Al Rajhi Bank'}</option>
                              <option value="STC Bank">{isAr ? 'stc bank (STC Pay)' : 'STC Bank'}</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-dark/70 block">
                              {isAr ? 'رقم الآيبان (IBAN):' : 'IBAN:'}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="SA..."
                              value={editIban}
                              onChange={(e) => setEditIban(e.target.value.toUpperCase())}
                              className="w-full bg-neutral-50 text-dark border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-yellow text-xs font-mono font-bold"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[11px] font-extrabold text-dark/70 block">
                              {isAr ? 'الاسم الكامل كما هو مسجل في البنك:' : 'Full Legal Name on Bank Account:'}
                            </label>
                            <input
                              type="text"
                              required
                              placeholder={isAr ? 'مثال: أحمد عبد الله الراجحي' : 'e.g. Ahmad Abdullah Al Rajhi'}
                              value={editBankAccountName}
                              onChange={(e) => setEditBankAccountName(e.target.value)}
                              className="w-full bg-neutral-50 text-dark border border-black/10 rounded-xl px-3 py-2.5 outline-none focus:border-yellow text-xs font-bold"
                            />
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button
                              type="submit"
                              disabled={isSavingBank}
                              className="flex-1 py-2.5 px-4 bg-yellow hover:bg-yellow-500 text-black font-black text-xs rounded-xl transition-all cursor-pointer text-center"
                            >
                              {isSavingBank ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'حفظ التعديلات ✅' : 'Save Details ✅')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsEditingBank(false)}
                              className="py-2.5 px-4 bg-neutral-100 hover:bg-neutral-200 text-dark font-bold text-xs rounded-xl cursor-pointer"
                            >
                              {isAr ? 'إلغاء' : 'Cancel'}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="max-w-md mx-auto w-full space-y-4">
                          <div className={`aspect-video rounded-3xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between ${
                            (selectedDriver.bankName || 'Al Rajhi') === 'STC Bank'
                              ? 'bg-gradient-to-br from-indigo-700 via-purple-800 to-indigo-950 border border-indigo-500/30'
                              : 'bg-gradient-to-br from-blue-900 via-blue-950 to-neutral-950 border border-blue-800/30'
                          }`}>
                            {/* Radial ambient glow */}
                            <div className="absolute -top-12 -right-12 w-44 h-44 bg-yellow/10 rounded-full blur-3xl pointer-events-none" />
                            
                            {/* Top row: Chip and Bank logo */}
                            <div className="flex justify-between items-start relative z-10">
                              <div className="space-y-1">
                                <span className="text-[9.5px] font-black text-yellow tracking-widest uppercase block">
                                  {isAr ? 'بطاقة كابتن معتمد' : 'VERIFIED CAPTAIN'}
                                </span>
                                {/* Golden Chip */}
                                <div className="w-9 h-7 bg-amber-400/20 border border-amber-400/30 rounded-md shadow-inner mt-2 relative overflow-hidden">
                                  <div className="absolute inset-x-0 top-1 h-px bg-amber-400/40" />
                                  <div className="absolute inset-x-0 bottom-1 h-px bg-amber-400/40" />
                                  <div className="absolute inset-y-0 left-2.5 w-px bg-amber-400/40" />
                                </div>
                              </div>
                              
                              <div className="text-right">
                                <span className="font-black text-sm tracking-wide block">
                                  {(selectedDriver.bankName || 'Al Rajhi') === 'STC Bank' ? 'stc bank' : 'AL RAJHI BANK'}
                                </span>
                                <span className="text-[9.5px] text-white/50 block font-mono font-bold mt-0.5">{isAr ? 'شريك التوصيل المالي' : 'FINANCIAL PORTAL'}</span>
                              </div>
                            </div>

                            {/* IBAN section */}
                            <div className="space-y-1 relative z-10 my-4 text-start">
                              <span className="text-[8px] text-white/40 block font-mono font-bold tracking-widest uppercase">SAUDI ARABIA IBAN</span>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-base md:text-lg font-black tracking-wider block text-white select-all">
                                  {selectedDriver.iban || 'SA00 0000 0000 0000 0000 0000'}
                                </span>
                                {selectedDriver.iban && (
                                  <button
                                    onClick={() => handleCopyIBAN(selectedDriver.iban!)}
                                    className="p-1 bg-white/10 hover:bg-white/20 text-white rounded-lg cursor-pointer transition-colors"
                                    title={isAr ? 'نسخ الآيبان' : 'Copy IBAN'}
                                  >
                                    {copiedText ? <Check className="w-3.5 h-3.5 text-yellow" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Cardholder name & Date */}
                            <div className="flex justify-between items-end relative z-10 font-mono text-[10px]">
                              <div className="text-start">
                                <span className="text-white/40 block text-[8px] uppercase">{isAr ? 'اسم المستفيد' : 'ACCOUNT HOLDER'}</span>
                                <span className="font-bold text-white block mt-0.5">{selectedDriver.bankAccountName || selectedDriver.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-white/40 block text-[8px] uppercase">STATUS</span>
                                <span className="text-emerald-400 font-extrabold block mt-0.5">{isAr ? 'نشط ومعتمد ✅' : 'ACTIVE ✅'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex justify-center pt-1">
                            <button
                              onClick={() => {
                                setEditBankName(selectedDriver.bankName || 'Al Rajhi');
                                setEditBankAccountName(selectedDriver.bankAccountName || selectedDriver.name || '');
                                setEditIban(selectedDriver.iban || '');
                                setIsEditingBank(true);
                              }}
                              className="text-xs font-black text-dark hover:text-yellow flex items-center gap-1 bg-neutral-100 hover:bg-neutral-200 px-4 py-2 rounded-xl cursor-pointer transition-all border border-black/5"
                            >
                              <span>✏️</span>
                              <span>{isAr ? 'تعديل البيانات البنكية' : 'Edit Bank Credentials'}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Bank payout terms helper */}
                      <div className="bg-neutral-50 rounded-2xl p-4 border border-black/5 text-start text-[11px] leading-relaxed text-dark/60 space-y-2">
                        <p className="font-extrabold text-dark text-xs flex items-center gap-1">
                          <span>🏦</span>
                          <span>{isAr ? 'شروط وسياسات تسوية العمولات:' : 'Payout Policies & Schedules:'}</span>
                        </p>
                        <p>{isAr ? '• يتم تحويل الأرباح والعمولات المكتسبة للمناديب بشكل دوري يومياً عند انتهاء الوردية.' : '• Earnings are credited directly to your registered IBAN card on a daily basis at shift completion.'}</p>
                        <p>{isAr ? '• يجب أن يكون الآيبان المدخل باسمك ومطابقاً للبطاقة الوطنية لمنع تعليق التحويلات.' : '• The IBAN cardholder must match your certified national profile to prevent settlement delays.'}</p>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: EARNINGS & COMPLETED LOGS */}
                  {activeTab === 'earnings' && (
                    <div className="space-y-6">
                      <div className="border-b border-black/5 pb-2">
                        <h3 className="font-bold text-base flex items-center gap-1.5 uppercase tracking-wide">
                          <History className="w-4 h-4 text-yellow" />
                          {isAr ? 'سجل تسليماتك وأرباحك المكتسبة' : 'My Completed Deliveries & Earnings Log'}
                        </h3>
                        <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                          {isAr ? 'كشف تفصيلي تاريخي لجميع مهام التوصيل المكتملة وحالة عمولاتها' : 'Historical breakdowns of delivery fees and completed routes'}
                        </p>
                      </div>

                      {/* Earnings dashboard cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 rounded-3xl p-5 text-start relative overflow-hidden">
                          <TrendingUp className="w-8 h-8 text-emerald-600/30 absolute right-4 top-4" />
                          <span className="text-[9px] font-mono uppercase tracking-widest block text-emerald-700/60 font-bold">{isAr ? 'إجمالي الأرباح المكتسبة' : 'TOTAL REVENUE'}</span>
                          <span className="text-3xl font-black block text-emerald-700 mt-2 font-mono">{estimatedEarnings} SAR</span>
                          <span className="text-[10px] text-emerald-600 block mt-1">{isAr ? 'تسويات يومية تلقائية' : 'Daily settlement ready'}</span>
                        </div>

                        <div className="bg-yellow/10 border border-yellow/20 text-amber-800 rounded-3xl p-5 text-start relative overflow-hidden">
                          <Truck className="w-8 h-8 text-yellow/30 absolute right-4 top-4" />
                          <span className="text-[9px] font-mono uppercase tracking-widest block text-amber-700/60 font-bold">{isAr ? 'إجمالي التسليمات المكتملة' : 'TOTAL RUNS'}</span>
                          <span className="text-3xl font-black block text-amber-800 mt-2 font-mono">{completedDeliveries.length} {isAr ? 'طلبيات' : 'runs'}</span>
                          <span className="text-[10px] text-amber-600 block mt-1">{isAr ? 'معدل نجاح 100%' : '100% completion rate'}</span>
                        </div>

                        <div className="bg-blue-500/10 border border-blue-500/20 text-blue-800 rounded-3xl p-5 text-start relative overflow-hidden">
                          <DollarSign className="w-8 h-8 text-blue-600/30 absolute right-4 top-4" />
                          <span className="text-[9px] font-mono uppercase tracking-widest block text-blue-700/60 font-bold">{isAr ? 'متوسط عمولة الطلب الواحد' : 'AVG DELIVERY FEE'}</span>
                          <span className="text-3xl font-black block text-blue-800 mt-2 font-mono">15.00 SAR</span>
                          <span className="text-[10px] text-blue-600 block mt-1">{isAr ? 'بما لا يقل عن 15 ريال للطلب' : 'Minimum 15 SAR base fee'}</span>
                        </div>
                      </div>

                      {/* Completed list chronological log */}
                      <div className="bg-white border border-black/5 rounded-3xl p-5 space-y-4">
                        <h4 className="font-extrabold text-sm text-dark flex items-center justify-between border-b border-black/5 pb-2.5">
                          <span>📜 {isAr ? 'كشف تسليماتك التاريخي' : 'Completed Routes Timeline'}</span>
                          <span className="bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full text-[10px] font-black">{completedDeliveries.length}</span>
                        </h4>

                        {completedDeliveries.length === 0 ? (
                          <div className="py-12 text-center text-dark/30 text-xs">
                            <History className="w-10 h-10 mx-auto mb-2 opacity-30 animate-pulse" />
                            <p>{isAr ? 'لا يوجد مهام توصيل مكتملة في سجلك اليوم بعد.' : 'No completed deliveries logged yet.'}</p>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                            {completedDeliveries.map((o) => (
                              <div key={o.id} className="bg-neutral-50 hover:bg-neutral-100/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border border-black/5 font-mono text-xs transition-colors">
                                <div className="text-start space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-dark text-sm"># {o.id}</span>
                                    <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded-full">{isAr ? 'مكتمل بنجاح' : 'Delivered'}</span>
                                  </div>
                                  <p className="text-[11px] text-dark/60 font-medium">
                                    👤 {isAr ? 'العميل:' : 'Client:'} <span className="font-bold text-dark">{o.customerName}</span>
                                  </p>
                                  <span className="text-[10px] text-dark/40 block">
                                    🕒 {new Date(o.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                                  </span>
                                </div>
                                <div className="text-start sm:text-end border-t sm:border-t-0 pt-2.5 sm:pt-0 border-black/5">
                                  <span className="text-emerald-600 font-black block text-sm">+{o.deliveryFee || 15} SAR</span>
                                  <span className="text-dark/40 block text-[9px] mt-0.5 uppercase font-bold">{isAr ? 'طريقة الدفع:' : 'PAY:'} {o.paymentMethod === 'cod' ? (isAr ? 'كاش 💵' : 'COD') : (isAr ? 'مدفوع إلكترونياً 💳' : 'Paid')}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )}

                  {/* TAB 5: PROFILE (My Documents) */}
                  {activeTab === 'profile' && (
                    <div className="space-y-6">
                      
                      {/* Section heading */}
                      <div className="border-b border-black/5 pb-2">
                        <h3 className="font-bold text-base flex items-center gap-1.5 uppercase tracking-wide">
                          <User className="w-4 h-4 text-yellow" />
                          {isAr ? 'ملفي الشخصي ومستنداتي القانونية' : 'My Documents & Legal Profile'}
                        </h3>
                        <p className="text-[10px] text-dark/40 font-mono mt-0.5">
                          {isAr ? 'المستندات الرسمية والوثائق القانونية المرفقة بملفك الكابتن' : 'Your officially uploaded driver compliance documents'}
                        </p>
                      </div>

                      {/* Documents viewer grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        
                        {/* Profile Photo */}
                        <div className="bg-white border border-black/5 rounded-3xl p-5 text-start space-y-3 shadow-2xs">
                          <span className="text-xs font-bold text-dark/60 block">{isAr ? 'الصورة الشخصية للكابتن 📸' : 'Captain Profile Image 📸'}</span>
                          {selectedDriver.profileImg ? (
                            <img 
                              src={selectedDriver.profileImg} 
                              alt="Captain profile preview" 
                              className="rounded-2xl max-h-48 object-contain mx-auto border border-black/5"
                            />
                          ) : (
                            <div className="h-32 bg-neutral-50 rounded-2xl border border-dashed border-black/10 flex items-center justify-center text-xs text-dark/40">
                              {isAr ? 'لم ترفق صورة شخصية' : 'No photo uploaded'}
                            </div>
                          )}
                        </div>

                        {/* National ID / Iqama */}
                        <div className="bg-white border border-black/5 rounded-3xl p-5 text-start space-y-3 shadow-2xs">
                          <span className="text-xs font-bold text-dark/60 block">{isAr ? 'صورة الهوية الوطنية أو الإقامة 🪪' : 'National ID or Iqama 🪪'}</span>
                          {selectedDriver.nationalIdImg ? (
                            <img 
                              src={selectedDriver.nationalIdImg} 
                              alt="National ID preview" 
                              className="rounded-2xl max-h-48 object-contain mx-auto border border-black/5"
                            />
                          ) : (
                            <div className="h-32 bg-neutral-50 rounded-2xl border border-dashed border-black/10 flex items-center justify-center text-xs text-dark/40">
                              {isAr ? 'لم ترفق صورة الهوية' : 'No ID document uploaded'}
                            </div>
                          )}
                        </div>

                        {/* Driving License */}
                        <div className="bg-white border border-black/5 rounded-3xl p-5 text-start space-y-3 shadow-2xs">
                          <span className="text-xs font-bold text-dark/60 block">{isAr ? 'صورة رخصة القيادة 🚴' : 'Driving License Doc 🚴'}</span>
                          {selectedDriver.licenseImg ? (
                            <img 
                              src={selectedDriver.licenseImg} 
                              alt="License preview" 
                              className="rounded-2xl max-h-48 object-contain mx-auto border border-black/5"
                            />
                          ) : (
                            <div className="h-32 bg-neutral-50 rounded-2xl border border-dashed border-black/10 flex items-center justify-center text-xs text-dark/40">
                              {isAr ? 'لم ترفق صورة الرخصة' : 'No license document uploaded'}
                            </div>
                          )}
                        </div>

                        {/* Vehicle Registration */}
                        <div className="bg-white border border-black/5 rounded-3xl p-5 text-start space-y-3 shadow-2xs">
                          <span className="text-xs font-bold text-dark/60 block">{isAr ? 'صورة استمارة السيارة 🚗' : 'Vehicle Registration (Istimara) 🚗'}</span>
                          {selectedDriver.carRegistrationImg ? (
                            <img 
                              src={selectedDriver.carRegistrationImg} 
                              alt="Car registration preview" 
                              className="rounded-2xl max-h-48 object-contain mx-auto border border-black/5"
                            />
                          ) : (
                            <div className="h-32 bg-neutral-50 rounded-2xl border border-dashed border-black/10 flex items-center justify-center text-xs text-dark/40">
                              {isAr ? 'لم ترفق صورة الاستمارة' : 'No registration document uploaded'}
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Standalone PWA install workflow block */}
                      <div className="bg-gradient-to-br from-neutral-900 to-amber-950 text-white rounded-3xl p-6 text-start relative overflow-hidden border border-white/5">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-yellow/10 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="flex items-center gap-3.5 relative z-10 border-b border-white/10 pb-4">
                          <div className="w-11 h-11 bg-yellow text-black rounded-2xl flex items-center justify-center text-lg shadow-inner">📱</div>
                          <div>
                            <h4 className="font-extrabold text-sm">{isAr ? 'تثبيت بوابة المناديب كتطبيق مستقل (PWA)' : 'Install Standalone Captain Portal App (PWA)'}</h4>
                            <p className="text-[10px] text-white/50 font-mono mt-0.5">{isAr ? 'لإرسال وتلقي إشعارات التوصيل في الخلفية والخرائط الفورية' : 'Receive background route updates and live customer tracking notifications'}</p>
                          </div>
                        </div>

                        <div className="space-y-3 text-xs leading-relaxed text-white/80 mt-4 relative z-10">
                          <p className="font-bold text-yellow">{isAr ? 'خطوات التحميل على الهواتف الذكية:' : 'How to install on smart mobile devices:'}</p>
                          
                          <div className="space-y-2 text-[11px] font-mono font-medium">
                            <p>{isAr ? '1. نظام أندرويد (Chrome): اضغط على النقاط الثلاث بالأعلى ثم اختر "إضافة إلى الشاشة الرئيسية" أو "تثبيت التطبيق".' : '1. Android (Chrome): Tap the three-dots menu icon on top-right, and choose "Add to Home Screen" or "Install App".'}</p>
                            <p>{isAr ? '2. نظام آيفون iOS (Safari): اضغط على زر المشاركة الأسفل 📤 ثم اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).' : '2. iPhone/iOS (Safari): Tap the Share button at the bottom 📤 and choose "Add to Home Screen".'}</p>
                            <p>{isAr ? '3. بعد التحميل: سيظهر التطبيق على شاشتك الرئيسية ويمكنك تشغيله والحصول على تتبع جغرافي دقيق بالخلفية.' : '3. Standalone mode will run with enhanced performance, dedicated screen layout, and robust background GPS telemetry.'}</p>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                </main>

              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
};
