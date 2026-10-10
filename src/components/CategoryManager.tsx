import React, { useState, useRef } from 'react';
import { Category, MenuItem } from '../types';
import { CATEGORIES } from '../initialData';
import {
  Upload,
  Image as ImageIcon,
  Plus,
  Trash2,
  Edit2,
  RotateCcw,
  Sparkles,
  Check,
  X,
  Flame,
  Layers,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  ExternalLink,
  Eye,
  Camera
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const FOOD_CATEGORY_PRESETS = [
  {
    id: 'grills_flame',
    titleAr: 'مشويات مشتعلة على الفحم',
    titleEn: 'Charcoal Grills & BBQ',
    url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'kabab_steaks',
    titleAr: 'كباب ولحوم فاخرة',
    titleEn: 'Gourmet Kabab & Steaks',
    url: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'shawarma_saj',
    titleAr: 'شاورما عربية وخبز صاج',
    titleEn: 'Arabic Shawarma & Saj',
    url: 'https://images.unsplash.com/photo-1561651823-34feb02250e4?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'sauces_dips',
    titleAr: 'صوصات وتتبيلات حصرية',
    titleEn: 'Signature Sauces & Dips',
    url: 'https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'appetizers_salads',
    titleAr: 'مقبلات وسلطات طازجة',
    titleEn: 'Fresh Appetizers & Salads',
    url: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'crispy_fries',
    titleAr: 'بطاطس مقلية ومقرمشات',
    titleEn: 'Crispy Fries & Finger Food',
    url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'burgers_sliders',
    titleAr: 'برجر وسلايدرز عصري',
    titleEn: 'Burgers & Sliders',
    url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'desserts_sweets',
    titleAr: 'حلويات شرقية ومثلجات',
    titleEn: 'Desserts & Sweet Delights',
    url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'drinks_juices',
    titleAr: 'مشروبات وعصائر مثلجة',
    titleEn: 'Cold Drinks & Fresh Juices',
    url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'arabic_coffee',
    titleAr: 'دلة قهوة عربية وشاي',
    titleEn: 'Authentic Arabic Coffee & Tea',
    url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'traditional_games',
    titleAr: 'ألعاب شعبية وجلسات كيرم',
    titleEn: 'Traditional Games & Lounge',
    url: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?auto=format&fit=crop&q=80&w=1200'
  },
  {
    id: 'family_platters',
    titleAr: 'بوكسات ووجبات عائلية',
    titleEn: 'Family Boxes & Platters',
    url: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&q=80&w=1200'
  }
];

export const CATEGORY_ICON_OPTIONS = [
  { id: 'ChefHat', labelAr: 'طاهي / مشويات', labelEn: 'Chef / Grills' },
  { id: 'Flame', labelAr: 'لهب / شاورما', labelEn: 'Flame / Shawarma' },
  { id: 'Droplets', labelAr: 'قطرات / صوصات', labelEn: 'Sauces / Dips' },
  { id: 'Salad', labelAr: 'سلطة / مقبلات', labelEn: 'Salad / Appetizers' },
  { id: 'IceCream', labelAr: 'آيسكريم / حلى', labelEn: 'Desserts' },
  { id: 'GlassWater', labelAr: 'عصير / مشروبات', labelEn: 'Beverages' },
  { id: 'Coffee', labelAr: 'قهوة عربية', labelEn: 'Arabic Coffee' },
  { id: 'Gamepad2', labelAr: 'ألعاب شعبية', labelEn: 'Board Games' },
  { id: 'Utensils', labelAr: 'أطباق عامة', labelEn: 'Utensils / Meals' },
  { id: 'Sparkles', labelAr: 'أصناف مميزة', labelEn: 'Specials' },
  { id: 'Sandwich', labelAr: 'ساندوتشات', labelEn: 'Sandwiches' },
  { id: 'Pizza', labelAr: 'فطائر ومعجنات', labelEn: 'Bakery / Pizza' }
];

interface CategoryManagerProps {
  categories: Category[];
  menuItems: MenuItem[];
  onSaveCategory: (category: Category) => Promise<void> | void;
  onDeleteCategory: (categoryId: string) => Promise<void> | void;
  onResetCategoryImage: (categoryId: string) => Promise<void> | void;
  language: 'ar' | 'en';
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({
  categories,
  menuItems,
  onSaveCategory,
  onDeleteCategory,
  onResetCategoryImage,
  language
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Form states for creating new category
  const [newId, setNewId] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newDescAr, setNewDescAr] = useState('');
  const [newDescEn, setNewDescEn] = useState('');
  const [newIcon, setNewIcon] = useState('ChefHat');
  const [newImage, setNewImage] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Image editing modal states
  const [selectedCatForImage, setSelectedCatForImage] = useState<Category | null>(null);
  const [tempImageUrl, setTempImageUrl] = useState('');
  const [tempDescAr, setTempDescAr] = useState('');
  const [tempDescEn, setTempDescEn] = useState('');
  const [tempNameAr, setTempNameAr] = useState('');
  const [tempNameEn, setTempNameEn] = useState('');
  const [tempIcon, setTempIcon] = useState('ChefHat');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  // Compress uploaded image helper
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const MAX_DIM = 1200;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          } else {
            resolve(event.target?.result as string);
          }
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, setter: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const compressedDataUrl = await compressImage(file);
      setter(compressedDataUrl);
    } catch (err) {
      console.error('Image compression failed:', err);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleCreateCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNameAr.trim()) return;

    const id = newId.trim().toLowerCase().replace(/\s+/g, '_') || `cat_${Date.now()}`;
    const newCategory: Category = {
      id,
      name: newNameEn.trim() || newNameAr.trim(),
      nameAr: newNameAr.trim(),
      icon: newIcon || 'Utensils',
      image: newImage.trim() || undefined,
      descriptionAr: newDescAr.trim() || undefined,
      descriptionEn: newDescEn.trim() || undefined
    };

    await onSaveCategory(newCategory);

    // Reset create form
    setNewId('');
    setNewNameAr('');
    setNewNameEn('');
    setNewDescAr('');
    setNewDescEn('');
    setNewIcon('ChefHat');
    setNewImage('');
    setShowAddForm(false);
  };

  const handleOpenEditModal = (cat: Category) => {
    setSelectedCatForImage(cat);
    setTempImageUrl(cat.image || '');
    setTempNameAr(cat.nameAr || '');
    setTempNameEn(cat.name || '');
    setTempDescAr(cat.descriptionAr || '');
    setTempDescEn(cat.descriptionEn || '');
    setTempIcon(cat.icon || 'ChefHat');
  };

  const handleSaveModalChanges = async () => {
    if (!selectedCatForImage) return;

    const updatedCategory: Category = {
      ...selectedCatForImage,
      nameAr: tempNameAr.trim() || selectedCatForImage.nameAr,
      name: tempNameEn.trim() || selectedCatForImage.name,
      icon: tempIcon,
      image: tempImageUrl.trim() || undefined,
      descriptionAr: tempDescAr.trim() || undefined,
      descriptionEn: tempDescEn.trim() || undefined
    };

    await onSaveCategory(updatedCategory);
    setSelectedCatForImage(null);
  };

  return (
    <div className="space-y-6 text-start">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent p-4 rounded-2xl border border-amber-500/20">
        <div className="space-y-1">
          <h4 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500 text-white shadow-xs">
              <Camera className="w-4 h-4" />
            </span>
            <span>{language === 'ar' ? 'إدارة أقسام المنيو وصور الواجهة الجمالية' : 'Category Banners & Aesthetics Manager'}</span>
          </h4>
          <p className="text-xs text-slate-500">
            {language === 'ar' 
              ? 'ارفع صوراً خاصة عالية الجودة لكل قسم، أو اختر من مكتبة الصور الجاهزة لتعزيز مظهر المنيو للمتصفحين.' 
              : 'Upload custom high-resolution banner images for each section or pick from presets.'}
          </p>
        </div>

        <button
          id="admin-add-category-btn"
          type="button"
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          {showAddForm ? (
            <>
              <X className="w-4 h-4" />
              <span>{language === 'ar' ? 'إغلاق النموذج' : 'Close Form'}</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>{language === 'ar' ? '📁 + إنشاء قسم جديد' : '📁 + New Category'}</span>
            </>
          )}
        </button>
      </div>

      {/* Expandable Add Category Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden bg-white border border-amber-200 p-5 rounded-2xl shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h5 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                <FolderPlus className="w-4 h-4 text-amber-600" />
                <span>{language === 'ar' ? 'إضافة قسم جديد مع صورة مخصصة' : 'Create New Category with Custom Banner'}</span>
              </h5>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCategorySubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'اسم القسم بالعربي *' : 'Category Name (Arabic) *'}
                  </label>
                  <input
                    required
                    type="text"
                    value={newNameAr}
                    onChange={(e) => setNewNameAr(e.target.value)}
                    placeholder={language === 'ar' ? 'مثال: قسم الصوصات الخاصة' : 'e.g. Special Sauces'}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'اسم القسم بالإنجليزي' : 'Category Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={newNameEn}
                    onChange={(e) => setNewNameEn(e.target.value)}
                    placeholder="e.g. Signature Sauces"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'معرف القسم (ID اختياري)' : 'Category Code (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={newId}
                    onChange={(e) => setNewId(e.target.value)}
                    placeholder="e.g. sauces"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Subtitles & Icon */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'وصف أو شعار القسم (عربي)' : 'Subtitle / Tagline (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={newDescAr}
                    onChange={(e) => setNewDescAr(e.target.value)}
                    placeholder={language === 'ar' ? 'مثال: تشكيلة صوصات شهية محضرة يومياً' : 'e.g. Fresh homemade dips and sauces'}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'وصف القسم (إنجليزي)' : 'Subtitle / Tagline (English)'}
                  </label>
                  <input
                    type="text"
                    value={newDescEn}
                    onChange={(e) => setNewDescEn(e.target.value)}
                    placeholder="e.g. Artisanal sauces and dressings"
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'أيقونة القسم' : 'Category Icon'}
                  </label>
                  <select
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500 font-bold"
                  >
                    {CATEGORY_ICON_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {language === 'ar' ? opt.labelAr : opt.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Banner Image Selection for New Category */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                    {language === 'ar' ? 'صورة خلفية القسم (Banner Image)' : 'Category Section Banner'}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, setNewImage)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition shadow-2xs"
                    >
                      <Upload className="w-3 h-3 text-amber-600" />
                      <span>{language === 'ar' ? 'رفع صورة من جهازك' : 'Upload from Device'}</span>
                    </button>
                  </div>
                </div>

                {/* Direct URL input */}
                <input
                  type="text"
                  value={newImage}
                  onChange={(e) => setNewImage(e.target.value)}
                  placeholder={language === 'ar' ? 'أو الصق رابط صورة مباشر https://...' : 'Or paste direct image URL https://...'}
                  className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2 outline-none focus:border-amber-500 font-mono"
                />

                {/* Preset Suggestions */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    {language === 'ar' ? '💡 أو اختر من مكتبة صور الأطعمة المقترحة:' : '💡 Or pick from curated food presets:'}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {FOOD_CATEGORY_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setNewImage(preset.url)}
                        className={`group relative h-14 rounded-lg overflow-hidden border text-start transition cursor-pointer ${
                          newImage === preset.url ? 'ring-2 ring-amber-500 border-amber-500' : 'border-slate-200 hover:border-amber-400'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.titleAr}
                          className="w-full h-full object-cover group-hover:scale-110 transition duration-300 filter brightness-75"
                        />
                        <span className="absolute inset-0 bg-black/40 flex items-end p-1 text-[9px] font-bold text-white leading-tight">
                          {language === 'ar' ? preset.titleAr : preset.titleEn}
                        </span>
                        {newImage === preset.url && (
                          <div className="absolute top-1 right-1 bg-amber-500 text-white rounded-full p-0.5 shadow-xs">
                            <Check className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Live Preview of New Category Banner */}
                {newImage && (
                  <div className="relative h-24 rounded-xl overflow-hidden border border-amber-200 shadow-xs">
                    <img src={newImage} alt="Preview" className="w-full h-full object-cover filter brightness-75" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 flex flex-col justify-end text-white">
                      <span className="font-extrabold text-sm">{newNameAr || (language === 'ar' ? 'معاينة اسم القسم' : 'Category Preview')}</span>
                      <span className="text-[10px] text-neutral-300">{newDescAr || (language === 'ar' ? 'وصف القسم يظهر هنا' : 'Subtitle text appears here')}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition"
                >
                  {language === 'ar' ? 'حفظ ونشر القسم بالمنيو ✅' : 'Save & Publish Category ✅'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid of All Categories with Banner Management */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const itemCount = menuItems.filter((i) => i.category === cat.id).length;
          const isDefault = CATEGORIES.some((c) => c.id === cat.id);
          const IconComp = (Icons as any)[cat.icon] || Icons.Utensils;

          return (
            <div
              key={cat.id}
              className="bg-white border border-slate-200/80 hover:border-amber-400/80 rounded-2xl overflow-hidden shadow-xs transition-all flex flex-col justify-between group"
            >
              {/* Banner / Image Display */}
              <div className="relative h-32 w-full bg-slate-800 overflow-hidden">
                {cat.image ? (
                  <img
                    src={cat.image}
                    alt={cat.nameAr}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 filter brightness-[0.75]"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-amber-600 via-orange-600 to-amber-800 flex items-center justify-center">
                    <IconComp className="w-10 h-10 text-white/40" />
                  </div>
                )}

                {/* Overlaid Title and Info */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3.5 flex flex-col justify-between text-white text-start">
                  <div className="flex justify-between items-start gap-2">
                    <span className="bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-md text-[10px] font-mono text-neutral-300 border border-white/10">
                      #{cat.id}
                    </span>
                    <span className="bg-amber-500/90 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-xs">
                      {itemCount} {language === 'ar' ? 'صنف' : 'items'}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="p-1 rounded bg-white/20 backdrop-blur-xs text-white">
                        <IconComp className="w-3.5 h-3.5" />
                      </span>
                      <h4 className="font-extrabold text-sm sm:text-base leading-tight drop-shadow-sm">
                        {language === 'ar' ? cat.nameAr : cat.name}
                      </h4>
                    </div>
                    {(cat.descriptionAr || cat.descriptionEn) && (
                      <p className="text-[10px] text-neutral-300 line-clamp-1 mt-0.5 font-light">
                        {language === 'ar' ? (cat.descriptionAr || cat.descriptionEn) : (cat.descriptionEn || cat.descriptionAr)}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Card Actions Bar */}
              <div className="p-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenEditModal(cat)}
                  className="flex-1 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-800 border border-slate-200 hover:border-amber-300 text-xs font-bold py-1.5 px-2.5 rounded-xl transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-amber-600" />
                  <span>{language === 'ar' ? 'تعديل الصورة والبيانات' : 'Edit Image & Details'}</span>
                </button>

                {/* Reset or Delete */}
                {isDefault ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(language === 'ar' ? `استعادة الصورة الافتراضية لقسم ${cat.nameAr}؟` : `Reset banner for ${cat.name} to default?`)) {
                        onResetCategoryImage(cat.id);
                      }
                    }}
                    title={language === 'ar' ? 'استعادة الصورة الافتراضية الأصلية' : 'Reset to default image'}
                    className="p-2 bg-white hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-xl transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(language === 'ar' ? `هل أنت متأكد من حذف قسم "${cat.nameAr}"؟` : `Are you sure you want to delete category "${cat.name}"?`)) {
                        onDeleteCategory(cat.id);
                      }
                    }}
                    title={language === 'ar' ? 'حذف القسم' : 'Delete category'}
                    className="p-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Image & Info Edit Modal */}
      <AnimatePresence>
        {selectedCatForImage && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-start"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                    <Camera className="w-5 h-5 text-amber-600" />
                    <span>
                      {language === 'ar' 
                        ? `تعديل صورة وتفاصيل قسم: ${selectedCatForImage.nameAr}` 
                        : `Edit Category: ${selectedCatForImage.name}`}
                    </span>
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">ID: #{selectedCatForImage.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCatForImage(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Live Banner Preview Box */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  {language === 'ar' ? 'معاينة البانر الحي بالمنيو:' : 'Live Menu Banner Preview:'}
                </label>
                <div className="relative h-36 rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-neutral-900">
                  {tempImageUrl ? (
                    <img src={tempImageUrl} alt="Banner" className="w-full h-full object-cover filter brightness-[0.75]" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-r from-amber-600 to-orange-700 flex items-center justify-center text-white/50 font-bold">
                      {language === 'ar' ? 'لا توجد صورة محددة' : 'No Banner Selected'}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-4 flex flex-col justify-end text-white text-start">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-amber-500 text-white shadow-xs">
                        <Flame className="w-4 h-4" />
                      </span>
                      <h4 className="font-extrabold text-lg sm:text-xl drop-shadow-sm">
                        {tempNameAr || selectedCatForImage.nameAr}
                      </h4>
                    </div>
                    {(tempDescAr || selectedCatForImage.descriptionAr) && (
                      <p className="text-xs text-neutral-200 mt-1 font-light">
                        {tempDescAr || selectedCatForImage.descriptionAr}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Image Upload / Input Tools */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    {language === 'ar' ? 'رفع صورة جديدة من جهازك:' : 'Upload Banner Image from Device:'}
                  </span>
                  
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFileUpload(e, setTempImageUrl)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'اختر ملف صورة' : 'Choose Image File'}</span>
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">
                    {language === 'ar' ? 'أو رابط صورة خارجي (URL):' : 'Or direct Image URL:'}
                  </label>
                  <input
                    type="text"
                    value={tempImageUrl}
                    onChange={(e) => setTempImageUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full text-xs bg-white border border-slate-200 rounded-xl p-2.5 outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                {/* Presets Grid */}
                <div className="space-y-2 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">
                    {language === 'ar' ? 'مكتبة الصور الاحترافية الجاهزة:' : 'Curated Food Photography Library:'}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                    {FOOD_CATEGORY_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setTempImageUrl(preset.url)}
                        className={`group relative h-16 rounded-xl overflow-hidden border text-start transition cursor-pointer ${
                          tempImageUrl === preset.url ? 'ring-2 ring-amber-500 border-amber-500' : 'border-slate-200 hover:border-amber-400'
                        }`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.titleAr}
                          className="w-full h-full object-cover filter brightness-75 group-hover:scale-110 transition duration-300"
                        />
                        <span className="absolute inset-0 bg-black/40 flex items-end p-1.5 text-[9.5px] font-bold text-white leading-tight">
                          {language === 'ar' ? preset.titleAr : preset.titleEn}
                        </span>
                        {tempImageUrl === preset.url && (
                          <div className="absolute top-1 right-1 bg-amber-500 text-white rounded-full p-0.5 shadow-xs">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Names & Description Edit */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'اسم القسم (عربي)' : 'Category Name (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={tempNameAr}
                    onChange={(e) => setTempNameAr(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'اسم القسم (إنجليزي)' : 'Category Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={tempNameEn}
                    onChange={(e) => setTempNameEn(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'وصف / شعار فرعي (عربي)' : 'Subtitle (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={tempDescAr}
                    onChange={(e) => setTempDescAr(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {language === 'ar' ? 'الأيقونة' : 'Icon'}
                  </label>
                  <select
                    value={tempIcon}
                    onChange={(e) => setTempIcon(e.target.value)}
                    className="w-full text-xs bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none focus:bg-white focus:border-amber-500 font-bold"
                  >
                    {CATEGORY_ICON_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {language === 'ar' ? opt.labelAr : opt.labelEn}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTempImageUrl('')}
                  className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'إزالة الصورة الحالية' : 'Clear Current Image'}</span>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedCatForImage(null)}
                    className="px-4 py-2 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-xl"
                  >
                    {language === 'ar' ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveModalChanges}
                    className="px-5 py-2 text-xs font-black text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition cursor-pointer"
                  >
                    {language === 'ar' ? 'حفظ التعديلات والصورة 💾' : 'Save Changes & Image 💾'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
