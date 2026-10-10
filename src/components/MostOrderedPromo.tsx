import React, { useState, useEffect, useMemo } from 'react';
import { MenuItem, Promotion, Order } from '../types';
import { useLanguage } from './LanguageContext';
import { Flame, Sparkles, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MostOrderedPromoProps {
  items: MenuItem[];
  onItemClick: (item: MenuItem) => void;
  activePromo?: Promotion | null;
}

export const MostOrderedPromo: React.FC<MostOrderedPromoProps> = ({
  items,
  onItemClick,
  activePromo
}) => {
  const { language, t } = useLanguage();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Compute the prioritized list of most ordered/popular items using real sales data + popularity flags
  const popularList = useMemo(() => {
    if (!items || items.length === 0) return [];

    // 1. Calculate sales count from stored orders if available
    const salesCountMap: Record<string, number> = {};
    try {
      const storedOrders = localStorage.getItem('simulated_orders');
      if (storedOrders) {
        const parsedOrders: Order[] = JSON.parse(storedOrders);
        parsedOrders.forEach((ord) => {
          (ord.items || []).forEach((it) => {
            if (it.id) {
              salesCountMap[it.id] = (salesCountMap[it.id] || 0) + (it.quantity || 1);
            }
          });
        });
      }
    } catch {
      // ignore parse errors
    }

    // Filter available items that have an image and are not standalone addons/sauces
    const availableItems = items.filter((item) => 
      item.isAvailable !== false && 
      !!item.image && 
      !item.isAddonOnly && 
      item.category !== 'sauces' && 
      !item.id.startsWith('sauce')
    );

    // Food categories check to strictly present food dishes in front of non-food/games
    const isFoodCategory = (cat: string) => {
      return cat === 'main' || cat === 'shawarma' || cat === 'appetizers' || cat === 'desserts' || (cat !== 'drinks' && cat !== 'coffee' && cat !== 'games');
    };

    // Sort: food dishes first, then by sales count, then by isPopular flag, then by default order
    const sorted = [...availableItems].sort((a, b) => {
      const aFood = isFoodCategory(a.category) ? 1 : 0;
      const bFood = isFoodCategory(b.category) ? 1 : 0;
      if (bFood !== aFood) return bFood - aFood;

      const countA = salesCountMap[a.id] || 0;
      const countB = salesCountMap[b.id] || 0;

      if (countB !== countA) {
        return countB - countA;
      }
      if (b.isPopular && !a.isPopular) return 1;
      if (!b.isPopular && a.isPopular) return -1;
      return 0;
    });

    // If we have items marked popular or with sales, take top 8, else take all available
    const topPopular = sorted.filter((item) => item.isPopular || (salesCountMap[item.id] || 0) > 0);
    return topPopular.length > 0 ? topPopular.slice(0, 8) : sorted.slice(0, 8);
  }, [items]);

  // Auto-advance every 4.5 seconds when not hovered/paused
  useEffect(() => {
    if (popularList.length <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % popularList.length);
    }, 4500);

    return () => clearInterval(timer);
  }, [popularList.length, isPaused]);

  if (popularList.length === 0) return null;

  const currentItem = popularList[currentIndex] || popularList[0];
  const hasPromo = !!(activePromo && activePromo.isActive && new Date(activePromo.endsAt).getTime() > Date.now());
  const discountedPrice = hasPromo
    ? currentItem.price * (1 - (activePromo?.discountPercent || 0) / 100)
    : currentItem.price;

  return (
    <div
      id="most-ordered-promo-banner"
      className="w-full"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setTimeout(() => setIsPaused(false), 2000)}
    >
      <div className="bg-gradient-to-r from-amber-500/10 via-yellow/20 to-amber-500/10 border border-yellow/40 rounded-2xl md:rounded-3xl p-4 sm:p-5 shadow-xs relative overflow-hidden backdrop-blur-xs transition-all duration-300 hover:border-yellow hover:shadow-md hover:shadow-yellow/10">
        {/* Subtle decorative glow background */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-yellow/30 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-amber-400/20 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 space-y-3 sm:space-y-4">
          {/* Header & Tag row */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-yellow text-black flex items-center justify-center shadow-xs shrink-0 font-bold">
                <Flame className="w-4 h-4 sm:w-5 sm:h-5 text-black animate-pulse" />
              </span>
              <div className="text-start">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm sm:text-base text-dark tracking-wide uppercase font-serif">
                    {language === 'ar' ? 'الأكثر طلباً' : 'Most Popular'}
                  </span>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-yellow/90 text-black border border-black/5">
                    <Sparkles className="w-2.5 h-2.5 mr-0.5 ml-0.5" />
                    {language === 'ar' ? 'مميز' : 'Featured'}
                  </span>
                </div>
                <p className="text-[10.5px] text-dark/60 font-mono">
                  {language === 'ar' ? 'مفضل لزبائننا الكرام' : 'Customer favorite'}
                </p>
              </div>
            </div>

            {/* Pagination Indicators */}
            {popularList.length > 1 && (
              <div className="flex items-center gap-1.5">
                {popularList.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentIndex(idx)}
                    className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                      idx === currentIndex ? 'w-5 bg-yellow-600' : 'w-2 bg-black/15 hover:bg-black/30'
                    }`}
                    aria-label={`Go to item ${idx + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Single Featured Product with LARGE FULL PRODUCT IMAGE and smooth auto-rotation */}
          <div className="w-full relative overflow-hidden rounded-xl sm:rounded-2xl bg-white/90 border border-black/5 shadow-xs">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentItem.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
                onClick={() => onItemClick(currentItem)}
                className="group cursor-pointer p-3 sm:p-4 flex flex-col items-center text-center transition-all"
              >
                {/* LARGE FULL PRODUCT IMAGE (object-contain, uncropped, preserved aspect ratio) */}
                <div className="w-full h-48 sm:h-56 md:h-64 flex items-center justify-center p-2 rounded-xl bg-neutral-50/70 border border-black/5 relative overflow-hidden">
                  <img
                    src={currentItem.image}
                    alt={language === 'ar' ? currentItem.nameAr : currentItem.name}
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-full object-contain transform group-hover:scale-105 transition-transform duration-500"
                    style={{ objectFit: 'contain' }}
                  />
                  {currentItem.isPopular && (
                    <div className="absolute top-2 right-2 bg-yellow text-black text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs flex items-center gap-1">
                      <span>🔥</span>
                      <span>{language === 'ar' ? 'الأكثر طلباً' : 'Popular'}</span>
                    </div>
                  )}
                </div>

                {/* Product Information Bar & Order Action */}
                <div className="w-full mt-3 pt-2 border-t border-black/5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4 text-start">
                  <div className="w-full sm:w-auto flex-1 min-w-0 text-start">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-base sm:text-lg text-dark truncate group-hover:text-yellow-700 transition-colors">
                        {language === 'ar' ? currentItem.nameAr : currentItem.name}
                      </h4>
                      {currentItem.calories > 0 && (
                        <span className="text-[10px] text-dark/50 font-mono bg-neutral-100 px-1.5 py-0.5 rounded-md shrink-0">
                          {currentItem.calories} {t('calories')}
                        </span>
                      )}
                    </div>
                    {(currentItem.descriptionAr || currentItem.description) && (
                      <p className="text-xs text-dark/60 line-clamp-1 mt-0.5">
                        {language === 'ar' ? (currentItem.descriptionAr || currentItem.description) : (currentItem.description || currentItem.descriptionAr)}
                      </p>
                    )}
                  </div>

                  <div className="w-full sm:w-auto flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <div className="text-start sm:text-end">
                      <div className="font-black text-base sm:text-lg text-dark">
                        {discountedPrice.toFixed(1)} <span className="text-xs text-dark/50 font-normal">{t('sar')}</span>
                      </div>
                      {hasPromo && (
                        <div className="text-[11px] text-dark/40 line-through">
                          {currentItem.price.toFixed(1)} {t('sar')}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onItemClick(currentItem);
                      }}
                      className="bg-yellow hover:bg-yellow/90 text-black px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs flex items-center gap-1.5 group-hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{language === 'ar' ? 'طلب الآن' : 'Order Now'}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
