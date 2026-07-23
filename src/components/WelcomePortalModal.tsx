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
  ChefHat
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface WelcomePortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessSettings?: import('../types').BusinessSettings;
}

export const WelcomePortalModal: React.FC<WelcomePortalModalProps> = ({ isOpen, onClose, businessSettings }) => {
  const { language, t } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(() => {
    return (window as any).deferredPrompt || null;
  });
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
      (window as any).deferredPrompt = e;
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
    const promptEvent = deferredPrompt || (window as any).deferredPrompt;
    if (promptEvent) {
      try {
        promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        console.log(`Add To Home Screen outcome: ${outcome}`);
        if (outcome === 'accepted') {
          setIsAlreadyInstalled(true);
        }
        setDeferredPrompt(null);
        (window as any).deferredPrompt = null;
      } catch (err) {
        console.error("Error launching native PWA prompt inside modal:", err);
      }
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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in text-start">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="w-full max-w-lg bg-white border border-slate-100 rounded-[2.5rem] shadow-2xl relative text-dark overflow-hidden max-h-[92vh] flex flex-col"
        >
          {/* Header branding background block with elegant orange gradient */}
          <div className="bg-gradient-to-br from-amber-600 via-orange-600 to-red-600 p-6 text-white relative">
            <div className="absolute top-0 right-0 left-0 bottom-0 bg-black/10 mix-blend-overlay" />
            <div className="absolute -bottom-12 -start-12 w-32 h-32 bg-white/10 rounded-full blur-xl" />
            
            <button 
              onClick={onClose}
              className="absolute top-4 end-4 bg-white/15 hover:bg-white/25 text-white p-2 rounded-full cursor-pointer transition-all border border-white/10 z-10"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 relative z-10">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center p-0.5 shadow-md border border-white/20 overflow-hidden shrink-0">
                <img src={businessSettings?.logoUrl || '/pwa-icon.jpg'} alt="Rehla Grill App Icon" className="w-full h-full object-cover rounded-xl" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 bg-white/20 text-[9px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full w-max">
                  <span>{language === 'ar' ? 'تطبيق رحلة شواء الرسمي' : 'Rehla BBQ Official App'}</span>
                </div>
                <h3 className="text-xl font-serif font-black tracking-wide leading-tight mt-1">
                  {language === 'ar' ? 'مرحباً بك في مطعم رحلة شواء' : 'Welcome to Rehla BBQ'}
                </h3>
              </div>
            </div>
          </div>

          {/* Dialog Tabs Navigation */}
          <div className="grid grid-cols-2 bg-slate-50 border-b border-slate-100 font-bold text-xs">
            <button
              onClick={() => setActiveStep(1)}
              className={`py-3.5 border-b-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeStep === 1 
                  ? 'border-orange-600 text-orange-600 font-extrabold bg-white' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>{language === 'ar' ? '1. الصوت والتنبيهات' : '1. Sounds & Alerts'}</span>
            </button>
            <button
              onClick={() => setActiveStep(2)}
              className={`py-3.5 border-b-2 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeStep === 2 
                  ? 'border-orange-600 text-orange-600 font-extrabold bg-white' 
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>{language === 'ar' ? '2. التثبيت على الشاشة' : '2. Pin to Screen'}</span>
            </button>
          </div>

          {/* Modal Content Scroll Area */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700">
            
            {activeStep === 1 && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
              >
                <div className="bg-slate-50 p-4 border border-slate-200/50 rounded-2xl flex items-start gap-4">
                  <div className="bg-amber-100 p-2 text-amber-700 rounded-xl shrink-0">
                    <ChefHat className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-800">
                      {language === 'ar' ? 'تابع طلبك الطازج بكل ثقة 🍗' : 'Track your fresh feast with ease'}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {language === 'ar' 
                        ? 'لكي لا يفوتك أي تحديث بخصوص طلبك، نرجو منك الموافقة على منح إذن الإشعارات لتصلك نغمات التنبيه الرائعة فوراً عند البدء في شواء وتحضير لحومك الطازجة أو خروجها مع دليفري التوصيل!'
                        : 'To stay updated about your order status, please enable web notifications to hear delightful auditory chime alerts when preparing your meat or when arriving at your table/home.'}
                    </p>
                  </div>
                </div>

                {/* Notification Status Block */}
                <div className="bg-slate-50 border border-slate-100 p-5 rounded-3xl space-y-4">
                  <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200/50">
                    <span className="text-xs font-bold text-slate-500">{language === 'ar' ? 'حالة الإذن الحالي للمتصفح:' : 'Browser permission state:'}</span>
                    <span className={`text-xs font-black uppercase px-2.5 py-1 rounded-full ${
                      notificationPermission === 'granted' 
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : notificationPermission === 'denied' 
                        ? 'bg-red-50 text-red-600 border border-red-100'
                        : 'bg-amber-50 text-amber-700 border border-amber-100'
                    }`}>
                      {notificationPermission === 'granted' && (language === 'ar' ? 'مفعّلة ومتصلة بنجاح ✅' : 'Granted ✅')}
                      {notificationPermission === 'denied' && (language === 'ar' ? 'محجوبة للأسف 🚫' : 'Blocked 🚫')}
                      {notificationPermission === 'default' && (language === 'ar' ? 'في انتظار تفعيلك ⏳' : 'Pending ⏳')}
                    </span>
                  </div>

                  {notificationPermission !== 'granted' ? (
                    <button
                      type="button"
                      onClick={handleEnableNotifications}
                      className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-orange-650 hover:bg-orange-700 text-white font-extrabold rounded-2xl text-xs uppercase tracking-wide cursor-pointer transition-all shadow-md active:scale-[0.98]"
                    >
                      <Bell className="w-4 h-4 shrink-0 animate-bounce" />
                      <span>
                        {language === 'ar' 
                          ? '🔔 اضغط هنا لتفعيل التنبيهات والإشعارات بالنغمة' 
                          : '🔔 Opt-in to receive premium notifications & melodies'}
                      </span>
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-3 bg-emerald-50/50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-100">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{language === 'ar' ? 'إذن الإشعارات مفعّل ومثبّت بنجاح على هذا المتصفح!' : 'Notification authorization validated!'}</span>
                      </div>
                      
                      <button
                        type="button"
                        onClick={handleTestSoundOnly}
                        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl text-[11px] cursor-pointer transition-all border border-slate-250/20"
                      >
                        <Volume2 className="w-4 h-4 text-orange-600 shrink-0" />
                        <span>
                          {language === 'ar'
                            ? 'إعادة تشغيل نغمة وجرس التنبيه (اختبار الصوت)'
                            : 'Replay audio chime (Test audio channel)'}
                        </span>
                      </button>
                    </div>
                  )}

                  {testChimePlayed && (
                    <p className="text-[10px] text-emerald-600 text-center font-semibold animate-pulse">
                      {language === 'ar' ? '🎶 تم تشغيل جرس "كابتن المطبخ" بنجاح، هل استمعت إليه؟' : '🎶 Kitchen captain chime synthesized successfully!'}
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {activeStep === 2 && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-5"
              >
                <div className="bg-slate-50 p-4 border border-slate-200/50 rounded-2xl flex items-start gap-4">
                  <div className="bg-orange-100 p-2 text-orange-700 rounded-xl shrink-0">
                    <Smartphone className="w-5 h-5 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-slate-800">
                      {language === 'ar' ? 'تثبيت "بروشور المنيو والطلب" بشاشتك 📱' : 'Pin Rehla menu for direct instant taps'}
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {language === 'ar' 
                        ? 'تجاوز حدود المتصفح المزدحم! احصل على تطبيق كامل أيقونته موجودة دائماً على شاشتك الرئيسية لتصل للمطعم بلمسة واحدة وتقوم بالاستعراض والطلب الفوري دون حاجة لكتابة الرابط مجدداً.'
                        : 'Transform your web browser into an immersive, standalone app icon on your device launcher! Enjoy rapid layouts without address bar controls.'}
                    </p>
                  </div>
                </div>

                {isAlreadyInstalled ? (
                  <div className="p-4 bg-emerald-50 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 border border-emerald-100/70">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div className="text-start">
                      <span className="block font-black">{language === 'ar' ? 'رائع! التطبيق مثبّت حالياً لديك' : 'Excellent! Rehla BBQ is already installed'}</span>
                      <span className="text-[10px] text-emerald-700/80">{language === 'ar' ? 'أنت تستخدم التطبيق الآن كبرنامج مستقل بالكامل.' : 'You are currently browsing the standalone layout.'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Device Custom Guides */}
                    {isIOS ? (
                      /* iOS Safari Add to Home Screen Instructions (Manual approach needed for iOS devices) */
                      <div className="bg-amber-50/50 border border-amber-200/50 p-5 rounded-3xl space-y-3.5">
                        <span className="text-xs font-black text-amber-800 flex items-center gap-1.5 justify-start">
                          <AlertCircle className="w-4 h-4" />
                          {language === 'ar' ? 'خطوات التثبيت على أجهزة iPhone / iPad:' : 'Installation guide for iPhone & iPad:'}
                        </span>
                        
                        <div className="space-y-2 text-xs text-amber-900 leading-relaxed">
                          <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-amber-200/10 shadow-xs">
                            <span className="bg-amber-100 text-amber-800 font-extrabold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">١</span>
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {language === 'ar' ? 'اضغط على زر المشاركة' : 'Tap on the Share / Utility button'}
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-neutral-100 rounded border border-neutral-300 font-black text-[10px] text-neutral-800">
                                <Share className="w-3.5 h-3.5 text-blue-650" />
                              </span>
                              {language === 'ar' ? 'بأسفل شاشة متصفح Safari بـ iPhone.' : 'in your mobile Safari browser panel.'}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-amber-200/10 shadow-xs">
                            <span className="bg-amber-100 text-amber-800 font-extrabold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">٢</span>
                            <span className="flex items-center gap-1.5 flex-wrap">
                              {language === 'ar' ? 'اسحب القائمة للأعلى ثم اختر إضافة للشاشة الرئيسية' : 'Scroll down and choose "Add to Home Screen"'}
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-neutral-100 rounded border border-neutral-300 font-black text-[10px] text-neutral-800">
                                <PlusSquare className="w-3.5 h-3.5" />
                              </span>
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-amber-200/10 shadow-xs">
                            <span className="bg-amber-100 text-amber-800 font-extrabold w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">٣</span>
                            <span>{language === 'ar' ? 'انقر على "إضافة" بالزاوية العلوية لتظهر أيقونة التطبيق الكلاسيكية.' : 'Tap "Add" at the top right header to pin Rehla BBQ icon.'}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Android, Chrome, Edge automated prompt trigger */
                      <div className="space-y-3">
                        {deferredPrompt ? (
                          <button
                            type="button"
                            onClick={handleInstallApp}
                            className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-emerald-650 hover:bg-emerald-700 text-white font-extrabold rounded-2xl text-xs uppercase tracking-wide cursor-pointer transition-all shadow-md active:scale-[0.98]"
                          >
                            <Smartphone className="w-4 h-4 shrink-0 animate-pulse" />
                            <span>
                              {language === 'ar' 
                                ? '📱 اضغط هنا للتثبيت الفوري على الشاشة الرئيسية' 
                                : '📱 Install Rehla App to Home Screen instantly'}
                            </span>
                          </button>
                        ) : (
                          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl text-xs space-y-2.5">
                            <span className="font-extrabold text-slate-800 block text-start">
                              {language === 'ar' ? '💡 لتنزيل وتثبيت المنيو كأيقونة على شاشتك الرئيسية:' : '💡 To download and add web app shortcut to your home screen:'}
                            </span>
                            <div className="space-y-1.5 text-slate-600 leading-relaxed font-semibold">
                              <div>{language === 'ar' ? '١. انقر على زر ثلاثة نقاط (⋮) بمتصفحك الحالي بالزاوية العليا.' : '1. Click on the 3-dot (⋮) browser configurations menu.'}</div>
                              <div>{language === 'ar' ? '٢. اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية".' : '2. Select "Install app" or "Add to Home Screen".'}</div>
                              <div>{language === 'ar' ? '٣. ستظهر أيقونة الشواء الفاخرة على واجهتك فوراً!' : '3. A luxury Rehla BBQ icon will pin to your launcher!'}</div>
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

          {/* Modal Footer Controls */}
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 justify-end items-center">
            {activeStep === 1 ? (
              <button
                type="button"
                onClick={() => setActiveStep(2)}
                className="px-5 py-3 bg-orange-600 hover:bg-orange-700 text-white font-extrabold rounded-xl text-xs cursor-pointer transition-all"
              >
                {language === 'ar' ? 'الخطوة التالية (تثبيت الأيقونة) ←' : 'Next Step (Pin Screen) →'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveStep(1)}
                className="px-5 py-3 bg-white border border-slate-200 text-slate-600 hover:text-slate-800 font-bold rounded-xl text-xs cursor-pointer transition-all"
              >
                {language === 'ar' ? 'السابق' : 'Previous'}
              </button>
            )}

            <button
              onClick={onClose}
              className="px-5 py-3 bg-stone-900 hover:bg-black text-white font-extrabold rounded-xl text-xs cursor-pointer transition-all"
            >
              {language === 'ar' ? 'تصفح المنيو والبدء بالطلب' : 'Browse Menu & Place Orders'}
            </button>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  );
};
