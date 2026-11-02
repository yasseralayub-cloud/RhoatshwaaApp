import React, { useState } from 'react';
import { useLanguage } from './LanguageContext';
import { ShieldCheck, CheckSquare, Square, X, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onClose?: () => void;
  isMandatory?: boolean;
  gracePeriod?: number;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ 
  isOpen, 
  onAccept, 
  onClose, 
  isMandatory = true,
  gracePeriod = 30 
}) => {
  const { language } = useLanguage();
  const [isChecked, setIsChecked] = useState(false);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto bg-black/80 backdrop-blur-md"
        onClick={(e) => {
          // If not mandatory and user clicked outside modal, allow closing
          if (!isMandatory && onClose && e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-black/5 overflow-hidden text-start font-sans"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button only shown if NOT mandatory (i.e. already accepted and just reviewing) */}
          {!isMandatory && onClose && (
            <button 
              type="button"
              onClick={onClose}
              className={`absolute top-4 ${language === 'ar' ? 'left-4' : 'right-4'} z-10 p-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors cursor-pointer`}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {/* Header Banner */}
          <div className="bg-gradient-to-br from-neutral-900 via-amber-950 to-neutral-900 p-6 text-white relative">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-yellow/10 rounded-full blur-2xl" />
            <div className="flex items-center justify-between gap-3">
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

              {isMandatory && (
                <div className="flex items-center gap-1 bg-amber-500/20 border border-amber-400/40 text-amber-300 px-2.5 py-1 rounded-full text-[10px] font-black shrink-0">
                  <Lock className="w-3 h-3" />
                  <span>{language === 'ar' ? 'موافقة إلزامية' : 'Mandatory'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Privacy Terms Content */}
          <div className="p-6 space-y-4 max-h-[340px] overflow-y-auto text-dark/80 text-xs leading-relaxed border-b border-black/5">
            {language === 'ar' ? (
              <div className="space-y-3.5 text-right font-medium">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-950 text-xs font-bold leading-relaxed flex items-center gap-2">
                  <span className="text-base shrink-0">⚠️</span>
                  <span>
                    لضمان حماية بياناتك وتقديم خدمة التوصيل وتتبع الطلب، تتطلب اللائحة موافقتك الصريحة على الشروط أدناه قبل متابعة استخدام التطبيق.
                  </span>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl space-y-1.5 border border-black/5">
                  <h4 className="font-bold text-dark text-xs flex items-center gap-1.5 justify-end">
                    <span>حماية البيانات والسرية التامة</span> 🛡️
                  </h4>
                  <p className="text-dark/65 text-[11px] leading-relaxed">
                    نلتزم بحماية خصوصية بياناتك الشخصية (الاسم ورقم الجوال). لا يتم بيع أو مشاركة بياناتك إطلاقاً مع أطراف ثالثة أو شركات إعلانية، وتُستخدم فقط لتأكيد ومتابعة طلبك والتواصل بخصوصه.
                  </p>
                </div>

                <div className="p-3 bg-amber-50/50 rounded-xl space-y-1.5 border border-amber-200">
                  <h4 className="font-bold text-amber-950 text-xs flex items-center gap-1.5 justify-end">
                    <span>بيانات الموقع الجغرافي (GPS)</span> 📍
                  </h4>
                  <p className="text-amber-900/80 text-[11px] leading-relaxed">
                    نطلب إذن الموقع فقط عند استخدام ميزة التوصيل أو تحديد عنوانك على الخريطة لتوجيه المندوب بدقة عالية. لا يتم تتبع موقعك في الخلفية ولا يتم طلبه دون حاجة فعلية.
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl space-y-1.5 border border-black/5">
                  <h4 className="font-bold text-dark text-xs flex items-center gap-1.5 justify-end">
                    <span>إشعارات النظام والتحديثات الحية</span> 🔔
                  </h4>
                  <p className="text-dark/65 text-[11px] leading-relaxed">
                    تُستخدم الإشعارات لإبلاغك بلحظة قبول الطلب، خروجه مع المندوب، وعروض الخصم الخاصة برحلة شواء. يمكنك التحكم في الإشعارات في أي وقت من إعدادات جهازك.
                  </p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl space-y-1.5 border border-stone-200">
                  <h4 className="font-bold text-stone-800 text-xs flex items-center gap-1.5 justify-end">
                    <span>تعديل وإلغاء الطلب (مهلة {gracePeriod} ثانية)</span> ⏱️
                  </h4>
                  <p className="text-stone-600 text-[11px] leading-relaxed">
                    يمنحك النظام مهلة تبلغ <span className="font-bold text-amber-600">{gracePeriod} ثانية</span> من لحظة اعتماد الطلب للتمكن من تعديله أو إلغائه ذاتياً قبل البدء في تجهيز الشواء في المطبخ.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5 text-left">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200/80 text-amber-950 text-xs font-bold leading-relaxed flex items-center gap-2">
                  <span className="text-base shrink-0">⚠️</span>
                  <span>
                    To protect your privacy and ensure order fulfillment and delivery, your agreement to these terms is mandatory before using the application.
                  </span>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl space-y-1.5 border border-black/5">
                  <h4 className="font-bold text-dark text-xs flex items-center gap-1.5">
                    🛡️ <span>Data Security & Confidentiality</span>
                  </h4>
                  <p className="text-dark/65 text-[11px] leading-relaxed">
                    Your personal information (name and phone) is securely stored strictly for handling orders and receipts. We never share or sell your data to any third party.
                  </p>
                </div>

                <div className="p-3 bg-amber-50/50 rounded-xl space-y-1.5 border border-amber-200">
                  <h4 className="font-bold text-amber-950 text-xs flex items-center gap-1.5">
                    📍 <span>GPS Location Access</span>
                  </h4>
                  <p className="text-amber-900/80 text-[11px] leading-relaxed">
                    Location permission is requested only on-demand during delivery checkout to accurately guide drivers to your door. No background location tracking is performed.
                  </p>
                </div>

                <div className="p-3 bg-neutral-50 rounded-xl space-y-1.5 border border-black/5">
                  <h4 className="font-bold text-dark text-xs flex items-center gap-1.5">
                    🔔 <span>System Notifications</span>
                  </h4>
                  <p className="text-dark/65 text-[11px] leading-relaxed">
                    Notifications provide live status updates for kitchen preparation and driver arrival. You can enable or disable them anytime.
                  </p>
                </div>

                <div className="p-3 bg-stone-50 rounded-xl space-y-1.5 border border-stone-200">
                  <h4 className="font-bold text-stone-800 text-xs flex items-center gap-1.5">
                    ⏱️ <span>{gracePeriod}-Second Grace Period</span>
                  </h4>
                  <p className="text-stone-600 text-[11px] leading-relaxed">
                    You have <span className="font-bold text-amber-600">{gracePeriod} seconds</span> after placing an order to modify or cancel it freely before food preparation begins.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Mandatory Agreement Decision Section */}
          <div className="p-5 bg-neutral-50 space-y-3">
            {/* Agreement Checkbox */}
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
              <div className="text-xs font-bold text-dark/85 leading-snug">
                {language === 'ar'
                  ? 'أوافق وأقر بأنني اطلعت على سياسة الخصوصية وشروط الاستخدام وأوافق على الالتزام بها لاستخدام التطبيق وإتمام الطلبات.'
                  : 'I acknowledge that I have read the Privacy Policy and agree to abide by all terms to use the app and place orders.'}
              </div>
            </button>

            {/* Mandatory Action Button */}
            <div className="flex gap-2 pt-1">
              {!isMandatory && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="py-3 px-4 bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-xs rounded-xl transition-all cursor-pointer text-center"
                >
                  {language === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              )}

              <button
                type="button"
                disabled={!isChecked}
                onClick={onAccept}
                className={`flex-1 py-3.5 px-4 bg-yellow text-stone-900 font-black text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  !isChecked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-yellow/90 active:scale-98'
                }`}
              >
                <span>{language === 'ar' ? 'أوافق على الشروط وأرغب في المتابعة ✓' : 'I Agree & Proceed ✓'}</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
