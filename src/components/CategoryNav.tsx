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
    <div className="w-full overflow-x-auto no-scrollbar py-4 px-2" style={{ scrollbarWidth: 'none' }}>
      <div className="flex gap-3 min-w-max px-2 md:justify-center">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          
          // Dynamically fetch Lucide Icon matching the string name
          const IconComponent = (Icons as any)[cat.icon] || Icons.Utensils;

          return (
            <button
              id={`cat-btn-${cat.id}`}
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-2xl border transition-all duration-300 transform active:scale-95 cursor-pointer ${
                isSelected
                  ? 'bg-yellow text-black border-yellow shadow-md shadow-yellow/15 font-bold'
                  : 'bg-neutral-50 text-dark/60 border-black/5 hover:bg-neutral-100 hover:text-dark'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition-all duration-300 ${
                  isSelected ? 'bg-black/10 text-dark' : 'bg-black/5 text-dark/40'
                }`}
              >
                <IconComponent className="w-5 h-5" />
              </div>
              <span className="font-semibold text-sm md:text-base">
                {language === 'ar' ? cat.nameAr : cat.name}
              </span>
              
              {isSelected && (
                <motion.div
                  layoutId="activeCategoryDot"
                  className="w-1.5 h-1.5 rounded-full bg-black/80"
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
