import React, { useState } from 'react';
import { useLanguage } from './LanguageContext';
import { ShieldCheck, CheckSquare, Square, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onAccept }) => {
  const { language } = useLanguage();
  const [isChecked, setIsChecked] = useState(false);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto bg-black/75 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-black/5 overflow-hidden text-start font-sans"
        >
          {/* Header Banner */}
          <div className="bg-gradient-to-br from-neutral-900 to-amber-950 p-6 text-white relative">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-yellow/10 rounded-full blur-2xl" />
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-yellow rounded-xl text-black">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-wide">
                  {language === 'ar' ? 'سياسة الخصوصية وشروط الاستخدام' : 'Privacy Policy & Terms'}
                </h3>
                <p className="text-xs text-white/60 font-mono">مطعم رحلة شواء - Rehla BBQ</p>
              </div>
            </div>
          </div>

          {/* Privacy Terms Content */}
          <div className="p-6 space-y-4 max-h-[350px] overflow-y-auto text-dark/80 text-xs leading-relaxed border-b border-black/5">
            {language === 'ar' ? (
              <div className="space-y-3.5 text-right font-medium">
                <p className="text-xs text-dark/40 font-bold">
                  مرحباً بك في تطبيق مطعم رحلة شواء. يرجى قراءة الشروط والموافقة عليها للتمتع بكافة الخدمات:
                </p>
                <div className="p-3 bg-neutral-50 rounded-xl space-y-2 border border-black/5">
                  <h4 className="font-bold text-dark text-xs flex items-center gap-1.5 justify-end">
                    <span>حماية البيانات والسرية</span> 🛡️
                  </h4>
                  <p className="text-dark/60 text-[11px]">
                    نحن نلتزم التزاماً تاماً بحماية خصوصية بياناتك الشخصية، بما في ذلك اسمك الكامل ورقم جوالك. لا يتم مشاركة هذه البيانات نهائياً مع أي أطراف ثالثة أو جهات إعلانية.
                  </p>
                </div>

                <div className="p-3 bg-amber-50/40 rounded-xl space-y-2 border border-amber-100">
                  <h4 className="font-bold text-amber-950 text-xs flex items-center gap-1.5 justify-end">
                    <span>استخدام نظام تحديد المواقع الجغرافي GPS</span> 📍
                  </h4>
                  <p className="text-amber-900/70 text-[11px]">
                    عند طلب التوصيل، يجمع التطبيق إحداثيات موقعك الجغرافي لمساعدتنا في توجيه مندوب التوصيل للفرع والموقع بدقة متناهية. يتم استخدام هذا الموقع فقط وحصرياً لغرض تسليم الطلب الحالي.
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl space-y-2 border border-black/5">
                  <h4 className="font-bold text-dark text-xs flex items-center gap-1.5 justify-end">
                    <span>تعديل وإلغاء الطلب (مهلة 60 ثانية)</span> ⏱️
                  </h4>
                  <p className="text-dark/60 text-[11px]">
                    احتراماً لوقتكم ووقت طاقم العمل، يمنحك النظام مهلة تبلغ <span className="font-bold text-amber-600">60 ثانية فقط</span> من لحظة إرسال طلبك للتمكن من تعديله أو إلغائه تلقائياً من شاشة التتبع. بمجرد انتهاء المهلة، يبدأ التنبيه المباشر في لوحة تحكم الفرع ولا يمكن التراجع دون موافقة الإدارة.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5 text-left">
                <p className="text-xs text-dark/40 font-bold">
                  Welcome to Rehla BBQ. Please read and agree to our terms to access our ordering services:
                </p>
                <div className="p-3 bg-neutral-50 rounded-xl space-y-2 border border-black/5">
                  <h4 className="font-bold text-dark text-xs flex items-center gap-1.5">
                    🛡️ <span>Data Security & Privacy</span>
                  </h4>
                  <p className="text-dark/60 text-[11px]">
                    We strictly guarantee the privacy and confidentiality of your personal details (name and phone). Your contact details are never shared with any external third parties or advertisers.
                  </p>
                </div>

                <div className="p-3 bg-amber-50/40 rounded-xl space-y-2 border border-amber-100">
                  <h4 className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                    📍 <span>GPS Location Services</span>
                  </h4>
                  <p className="text-amber-900/70 text-[11px]">
                    For delivery, our system gathers coordinates to direct our driver directly and accurately to your doorstep. Location details are utilized strictly for fulfilling your immediate purchase.
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl space-y-2 border border-black/5">
                  <h4 className="font-bold text-dark text-xs flex items-center gap-1.5">
                    ⏱️ <span>60-Second Order Adjustments</span>
                  </h4>
                  <p className="text-dark/60 text-[11px]">
                    To optimize kitchen speed, you are allowed a strict <span className="font-bold text-amber-600">60-second window</span> to edit or cancel your order from the status screen. Once this window expires, the order signals the kitchen, and manual supervisor approval is required.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Accept controls */}
          <div className="p-6 bg-neutral-50 space-y-4">
            <button
              type="button"
              onClick={() => setIsChecked(!isChecked)}
              className="w-full flex items-start gap-3 p-3 bg-white border border-black/10 rounded-2xl hover:bg-neutral-100 transition-colors cursor-pointer text-start"
            >
              <div className="mt-0.5 shrink-0 text-amber-500">
                {isChecked ? (
                  <CheckSquare className="w-5 h-5 fill-amber-500 text-white" />
                ) : (
                  <Square className="w-5 h-5 text-dark/30" />
                )}
              </div>
              <div className="text-xs font-bold text-dark/70">
                {language === 'ar'
                  ? 'أقر بأنني قرأت وفهمت سياسة الخصوصية وشروط الاستخدام وأوافق على مشاركة موقعي لإيصال الطلب.'
                  : 'I acknowledge that I have read the Privacy Policy and agree to share my GPS location for delivery.'}
              </div>
            </button>

            <button
              type="button"
              disabled={!isChecked}
              onClick={onAccept}
              className="w-full py-3.5 px-4 bg-yellow disabled:bg-neutral-200 disabled:text-dark/30 hover:bg-yellow-500 text-black font-extrabold text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              <span>{language === 'ar' ? 'أوافق وأرغب في المتابعة' : 'I Agree & Proceed'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
