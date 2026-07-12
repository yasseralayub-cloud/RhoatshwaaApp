import React from 'react';
import { useLanguage } from './LanguageContext';
import { ShoppingBag, Search, Globe, Shield, ClipboardList, MapPin, Clock, Smartphone, Truck } from 'lucide-react';
import { isRestaurantOpen, formatTime12h } from '../utils/time';

interface HeaderProps {
  cartCount: number;
  onCartClick: () => void;
  searchTerm: string;
  onSearchChange: (val: string) => void;
  onTabChange: (tab: 'menu' | 'tracker' | 'admin' | 'driver') => void;
  activeTab: 'menu' | 'tracker' | 'admin' | 'driver';
  isAdminAuthenticated: boolean;
  businessSettings?: import('../types').BusinessSettings;
  showAdminTab?: boolean;
  showDriverTab?: boolean;
  onWelcomeClick?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  cartCount,
  onCartClick,
  searchTerm,
  onSearchChange,
  onTabChange,
  activeTab,
  isAdminAuthenticated,
  businessSettings,
  showAdminTab = false,
  showDriverTab = false,
  onWelcomeClick
}) => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md text-dark shadow-sm border-b border-black/5">
      {/* Sleek Fine Gold/Yellow Accent Header Line */}
      <div className="h-[3px] w-full bg-yellow" />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-2.5 md:py-3.5">
        {/* Upper Header Block - stacked on mobile, row on desktop */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4">
          
          {/* Brand/Logo Section - occupies full-width on mobile to layout actions beside it */}
          <div className="flex justify-between items-center gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2.5 md:gap-3.5 cursor-pointer" onClick={() => onTabChange('menu')}>
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-yellow flex items-center justify-center font-bold text-black text-sm md:text-lg shadow-sm font-sans overflow-hidden shrink-0 border border-black/5">
                {businessSettings?.logoUrl ? (
                  <img src={businessSettings.logoUrl} alt="Logo" referrerPolicy="no-referrer" className="w-[100%] h-[100%] rounded-full object-cover" />
                ) : (
                  <span>{language === 'ar' ? (businessSettings?.restaurantNameAr?.charAt(0) || 'ر') : (businessSettings?.restaurantNameEn?.charAt(0) || 'G')}</span>
                )}
              </div>
              <div className="text-start">
                <h1 id="brand-title" className="font-serif font-bold text-base md:text-xl text-dark tracking-wide leading-none uppercase">
                  {language === 'ar' ? (businessSettings?.restaurantNameAr || 'رحلة شواء') : (businessSettings?.restaurantNameEn || 'Grill Journey')}
                </h1>
                <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                  <p className="text-[10px] text-dark/50 font-mono uppercase tracking-widest hidden sm:block leading-none">
                    {language === 'ar' ? (businessSettings?.taglineAr || 'مذاق المشويات الفاخرة على أصولها') : (businessSettings?.taglineEn || 'Premium Charcoal Grilled Platters')}
                  </p>
                  {/* Working hours badge */}
                  {businessSettings?.workingHoursStart && businessSettings?.workingHoursEnd && (
                    <div className="flex items-center gap-1">
                      <span className="hidden sm:inline text-dark/10 text-[10px] select-none">|</span>
                      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8.5px] sm:text-[9px] font-bold ${
                        isRestaurantOpen(businessSettings.workingHoursStart, businessSettings.workingHoursEnd)
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-500/10'
                          : 'bg-rose-50 text-rose-600 border border-rose-500/10'
                      }`}>
                        <span className={`w-1 h-1 rounded-full ${
                          isRestaurantOpen(businessSettings.workingHoursStart, businessSettings.workingHoursEnd)
                            ? 'bg-emerald-500 animate-pulse'
                            : 'bg-rose-500'
                        }`} />
                        <span>
                          {isRestaurantOpen(businessSettings.workingHoursStart, businessSettings.workingHoursEnd)
                            ? (language === 'ar' ? 'مفتوح' : 'Open')
                            : (language === 'ar' ? 'مغلق' : 'Closed')
                          }
                        </span>
                        <span className="text-dark/40 font-mono text-[7.5px] sm:text-[8px] font-normal">
                          ({formatTime12h(businessSettings.workingHoursStart, language)})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Mobile-only action shortcuts on the right-side of Logo row */}
            <div className="flex md:hidden items-center gap-2">
              {/* Language Selection */}
              <button
                id="lang-toggle-btn-mobile"
                onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
                className="p-1.5 rounded-xl bg-neutral-50 border border-black/5 text-dark/70 hover:text-dark transition-colors cursor-pointer text-[10px] font-extrabold px-2.5"
                title="Change Language / تغيير اللغة"
              >
                <span>{language === 'ar' ? 'EN' : 'عربي'}</span>
              </button>

              {/* Install / Notifications App button shortcut */}
              {onWelcomeClick && (
                <button
                  onClick={onWelcomeClick}
                  className="p-1.5 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-500/20 text-orange-700 hover:from-amber-100 hover:to-orange-100 transition-all cursor-pointer text-[10px] font-extrabold"
                  title="App Installation & Alerts"
                >
                  <Smartphone className="w-3.5 h-3.5 text-orange-600" />
                </button>
              )}

              {/* Shopping Cart button */}
              <button
                id="cart-trigger-btn-mobile"
                onClick={onCartClick}
                className="relative p-2 rounded-xl bg-dark text-white hover:bg-black transition-all font-semibold cursor-pointer shadow-xs flex items-center justify-center"
              >
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -end-1 bg-yellow text-black font-black text-[8px] w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white shadow-xs">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Tab switches and desktop utilities */}
          <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
            
            {/* Quick Navigation Tabs - stretches on mobile to fill layout evenly */}
            <div className="flex p-0.5 bg-neutral-100 rounded-xl border border-black/5 w-full md:w-auto">
              <button
                id="menu-tab-nav"
                onClick={() => onTabChange('menu')}
                className={`flex-1 md:flex-none text-center px-4 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  activeTab === 'menu'
                    ? 'bg-yellow text-black font-bold shadow-xs'
                    : 'text-dark/60 hover:text-dark'
                }`}
              >
                {t('menu')}
              </button>
              
              <button
                id="tracker-tab-nav"
                onClick={() => onTabChange('tracker')}
                className={`flex-1 md:flex-none text-center px-4 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1 cursor-pointer ${
                  activeTab === 'tracker'
                    ? 'bg-yellow text-black font-bold shadow-xs'
                    : 'text-dark/60 hover:text-dark'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span>{t('tracker')}</span>
              </button>

            </div>

            {/* Desktop-only utility elements */}
            <div className="hidden md:flex items-center gap-2">
              {/* Language Selection */}
              <button
                id="lang-toggle-btn"
                onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
                className="p-2 rounded-xl bg-neutral-50 border border-black/5 text-dark/70 hover:text-dark transition-colors cursor-pointer text-xs font-semibold px-3"
                title="Change Language / تغيير اللغة"
              >
                <span className="hidden md:inline">{language === 'ar' ? 'English' : 'العربية'}</span>
                <Globe className="w-4 h-4 md:hidden" />
              </button>

              {/* Install / Notifications App button shortcut */}
              {onWelcomeClick && (
                <button
                  onClick={onWelcomeClick}
                  className="p-2 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-500/20 text-orange-700 hover:from-amber-100 hover:to-orange-100 transition-all cursor-pointer text-xs font-extrabold px-3 flex items-center gap-1.5 shadow-xs"
                  title="App Installation & Alerts"
                >
                  <Smartphone className="w-3.5 h-3.5 shrink-0 text-orange-600" />
                  <span className="hidden lg:inline">{language === 'ar' ? 'تثبيت التطبيق 📱' : 'Install App 📱'}</span>
                </button>
              )}

              {/* Shopping Cart button */}
              <button
                id="cart-trigger-btn"
                onClick={onCartClick}
                className="relative p-2.5 rounded-xl bg-dark text-white hover:bg-black transition-all font-semibold cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <ShoppingBag className="w-4 h-4 md:w-5 h-5 shrink-0" />
                {cartCount > 0 && (
                  <span className="absolute -top-1.5 -end-1.5 bg-yellow text-black font-black text-[9px] w-5 h-5 rounded-full flex items-center justify-center border border-white shadow-xs">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>

          </div>
        </div>

        {/* Lower Row: Immediate Live Input Search Bar (only appears on menu tab) */}
        {activeTab === 'menu' && (
          <div className="mt-3.5 max-w-2xl mx-auto relative">
            <div className="absolute inset-y-0 start-0 ps-3.5 flex items-center pointer-events-none text-dark/40">
              <Search className="w-5 h-5" />
            </div>
            <input
              id="menu-search-input"
              type="text"
              placeholder={language === 'ar' ? 'ابحث عن أكلة، شاورما، حلى، أو قهوة...' : 'Search delicious food, drinks, games...'}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-neutral-50 text-dark border border-black/5 rounded-2xl ps-11 pe-4 py-3 placeholder-dark/40 text-sm md:text-base outline-none focus:border-yellow focus:bg-white focus:ring-1 focus:ring-yellow transition-all text-start shadow-sm"
            />
          </div>
        )}
      </div>
    </header>
  );
};
