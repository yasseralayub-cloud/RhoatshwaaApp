import React, { useState } from 'react';
import { MenuItem, CartItemOption } from '../types';
import { useLanguage } from './LanguageContext';
import { X, Check, Flame, Plus, Minus, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SizeUpgradeOption {
  id: string;
  labelAr: string;
  labelEn: string;
  price: number;
  diff: number;
}

const SIZE_UPGRADES_BY_ITEM: Record<string, SizeUpgradeOption[]> = {
  s2: [ // شاورما صغير
    { id: 's2', labelAr: 'صغير', labelEn: 'Small', price: 5, diff: 0 },
    { id: 's1', labelAr: 'صاروخ', labelEn: 'Sarookh', price: 9, diff: 4 }
  ],
  s4: [ // صحن عربي وسط
    { id: 's4', labelAr: 'صحن عربي وسط 🍽️', labelEn: 'Medium Arabic Plate 🍽️', price: 15, diff: 0 },
    { id: 's5', labelAr: 'صحن عربي كبير عائلي 🎉', labelEn: 'Large Arabic Plate Family 🎉', price: 20, diff: 5 }
  ],
  g1: [ // كباب لحم نفر
    { id: 'g1', labelAr: 'نفر كباب لحم (4 أسياخ) 🍢', labelEn: 'Beef Portion (4 Skewers) 🍢', price: 25, diff: 0 },
    { id: 'g1_half', labelAr: 'نصف كيلو كباب لحم (8 أسياخ) 🥩', labelEn: 'Half Kilo Beef Kabab (8 Skewers) 🥩', price: 50, diff: 25 },
    { id: 'g2', labelAr: 'كيلو كامل كباب (16 سيخ) 🥩', labelEn: 'Kilo Beef Kabab (16 Skewers) 🥩', price: 95, diff: 70 },
    { id: 'g6', labelAr: 'ساندوتش صاروخ كباب لحم 🌯', labelEn: 'Sarookh Kabab Wrap 🌯', price: 12, diff: -13 }
  ],
  g5: [ // كباب دجاج نفر
    { id: 'g5', labelAr: 'نفر كباب دجاج (4 أسياخ) 🍢', labelEn: 'Chicken Portion (4 Skewers) 🍢', price: 23, diff: 0 },
    { id: 'g5_half', labelAr: 'نصف كيلو كباب دجاج (8 أسياخ) 🍗', labelEn: 'Half Kilo Chicken Kabab (8 Skewers) 🍗', price: 42, diff: 19 },
    { id: 'g8', labelAr: 'كيلو كامل كباب دجاج (16 سيخ) 🍗', labelEn: 'Kilo Chicken Kabab (16 Skewers) 🍗', price: 80, diff: 57 },
    { id: 'g12', labelAr: 'ساندوتش صاروخ كباب دجاج 🌯', labelEn: 'Sarookh Chicken Wrap 🌯', price: 10, diff: -13 }
  ],
  g7: [ // شيش طاووق نفر
    { id: 'g7', labelAr: 'نفر شيش طاووق (4 أسياخ) 🍢', labelEn: 'Shish Portion (4 Skewers) 🍢', price: 22, diff: 0 },
    { id: 'g7_half', labelAr: 'نصف كيلو شيش طاووق (8 أسياخ) 🍢', labelEn: 'Half Kilo Shish (8 Skewers) 🍢', price: 45, diff: 23 },
    { id: 'g9', labelAr: 'كيلو كامل شيش (16 سيخ) 🍢', labelEn: 'Kilo Shish (16 Skewers) 🍢', price: 85, diff: 63 },
    { id: 'g13', labelAr: 'ساندوتش صاروخ شيش طاووق 🌯', labelEn: 'Sarookh Shish Wrap 🌯', price: 10, diff: -12 }
  ],
  g10: [ // اوصال لحم نفر
    { id: 'g10', labelAr: 'نفر أوصال لحم (4 أسياخ) 🍢', labelEn: 'Awsal Portion (4 Skewers) 🍢', price: 35, diff: 0 },
    { id: 'g10_half', labelAr: 'نصف كيلو أوصال لحم (8 أسياخ) 🥩', labelEn: 'Half Kilo Awsal (8 Skewers) 🥩', price: 75, diff: 40 },
    { id: 'g4', labelAr: 'كيلو كامل أوصال لحم (16 سيخ) 🥩', labelEn: 'Kilo Awsal (16 Skewers) 🥩', price: 140, diff: 105 },
    { id: 'g11', labelAr: 'ساندوتش صاروخ أوصال لحم 🌯', labelEn: 'Sarookh Awsal Wrap 🌯', price: 18, diff: -17 }
  ]
};

interface SandwichCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onConfirm: (item: MenuItem, quantity: number, options: CartItemOption) => void;
  menuItems?: MenuItem[];
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
  onConfirm,
  menuItems = []
}) => {
  const { language, isRtl } = useLanguage();
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [addonQuantities, setAddonQuantities] = useState<Record<string, number>>({});
  const [selectedDrink, setSelectedDrink] = useState<{ id: string; nameAr: string; nameEn: string; price: number } | null>(null);
  const [quantity, setQuantity] = useState(1);

  // Portion customization states
  const [lastItemId, setLastItemId] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<SizeUpgradeOption | null>(null);
  const [sodaQuantities, setSodaQuantities] = useState<Record<string, number>>({});

  // Reset local state when item changes
  if (item && lastItemId !== item.id) {
    setLastItemId(item.id);
    const itemSizes = SIZE_UPGRADES_BY_ITEM[item.id] || [];
    setSelectedSize(itemSizes.length > 0 ? itemSizes[0] : null);
    setSodaQuantities({});
    setSelectedNotes([]);
    setAddonQuantities({});
    setSelectedDrink(null);
    setQuantity(1);
  }

  if (!isOpen || !item) return null;

  const isSodasGroup = item.id === 'drinks-soft-group';
  const isShawarma = item.category === 'shawarma' || item.nameAr.includes('شاورما') || item.name.toLowerCase().includes('shawarma');
  const isFries = isFriesItem(item);

  // Special check for BBQ Shawarma Meal (وجبة رحلة شواء)
  const isBbqMeal = item.id === 's3' || item.nameAr.includes('شاورما شواء وجبة') || item.nameAr.includes('وجبة رحلة شواء') || item.name === 'BBQ Shawarma Meal';

  // Sizing choices for this item
  const availableSizes = SIZE_UPGRADES_BY_ITEM[item.id] || [];

  // Smart Prebuilt Notes based on item type
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
          { ar: 'مع متبل', en: 'With Mutabbal', displayAr: '🫕 مع متبل', displayEn: 'With Mutabbal 🫕' },
          { ar: 'بدون بصل وبقدونس', en: 'No Onion & Parsley', displayAr: '🌿 بدون بصل وبقدونس', displayEn: 'No Onion/Parsley 🌿' }
        ];

  // Dynamic Sauces from 'sauces' category in menuItems + Extra toppings
  const sauceCategoryItems = menuItems.filter(mi => mi.category === 'sauces' && mi.isAvailable !== false);
  
  // Default sauces if category empty
  const defaultSauceList = [
    { id: 'sauce1', nameAr: 'ثومية سبيشال طازجة 🧄', nameEn: 'Special Garlic Dip 🧄', price: 3 },
    { id: 'sauce2', nameAr: 'ثومية حارة بالسبايسي 🌶️', nameEn: 'Spicy Garlic Dip 🌶️', price: 3 },
    { id: 'sauce3', nameAr: 'صوص الجبنة الذائبة 🧀', nameEn: 'Melted Cheese Sauce 🧀', price: 4 },
    { id: 'sauce4', nameAr: 'صوص شواء الخاص 🍖', nameEn: 'Signature BBQ Sauce 🍖', price: 3 },
    { id: 'sauce5', nameAr: 'صوص الطحينة الفاخرة 🥣', nameEn: 'Premium Tahini Dip 🥣', price: 2 },
    { id: 'sauce6', nameAr: 'صوص دبس الرمان 🍯', nameEn: 'Pomegranate Molasses 🍯', price: 3 },
  ];

  const availableSauces = sauceCategoryItems.length > 0 
    ? sauceCategoryItems.map(s => ({
        id: s.id,
        nameAr: s.nameAr,
        nameEn: s.name,
        price: s.price,
        image: s.image
      }))
    : defaultSauceList;

  // Additional toppings
  const extraToppingsList = [
    { id: 'top_cheese', nameAr: 'إضافة جبن شيدر ذائب 🧀', nameEn: 'Extra Melted Cheddar 🧀', price: 2 },
    { id: 'top_garlic', nameAr: 'علبة ثومية إضافية 🧄', nameEn: 'Extra Garlic Tub 🧄', price: 2 },
    { id: 'top_ketchup', nameAr: 'صلصة كاتشب 🍅', nameEn: 'Ketchup Portion 🍅', price: 0 },
    { id: 'top_molasses', nameAr: 'رشة دبس رمان فاخر 🍯', nameEn: 'Pomegranate Molasses 🍯', price: 1 }
  ];

  const handleToggleNote = (noteAr: string) => {
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

  const handleUpdateAddonQuantity = (id: string, delta: number) => {
    setAddonQuantities(prev => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  // Compute calculated values
  const drinkPrice = (selectedDrink && !isBbqMeal) ? selectedDrink.price : 0;
  
  // Sizing upgrade difference
  const sizeDiff = selectedSize ? selectedSize.diff : 0;
  
  // Soft drinks sum for group
  let sodasTotal = 0;
  if (isSodasGroup) {
    sodasTotal = Object.entries(sodaQuantities).reduce((sum: number, [sodaId, qty]: [string, number]) => {
      const match = menuItems.find(m => m.id === sodaId);
      const pr = match ? match.price : 2.5;
      return sum + (qty * pr);
    }, 0);
  }

  // Calculate sum of selected sauces & additions
  const saucesAndAddonsSum = [...availableSauces, ...extraToppingsList].reduce((sum, item) => {
    const qty = addonQuantities[item.id] || 0;
    return sum + (qty * item.price);
  }, 0);

  const addonsTotal = saucesAndAddonsSum + drinkPrice + sizeDiff + sodasTotal;
  const baseItemPrice = isSodasGroup ? 0 : item.price;
  const singleItemPrice = baseItemPrice + addonsTotal;
  const totalCustomPrice = singleItemPrice * (isSodasGroup ? 1 : quantity);

  // Check if at least one soda is selected for group drinks to allow adding to order
  const totalSodaCount = Object.values(sodaQuantities).reduce((sum: number, val: number) => sum + val, 0);
  const isAddButtonDisabled = isSodasGroup && totalSodaCount === 0;

  const handleAddClick = () => {
    if (isAddButtonDisabled) return;

    const sodasFromMenu = menuItems.filter(mi => mi.category === 'drinks' && mi.id !== 'drinks-soft-group' && mi.id !== 'dr7' && mi.id !== 'dr8');
    const selectedSoftDrinks = isSodasGroup
      ? sodasFromMenu
          .filter(s => (sodaQuantities[s.id] || 0) > 0)
          .map(s => ({
            id: s.id,
            nameAr: s.nameAr,
            nameEn: s.name,
            price: s.price,
            quantity: sodaQuantities[s.id] || 0
          }))
      : undefined;

    // Convert addonQuantities map to array
    const compiledAddons: { nameAr: string; nameEn: string; price: number; quantity: number }[] = [];
    [...availableSauces, ...extraToppingsList].forEach(add => {
      const qty = addonQuantities[add.id] || 0;
      if (qty > 0) {
        compiledAddons.push({
          nameAr: add.nameAr,
          nameEn: add.nameEn,
          price: add.price,
          quantity: qty
        });
      }
    });

    onConfirm(item, isSodasGroup ? 1 : quantity, {
      notes: selectedNotes,
      addons: compiledAddons,
      selectedDrink: selectedDrink ? { ...selectedDrink, price: isBbqMeal ? 0 : selectedDrink.price } : undefined,
      selectedSize: selectedSize || undefined,
      selectedSoftDrinks: selectedSoftDrinks
    });
    
    // Reset local state & close
    setSelectedNotes([]);
    setAddonQuantities({});
    setSelectedDrink(null);
    setSelectedSize(null);
    setSodaQuantities({});
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

          {/* Clean Top Header Bar (No Image background to prevent customer distraction) */}
          <div className="relative bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white p-5 sm:p-6 shrink-0 border-b border-black/10 select-none">
            <div className="flex items-start justify-between gap-3 pr-2">
              <div className="space-y-1.5 text-start flex-1">
                <span className="bg-yellow text-stone-900 font-extrabold text-xs px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5 shadow-md">
                  <Flame className="w-3.5 h-3.5 text-red-600 animate-pulse" />
                  {isSodasGroup
                    ? (language === 'ar' ? 'تشكيلة المشروبات الغازية' : 'Soft Drinks Bundle')
                    : isFries 
                    ? (language === 'ar' ? 'تخصيص علبة البطاطس' : 'Customize Fries Box') 
                    : (language === 'ar' ? 'تخصيص الوجبة والإضافات' : 'Customize Item & Options')}
                </span>
                <h3 className="font-extrabold font-serif text-2xl sm:text-3xl text-white leading-tight">
                  {language === 'ar' ? item.nameAr : item.name}
                </h3>
                <p className="text-xs sm:text-sm text-stone-300 leading-normal font-sans line-clamp-2">
                  {language === 'ar' ? item.descriptionAr : item.description}
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors active:scale-95 cursor-pointer border border-white/15 shrink-0 mt-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form Content body - Scroller */}
          <div className="flex-1 overflow-y-auto px-5 py-5 sm:p-6 space-y-6 sm:space-y-7 bg-white">
            
            {isSodasGroup ? (
              /* Soft Drinks Group Multi-Builder */
              <div className="space-y-4 text-start">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                    <span className="text-lg">🥤</span>
                  </div>
                  <h4 className="font-extrabold text-sm sm:text-base text-stone-900">
                    {language === 'ar' ? 'تشكيلة المشروبات الغازية' : 'Soft Drinks Selection'}
                  </h4>
                </div>
                <p className="text-xs sm:text-sm text-stone-500 leading-relaxed">
                  {language === 'ar' 
                    ? 'بإمكانك إضافة أي عدد من المشروبات الغازية وتشكيلها حسب رغبتك. قيمة المشروب الواحد 2.5 ريال فقط.' 
                    : 'Feel free to add any combination of carbonated soft drinks. Price is only 2.5 SAR per unit.'}
                </p>

                <div className="space-y-3 bg-stone-50 border border-black/5 rounded-3xl p-4 sm:p-5">
                  {menuItems
                    .filter(mi => mi.category === 'drinks' && mi.id !== 'drinks-soft-group' && mi.id !== 'dr7' && mi.id !== 'dr8')
                    .map((soda) => {
                      const qty = sodaQuantities[soda.id] || 0;
                      const name = language === 'ar' ? soda.nameAr : soda.name;
                      const isAvailable = soda.isAvailable !== false;
                      
                      return (
                        <div key={soda.id} className="flex items-center justify-between py-2.5 border-b border-black/5 last:border-b-0">
                          <div className="flex items-center gap-3">
                            <img 
                              src={soda.image} 
                              alt={name} 
                              className="w-12 h-12 rounded-xl object-cover border border-black/5 bg-white shadow-xs shrink-0"
                              referrerPolicy="no-referrer"
                            />
                            <div className="text-start">
                              <span className="font-extrabold text-sm text-stone-850 block">{name}</span>
                              <span className="text-xs text-stone-500 font-mono">2.5 {language === 'ar' ? 'ريال' : 'SAR'}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 bg-white border border-black/5 rounded-xl p-0.5 shadow-sm">
                            <button
                              disabled={qty <= 0 || !isAvailable}
                              onClick={() => setSodaQuantities(prev => ({
                                ...prev,
                                [soda.id]: Math.max(0, qty - 1)
                              }))}
                              className="w-8 h-8 rounded-lg bg-stone-50 hover:bg-stone-100 flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 border border-black/5 cursor-pointer"
                            >
                              <Minus className="w-3 h-3 text-stone-600" />
                            </button>
                            <span className="font-extrabold text-xs w-6 text-center text-stone-800 font-mono">{qty}</span>
                            <button
                              disabled={!isAvailable}
                              onClick={() => setSodaQuantities(prev => ({
                                ...prev,
                                [soda.id]: qty + 1
                              }))}
                              className="w-8 h-8 rounded-lg bg-yellow hover:bg-yellow/95 flex items-center justify-center transition-all active:scale-90 disabled:opacity-30 border border-black/5 cursor-pointer"
                            >
                              <Plus className="w-3 h-3 text-stone-900" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            ) : (
              /* Standard customizers */
              <>
                {/* 0. Portion / Size Selection Option */}
                {availableSizes.length > 0 && (
                  <div className="space-y-3.5 text-start">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-yellow/10 text-yellow-700">
                        <span className="text-sm font-extrabold">📏</span>
                      </div>
                      <h4 className="font-extrabold text-sm sm:text-base text-stone-900">
                        {language === 'ar' ? 'الحجم والمقدار' : 'Portion & Size'}
                      </h4>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2.5 pt-1">
                      {availableSizes.map((sizeOpt) => {
                        const label = language === 'ar' ? sizeOpt.labelAr : sizeOpt.labelEn;
                        const isSelected = selectedSize?.id === sizeOpt.id;
                        return (
                          <motion.button
                            key={sizeOpt.id}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setSelectedSize(sizeOpt)}
                            className={`px-4 py-3.5 rounded-2xl text-xs sm:text-[14px] font-bold transition-all border flex items-center justify-between text-start cursor-pointer active:scale-95 shadow-xs ${
                              isSelected 
                                ? 'bg-yellow/15 border-yellow text-stone-950 ring-4 ring-yellow/10 font-black' 
                                : 'bg-stone-50 hover:bg-stone-100 border-black/5 text-stone-700 hover:border-black/10'
                            }`}
                          >
                            <div className="flex flex-col text-start">
                              <span className="font-extrabold">{label}</span>
                              <span className="text-[10px] sm:text-xs text-stone-500 font-mono mt-0.5">
                                {sizeOpt.price} {language === 'ar' ? 'ريال سعودي' : 'SAR'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2.5">
                              {sizeOpt.diff !== 0 && (
                                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${
                                  sizeOpt.diff > 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                                }`}>
                                  {sizeOpt.diff > 0 ? `+${sizeOpt.diff}` : `${sizeOpt.diff}`} {language === 'ar' ? 'ريال' : 'SAR'}
                                </span>
                              )}
                              <div className={`w-5.5 h-5.5 rounded-full border flex items-center justify-center transition-all shrink-0 ${
                                isSelected ? 'bg-yellow border-yellow text-stone-900' : 'border-stone-300 bg-white'
                              }`}>
                                {isSelected ? <Check className="w-3.5 h-3.5 stroke-[3] text-stone-900" /> : null}
                              </div>
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 1. Smart notes/Quick triggers */}
                <div className="space-y-3.5 text-start">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600">
                      <Plus className="w-4.5 h-4.5" />
                    </div>
                    <h4 className="font-extrabold text-sm sm:text-base text-stone-900">
                      {language === 'ar' ? 'خيارات مجانية وملاحظات' : 'Free Preferences'}
                    </h4>
                  </div>
                  
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
                              ? 'bg-amber-500/10 border-amber-500 text-amber-950 ring-4 ring-amber-500/10 font-extrabold' 
                              : 'bg-stone-50 hover:bg-stone-100 border-black/5 text-stone-700 hover:border-black/10'
                          }`}
                        >
                          <span className="flex-1 text-start">{label}</span>
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

                {/* 2. Sauces & Extra Addons with Individual Quantity Controls */}
                <div className="space-y-3.5 pt-1 text-start">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      <h4 className="font-extrabold text-sm sm:text-base text-stone-900">
                        {language === 'ar' ? 'قسم الصوصات والإضافات المميزة' : 'Sauces & Premium Addons'}
                      </h4>
                    </div>
                    <span className="text-[11px] sm:text-xs text-stone-500 font-bold whitespace-nowrap bg-stone-100 px-2.5 py-1 rounded-full border border-black/5">
                      {language === 'ar' ? 'حدد العدد المطلوب لجميع الصوصات' : 'Select quantity for sauces'}
                    </span>
                  </div>

                  <p className="text-xs text-stone-500 leading-relaxed">
                    {language === 'ar' 
                      ? 'يمكنك اختيار أي عدد ترغبه من الصوصات والإضافات وسيتم احتساب الإجمالي مباشرة:' 
                      : 'Choose any quantity of sauces & extras. Extra price is calculated instantly:'}
                  </p>
                  
                  <div className="space-y-2.5 pt-1">
                    {/* Section A: All Available Sauces */}
                    <div className="text-xs font-extrabold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200/60 flex items-center gap-1.5">
                      <span>✨ {language === 'ar' ? 'جميع الصوصات المتاحة:' : 'Available Sauces:'}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {availableSauces.map((sauce) => {
                        const qty = addonQuantities[sauce.id] || 0;
                        const sauceName = language === 'ar' ? sauce.nameAr : sauce.nameEn;
                        
                        return (
                          <div
                            key={sauce.id}
                            className={`p-3 rounded-2xl border transition-all flex items-center justify-between text-start ${
                              qty > 0 
                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-xs' 
                                : 'bg-stone-50 hover:bg-stone-100/80 border-black/5'
                            }`}
                          >
                            <div className="flex items-center gap-3 pr-1">
                              {sauce.image ? (
                                <img 
                                  src={sauce.image} 
                                  alt={sauceName} 
                                  className="w-10 h-10 rounded-xl object-cover border border-black/5 bg-white shadow-xs shrink-0" 
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-lg shrink-0">
                                  🥣
                                </div>
                              )}
                              <div className="text-start">
                                <span className="font-extrabold text-xs sm:text-sm text-stone-900 block">{sauceName}</span>
                                <span className="text-[11px] font-bold text-amber-700 font-mono">
                                  +{sauce.price.toFixed(1)} {language === 'ar' ? 'ريال' : 'SAR'}
                                </span>
                              </div>
                            </div>

                            {/* Quantity Controls */}
                            <div className="flex items-center gap-1.5 bg-white border border-black/10 rounded-xl p-1 shadow-xs">
                              {qty > 0 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateAddonQuantity(sauce.id, -1)}
                                    className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center active:scale-90 transition cursor-pointer text-stone-700 font-extrabold"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-6 text-center font-extrabold text-xs font-mono text-stone-900">{qty}</span>
                                </>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => handleUpdateAddonQuantity(sauce.id, 1)}
                                className={`h-7 px-2.5 rounded-lg flex items-center justify-center gap-1 font-bold text-xs transition cursor-pointer active:scale-90 ${
                                  qty > 0 
                                    ? 'bg-amber-500 text-white hover:bg-amber-600' 
                                    : 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                                }`}
                              >
                                <Plus className="w-3 h-3" />
                                {qty === 0 && <span>{language === 'ar' ? 'إضافة' : 'Add'}</span>}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Section B: Additional Toppings */}
                    <div className="text-xs font-extrabold text-stone-800 bg-stone-100 px-3 py-1.5 rounded-xl border border-black/5 flex items-center gap-1.5 mt-3">
                      <span>🧀 {language === 'ar' ? 'إضافات طعام أخرى:' : 'Extra Toppings:'}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2.5">
                      {extraToppingsList.map((top) => {
                        const qty = addonQuantities[top.id] || 0;
                        const topName = language === 'ar' ? top.nameAr : top.nameEn;
                        
                        return (
                          <div
                            key={top.id}
                            className={`p-3 rounded-2xl border transition-all flex items-center justify-between text-start ${
                              qty > 0 
                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-xs' 
                                : 'bg-stone-50 hover:bg-stone-100/80 border-black/5'
                            }`}
                          >
                            <div className="text-start pr-1">
                              <span className="font-extrabold text-xs sm:text-sm text-stone-900 block">{topName}</span>
                              <span className="text-[11px] font-bold text-amber-700 font-mono">
                                {top.price > 0 ? `+${top.price.toFixed(1)} ${language === 'ar' ? 'ريال' : 'SAR'}` : (language === 'ar' ? 'مجاني' : 'Free')}
                              </span>
                            </div>

                            {/* Quantity Controls */}
                            <div className="flex items-center gap-1.5 bg-white border border-black/10 rounded-xl p-1 shadow-xs">
                              {qty > 0 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateAddonQuantity(top.id, -1)}
                                    className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center active:scale-90 transition cursor-pointer text-stone-700 font-extrabold"
                                  >
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="w-6 text-center font-extrabold text-xs font-mono text-stone-900">{qty}</span>
                                </>
                              ) : null}

                              <button
                                type="button"
                                onClick={() => handleUpdateAddonQuantity(top.id, 1)}
                                className={`h-7 px-2.5 rounded-lg flex items-center justify-center gap-1 font-bold text-xs transition cursor-pointer active:scale-90 ${
                                  qty > 0 
                                    ? 'bg-amber-500 text-white hover:bg-amber-600' 
                                    : 'bg-stone-200 hover:bg-stone-300 text-stone-800'
                                }`}
                              >
                                <Plus className="w-3 h-3" />
                                {qty === 0 && <span>{language === 'ar' ? 'إضافة' : 'Add'}</span>}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 3. Soft Drink Selection */}
                {menuItems && menuItems.length > 0 && (
                  <div className="space-y-3.5 pt-1 text-start">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🥤</span>
                        <h4 className="font-extrabold text-sm sm:text-base text-stone-900">
                          {language === 'ar' ? 'اختر المشروب الغازي المصاحب' : 'Select Accompanying Soft Drink'}
                        </h4>
                      </div>
                      <span className="text-[11px] sm:text-xs text-stone-500 font-bold whitespace-nowrap bg-stone-100 px-2.5 py-1 rounded-full border border-black/5">
                        {isBbqMeal 
                          ? (language === 'ar' ? 'مشروب مجاني مع الوجبة 🎁' : 'Free Drink with Meal 🎁')
                          : (language === 'ar' ? 'اختياري' : 'Optional')}
                      </span>
                    </div>

                    {isBbqMeal ? (
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-emerald-800 font-extrabold text-xs sm:text-sm">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          {language === 'ar' 
                            ? 'وجبة رحلة شواء تتضمن مشروب غازي واحد مجاناً مع الوجبة!' 
                            : 'BBQ Shawarma Meal includes 1 free soft drink with your order!'}
                        </span>
                      </div>
                    ) : null}
                    
                    <p className="text-xs sm:text-sm text-stone-500 text-start leading-normal pl-1">
                      {language === 'ar' ? 'اختر مشروبك المفضل مع الوجبة:' : 'Select your favorite soft drink:'}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {/* Option for No Drink */}
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setSelectedDrink(null)}
                        className={`px-4 py-3 rounded-2xl text-xs sm:text-[13px] font-bold transition-all border flex items-center justify-between text-start cursor-pointer active:scale-95 shadow-xs ${
                          selectedDrink === null
                            ? 'bg-amber-500/10 border-amber-500 text-amber-950 ring-4 ring-amber-500/10 font-extrabold'
                            : 'bg-stone-50 hover:bg-stone-100 border-black/5 text-stone-700 hover:border-black/10'
                        }`}
                      >
                        <span className="flex-1 text-start">{language === 'ar' ? '❌ بدون مشروب' : '❌ No Drink'}</span>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all shrink-0 ${
                          selectedDrink === null ? 'bg-amber-500 border-amber-500 text-white' : 'border-stone-300 bg-white'
                        }`}>
                          {selectedDrink === null ? <Check className="w-3 h-3 stroke-[3]" /> : null}
                        </div>
                      </motion.button>

                      {/* Dynamic Drinks from menuItems */}
                      {menuItems
                        .filter(mi => mi.category === 'drinks' && mi.id !== 'drinks-soft-group' && mi.id !== 'dr7' && mi.id !== 'dr8')
                        .map((drink) => {
                          const drinkLabel = language === 'ar' ? drink.nameAr : drink.name;
                          const isSelected = selectedDrink?.id === drink.id;
                          const isDrinkAvailable = drink.isAvailable !== false;

                          return (
                            <motion.button
                              key={drink.id}
                              disabled={!isDrinkAvailable}
                              whileTap={isDrinkAvailable ? { scale: 0.97 } : undefined}
                              onClick={() => {
                                if (isDrinkAvailable) {
                                  setSelectedDrink({
                                    id: drink.id,
                                    nameAr: drink.nameAr,
                                    nameEn: drink.name,
                                    price: drink.price
                                  });
                                }
                              }}
                              className={`px-4 py-3 rounded-2xl text-xs sm:text-[13px] font-bold transition-all border flex items-center justify-between text-start shadow-xs relative ${
                                !isDrinkAvailable
                                  ? 'bg-stone-100 border-stone-200 text-stone-400 opacity-65 cursor-not-allowed'
                                  : isSelected
                                  ? 'bg-amber-500/10 border-amber-500 text-amber-950 ring-4 ring-amber-500/10 font-extrabold cursor-pointer active:scale-95'
                                  : 'bg-stone-50 hover:bg-stone-100 border-black/5 text-stone-700 hover:border-black/10 cursor-pointer active:scale-95'
                              }`}
                            >
                              <div className="flex flex-col text-start flex-1 pr-2">
                                <span>{drinkLabel}</span>
                                <span className={`text-[10px] font-extrabold ${isBbqMeal ? 'text-emerald-600 font-bold' : 'text-stone-500'}`}>
                                  {isBbqMeal 
                                    ? (language === 'ar' ? '🎁 مجاني مع وجبة رحلة شواء' : 'Free with BBQ Meal') 
                                    : `+${drink.price}.0 ${language === 'ar' ? 'ريال' : 'SAR'}`}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!isDrinkAvailable && (
                                  <span className="bg-red-50 text-red-700 border border-red-200 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                                    {language === 'ar' ? 'غير متوفر' : 'Unavailable'}
                                  </span>
                                )}
                                {isDrinkAvailable && (
                                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                                    isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-stone-300 bg-white'
                                  }`}>
                                    {isSelected ? <Check className="w-3 h-3 stroke-[3]" /> : null}
                                  </div>
                                )}
                              </div>
                            </motion.button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer Quantity + Sum button */}
          <div className="p-4 sm:p-6 pb-6 sm:pb-6 border-t border-black/5 bg-stone-50/85 backdrop-blur-md flex items-center justify-between gap-3 sm:gap-4 shrink-0 select-none">
            {/* Quantity Controller - only show if not selecting custom drinks bundle */}
            {!isSodasGroup && (
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
            )}

            {/* Sum Add button */}
            <button
              disabled={isAddButtonDisabled}
              onClick={handleAddClick}
              className={`flex-1 font-extrabold text-xs sm:text-base py-3 sm:py-3.5 px-4 sm:px-6 rounded-xl sm:rounded-2xl transition-all shadow-md flex items-center justify-between border border-black/5 group ${
                isAddButtonDisabled 
                  ? 'bg-stone-200 text-stone-400 border-stone-250 cursor-not-allowed shadow-none' 
                  : 'bg-yellow hover:bg-yellow/90 text-stone-900 active:scale-95 cursor-pointer'
              }`}
            >
              <span>
                {isSodasGroup
                  ? (isAddButtonDisabled ? (language === 'ar' ? 'اختر المشروبات' : 'Select Sodas') : (language === 'ar' ? 'إضافة المشروبات للطلب' : 'Add Bundle to Order'))
                  : (language === 'ar' ? 'إضافة للطلب' : 'Add to Order')
                }
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className={`h-4 w-px ${isAddButtonDisabled ? 'bg-stone-400/20' : 'bg-stone-900/15'}`} />
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
