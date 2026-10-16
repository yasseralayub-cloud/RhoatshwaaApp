import React, { useRef, useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { ChevronLeft, ChevronRight, Utensils } from 'lucide-react';
import { Category } from '../types';
import { useLanguage } from './LanguageContext';
import { motion } from 'motion/react';

interface CategoryNavProps {
  categories: Category[];
  selectedCategory: string;
  onSelectCategory: (id: string) => void;
}

export const CategoryNav: React.FC<CategoryNavProps> = ({
  categories,
  selectedCategory,
  onSelectCategory
}) => {
  const { language } = useLanguage();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollLeft = Math.abs(el.scrollLeft);
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(scrollLeft > 5);
    setCanScrollRight(scrollLeft < maxScroll - 5);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [categories, language]);

  const handleScroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = 260;
    const isRtl = language === 'ar';
    const multiplier = (direction === 'left' ? -1 : 1) * (isRtl ? -1 : 1);
    scrollContainerRef.current.scrollBy({
      left: scrollAmount * multiplier,
      behavior: 'smooth'
    });
  };

  return (
    <div className="relative w-full group/nav">
      {/* Desktop Left Scroll Button */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => handleScroll('left')}
          aria-label="Scroll left"
          className="hidden md:flex absolute start-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/95 backdrop-blur-md shadow-md border border-black/10 items-center justify-center text-slate-800 hover:bg-amber-500 hover:text-white transition-all cursor-pointer"
        >
          {language === 'ar' ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      )}

      {/* Categories Scroll Track */}
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        className="w-full overflow-x-auto no-scrollbar py-2 px-1 scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="flex gap-3 sm:gap-5 min-w-max px-2 md:justify-center items-start">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            const IconComponent = (Icons as any)[cat.icon] || Utensils;

            return (
              <button
                id={`cat-btn-${cat.id}`}
                key={cat.id}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  onSelectCategory(cat.id);
                }}
                className="group flex flex-col items-center justify-center gap-1.5 p-1 transition-all duration-200 transform active:scale-95 cursor-pointer shrink-0 outline-none select-none"
              >
                {/* Circular Image / Icon Container */}
                <div
                  className={`w-13 h-13 sm:w-15 sm:h-15 rounded-full flex items-center justify-center transition-all duration-300 overflow-hidden ${
                    isSelected
                      ? 'ring-3 ring-amber-500 ring-offset-2 ring-offset-white shadow-md scale-105 bg-amber-500 text-slate-950'
                      : 'bg-neutral-100 text-slate-700 border border-black/10 group-hover:bg-amber-50 group-hover:scale-105 group-hover:shadow-xs'
                  }`}
                >
                  {cat.image ? (
                    <img
                      src={cat.image}
                      alt={cat.nameAr}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <IconComponent className={`w-6 h-6 sm:w-7 sm:h-7 transition-transform ${isSelected ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
                  )}
                </div>

                {/* Category Name Beneath the Circle */}
                <span
                  className={`text-[11px] sm:text-xs whitespace-nowrap tracking-tight transition-colors ${
                    isSelected ? 'font-black text-amber-700' : 'font-semibold text-slate-700 group-hover:text-slate-900'
                  }`}
                >
                  {language === 'ar' ? cat.nameAr : cat.name}
                </span>

                {/* Active Selection Indicator */}
                {isSelected ? (
                  <motion.div
                    layoutId="activeCategoryDot"
                    className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 shadow-2xs"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-transparent shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop Right Scroll Button */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => handleScroll('right')}
          aria-label="Scroll right"
          className="hidden md:flex absolute end-0 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/95 backdrop-blur-md shadow-md border border-black/10 items-center justify-center text-slate-800 hover:bg-amber-500 hover:text-white transition-all cursor-pointer"
        >
          {language === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
};
