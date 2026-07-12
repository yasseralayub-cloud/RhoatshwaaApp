import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MenuItem, Order, Driver, PendingDriver } from '../types';
import { useLanguage } from './LanguageContext';
import { playOrderChime, startContinuousAlarm, stopContinuousAlarm } from './AudioAlert';
import { generateZatcaQr } from '../utils/time';
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  setDoc,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { INITIAL_MENU_ITEMS, CATEGORIES } from '../initialData';
import {
  TrendingUp,
  ShoppingBag,
  Clock,
  CheckCircle,
  XCircle,
  Plus,
  Edit2,
  Trash2,
  ListFilter,
  DollarSign,
  Briefcase,
  AlertCircle,
  Check,
  Power,
  RefreshCw,
  LogOut,
  Sliders,
  ShieldAlert,
  Flame,
  Volume2,
  Loader2,
  UtensilsCrossed,
  Printer,
  Eye,
  Type,
  Image,
  Settings,
  Landmark,
  MessageSquare,
  Truck,
  Upload,
  X,
  AlertTriangle,
  Info,
  Lock,
  Mail,
  Copy,
  ExternalLink
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

interface AdminPanelProps {
  onMenuUpdate: (newMenu: MenuItem[]) => void;
  menuItems: MenuItem[];
  onPromoUpdate?: (newPromo: import('../types').Promotion | null) => void;
  activePromo?: import('../types').Promotion | null;
  onSettingsUpdate?: (newSettings: import('../types').BusinessSettings) => void;
  businessSettings?: import('../types').BusinessSettings;
  onHideAdminTab?: () => void;
}

const PendingCountdown = ({ createdAt, onTimeout }: { createdAt: string; onTimeout?: () => void }) => {
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    const calculateTime = () => {
      const elapsed = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
      const remaining = Math.max(0, 60 - elapsed);
      setTimeLeft(remaining);
      if (remaining === 0 && onTimeout) {
        onTimeout();
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [createdAt]);

  if (timeLeft > 0) {
    return (
      <div className="bg-amber-500/10 text-amber-700 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-amber-500/20 flex items-center gap-1.5 animate-pulse mt-1.5 justify-center md:justify-start">
        <span className="text-xs">⏳</span>
        <span>متبقي للتعديل/الإلغاء: {timeLeft} ثانية</span>
      </div>
    );
  } else {
    return (
      <div className="bg-red-500/10 text-red-700 text-[11px] font-extrabold px-2.5 py-1.5 rounded-xl border border-red-500/20 flex items-center gap-1.5 mt-1.5 justify-center md:justify-start">
        <span className="text-xs">🚨</span>
        <span>انتهت مهلة الـ 60 ثانية! التنبيه مستمر..</span>
      </div>
    );
  }
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ 
  onMenuUpdate, 
  menuItems,
  onPromoUpdate,
  activePromo,
  onSettingsUpdate,
  businessSettings,
  onHideAdminTab
}) => {
  const { language, t } = useLanguage();
  
  // Real or Sim control
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);

  // Email & password sign-in state
  const [loginEmail, setLoginEmail] = useState('yasseralayub@gmail.com');
  const [loginPassword, setLoginPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Firestore status
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // sound alerts toggle
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Custom dialog confirmation state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    titleAr: string;
    titleEn: string;
    messageAr: string;
    messageEn: string;
    onConfirm: () => void;
    actionLabelAr: string;
    actionLabelEn: string;
    isDanger?: boolean;
  } | null>(null);

  // Custom notification state
  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
    id: number;
  } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    setNotification({
      message,
      type,
      id: Date.now()
    });
  };

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Seeding button state
  const [seedingLoading, setSeedingLoading] = useState(false);
  const [seedingSuccessMsg, setSeedingSuccessMsg] = useState('');

  // Add / Edit item form state
  const [showItemForm, setShowItemForm] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formNameAr, setFormNameAr] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDescAr, setFormDescAr] = useState('');
  const [formPrice, setFormPrice] = useState(10);
  const [formCategory, setFormCategory] = useState('main');
  const [formCalories, setFormCalories] = useState(0);
  const [formImage, setFormImage] = useState('');
  const [formPopular, setFormPopular] = useState(false);
  const [formDineInOnly, setFormDineInOnly] = useState(false);
  const [validationMsg, setValidationMsg] = useState('');

  // Promotions states
  const [promoTitle, setPromoTitle] = useState('');
  const [promoTitleAr, setPromoTitleAr] = useState('');
  const [promoPercent, setPromoPercent] = useState(15);
  const [promoEndsAt, setPromoEndsAt] = useState('');
  const [promoIsActive, setPromoIsActive] = useState(true);
  const [promoImageUrl, setPromoImageUrl] = useState('');

  // Business settings state inputs inside admin dashboard
  const [setRestaurantNameAr, setSetRestaurantNameAr] = useState('');
  const [setRestaurantNameEn, setSetRestaurantNameEn] = useState('');
  const [setTaglineAr, setSetTaglineAr] = useState('');
  const [setTaglineEn, setSetTaglineEn] = useState('');
  const [setLogoUrl, setSetLogoUrl] = useState('');
  const [setPhone, setSetPhone] = useState('');
  const [setWhatsappNumber, setSetWhatsappNumber] = useState('');
  const [setAddressAr, setSetAddressAr] = useState('');
  const [setAddressEn, setSetAddressEn] = useState('');
  const [setVatNumber, setSetVatNumber] = useState('');
  const [setTaxEnabled, setSetTaxEnabled] = useState(true);
  const [setTaxPercent, setSetTaxPercent] = useState(15);
  const [setTaxMethod, setSetTaxMethod] = useState<'inclusive' | 'exclusive'>('inclusive');
  const [setWorkingHoursStart, setSetWorkingHoursStart] = useState('17:00');
  const [setWorkingHoursEnd, setSetWorkingHoursEnd] = useState('02:00');
  const [setDeliveryFee, setSetDeliveryFee] = useState(15);

  // Bank transfer state variables
  const [bankNameAr, setBankNameAr] = useState('مصرف الراجحي');
  const [bankNameEn, setBankNameEn] = useState('Al Rajhi Bank');
  const [bankAccountNameAr, setBankAccountNameAr] = useState('مؤسسة رحلة شواء لتقديم الوجبات');
  const [bankAccountNameEn, setBankAccountNameEn] = useState('Grilling Journey Meals Est.');
  const [bankAccountNumber, setBankAccountNumber] = useState('432608010007890');
  const [bankIban, setBankIban] = useState('SA8380000432608010007890');
  const [bankQrUrl, setBankQrUrl] = useState('https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=432608010007890');

  // Print & Invoice Settings State
  const [printingOrder, setPrintingOrder] = useState<import('../types').Order | null>(null);
  const [isTestPrint, setIsTestPrint] = useState(false);
  const [setReceiptWidth, setSetReceiptWidth] = useState('80mm');
  const [setReceiptFontSize, setSetReceiptFontSize] = useState(11);
  const [setReceiptLogoSize, setSetReceiptLogoSize] = useState(80);
  const [setShowKitchenSlipOnPrint, setSetShowKitchenSlipOnPrint] = useState(true);
  const [setShowCustomerReceiptOnPrint, setSetShowCustomerReceiptOnPrint] = useState(true);
  const [setKitchenSlipFontSize, setSetKitchenSlipFontSize] = useState(12);
  const [setKitchenSlipHeaderAr, setSetKitchenSlipHeaderAr] = useState('فاتورة تحضير المطبخ');
  const [setKitchenSlipHeaderEn, setSetKitchenSlipHeaderEn] = useState('Kitchen Preparation Slip');
  const [setInvoiceFooterAr, setSetInvoiceFooterAr] = useState('');
  const [setInvoiceFooterEn, setSetInvoiceFooterEn] = useState('');

  const [cashierPrinterType, setCashierPrinterType] = useState<'browser' | 'network'>('browser');
  const [cashierPrinterIp, setCashierPrinterIp] = useState('localhost');
  const [cashierPrinterPort, setCashierPrinterPort] = useState(12212);
  const [kitchenPrinterType, setKitchenPrinterType] = useState<'browser' | 'network'>('browser');
  const [kitchenPrinterIp, setKitchenPrinterIp] = useState('localhost');
  const [kitchenPrinterPort, setKitchenPrinterPort] = useState(12212);
  const [printRoutingMode, setPrintRoutingMode] = useState<'unified' | 'split'>('unified');
  const [currentPrintSubMode, setCurrentPrintSubMode] = useState<'all' | 'customer' | 'kitchen'>('all');
  const [clearingOrders, setClearingOrders] = useState(false);
  const [isDraggingQr, setIsDraggingQr] = useState(false);

  // Driver Management States
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [updatingDriverId, setUpdatingDriverId] = useState<string | null>(null);
  const [pendingDrivers, setPendingDrivers] = useState<PendingDriver[]>([]);
  const [loadingPendingDrivers, setLoadingPendingDrivers] = useState(false);
  const [selectedDocPreview, setSelectedDocPreview] = useState<string | null>(null);

  const previousOrdersCountRef = useRef<number>(0);

  // Listen to Auth State
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (user) {
        // Enforce the rule's bootstrapped email
        if (user.email === 'yasseralayub@gmail.com') {
          setIsAdmin(true);
          setIsSimulated(false);
        } else {
          setIsAdmin(false);
          setIsSimulated(false);
          setLoginError(language === 'ar' 
            ? 'عذراً! هذا البريد الإلكتروني غير مصرح له كمسؤول لمشاهدة الطلبات الحية.' 
            : 'Unauthorized! This email is not authorized as an administrator.');
          auth.signOut();
        }
      } else {
        setIsAdmin(false);
        setIsSimulated(false);
      }
    });
    return () => unsub();
  }, [language]);

  // Sync activePromo state inputs
  useEffect(() => {
    if (activePromo) {
      setPromoTitle(activePromo.title);
      setPromoTitleAr(activePromo.titleAr);
      setPromoPercent(activePromo.discountPercent);
      setPromoImageUrl(activePromo.imageUrl || '');
      try {
        const date = new Date(activePromo.endsAt);
        const formatted = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);
        setPromoEndsAt(formatted);
      } catch (e) {
        setPromoEndsAt('');
      }
      setPromoIsActive(activePromo.isActive);
    } else {
      setPromoTitle('');
      setPromoTitleAr('');
      setPromoPercent(15);
      setPromoImageUrl('');
      const defaultEnds = new Date(Date.now() + 120 * 60 * 1000); // 2 hours
      const formatted = new Date(defaultEnds.getTime() - defaultEnds.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);
      setPromoEndsAt(formatted);
      setPromoIsActive(false);
    }
  }, [activePromo]);

  // Sync business settings variables from props
  useEffect(() => {
    if (businessSettings) {
      setSetRestaurantNameAr(businessSettings.restaurantNameAr || '');
      setSetRestaurantNameEn(businessSettings.restaurantNameEn || '');
      setSetTaglineAr(businessSettings.taglineAr || '');
      setSetTaglineEn(businessSettings.taglineEn || '');
      setSetLogoUrl(businessSettings.logoUrl || '');
      setSetPhone(businessSettings.phone || '');
      setSetWhatsappNumber(businessSettings.whatsappNumber || '');
      setSetAddressAr(businessSettings.addressAr || '');
      setSetAddressEn(businessSettings.addressEn || '');
      setSetVatNumber(businessSettings.vatNumber || '');
      setSetTaxEnabled(businessSettings.taxEnabled ?? true);
      setSetTaxPercent(businessSettings.taxPercent ?? 15);
      setSetTaxMethod(businessSettings.taxMethod || 'inclusive');
      setSetWorkingHoursStart(businessSettings.workingHoursStart || '17:00');
      setSetWorkingHoursEnd(businessSettings.workingHoursEnd || '02:00');
      setSetDeliveryFee(businessSettings.deliveryFee ?? 15);
      setSetReceiptWidth(businessSettings.receiptWidth || '80mm');
      
      // Sync bank settings
      setBankNameAr(businessSettings.bankNameAr || 'مصرف الراجحي');
      setBankNameEn(businessSettings.bankNameEn || 'Al Rajhi Bank');
      setBankAccountNameAr(businessSettings.bankAccountNameAr || 'مؤسسة رحلة شواء لتقديم الوجبات');
      setBankAccountNameEn(businessSettings.bankAccountNameEn || 'Grilling Journey Meals Est.');
      setBankAccountNumber(businessSettings.bankAccountNumber || '432608010007890');
      setBankIban(businessSettings.bankIban || 'SA8380000432608010007890');
      setBankQrUrl(businessSettings.bankQrUrl || 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=432608010007890');
      setSetReceiptFontSize(businessSettings.receiptFontSize ?? 11);
      setSetReceiptLogoSize(businessSettings.receiptLogoSize ?? 80);
      setSetShowKitchenSlipOnPrint(businessSettings.showKitchenSlipOnPrint ?? true);
      setSetShowCustomerReceiptOnPrint(businessSettings.showCustomerReceiptOnPrint ?? true);
      setSetKitchenSlipFontSize(businessSettings.kitchenSlipFontSize ?? 12);
      setSetKitchenSlipHeaderAr(businessSettings.kitchenSlipHeaderAr || 'فاتورة تحضير المطبخ');
      setSetKitchenSlipHeaderEn(businessSettings.kitchenSlipHeaderEn || 'Kitchen Preparation Slip');
      setSetInvoiceFooterAr(businessSettings.invoiceFooterAr || '');
      setSetInvoiceFooterEn(businessSettings.invoiceFooterEn || '');
      setCashierPrinterType(businessSettings.cashierPrinterType || 'browser');
      setCashierPrinterIp(businessSettings.cashierPrinterIp || 'localhost');
      setCashierPrinterPort(businessSettings.cashierPrinterPort ?? 12212);
      setKitchenPrinterType(businessSettings.kitchenPrinterType || 'browser');
      setKitchenPrinterIp(businessSettings.kitchenPrinterIp || 'localhost');
      setKitchenPrinterPort(businessSettings.kitchenPrinterPort ?? 12212);
      setPrintRoutingMode(businessSettings.printRoutingMode || 'unified');
    }
  }, [businessSettings]);

  // Handle saving restaurant branding config & tax controls
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setRestaurantNameAr || !setRestaurantNameEn) {
      showNotification(language === 'ar' ? 'يرجى إدخال اسم المطعم بلغتين' : 'Please fill restaurant name parameters in both languages', 'warning');
      return;
    }

    const compiled: import('../types').BusinessSettings = {
      restaurantNameAr: setRestaurantNameAr,
      restaurantNameEn: setRestaurantNameEn,
      taglineAr: setTaglineAr,
      taglineEn: setTaglineEn,
      logoUrl: setLogoUrl,
      phone: setPhone,
      whatsappNumber: setWhatsappNumber,
      addressAr: setAddressAr,
      addressEn: setAddressEn,
      vatNumber: setVatNumber,
      taxEnabled: setTaxEnabled,
      taxPercent: Number(setTaxPercent),
      taxMethod: setTaxMethod,
      workingHoursStart: setWorkingHoursStart,
      workingHoursEnd: setWorkingHoursEnd,
      receiptWidth: setReceiptWidth,
      bankNameAr: bankNameAr,
      bankNameEn: bankNameEn,
      bankAccountNameAr: bankAccountNameAr,
      bankAccountNameEn: bankAccountNameEn,
      bankAccountNumber: bankAccountNumber,
      bankIban: bankIban,
      bankQrUrl: bankQrUrl,
      receiptFontSize: Number(setReceiptFontSize),
      receiptLogoSize: Number(setReceiptLogoSize),
      showKitchenSlipOnPrint: setShowKitchenSlipOnPrint,
      showCustomerReceiptOnPrint: setShowCustomerReceiptOnPrint,
      kitchenSlipFontSize: Number(setKitchenSlipFontSize),
      kitchenSlipHeaderAr: setKitchenSlipHeaderAr,
      kitchenSlipHeaderEn: setKitchenSlipHeaderEn,
      invoiceFooterAr: setInvoiceFooterAr,
      invoiceFooterEn: setInvoiceFooterEn,
      cashierPrinterType: cashierPrinterType,
      cashierPrinterIp: cashierPrinterIp,
      cashierPrinterPort: Number(cashierPrinterPort),
      kitchenPrinterType: kitchenPrinterType,
      kitchenPrinterIp: kitchenPrinterIp,
      kitchenPrinterPort: Number(kitchenPrinterPort),
      printRoutingMode: printRoutingMode,
      deliveryFee: Number(setDeliveryFee)
    };

    if (onSettingsUpdate) {
      onSettingsUpdate(compiled);
    }

    if (isAdmin) {
      try {
        await setDoc(doc(db, 'settings', 'business'), compiled);
        showNotification(language === 'ar' ? 'تم حفظ وتعميم معلومات النشاط الهوية الرقمية بنجاح!' : 'Business branding settings saved to Firestore database!', 'success');
      } catch (err) {
        console.error('Failed to commit business variables:', err);
        handleFirestoreError(err, OperationType.WRITE, 'settings/business');
      }
    } else {
      localStorage.setItem('simulated_business_settings', JSON.stringify(compiled));
      showNotification(language === 'ar' ? 'تم تطبيق المعلمات محلياً في المحاكي بنجاح!' : 'Branding updated locally inside simulator session.', 'success');
    }
  };

  // Fetch orders from Firestore once authorized OR fetch from local simulated store
  useEffect(() => {
    let unsub = () => {};

    if (isAdmin) {
      setLoadingOrders(true);
      const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      
      unsub = onSnapshot(
        ordersQuery,
        (snapshot) => {
          setLoadingOrders(false);
          const docs: Order[] = [];
          snapshot.forEach((snap) => {
            docs.push(snap.data() as Order);
          });

          // Play Audio Bell chime if a NEW order was added to the list
          if (docs.length > previousOrdersCountRef.current && previousOrdersCountRef.current > 0) {
            if (soundEnabled) {
              playOrderChime();
            }
          }
          previousOrdersCountRef.current = docs.length;
          setOrders(docs);
        },
        (error) => {
          setLoadingOrders(false);
          console.error('Failed snapshot orders:', error);
          try {
            handleFirestoreError(error, OperationType.LIST, 'orders');
          } catch (e) {
            // Error logged to console gracefully, prevent app crash
          }
        }
      );
    } else if (isSimulated) {
      // Mock loading of sample orders to establish standard analytics
      const savedOrders = localStorage.getItem('simulated_orders');
      if (savedOrders) {
        const parsed = JSON.parse(savedOrders);
        setOrders(parsed);
        previousOrdersCountRef.current = parsed.length;
      } else {
        const dummy: Order[] = [
          {
            id: 'Rehla-7001',
            customerName: 'محمد الربيعان',
            customerPhone: '0551029302',
            tableOrDelivery: 'table',
            tableNumber: '3',
            items: [
              { id: 'g1', name: 'Beef Kabab (4 Skewers)', nameAr: 'كباب لحم نفر 4 سيخ', price: 25, quantity: 2 },
              { id: 'c1', name: 'Plain Arabic Coffee', nameAr: 'قهوة سادة', price: 10, quantity: 1 }
            ],
            subtotal: 60,
            tax: 9,
            total: 69,
            paymentMethod: 'mada',
            status: 'preparing',
            whatsappSent: true,
            createdAt: new Date().toISOString()
          },
          {
            id: 'Rehla-7002',
            customerName: 'محمد الربيعان',
            customerPhone: '0502030405',
            tableOrDelivery: 'delivery',
            deliveryAddress: 'المربع، شارع خالد بن الوليد، مخرج 3',
            items: [
              { id: 's1', name: 'Sarookh Shawarma', nameAr: 'شاورما صاروخ', price: 9, quantity: 3 },
              { id: 'd1', name: 'Cheese Beehive Bread', nameAr: 'خلية جبن', price: 10, quantity: 1 }
            ],
            subtotal: 37,
            tax: 5.55,
            total: 42.55,
            paymentMethod: 'applepay',
            status: 'delivered',
            whatsappSent: true,
            createdAt: new Date(Date.now() - 3600000).toISOString()
          }
        ];
        localStorage.setItem('simulated_orders', JSON.stringify(dummy));
        setOrders(dummy);
        previousOrdersCountRef.current = dummy.length;
      }
    }

    return () => unsub();
  }, [isAdmin, isSimulated, soundEnabled]);

  // Fetch drivers from Firestore or local simulated store
  useEffect(() => {
    let unsub = () => {};

    if (isAdmin) {
      setLoadingDrivers(true);
      const driversQuery = query(collection(db, 'drivers'), orderBy('createdAt', 'desc'));
      
      unsub = onSnapshot(
        driversQuery,
        (snapshot) => {
          setLoadingDrivers(false);
          const docs: Driver[] = [];
          snapshot.forEach((snap) => {
            docs.push(snap.data() as Driver);
          });
          setDrivers(docs);
        },
        (error) => {
          setLoadingDrivers(false);
          console.error('Failed snapshot drivers:', error);
        }
      );
    } else if (isSimulated) {
      const savedDrivers = localStorage.getItem('simulated_drivers');
      if (savedDrivers) {
        setDrivers(JSON.parse(savedDrivers));
      } else {
        const initialDrivers: Driver[] = [
          { id: 'drv-1', name: 'محمد الربيعان', phone: '0512345678', status: 'available', createdAt: new Date().toISOString() },
          { id: 'drv-2', name: 'محمد الربيعان', phone: '0598765432', status: 'busy', createdAt: new Date().toISOString() },
        ];
        localStorage.setItem('simulated_drivers', JSON.stringify(initialDrivers));
        setDrivers(initialDrivers);
      }
    } else {
      setDrivers([]);
    }

    return () => unsub();
  }, [isAdmin, isSimulated]);

  // Fetch pending drivers from Firestore
  useEffect(() => {
    let unsub = () => {};

    if (isAdmin) {
      setLoadingPendingDrivers(true);
      const pendingQuery = query(collection(db, 'pending_drivers'), orderBy('createdAt', 'desc'));
      
      unsub = onSnapshot(
        pendingQuery,
        (snapshot) => {
          setLoadingPendingDrivers(false);
          const docs: PendingDriver[] = [];
          snapshot.forEach((snap) => {
            docs.push({ id: snap.id, ...snap.data() } as PendingDriver);
          });
          setPendingDrivers(docs);
        },
        (error) => {
          setLoadingPendingDrivers(false);
          console.error('Failed snapshot pending drivers:', error);
        }
      );
    } else {
      setPendingDrivers([]);
    }

    return () => unsub();
  }, [isAdmin]);

  // Continuous alarm checker for pending orders whose 60-second customer grace period has ended
  useEffect(() => {
    if (!soundEnabled) {
      stopContinuousAlarm();
      return;
    }

    const checkAndTriggerAlarm = () => {
      const now = Date.now();
      const needsAlarm = orders.some((ord) => {
        if (ord.status === 'pending') {
          const createdAtTime = new Date(ord.createdAt).getTime();
          const elapsedMs = now - createdAtTime;
          // Trigger continuous alarm only after 60 seconds (60000ms) has expired
          return elapsedMs >= 60000;
        }
        return false;
      });

      if (needsAlarm) {
        startContinuousAlarm();
      } else {
        stopContinuousAlarm();
      }
    };

    // Run the check immediately and then every 1 second
    checkAndTriggerAlarm();
    const interval = setInterval(checkAndTriggerAlarm, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [orders, soundEnabled]);

  // Clean up alarm only when the AdminPanel component unmounts entirely
  useEffect(() => {
    return () => {
      stopContinuousAlarm();
    };
  }, []);

  const getNextStatus = (current: string, deliveryType: 'table' | 'takeaway' | 'delivery' | string) => {
    if (current === 'pending') return 'received';
    if (current === 'received') return deliveryType === 'delivery' ? 'searching_driver' : 'preparing';
    if (current === 'searching_driver') return 'preparing';
    if (current === 'preparing') return 'ready';
    if (current === 'ready') return deliveryType === 'delivery' ? 'driver_picked_up' : 'delivered';
    if (current === 'driver_picked_up') return 'on_the_way';
    if (current === 'on_the_way') return 'delivered';
    return null;
  };

  const getNextStatusLabelAr = (next: string) => {
    switch (next) {
      case 'received': return 'تأكيد واستلام الطلب ✅';
      case 'searching_driver': return 'البحث عن مندوب توصيل 🔍';
      case 'preparing': return 'بدء التحضير والطهي 🔥';
      case 'ready': return 'تجهيز الطلب للتسليم 📦';
      case 'driver_picked_up': return 'تم الاستلام بواسطة المندوب 🚴';
      case 'on_the_way': return 'بدء خطوة التوصيل 📍';
      case 'delivered': return 'تسليم الطلب للعميل 🎉';
      default: return next;
    }
  };

  const getNextStatusLabelEn = (next: string) => {
    switch (next) {
      case 'received': return 'Accept & Receive Order ✅';
      case 'searching_driver': return 'Search for Driver 🔍';
      case 'preparing': return 'Start Preparing / Cooking 🔥';
      case 'ready': return 'Mark Ready 📦';
      case 'driver_picked_up': return 'Mark Picked Up by Driver 🚴';
      case 'on_the_way': return 'Start Delivery 📍';
      case 'delivered': return 'Complete & Deliver 🎉';
      default: return next;
    }
  };

  const getStatusLabelAr = (status: string) => {
    switch (status) {
      case 'pending': return 'بانتظار التأكيد ⏳';
      case 'received': return 'تم استلام الطلب ✅';
      case 'searching_driver': return 'البحث عن مندوب 🔍';
      case 'preparing': return 'جاري التجهيز والتحضير 🔥';
      case 'ready': return 'الطلب جاهز للتسليم 📦';
      case 'driver_picked_up': return 'استلم المندوب 🚴';
      case 'on_the_way': return 'جاري التوصيل 📍';
      case 'delivered': return 'تم التوصيل والتسليم 🎉';
      case 'cancelled': return 'ملغى ❌';
      default: return status;
    }
  };

  const getStatusLabelEn = (status: string) => {
    switch (status) {
      case 'pending': return 'Pending Acceptance ⏳';
      case 'received': return 'Order Received ✅';
      case 'searching_driver': return 'Searching for Driver 🔍';
      case 'preparing': return 'Preparing / Cooking 🔥';
      case 'ready': return 'Order Ready 📦';
      case 'driver_picked_up': return 'Picked Up by Driver 🚴';
      case 'on_the_way': return 'On the Way 📍';
      case 'delivered': return 'Delivered 🎉';
      case 'cancelled': return 'Cancelled ❌';
      default: return status;
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError('');
    setLoginLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      let errMsg = err.message;
      if (err.code === 'auth/popup-blocked' || err.message?.includes('popup')) {
        errMsg = language === 'ar'
          ? 'تم حظر نافذة تسجيل الدخول المنبثقة من قِبل المتصفح. يُرجى النقر على زر "فتح لوحة التحكم في نافذة مستقلة" بالأعلى لفتح الموقع في تبويب جديد وتفادي قيود إطار المعاينة، أو استخدم نموذج البريد الإلكتروني وكلمة المرور بالأسفل.'
          : 'Login popup blocked by your browser. Please click the "Open Admin Panel in New Tab" button above to access the dashboard directly without iframe restrictions, or use the Email & Password form below.';
      } else {
        errMsg = language === 'ar'
          ? `فشل تسجيل الدخول عبر Google: ${err.message || 'خطأ غير معروف'}`
          : `Google Sign In failed: ${err.message || 'Unknown error'}`;
      }
      setLoginError(errMsg);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, loginEmail, loginPassword);
        showNotification(language === 'ar' ? 'تم تسجيل وتعيين كلمة مرور المسؤول بنجاح!' : 'Admin account registered successfully!', 'success');
      } else {
        await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
        showNotification(language === 'ar' ? 'تم تسجيل الدخول بنجاح!' : 'Logged in successfully!', 'success');
      }
    } catch (err: any) {
      console.error('Email Auth Error:', err);
      let errMsg = err.message;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errMsg = language === 'ar'
          ? 'خطأ في البريد الإلكتروني أو كلمة المرور. يرجى التأكد من كتابة كلمة المرور بشكل صحيح، أو تفعيل خيار "إنشاء حساب مسؤول جديد" بالأسفل لتعيين كلمة المرور.'
          : 'Incorrect email or password. Please make sure they are correct, or check the option "Create new admin account" below to set a new password.';
      }
      setLoginError(errMsg);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setIsAdmin(false);
      setIsSimulated(false);
      setOrders([]);
    } catch (err) {
      console.error('Sign Out Error:', err);
    }
  };

  const handleSimulateMode = () => {
    setIsSimulated(true);
    setIsAdmin(false);
  };

  // Seeding Default database menu items to Firebase
  const handleSeedDatabase = async () => {
    if (!isAdmin) return;
    setSeedingLoading(true);
    setSeedingSuccessMsg('');
    try {
      for (const item of INITIAL_MENU_ITEMS) {
        await setDoc(doc(db, 'menuItems', item.id), item);
      }
      setSeedingSuccessMsg(t('seedSuccess'));
      showNotification(language === 'ar' ? 'تم تأسيس وتحديث قائمة المأكولات بنجاح!' : 'Menu catalog seeded successfully!', 'success');
      // Sync menu state in the shell
      onMenuUpdate(INITIAL_MENU_ITEMS);
    } catch (err) {
      console.error(err);
      showNotification(language === 'ar' ? `خطأ في التأسيس: ${err}` : `Error seeding items: ${err}`, 'error');
    } finally {
      setSeedingLoading(false);
    }
  };

  const handleSeedDatabaseClick = () => {
    setConfirmDialog({
      isOpen: true,
      titleAr: 'تأسيس وتهيئة قائمة الطعام',
      titleEn: 'Initialize Menu Catalog',
      messageAr: '🚨 تحذير! هل أنت متأكد من رغبتك في إعادة تهيئة وضخ القائمة الافتراضية؟ سيؤدي هذا الإجراء لإعادة كافة الأسعار والمسميات والصور لوضعها الافتراضي وقد يلغي تعديلاتك الحالية.',
      messageEn: '🚨 Warning! Are you sure you want to seed and initialize the default menu catalog? This will reset all names, prices, and images to their original factory values, which may overwrite your custom edits.',
      actionLabelAr: 'تأسيس وتهيئة',
      actionLabelEn: 'Seed & Initialize',
      isDanger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        await handleSeedDatabase();
      }
    });
  };

  // State status changer
  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    const originalOrders = [...orders];

    // Optimistic local state update for instant client responsiveness
    const optimisticOrders = orders.map((o) => {
      if (o.id === orderId) {
        return { ...o, status: nextStatus };
      }
      return o;
    });
    setOrders(optimisticOrders);
    setUpdatingId(orderId);

    // Send the WhatsApp notification to customer
    const orderToUpdate = orders.find(o => o.id === orderId);
    if (orderToUpdate) {
      let cleanPhone = orderToUpdate.customerPhone.replace(/\D/g, "");
      if (cleanPhone.startsWith("05") && cleanPhone.length === 10) {
        cleanPhone = "966" + cleanPhone.substring(1);
      } else if (cleanPhone.startsWith("5") && cleanPhone.length === 9) {
        cleanPhone = "966" + cleanPhone;
      }

      const trackingLink = `${window.location.origin}/?orderId=${orderId}`;
      let welcome = `يا هلا والله بـ ${orderToUpdate.customerName} 👋`;
      let body = "";

      switch (nextStatus) {
        case 'received':
          welcome = `يا هلا والله بـ ${orderToUpdate.customerName} 😍 أبشرك طلبك تم قبوله الحين!`;
          const transferNote = orderToUpdate.paymentMethod === 'transfer'
            ? `\n\n🌸 لطفاً ومحبة، بما أنك اخترت الدفع عبر التحويل البنكي، يسعدنا جداً لو ترسل لنا صورة إيصال التحويل هنا في الواتساب لتأكيد طلبك وتجهيزه فوراً! ❤️`
            : '';
          body = `طلبك رقم (#${orderId}) صار مؤكد وبدأنا بالتحضير الفوري. خلك ريلاكس وتابع طلبك خطوة بخطوة من هنا:\n${trackingLink}&transferNote\n\nشكراً لاختيارك لنا يا غالي! ❤️`;
          break;
        case 'preparing':
          welcome = `يا هلا يا ${orderToUpdate.customerName} 🔥`;
          const preparingTransferNote = orderToUpdate.paymentMethod === 'transfer'
            ? `\n\n🌸 تذكير لطيف: إذا لم تقم بإرسال إيصال التحويل بعد، يرجى مشاركته معنا هنا في الواتساب لتأكيد الدفع. شكراً لك! ❤️`
            : '';
          body = `طلبك رقم (#${orderId}) الحين على الجمر وبدأ يستوي على كيف كيفك! 🍢🥤\nتابع حالته مباشرة من هنا:\ndots${trackingLink}dots${preparingTransferNote}`;
          break;
        case 'ready':
          if (orderToUpdate.tableOrDelivery === 'delivery') {
            welcome = `أبشر بالخير يا ${orderToUpdate.customerName} 📦`;
            body = `طلبك رقم (#${orderId}) صار جاهز وساخن ومنتظر المندوب يستلمه الآن للحركة!\nتتبع من هنا:\n${trackingLink}`;
          } else {
            welcome = `يا هلا يا ${orderToUpdate.customerName} 🎉`;
            const locationType = orderToUpdate.tableOrDelivery === 'table' ? `طاولة رقم ${orderToUpdate.tableNumber}` : 'قسم الاستلام سفري';
            const readyTransferNote = orderToUpdate.paymentMethod === 'transfer'
              ? `\n\n🌸 يرجى إبراز إيصال التحويل البنكي للموظف عند الاستلام لتأكيد الدفع. شكراً جزيلاً لك! ❤️`
              : '';
            body = `طلبك رقم (#${orderId}) صار جاهز وساخن ولذيذ وينتظرك في (${locationType})! بالهناء والعافية على قلبك 😍\nرابط تتبع الطلب:\n${trackingLink}${readyTransferNote}`;
          }
          break;
        case 'on_the_way':
        case 'driver_picked_up':
          welcome = `يا هلا والله بـ ${orderToUpdate.customerName} 🚴`;
          const driverInfo = orderToUpdate.driverName 
            ? `\nاسم المندوب: ${orderToUpdate.driverName}\nرقم المندوب: ${orderToUpdate.driverPhone}`
            : '';
          let paymentNote = '';
          if (orderToUpdate.paymentMethod === 'cod') {
            const fee = orderToUpdate.deliveryFee ?? (orderToUpdate.tableOrDelivery === 'delivery' ? (businessSettings?.deliveryFee ?? 15) : 0);
            const totalWithFee = orderToUpdate.total;
            const mealPrice = orderToUpdate.total - fee;
            paymentNote = `\n\n⚠️ الدفع عند الاستلام: يرجى تجهيز كامل المبلغ المطلوب للمندوب عند الاستلام وهو: ${totalWithFee} ريال (قيمة الوجبات: ${mealPrice} ريال + رسوم التوصيل: ${fee} ريال).`;
          } else if (orderToUpdate.paymentMethod === 'transfer') {
            paymentNote = `\n\n🌸 لطفاً ومحبة، بما أن طريقة الدفع هي التحويل البنكي، يرجى إرفاق وإرسال صورة إيصال التحويل هنا عبر الواتساب أو مشاركتها مباشرة مع المندوب البطل لتأكيد الدفع والاستلام بنجاح! شكراً لتعاونك ولطفك الدائم يا غالي! ❤️`;
          } else {
            paymentNote = `\n\n✅ حالة الدفع: [مدفوع مسبقاً إلكترونياً] 💳\nتم سداد قيمة الطلب إلكترونياً بنجاح! لا يتوجب عليك دفع أي مبالغ للمندوب للوجبات.`;
          }
          body = `طلبك رقم (#${orderId}) طار الحين مع المندوب وهو بالطريق يوصله لك طازج وحار! 🍢${driverInfo}\nتتبع موقع المندوب والطلب مباشرة من هنا:\n${trackingLink}${paymentNote}`;
          break;
        case 'delivered':
          welcome = `يا هلا والله بـ ${orderToUpdate.customerName} 🎉`;
          body = `ألف عافية وصحة على قلبك! طلبك رقم (#${orderId}) تم تسليمه بنجاح. 😍\nيسعدنا لو تشاركنا رأيك وتقييمك وتنورنا المرات الجاية ❤️`;
          break;
        case 'cancelled':
          welcome = `يا هلا يا ${orderToUpdate.customerName} 😔`;
          body = `نعتذر منك جداً، طلبك رقم (#${orderId}) تم إلغاؤه من قبل الإدارة لعدم التوفر أو لسبب طارئ. نتشرف بخدمتك في وقت آخر وعساك على القوة!`;
          break;
        default:
          body = `طلبك رقم (#${orderId}) تم تحديث حالته إلى: ${nextStatus}\nرابط تتبع:\n${trackingLink}`;
      }

      const fullMessage = `${welcome}\n\n${body}`;
      const waUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(fullMessage)}`;
      window.open(waUrl, '_blank');
    }

    if (isAdmin) {
      try {
        await updateDoc(doc(db, 'orders', orderId), { status: nextStatus });
      } catch (err) {
        console.error("Failed to commit order status, rolling back:", err);
        setOrders(originalOrders);
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      } finally {
        setUpdatingId(null);
      }
    } else if (isSimulated) {
      localStorage.setItem('simulated_orders', JSON.stringify(optimisticOrders));
      setUpdatingId(null);
    }
  };

    // Add/Edit driver
  const handleSaveDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverName || !driverPhone) {
      showNotification(language === 'ar' ? 'الرجاء ملء جميع الحقول المطلوبة!' : 'Please fill in all fields!', 'error');
      return;
    }

    const cleanPhone = driverPhone.trim();
    const newDriver: Driver = {
      id: `drv-${Date.now()}`,
      name: driverName.trim(),
      phone: cleanPhone,
      status: 'available',
      createdAt: new Date().toISOString()
    };

    const originalDrivers = [...drivers];
    let updatedDrivers = [...drivers];

    updatedDrivers.unshift(newDriver);

    if (isAdmin) {
      try {
        await setDoc(doc(db, 'drivers', newDriver.id), newDriver);
        showNotification(language === 'ar' ? 'تم إضافة المندوب بنجاح!' : 'Driver added successfully!', 'success');
      } catch (err) {
        console.error("Failed to add driver:", err);
        handleFirestoreError(err, OperationType.WRITE, `drivers/${newDriver.id}`);
      }
    } else if (isSimulated) {
      setDrivers(updatedDrivers);
      localStorage.setItem('simulated_drivers', JSON.stringify(updatedDrivers));
      showNotification(language === 'ar' ? 'تم إضافة المندوب في المحاكاة!' : 'Driver added in simulator!', 'success');
    }

    setDriverName('');
    setDriverPhone('');
  };

  // Toggle driver availability
  const handleToggleDriverStatus = async (driverId: string, currentStatus: 'available' | 'busy') => {
    const nextStatus = currentStatus === 'available' ? 'busy' : 'available';
    const originalDrivers = [...drivers];
    const updatedDrivers = drivers.map((d) => {
      if (d.id === driverId) {
        return { ...d, status: nextStatus };
      }
      return d;
    });

    if (isAdmin) {
      setUpdatingDriverId(driverId);
      try {
        await updateDoc(doc(db, 'drivers', driverId), { status: nextStatus });
        showNotification(language === 'ar' ? 'تم تحديث حالة المندوب!' : 'Driver status updated!', 'success');
      } catch (err) {
        console.error("Failed to update driver status:", err);
        handleFirestoreError(err, OperationType.UPDATE, `drivers/${driverId}`);
      } finally {
        setUpdatingDriverId(null);
      }
    } else if (isSimulated) {
      setDrivers(updatedDrivers);
      localStorage.setItem('simulated_drivers', JSON.stringify(updatedDrivers));
      showNotification(language === 'ar' ? 'تم تحديث حالة المندوب في المحاكاة!' : 'Driver status updated in simulator!', 'success');
    }
  };

  // Delete driver
  const handleDeleteDriver = async (driverId: string) => {
    const originalDrivers = [...drivers];
    const updatedDrivers = drivers.filter((d) => d.id !== driverId);

    if (isAdmin) {
      setUpdatingDriverId(driverId);
      try {
        await deleteDoc(doc(db, 'drivers', driverId));
        showNotification(language === 'ar' ? 'تم حذف المندوب بنجاح!' : 'Driver deleted successfully!', 'success');
      } catch (err) {
        console.error("Failed to delete driver:", err);
        handleFirestoreError(err, OperationType.DELETE, `drivers/${driverId}`);
      } finally {
        setUpdatingDriverId(null);
      }
    } else if (isSimulated) {
      setDrivers(updatedDrivers);
      localStorage.setItem('simulated_drivers', JSON.stringify(updatedDrivers));
      showNotification(language === 'ar' ? 'تم حذف المندوب في المحاكاة!' : 'Driver deleted in simulator!', 'success');
    }
  };

  // Approve pending driver registration
  const handleApprovePendingDriver = async (pending: PendingDriver) => {
    if (!isAdmin) return;
    setUpdatingDriverId(pending.id);
    try {
      const newDriver: Driver = {
        id: `drv-${Date.now()}`,
        name: pending.name,
        phone: pending.phone,
        status: 'available',
        createdAt: new Date().toISOString()
      };
      
      // 1. Add to drivers collection
      await setDoc(doc(db, 'drivers', newDriver.id), newDriver);
      
      // 2. Delete from pending_drivers
      await deleteDoc(doc(db, 'pending_drivers', pending.id));
      
      showNotification(language === 'ar' ? 'تم قبول المندوب وإضافته للمعتمدين بنجاح! ✅' : 'Driver approved and registered successfully! ✅', 'success');
    } catch (err) {
      console.error("Failed to approve driver:", err);
      showNotification(language === 'ar' ? 'فشل قبول المندوب' : 'Failed to approve driver', 'error');
    } finally {
      setUpdatingDriverId(null);
    }
  };

  // Reject pending driver registration
  const handleRejectPendingDriver = async (pendingId: string) => {
    if (!isAdmin) return;
    setUpdatingDriverId(pendingId);
    try {
      await deleteDoc(doc(db, 'pending_drivers', pendingId));
      showNotification(language === 'ar' ? 'تم رفض طلب التسجيل وحذفه ❌' : 'Registration request rejected and removed ❌', 'success');
    } catch (err) {
      console.error("Failed to reject driver registration:", err);
      showNotification(language === 'ar' ? 'فشل رفض المندوب' : 'Failed to reject driver', 'error');
    } finally {
      setUpdatingDriverId(null);
    }
  };

  // Assign driver to order
  const handleAssignDriver = async (orderId: string, driver: Driver | null) => {
    const originalOrders = [...orders];
    const optimisticOrders = orders.map((o) => {
      if (o.id === orderId) {
        return {
          ...o,
          driverId: driver ? driver.id : null,
          driverName: driver ? driver.name : null,
          driverPhone: driver ? driver.phone : null
        } as Order;
      }
      return o;
    });

    setOrders(optimisticOrders);

    if (isAdmin) {
      try {
        await updateDoc(doc(db, 'orders', orderId), {
          driverId: driver ? driver.id : null,
          driverName: driver ? driver.name : null,
          driverPhone: driver ? driver.phone : null
        });
        showNotification(language === 'ar' ? 'تم تعيين المندوب للطلب بنجاح!' : 'Driver assigned to order successfully!', 'success');
      } catch (err) {
        console.error("Failed to assign driver:", err);
        setOrders(originalOrders);
        handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
      }
    } else if (isSimulated) {
      localStorage.setItem('simulated_orders', JSON.stringify(optimisticOrders));
      showNotification(language === 'ar' ? 'تم تعيين المندوب في المحاكاة!' : 'Driver assigned in simulator!', 'success');
    }
  };

  // Send WhatsApp message with order details to assigned driver
  const handleSendDriverDetails = (ord: Order) => {
    if (!ord.driverPhone) return;

    // Format driver phone
    let cleanPhone = ord.driverPhone.replace(/\D/g, "");
    if (cleanPhone.startsWith("05") && cleanPhone.length === 10) {
      cleanPhone = "966" + cleanPhone.substring(1);
    } else if (cleanPhone.startsWith("5") && cleanPhone.length === 9) {
      cleanPhone = "966" + cleanPhone;
    }

    // Format order items
    const itemsText = ord.items.map(it => `- ${it.nameAr} x${it.quantity}`).join('\n');

    // Format location
    let locationText = ord.deliveryAddress || 'لم يحدد العنوان بالتفصيل';
    if (ord.latitude && ord.longitude) {
      locationText += `\n📍 رابط موقع العميل على الخريطة:\nhttps://www.google.com/maps?q=${ord.latitude},${ord.longitude}`;
    }

    // Format delivery fee from settings
    const fee = ord.deliveryFee ?? (ord.tableOrDelivery === 'delivery' ? (businessSettings?.deliveryFee ?? 15) : 0);
    const totalDue = ord.total;
    const mealPrice = ord.total - fee;

    let paymentText = '';
    if (ord.paymentMethod === 'cod') {
      paymentText = `⚠️ الدفع: [كاش عند الاستلام] 💵\n🚨 تنبيه هام جداً للمندوب: يجب عليك تحصيل كامل المبلغ من العميل (قيمة الطلب + رسوم التوصيل)! يرجى عدم تسليم الطلب للعميل إلا بعد استلام كامل المبلغ المذكور أدناه 🚨\n\n💰 قيمة الطلب (الوجبات): ${mealPrice} ريال\n🚴 رسوم التوصيل: ${fee} ريال\n💵 إجمالي المبلغ المطلوب تحصيله بالكامل: ${totalDue} ريال`;
    } else if (ord.paymentMethod === 'transfer') {
      paymentText = `🏦 الدفع: [تحويل بنكي] 🧾\n⚠️ يرجى من المندوب التأكد من رؤية/استلام صورة إيصال التحويل البنكي من العميل لتأكيد الدفع قبل تسليم الطلب!`;
    } else {
      paymentText = `✅ الدفع: [مدفوع مسبقاً إلكترونياً] 💳\n(تم سداد قيمة الطلب إلكترونياً بنجاح! لا تحصّل أي مبالغ من العميل للوجبات)`;
    }

    const msg = `يا هلا بـ مندوبنا البطل 🚴\nإليك تفاصيل طلب التوصيل الجديد رقم (#${ord.id}):\n\n` +
      `👤 اسم العميل: ${ord.customerName}\n` +
      `📞 رقم العميل: ${ord.customerPhone}\n` +
      `📍 موقع التوصيل: ${locationText}\n\n` +
      `📋 تفاصيل الطلب:\n${itemsText}\n` +
      `${ord.notes ? `📝 ملاحظات: ${ord.notes}\n` : ''}\n` +
      `${paymentText}\n\n` +
      `تأكد من تسليم الوجبة ساخنة وطازجة ولذيذة يا بطل! بالتوفيق ❤️`;

    window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Delete a single order permanently
  const handleDeleteOrder = (orderId: string) => {
    setConfirmDialog({
      isOpen: true,
      titleAr: 'حذف طلب نهائياً',
      titleEn: 'Delete Order Permanently',
      messageAr: `هل أنت متأكد من رغبتك في حذف الطلب رقم (${orderId}) نهائياً؟ لا يمكن استرجاع الطلب بعد الحذف.`,
      messageEn: `Are you sure you want to permanently delete order (${orderId})? This action cannot be undone.`,
      actionLabelAr: 'حذف الطلب',
      actionLabelEn: 'Delete Order',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        try {
          if (isAdmin) {
            await deleteDoc(doc(db, 'orders', orderId));
            showNotification(language === 'ar' ? 'تم حذف الطلب بنجاح من السحابة!' : 'Order deleted successfully from live database!', 'success');
          } else if (isSimulated) {
            const remaining = orders.filter((o) => o.id !== orderId);
            localStorage.setItem('simulated_orders', JSON.stringify(remaining));
            setOrders(remaining);
            showNotification(language === 'ar' ? 'تم حذف الطلب بنجاح من المحاكي!' : 'Order deleted successfully from demo session!', 'success');
          }
        } catch (err) {
          console.error(err);
          const errMsg = err instanceof Error ? err.message : String(err);
          showNotification(language === 'ar' ? `خطأ أثناء الحذف: ${errMsg}` : `Error deleting order: ${errMsg}`, 'error');
          if (isAdmin) {
            handleFirestoreError(err, OperationType.DELETE, `orders/${orderId}`);
          }
        }
      }
    });
  };

  // Delete all completed and cancelled orders
  const handleDeleteFinishedOrders = () => {
    setConfirmDialog({
      isOpen: true,
      titleAr: 'تصفير وتنظيف الطلبات المنتهية',
      titleEn: 'Clear Completed & Cancelled Orders',
      messageAr: 'هل أنت متأكد من رغبتك في حذف جميع الطلبات المكتملة والملغاة نهائياً؟ سيتم الإبقاء على الطلبات قيد التحضير والجديدة فقط.',
      messageEn: 'Are you sure you want to permanently delete all completed and cancelled orders? Only pending and preparing orders will be kept.',
      actionLabelAr: 'تنظيف السجلات',
      actionLabelEn: 'Clean Logs',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        setClearingOrders(true);
        try {
          const finished = orders.filter(o => o.status === 'delivered' || o.status === 'cancelled');
          if (finished.length === 0) {
            showNotification(language === 'ar' ? 'لا توجد طلبات منتهية لحذفها!' : 'No finished orders to delete!', 'warning');
            return;
          }

          if (isAdmin) {
            for (const ord of finished) {
              await deleteDoc(doc(db, 'orders', ord.id));
            }
            showNotification(language === 'ar' ? `تم حذف ${finished.length} طلب منتهي بنجاح!` : `Successfully deleted ${finished.length} finished orders!`, 'success');
          } else if (isSimulated) {
            const remaining = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
            localStorage.setItem('simulated_orders', JSON.stringify(remaining));
            setOrders(remaining);
            showNotification(language === 'ar' ? `تم حذف ${finished.length} طلب منتهي بنجاح!` : `Successfully deleted ${finished.length} finished orders!`, 'success');
          }
        } catch (err) {
          console.error(err);
          const errMsg = err instanceof Error ? err.message : String(err);
          showNotification(language === 'ar' ? `خطأ أثناء الحذف: ${errMsg}` : `Error deleting finished orders: ${errMsg}`, 'error');
          if (isAdmin) {
            handleFirestoreError(err, OperationType.DELETE, 'orders');
          }
        } finally {
          setClearingOrders(false);
        }
      }
    });
  };

  // Reset all orders and sales metrics to start from zero
  const handleResetAllOrdersAndSales = () => {
    setConfirmDialog({
      isOpen: true,
      titleAr: '🚨 تصفير كافة المبيعات والطلبات',
      titleEn: '🚨 Reset All Sales and Orders',
      messageAr: 'تحذير هام جداً! هل أنت متأكد من رغبتك في تصفير جميع الطلبات والمبيعات والبدء من الصفر تماماً؟ هذا الإجراء سيقوم بمسح كافة سجلات الطلبات السابقة بما فيها النشطة وقيد التحضير!',
      messageEn: 'Critical Warning! Are you sure you want to completely reset all orders and sales metrics to start from zero? This will permanently delete all order records including active and preparing ones!',
      actionLabelAr: 'تصفير وحذف الكل',
      actionLabelEn: 'Reset & Clear All',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        setClearingOrders(true);
        try {
          if (orders.length === 0) {
            showNotification(language === 'ar' ? 'لا توجد طلبات لتصفيرها!' : 'No orders to reset!', 'warning');
            return;
          }

          if (isAdmin) {
            for (const ord of orders) {
              await deleteDoc(doc(db, 'orders', ord.id));
            }
            showNotification(language === 'ar' ? 'تم تصفير كافة المبيعات وحذف جميع الطلبات بنجاح!' : 'Successfully reset all sales and deleted all order records from Live DB!', 'success');
          } else if (isSimulated) {
            localStorage.setItem('simulated_orders', JSON.stringify([]));
            setOrders([]);
            showNotification(language === 'ar' ? 'تم تصفير كافة المبيعات وحذف جميع الطلبات بنجاح!' : 'Successfully reset all sales and deleted all order records from simulator!', 'success');
          }
        } catch (err) {
          console.error(err);
          const errMsg = err instanceof Error ? err.message : String(err);
          showNotification(language === 'ar' ? `خطأ أثناء التصفير: ${errMsg}` : `Error resetting orders: ${errMsg}`, 'error');
          if (isAdmin) {
            handleFirestoreError(err, OperationType.DELETE, 'orders');
          }
        } finally {
          setClearingOrders(false);
        }
      }
    });
  };

  // Trigger browser printing for selected commercial orders with optional distinct target routing
  const handleTriggerOrderPrint = (order: import('../types').Order, specificTarget: 'all' | 'customer' | 'kitchen' = 'all') => {
    setIsTestPrint(false);
    setPrintingOrder(order);

    if (printRoutingMode === 'split' && specificTarget === 'all') {
      // Split routing triggers two distinct sequential print dialog runs for Cashier vs Kitchen printers!
      // Run 1: Print Customer bill only
      setCurrentPrintSubMode('customer');
      setTimeout(() => {
        window.print();
        
        // Wait till cashier dialog finishes to open the kitchen chef's sheet
        const handlePrintNext = () => {
          window.removeEventListener('afterprint', handlePrintNext);
          
          setTimeout(() => {
            setCurrentPrintSubMode('kitchen');
            setTimeout(() => {
              window.print();
              
              // Reset back to normal view
              setTimeout(() => {
                setCurrentPrintSubMode('all');
              }, 500);
            }, 300);
          }, 800);
        };
        
        window.addEventListener('afterprint', handlePrintNext);
      }, 300);
    } else {
      // Direct Unified layout run
      setCurrentPrintSubMode(specificTarget);
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          setCurrentPrintSubMode('all');
        }, 500);
      }, 300);
    }
  };

  // Trigger test-bed thermal calibration print with custom variables applied
  const handleTriggerTestPrint = (specificTarget: 'all' | 'customer' | 'kitchen' = 'all') => {
    setIsTestPrint(true);
    const sampleOrder: import('../types').Order = {
      id: 'TEST-9999',
      customerName: language === 'ar' ? 'فهد الهذلي (تجريب)' : 'Fahad Al-Hothali (Test)',
      customerPhone: '0555555555',
      tableOrDelivery: 'table',
      tableNumber: '7',
      items: [
        { id: 't1', name: 'Premium Beef Platter', nameAr: 'صحن مشكل لحم فاخر', price: 45, quantity: 2 },
        { id: 't2', name: 'Fresh Garlic Sauce', nameAr: 'سبيشال ثوم طازج', price: 3.5, quantity: 1 },
        { id: 't3', name: 'Mineral Water Large', nameAr: 'مياه معدنية كبيير', price: 2, quantity: 3 }
      ],
      subtotal: 99.5,
      tax: 14.93,
      total: 114.43,
      paymentMethod: 'applepay',
      status: 'preparing',
      whatsappSent: false,
      createdAt: new Date().toISOString()
    };
    setPrintingOrder(sampleOrder);
    
    if (printRoutingMode === 'split' && specificTarget === 'all') {
      setCurrentPrintSubMode('customer');
      setTimeout(() => {
        window.print();
        const handlePrintNextTest = () => {
          window.removeEventListener('afterprint', handlePrintNextTest);
          setTimeout(() => {
            setCurrentPrintSubMode('kitchen');
            setTimeout(() => {
              window.print();
              setTimeout(() => {
                setCurrentPrintSubMode('all');
              }, 500);
            }, 300);
          }, 800);
        };
        window.addEventListener('afterprint', handlePrintNextTest);
      }, 300);
    } else {
      setCurrentPrintSubMode(specificTarget);
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          setCurrentPrintSubMode('all');
        }, 500);
      }, 300);
    }
  };

  // Toggle item availability (Out of Stock)
  const handleToggleAvailable = async (itemId: string, currentAvailable: boolean) => {
    const nextVal = !currentAvailable;
    
    // Update local state first for instant response
    const updatedMenu = menuItems.map(item => {
      if (item.id === itemId) return { ...item, isAvailable: nextVal };
      return item;
    });
    onMenuUpdate(updatedMenu);

    if (isAdmin) {
      try {
        await updateDoc(doc(db, 'menuItems', itemId), { isAvailable: nextVal });
      } catch (err) {
        console.error(err);
        handleFirestoreError(err, OperationType.UPDATE, `menuItems/${itemId}`);
      }
    } else if (isSimulated) {
      // Keep state locally
      localStorage.setItem('simulated_menu', JSON.stringify(updatedMenu));
    }
  };

  // Add/Submit new or edited menu item
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationMsg('');

    if (!formId || !formName || !formNameAr || !formPrice) {
      setValidationMsg(language === 'ar' ? 'يرجى ملء الحقول الإجبارية' : 'Please fill all mandatory fields');
      return;
    }

    const cleanId = formId.trim().toLowerCase();

    // Prevent code overlaps in new product mode
    if (!isEditMode && menuItems.some(i => i.id === cleanId)) {
      setValidationMsg(language === 'ar' ? 'معرّف المنتج موجود مسبقاً، يرجى اختيار معرّف آخر فريد' : 'This Item code already exists, please choose a unique code');
      return;
    }

    const itemToSave: MenuItem = {
      id: cleanId,
      name: formName,
      nameAr: formNameAr,
      description: formDesc || 'Freshly made',
      descriptionAr: formDescAr || 'محضر طازجاً',
      price: Number(formPrice),
      category: formCategory,
      calories: Number(formCalories),
      image: formImage.trim() || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600',
      isPopular: formPopular,
      dineInOnly: formDineInOnly,
      isAvailable: isEditMode ? (menuItems.find(i => i.id === editingItemId)?.isAvailable ?? true) : true
    };

    let updatedMenu: MenuItem[];
    if (isEditMode) {
      updatedMenu = menuItems.map(item => item.id === editingItemId ? itemToSave : item);
    } else {
      updatedMenu = [...menuItems, itemToSave];
    }
    
    onMenuUpdate(updatedMenu);

    if (isAdmin) {
      try {
        await setDoc(doc(db, 'menuItems', itemToSave.id), itemToSave);
      } catch (err) {
        console.error(err);
        handleFirestoreError(err, OperationType.WRITE, `menuItems/${itemToSave.id}`);
      }
    } else if (isSimulated) {
      localStorage.setItem('simulated_menu', JSON.stringify(updatedMenu));
    }

    // Reset Form & cancel edit mode
    setFormId('');
    setFormName('');
    setFormNameAr('');
    setFormDesc('');
    setFormDescAr('');
    setFormPrice(10);
    setFormCalories(0);
    setFormImage('');
    setFormPopular(false);
    setFormDineInOnly(false);
    setIsEditMode(false);
    setEditingItemId(null);
    setShowItemForm(false);
  };

  const handleEditClick = (item: MenuItem) => {
    setFormId(item.id);
    setFormName(item.name);
    setFormNameAr(item.nameAr);
    setFormDesc(item.description || '');
    setFormDescAr(item.descriptionAr || '');
    setFormPrice(item.price);
    setFormCategory(item.category);
    setFormCalories(item.calories || 0);
    setFormImage(item.image || '');
    setFormPopular(!!item.isPopular);
    setFormDineInOnly(!!item.dineInOnly);
    
    setIsEditMode(true);
    setEditingItemId(item.id);
    setShowItemForm(true);
    
    // Scroll to form smoothly
    const element = document.getElementById('admin-add-item-trigger');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  // Promotion handling
  const handleQuickPromoTime = (minutes: number) => {
    const d = new Date(Date.now() + minutes * 60 * 1000);
    const formatted = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000).toISOString().slice(0, 16);
    setPromoEndsAt(formatted);
  };

  const handlePublishPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoTitle || !promoTitleAr || !promoPercent || !promoEndsAt) {
      alert(language === 'ar' ? 'برجاء تعبئة بيانات العرض بالكامل' : 'Please fill all promotion offer parameters');
      return;
    }

    const endsUtc = new Date(promoEndsAt).toISOString();

    const promotionData = {
      id: 'active',
      title: promoTitle,
      titleAr: promoTitleAr,
      discountPercent: Number(promoPercent),
      isActive: promoIsActive,
      endsAt: endsUtc,
      imageUrl: promoImageUrl.trim() || undefined
    };

    if (onPromoUpdate) {
      onPromoUpdate(promotionData);
    }

    if (isAdmin) {
      try {
        await setDoc(doc(db, 'promotions', 'active'), promotionData);
        alert(language === 'ar' ? 'تم نشر العرض وتعميمه على كافة الأجهزة بنجاح!' : 'Broadcasted promotion successfully across all active devices!');
      } catch (err) {
        console.error("Failed to write promo to Firestore:", err);
        handleFirestoreError(err, OperationType.WRITE, 'promotions/active');
      }
    } else {
      localStorage.setItem('simulated_promotion', JSON.stringify(promotionData));
      alert(language === 'ar' ? 'تم تفعيل العرض محلياً في المحاكي بنجاح' : 'Activated promotional offer successfully inside the simulation mode!');
    }
  };

  const handleDeletePromo = () => {
    setConfirmDialog({
      isOpen: true,
      titleAr: 'إزالة العرض الترويجي',
      titleEn: 'Remove Promotion',
      messageAr: 'هل تود بالتأكيد إزالة العرض الترويجي الحالي من المتجر بالكامل؟',
      messageEn: 'Are you sure you want to permanently remove the active promotion from the store?',
      actionLabelAr: 'إزالة العرض',
      actionLabelEn: 'Remove Promo',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        if (onPromoUpdate) {
          onPromoUpdate(null);
        }

        if (isAdmin) {
          try {
            await deleteDoc(doc(db, 'promotions', 'active'));
          } catch (err) {
            console.error(err);
          }
        } else {
          localStorage.removeItem('simulated_promotion');
        }
        showNotification(language === 'ar' ? 'تم إزالة العرض الترويجي بنجاح' : 'Promotional offer removed successfully', 'success');
      }
    });
  };

  // Delete product block
  const handleDeleteItem = (itemId: string) => {
    setConfirmDialog({
      isOpen: true,
      titleAr: 'حذف صنف من قائمة المأكولات',
      titleEn: 'Delete Menu Item',
      messageAr: 'هل أنت متأكد من رغبتك في حذف هذا الصنف بالكامل من قائمة المأكولات؟ لن يتمكن العملاء من طلبه مجدداً.',
      messageEn: 'Are you sure you want to delete this item from the catalog? Customers will not be able to order it anymore.',
      actionLabelAr: 'حذف الصنف',
      actionLabelEn: 'Delete Item',
      isDanger: true,
      onConfirm: async () => {
        setConfirmDialog(null);
        const updatedMenu = menuItems.filter(item => item.id !== itemId);
        onMenuUpdate(updatedMenu);

        if (isAdmin) {
          try {
            await deleteDoc(doc(db, 'menuItems', itemId));
            showNotification(language === 'ar' ? 'تم حذف الصنف بنجاح!' : 'Menu item deleted successfully!', 'success');
          } catch (err) {
            console.error(err);
            handleFirestoreError(err, OperationType.DELETE, `menuItems/${itemId}`);
          }
        } else if (isSimulated) {
          localStorage.setItem('simulated_menu', JSON.stringify(updatedMenu));
          showNotification(language === 'ar' ? 'تم حذف الصنف بنجاح!' : 'Menu item deleted successfully!', 'success');
        }
      }
    });
  };

  // Analytical computation summaries
  const deliveredOrders = orders.filter((o) => o.status === 'delivered');
  const activeOrders = orders.filter((o) => o.status === 'pending' || o.status === 'preparing');
  
  const totalSalesVal = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);
  const totalOrdersCount = orders.filter((o) => o.status !== 'cancelled').length;

  // Recharts Chart Series Data
  // 1. Sales by Categories
  const salesByCategoryData = CATEGORIES.map((cat) => {
    const catOrders = orders.filter((o) => o.status !== 'cancelled');
    let categorySum = 0;
    
    catOrders.forEach((ord) => {
      ord.items.forEach((ordItem) => {
        // Map menu items category
        const itemObj = menuItems.find((m) => m.id === ordItem.id);
        if (itemObj && itemObj.category === cat.id) {
          categorySum += ordItem.price * ordItem.quantity;
        }
      });
    });

    return {
      name: language === 'ar' ? cat.nameAr : cat.name,
      sales: categorySum
    };
  }).filter((c) => c.sales > 0);

  // 2. Status Distribution Data
  const statusPieData = [
    { name: language === 'ar' ? 'قيد الانتظار' : 'Pending', value: orders.filter((o) => o.status === 'pending').length, color: '#F59E0B' },
    { name: language === 'ar' ? 'جاري التحضير' : 'Preparing', value: orders.filter((o) => o.status === 'preparing').length, color: '#3B82F6' },
    { name: language === 'ar' ? 'تم التوصيل' : 'Delivered', value: orders.filter((o) => o.status === 'delivered').length, color: '#10B981' },
    { name: language === 'ar' ? 'ملغي' : 'Cancelled', value: orders.filter((o) => o.status === 'cancelled').length, color: '#EF4444' }
  ].filter((v) => v.value > 0);

  // Filters live orders list
  const filteredOrders = orders.filter((ord) => {
    if (filterStatus === 'all') return true;
    return ord.status === filterStatus;
  });

  // Login authentication request gate
  if (!isAdmin && !isSimulated) {
    const adminUrl = `${window.location.origin}/?admin=true`;
    
    return (
      <div className="max-w-xl mx-auto p-4 md:p-6 font-sans">
        <div className="bg-white rounded-3xl border border-slate-100 p-6 md:p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-amber-600/10 text-amber-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-9 h-9" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-stone-900">
              {language === 'ar' ? 'لوحة تحكم المسؤولين (اتصال حقيقي)' : 'Admin Dashboard (Live Cloud)'}
            </h2>
            <p className="text-slate-500 text-xs md:text-sm">
              {language === 'ar'
                ? 'لوحة الإداريين محمية وتتصل بقاعدة بيانات فايربيس الحية لمتابعة الطلبات وتعديل المنيو.'
                : 'Workspace is password-protected and connects to live Firebase DB for tracking and menu edits.'}
            </p>
          </div>

          {/* Copyable direct URL Section for resolving iframe issue */}
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-start space-y-3">
            <div className="flex gap-2 text-amber-800 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {language === 'ar'
                  ? 'تنبيه: لتجنب مشاكل تسجيل الدخول في إطار المعاينة، يُنصح بفتح الموقع في نافذة مستقلة:'
                  : 'Note: To avoid iframe login issues, we highly recommend opening the site in a new browser tab:'}
              </span>
            </div>
            
            <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-xl p-2.5 text-xs font-mono text-slate-600 overflow-x-auto">
              <span className="flex-1 select-all truncate">{adminUrl}</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(adminUrl);
                  showNotification(language === 'ar' ? 'تم نسخ الرابط المباشر!' : 'Direct URL copied!', 'success');
                }}
                className="shrink-0 bg-stone-100 hover:bg-stone-200 text-stone-700 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer text-[11px] font-sans font-bold"
              >
                <Copy className="w-3.5 h-3.5" />
                {language === 'ar' ? 'نسخ' : 'Copy'}
              </button>
            </div>
            
            <a
              href={adminUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded-xl transition-all text-xs flex items-center justify-center gap-2 text-center"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'فتح لوحة التحكم في نافذة مستقلة' : 'Open Admin Panel in New Tab'}</span>
            </a>
          </div>

          {/* Real Auth Methods */}
          <div className="space-y-4 pt-2">
            
            {/* Google Sign In Option */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGoogleLogin}
                className="w-full bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold py-3 px-4 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2.5 text-sm"
              >
                <img src="https://www.gstatic.com/images/branding/product/1x/gsa_64dp.png" alt="Google logo" className="w-5 h-5" />
                <span>{language === 'ar' ? 'تسجيل الدخول بواسطة Google' : 'Sign in with Google'}</span>
              </button>
            </div>

            <div className="relative flex items-center justify-center py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <span className="relative px-3 bg-white text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {language === 'ar' ? 'أو تسجيل مباشر (بريد وكلمة مرور)' : 'Or direct email & password'}
              </span>
            </div>

            {/* Email & Password Form */}
            <form onSubmit={handleEmailLogin} className="space-y-4 text-start">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {language === 'ar' ? 'البريد الإلكتروني للمسؤول' : 'Admin Email'}
                </label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="yasseralayub@gmail.com"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 block flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  {language === 'ar' ? 'كلمة المرور' : 'Password'}
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {loginError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-xl flex items-start gap-2 leading-relaxed">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Register / Setup password toggle check */}
              <div className="flex items-center gap-2 py-1">
                <input
                  id="toggle-register"
                  type="checkbox"
                  checked={isRegistering}
                  onChange={(e) => {
                    setIsRegistering(e.target.checked);
                    setLoginError('');
                  }}
                  className="w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                />
                <label htmlFor="toggle-register" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                  {language === 'ar'
                    ? 'إنشاء حساب مسؤول جديد وتعيين كلمة المرور هذه'
                    : 'Create new admin account and set this password'}
                </label>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full bg-stone-900 hover:bg-stone-850 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loginLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                )}
                <span>
                  {loginLoading
                    ? (language === 'ar' ? 'جاري التحميل...' : 'Please wait...')
                    : isRegistering
                    ? (language === 'ar' ? 'إنشاء حساب وتعيين كلمة المرور الحية' : 'Create Account & Set Live Password')
                    : (language === 'ar' ? 'تسجيل الدخول الآمن' : 'Secure Login')}
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-8 font-sans text-start">
      
      {/* Admin Title banner */}
      <div className="bg-stone-900 text-stone-100 rounded-3xl p-6 shadow-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden border border-amber-500/20">
        <div className="absolute -top-12 -right-12 w-44 h-44 bg-amber-600/10 rounded-full blur-2xl pointer-events-none" />
        <div className="z-10 text-start space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="bg-amber-500/25 text-amber-500 text-xs font-mono font-bold px-2.5 py-1 rounded-md uppercase tracking-wider">
              {isSimulated ? 'محاكي الإدارة • Demo Mode' : 'اتصال حي • Connected to Live Cloud DB'}
            </span>
            <button
              onClick={() => {
                if (soundEnabled) {
                  playOrderChime();
                }
              }}
              title="Test Sound Alert"
              className="p-1 rounded bg-stone-800 text-stone-400 hover:text-white"
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-amber-500">{t('adminWelcome')}</h2>
          <p className="text-xs text-stone-400 font-mono">
            {currentUser ? `${currentUser.displayName || 'Admin'} (${currentUser.email})` : 'Simulated Session Dashboard'}
          </p>
        </div>

        <div className="z-10 flex gap-2 w-full sm:w-auto">
          {/* Sounds toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-3.5 py-2.5 text-xs rounded-xl font-bold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              soundEnabled
                ? 'bg-amber-600/20 border-amber-500/50 text-amber-400'
                : 'bg-stone-800 border-stone-700 text-stone-400'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            {soundEnabled ? (language === 'ar' ? 'التنبيهات مفعلة' : 'Mute Sounds') : (language === 'ar' ? 'التنبيهات صامتة' : 'Unmute Sounds')}
          </button>

          <button
            onClick={handleLogout}
            className="bg-red-950/40 text-red-400 hover:text-red-300 border border-red-900/40 px-3.5 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-2 cursor-pointer text-xs"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logout')}</span>
          </button>

          {onHideAdminTab && (
            <button
              onClick={onHideAdminTab}
              className="bg-stone-800 text-stone-300 hover:text-white border border-stone-700 px-3.5 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-1.5 cursor-pointer text-xs"
              title={language === 'ar' ? 'إخفاء لوحة الإدارة تماماً عن الأنظار وتأمينها' : 'Lock & Hide Admin Tab completely'}
            >
              <Power className="w-4 h-4 text-red-500" />
              <span>{language === 'ar' ? 'قفل وإخفاء اللوحة' : 'Lock & Hide'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Administration & Order Management Panel */}
      <div className="p-5 bg-stone-50 border border-stone-200/60 rounded-3xl grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-start">
        {/* Seed Database (Visible for Cloud Admin or Simulated) */}
        <div className="flex flex-col justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-xs">
          <div>
            <h3 className="font-bold text-xs text-amber-800 uppercase tracking-wide flex items-center gap-1.5 mb-1">
              <RefreshCw className="w-3.5 h-3.5" />
              {language === 'ar' ? 'تأسيس قائمة المأكولات' : 'Seed Products Catalog'}
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {language === 'ar' 
                ? 'تهيئة وتأسيس قاعدة البيانات بـ 40 صنفاً دفعة واحدة لتنطلق المنصة فوراً بوجبات شهية.' 
                : 'Seed Firestore database right away with initial 40+ pre-configured meals.'}
            </p>
          </div>
          <button
            onClick={handleSeedDatabaseClick}
            disabled={seedingLoading || !isAdmin}
            className="mt-3.5 w-full bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-extrabold py-2 px-3 rounded-xl shadow-xs cursor-pointer disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all"
            title={!isAdmin ? (language === 'ar' ? 'متاح فقط في وضع السحابة الحقيقي' : 'Only available in Live Cloud DB mode') : ''}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${seedingLoading ? 'animate-spin' : ''}`} />
            {seedingLoading ? 'جارٍ الضخ...' : t('seedPrompt')}
          </button>
          {seedingSuccessMsg && <p className="text-[10px] text-green-700 font-bold mt-1 text-center">{seedingSuccessMsg}</p>}
        </div>

        {/* Delete Finished/Completed Orders */}
        <div className="flex flex-col justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-xs">
          <div>
            <h3 className="font-bold text-xs text-red-800 uppercase tracking-wide flex items-center gap-1.5 mb-1">
              <Trash2 className="w-3.5 h-3.5" />
              {language === 'ar' ? 'حذف الطلبات المنتهية' : 'Delete Finished Orders'}
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {language === 'ar' 
                ? 'تنظيف السجلات عبر حذف جميع الطلبات المكتملة (تم التوصيل) والملغاة نهائياً لتسريع اللوحة.' 
                : 'Clean up order logs by permanently deleting all delivered and cancelled orders from records.'}
            </p>
          </div>
          <button
            onClick={handleDeleteFinishedOrders}
            disabled={clearingOrders || orders.filter(o => o.status === 'delivered' || o.status === 'cancelled').length === 0}
            className="mt-3.5 w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200/60 text-[11px] font-extrabold py-2 px-3 rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {language === 'ar' 
              ? `حذف الطلبات المنتهية (${orders.filter(o => o.status === 'delivered' || o.status === 'cancelled').length})` 
              : `Delete Completed/Cancelled (${orders.filter(o => o.status === 'delivered' || o.status === 'cancelled').length})`}
          </button>
        </div>

        {/* Reset/Zero Out Sales metrics and clear all orders */}
        <div className="flex flex-col justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-xs md:col-span-2 lg:col-span-1">
          <div>
            <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wide flex items-center gap-1.5 mb-1">
              <Sliders className="w-3.5 h-3.5 text-slate-600" />
              {language === 'ar' ? 'تصفير المبيعات والطلبات' : 'Reset Sales & Orders'}
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              {language === 'ar' 
                ? 'تصفير كافة المبيعات والبدء من الصفر تماماً لموسم مبيعات جديد عبر حذف كافة الطلبات.' 
                : 'Reset your sales metrics completely to start from zero by deleting all existing order logs.'}
            </p>
          </div>
          <button
            onClick={handleResetAllOrdersAndSales}
            disabled={clearingOrders || orders.length === 0}
            className="mt-3.5 w-full bg-slate-900 hover:bg-black text-white text-[11px] font-extrabold py-2 px-3 rounded-xl shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 transition-all"
          >
            <Sliders className="w-3.5 h-3.5" />
            {language === 'ar' ? 'تصفير كافة المبالغ والطلبات للبدء من الصفر' : 'Reset Sales & Orders to Zero'}
          </button>
        </div>
      </div>

      {/* Analytics KPI dashboard row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4 text-start">
          <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-600">
            <DollarSign className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-semibold">{t('totalSales')}</span>
            <span className="text-lg md:text-xl font-black text-slate-800">{totalSalesVal.toFixed(1)} <span className="text-xs font-bold text-slate-400">{t('sar')}</span></span>
          </div>
        </div>

        {/* KPI 2 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4 text-start">
          <div className="p-3 rounded-2xl bg-amber-50 text-amber-600">
            <ShoppingBag className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-semibold">{t('ordersCount')}</span>
            <span className="text-lg md:text-xl font-black text-slate-800">{totalOrdersCount} <span className="text-xs font-medium text-slate-400">{language === 'ar' ? 'طلبات' : 'orders'}</span></span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4 text-start">
          <div className="p-3 rounded-2xl bg-blue-50 text-blue-600">
            <Clock className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-semibold">{language === 'ar' ? 'الطلبات النشطة' : 'Active Orders'}</span>
            <span className="text-lg md:text-xl font-black text-slate-800">{activeOrders.length}</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs flex items-center gap-4 text-start">
          <div className="p-3 rounded-2xl bg-red-50 text-red-600">
            <XCircle className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-semibold">{language === 'ar' ? 'الطلبات الملغاة' : 'Cancelled'}</span>
            <span className="text-lg md:text-xl font-black text-slate-800">{orders.filter((o) => o.status === 'cancelled').length}</span>
          </div>
        </div>
      </div>

      {/* Graphical Insights Bento block */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs lg:col-span-2">
          <h3 className="font-bold text-slate-800 text-sm mb-4">{language === 'ar' ? 'توزيع المبيعات بحسب أقسام المنيو' : 'Sales Distribution per Categories'}</h3>
          <div className="w-full h-64">
            {salesByCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salesByCategoryData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748B" fontSize={11} uuid="cat-x-axis" />
                  <YAxis stroke="#64748B" fontSize={11} uuid="cat-y-axis" />
                  <Tooltip formatter={(value) => [`${value} SAR`, 'Sales']} />
                  <Bar dataKey="sales" fill="#D97706" radius={[8, 8, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                {language === 'ar' ? 'لا يوجد مبيعات مكتملة لعرض الإحصائيات بعد.' : 'Deliver some orders to see sales metrics graphics here!'}
              </div>
            )}
          </div>
        </div>

        {/* Status distribution Pie */}
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-xs">
          <h3 className="font-bold text-slate-800 text-sm mb-4">{language === 'ar' ? 'مؤشر حالات الطلب النشط والمنتهي' : 'Orders Status Breakdown'}</h3>
          <div className="w-full h-64 flex flex-col justify-between items-center">
            {statusPieData.length > 0 ? (
              <>
                <div className="w-full h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {statusPieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Custom list description */}
                <div className="flex flex-wrap gap-3 justify-center text-[10px] md:text-xs">
                  {statusPieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-slate-600">{d.name} ({d.value})</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                {language === 'ar' ? 'لا يوجد بيانات كافية لعرض نسب الحالات.' : 'No orders in system to show.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LIVE ORDERS TRACKER SECTION */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-xs space-y-4">
        
        {/* Toggle & Filter header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div className="text-start">
            <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              {t('liveOrders')}
            </h3>
            <p className="text-xs text-slate-500">{language === 'ar' ? 'تحديث تلقائي وفوري للطلبات الجديدة في طاولات وحجوزات الصالة' : 'Instantly synchronized client orders tracking'}</p>
          </div>

          {/* Quick Filter Pill list */}
          <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100/80 rounded-xl">
            {['all', 'pending', 'received', 'searching_driver', 'preparing', 'ready', 'driver_picked_up', 'on_the_way', 'delivered', 'cancelled'].map((st) => (
              <button
                id={`filter-${st}`}
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-all cursor-pointer ${
                  filterStatus === st
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {st === 'all' ? t('allStatus') : (language === 'ar' ? getStatusLabelAr(st) : getStatusLabelEn(st))}
              </button>
            ))}
          </div>
        </div>

        {/* Real-time Order lists container */}
        {loadingOrders ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            {t('noOrdersYet')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <AnimatePresence mode="popLayout">
              {filteredOrders.map((ord) => {
                // Determine card status border accent
                const ringAccent = 
                  ord.status === 'pending' ? 'border-amber-400 bg-amber-50/5' : 
                  ord.status === 'preparing' ? 'border-blue-400 bg-blue-50/5' : 
                  ord.status === 'delivered' ? 'border-emerald-400 bg-emerald-50/5' : 
                  'border-red-400 opacity-60 bg-red-50/5';

                return (
                  <motion.div
                    id={`admin-order-id-${ord.id}`}
                    layout
                    key={ord.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`p-4 rounded-2xl border-2 shadow-xs flex flex-col justify-between space-y-4 text-start ${ringAccent}`}
                  >
                    <div>
                      {/* Name Card title bar */}
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-extrabold text-sm text-slate-800">{ord.customerName}</h4>
                          <span className="font-mono text-[10px] text-slate-400 block mt-0.5">{ord.id}</span>
                          {ord.status === 'pending' && (
                            <PendingCountdown createdAt={ord.createdAt} />
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${
                            ord.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                            ord.status === 'received' ? 'bg-slate-100 text-slate-800' :
                            ord.status === 'searching_driver' ? 'bg-indigo-100 text-indigo-800' :
                            ord.status === 'preparing' ? 'bg-blue-100 text-blue-800' :
                            ord.status === 'ready' ? 'bg-purple-100 text-purple-800' :
                            ord.status === 'driver_picked_up' ? 'bg-orange-100 text-orange-800' :
                            ord.status === 'on_the_way' ? 'bg-sky-100 text-sky-800' :
                            ord.status === 'delivered' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {language === 'ar' ? getStatusLabelAr(ord.status) : getStatusLabelEn(ord.status)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(ord.id)}
                            title={language === 'ar' ? 'حذف الطلب نهائياً' : 'Delete Order'}
                            className="p-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 transition-colors cursor-pointer flex items-center justify-center shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {ord.tableOrDelivery === 'delivery' && (
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-2.5 text-xs text-start space-y-1 my-2">
                          <span className="font-bold text-slate-500 block mb-1">
                            {language === 'ar' ? '👤 تعيين مندوب التوصيل:' : '👤 Assign Driver:'}
                          </span>
                          <select
                            value={ord.driverId || ''}
                            onChange={(e) => {
                              const dId = e.target.value;
                              if (!dId) {
                                handleAssignDriver(ord.id, null);
                              } else if (dId === 'broadcast') {
                                handleAssignDriver(ord.id, {
                                  id: 'broadcast',
                                  name: language === 'ar' ? 'الجميع 📢' : 'Everyone 📢',
                                  phone: '',
                                  status: 'available',
                                  createdAt: ''
                                });
                              } else {
                                const selectedDrv = drivers.find(d => d.id === dId);
                                if (selectedDrv) handleAssignDriver(ord.id, selectedDrv);
                              }
                            }}
                            className="w-full bg-white border border-slate-200 rounded-lg p-1.5 text-xs font-semibold outline-none focus:border-amber-500 text-slate-800"
                          >
                            <option value="">{language === 'ar' ? '-- اختر مندوب التوصيل --' : '-- Choose Driver --'}</option>
                            <option value="broadcast" className="font-extrabold text-blue-600 bg-blue-50">
                              📢 {language === 'ar' ? 'إرسال لجميع المناديب المتاحة' : 'Broadcast to All Drivers'}
                            </option>
                            {drivers.map(drv => (
                              <option key={drv.id} value={drv.id}>
                                {drv.name} ({drv.phone}) - {drv.status === 'available' ? (language === 'ar' ? '🟢 متاح' : '🟢 Available') : drv.status === 'suspended' ? (language === 'ar' ? '🚫 موقوف' : '🚫 Suspended') : (language === 'ar' ? '🔴 مشغول' : '🔴 Busy')}
                              </option>
                            ))}
                          </select>
                          {ord.driverName && (
                            <div className="space-y-2 pt-1.5 border-t border-slate-100/50 mt-1.5">
                              <div className="flex justify-between items-center text-[10px] text-slate-600 font-medium">
                                <span>👨‍✈️ {ord.driverName}</span>
                                {ord.driverPhone && (
                                  <a href={`tel:${ord.driverPhone}`} className="text-blue-600 font-mono font-bold hover:underline">📞 {ord.driverPhone}</a>
                                )}
                              </div>
                              {ord.driverId !== 'broadcast' && ord.driverPhone && (
                                <button
                                  type="button"
                                  onClick={() => handleSendDriverDetails(ord)}
                                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                                >
                                  <span>إرسال تفاصيل التوصيل للمندوب 💬</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Transition triggers buttons row */}
                      <div className="space-y-1.5">
                        {(() => {
                          const nextStatus = getNextStatus(ord.status, ord.tableOrDelivery);
                          if (!nextStatus) return null;
                          return (
                            <button
                              id={`btn-next-${ord.id}`}
                              onClick={() => handleUpdateStatus(ord.id, nextStatus)}
                              disabled={updatingId === ord.id}
                              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] py-2 rounded-xl text-center transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99]"
                            >
                              <span>{language === 'ar' ? 'الخطوة التالية ➡️' : 'Next Step ➡️'}</span>
                              <span className="underline">
                                {language === 'ar' ? getNextStatusLabelAr(nextStatus) : getNextStatusLabelEn(nextStatus)}
                              </span>
                            </button>
                          );
                        })()}

                        <div className="grid grid-cols-2 gap-1.5">
                          {/* Manual override helper */}
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/60 rounded-lg px-2 py-1 col-span-2">
                            <span className="text-[9px] text-slate-400 font-bold uppercase shrink-0">
                              {language === 'ar' ? 'تعديل الحالة:' : 'Override:'}
                            </span>
                            <select
                              value={ord.status}
                              onChange={(e) => handleUpdateStatus(ord.id, e.target.value)}
                              className="w-full bg-transparent text-[10px] font-bold text-slate-700 outline-none cursor-pointer"
                            >
                              {['pending', 'received', 'searching_driver', 'preparing', 'ready', 'driver_picked_up', 'on_the_way', 'delivered', 'cancelled'].map(st => (
                                <option key={st} value={st}>
                                  {language === 'ar' ? getStatusLabelAr(st) : getStatusLabelEn(st)}
                                </option>
                              ))}
                            </select>
                          </div>

                          {ord.status !== 'delivered' && ord.status !== 'cancelled' && (
                            <button
                              id={`btn-cancel-${ord.id}`}
                              onClick={() => handleUpdateStatus(ord.id, 'cancelled')}
                              disabled={updatingId === ord.id}
                              className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-100/70 font-bold text-[10px] py-1.5 rounded-lg text-center transition-all flex items-center justify-center gap-1 cursor-pointer col-span-2"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>{language === 'ar' ? 'إلغاء الطلب نهائياً' : 'Cancel Order'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {ord.status !== 'cancelled' && (
                        <div className="space-y-1.5 w-full">
                          <button
                            type="button"
                            onClick={() => handleTriggerOrderPrint(ord, 'all')}
                            className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-extrabold text-[10px] py-2 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-[0.99]"
                          >
                            <Printer className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {language === 'ar' 
                                ? `طباعة الفاتورة والتحضير (${printRoutingMode === 'split' ? 'توجيه منفصل تلقائي 📱' : 'نمط مدمج 📄'})` 
                                : `Print Invoice & Kitchen (${printRoutingMode === 'split' ? 'Auto-Split 📱' : 'Unified 📄'})`
                              }
                            </span>
                          </button>
                          
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleTriggerOrderPrint(ord, 'customer')}
                              className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200/85 font-extrabold text-[9px] py-1.5 rounded-lg text-center transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <span>🧾 {language === 'ar' ? 'الفاتورة فقط' : 'Invoice Only'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleTriggerOrderPrint(ord, 'kitchen')}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200/50 font-extrabold text-[9px] py-1.5 rounded-lg text-center transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <span>👨‍🍳 {language === 'ar' ? 'المطبخ فقط' : 'Kitchen Only'}</span>
                            </button>
                          </div>

                          {/* Direct WhatsApp update sender */}
                          <button
                            type="button"
                            onClick={() => {
                              const customerPhone = ord.customerPhone;
                              let cleanPhone = customerPhone.replace(/\D/g, "");
                              if (cleanPhone.startsWith("05") && cleanPhone.length === 10) {
                                cleanPhone = "966" + cleanPhone.substring(1);
                              } else if (cleanPhone.startsWith("5") && cleanPhone.length === 9) {
                                cleanPhone = "966" + cleanPhone;
                              }
                              
                              const rNameAr = setRestaurantNameAr || 'رحلة شواء';
                              const rNameEn = setRestaurantNameEn || 'Grilling Journey';
                              
                              let statusTextAr = '';
                              let statusTextEn = '';
                              
                              switch (ord.status) {
                                case 'pending':
                                  statusTextAr = '⏳ بانتظار موافقة المطبخ وتأكيد الاستلام';
                                  statusTextEn = '⏳ Pending acceptance and approval';
                                  break;
                                case 'received':
                                  statusTextAr = '✅ تم استلام وتأكيد طلبك بنجاح وجاري تجهيزه الآن!';
                                  statusTextEn = '✅ Your order has been received and confirmed!';
                                  break;
                                case 'searching_driver':
                                  statusTextAr = '🔍 جاري التنسيق والبحث عن مندوب لتوصيل طلبك بأسرع وقت!';
                                  statusTextEn = '🔍 Searching for a delivery driver for your order!';
                                  break;
                                case 'preparing':
                                  statusTextAr = '🔥 بدأ الطبخ والتحضير على الجمر الآن في المطبخ!';
                                  statusTextEn = '🔥 Being freshly cooked and grilled on charcoal now!';
                                  break;
                                case 'ready':
                                  statusTextAr = '📦 طلبك جاهز الآن وساخن ولذيذ! جاهز للتسليم.';
                                  statusTextEn = '📦 Your order is ready and hot!';
                                  break;
                                case 'driver_picked_up':
                                  statusTextAr = '🚴 تم تسليم الطلب من قِبل مندوب التوصيل بنجاح وجاري التوجه إليك!';
                                  statusTextEn = '🚴 The driver has picked up your order and is heading your way!';
                                  break;
                                case 'on_the_way':
                                  statusTextAr = `📍 طلبك في الطريق إليك الآن مع المندوب!\n👤 المندوب: ${ord.driverName || 'كابتن التوصيل'}\n📞 جوال المندوب: ${ord.driverPhone || '-'}`;
                                  statusTextEn = `📍 Your order is on the way!\n👤 Driver: ${ord.driverName || 'Delivery Captain'}\n📞 Driver Phone: ${ord.driverPhone || '-'}`;
                                  if (ord.latitude && ord.longitude) {
                                    statusTextAr += `\n📍 موقع التوصيل على الخريطة:\nhttps://www.google.com/maps?q=${ord.latitude},${ord.longitude}`;
                                    statusTextEn += `\n📍 Delivery Location Link:\nhttps://www.google.com/maps?q=${ord.latitude},${ord.longitude}`;
                                  } else if (ord.deliveryAddress) {
                                    statusTextAr += `\n📍 العنوان المحدد: ${ord.deliveryAddress}`;
                                    statusTextEn += `\n📍 Address: ${ord.deliveryAddress}`;
                                  }
                                  break;
                                case 'delivered':
                                  statusTextAr = '🎉 تم تسليم طلبك بنجاح! بالهناء والعافية!';
                                  statusTextEn = '🎉 Your order has been delivered successfully! Bon appétit!';
                                  break;
                                default:
                                  statusTextAr = '❌ تم إلغاء الطلب';
                                  statusTextEn = '❌ Cancelled';
                                  break;
                              }

                              const msg = language === 'ar'
                                ? `أهلاً بك يا ${ord.customerName} 👋\n\n*تحديث مهم لطلبك من مطعم ${rNameAr}* 🍢🥤\n\n` +
                                  `*رقم الطلب:* \`${ord.id}\`\n` +
                                  `*حالة الطلب الحالية:* ${statusTextAr}\n\n` +
                                  `يمكنك تتبع حالة الطلب الفورية بضغطة واحدة وعرض الفاتورة عبر الرابط التالي:\n${window.location.origin}/?orderId=${ord.id}\n\n` +
                                  `_نشكرك لاختيارك مطعمنا ونسعد بخدمتك دائماً!_`
                                : `Hello ${ord.customerName} 👋\n\n*Important order update from ${rNameEn}* 🍢🥤\n\n` +
                                  `*Order Code:* \`${ord.id}\`\n` +
                                  `*Current Status:* ${statusTextEn}\n\n` +
                                  `You can track your live order status anytime here:\n${window.location.origin}/?orderId=${ord.id}\n\n` +
                                  `_Thank you for choosing us, looking forward to serving you!_`;
                              
                              window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`, '_blank');
                            }}
                            className="w-full bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/80 font-extrabold text-[10px] py-1.5 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-1"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>
                              {language === 'ar' 
                                ? 'إرسال التحديث والمتابعة إلى جوال العميل (واتساب) 💬' 
                                : 'Send WhatsApp Status Update to Customer 💬'}
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* BUSINESS CONFIGURATION & SAUDI VAT TAX SYSTEM */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-xs space-y-5">
        <div className="text-start border-b border-slate-100 pb-4">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-500 font-bold" />
            {language === 'ar' ? 'إعدادات هوية النشاط والضريبة المبسطة' : 'Business Identity & Saudi VAT Tax Settings'}
          </h3>
          <p className="text-xs text-slate-500">
            {language === 'ar' ? 'قم بتعديل معلومات المطعم، رفع اللوجو الشعار الرّسمي، ضبط قيمة الضريبة المضافة وتفعيلها في الفواتير الإلكترونية' : 'Configure official names, logo graphic, VAT rate, and toggle active storefront tax calculations'}
          </p>
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-6 text-start">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Restaurant Logo Block */}
            <div className="md:col-span-2 bg-slate-50/50 p-4 border border-dashed border-slate-200 rounded-2xl flex flex-col md:flex-row items-center gap-5">
              <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-2xl overflow-hidden shadow-inner shrink-0 border border-slate-350">
                {setLogoUrl ? (
                  <img src={setLogoUrl} alt="Logo preview" className="w-full h-full object-cover" />
                ) : (
                  <span>{language === 'ar' ? 'ل' : 'L'}</span>
                )}
              </div>
              <div className="flex-1 space-y-2 w-full text-start">
                <label className="block text-xs font-bold text-slate-600">{language === 'ar' ? 'أيقونة الموقع وشعار المطعم الرسمى (URL)' : 'Browser Icon & Official Logo URL'}</label>
                <input
                  type="text"
                  value={setLogoUrl}
                  onChange={(e) => setSetLogoUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/... or custom image URL"
                  className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono"
                />
                
                {/* Visual Preset Selection Chooser for BBQ icons */}
                <div className="pt-0.5">
                  <span className="text-[10px] text-slate-400 block mb-1">
                    {language === 'ar' ? '💡 اختر رمزاً سريعاً ليكون أيقونة الموقع وشعار الفواتير فوراً:' : '💡 Select a premium preset for your browser favicon and invoices:'}
                  </span>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {[
                      { nameAr: 'لهب الجمر 🔥', nameEn: 'Flame Grill 🔥', url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=200' },
                      { nameAr: 'ستيك فاخر 🥩', nameEn: 'Steak House 🥩', url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=200' },
                      { nameAr: 'شواء الحطب 🪵', nameEn: 'Wood Grill 🪵', url: 'https://images.unsplash.com/photo-1546964124-0cce460f38ef?auto=format&fit=crop&q=80&w=200' },
                      { nameAr: 'برجر الفحم 🍔', nameEn: 'Charcoal Burger 🍔', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=200' }
                    ].map((preset) => (
                      <button
                        key={preset.url}
                        type="button"
                        onClick={() => setSetLogoUrl(preset.url)}
                        className={`text-[9px] font-bold px-2 py-1 rounded-lg border cursor-pointer transition-all ${
                          setLogoUrl === preset.url 
                            ? 'bg-amber-100 text-amber-850 border-amber-300' 
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {language === 'ar' ? preset.nameAr : preset.nameEn}
                      </button>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-slate-400">
                  {language === 'ar' 
                    ? 'التحكم بالشعار هنا يُغير تلقائياً أيقونة المتصفح (Favicon)، شعار الفواتير، بطاقات المطبخ، شريط المتجر، وتطبيقات الجوال.' 
                    : 'Setting this logo updates the web browser tab favicon, customer receipts, chef slips, and store headers.'}
                </p>
              </div>
            </div>

            {/* Names */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'الاسم التجاري للمطعم (عربي)' : 'Restaurant Name (Arabic)'}</label>
              <input
                required
                type="text"
                value={setRestaurantNameAr}
                onChange={(e) => setSetRestaurantNameAr(e.target.value)}
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-semibold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'الاسم التجاري للمطعم (إنجليزي)' : 'Restaurant Name (English)'}</label>
              <input
                required
                type="text"
                value={setRestaurantNameEn}
                onChange={(e) => setSetRestaurantNameEn(e.target.value)}
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-semibold text-slate-800"
              />
            </div>

            {/* Tagline */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'شعار التسويق الفرعي (عربي)' : 'Branding Slogan / Tagline (Arabic)'}</label>
              <input
                type="text"
                value={setTaglineAr}
                onChange={(e) => setSetTaglineAr(e.target.value)}
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'شعار التسويق الفرعي (إنجليزي)' : 'Branding Slogan / Tagline (English)'}</label>
              <input
                type="text"
                value={setTaglineEn}
                onChange={(e) => setSetTaglineEn(e.target.value)}
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500"
              />
            </div>

            {/* Contacts */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'رقم الهاتف المباشر' : 'Official Phone Number'}</label>
              <input
                type="text"
                value={setPhone}
                onChange={(e) => setSetPhone(e.target.value)}
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'رقم استقبال طلبات الواتساب (توصيل)' : 'WhatsApp Dispatch Number'}</label>
              <input
                type="text"
                value={setWhatsappNumber}
                onChange={(e) => setSetWhatsappNumber(e.target.value)}
                placeholder="9665..."
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Addresses */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'عنوان النشاط التجاري (عربي)' : 'Address Description (Arabic)'}</label>
              <input
                type="text"
                value={setAddressAr}
                onChange={(e) => setSetAddressAr(e.target.value)}
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'عنوان النشاط التجاري (إنجليزي)' : 'Address Description (English)'}</label>
              <input
                type="text"
                value={setAddressEn}
                onChange={(e) => setSetAddressEn(e.target.value)}
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500"
              />
            </div>

            {/* Saudi VAT ID */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                {language === 'ar' ? 'الرقم الضريبي للبائع (١٥ خانة) لـ ZATCA' : 'Seller VAT No (15 Digits) for ZATCA'}
              </label>
              <input
                required
                type="text"
                maxLength={15}
                value={setVatNumber}
                onChange={(e) => setSetVatNumber(e.target.value)}
                className="w-full text-xs bg-slate-50/50 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono font-bold"
              />
            </div>

            {/* Tax Settings Block */}
            <div className="md:col-span-2 py-3.5 px-4 bg-amber-50/30 border border-amber-500/10 rounded-2xl flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="vat-tax-enabled-chkbx"
                    checked={setTaxEnabled}
                    onChange={(e) => setSetTaxEnabled(e.target.checked)}
                    className="w-5 h-5 accent-amber-500 cursor-pointer"
                  />
                  <div className="text-start">
                    <label htmlFor="vat-tax-enabled-chkbx" className="block text-xs font-bold text-slate-800 cursor-pointer">
                      {language === 'ar' ? 'تفعيل واحتساب ضريبة القيمة المضافة بالمتجر' : 'Enable Value Added Tax (VAT)'}
                    </label>
                    <span className="text-[10px] text-slate-400 block">
                      {language === 'ar' ? 'عند التعطيل، ستكون أسعار الأصناف المسددة خالية تماماً من الضريبة تلقائياً' : 'If deactivated, checkout cart will omit VAT dynamically.'}
                    </span>
                  </div>
                </div>

                {setTaxEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{language === 'ar' ? 'نسبة الضريبة المطبقة:' : 'VAT Rate:'}</span>
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-mono text-xs font-bold shadow-xs">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={setTaxPercent}
                        onChange={(e) => setSetTaxPercent(Number(e.target.value))}
                        className="w-12 text-center outline-none bg-transparent"
                      />
                      <span>%</span>
                    </div>
                  </div>
                )}
              </div>

              {setTaxEnabled && (
                <div className="pt-2 border-t border-dashed border-amber-500/15 flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-start">
                  <div>
                    <label className="block text-xs font-bold text-slate-700">
                      {language === 'ar' ? 'آلية احتساب الضريبة في الفاتورة (ZATCA)' : 'VAT Calculation Method (ZATCA Compliance)'}
                    </label>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {language === 'ar' 
                        ? 'اختر ما إذا كان سعر الصنف بالمنيو شاملاً بالفعل للضريبة أو تضاف فوقه عند إتمام الدفع.' 
                        : 'Choose whether menu prices are already VAT-inclusive or if VAT is added at checkout.'}
                    </span>
                  </div>
                  <select
                    value={setTaxMethod}
                    onChange={(e) => setSetTaxMethod(e.target.value as 'inclusive' | 'exclusive')}
                    className="text-xs bg-white border border-slate-200 rounded-xl p-2 px-3 font-semibold text-slate-800 outline-none focus:border-amber-500 cursor-pointer text-start"
                  >
                    <option value="inclusive">🇸🇦 {language === 'ar' ? 'شامل الضريبة المضافة (مضمنة بالمنيو)' : 'Tax Inclusive (Menu Price Includes VAT)'}</option>
                    <option value="exclusive">➕ {language === 'ar' ? 'غير شامل الضريبة (تضاف فوق السعر)' : 'Tax Exclusive (VAT Added On Top)'}</option>
                  </select>
                </div>
              )}
            </div>

            {/* Operating Hours Section */}
            <div className="md:col-span-2 pt-4 border-t border-slate-100 text-start">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500" />
                {language === 'ar' ? 'أوقات العمل الرسمية للمطعم' : 'Official Operating Hours'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/50">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'وقت بدء العمل (كل يوم)' : 'Opening Time (Daily)'}
                  </label>
                  <input
                    type="time"
                    value={setWorkingHoursStart}
                    onChange={(e) => setSetWorkingHoursStart(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono font-semibold"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {language === 'ar' ? 'مثال: 17:00 (5:00 مساءً)' : 'e.g., 17:00 (5:00 PM)'}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'وقت انتهاء العمل (كل يوم)' : 'Closing Time (Daily)'}
                  </label>
                  <input
                    type="time"
                    value={setWorkingHoursEnd}
                    onChange={(e) => setSetWorkingHoursEnd(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono font-semibold"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    {language === 'ar' ? 'مثال: 02:00 (2:00 صباحاً)' : 'e.g., 02:00 (2:00 AM)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Delivery Fee Settings Section */}
            <div className="md:col-span-2 pt-4 border-t border-slate-100 text-start">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-amber-500" />
                {language === 'ar' ? 'رسوم التوصيل الافتراضية' : 'Default Delivery Fees'}
              </h4>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/50 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700">
                    {language === 'ar' ? 'قيمة رسوم التوصيل المضافة تلقائياً:' : 'Standard Delivery Fee Amount:'}
                  </label>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {language === 'ar' 
                      ? 'يتم استخدام هذه القيمة كرسوم توصيل افتراضية وإرسالها للمندوب والعميل مع تفاصيل الطلب.' 
                      : 'This value will be used as the standard delivery charge for messaging drivers and customers.'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1.5 rounded-xl font-mono text-xs font-bold shadow-xs">
                  <input
                    type="number"
                    min="0"
                    value={setDeliveryFee}
                    onChange={(e) => setSetDeliveryFee(Number(e.target.value))}
                    className="w-16 text-center outline-none bg-transparent"
                  />
                  <span>{language === 'ar' ? 'ريال' : 'SAR'}</span>
                </div>
              </div>
            </div>

            {/* Bank Transfer Credentials Section */}
            <div className="md:col-span-2 pt-6 border-t border-slate-100 text-start animate-none">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Landmark className="w-4 h-4 text-amber-500" />
                {language === 'ar' ? 'بيانات التحويل البنكي (مصرف الراجحي)' : 'Bank Transfer Credentials (Al Rajhi)'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/50">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'اسم البنك (عربي)' : 'Bank Name (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={bankNameAr}
                    onChange={(e) => setBankNameAr(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'اسم البنك (إنجليزي)' : 'Bank Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={bankNameEn}
                    onChange={(e) => setBankNameEn(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'اسم صاحب الحساب (عربي)' : 'Account Name (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={bankAccountNameAr}
                    onChange={(e) => setBankAccountNameAr(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'اسم صاحب الحساب (إنجليزي)' : 'Account Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={bankAccountNameEn}
                    onChange={(e) => setBankAccountNameEn(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'رقم الحساب' : 'Account Number'}
                  </label>
                  <input
                    type="text"
                    value={bankAccountNumber}
                    onChange={(e) => {
                      const val = e.target.value;
                      setBankAccountNumber(val);
                      // Auto generate QR code based on Account Number for Al Rajhi App compatibility
                      if (val.trim()) {
                        setBankQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(val.trim())}`);
                      }
                    }}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'الآيبان IBAN' : 'IBAN Number'}
                  </label>
                  <input
                    type="text"
                    value={bankIban}
                    onChange={(e) => setBankIban(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'باركود التحويل السريع (صورة الـ QR)' : 'Quick Transfer QR Code'}
                  </label>
                  
                  {/* Drag-and-drop Image Uploader */}
                  <div 
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingQr(true);
                    }}
                    onDragLeave={() => setIsDraggingQr(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingQr(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith('image/')) {
                        if (file.size > 2 * 1024 * 1024) {
                          alert(language === 'ar' ? 'حجم الصورة كبير جداً! يرجى اختيار صورة أقل من 2 ميجابايت.' : 'Image size is too large! Please choose an image smaller than 2MB.');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          if (typeof reader.result === 'string') {
                            setBankQrUrl(reader.result);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className={`border-2 border-dashed rounded-2xl p-4 text-center transition-all flex flex-col md:flex-row items-center justify-between gap-4 ${
                      isDraggingQr 
                        ? 'border-amber-500 bg-amber-50/40 shadow-xs scale-[1.01]' 
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50'
                    }`}
                  >
                    {/* Left: Uploader UI */}
                    <div className="flex-1 flex flex-col items-center md:items-start text-center md:text-start space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-amber-500/10 text-amber-600 rounded-xl">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-700 block">
                            {language === 'ar' ? 'قم بسحب وإفلات صورة الباركود هنا' : 'Drag & drop QR image here'}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {language === 'ar' ? 'أو انقر لاختيار ملف من جهازك (بحد أقصى 2 ميجابايت)' : 'or click to browse from device (max 2MB)'}
                          </span>
                        </div>
                      </div>
                      
                      <label className="inline-flex items-center justify-center bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold py-1.5 px-3 rounded-xl cursor-pointer shadow-xs transition-all">
                        <Upload className="w-3.5 h-3.5 mr-1.5 ml-1.5" />
                        {language === 'ar' ? 'اختيار صورة الباركود' : 'Choose QR Image'}
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (file.size > 2 * 1024 * 1024) {
                                alert(language === 'ar' ? 'حجم الصورة كبير جداً! يرجى اختيار صورة أقل من 2 ميجابايت.' : 'Image size is too large! Please choose an image smaller than 2MB.');
                                return;
                              }
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                if (typeof reader.result === 'string') {
                                  setBankQrUrl(reader.result);
                                }
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                      </label>
                    </div>

                    {/* Right: Real-time QR Preview & Controls */}
                    <div className="flex flex-col items-center justify-center p-2.5 bg-white border border-slate-150 rounded-2xl shadow-xs shrink-0">
                      {bankQrUrl ? (
                        <div className="relative group">
                          <img 
                            src={bankQrUrl} 
                            alt="Al Rajhi Transfer QR Preview" 
                            className="w-24 h-24 object-contain rounded-lg"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => setBankQrUrl('')}
                              className="bg-red-600 hover:bg-red-700 text-white font-bold text-[9px] py-1 px-2 rounded-lg cursor-pointer transition-colors"
                            >
                              {language === 'ar' ? 'إزالة' : 'Remove'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="w-24 h-24 border border-dashed border-slate-200 rounded-lg flex flex-col items-center justify-center text-slate-400">
                          <Image className="w-6 h-6 mb-1 opacity-40" />
                          <span className="text-[9px] font-semibold">{language === 'ar' ? 'لا توجد صورة' : 'No QR set'}</span>
                        </div>
                      )}
                      <span className="text-[9px] text-slate-400 font-bold mt-1.5">{language === 'ar' ? 'معاينة مباشرة' : 'Live Preview'}</span>
                    </div>
                  </div>

                  {/* Manual URL / Auto-Generator Row */}
                  <div className="mt-3.5 space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                      {language === 'ar' ? 'أو استخدم رابط صورة خارجي / توليد تلقائي برقم الحساب:' : 'Or use external image URL / Auto-generate:'}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={bankQrUrl}
                        onChange={(e) => setBankQrUrl(e.target.value)}
                        placeholder={language === 'ar' ? 'أدخل رابط الصورة أو كود الـ base64 هنا' : 'Enter image URL or base64 data here'}
                        className="flex-1 text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (bankAccountNumber.trim()) {
                            setBankQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(bankAccountNumber.trim())}`);
                          } else {
                            alert(language === 'ar' ? 'الرجاء إدخال رقم الحساب أولاً لإنشاء الباركود' : 'Please input the Account Number first to generate barcode');
                          }
                        }}
                        className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[10px] px-3 rounded-xl cursor-pointer transition-colors whitespace-nowrap"
                      >
                        {language === 'ar' ? 'توليد تلقائي برقم الحساب' : 'Auto Generate QR'}
                      </button>
                    </div>
                  </div>
                  
                  <span className="text-[10px] text-slate-400 block mt-1.5 leading-relaxed">
                    {language === 'ar' 
                      ? '💡 لمطابقة تامة وتسهيل التحويل السريع بتطبيق الراجحي، اسحب وأفلت صورة باركود متجرك الحقيقي المأخوذة من تطبيق الراجحي مباشرة (تحويل سريع) لتخزينها محلياً في السحابة.' 
                      : '💡 For perfect compatibility with the Al Rajhi app, simply drag & drop your real official store transfer QR code image.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Thermal Printer & Receipt Style Customizer Section */}
            <div className="md:col-span-2 pt-6 border-t border-slate-100 text-start">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5 justify-between">
                <span className="flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-emerald-600 animate-pulse" />
                  {language === 'ar' ? 'أبعاد وتصميم الفاتورة ومخرجات الطابعات الحرارية' : 'Receipt Printer Customization & Thermal Output Settings'}
                </span>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold">
                  {language === 'ar' ? 'مع تصفير وتجاوز الهوامش' : 'Zero Margin Override'}
                </span>
              </h4>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/50 p-5 rounded-3xl border border-slate-200/60 shadow-xs">
                {/* Control sliders and inputs column */}
                <div className="lg:col-span-7 space-y-5">
                  
                  {/* Presets Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        {language === 'ar' ? 'عرض رول الطابعة الحرارية' : 'Thermal Roll Width'}
                      </label>
                      <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                        {['58mm', '80mm', '100%'].map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => setSetReceiptWidth(w)}
                            className={`py-1 text-[10px] font-bold rounded-lg cursor-pointer transition-all ${
                              setReceiptWidth === w
                                ? 'bg-white text-emerald-700 shadow-xs border border-emerald-500/10'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400 block mt-1">
                        {language === 'ar' ? 'المقاس المعتاد لطابعات الفواتير هو 80mm وللطابعات الصغيرة 58mm' : '80mm is standard premium, 58mm is for smaller compact slips.'}
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        {language === 'ar' ? 'حجم لوجو الفاتورة' : 'Receipt Logo Width'}
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="40"
                          max="150"
                          value={setReceiptLogoSize}
                          onChange={(e) => setSetReceiptLogoSize(Number(e.target.value))}
                          className="flex-1 accent-emerald-600 cursor-ew-resize"
                        />
                        <span className="text-xs font-bold font-mono text-emerald-600 shrink-0">{setReceiptLogoSize}px</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        {language === 'ar' ? 'قم بتصغير الحجم إذا كان اللوجو كبيراً ويأخذ مساحات ورق كبيرة' : 'Shrink to conserve thermal paper roll resources.'}
                      </span>
                    </div>
                  </div>

                  <div className="h-px bg-slate-250/20" />

                  {/* Independent slip type toggles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 bg-white rounded-xl border border-slate-200/50">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="show-cust-receipt-checkbox"
                          checked={setShowCustomerReceiptOnPrint}
                          onChange={(e) => setSetShowCustomerReceiptOnPrint(e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 cursor-pointer"
                        />
                        <label htmlFor="show-cust-receipt-checkbox" className="text-xs font-black text-slate-850 cursor-pointer">
                          {language === 'ar' ? 'طباعة فاتورة العميل المعتمدة' : 'Print Customer Receipt'}
                        </label>
                      </div>
                      <div className="mt-2 pl-6 text-[10px] text-slate-400">
                        {language === 'ar' ? 'الفاتورة الرقمية الحاوية على عنوان المحل، الضرائب ورمز الاستجابة ZATCA QR' : 'VAT-compliant tax invoice containing local qr code and summary.'}
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200/50">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="show-prep-slip-checkbox"
                          checked={setShowKitchenSlipOnPrint}
                          onChange={(e) => setSetShowKitchenSlipOnPrint(e.target.checked)}
                          className="w-4 h-4 accent-emerald-600 cursor-pointer"
                        />
                        <label htmlFor="show-prep-slip-checkbox" className="text-xs font-black text-slate-850 cursor-pointer">
                          {language === 'ar' ? 'طباعة بطاقة تحضير المطبخ' : 'Print Kitchen Prep Slip'}
                        </label>
                      </div>
                      <div className="mt-2 pl-6 text-[10px] text-slate-400">
                        {language === 'ar' ? 'ورقة صغيرة تذهب للطاهي في المطبخ بها رقم الطاولة والأصناف فقط دون أسعار' : 'Item names and quantities only, omitting prices for culinary privacy.'}
                      </div>
                    </div>
                  </div>

                  {/* Font resizing block */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        {language === 'ar' ? 'حجم خط فاتورة العميل (الأساسي)' : 'Customer Receipt Font'}
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="9"
                          max="18"
                          value={setReceiptFontSize}
                          onChange={(e) => setSetReceiptFontSize(Number(e.target.value))}
                          className="flex-1 accent-emerald-600 cursor-ew-resize"
                        />
                        <span className="text-xs font-bold font-mono text-emerald-600 shrink-0">{setReceiptFontSize}px</span>
                      </div>
                      <span className="text-[10px] text-slate-400 block">
                        {language === 'ar' ? 'افتراضي هو 11px لتجنب خروج النصوص عن الورقة الحرارية الباهتة' : '11px standard prevents text overflowing.'}
                      </span>
                    </div>

                    {setShowKitchenSlipOnPrint && (
                      <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">
                          {language === 'ar' ? 'حجم خط فاتورة تحضير المطبخ' : 'Kitchen Preparation Font'}
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="10"
                            max="22"
                            value={setKitchenSlipFontSize}
                            onChange={(e) => setSetKitchenSlipFontSize(Number(e.target.value))}
                            className="flex-1 accent-emerald-600 cursor-ew-resize"
                          />
                          <span className="text-xs font-bold font-mono text-emerald-600 shrink-0">{setKitchenSlipFontSize}px</span>
                        </div>
                        <span className="text-[10px] text-slate-400 block">
                          {language === 'ar' ? 'اجعلها أكبر حجماً حتى يراها طاقم المطبخ بوضوح بدون نظارة!' : 'Enhance size so chefs scan orders from afar.'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Headers/Footers inputs */}
                  <div className="space-y-3.5">
                    {setShowKitchenSlipOnPrint && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {language === 'ar' ? 'ترويسة بطاقة المطبخ (عربي)' : 'Kitchen Slip Header (AR)'}
                          </label>
                          <input
                            type="text"
                            value={setKitchenSlipHeaderAr}
                            onChange={(e) => setSetKitchenSlipHeaderAr(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2 outline-none focus:border-emerald-500 font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 mb-1">
                            {language === 'ar' ? 'ترويسة بطاقة المطبخ (انجليزي)' : 'Kitchen Slip Header (EN)'}
                          </label>
                          <input
                            type="text"
                            value={setKitchenSlipHeaderEn}
                            onChange={(e) => setSetKitchenSlipHeaderEn(e.target.value)}
                            className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2 outline-none focus:border-emerald-500 font-bold"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          {language === 'ar' ? 'الرسالة الترحيبية أسفل الفاتورة (عربي)' : 'Receipt Footer Message (AR)'}
                        </label>
                        <input
                          type="text"
                          placeholder={language === 'ar' ? 'مثال: شكراً لزيارتكم! بالهناء والشفاء' : 'e.g. Thanks for your visit! Enjoy!'}
                          value={setInvoiceFooterAr}
                          onChange={(e) => setSetInvoiceFooterAr(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">
                          {language === 'ar' ? 'الرسالة الترحيبية أسفل الفاتورة (انجليزي)' : 'Receipt Footer Message (EN)'}
                        </label>
                        <input
                          type="text"
                          placeholder={language === 'ar' ? 'مثال: بالهناء والشفاء' : 'e.g., Thank you so much!'}
                          value={setInvoiceFooterEn}
                          onChange={(e) => setSetInvoiceFooterEn(e.target.value)}
                          className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2 outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-slate-200/60" />

                  {/* ═════════════════════════════════════════════════════════════════
                      PRINTER DIRECTORIES & ROUTING PATHS (تحديد مسارات وتوجيه الطابعات)
                      ═════════════════════════════════════════════════════════════════ */}
                  <div className="p-4 bg-amber-50/40 rounded-2xl border border-amber-200/50 space-y-4 text-start">
                    <div className="flex items-center gap-2 pb-2 border-b border-amber-250/20">
                      <div className="bg-amber-100 text-amber-800 p-1 rounded-lg">
                        <Printer className="w-4 h-4 text-amber-700 animate-pulse" />
                      </div>
                      <div>
                        <h5 className="text-xs font-extrabold text-slate-800">
                          {language === 'ar' ? 'مسارات طابعات فواتير الكاشير والتحضير' : 'Printer Routing Engine & Local Paths Setup'}
                        </h5>
                        <p className="text-[10px] text-slate-400">
                          {language === 'ar' ? 'قم بضبط توجيه الفواتير تلقائياً لطابعاتك الموصلة بالسلك (POS-90) والشبكة (EZ-P005 192.168.1.23)' : 'Configure automatic receipt dispatch to your POS-90 local USB and EZ-P005 network printers.'}
                        </p>
                      </div>
                    </div>

                    {/* Arabic tailored guidance banner */}
                    <div className="bg-emerald-50 border border-emerald-250/70 p-3 rounded-xl space-y-1.5 text-[10px] leading-relaxed text-emerald-850">
                      <strong className="font-extrabold block text-emerald-900">💡 دليل ضبط طابعات متجرك الخاصة (رحلة شواء):</strong>
                      <ul className="list-disc pr-3 space-y-1 text-emerald-800 select-text">
                        <li>
                          <strong>طابعة الفواتير (الكاشير) الأولى الموصلة بالسلك:</strong> تم تعريفها باسم <strong>POS-90</strong> على منفذ <strong>USB002</strong>. اختر نوع الاتصال <em>(مسار طابعة المتصفح)</em> لها.
                        </li>
                        <li>
                          <strong>طابعة المطبخ (التحضير) الثانية الشبكية:</strong> تم ربطها بـ IP السلكي الخاص بك <strong>192.168.1.23</strong> (الموديل <strong>EZ-P005 80mm</strong>).
                        </li>
                        <li>
                          <strong>طريقة التوجيه التلقائي الذكية (موصى بها جداً):</strong> 
                          قم بتفعيل خيار <strong>توجيه منفصل (تلقائي بالتتابع) 📱</strong> بالأسفل. عند الضغط على زر "طباعة" باللوحة:
                          <ol className="list-decimal pr-4 pt-1 space-y-0.5">
                            <li>ستفتح تلقائياً نافذة طباعة العميل أولاً، اختر طابعة <strong>POS-90</strong> واحفظها كافتراضية.</li>
                            <li>ستفتح تلقائياً بعدها مباشرة نافذة طباعة المطبخ فوراً، اختر الطابعة <strong>EZ-P005 80mm</strong> واحفظها كافتراضية.</li>
                          </ol>
                        </li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      {/* 1. Routing Mode Choice */}
                      <div>
                        <label className="block text-[11px] font-black text-slate-700 mb-1">
                          {language === 'ar' ? 'آلية معالجة الطباعة وتوجيه الورق' : 'Print Dispatching & Routing Mode'}
                        </label>
                        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setPrintRoutingMode('unified')}
                            className={`py-1.5 px-2.5 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                              printRoutingMode === 'unified'
                                ? 'bg-white text-emerald-800 shadow-xs border border-emerald-500/15'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            📄 {language === 'ar' ? 'طباعة مدمجة (فاتورة ومطبخ معاً)' : 'Unified (Single Roll)'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrintRoutingMode('split')}
                            className={`py-1.5 px-2.5 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                              printRoutingMode === 'split'
                                ? 'bg-white text-orange-850 shadow-xs border border-orange-500/15'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            📱 {language === 'ar' ? 'توجيه منفصل (توجيه تلقائي بالتتابع)' : 'Split Print (Auto-Routing)'}
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 mt-1 leading-snug">
                          {printRoutingMode === 'split'
                            ? (language === 'ar' ? '💡 ممتاز! سيقوم النظام بتشغيل أمر طباعة الفاتورة لـ POS-90 أولاً ثم أمر المطبخ لـ EZ-P005 تلقائياً وبشكل مستقل.' : 'Runs two sequential print jobs automatically, enabling independent target printer routing.')
                            : (language === 'ar' ? 'فاتورة العميل وبطاقة المطبخ تخرجان متتاليتين في نفس أمر الطباعة الحالي لتوفير الوقت.' : 'Includes customer and kitchen items in one continuous output block to save dispatch time.')}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2">
                        {/* 2. Cashier Printer Route */}
                        <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs space-y-2">
                          <span className="text-[11px] font-extrabold text-emerald-700 block border-b border-slate-100 pb-1">
                            💵 {language === 'ar' ? 'مسار طابعة الفواتير (الكاشير POS-90)' : 'Cashier Printer (POS-90)'}
                          </span>
                          
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">{language === 'ar' ? 'بروتوكول الاتصال المفضل' : 'Interface Protocol'}</label>
                            <select
                              value={cashierPrinterType}
                              onChange={(e) => setCashierPrinterType(e.target.value as 'browser' | 'network')}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 outline-none focus:bg-white"
                            >
                              <option value="browser">💻 Browser Dialog (مسار طابعة المتصفح المباشر)</option>
                              <option value="network">🌐 Local Network IP (منفذ شبكة TCP/IP 9100)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              {cashierPrinterType === 'network' ? (language === 'ar' ? 'عنوان IP الطابعة المحلية' : 'Local Printer Network IP') : (language === 'ar' ? 'اسم الطابعة المعرف بجهازك' : 'Local Host printer path / Label')}
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={cashierPrinterIp}
                                onChange={(e) => setCashierPrinterIp(e.target.value)}
                                placeholder="POS-90"
                                className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 outline-none focus:bg-white font-mono font-bold"
                              />
                              {cashierPrinterType === 'network' && (
                                <input
                                  type="number"
                                  value={cashierPrinterPort}
                                  onChange={(e) => setCashierPrinterPort(Number(e.target.value))}
                                  className="w-16 text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 outline-none text-center font-mono"
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 3. Kitchen Printer Route */}
                        <div className="p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs space-y-2">
                          <span className="text-[11px] font-extrabold text-amber-700 block border-b border-slate-100 pb-1">
                            🍳 {language === 'ar' ? 'مسار طابعة المطبخ (EZ-P005)' : 'Kitchen Printer (EZ-P005)'}
                          </span>
                          
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">{language === 'ar' ? 'بروتوكول الاتصال المفضل' : 'Interface Protocol'}</label>
                            <select
                              value={kitchenPrinterType}
                              onChange={(e) => setKitchenPrinterType(e.target.value as 'browser' | 'network')}
                              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 outline-none focus:bg-white"
                            >
                              <option value="browser">💻 Browser Dialog (مسار طابعة المتصفح المباشر)</option>
                              <option value="network">🌐 Local Network IP (منفذ شبكة TCP/IP 9100)</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              {kitchenPrinterType === 'network' ? (language === 'ar' ? 'عنوان IP طابعة المطبخ المعرف' : 'Kitchen Printer IP') : (language === 'ar' ? 'اسم طابعة المطبخ المعرفة بجهازك' : 'Local Host printer path / Label')}
                            </label>
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={kitchenPrinterIp}
                                onChange={(e) => setKitchenPrinterIp(e.target.value)}
                                placeholder="192.168.1.23"
                                className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 outline-none focus:bg-white font-mono font-bold"
                              />
                              {kitchenPrinterType === 'network' && (
                                <input
                                  type="number"
                                  value={kitchenPrinterPort}
                                  onChange={(e) => setKitchenPrinterPort(Number(e.target.value))}
                                  className="w-16 text-xs bg-slate-50 border border-slate-200 rounded-lg p-1.5 outline-none text-center font-mono"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>

                  <div className="h-px bg-slate-200/60" />

                  {/* Calibration trigger button */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleTriggerTestPrint}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-650 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wide cursor-pointer transition-all shadow-md active:scale-[0.98]"
                    >
                      <Printer className="w-4 h-4 shrink-0 animate-bounce" />
                      <span>
                        {language === 'ar'
                          ? '🖨️ اضغط لتشغيل طباعة تجريبية واختبار الطابعة'
                          : '🖨️ Run Thermal Alignment & Calibration Test Print'}
                      </span>
                    </button>
                    <p className="text-[10px] text-slate-400 mt-1.5 text-center leading-relaxed">
                      {language === 'ar'
                        ? 'سيقوم هذا الزر بإرسال عينة فاتورة إلكترونية حقيقية إلى طابعتك الحرارية الحالية لمعاينة دقة وعرض النصوص والخطوط!'
                        : 'Sends a real structural sample invoice to your thermal printer to verify formatting immediately!'}
                    </p>
                  </div>

                </div>

                {/* Simulated Real Thermal Roll Preview Column */}
                <div className="lg:col-span-5 bg-gradient-to-b from-slate-100 to-slate-200/50 p-4 rounded-3xl border border-slate-250 flex flex-col items-center justify-start min-h-[380px]">
                  <span className="text-[10px] uppercase font-black tracking-widest text-slate-500 mb-3 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    {language === 'ar' ? 'شاشه محاكاة رول الطباعة الفوري' : 'Live Thermal Roll Preview'}
                  </span>
                  
                  {/* Virtual Thermal Paper roll card */}
                  <div 
                    style={{ width: setReceiptWidth === '100%' ? '100%' : setReceiptWidth }}
                    className="bg-white border border-slate-300 shadow-lg text-black px-3.5 py-4 text-start font-sans overflow-x-hidden relative transition-all"
                  >
                    {/* Jagged tear top effect */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-repeat-x" style={{ backgroundImage: 'linear-gradient(45deg, transparent 33.333%, #cbd5e1 33.333%, #cbd5e1 66.667%, transparent 66.667%), linear-gradient(-45deg, transparent 33.333%, #cbd5e1 33.333%, #cbd5e1 66.667%, transparent 66.667%)', backgroundSize: '6px 3px' }} />
                    
                    {/* Receipt Body mockup container */}
                    <div className="space-y-4 pt-1.5">
                      
                      {/* Customer portion */}
                      {setShowCustomerReceiptOnPrint && (
                        <div className="border-b border-dashed border-neutral-300 pb-3" style={{ fontSize: `${setReceiptFontSize}px` }}>
                          
                          {/* Logo container if has any, or default */}
                          <div className="flex flex-col items-center pb-2">
                            <div 
                              style={{ width: `${setReceiptLogoSize}px`, height: `${setReceiptLogoSize}px` }}
                              className="rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs uppercase overflow-hidden border border-neutral-300 shadow-xs"
                            >
                              {setLogoUrl ? (
                                <img src={setLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                              ) : (
                                <span>{language === 'ar' ? setRestaurantNameAr.charAt(0) : setRestaurantNameEn.charAt(0)}</span>
                              )}
                            </div>
                            <span className="font-extrabold mt-1.5" style={{ fontSize: `${setReceiptFontSize + 3}px` }}>
                              {language === 'ar' ? setRestaurantNameAr : setRestaurantNameEn}
                            </span>
                            <span className="text-[9px] text-neutral-500 block leading-tight">
                              {language === 'ar' ? setTaglineAr : setTaglineEn}
                            </span>
                          </div>

                          <div className="space-y-0.5 text-[10px] text-neutral-600 font-mono">
                            <div>{language === 'ar' ? 'رقم الفاتورة: REHLA-1002' : 'Invoice: REHLA-1002'}</div>
                            <div>{language === 'ar' ? 'التاريخ: ١٥-٠٦-٢٠٢٦ ٩:٤٥م' : 'Date: 2026-06-15 21:45'}</div>
                            <div>{language === 'ar' ? `الرقم الضريبي: ${setVatNumber || '310123456700003'}` : `VAT No: ${setVatNumber || '310123456700003'}`}</div>
                          </div>

                          <div className="h-px bg-dashed bg-neutral-300 my-2" />

                          {/* Mock Items list */}
                          <div className="space-y-1">
                            <div className="flex justify-between font-black text-[10px] text-neutral-700">
                              <span>{language === 'ar' ? 'الصنف' : 'Item'}</span>
                              <span>{language === 'ar' ? 'الكمية × السعر' : 'Qty × Price'}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span>{language === 'ar' ? 'كباب لحم فاخر ١ نفر' : 'Premium Beef Kabab 1'}</span>
                              <span>١ × ٣٥.{t('sar')}</span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span>{language === 'ar' ? 'بطاطس مقلية مقرمشة' : 'Crispy Fries Large'}</span>
                              <span>٢ × ٨.{t('sar')}</span>
                            </div>
                          </div>

                          <div className="h-px bg-neutral-200 my-2" />

                          <div className="space-y-0.5 font-mono text-[9px] text-neutral-600">
                            <div className="flex justify-between">
                              <span>{language === 'ar' ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
                              <span>٥١.٠٠ {t('sar')}</span>
                            </div>
                            <div className="flex justify-between text-neutral-700">
                              <span>{language === 'ar' ? 'ضريبة القيمة المضافة (١٥٪):' : 'VAT (15%):'}</span>
                              <span>٧.٦٥ {t('sar')}</span>
                            </div>
                            <div className="flex justify-between text-neutral-900 font-black text-[11px] mt-1 pt-1 border-t border-dotted border-neutral-300">
                              <span>{language === 'ar' ? 'المجموع النهائي:' : 'GRAND TOTAL:'}</span>
                              <span>٥٨.٦٥ {t('sar')}</span>
                            </div>
                          </div>

                          {/* Footer Mock */}
                          <div className="pt-2 text-center text-[10px] text-neutral-500 border-t border-dotted border-neutral-300 mt-2.5">
                            {language === 'ar' ? (setInvoiceFooterAr || 'شكراً لزيارتكم! بالهناء والشفاء') : (setInvoiceFooterEn || 'Thank you for your visit!')}
                          </div>
                        </div>
                      )}

                      {/* Kitchen Slip portion mock up */}
                      {setShowKitchenSlipOnPrint && (
                        <div className="bg-neutral-50 p-2 rounded-lg border border-dashed border-neutral-300" style={{ fontSize: `${setKitchenSlipFontSize}px` }}>
                          <div className="text-center pb-1.5 border-b border-dotted border-neutral-300">
                            <span className="font-extrabold uppercase" style={{ fontSize: `${setKitchenSlipFontSize + 2}px` }}>
                              🍴 {language === 'ar' ? setKitchenSlipHeaderAr : setKitchenSlipHeaderEn}
                            </span>
                            <div className="text-[10px] font-bold text-red-650 font-mono mt-0.5">
                              {language === 'ar' ? 'رقم الطلب: #1002 (محلي طاولة: 4)' : 'Order ID: #1002 (Table: 4)'}
                            </div>
                          </div>
                          
                          <div className="space-y-1 py-2 text-start font-black">
                            <div className="text-stone-900">١ × {language === 'ar' ? 'كباب لحم فاخر ١ نفر' : 'Premium Beef Kabab 1'}</div>
                            <div className="text-stone-900">٢ × {language === 'ar' ? 'بطاطس مقلية مقرمشة' : 'Crispy Fries Large'}</div>
                          </div>
                          <div className="text-[9px] text-center text-neutral-400 font-mono">
                            {language === 'ar' ? 'طابعة تحضير المطبخ - بدون اسعار' : 'Culinary Kitchen Prep copy'}
                          </div>
                        </div>
                      )}

                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>

          <div className="pt-2 flex justify-end">
            <button
              id="save-business-settings-submit"
              type="submit"
              className="bg-stone-900 text-white hover:bg-stone-850 text-xs font-black py-3 px-8 rounded-xl cursor-pointer shadow-md transition-all font-sans uppercase tracking-wider"
            >
              {language === 'ar' ? 'حفظ معلومات الهوية والضريبة 💾' : 'Save Business Settings 💾'}
            </button>
          </div>
        </form>
      </div>

      {/* PROMOTIONS & DEALS MANAGEMENT SECTION */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-xs space-y-5">
        <div className="text-start border-b border-slate-100 pb-4">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Flame className="w-5 h-5 text-red-500 fill-red-500/10 animate-pulse font-bold" />
            {language === 'ar' ? 'التحكم بالعروض والخصومات وحملات التسويق' : 'Promotions & Discounts Management'}
          </h3>
          <p className="text-xs text-slate-500">
            {language === 'ar' ? 'قم بإنشاء عروض ترويجية بنسبة تخفيض مالي مع مؤقت عد تنازلي حي يظهر بالصفحة الرئيسية للمتصفحين' : 'Configure time-limited percentage discount incentives with active counter clocks displayed live'}
          </p>
        </div>

        {/* Promotion Form */}
        <form onSubmit={handlePublishPromo} className="grid grid-cols-1 md:grid-cols-2 gap-4 text-start">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'عنوان العرض (عربي)' : 'Offer Title (Arabic)'}</label>
            <input
              required
              type="text"
              value={promoTitleAr}
              onChange={(e) => setPromoTitleAr(e.target.value)}
              placeholder="مثال: خصم خاص لطلبات الويكند!"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'عنوان العرض (إنجليزي)' : 'Offer Title (English)'}</label>
            <input
              required
              type="text"
              value={promoTitle}
              onChange={(e) => setPromoTitle(e.target.value)}
              placeholder="e.g. Special Weekend Feast Offer!"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'نسبة التخفيض من السعر الفرعي (%)' : 'Discount Percentage (%)'}</label>
            <input
              required
              type="number"
              min="1"
              max="99"
              value={promoPercent}
              onChange={(e) => setPromoPercent(Number(e.target.value))}
              placeholder="e.g. 15"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-amber-500"
            />
          </div>
          
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'وقت وتاريخ نهاية العرض والعد التنازلي' : 'Offer Expiry Date & Countdown Time'}</label>
            <div className="flex flex-col gap-1.5">
              <input
                required
                type="datetime-local"
                value={promoEndsAt}
                onChange={(e) => setPromoEndsAt(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-amber-500 font-mono"
              />
              
              {/* Quick presets */}
              <div className="flex gap-1.5 flex-wrap mt-1 font-sans">
                {[5, 15, 30, 60, 120, 1440].map((mins) => {
                  let lbl = '';
                  if (mins === 5) lbl = language === 'ar' ? '٥ دقائق' : '5 mins';
                  else if (mins === 15) lbl = language === 'ar' ? '١٥ دقيقة' : '15 mins';
                  else if (mins === 30) lbl = language === 'ar' ? '٣٠ دقيقة' : '30 mins';
                  else if (mins === 60) lbl = language === 'ar' ? 'ساعة كاملة' : '1 hour';
                  else if (mins === 120) lbl = language === 'ar' ? 'ساعتين' : '2 hours';
                  else lbl = language === 'ar' ? 'يوم كامل' : '24 hours';

                  return (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleQuickPromoTime(mins)}
                      className="bg-neutral-100 hover:bg-neutral-200 text-[10px] text-neutral-600 px-2 py-1 rounded font-extrabold cursor-pointer transition animate-none"
                    >
                      +{lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'رابط صّورة لخلفية الإعلان (بشكل خفيف وجميل)' : 'Promotion Banner Backdrop Image URL'}</label>
            <input
              type="text"
              value={promoImageUrl}
              onChange={(e) => setPromoImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=1200"
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:border-amber-500 font-mono"
            />
            <p className="text-[10px] text-zinc-400 mt-1">
              {language === 'ar' ? 'ستظّهر هذه الصورة كخلفية خفيفة ملطفة جميلة لبطاقة الإعلانات الترويجية أعلى صفحة المنيو الرئيسي.' : 'This image will be displayed with organic blur and low opacity as the backdrop of the countdown offer banner.'}
            </p>
          </div>

          <div className="md:col-span-2 flex flex-col sm:flex-row items-start sm:items-center justify-between border-t border-slate-100/80 pt-4 mt-2 gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="promo-active-toggle"
                checked={promoIsActive}
                onChange={(e) => setPromoIsActive(e.target.checked)}
                className="w-4 h-4 accent-amber-600"
              />
              <label htmlFor="promo-active-toggle" className="text-xs font-bold text-slate-600">
                {language === 'ar' ? 'تنفيذ العرض ونشره حياً للمتصفحين فوراً' : 'Activate and list promotion deals page-wide'}
              </label>
            </div>

            <div className="flex gap-2 w-full sm:w-auto justify-end">
              {activePromo && (
                <button
                  type="button"
                  onClick={handleDeletePromo}
                  className="bg-red-50 hover:bg-red-100 border border-red-100 text-red-600 text-xs font-bold py-2 px-4 rounded-xl cursor-pointer transition-all"
                >
                  {language === 'ar' ? 'إلغاء ووقف العرض' : 'Stop Promo'}
                </button>
              )}
              <button
                id="publish-promo-btn"
                type="submit"
                className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-black py-2.5 px-6 rounded-xl cursor-pointer shadow-sm transition-all"
              >
                {language === 'ar' ? 'أطلق العرض الآن 📣' : 'Launch Custom Promo 📣'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* DRIVERS MANAGEMENT SECTION */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-xs space-y-5">
        <div className="text-start border-b border-slate-100 pb-4">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-500 font-bold" />
            {language === 'ar' ? 'إدارة مناديب التوصيل' : 'Drivers Management'}
          </h3>
          <p className="text-xs text-slate-500">
            {language === 'ar' ? 'أضف مناديب التوصيل الخاصين بك وتتبع حالتهم لتسهيل تعيينهم وإسناد الطلبات إليهم في ثوانٍ معدودة' : 'Add your delivery drivers and track their availability to assign them orders in seconds'}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-start">
          {/* Add/Edit Driver Form */}
          <div className="bg-slate-50/50 border border-slate-200/50 p-4 rounded-2xl">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-amber-500" />
              {language === 'ar' ? 'إضافة مندوب جديد' : 'Add New Driver'}
            </h4>
            <form onSubmit={handleSaveDriver} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'اسم المندوب' : 'Driver Name'}</label>
                <input
                  required
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: محمد الربيعان' : 'e.g. Mohammed Al-Rubaian'}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:border-amber-500 font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'رقم الجوال (واتساب)' : 'Phone Number (WhatsApp)'}</label>
                <input
                  required
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: 9665XXXXXXXX' : 'e.g. 9665XXXXXXXX'}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none focus:border-amber-500 font-mono"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-black py-2.5 rounded-xl cursor-pointer shadow-xs transition-all active:scale-[0.98]"
              >
                {language === 'ar' ? 'إضافة المندوب ➕' : 'Add Driver ➕'}
              </button>
            </form>

            {/* Standalone Driver Portal Link Box */}
            <div className="mt-4 bg-yellow-50/50 border border-yellow-200 p-4 rounded-2xl space-y-2">
              <h5 className="text-xs font-black text-yellow-800 flex items-center gap-1.5">
                🔗 {language === 'ar' ? 'بوابة المناديب المستقلة' : 'Standalone Driver Portal'}
              </h5>
              <p className="text-[10px] text-yellow-700 leading-normal">
                {language === 'ar' 
                  ? 'رابط البوابة المستقلة للمناديب لتسجيل الدخول وتسليم الطلبات بشكل منفصل تماماً عن منيو الزبائن.' 
                  : 'Link to the standalone driver portal for sign-in and delivery updates separate from customer menu.'}
              </p>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={window.location.origin + '/driver'}
                  className="flex-1 text-[10px] bg-white border border-yellow-200 rounded-lg p-2 font-mono outline-none text-slate-700 select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin + '/driver');
                    alert(language === 'ar' ? 'تم نسخ الرابط بنجاح! 📋' : 'Link copied successfully! 📋');
                  }}
                  className="bg-yellow hover:bg-yellow-500 text-black text-[10px] font-black px-3 py-2 rounded-lg cursor-pointer transition-all shrink-0"
                >
                  {language === 'ar' ? 'نسخ' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          {/* Drivers List */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Registered Drivers Subsection */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-amber-500" />
                {language === 'ar' ? `قائمة المناديب المسجلين المعتمدين (${drivers.length})` : `Approved Drivers List (${drivers.length})`}
              </h4>

              {drivers.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 p-8 rounded-2xl text-center">
                  <p className="text-xs text-slate-400">
                    {language === 'ar' 
                      ? 'لم يتم تسجيل أي مناديب بعد. استخدم النموذج الجانبي لإضافة مندوبك الأول!' 
                      : 'No drivers registered yet. Use the sidebar form to add your first driver!'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                  {drivers.map((drv) => (
                    <div key={drv.id} className="bg-white border border-slate-150 p-3 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                      <div className="text-start">
                        <p className="text-xs font-bold text-slate-800">{drv.name}</p>
                        <a href={`tel:${drv.phone}`} className="text-[11px] font-mono font-semibold text-blue-600 hover:underline">
                          📞 {drv.phone}
                        </a>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Availability status badge & toggle */}
                        <button
                          onClick={() => handleToggleDriverStatus(drv.id, drv.status)}
                          disabled={updatingDriverId === drv.id}
                          className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer active:scale-95 flex items-center gap-1 ${
                            drv.status === 'available'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-rose-50 border-rose-200 text-rose-700'
                          }`}
                        >
                          {updatingDriverId === drv.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <span>
                              {drv.status === 'available' 
                                ? (language === 'ar' ? '● متاح' : '● Available') 
                                : (language === 'ar' ? '● مشغول' : '● Busy')}
                            </span>
                          )}
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => {
                            if (confirm(language === 'ar' ? `هل أنت متأكد من حذف المندوب ${drv.name}؟` : `Are you sure you want to delete driver ${drv.name}?`)) {
                              handleDeleteDriver(drv.id);
                            }
                          }}
                          disabled={updatingDriverId === drv.id}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          title={language === 'ar' ? 'حذف المندوب' : 'Delete Driver'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Registrations Subsection */}
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <h4 className="text-xs font-black text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
                {language === 'ar' 
                  ? `طلبات تسجيل المناديب المعلقة (${pendingDrivers.length})` 
                  : `Pending Driver Registrations (${pendingDrivers.length})`}
              </h4>

              {pendingDrivers.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-150 p-6 rounded-2xl text-center">
                  <p className="text-xs text-slate-400 font-semibold">
                    {language === 'ar' 
                      ? 'لا توجد طلبات تسجيل معلقة حالياً.' 
                      : 'No pending registration requests at this time.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                  {pendingDrivers.map((pending) => (
                    <div key={pending.id} className="bg-amber-50/20 border border-amber-100 p-3.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-3">
                        {pending.carRegistrationImg ? (
                          <img
                            src={pending.carRegistrationImg}
                            alt="Car registration"
                            className="w-12 h-12 rounded-xl object-cover border border-amber-200 cursor-zoom-in hover:scale-105 transition-transform shrink-0"
                            onClick={() => setSelectedDocPreview(pending.carRegistrationImg)}
                            title={language === 'ar' ? 'اضغط لتكبير الصورة' : 'Click to enlarge'}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                            📄
                          </div>
                        )}
                        <div className="text-start">
                          <p className="text-xs font-bold text-slate-800">{pending.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <a href={`tel:${pending.phone}`} className="text-[11px] font-mono font-bold text-blue-600 hover:underline">
                              📞 {pending.phone}
                            </a>
                            <span className="text-[10px] text-slate-400">
                              • {new Date(pending.createdAt).toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-US')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          onClick={() => handleApprovePendingDriver(pending)}
                          disabled={updatingDriverId === pending.id}
                          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                        >
                          {updatingDriverId === pending.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <span>{language === 'ar' ? 'قبول واعتماد ✅' : 'Approve ✅'}</span>
                          )}
                        </button>
                        <button
                          onClick={() => handleRejectPendingDriver(pending.id)}
                          disabled={updatingDriverId === pending.id}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 text-[10px] font-black rounded-lg transition-colors flex items-center gap-1 cursor-pointer active:scale-95"
                        >
                          <span>{language === 'ar' ? 'رفض ❌' : 'Reject ❌'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* CORE MENU ITEMS CONTROLS */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-xs space-y-5">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div className="text-start">
            <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-amber-500" />
              {t('controlMenu')}
            </h3>
            <p className="text-xs text-slate-500">{language === 'ar' ? 'تعديل أسعار العناصر أو حجب المنتجات غير المتوفرة فوراً' : 'Adjust product prices and toggle live stock availability'}</p>
          </div>

          <button
            id="admin-add-item-trigger"
            onClick={() => {
              if (showItemForm) {
                setShowItemForm(false);
              } else {
                setFormId('');
                setFormName('');
                setFormNameAr('');
                setFormDesc('');
                setFormDescAr('');
                setFormPrice(10);
                setFormCategory('main');
                setFormCalories(0);
                setFormImage('');
                setFormPopular(false);
                setIsEditMode(false);
                setEditingItemId(null);
                setShowItemForm(true);
              }
            }}
            className="bg-amber-600 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-xs hover:bg-amber-700 transition"
          >
            {showItemForm ? (language === 'ar' ? 'إغلاق النموذج' : 'Close Form') : (language === 'ar' ? '+ صنف جديد' : '+ New Item')}
          </button>
        </div>

        {/* Add custom Item form panel */}
        <AnimatePresence>
          {showItemForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border border-amber-100 bg-amber-50/15 p-4 rounded-2xl"
            >
              <form onSubmit={handleAddItem} className="grid grid-cols-1 md:grid-cols-3 gap-4 text-start">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'المعرّف الفريد (ID) - غير قابل للتعديل' : 'Unique Item Code - Readonly in Edit'}</label>
                  <input
                    required
                    disabled={isEditMode}
                    type="text"
                    value={formId}
                    onChange={(e) => setFormId(e.target.value)}
                    placeholder="e.g. delicious_salad"
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'الاسم (عربي)' : 'Name (Arabic)'}</label>
                  <input
                    required
                    type="text"
                    value={formNameAr}
                    onChange={(e) => setFormNameAr(e.target.value)}
                    placeholder="سلطة فاخرة"
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
                  <input
                    required
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Delicious Salad"
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'الوصف (عربي)' : 'Desc (Arabic)'}</label>
                  <input
                    type="text"
                    value={formDescAr}
                    onChange={(e) => setFormDescAr(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'الوصف (إنجليزي)' : 'Desc (English)'}</label>
                  <input
                    type="text"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'القسم (Category)' : 'Category Selection'}</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>{language === 'ar' ? c.nameAr : c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'السعر (ريال)' : 'Price (SAR)'}</label>
                  <input
                    required
                    type="number"
                    step="0.5"
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'السعرات الحرارية' : 'Calories (kcal)'}</label>
                  <input
                    type="number"
                    value={formCalories}
                    onChange={(e) => setFormCalories(Number(e.target.value))}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">{language === 'ar' ? 'رابط الصورة (URL)' : 'Unsplash / Image URL'}</label>
                  <input
                    type="text"
                    value={formImage}
                    onChange={(e) => setFormImage(e.target.value)}
                    placeholder="https://..."
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 md:col-span-3 pt-2">
                  <input
                    type="checkbox"
                    id="popular-chkbx"
                    checked={formPopular}
                    onChange={(e) => setFormPopular(e.target.checked)}
                    className="w-4 h-4 accent-amber-600"
                  />
                  <label htmlFor="popular-chkbx" className="text-xs font-bold text-slate-600">{language === 'ar' ? 'تمييز كأكثر طلباً 🔥' : 'Highlight as Popular 🔥'}</label>
                </div>

                <div className="flex items-center gap-2 md:col-span-3 pt-1">
                  <input
                    type="checkbox"
                    id="dineinonly-chkbx"
                    checked={formDineInOnly}
                    onChange={(e) => setFormDineInOnly(e.target.checked)}
                    className="w-4 h-4 accent-amber-600"
                  />
                  <label htmlFor="dineinonly-chkbx" className="text-xs font-bold text-slate-600">
                    {language === 'ar' ? 'للطلب محلي فقط (داخل الصالة يمنع سفري) 🍽️' : 'Dine-In Only (Restricted from Takeaway) 🍽️'}
                  </label>
                </div>

                {validationMsg && <p className="text-xs text-red-500 font-semibold md:col-span-3">{validationMsg}</p>}

                <div className="md:col-span-3 text-end pt-2">
                  <button
                    id="admin-add-new-item-submit"
                    type="submit"
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2 px-6 rounded-xl shadow-xs transition"
                  >
                    {isEditMode ? (language === 'ar' ? 'حفظ التعديلات' : 'Save Product Changes') : (language === 'ar' ? 'إدخال وجفظ الصنف' : 'Save New Product')}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Catalog items list table */}
        {menuItems.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            {t('emptyMenuAdmin')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-slate-600 text-start">
              <thead className="bg-slate-50 uppercase font-mono border-b border-slate-100 text-[10px] tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-start">{language === 'ar' ? 'الصنف' : 'Product'}</th>
                  <th className="px-4 py-3 text-start">{language === 'ar' ? 'القسم' : 'Category'}</th>
                  <th className="px-4 py-3 text-start">{language === 'ar' ? 'السعر الحالي' : 'Price'}</th>
                  <th className="px-4 py-3 text-center">{language === 'ar' ? 'الحالة بالمخزن' : 'Stock Availability'}</th>
                  <th className="px-4 py-3 text-center">{language === 'ar' ? 'إدارة' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 select-all">
                {menuItems.map((item) => {
                  const correlatedCat = CATEGORIES.find(c => c.id === item.category);
                  const isCheckedVal = item.isAvailable;

                  return (
                    <tr id={`admin-menu-${item.id}`} key={item.id} className={isCheckedVal ? 'hover:bg-slate-50/50' : 'bg-slate-50/20 grayscaleopacity-70'}>
                      <td className="px-4 py-3 flex items-center gap-2.5">
                        <img
                          src={item.image}
                          alt={item.nameAr}
                          className="w-10 h-10 rounded-xl object-cover shrink-0 border border-slate-100"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <div className="font-bold text-slate-800 text-xs md:text-sm flex items-center gap-1.5 flex-wrap">
                            <span>{language === 'ar' ? item.nameAr : item.name}</span>
                            {item.dineInOnly && (
                              <span className="bg-amber-100/75 text-amber-800 text-[9px] font-black px-1.5 py-0.5 rounded-sm">
                                {language === 'ar' ? 'محلي فقط 🍽️' : 'Dine-In Only 🍽️'}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[9px] text-slate-400">#{item.id}</span>
                        </div>
                      </td>

                      {/* Cat badge */}
                      <td className="px-4 py-3 text-start">
                        <span className="bg-slate-100 text-slate-700 font-bold px-2 py-1 rounded-md">
                          {correlatedCat ? (language === 'ar' ? correlatedCat.nameAr : correlatedCat.name) : item.category}
                        </span>
                      </td>

                      {/* Price input edit */}
                      <td className="px-4 py-3 text-start">
                        <div className="flex items-center gap-1 font-extrabold text-slate-800 text-sm">
                          <span>{item.price.toFixed(1)}</span>
                          <span className="text-[10px] font-normal text-slate-400">{t('sar')}</span>
                        </div>
                      </td>

                      {/* Availability status toggle switcher */}
                      <td className="px-4 py-3 text-center">
                        <button
                          id={`toggle-stock-btn-${item.id}`}
                          onClick={() => handleToggleAvailable(item.id, isCheckedVal)}
                          className={`w-20 py-1.5 rounded-full font-bold text-[10px] m-auto transition-all cursor-pointer flex items-center justify-center gap-1 ${
                            isCheckedVal 
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          <Power className="w-3 h-3" />
                          <span>{isCheckedVal ? t('isAvailable') : t('outOfStock')}</span>
                        </button>
                      </td>

                      {/* Actions Column */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center items-center">
                          <button
                            id={`edit-item-btn-${item.id}`}
                            onClick={() => handleEditClick(item)}
                            className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer"
                            title={language === 'ar' ? 'تعديل الصنف' : 'Edit Product'}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          
                          <button
                            id={`delete-stock-btn-${item.id}`}
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                            title={language === 'ar' ? 'حذف الصنف' : 'Delete Product'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Custom Confirmation Dialog Modal */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in select-none">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-100 text-start overflow-hidden relative transform scale-100 transition-all duration-300 animate-scale-up">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-2xl shrink-0 ${confirmDialog.isDanger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-stone-900 text-base md:text-lg">
                  {language === 'ar' ? confirmDialog.titleAr : confirmDialog.titleEn}
                </h3>
                <p className="text-xs md:text-sm text-stone-500 leading-relaxed font-medium">
                  {language === 'ar' ? confirmDialog.messageAr : confirmDialog.messageEn}
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex flex-row-reverse gap-3 justify-start">
              <button
                onClick={confirmDialog.onConfirm}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer transition-all ${
                  confirmDialog.isDanger 
                    ? 'bg-red-600 hover:bg-red-700' 
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {language === 'ar' ? confirmDialog.actionLabelAr : confirmDialog.actionLabelEn}
              </button>
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-stone-500 bg-stone-100 hover:bg-stone-200 transition-all cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Notification Alert */}
      {notification && (
        <div className="fixed bottom-6 right-6 md:right-10 z-[10000] max-w-sm w-full p-4 rounded-2xl shadow-xl border flex items-center gap-3 animate-slide-in bg-white text-stone-800 border-stone-100 select-none">
          <div className={`p-2 rounded-xl ${
            notification.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
            notification.type === 'error' ? 'bg-red-50 text-red-600' :
            notification.type === 'warning' ? 'bg-amber-50 text-amber-600' :
            'bg-sky-50 text-sky-600'
          }`}>
            {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
            {notification.type === 'error' && <XCircle className="w-5 h-5" />}
            {notification.type === 'warning' && <AlertCircle className="w-5 h-5" />}
            {notification.type === 'info' && <Info className="w-5 h-5" />}
          </div>
          <div className="flex-1 text-xs md:text-sm font-semibold">
            {notification.message}
          </div>
          <button 
            onClick={() => setNotification(null)}
            className="text-stone-400 hover:text-stone-600 transition-colors p-1 rounded-lg hover:bg-stone-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          DYNAMIC PRINT STYLES & ZERO-MARGIN MEDIA OVERRIDES
          ───────────────────────────────────────────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: auto !important;
            margin: 0mm !important;
          }
          /* Completely hide the main app root containing lists, panels, buttons to avoid blank spacing/margins */
          #root {
            display: none !important;
            height: 0px !important;
            overflow: hidden !important;
            visibility: hidden !important;
          }
          html, body {
            width: ${setReceiptWidth === '100%' ? '100%' : setReceiptWidth} !important;
            min-width: ${setReceiptWidth === '100%' ? '100%' : setReceiptWidth} !important;
            max-width: ${setReceiptWidth === '100%' ? '100%' : setReceiptWidth} !important;
            margin: 0px auto !important;
            padding: 0px !important;
            background: white !important;
            overflow: visible !important;
            height: auto !important;
          }
          /* Display the body-level portal printable receipt flawlessly with standard relative height expansion */
          #recept-print-area {
            display: block !important;
            visibility: visible !important;
            position: relative !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0px auto !important;
            padding: 4mm 5mm 12mm 5mm !important;
            box-sizing: border-box !important;
            background: white !important;
            color: black !important;
          }
          #recept-print-area * {
            visibility: visible !important;
            color: black !important;
            background: transparent !important;
            font-family: 'Inter', system-ui, sans-serif !important;
            font-size: ${setReceiptFontSize}px !important;
            line-height: 1.4 !important;
          }
          #recept-print-area h3, #recept-print-area .print-title {
            font-size: ${setReceiptFontSize + 4}px !important;
            font-weight: 900 !important;
          }
          #recept-print-area .print-semibold {
            font-weight: 750 !important;
          }
          #recept-print-area .print-logo-box {
            width: ${setReceiptLogoSize}px !important;
            height: ${setReceiptLogoSize}px !important;
          }
          #recept-print-area .kitchen-slip-item * {
            font-size: ${setKitchenSlipFontSize}px !important;
            font-weight: 850 !important;
          }
          #recept-print-area .kitchen-slip-header {
            font-size: ${setKitchenSlipFontSize + 4}px !important;
            font-weight: 900 !important;
          }
          #recept-print-area .invoice-container {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            display: block !important;
          }
          #recept-print-area .kitchen-slip-item {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          #recept-print-area .page-break {
            page-break-before: always !important;
            break-before: page !important;
            border-top: 2px dashed #000 !important;
            margin-top: 10px !important;
            padding-top: 15px !important;
          }
        }
      `}</style>

      {/* Hidden printable element specifically loaded into DOM upon print trigger */}
      {printingOrder && (() => {
        const isTaxActive = setTaxEnabled;
        const appliedTaxPercent = setTaxPercent;
        const appliedTaxMethod = setTaxMethod;

        const orderSubtotal = printingOrder.subtotal;
        const orderDiscount = printingOrder.promoDiscount || 0;
        const taxableSubtotal = orderSubtotal - orderDiscount;

        let printTax = 0;
        let printTotal = taxableSubtotal;

        if (isTaxActive) {
          if (appliedTaxMethod === 'inclusive') {
            printTotal = taxableSubtotal;
            printTax = printTotal - (printTotal / (1 + (appliedTaxPercent / 100)));
          } else {
            printTax = taxableSubtotal * (appliedTaxPercent / 100);
            printTotal = taxableSubtotal + printTax;
          }
        }

        return createPortal(
          <div id="recept-print-area" className="hidden print:block text-black bg-white select-none">
            
            {/* Section 1: Customer Invoice */}
            {setShowCustomerReceiptOnPrint && (currentPrintSubMode === 'all' || currentPrintSubMode === 'customer') && (
              <div className="invoice-container space-y-4">
                
                {/* Logo / Branding */}
                <div className="flex flex-col items-center text-center">
                  {setLogoUrl ? (
                    <img 
                      src={setLogoUrl} 
                      alt="Logo" 
                      className="print-logo-box rounded-full object-cover border border-black/15 shadow-xs mb-2" 
                    />
                  ) : (
                    <div className="print-logo-box rounded-full bg-black/5 flex items-center justify-center font-black text-sm uppercase mb-2">
                      {language === 'ar' ? setRestaurantNameAr.charAt(0) : setRestaurantNameEn.charAt(0)}
                    </div>
                  )}
                  
                  <h3 className="print-title leading-tight">
                    {language === 'ar' ? setRestaurantNameAr : setRestaurantNameEn}
                  </h3>
                  <p className="text-[10px] text-black/60 leading-tight">
                    {language === 'ar' ? setTaglineAr : setTaglineEn}
                  </p>
                  <div className="mt-1 border border-black px-2 py-0.5 text-[9px] uppercase tracking-wider font-extrabold rounded-md">
                    {language === 'ar' ? 'فاتورة ضريبية مبسطة' : 'Simplified Tax Invoice'}
                  </div>
                </div>

                {/* Meta information */}
                <div className="grid grid-cols-2 gap-y-1 text-[10px] font-mono border-b border-black pb-2 pt-1 border-dotted">
                  <div>
                    <span className="text-black/60 text-[9px] block uppercase">{language === 'ar' ? 'رقم الفاتورة' : 'Invoice ID'}</span>
                    <span className="font-bold">{printingOrder.id}</span>
                  </div>
                  <div className="text-end">
                    <span className="text-black/60 text-[9px] block uppercase">{language === 'ar' ? 'تاريخ الإصدار' : 'Issue Date'}</span>
                    <span className="font-bold font-mono">
                      {new Date(printingOrder.createdAt).toISOString().replace('T', ' ').substring(0, 19)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-black/60 text-[9px] block uppercase">{language === 'ar' ? 'نوع الطلب' : 'Order Type'}</span>
                    <span className="font-bold">
                      {printingOrder.tableOrDelivery === 'table' 
                        ? (language === 'ar' ? 'محلي' : 'Dine-In')
                        : (language === 'ar' ? 'سفري' : 'Takeaway')}
                    </span>
                  </div>
                  <div className="mt-1 text-end">
                    <span className="text-black/60 text-[9px] block uppercase">{language === 'ar' ? 'العميل' : 'Customer'}</span>
                    <span className="font-bold">{printingOrder.customerName}</span>
                  </div>
                  {printingOrder.notes && (
                    <div className="col-span-2 mt-1.5 pt-1.5 border-t border-dotted border-black/20 text-start text-[10px]">
                      <span className="font-bold block text-black/70">📝 {language === 'ar' ? 'ملاحظات العميل:' : 'Customer Notes:'}</span>
                      <span className="italic text-black/90 font-medium">{printingOrder.notes}</span>
                    </div>
                  )}
                  {isTaxActive && setVatNumber && (
                    <div className="col-span-2 mt-1 pt-1 border-t border-dotted border-black/20">
                      <span className="text-black/60 text-[9px] mr-1">{language === 'ar' ? 'الرقم الضريبي للبائع:' : 'Seller VAT Number:'}</span>
                      <span className="font-bold font-mono">{setVatNumber}</span>
                    </div>
                  )}
                </div>

                {/* Items description table */}
                <div className="space-y-2.5 pt-1 font-sans">
                  <div className="flex justify-between items-center text-[10px] font-bold border-b border-black pb-1.5 border-dashed">
                    <span className="w-1/2">{language === 'ar' ? 'البيان' : 'Item Description'}</span>
                    <span className="w-1/6 text-center">{language === 'ar' ? 'الكمية' : 'Qty'}</span>
                    <span className="w-1/3 text-end">{language === 'ar' ? 'السعر' : 'Amount'}</span>
                  </div>

                  <div className="space-y-2">
                    {printingOrder.items.map((item) => (
                      <div key={item.id} className="flex justify-between items-start text-[10px] font-semibold">
                        <span className="w-1/2 leading-snug">{language === 'ar' ? item.nameAr : item.name}</span>
                        <span className="w-1/6 text-center font-mono">{item.quantity}</span>
                        <span className="w-1/3 text-end font-mono">{(item.price * item.quantity).toFixed(2)} {t('sar')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Computations Math receipt block */}
                <div className="border-t border-dashed border-black pt-3.5 space-y-1.5 font-mono text-[10px]">
                  <div className="flex justify-between">
                    <span>
                      {isTaxActive 
                        ? (language === 'ar' ? 'المجموع الخاضع للضريبة' : 'Subtotal (Excl. VAT)')
                        : (language === 'ar' ? 'المجموع الفرعي' : 'Subtotal')}
                    </span>
                    <span>
                      {isTaxActive
                        ? (printTotal - printTax).toFixed(2)
                        : taxableSubtotal.toFixed(2)
                      } {t('sar')}
                    </span>
                  </div>

                  {printingOrder.promoDiscount > 0 && (
                    <div className="flex justify-between text-black font-extrabold">
                      <span>{language === 'ar' ? 'خصم العرض المطبق' : 'Applied Discount'}</span>
                      <span>-{printingOrder.promoDiscount.toFixed(2)} {t('sar')}</span>
                    </div>
                  )}

                  {isTaxActive ? (
                    <div className="flex justify-between">
                      <span>
                        {language === 'ar' 
                          ? `ضريبة القيمة المضافة (${appliedTaxPercent}%)` 
                          : `VAT (${appliedTaxPercent}%)`}
                      </span>
                      <span>{printTax.toFixed(2)} {t('sar')}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-black/50 italic text-[9px] font-sans">
                      <span>{language === 'ar' ? 'حالة الضريبة:' : 'VAT Status:'}</span>
                      <span>{language === 'ar' ? 'معفى من الضريبة (موقفة)' : 'Tax Exempt / Disabled'}</span>
                    </div>
                  )}

                  <div className="h-px bg-black my-1 border-dotted" />
                  
                  <div className="flex justify-between font-extrabold text-[12px] pt-1 border-t border-black border-dashed">
                    <span>{language === 'ar' ? 'المجموع شامل الضريبة' : 'GRAND TOTAL'}</span>
                    <span className="font-extrabold">{printTotal.toFixed(2)} {t('sar')}</span>
                  </div>
                  
                  <div className="text-[8px] text-black/75 mt-1 border-t border-black/10 pt-1.5 font-sans">
                    <span>💳 {printingOrder.paymentMethod === 'cod' ? (language === 'ar' ? 'دفع عند الاستلام' : 'Cash on Delivery') : ' Pay / Mada (Online Card)'}</span>
                  </div>
                </div>

                {/* Compliance ZATCA QR Code */}
                {isTaxActive && (
                  <div className="flex flex-col items-center justify-center pt-3 text-center space-y-2">
                    <div className="bg-white p-1 rounded-lg border border-black/20">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(
                          generateZatcaQr(
                            language === 'ar' ? setRestaurantNameAr : setRestaurantNameEn,
                            setVatNumber || '310123456700003',
                            new Date(printingOrder.createdAt).toISOString(),
                            printTotal.toFixed(2),
                            printTax.toFixed(2)
                          )
                        )}`}
                        alt="ZATCA QR Compliance"
                        referrerPolicy="no-referrer"
                        className="w-28 h-28 mx-auto"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[9px] font-black uppercase text-center tracking-wider">
                        {language === 'ar' ? 'الهيئة العامة للزكاة والضريبة والجمارك' : 'ZATCA E-INVOICE STANDARD'}
                      </div>
                      <p className="text-[8px] text-neutral-600 max-w-xs leading-relaxed text-center leading-xs">
                        {language === 'ar' 
                          ? (setInvoiceFooterAr || 'شكراً لزيارتكم! بالهناء والشفاء')
                          : (setInvoiceFooterEn || 'Thank you so much! Enjoy your meal')}
                      </p>
                    </div>
                  </div>
                )}

                {!isTaxActive && (
                  <div className="pt-2 text-center">
                    <p className="text-[9px] text-neutral-600 max-w-xs leading-relaxed text-center">
                      {language === 'ar' 
                        ? (setInvoiceFooterAr || 'شكراً لزيارتكم! بالهناء والشفاء')
                        : (setInvoiceFooterEn || 'Thank you so much! Enjoy your meal')}
                    </p>
                  </div>
                )}

              </div>
            )}

            {/* Section 2: Kitchen Preparation slip (with page break if both printed together) */}
            {setShowKitchenSlipOnPrint && (currentPrintSubMode === 'all' || currentPrintSubMode === 'kitchen') && (
              <div className={`space-y-3 ${setShowCustomerReceiptOnPrint && currentPrintSubMode === 'all' ? 'page-break' : ''} kitchen-slip-item`}>
                
                <div className="text-center pb-2 border-b border-double border-black">
                  <span className="kitchen-slip-header uppercase tracking-wider block">
                    🍴 {language === 'ar' ? setKitchenSlipHeaderAr : setKitchenSlipHeaderEn}
                  </span>
                  
                  <div className="text-[14px] font-black text-black font-mono mt-1 pt-1 border-t border-black border-dashed leading-tight">
                    {language === 'ar' ? 'رقم الطلب:' : 'ORDER ID:'} #{printingOrder.id}
                  </div>
                  <div className="font-extrabold text-[12px] mt-0.5">
                    {printingOrder.tableOrDelivery === 'table' 
                      ? (language === 'ar' ? 'طلب محلي' : 'Dine-In Order')
                      : (language === 'ar' ? 'طلب سفري' : 'Takeaway Order')}
                  </div>
                </div>

                <div className="text-[12px] font-mono border-b border-black/20 pb-1.5 mb-1.5">
                  <div className="bg-black text-white p-2 rounded-md text-center font-black text-[16px] tracking-wide mb-2">
                    👤 {printingOrder.customerName}
                  </div>
                  <div>{language === 'ar' ? 'العميل:' : 'Customer:'} <strong className="text-[14px]">{printingOrder.customerName}</strong></div>
                  <div>{language === 'ar' ? 'الوقت:' : 'Time:'} {new Date(printingOrder.createdAt).toISOString().replace('T', ' ').substring(11, 16)}</div>
                  {printingOrder.notes && (
                    <div className="mt-1 pb-1 pt-1 border-t border-black/10 border-dotted text-[11px] font-extrabold text-start">
                      📝 {language === 'ar' ? 'الملاحظات:' : 'NOTES:'} <span className="underline">{printingOrder.notes}</span>
                    </div>
                  )}
                </div>

                {/* Items List for chefs (highly stylized large text) */}
                <div className="space-y-2 py-1 select-all">
                  {printingOrder.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-baseline py-1 border-b border-black/10 border-dotted last:border-none">
                      <span className="font-extrabold leading-snug">
                        {item.quantity} × {language === 'ar' ? item.nameAr : item.name}
                      </span>
                      <span className="text-[11px] font-bold">🛒</span>
                    </div>
                  ))}
                </div>

                <div className="text-center text-[9px] text-neutral-700 border-t border-black border-dashed pt-2.5">
                  {language === 'ar' ? 'طابعة الكابتن / كارت تجهيز المطبخ' : 'Kitchen Chef Preparation Docket'}
                </div>

              </div>
            )}

          </div>,
          document.body
        );
      })()}

      {/* Document/Image Preview Modal */}
      {selectedDocPreview && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in">
          <div className="bg-white rounded-3xl p-4 max-w-2xl w-full relative shadow-2xl border border-slate-100 flex flex-col items-center">
            <button
              onClick={() => setSelectedDocPreview(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-full flex items-center justify-center font-bold text-lg cursor-pointer transition-colors z-10"
              title={language === 'ar' ? 'إغلاق' : 'Close'}
            >
              ✕
            </button>
            <div className="w-full text-center mb-2 pb-2 border-b border-slate-100">
              <h4 className="font-extrabold text-sm text-slate-800">
                {language === 'ar' ? 'معاينة صورة الاستمارة 📄' : 'Car Registration Document Preview 📄'}
              </h4>
            </div>
            <div className="overflow-auto max-h-[80vh] w-full flex items-center justify-center p-2">
              <img
                src={selectedDocPreview}
                alt="Document preview"
                className="max-w-full max-h-[70vh] object-contain rounded-2xl border border-slate-150"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
