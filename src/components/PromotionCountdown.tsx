import React, { useState, useEffect } from 'react';
import { Promotion } from '../types';
import { useLanguage } from './LanguageContext';
import { Flame, Clock } from 'lucide-react';
import { motion } from 'motion/react';

interface PromotionCountdownProps {
  promotion: Promotion;
  onExpired?: () => void;
}

export const PromotionCountdown: React.FC<PromotionCountdownProps> = ({ promotion, onExpired }) => {
  const { language, t } = useLanguage();
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(promotion.endsAt).getTime() - Date.now();
      
      if (difference <= 0) {
        setTimeLeft(prev => ({ ...prev, isExpired: true }));
        if (onExpired) onExpired();
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((difference / 1000 / 60) % 60);
      const seconds = Math.floor((difference / 1000) % 60);

      setTimeLeft({
        days,
        hours,
        minutes,
        seconds,
        isExpired: false,
      });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [promotion.endsAt, onExpired]);

  if (timeLeft.isExpired || !promotion.isActive) return null;

  const padZero = (num: number) => String(num).padStart(2, '0');

  return (
    <motion.div
      id={`promo-countdown-${promotion.id}`}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-yellow/10 border border-yellow/20 rounded-[2rem] p-5 flex flex-col md:flex-row justify-between items-center gap-4 text-start shadow-xs relative overflow-hidden"
    >
      {/* Soft and beautiful custom background image */}
      {promotion.imageUrl && (
        <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
          <img 
            src={promotion.imageUrl} 
            alt="" 
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-[0.16] filter blur-[1.5px] scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white/30 via-white/80 to-white" />
        </div>
      )}

      <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-yellow/15 rounded-full blur-2xl pointer-events-none" />
      
      <div className="flex items-center gap-3 z-10">
        <div className="w-10 h-10 rounded-xl bg-yellow/20 flex items-center justify-center animate-pulse border border-yellow/30">
          <Flame className="w-5.5 h-5.5 text-yellow-600 fill-yellow-600/10" />
        </div>
        <div>
          <h4 className="font-bold text-sm md:text-base text-dark flex items-center gap-2 font-serif">
            <span>{language === 'ar' ? promotion.titleAr : promotion.title}</span>
            <span className="bg-yellow text-black text-[10px] font-mono font-semibold py-0.5 px-2 rounded-full uppercase border border-black/5 gap-1.5 flex items-center">
              {promotion.discountPercent}% {language === 'ar' ? 'خصم مالي' : 'OFF'}
            </span>
          </h4>
          <p className="text-[11px] text-dark/70 mt-0.5">
            {language === 'ar' 
              ? 'ينطبق الخصم تلقائياً عند الدفع وإتمام الطلب الآن!' 
              : 'Discount applies automatically to your checkout summary total!'}
          </p>
        </div>
      </div>

      {/* Luxury Monspaced Digit Timer Grid */}
      <div className="flex items-center gap-1.5 font-mono z-10 select-none bg-white p-2 md:p-2.5 rounded-xl border border-black/5 shadow-xs">
        <Clock className="w-4 h-4 text-yellow-600 mr-1 ml-1 shrink-0 animate-pulse" />
        
        {timeLeft.days > 0 && (
          <>
            <div className="flex flex-col items-center">
              <span className="text-sm md:text-base font-black px-1.5 py-0.5 bg-neutral-100 rounded text-dark border border-black/5">{padZero(timeLeft.days)}</span>
              <span className="text-[8px] text-dark/40 uppercase mt-0.5">{language === 'ar' ? 'يوم' : 'D'}</span>
            </div>
            <span className="text-dark/40 font-bold mb-3">:</span>
          </>
        )}

        <div className="flex flex-col items-center">
          <span className="text-sm md:text-base font-black px-1.5 py-0.5 bg-neutral-100 rounded text-dark border border-black/5">{padZero(timeLeft.hours)}</span>
          <span className="text-[8px] text-dark/40 uppercase mt-0.5">{language === 'ar' ? 'ساعة' : 'H'}</span>
        </div>
        <span className="text-dark/40 font-bold mb-3">:</span>

        <div className="flex flex-col items-center">
          <span className="text-sm md:text-base font-black px-1.5 py-0.5 bg-neutral-100 rounded text-dark border border-black/5">{padZero(timeLeft.minutes)}</span>
          <span className="text-[8px] text-dark/40 uppercase mt-0.5">{language === 'ar' ? 'دقيقة' : 'M'}</span>
        </div>
        <span className="text-dark/40 font-bold mb-3">:</span>

        <div className="flex flex-col items-center">
          <span className="text-sm md:text-base font-black px-1.5 py-0.5 bg-neutral-100 rounded text-dark border border-black/5">{padZero(timeLeft.seconds)}</span>
          <span className="text-[8px] text-dark/40 uppercase mt-0.5">{language === 'ar' ? 'ثانية' : 'S'}</span>
        </div>
      </div>
    </motion.div>
  );
};
