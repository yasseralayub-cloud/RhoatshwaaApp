import React from 'react';
import * as Icons from 'lucide-react';
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

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-1.5 px-1" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-2 sm:gap-4 min-w-max px-1 md:justify-center items-start">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          
          // Dynamically fetch Lucide Icon matching the string name
          const IconComponent = (Icons as any)[cat.icon] || Icons.Utensils;

          return (
            <button
              id={`cat-btn-${cat.id}`}
              key={cat.id}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onSelectCategory(cat.id);
              }}
              className="group flex flex-col items-center justify-center gap-1.5 p-1 rounded-2xl transition-all duration-200 transform active:scale-95 cursor-pointer shrink-0 outline-none focus:outline-none"
            >
              {/* Circular Icon Container */}
              <div
                className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
                  isSelected
                    ? 'bg-yellow text-black ring-2 ring-yellow ring-offset-2 ring-offset-white shadow-md scale-105'
                    : 'bg-neutral-100 text-dark/70 border border-black/5 group-hover:bg-neutral-200/90 group-hover:text-dark group-hover:scale-105 group-hover:shadow-2xs'
                }`}
              >
                <IconComponent className={`w-5 h-5 sm:w-6 sm:h-6 transition-transform ${isSelected ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
              </div>

              {/* Category Name Beneath the Circle */}
              <span
                className={`text-[11px] sm:text-xs whitespace-nowrap tracking-tight transition-colors ${
                  isSelected ? 'font-black text-dark' : 'font-semibold text-dark/70 group-hover:text-dark'
                }`}
              >
                {language === 'ar' ? cat.nameAr : cat.name}
              </span>
              
              {/* Active Selection Indicator */}
              {isSelected ? (
                <motion.div
                  layoutId="activeCategoryDot"
                  className="w-1.5 h-1.5 rounded-full bg-yellow shrink-0 shadow-2xs"
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-transparent shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};


