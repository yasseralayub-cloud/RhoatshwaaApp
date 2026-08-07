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
    <div className="w-full overflow-x-auto no-scrollbar py-1 px-1" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-2 min-w-max px-1 md:justify-center items-center">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          
          // Dynamically fetch Lucide Icon matching the string name
          const IconComponent = (Icons as any)[cat.icon] || Icons.Utensils;

          return (
            <button
              id={`cat-btn-${cat.id}`}
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border transition-all duration-200 transform active:scale-95 cursor-pointer ${
                isSelected
                  ? 'bg-yellow text-black border-yellow shadow-sm font-bold scale-[1.02]'
                  : 'bg-neutral-100/80 text-dark/70 border-black/5 hover:bg-neutral-200/80 hover:text-dark'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-colors ${
                  isSelected ? 'bg-black/10 text-dark' : 'bg-black/5 text-dark/50'
                }`}
              >
                <IconComponent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <span className="font-bold text-xs sm:text-sm whitespace-nowrap">
                {language === 'ar' ? cat.nameAr : cat.name}
              </span>
              
              {isSelected && (
                <motion.div
                  layoutId="activeCategoryDot"
                  className="w-1.5 h-1.5 rounded-full bg-black/80 shrink-0"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

