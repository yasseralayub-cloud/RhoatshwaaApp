import React from 'react';
import { MenuItem } from '../types';
import { useLanguage } from './LanguageContext';
import { Flame, Plus, Minus, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface MenuCardProps {
  item: MenuItem;
  cartQuantity: number;
  onAdd: (item: MenuItem) => void;
  onRemove: (item: MenuItem) => void;
  activePromo?: import('../types').Promotion | null;
}

export const MenuCard = React.memo<MenuCardProps>(({
  item,
  cartQuantity,
  onAdd,
  onRemove,
  activePromo
}) => {
  const { language, t } = useLanguage();
  const isSelected = cartQuantity > 0;

  const hasPromo = !!(activePromo && activePromo.isActive && new Date(activePromo.endsAt).getTime() > Date.now());
  const discountedPrice = hasPromo ? item.price * (1 - (activePromo?.discountPercent || 0) / 100) : item.price;

  return (
    <motion.div
      id={`menu-card-${item.id}`}
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className={`group bg-white rounded-[1.75rem] border overflow-hidden p-3.5 transition-all duration-300 flex flex-col justify-between select-none ${
        item.isAvailable 
          ? 'border-black/[0.07] hover:border-amber-400/60 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] hover:shadow-[0_16px_36px_-6px_rgba(217,119,6,0.14)]' 
          : 'border-black/5 opacity-55 grayscale bg-neutral-50'
      }`}
    >
      {/* Visual Image Block */}
      <div className="relative w-full aspect-[16/10] sm:aspect-video rounded-2xl overflow-hidden mb-3.5 bg-neutral-100 shadow-2xs">
        <img
          src={item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600'}
          alt={language === 'ar' ? item.nameAr : item.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Subtle bottom gradient scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60 pointer-events-none" />

        {/* Absolute Top Badges */}
        <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-center z-10 pointer-events-none">
          {item.isPopular ? (
            <span className="bg-gradient-to-r from-amber-500 to-amber-600 text-white font-extrabold text-[10px] sm:text-xs px-2.5 py-1 rounded-full shadow-md flex items-center gap-1 border border-white/20">
              <Flame className="w-3 h-3 fill-white" />
              <span>{t('popular')}</span>
            </span>
          ) : <span />}
          
          {item.calories > 0 && (
            <span className="bg-black/55 backdrop-blur-md text-white font-medium text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border border-white/10 font-mono shadow-xs">
              {item.calories} {t('calories')}
            </span>
          )}
        </div>

        {/* Out of Stock Overlay */}
        {!item.isAvailable && (
          <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex items-center justify-center z-20">
            <span className="bg-rose-600 text-white font-extrabold text-xs px-4 py-1.5 rounded-full shadow-md tracking-wide">
              {t('outOfStock')}
            </span>
          </div>
        )}
      </div>

      {/* Item info */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          {/* Dish Title */}
          <div className="flex justify-between items-start gap-1.5 mb-0.5 text-start">
            <h3 className="font-extrabold font-serif text-base sm:text-[17px] text-slate-900 leading-snug group-hover:text-amber-800 transition-colors line-clamp-1">
              {language === 'ar' ? item.nameAr : item.name}
            </h3>
          </div>
          
          {/* Bilingual Subtitle */}
          <p className="text-[11px] text-amber-700/80 font-semibold tracking-wide text-start line-clamp-1">
            {language === 'ar' ? item.name : item.nameAr}
          </p>

          {/* Description */}
          <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mt-1.5 min-h-[32px] text-start">
            {language === 'ar' ? item.descriptionAr : item.description}
          </p>
        </div>

        {/* Purchase Interface Footer */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
          {/* Price Block */}
          <div className="flex flex-col text-start">
            {hasPromo ? (
              <>
                <span className="text-[11px] text-slate-400 line-through leading-none mb-0.5 font-mono">
                  {item.price.toFixed(1)} {t('sar')}
                </span>
                <div className="flex items-center gap-1.5 leading-none">
                  <span className="text-xl sm:text-2xl font-black text-slate-950 font-sans tracking-tight">
                    {discountedPrice.toFixed(1)}
                  </span>
                  <span className="text-xs font-bold text-slate-500">{t('sar')}</span>
                  <span className="text-[10px] bg-rose-50 text-rose-600 font-extrabold px-1.5 py-0.5 rounded-md border border-rose-200">
                    -{activePromo?.discountPercent}%
                  </span>
                </div>
              </>
            ) : (
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl font-black text-slate-950 font-sans tracking-tight">
                  {item.price.toFixed(1)}
                </span>
                <span className="text-xs font-bold text-slate-500">{t('sar')}</span>
              </div>
            )}
          </div>

          {/* Cart triggers */}
          <div>
            {!item.isAvailable ? (
              <button 
                disabled 
                className="bg-neutral-100 text-slate-400 font-semibold text-xs px-3.5 py-2 rounded-xl cursor-not-allowed"
              >
                {t('outOfStock')}
              </button>
            ) : isSelected ? (
              <div className="flex items-center gap-2 bg-amber-50/80 border border-amber-300 text-slate-900 rounded-2xl p-1 shadow-sm">
                <button
                  id={`btn-remove-${item.id}`}
                  onClick={() => onRemove(item)}
                  aria-label="Decrease quantity"
                  className="w-8 h-8 rounded-xl bg-white border border-amber-200 text-slate-800 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center transition-all active:scale-90 cursor-pointer shadow-2xs"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-black text-sm w-5 text-center font-mono">{cartQuantity}</span>
                <button
                  id={`btn-add-${item.id}`}
                  onClick={() => onAdd(item)}
                  aria-label="Increase quantity"
                  className="w-8 h-8 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 flex items-center justify-center transition-all active:scale-90 cursor-pointer font-bold shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                id={`btn-atc-${item.id}`}
                onClick={() => onAdd(item)}
                className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-extrabold text-xs py-2.5 px-4 rounded-xl transition-all shadow-sm hover:shadow-md active:scale-95 flex items-center gap-1.5 cursor-pointer border border-amber-400/50"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{t('addToCart')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.price === next.item.price &&
    prev.item.isAvailable === next.item.isAvailable &&
    prev.item.isPopular === next.item.isPopular &&
    prev.cartQuantity === next.cartQuantity &&
    prev.activePromo?.isActive === next.activePromo?.isActive &&
    prev.activePromo?.discountPercent === next.activePromo?.discountPercent
  );
});

export { MenuCardSkeleton, MenuGridSkeleton } from './MenuCardSkeleton';
