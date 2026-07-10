import React, { useState, useEffect } from 'react';
import { useLanguage } from './LanguageContext';
import { playOrderChime } from './AudioAlert';
import { 
  Bell, 
  Smartphone, 
  Sparkles, 
  CheckCircle2, 
  Volume2, 
  PlusSquare, 
  Share, 
  X, 
  AlertCircle, 
  UtensilsCrossed
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomePortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessSettings?: import('../types').BusinessSettings;
}

export const WelcomePortalModal: React.FC<WelcomePortalModalProps> = ({ isOpen, onClose, businessSettings }) => {
  const { language, t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAlreadyInstalled, setIsAlreadyInstalled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [testChimePlayed, setTestChimePlayed] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);
  const [isIOS, setIsIOS] = useState(false);
  const [isSafari, setIsSafari] = useState(false);

  useEffect(() => {
    // Detect iOS and Safari
    if (typeof window !== 'undefined') {
      const ua = window.navigator.userAgent;
      const iosDevice = /iPhone|iPad|iPod/i.test(ua);
      const safariBrowser = /^((?!chrome|android).)*safari/i.test(ua);
      setIsIOS(iosDevice);
      setIsSafari(safariBrowser);

      // Check if already in standalone display mode (App Pinned)
      const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                         (window.navigator as any).standalone === true;
      setIsAlreadyInstalled(standalone);

      // Get initial notification permission state
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    }

    // Listen to BeforeInstallPrompt for standard Android/Chrome PWA
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('Applet installation prompt is available and deferred.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Request notifications permission and trigger test chime sound on success
  const handleEnableNotifications = async () => {
    if (!('Notification' in window)) {
      alert(language === 'ar' 
        ? '⚠️ متصفحك الحالي لا يدعم ميزة الإشعارات لتلقي التحديثات.' 
        : '⚠️ This browser does not support the Notifications API.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      // Test audio feedback sound
      playOrderChime();
      setTestChimePlayed(true);

      if (permission === 'granted') {
        new Notification(language === 'ar' ? (businessSettings?.restaurantNameAr || 'مطعم رحلة شواء 🍖') : (businessSettings?.restaurantNameEn || 'Rehla BBQ Restaurant 🍖'), {
          body: language === 'ar' 
            ? '🚀 تم تفعيل صوت التنبيهات والإشعارات الفورية بنجاح!' 
            : '🚀 Custom notification sounds and alerts activated successfully!',
          icon: businessSettings?.logoUrl || '/pwa-icon.jpg',
          tag: 'welcome-notification'
        });
      }
    } catch (err) {
      console.error('Error requesting notifications permission:', err);
    }
  };

  // Test sound separately if permission is already granted
  const handleTestSoundOnly = () => {
    playOrderChime();
    setTestChimePlayed(true);
  };

  // Trigger standard Android/Chrome prompt
  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`Add To Home Screen outcome: ${outcome}`);
      if (outcome === 'accepted') {
        setIsAlreadyInstalled(true);
      }
      setDeferredPrompt(null);
    } else {
      // General fallbacks if standard prompt is missing
      alert(language === 'ar'
        ? '💡 للتثبيت اليدوي، يرجى النقر على زر الخيارات بمتصفحك ثم اختيار "إضافة إلى الشاشة الرئيسية".'
        : '💡 For manual pin, tap your browser settings, then click "Add to Home Screen".');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-md animate-fade-in text-start">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-lg bg-white border border-black/5 rounded-[2.5rem] shadow-2xl relative text-dark overflow-hidden max-h-[92vh] flex flex-col"
        >
          {/* Header branding background block with elegant deep dark & gold BBQ gradient */}
          <div className="bg-neutral-950 p-6 md:p-7 text-white relative">
            <div className="absolute top-0 right-0 left-0 bottom-0 bg-radial-gradient from-yellow/10 to-transparent pointer-events-none" />
            <div className="absolute -bottom-12 -start-12 w-32 h-32 bg-yellow/5 rounded-full blur-xl" />
            
            <button 
              onClick={onClose}
              className="absolute top-4 end-4 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full cursor-pointer transition-all border border-white/5 z-10"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 relative z-10">
              <div className="w-14 h-14 bg-neutral-900 rounded-2xl flex items-center justify-center p-1 shadow-md border border-yellow/20 overflow-hidden shrink-0">
                {businessSettings?.logoUrl ? (
                  <img src={businessSettings.logoUrl} alt="Rehla Grill Icon" className="w-full h-full object-cover rounded-xl" />
                ) : (
                  <div className="w-full h-full bg-yellow rounded-xl flex items-center justify-center font-bold text-black text-lg">🍖</div>
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 bg-yellow/15 text-yellow border border-yellow/20 text-[9px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full w-max font-mono">
                  <Sparkles className="w-3 h-3 text-yellow animate-pulse" />
                  <span>{language === 'ar' ? 'رحلة شواء الأصيلة' : 'Rehla BBQ Smart App'}</span>
                </div>
                <h3 className="text-xl font-serif font-black tracking-wide leading-tight mt-1 text-white">
                  {language === 'ar' ? 'مرحباً بك في تطبيق رحلة شواء' : 'Welcome to Rehla BBQ'}
                </h3>
              </div>
            </div>
          </div>

          {/* Dialog Tabs Navigation with Brand Colors */}
          <div className="grid grid-cols-2 bg-neutral-50 border-b border-black/5 font-bold text-xs">
            <button
              onClick={() => setActiveStep(1)}
              className={`py-4 border-b-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeStep === 1 
                  ? 'border-yellow text-yellow-600 font-black bg-white shadow-xs' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Bell className="w-4 h-4 shrink-0" />
              <span>{language === 'ar' ? '١. تفعيل التنبيهات والأصوات' : '1. Sounds & Alerts'}</span>
            </button>
            <button
              onClick={() => setActiveStep(2)}
              className={`py-4 border-b-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeStep === 2 
                  ? 'border-yellow text-yellow-600 font-black bg-white shadow-xs' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>{language === 'ar' ? '٢. تثبيت المنيو على الشاشة' : '2. Pin to Screen'}</span>
            </button>
          </div>

          {/* Modal Content Scroll Area */}
          <div className="p-6 md:p-7 overflow-y-auto space-y-6 flex-1 text-slate-700 bg-[#FCFCFB]">
            
            {activeStep === 1 && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6 text-start"
              >
                {/* Brand Banner Card */}
                <div className="bg-amber-500/10 border border-amber-500/15 p-4 rounded-3xl flex items-start gap-3.5">
                  <div className="bg-yellow p-2.5 text-black rounded-2xl shrink-0 shadow-xs">
                    <UtensilsCrossed className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-neutral-900">
                      {language === 'ar' ? 'تابع استواء لحومك الطازجة بكل ثقة! 🍖' : 'Follow your premium barbecue live!'}
                    </h4>
                    <p className="text-[11px] md:text-xs text-neutral-600 leading-relaxed font-medium">
                      {language === 'ar' 
                        ? 'لكي لا يفوتك أي تحديث بخصوص طلبك، نرجو منك تفعيل الإشعارات وتنبيهات الصوت الفورية لنتمكن من إشعارك فوراً بنغمة مميزة عند بدء تحضير طلبك، أو عندما ينضج على جمر الغضا ويكون جاهزاً للاستلام!'
                        : 'To stay fully updated with your order state, please authorize alerts. We will chime your browser when your order is placed, cooking, or perfectly ready for dine-in/pickup.'}
                    </p>
                  </div>
                </div>

                {/* Notification Status Block */}
                <div className="bg-white border border-black/5 p-5 rounded-3xl space-y-5 shadow-xs">
                  <div className="flex justify-between items-center bg-neutral-50 p-3.5 rounded-2xl border border-black/5">
                    <span className="text-xs font-bold text-neutral-500">{language === 'ar' ? 'حالة التفعيل الحالية بمتصفحك:' : 'Browser permission state:'}</span>
                    <span className={`text-[10px] md:text-xs font-black uppercase px-3 py-1 rounded-full ${
                      notificationPermission === 'granted' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-500/10'
                        : notificationPermission === 'denied' 
                        ? 'bg-rose-50 text-rose-600 border border-rose-500/10'
                        : 'bg-amber-50 text-amber-700 border border-amber-500/10'
                    }`}>
                      {notificationPermission === 'granted' && (language === 'ar' ? 'مفعّلة ونشطة ✅' : 'Active & Connected ✅')}
                      {notificationPermission === 'denied' && (language === 'ar' ? 'محجوبة 🚫' : 'Blocked 🚫')}
                      {notificationPermission === 'default' && (language === 'ar' ? 'في انتظار تفعيلك ⏳' : 'Not Activated Yet ⏳')}
                    </span>
                  </div>

                  {notificationPermission !== 'granted' ? (
                    <div className="space-y-3">
                      {/* Highly visual glowing yellow interactive button */}
                      <button
                        type="button"
                        onClick={handleEnableNotifications}
                        className="w-full flex items-center justify-center gap-3 py-4 px-5 bg-yellow text-black font-black rounded-2xl text-xs md:text-sm uppercase cursor-pointer transition-all hover:bg-yellow/90 hover:scale-[1.01] shadow-md active:scale-[0.98] ring-4 ring-yellow/30 animate-pulse border border-yellow/20"
                      >
                        <Bell className="w-5 h-5 shrink-0 animate-bounce text-black" />
                        <span className="tracking-wide">
                          {language === 'ar' 
                            ? 'اضغط هنا لتفعيل التنبيهات الصوتية ونغمة الطلب' 
                            : 'CLICK HERE TO ACTIVATE ORDER SOUNDS & ALERTS'}
                        </span>
                      </button>
                      <p className="text-[10px] text-neutral-400 text-center font-medium leading-normal">
                        {language === 'ar' 
                          ? '💡 بعد الضغط على الزر أعلاه، يرجى النقر على "سماح" أو "Allow" إذا ظهرت لك نافذة المتصفح لتأكيد الإذن.' 
                          : '💡 After clicking, make sure to tap "Allow" in your browser pop-up prompt if requested.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2.5 border border-emerald-100">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div className="text-start">
                          <span className="block font-black">{language === 'ar' ? 'تهانينا! التنبيهات الصوتية مفعّلة بنجاح' : 'Order Alerts Active & Verified!'}</span>
                          <span className="text-[10px] text-emerald-700/80">{language === 'ar' ? 'جهازك متصل الآن لاستلام نغمة تحضير واستلام المشويات.' : 'Your device is fully configured to receive live BBQ status chimes.'}</span>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={handleTestSoundOnly}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-neutral-900 hover:bg-black text-yellow font-black rounded-2xl text-xs cursor-pointer transition-all border border-neutral-850 shadow-xs"
                      >
                        <Volume2 className="w-4 h-4 text-yellow shrink-0 animate-pulse" />
                        <span>
                          {language === 'ar'
                            ? 'اختبار جرس استلام الطلب الفوري (تشغيل نغمة تجريبية)'
                            : 'Test Custom Kitchen Chime (Play Demo Sound)'}
                        </span>
                      </button>
                    </div>
                  )}

                  {testChimePlayed && (
                    <p className="text-xs text-emerald-600 text-center font-bold animate-pulse">
                      {language === 'ar' ? '🎶 تم تشغيل جرس شواء "المطبخ" بنجاح! بالهناء والشفاء.' : '🎶 Grill kitchen chime sound synthesized successfully!'}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {activeStep === 2 && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-6 text-start"
              >
                {/* Brand Banner Card */}
                <div className="bg-amber-500/10 border border-amber-500/15 p-4 rounded-3xl flex items-start gap-3.5">
                  <div className="bg-yellow p-2.5 text-black rounded-2xl shrink-0 shadow-xs">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-neutral-900">
                      {language === 'ar' ? 'تثبيت تطبيق رحلة شواء على شاشتك 📱' : 'Pin Rehla App to your phone homescreen!'}
                    </h4>
                    <p className="text-[11px] md:text-xs text-neutral-600 leading-relaxed font-medium">
                      {language === 'ar' 
                        ? 'احصل على تطبيق متكامل بأيقونة فاخرة مثبتة دائماً على شاشتك الرئيسية! تصفّح المنيو، وتتبع واستلم طلبك بضغطة زر واحدة دون حاجة لكتابة الرابط في كل مرة.'
                        : 'Get a full-screen smart app experience by pinning Rehla BBQ directly to your device. Access the menu, track steps, and receive orders with a single tap.'}
                    </p>
                  </div>
                </div>

                {isAlreadyInstalled ? (
                  <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 border border-emerald-100">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-start">
                      <span className="block font-black">{language === 'ar' ? 'رائع! أنت تستخدم التطبيق المثبت حالياً' : 'Awesome! Standalone App Installed'}</span>
                      <span className="text-[10px] text-emerald-700/80">{language === 'ar' ? 'أنت تستمتع حالياً بتجربة التطبيق الكاملة والخالية من شريط المتصفح.' : 'You are currently enjoying the fully integrated standalone layout.'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Device Custom Guides */}
                    {isIOS ? (
                      /* iOS Safari Add to Home Screen Instructions */
                      <div className="bg-white border border-black/5 p-5 rounded-3xl space-y-4 shadow-xs">
                        <span className="text-xs font-black text-neutral-900 flex items-center gap-2 justify-start border-b border-black/5 pb-2.5">
                          <AlertCircle className="w-4 h-4 text-amber-500" />
                          {language === 'ar' ? 'خطوات تثبيت التطبيق على الـ iPhone والـ iPad:' : 'How to install on iPhone or iPad:'}
                        </span>
                        
                        <div className="space-y-2.5 text-xs text-neutral-700 leading-relaxed font-medium">
                          <div className="flex items-center gap-3 bg-neutral-50 p-3 rounded-xl border border-black/5">
                            <span className="bg-yellow text-black font-black w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">١</span>
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {language === 'ar' ? 'انقر على زر المشاركة' : 'Tap on the Share icon'}
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white rounded border border-black/10 font-black text-[10px] text-neutral-800">
                                <Share className="w-3.5 h-3.5 text-blue-600" />
                              </span>
                              {language === 'ar' ? 'في أسفل شاشة متصفح Safari.' : 'at the bottom toolbar in Safari.'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 bg-neutral-50 p-3 rounded-xl border border-black/5">
                            <span className="bg-yellow text-black font-black w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">٢</span>
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {language === 'ar' ? 'اسحب القائمة للأعلى ثم اختر "إضافة إلى الصفحة الرئيسية"' : 'Scroll and select "Add to Home Screen"'}
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white rounded border border-black/10 font-black text-[10px] text-neutral-800">
                                <PlusSquare className="w-3.5 h-3.5 text-neutral-700" />
                              </span>
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3 bg-neutral-50 p-3 rounded-xl border border-black/5">
                            <span className="bg-yellow text-black font-black w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">٣</span>
                            <span>{language === 'ar' ? 'انقر على "إضافة" بالزاوية العلوية لتأكيد التثبيت على شاشتك.' : 'Tap "Add" at the top right header to confirm.'}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Android, Chrome, Edge automated prompt trigger */
                      <div className="space-y-4">
                        {deferredPrompt ? (
                          <button
                            type="button"
                            onClick={handleInstallApp}
                            className="w-full flex items-center justify-center gap-2.5 py-4 px-5 bg-yellow text-black font-black rounded-2xl text-xs md:text-sm uppercase cursor-pointer transition-all hover:bg-yellow/90 hover:scale-[1.01] shadow-md active:scale-[0.98]"
                          >
                            <Smartphone className="w-5 h-5 shrink-0 animate-pulse text-black" />
                            <span>
                              {language === 'ar' 
                                ? 'تثبيت التطبيق فوراً على الشاشة الرئيسية' 
                                : 'Install Rehla App to Home Screen instantly'}
                            </span>
                          </button>
                        ) : (
                          <div className="bg-white border border-black/5 p-5 rounded-3xl space-y-3 shadow-xs">
                            <span className="font-black text-neutral-900 block text-start text-xs border-b border-black/5 pb-2">
                              {language === 'ar' ? '💡 لتثبيت تطبيق المنيو بشاشتك الرئيسية:' : '💡 Pin Web App to your desktop/android launcher:'}
                            </span>
                            <div className="space-y-2 text-xs text-neutral-600 leading-relaxed font-semibold">
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] text-neutral-800 border border-black/5 font-mono">1</span>
                                <span>{language === 'ar' ? 'انقر على خيارات المتصفح (⋮) أو (⚙️) بالأعلى.' : 'Click on browser settings or menu button (⋮).'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] text-neutral-800 border border-black/5 font-mono">2</span>
                                <span>{language === 'ar' ? 'اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".' : 'Select "Install app" or "Add to Home Screen".'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="w-4 h-4 rounded-full bg-neutral-100 flex items-center justify-center text-[10px] text-neutral-800 border border-black/5 font-mono">3</span>
                                <span>{language === 'ar' ? 'ستظهر لك أيقونة المشويات الفاخرة على واجهتك فوراً!' : 'Enjoy the app right from your home launcher!'}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}

          </div>

          {/* Modal Footer Controls styled with brand colors */}
          <div className="p-5 md:p-6 bg-neutral-50 border-t border-black/5 flex gap-3 justify-end items-center font-bold text-xs">
            {activeStep === 1 ? (
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="px-5 py-3 bg-neutral-900 hover:bg-black text-yellow font-black rounded-xl cursor-pointer transition-all hover:scale-[1.01]"
              >
                {language === 'ar' ? 'الخطوة التالية (التثبيت) ←' : 'Next Step (PWA Pin) →'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="px-5 py-3 bg-white border border-black/10 text-neutral-600 hover:text-neutral-800 rounded-xl cursor-pointer transition-all"
              >
                {language === 'ar' ? 'السابق' : 'Previous'}
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-3 bg-yellow hover:bg-yellow/90 text-black font-black rounded-xl cursor-pointer transition-all hover:scale-[1.01] shadow-xs"
            >
              {language === 'ar' ? 'تصفح المنيو والطلب الآن' : 'Browse Menu & Place Order'}
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
