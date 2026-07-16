import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where, orderBy, deleteDoc } from 'firebase/firestore';
import { Order, Driver } from '../types';
import { useLanguage } from './LanguageContext';
import { playOrderChime } from './AudioAlert';
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
  DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DriverPortalProps {
  businessSettings?: import('../types').BusinessSettings;
}

export const DriverPortal: React.FC<DriverPortalProps> = ({ businessSettings }) => {
  const { language, t } = useLanguage();
  const isAr = language === 'ar';

  // Driver context state
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(() => {
    const saved = localStorage.getItem('active_driver_profile');
    return saved ? JSON.parse(saved) : null;
  });

  // Login form state
  const [loginPhone, setLoginPhone] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Creation form state
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [carRegistrationImg, setCarRegistrationImg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationSuccessMsg, setRegistrationSuccessMsg] = useState('');

  // Orders lists state
  const [activeDeliveries, setActiveDeliveries] = useState<Order[]>([]);
  const [completedDeliveries, setCompletedDeliveries] = useState<Order[]>([]);
  const [unassignedDeliveries, setUnassignedDeliveries] = useState<Order[]>([]);

  const [loadingOrders, setLoadingOrders] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [suspensionCountdown, setSuspensionCountdown] = useState<string>('');

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
  }, [selectedDriver?.id, unassignedDeliveries.length, selectedDriver?.status, selectedDriver?.suspendedUntil]);

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

  // 2b. Handle Login via Mobile Phone Number
  const handlePhoneLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanedInput = loginPhone.trim().replace(/[\s+]/g, '');
    if (!cleanedInput) return;

    // Search for driver in registered, approved drivers
    const foundDriver = drivers.find(
      (d) => d.phone.trim().replace(/[\s+]/g, '') === cleanedInput
    );

    if (foundDriver) {
      setSelectedDriver(foundDriver);
      localStorage.setItem('active_driver_profile', JSON.stringify(foundDriver));
      setLoginPhone('');
    } else {
      setErrorMsg(
        isAr 
          ? 'عذراً، رقم الجوال هذا غير مسجل في قائمة المناديب المعتمدين. يرجى تقديم طلب تسجيل بالضغط على الرابط أدناه.' 
          : 'Sorry, this mobile number is not registered in our approved drivers list. Please request registration using the link below.'
      );
    }
  };

  // 3. Register a new driver profile (Pending Approval & Telegram dispatch)
  const handleRegisterDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    const doubleName = newDriverName.trim();
    const phoneNum = newDriverPhone.trim();

    if (!doubleName || !phoneNum) {
      setErrorMsg(isAr ? 'الرجاء تعبئة جميع الحقول المطلوبة.' : 'Please fill all required fields.');
      return;
    }

    // Validate double name (at least two parts)
    const nameParts = doubleName.split(/\s+/);
    if (nameParts.length < 2) {
      setErrorMsg(isAr ? 'الرجاء إدخال اسمك الثنائي (الاسم الأول واسم العائلة).' : 'Please enter your double name (First name and Last name).');
      return;
    }

    if (!carRegistrationImg) {
      setErrorMsg(isAr ? 'الرجاء إرفاق صورة الاستمارة لتأكيد طلبك.' : 'Please upload car registration image to verify your request.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Save to Firestore under 'pending_drivers'
      const pendingData = {
        name: doubleName,
        phone: phoneNum,
        carRegistrationImg,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, 'pending_drivers'), pendingData);

      // 2. Dispatch Telegram Bot notification via server
      try {
        await fetch('/api/notify-driver-registration', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: doubleName,
            phone: phoneNum,
            carRegistrationImg,
          }),
        });
      } catch (teleErr) {
        console.error('Failed to dispatch telegram notification:', teleErr);
      }

      // Show success window
      setRegistrationSuccessMsg(
        isAr 
          ? 'تم استلام الطلب وبانتظار الموافقة وسيتم إبلاغكم بالموافقة في أقرب وقت من قبل الإدارة'
          : 'Your request has been received and is awaiting approval. You will be notified of the approval as soon as possible by the administration.'
      );

      // Clear fields
      setNewDriverName('');
      setNewDriverPhone('');
      setCarRegistrationImg('');
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
      console.error('Failed to update status:', err);
      // Revert if database update failed
      setSelectedDriver(selectedDriver);
      localStorage.setItem('active_driver_profile', JSON.stringify(selectedDriver));
    }
  };

  // 5. Pick up/Accept an order
  const handleAcceptOrder = async (orderId: string) => {
    if (!selectedDriver) return;

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
        
        // Open WhatsApp with delivered notification
        if (order) {
          const waLink = getWhatsAppLink(order, 'delivered');
          window.open(waLink, '_blank');
        }

        // Update driver completed count & earnings
        if (selectedDriver) {
          const orderFee = order?.deliveryFee || 15;
          const currentCount = selectedDriver.completedCount || 0;
          const currentEarnings = selectedDriver.totalEarnings || 0;
          const newCount = currentCount + 1;
          const newEarnings = currentEarnings + orderFee;

          await updateDoc(doc(db, 'drivers', selectedDriver.id), {
            completedCount: newCount,
            totalEarnings: newEarnings
          });

          const updated = {
            ...selectedDriver,
            completedCount: newCount,
            totalEarnings: newEarnings
          };
          setSelectedDriver(updated);
          localStorage.setItem('active_driver_profile', JSON.stringify(updated));
        }

        // Delete order from Firestore directly so it is instantly removed after delivery completion
        await deleteDoc(doc(db, 'orders', orderId));
        
        // Clear locally as fallback
        setActiveDeliveries(prev => prev.filter(o => o.id !== orderId));
      } else {
        const updateData: Partial<Order> = { status: nextStatus };
        await updateDoc(doc(db, 'orders', orderId), updateData);

        // Find the order info to open WhatsApp automatically for intermediate status
        const order = activeDeliveries.find(o => o.id === orderId);
        if (order) {
          const waLink = getWhatsAppLink(order, nextStatus);
          window.open(waLink, '_blank');
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
    const cleanedPhone = order.customerPhone.replace(/[\s+]/g, '');
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
      
      {/* Title Header with Icon */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-black/5 pb-4">
        <div className="text-start space-y-1">
          <div className="flex items-center gap-2 text-yellow-600 font-mono text-[10px] uppercase font-bold tracking-widest">
            <Truck className="w-4 h-4 text-yellow" />
            <span>{isAr ? 'نظام تتبع وإدارة لوجستية للمناديب' : 'Driver Logistics & Realtime Dispatch'}</span>
          </div>
          <h2 className="text-2xl font-serif font-bold text-dark tracking-tight">
            {isAr ? 'بوابة كابتن التوصيل 🚴' : 'Delivery Captain Portal 🚴'}
          </h2>
          <p className="text-xs text-dark/50">
            {isAr 
              ? 'متابعة وتحديث طلبات التوصيل المنزلي بشكل مستقل وفوري دون التأثير على تصفح المشتري.' 
              : 'Standalone hub for delivery drivers to claim and fulfill charcoal-grilled orders.'}
          </p>
        </div>

        {selectedDriver && (
          <button
            onClick={handleLogout}
            className="text-[10px] font-black text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/50 px-3 py-1.5 rounded-xl cursor-pointer transition-colors"
          >
            {isAr ? 'تغيير الحساب 👤' : 'Change Profile 👤'}
          </button>
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
            /* PHONE LOGIN FORM */
            <form onSubmit={handlePhoneLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-dark/60 block">
                  {isAr ? 'أدخل رقم جوالك المسجل بالسيستم:' : 'Enter your registered mobile number:'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark/40 text-xs font-bold">
                    📞
                  </span>
                  <input
                    type="tel"
                    required
                    placeholder={isAr ? 'مثال: 0512345678' : 'e.g. 0512345678'}
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    className="w-full bg-neutral-50 text-dark border border-black/5 rounded-xl pl-9 pr-4 py-3 outline-none focus:border-yellow focus:bg-white text-xs text-start font-mono font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 px-4 bg-yellow hover:bg-yellow-500 text-black font-black text-xs rounded-xl transition-colors cursor-pointer text-center shadow-xs uppercase tracking-wider"
              >
                {isAr ? 'تسجيل دخول كابتن 🚴' : 'Delivery Login 🚴'}
              </button>

              <div className="pt-4 border-t border-black/5 text-center space-y-1.5">
                <p className="text-xs text-dark/50">
                  {isAr ? 'هل أنت مندوب جديد وترغب بالانضمام إلينا؟' : 'Are you a new captain wanting to join us?'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMsg('');
                    setShowRegisterForm(true);
                  }}
                  className="text-xs font-black text-yellow-600 hover:text-yellow-700 hover:underline cursor-pointer"
                >
                  {isAr ? '🚴 للتسجيل اضغط هنا' : '🚴 To Register, Click Here'}
                </button>
              </div>
            </form>
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
                    placeholder={isAr ? 'مثال: محمد الربيعان' : 'e.g. Mohammad Al-Rabian'}
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
                    placeholder={isAr ? 'مثال: 0512345678' : 'e.g. 0512345678'}
                    value={newDriverPhone}
                    onChange={(e) => setNewDriverPhone(e.target.value)}
                    className="w-full bg-neutral-50 text-dark border border-black/5 rounded-xl px-4 py-3 outline-none focus:border-yellow focus:bg-white text-xs text-start font-mono font-bold"
                  />
                </div>

                {/* Car Registration Image (صورة الاستمارة) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-dark/60 block">
                    {isAr ? 'صورة الاستمارة (السيارة):' : 'Car Registration Document (Image):'}
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
                          className="absolute -top-2 -right-2 bg-rose-600 text-white rounded-full p-1 shadow-xs hover:bg-rose-700 cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[10px] text-dark/40 font-bold">{isAr ? 'تم تحميل الصورة بنجاح' : 'Image loaded successfully'}</p>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-black/10 rounded-2xl p-4 bg-neutral-50 text-center hover:bg-neutral-100/50 transition-colors cursor-pointer relative">
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
                        <div className="text-xl">📷</div>
                        <p className="text-xs font-extrabold text-dark/70">
                          {isAr ? 'اضغط هنا لارفاق صورة الاستمارة' : 'Click here to attach car registration'}
                        </p>
                        <p className="text-[10px] text-dark/40">
                          {isAr ? 'يدعم صيغ الصور (PNG, JPG)' : 'Supports PNG, JPG formats'}
                        </p>
                      </div>
                    </div>
                  )}
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
              {/* Driver Context Info Bar */}
              <div className="bg-gradient-to-br from-neutral-900 to-amber-950 text-white rounded-3xl p-5 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-start relative overflow-hidden border border-white/5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow/10 rounded-full blur-3xl pointer-events-none" />
            <div className="flex items-center gap-3.5 z-10">
              <div className="w-12 h-12 bg-yellow text-black font-serif font-black text-lg rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                {selectedDriver.name.charAt(0)}
              </div>
              <div className="space-y-0.5">
                <h3 className="font-extrabold text-base tracking-wide flex items-center gap-1.5">
                  <span>{selectedDriver.name}</span>
                  <span className="bg-yellow/15 border border-yellow/20 text-yellow text-[9px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider">
                    {isAr ? 'كابتن معتمد' : 'Active Captain'}
                  </span>
                </h3>
                <p className="text-[10px] text-white/60 font-mono">{selectedDriver.phone}</p>
              </div>
            </div>

            {/* Availability switch & Quick earnings report */}
            <div className="flex flex-wrap items-center gap-3 z-10">
              
              {/* Earnings Block */}
              <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-1.5 text-center flex items-center gap-2">
                <div className="text-start">
                  <span className="text-[8.5px] text-white/50 block font-mono font-bold leading-none uppercase">{isAr ? 'إجمالي التسليمات' : 'DELIVERIES'}</span>
                  <span className="font-mono text-xs font-black text-yellow leading-tight mt-0.5 block">{totalCompleted} {isAr ? 'طلبيات' : 'orders'}</span>
                </div>
                <div className="w-px h-6 bg-white/10" />
                <div className="text-start">
                  <span className="text-[8.5px] text-white/50 block font-mono font-bold leading-none uppercase">{isAr ? 'الأرباح التقريبية' : 'EARNINGS'}</span>
                  <span className="font-mono text-xs font-black text-emerald-400 leading-tight mt-0.5 block">{estimatedEarnings} SAR</span>
                </div>
              </div>

              {/* Status Switcher Button */}
              <button
                onClick={handleToggleDriverStatus}
                className={`py-2 px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2 border shadow-xs ${
                  selectedDriver.status === 'available'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${selectedDriver.status === 'available' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span>
                  {selectedDriver.status === 'available' 
                    ? (isAr ? 'حالتك: متوفر للطلب' : 'Status: Available')
                    : (isAr ? 'حالتك: مشغول بالسيستم' : 'Status: Busy')
                  }
                </span>
              </button>
            </div>
          </div>

          {/* Grid: Left column (Active delivery), Right column (Available unassigned pool) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Active assigned deliveries - takes larger column space */}
            <div className="lg:col-span-8 space-y-4">
              <div className="flex justify-between items-center text-dark border-b border-black/5 pb-2 text-start">
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
                <div className="h-56 bg-neutral-50 border border-dashed border-black/10 rounded-[2rem] p-6 flex flex-col items-center justify-center text-center text-dark/40">
                  <ShieldCheck className="w-10 h-10 text-dark/30 stroke-[1.5] mb-2" />
                  <p className="font-extrabold text-xs text-dark/80">{isAr ? 'لا يوجد لديك طلبيات نشطة حالياً' : 'No active deliveries assigned'}</p>
                  <p className="text-[11px] text-dark/50 max-w-sm mt-0.5">
                    {isAr 
                      ? 'يمكنك التوجه للجهة اليسرى وقبول أحد طلبات التوصيل المعروضة في حوض الإسناد الحر، أو انتظر الموظف ليسند لك طلباً من لوحة الإدارة.' 
                      : 'Accept orders from the free-dispatch panel on the side, or wait for the cashier manager to assign routes.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <AnimatePresence mode="popLayout">
                    {activeDeliveries.map((order) => {
                      // Total items count
                      const itemsQty = order.items.reduce((sum, i) => sum + i.quantity, 0);

                      return (
                        <motion.div
                          key={order.id}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          className="bg-white border border-black/5 hover:border-black/10 rounded-3xl p-5 text-start shadow-2xs space-y-4 relative overflow-hidden"
                        >
                          {/* Order Status Ribbon bar */}
                          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-black/5 pb-3.5">
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-dark/40 block font-mono font-bold leading-none uppercase">
                                {isAr ? 'طلب توصيل رقم' : 'DELIVERY ORDER #'}
                              </span>
                              <span className="font-mono text-sm font-black text-dark">{order.id}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              {/* Pulse beacon based on status */}
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

                          {/* Customer & Route Details */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                            <div className="space-y-2 text-start">
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

                            <div className="space-y-2 text-start">
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
                            <div className="text-start">
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

                          {/* Driver Interactive Tools panel */}
                          <div className="pt-3 border-t border-black/5 space-y-3">
                            <span className="text-[10px] text-dark/40 block font-bold tracking-widest uppercase">{isAr ? 'أدوات المساعدة والتوجيه اللوجستي للمندوب:' : 'DRIVERS LOGISTICS TOOLKIT:'}</span>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                              {/* Maps Navigation */}
                              <a
                                href={getMapsLink(order)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200/50 rounded-xl font-bold text-xs cursor-pointer transition-colors"
                              >
                                <Navigation className="w-4 h-4 shrink-0 text-blue-600" />
                                <span>{isAr ? 'خرائط جوجل 📍' : 'Google Maps 📍'}</span>
                              </a>

                              {/* WhatsApp Contact */}
                              <a
                                href={getWhatsAppLink(order)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/50 rounded-xl font-bold text-xs cursor-pointer transition-colors"
                              >
                                <span className="text-lg">💬</span>
                                <span>{isAr ? 'واتساب العميل' : 'WhatsApp Client'}</span>
                              </a>

                              {/* Call Client */}
                              <a
                                href={`tel:${order.customerPhone}`}
                                className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-neutral-50 hover:bg-neutral-100 text-dark border border-black/5 rounded-xl font-bold text-xs cursor-pointer transition-colors"
                              >
                                <Phone className="w-4 h-4 shrink-0 text-dark/60" />
                                <span>{isAr ? 'اتصال مباشر' : 'Call Client'}</span>
                              </a>

                              {/* Quick print receipt wrapper (optional) */}
                              <div className="bg-neutral-50 rounded-xl px-3 py-1 flex items-center justify-center text-center border border-black/5">
                                <span className="text-[10px] text-dark/50 leading-tight">
                                  {isAr ? 'طريقة الدفع:' : 'Pay:'} <span className="font-extrabold text-dark block">{order.paymentMethod === 'cod' ? (isAr ? 'كاش 💵' : 'COD 💵') : (isAr ? 'مدفوع إلكترونياً 💳' : 'Paid 💳')}</span>
                                </span>
                              </div>
                            </div>

                            {/* Main Action Buttons */}
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

            {/* Unassigned Dispatch/Claiming Pool - smaller column space */}
            <div className="lg:col-span-4 space-y-4">
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

              {/* Collapsible Completed History panel */}
              <div className="bg-white border border-black/5 rounded-3xl p-4.5 text-start space-y-3">
                <h4 className="font-extrabold text-xs text-dark flex items-center justify-between border-b border-black/5 pb-2">
                  <span>📜 {isAr ? 'سجل تسليماتك اليوم' : 'Your Delivered History'}</span>
                  <span className="bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full text-[9px] font-black">{completedDeliveries.length}</span>
                </h4>

                {completedDeliveries.length === 0 ? (
                  <p className="text-[10px] text-dark/40 text-center py-2">{isAr ? 'لم تسلّم أي طلب اليوم بعد.' : 'No completed routes yet.'}</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {completedDeliveries.map((o) => (
                      <div key={o.id} className="bg-neutral-50 rounded-xl p-2.5 text-[10px] flex items-center justify-between border border-black/5 font-mono">
                        <div>
                          <span className="font-bold text-dark block"># {o.id}</span>
                          <span className="text-dark/40 block text-[8px] mt-0.5">{new Date(o.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-end">
                          <span className="text-emerald-600 font-bold block">+{o.deliveryFee || 15} SAR</span>
                          <span className="text-dark/40 block text-[8px] mt-0.5">{isAr ? 'تم بنجاح ✅' : 'Success ✅'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

          </div>
          </>
          )}
        </div>
      )}

    </div>
  );
};
