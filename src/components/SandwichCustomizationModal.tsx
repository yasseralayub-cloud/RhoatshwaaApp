import React, { useState } from 'react';
import { MenuItem, CartItemOption } from '../types';
import { useLanguage } from './LanguageContext';
import { X, Check, Flame, Plus, Minus,Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SandwichCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onConfirm: (item: MenuItem, quantity: number, options: CartItemOption) => void;
}

export const isFriesItem = (item: { name: string; nameAr: string }): boolean => {
  const nameL = item.name.toLowerCase();
  const nameAr = item.nameAr;
  return nameAr.includes('بطاطس') || nameAr.includes('فرايز') || nameL.includes('fries') || nameL.includes('potato');
};

export const isSandwichItem = (item: { name: string; nameAr: string; category: string }): boolean => {
  const nameL = item.name.toLowerCase();
  const nameAr = item.nameAr;
  
  const containsKeywords = 
    nameAr.includes('صاروخ') || 
    nameAr.includes('سندوتش') || 
    nameAr.includes('ساندوتش') || 
    nameAr.includes('ساندوتشات') ||
    nameL.includes('sarookh') || 
    nameL.includes('wrap') || 
    nameL.includes('sandwich') ||
    nameL.includes('shish') ||
    nameL.includes('shawarma');
    
  const isExcluded = 
    nameAr.includes('صحن') || 
    nameAr.includes('بوكس') || 
    nameAr.includes('كيلو') || 
    nameAr.includes('نفر') || 
    nameAr.includes('خلية') || 
    nameAr.includes('كيكة') ||
    nameAr.includes('بسبوسة') ||
    nameAr.includes('سوفليه') ||
    nameAr.includes('سينابون') ||
    isFriesItem(item) ||
    nameL.includes('plate') || 
    nameL.includes('box');
    
  return (containsKeywords || item.category === 'shawarma') && !isExcluded;
};

export const SandwichCustomizationModal: React.FC<SandwichCustomizationModalProps> = ({
  isOpen,
  onClose,
  item,
  onConfirm
}) => {
  const { language, isRtl } = useLanguage();
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [selectedAddons, setSelectedAddons] = useState<{ nameAr: string; nameEn: string; price: number }[]>([]);
  const [quantity, setQuantity] = useState(1);

  if (!isOpen || !item) return null;

  const isShawarma = item.category === 'shawarma' || item.nameAr.includes('شاورما') || item.name.toLowerCase().includes('shawarma');
  const isFries = isFriesItem(item);

  // Smart Prebuilt Notes based on item type with gorgeous emojis
  const smartNotesList = isFries
    ? [
        { ar: 'بهارات', en: 'Spices', displayAr: '🌶️ بهارات مجانية', displayEn: 'Free Spices 🌶️' },
        { ar: 'زيادة ملح', en: 'Extra Salt', displayAr: '🧂 زيادة ملح', displayEn: 'Extra Salt 🧂' },
        { ar: 'ملح خفيف', en: 'Light Salt', displayAr: '🧂 ملح خفيف', displayEn: 'Light Salt 🧂' }
      ]
    : isShawarma 
      ? [
          { ar: 'بدون ثوم', en: 'No Garlic', displayAr: '🧄 بدون ثوم', displayEn: 'No Garlic 🧄' },
          { ar: 'بدون مخلل', en: 'No Pickles', displayAr: '🥒 بدون مخلل', displayEn: 'No Pickles 🥒' },
          { ar: 'بدون بطاطس', en: 'No Fries', displayAr: '🍟 بدون بطاطس داخل السندوتش', displayEn: 'No Fries Inside 🍟' }
        ]
      : [
          { ar: 'مع حمص', en: 'With Hummus', displayAr: '🥣 مع حمص', displayEn: 'With Hummus 🥣' },
          { ar: 'مع متبل', en: 'With Mutabbal', displayAr: '🍆 مع متبل', displayEn: 'With Mutabbal 🍆' },
          { ar: 'بدون بصل وبقدونس', en: 'No Onion & Parsley', displayAr: '🌿 بدون بصل وبقدونس', displayEn: 'No Onion/Parsley 🌿' }
        ];

  // Paid additions (+1 Real) & Free additions
  const additionsList = isFries
    ? [
        { ar: 'زيادة جبنة ذائبة 🧀', en: 'Extra Melted Cheese 🧀', price: 1, isPaid: true },
        { ar: 'ثومية لذيّذة 🧄', en: 'Garlic Dipping Sauce 🧄', price: 0, isPaid: false },
        { ar: 'صلصة كاتشب 🍅', en: 'Ketchup Sauce 🍅', price: 0, isPaid: false }
      ]
    : [
        { ar: 'جبنة لامتناهية 🧀', en: 'Extra Melted Cheese 🧀', price: 1, isPaid: true },
        { ar: 'دبس رمان فاخر 🍯', en: 'Premium Pomegranate Molasses 🍯', price: 1, isPaid: true },
        { ar: 'ثومية إضافية 🧄', en: 'Extra Garlic Sauce 🧄', price: 0, isPaid: false },
        { ar: 'صلصة كاتشب 🍅', en: 'Ketchup Sauce 🍅', price: 0, isPaid: false }
      ];

  const handleToggleNote = (noteAr: string) => {
    // If selecting salt option, let's keep it clean so they don't select 'extra salt' AND 'light salt' at same time
    if (isFries) {
      if (noteAr === 'زيادة ملح' && selectedNotes.includes('ملح خفيف')) {
        setSelectedNotes(prev => prev.filter(n => n !== 'ملح خفيف'));
      }
      if (noteAr === 'ملح خفيف' && selectedNotes.includes('زيادة ملح')) {
        setSelectedNotes(prev => prev.filter(n => n !== 'زيادة ملح'));
      }
    }

    if (selectedNotes.includes(noteAr)) {
      setSelectedNotes(prev => prev.filter(n => n !== noteAr));
    } else {
      setSelectedNotes(prev => [...prev, noteAr]);
    }
  };

  const handleToggleAddon = (addon: { nameAr: string; nameEn: string; price: number }) => {
    const exists = selectedAddons.some(a => a.nameAr === addon.nameAr);
    if (exists) {
      setSelectedAddons(prev => prev.filter(a => a.nameAr !== addon.nameAr));
    } else {
      setSelectedAddons(prev => [...prev, addon]);
    }
  };

  // Compute calculated values
  const addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0);
  const singleItemPrice = item.price + addonsTotal;
  const totalCustomPrice = singleItemPrice * quantity;

  const handleAddClick = () => {
    onConfirm(item, quantity, {
      notes: selectedNotes,
      addons: selectedAddons
    });
    // Reset local state & close
    setSelectedNotes([]);
    setSelectedAddons([]);
    setQuantity(1);
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.6 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-stone-950/80 backdrop-blur-xs cursor-pointer"
        />

        {/* Modal Sheet body */}
        <motion.div
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 28, stiffness: 240 }}
          className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-2xl border border-black/5 flex flex-col relative z-10 max-h-[92vh] sm:max-h-[85vh]"
        >
          {/* Mobile Swipe Handle bar */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-14 h-1.5 bg-white/40 hover:bg-white/60 rounded-full z-30 sm:hidden transition-colors" />

          {/* Header Image Header banner */}
          <div className="relative aspect-[21/9] sm:aspect-video w-full bg-stone-100 shrink-0 select-none">
            <img 
              src={item.image} 
              alt={language === 'ar' ? item.nameAr : item.name} 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-900/45 to-transparent" />
            
            {/* Top Close Button bar overlay */}
            <div className={`absolute top-4 ${isRtl ? 'left-4' : 'right-4'} z-20`}>
              <button
                onClick={onClose}
                className="w-10 h-10 rounded-full bg-black/40 text-white backdrop-blur-md flex items-center justify-center hover:bg-black/60 transition-colors active:scale-95 cursor-pointer border border-white/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Title content details */}
            <div className="absolute bottom-4 left-5 right-5 text-start space-y-1 sm:space-y-1.5 z-10">
              <span className="bg-yellow text-stone-900 font-extrabold text-xs px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md">
                <Flame className="w-4 h-4 text-red-600 animate-pulse" />
                {isFries 
                  ? (language === 'ar' ? 'تخصيص علبة البطاطس' : 'Customize Fries Box') 
                  : (language === 'ar' ? 'تخصيص السندوتش اللذيذ' : 'Customize Sandwich')}
              </span>
              <h3 className="font-extrabold font-serif text-2xl sm:text-3xl text-white leading-tight drop-shadow-sm">
                {language === 'ar' ? item.nameAr : item.name}
              </h3>
              <p className="text-xs sm:text-sm text-stone-200/95 leading-normal font-sans line-clamp-2 md:line-clamp-none drop-shadow-xs">
                {language === 'ar' ? item.descriptionAr : item.description}
              </p>
            </div>
          </div>

          {/* Form Content body - Scroller */}
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:p-6 space-y-6 sm:space-y-7 bg-white">
            
            {/* 1. Smart notes/Quick triggers */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                  <Sparkles className="w-4.5 h-4.5" />
                </div>
                <h4 className="font-extrabold text-sm sm:text-base text-stone-900 text-start">
                  {isFries 
                    ? (language === 'ar' ? 'خيارات مجانية للبطاطس بنقرة واحدة 💡' : 'One-Tap Free Fries Options 💡')
                    : (language === 'ar' ? 'خيارات وملاحظات سريعة ومجانية 💡' : 'Quick Free Prep Choices 💡')}
                </h4>
              </div>
              
              <p className="text-xs sm:text-sm text-stone-500 text-start leading-normal pl-1">
                {language === 'ar' ? 'اختر تفضيلاتك بنقرة واحدة ليتم تسليم طلبك بالشكل المطلوب للمطبخ:' : 'Tap to customize preparation specs in real-time:'}
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {smartNotesList.map((note) => {
                  const label = language === 'ar' ? note.displayAr : note.displayEn;
                  const isSelected = selectedNotes.includes(note.ar);
                  return (
                    <motion.button
                      key={note.ar}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleToggleNote(note.ar)}
                      className={`px-4 py-3 rounded-2xl text-xs sm:text-[13px] font-bold transition-all border flex items-center justify-between text-start cursor-pointer active:scale-95 shadow-xs ${
                        isSelected 
                          ? 'bg-amber-500/10 border-amber-500 text-amber-900 ring-4 ring-amber-500/10 font-extrabold' 
                          : 'bg-stone-50 hover:bg-stone-100 border-black/5 text-stone-700 hover:border-black/10'
                      }`}
                    >
                      <span className="flex-1">{label}</span>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0 ${
                        isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-stone-300 bg-white'
                      }`}>
                        {isSelected ? <Check className="w-3 h-3 stroke-[3]" /> : null}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* 2. Custom Additions / Extras */}
            <div className="space-y-3.5 pt-1">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🧑‍🍳</span>
                  <h4 className="font-extrabold text-sm sm:text-base text-stone-900">
                    {language === 'ar' ? 'إضافات وصوصات مميزة' : 'Sauces & Extra Addons'}
                  </h4>
                </div>
                <span className="text-[11px] sm:text-xs text-stone-500 font-bold whitespace-nowrap bg-stone-100 px-2.5 py-1 rounded-full border border-black/5">
                  {language === 'ar' ? 'إضافات الجبن بـ 1 ريال فقط' : 'Premium cheese toppings are just 1 SAR'}
                </span>
              </div>
              
              <div className="divide-y divide-black/5 border border-black/5 rounded-2xl sm:rounded-3xl overflow-hidden bg-stone-50 px-4 sm:px-5">
                {additionsList.map((addon) => {
                  const addonName = language === 'ar' ? addon.ar : addon.en;
                  const addonValue = { nameAr: addon.ar, nameEn: addon.en, price: addon.price };
                  const isSelected = selectedAddons.some(a => a.nameAr === addon.ar);
                  
                  return (
                    <motion.div 
                      key={addon.ar}
                      whileTap={{ backgroundColor: 'rgba(0,0,0,0.03)' }}
                      onClick={() => handleToggleAddon(addonValue)}
                      className="flex items-center justify-between py-3.5 sm:py-4 cursor-pointer hover:bg-black/[0.01] transition-all select-none group"
                    >
                      <div className="flex items-center gap-3.5 sm:gap-4">
                        <div className={`w-5.5 h-5.5 sm:w-6 sm:h-6 rounded-lg border flex items-center justify-center transition-all ${
                          isSelected 
                            ? 'bg-yellow border-yellow text-stone-900' 
                            : 'border-stone-300 bg-white group-hover:border-stone-400'
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 text-stone-900 stroke-[3]" />}
                        </div>
                        <span className="text-xs sm:text-[15px] font-bold text-stone-800 text-start">{addonName}</span>
                      </div>
                      <span className={`text-xs sm:text-[15px] font-extrabold ${isSelected ? 'text-yellow-700' : 'text-stone-500'}`}>
                        {addon.price > 0 
                          ? `+${addon.price}.0 ${language === 'ar' ? 'ريال' : 'SAR'}` 
                          : (language === 'ar' ? 'مجاني' : 'Free')}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer Quantity + Sum button */}
          <div className="p-4 sm:p-6 pb-6 sm:pb-6 border-t border-black/5 bg-stone-50/85 backdrop-blur-md flex items-center justify-between gap-3 sm:gap-4 shrink-0 select-none">
            {/* Quantity Controller */}
            <div className="flex items-center gap-2 sm:gap-3 bg-white border border-black/5 rounded-xl sm:rounded-2xl p-0.5 sm:p-1 shadow-xs shrink-0">
              <button
                disabled={quantity <= 1}
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-stone-50 hover:bg-stone-100 flex items-center justify-center transition-all active:scale-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border border-black/5"
              >
                <Minus className="w-3.5 h-3.5 text-stone-600" />
              </button>
              <span className="font-extrabold text-sm sm:text-base w-5 sm:w-6 text-center text-stone-850 font-mono">{quantity}</span>
              <button
                onClick={() => setQuantity(q => q + 1)}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-yellow hover:bg-yellow/90 flex items-center justify-center transition-all active:scale-90 cursor-pointer border border-black/5"
              >
                <Plus className="w-3.5 h-3.5 text-stone-900" />
              </button>
            </div>

            {/* Sum Add button */}
            <button
              onClick={handleAddClick}
              className="flex-1 bg-yellow hover:bg-yellow/90 text-stone-900 font-extrabold text-xs sm:text-base py-3 sm:py-3.5 px-4 sm:px-6 rounded-xl sm:rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-between cursor-pointer border border-black/5 group"
            >
              <span>{language === 'ar' ? 'إضافة للطلب' : 'Add to Order'}</span>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="h-4 w-px bg-stone-900/15" />
                <span className="text-sm sm:text-base font-black tracking-tight self-center font-mono">
                  {totalCustomPrice.toFixed(1)} {language === 'ar' ? 'ريال' : 'SAR'}
                </span>
              </div>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
