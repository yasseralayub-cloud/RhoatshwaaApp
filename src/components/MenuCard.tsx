import React from 'react';
import { MenuItem } from '../types';
import { useLanguage } from './LanguageContext';
import { Flame, Plus, Minus, Info } from 'lucide-react';
import { motion } from 'motion/react';

interface MenuCardProps {
  item: MenuItem;
  cartQuantity: number;
  onAdd: (item: MenuItem) => void;
  onRemove: (item: MenuItem) => void;
  activePromo?: import('../types').Promotion | null;
}

export const MenuCard: React.FC<MenuCardProps> = ({
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
      className={`group bg-white rounded-3xl border overflow-hidden p-3.5 transition-all duration-300 flex flex-col justify-between ${
        item.isAvailable 
          ? 'border-black/5 hover:border-yellow hover:shadow-lg hover:shadow-yellow/5' 
          : 'border-black/5 opacity-50 grayscale bg-neutral-50'
      }`}
    >
      {/* Visual Image / Badge block */}
      <div className="relative w-full aspect-video md:h-44 rounded-2xl overflow-hidden mb-3.5 bg-neutral-100">
        <img
          src={item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=600'}
          alt={language === 'ar' ? item.nameAr : item.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          referrerPolicy="no-referrer"
        />

        {/* Absolute overlays */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-10">
          {item.isPopular && (
            <span className="bg-yellow text-black font-semibold text-[10px] md:text-xs px-2.5 py-1 rounded-full shadow-xs border border-black/5 animate-pulse">
              {t('popular')}
            </span>
          )}
          
          {item.calories > 0 && (
            <span className="bg-black/30 backdrop-blur-md text-white font-medium text-[10px] md:text-xs px-2.5 py-1 rounded-full flex items-center gap-1 ml-auto">
              {item.calories} {t('calories')}
            </span>
          )}
        </div>

        {!item.isAvailable && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center">
            <span className="bg-red-650 text-white font-bold text-sm px-4 py-1.5 rounded-full shadow-lg bg-red-600">
              {t('outOfStock')}
            </span>
          </div>
        )}
      </div>

      {/* Item info */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          {/* Title */}
          <div className="flex justify-between items-baseline gap-1.5 mb-1 text-start">
            <h3 className="font-bold font-serif text-base md:text-lg text-dark leading-tight group-hover:text-yellow-600 transition-colors">
              {language === 'ar' ? item.nameAr : item.name}
            </h3>
          </div>
          
          {/* Subtle English subtitle if Arabic, or vice versa, to preserve local vibe */}
          <p className="text-[10px] text-yellow-600/90 py-0.5 tracking-wide uppercase font-mono text-start">
            {language === 'ar' ? item.name : item.nameAr}
          </p>

          {/* Description */}
          <p className="text-xs text-dark/60 leading-relaxed line-clamp-2 mt-1.5 h-8 text-start">
            {language === 'ar' ? item.descriptionAr : item.description}
          </p>
        </div>

        {/* Purchase interface */}
        <div className="mt-4 pt-3 border-t border-black/5 flex items-center justify-between gap-3">
          {/* Price */}
          <div className="flex flex-col text-start">
            {hasPromo ? (
              <>
                <span className="text-[10px] text-dark/40 line-through leading-none mb-0.5">
                  {item.price.toFixed(1)} {t('sar')}
                </span>
                <span className="text-lg md:text-xl font-black text-dark flex items-center gap-1 leading-none">
                  {discountedPrice.toFixed(1)}
                  <span className="text-xs font-bold text-dark/50">{t('sar')}</span>
                  <span className="text-[9.5px] bg-red-50 text-red-600 font-bold px-1.5 py-0.5 rounded-md leading-none border border-red-500/10">
                    -{activePromo?.discountPercent}%
                  </span>
                </span>
              </>
            ) : (
              <span className="text-xl font-black text-dark">
                {item.price.toFixed(1)}
                <span className="text-xs font-bold text-dark/50 mr-1 ml-0.5">{t('sar')}</span>
              </span>
            )}
          </div>

          {/* Cart triggers */}
          <div>
            {!item.isAvailable ? (
              <button 
                disabled 
                className="bg-neutral-100 text-dark/30 font-medium text-xs px-4 py-2 rounded-xl"
              >
                {t('outOfStock')}
              </button>
            ) : isSelected ? (
              <div className="flex items-center gap-2 bg-neutral-50 border border-black/5 text-dark rounded-xl p-1 shadow-sm">
                <button
                  id={`btn-remove-${item.id}`}
                  onClick={() => onRemove(item)}
                  className="w-8 h-8 rounded-lg bg-white border border-black/5 text-dark hover:bg-neutral-100 flex items-center justify-center transition-colors active:scale-90 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-bold text-sm w-5 text-center">{cartQuantity}</span>
                <button
                  id={`btn-add-${item.id}`}
                  onClick={() => onAdd(item)}
                  className="w-8 h-8 rounded-lg bg-yellow text-black hover:bg-yellow/90 flex items-center justify-center transition-colors active:scale-90 cursor-pointer font-bold border border-black/5"
                >
                  <Plus className="w-3.5 h-3.5 text-black" />
                </button>
              </div>
            ) : (
              <button
                id={`btn-atc-${item.id}`}
                onClick={() => onAdd(item)}
                className="bg-yellow hover:bg-yellow/90 text-black font-semibold text-xs py-2.5 px-4 rounded-xl transition-all shadow-sm active:scale-95 flex items-center gap-1 cursor-pointer border border-black/5"
              >
                <Plus className="w-3.5 h-3.5" />
                {t('addToCart')}
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
