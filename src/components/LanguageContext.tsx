import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'ar' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRtl: boolean;
}

const TR_DICT: Record<string, Record<Language, string>> = {
  appName: { ar: 'رحلة شواء', en: 'Grilling Journey' },
  appSub: { ar: 'مذاق المشويات الفاخرة على أصولها', en: 'The Authentic Taste of Premium Grills' },
  menu: { ar: 'المنيو التفاعلي', en: 'Interactive Menu' },
  cart: { ar: 'سلة المشتريات', en: 'Shopping Cart' },
  admin: { ar: 'لوحة المشرف', en: 'Admin Dashboard' },
  tracker: { ar: 'تتبع طلبك', en: 'Track Order' },
  popular: { ar: 'الأكثر طلباً 🔥', en: 'Popular 🔥' },
  calories: { ar: 'سعر حراري', en: 'kcal' },
  sar: { ar: 'ريال', en: 'SAR' },
  addToCart: { ar: 'إضافة للسلة', en: 'Add to Cart' },
  emptyCart: { ar: 'سلتك فارغة حالياً', en: 'Your cart is empty' },
  subtotal: { ar: 'المجموع الفرعي', en: 'Subtotal' },
  tax: { ar: 'الضريبة (15%)', en: 'Tax (15%)' },
  total: { ar: 'الإجمالي المقدر', en: 'Estimated Total' },
  customerDetails: { ar: 'بيانات العميل', en: 'Customer Details' },
  fullName: { ar: 'الاسم الكامل', en: 'Full Name' },
  phone: { ar: 'رقم الجوال', en: 'Mobile Number' },
  orderType: { ar: 'نوع الطلب', en: 'Order Type' },
  table: { ar: 'جلسة داخلية (طاولة)', en: 'Dine-In (Table)' },
  delivery: { ar: 'توصيل خارجي', en: 'Delivery' },
  tableNum: { ar: 'رقم الطاولة', en: 'Table Number' },
  deliveryAddress: { ar: 'عنوان التوصيل بالتفصيل', en: 'Detailed Delivery Address' },
  paymentMethod: { ar: 'طريقة الدفع', en: 'Payment Method' },
  cod: { ar: 'الدفع عند الاستلام', en: 'Cash on Delivery' },
  applepay: { ar: 'Apple Pay (تجريبي)', en: 'Apple Pay (Demo)' },
  mada: { ar: 'بطاقة مدى (تجريبي)', en: 'Mada Card (Demo)' },
  placeOrder: { ar: 'إرسال الطلب عبر الواتساب وتأكيده', en: 'Send order via WhatsApp & Confirm' },
  orderStatus: { ar: 'حالة الطلب', en: 'Order Status' },
  pending: { ar: 'قيد الانتظار', en: 'Pending' },
  received: { ar: 'تم استلام الطلب', en: 'Order Received' },
  searching_driver: { ar: 'جاري البحث عن مندوب', en: 'Searching for Driver' },
  preparing: { ar: 'جاري التحضير والطهي', en: 'Preparing' },
  ready: { ar: 'الطلب جاهز', en: 'Order Ready' },
  driver_picked_up: { ar: 'تم استلام المندوب', en: 'Picked Up by Driver' },
  on_the_way: { ar: 'جاري التوصيل', en: 'On the Way' },
  delivered: { ar: 'تم التوصيل بالعافية', en: 'Delivered' },
  cancelled: { ar: 'ملغي', en: 'Cancelled' },
  searchOrderPlaceholder: { ar: 'أدخل رقم الطلب للتتبع...', en: 'Enter order ID to track...' },
  trackBtn: { ar: 'تتبع الطلب', en: 'Track' },
  orderNotFound: { ar: 'عذراً، لم نجد طلباً بهذا الرقم.', en: 'Sorry, no order found with this ID.' },
  adminWelcome: { ar: 'لوحة التحكم وإدارة الطلبات المباشرة', en: 'Dashboard & Realtime Orders Control' },
  liveOrders: { ar: 'الطلبات الحية والنشطة', en: 'Live & Active Orders' },
  allStatus: { ar: 'الكل', en: 'All' },
  totalSales: { ar: 'إجمالي المبيعات', en: 'Total Sales' },
  ordersCount: { ar: 'عدد الطلبات', en: 'Orders Count' },
  popularItemsChart: { ar: 'الأصناف الأكثر طلباً', en: 'Most Requested Items' },
  controlMenu: { ar: 'التحكم بالمنيو والأصناف', en: 'Menu & Availability Control' },
  isAvailable: { ar: 'متوفر', en: 'Available' },
  outOfStock: { ar: 'مباع / غير متوفر', en: 'Out of Stock' },
  save: { ar: 'حفظ', en: 'Save' },
  editPrice: { ar: 'تعديل السعر', en: 'Edit Price' },
  backToMenu: { ar: 'العودة للمنيو', en: 'Back to Menu' },
  demoAdminLogin: { ar: 'تسجيل دخول الإدارة (أو المحاكاة)', en: 'Admin Access (or Simulator)' },
  loginWithGoogle: { ar: 'الدخول بحساب Google (المشرف الحقيقي)', en: 'Sign in with Google (Real Admin)' },
  simulateMode: { ar: 'وضع محاكاة المشرف (للتجربة السريعة)', en: 'Admin Simulation Mode' },
  unauthorizedAdmin: { ar: 'عذراً، هذا الحساب ليس له صلاحيات الإشراف، تم تحويلك لوضع المحاكاة للتجربة.', en: 'Notice: This account is not listed as active admin config. Switched you to simulation mode for testing.' },
  logout: { ar: 'تسجيل الخروج', en: 'Logout' },
  noOrdersYet: { ar: 'لا يوجد طلبات حالياً في النظام.', en: 'No orders logged yet.' },
  orderIdText: { ar: 'معرّف الطلب', en: 'Order ID' },
  orderTimeText: { ar: 'وقت الطلب', en: 'Order Time' },
  actions: { ar: 'الإجراءات', en: 'Actions' },
  copied: { ar: 'تم النسخ!', en: 'Copied!' },
  whatsAppMsg: { ar: 'رسالة واتساب جاهزة', en: 'Formatted WhatsApp Text' },
  testNotice: { ar: 'تنبيه: هذا دفع تجريبي، لن يتم خصم مبالغ حقيقية.', en: 'Note: This is a demo transaction, no real money will be charged.' },
  emptyMenuAdmin: { ar: 'جاري تحميل المنيو أو تهيئة المنتجات في قاعدة البيانات الحية...', en: 'Loading menu from live database...' },
  seedPrompt: { ar: 'تهيئة وتعميم المنيو الافتراضي في Firestore', en: 'Seed Firestore Menu Database' },
  seedSuccess: { ar: 'تم رفع المنيو بالكامل بنجاح إلى قاعدة البيانات!', en: 'Menu items seeded successfully to Firestore!' }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app_lang');
    return (saved === 'en' || saved === 'ar') ? saved : 'ar';
  });

  useEffect(() => {
    localStorage.setItem('app_lang', language);
  }, [language]);

  const t = (key: string): string => {
    if (TR_DICT[key]) {
      return TR_DICT[key][language];
    }
    return key;
  };

  const isRtl = language === 'ar';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRtl }}>
      <div dir={isRtl ? 'rtl' : 'ltr'} className="min-h-screen bg-slate-50 text-slate-800 transition-all duration-300">
        {children}
      </div>
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within LanguageProvider');
  return context;
};
