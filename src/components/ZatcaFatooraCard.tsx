import React, { useEffect, useState } from 'react';
import { Order, BusinessSettings } from '../types';
import { useLanguage } from './LanguageContext';
import { QrCode, CheckCircle2, ShieldCheck, Printer, FileText } from 'lucide-react';
import QRCode from 'qrcode';
import { generateZatcaQr } from '../utils/time';

interface ZatcaFatooraCardProps {
  order: Order;
  businessSettings: BusinessSettings;
  onViewFullInvoice?: () => void;
  onPrintInvoice?: () => void;
}

export const ZatcaFatooraCard: React.FC<ZatcaFatooraCardProps> = ({
  order,
  businessSettings,
  onViewFullInvoice,
  onPrintInvoice,
}) => {
  const { language } = useLanguage();
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    if (!businessSettings.vatNumber) return;

    try {
      const sellerName = businessSettings.restaurantNameAr || 'رحلة شواء';
      const vatNumber = businessSettings.vatNumber;
      const timestamp = new Date(order.createdAt).toISOString();
      const totalAmount = order.total.toFixed(2);
      const vatAmount = order.tax.toFixed(2);

      const qrRawData = generateZatcaQr(sellerName, vatNumber, timestamp, totalAmount, vatAmount);
      
      QRCode.toDataURL(qrRawData, {
        width: 180,
        margin: 1,
        color: {
          dark: '#0f172a', // Slate 900
          light: '#ffffff', // White
        },
      })
        .then((url) => {
          setQrCodeUrl(url);
        })
        .catch((err) => {
          console.error('Error generating QR code data URL:', err);
        });
    } catch (e) {
      console.error('Failed to encode ZATCA TLV QR code:', e);
    }
  }, [order, businessSettings]);

  // Only display if vatNumber is present and tax is enabled
  if (!businessSettings.taxEnabled || !businessSettings.vatNumber) {
    return null;
  }

  const isAr = language === 'ar';

  return (
    <div 
      id="zatca-e-invoice-component" 
      className="bg-emerald-50/40 border border-emerald-500/20 rounded-3xl p-5 md:p-6 space-y-4 text-start relative overflow-hidden"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-500/10 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-emerald-900 leading-tight">
              {isAr ? 'الفاتورة الإلكترونية المعتمدة (فاتورة)' : 'Certified E-Invoice (Fatoora)'}
            </h4>
            <p className="text-[10px] text-emerald-700 font-medium mt-0.5">
              {isAr 
                ? 'متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك' 
                : 'Compliant with Saudi ZATCA Phase 1 Specifications'}
            </p>
          </div>
        </div>
        <div className="bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg text-[10px] uppercase tracking-wider self-start sm:self-auto flex items-center gap-1 shadow-xs">
          <CheckCircle2 className="w-3 h-3 text-white" />
          <span>{isAr ? 'فاتورة ضريبة مبسطة' : 'Simplified Tax Invoice'}</span>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="flex flex-col md:flex-row items-center gap-6">
        
        {/* Left Side: QR Code Block */}
        <div className="flex-shrink-0 flex flex-col items-center bg-white p-3 rounded-2xl border border-emerald-500/10 shadow-sm">
          {qrCodeUrl ? (
            <img 
              src={qrCodeUrl} 
              alt="ZATCA Compliance QR Code" 
              referrerPolicy="no-referrer"
              className="w-36 h-36 object-contain"
            />
          ) : (
            <div className="w-36 h-36 flex items-center justify-center bg-slate-50 text-slate-400">
              <QrCode className="w-10 h-10 animate-pulse" />
            </div>
          )}
          <span className="text-[9px] text-emerald-700/80 font-mono mt-2 font-bold tracking-wider">
            ZATCA QR CODE
          </span>
        </div>

        {/* Right Side: Invoice details list */}
        <div className="flex-1 w-full space-y-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                {isAr ? 'الرقم الضريبي للبائع' : 'Seller VAT Number'}
              </span>
              <span className="font-bold text-slate-800 font-mono text-sm leading-normal">
                {businessSettings.vatNumber}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                {isAr ? 'المنشأة (البائع)' : 'Seller / Business'}
              </span>
              <span className="font-bold text-emerald-800 font-sans text-sm leading-normal">
                {isAr ? (businessSettings.restaurantNameAr || 'رحلة شواء') : (businessSettings.restaurantNameEn || 'Grill Journey')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                {isAr ? 'رقم الفاتورة المرجعي' : 'Invoice Reference'}
              </span>
              <span className="font-bold text-slate-800 font-mono leading-normal">
                {order.id}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
                {isAr ? 'تاريخ ووقت الفاتورة' : 'Invoice Date & Time'}
              </span>
              <span className="font-bold text-slate-800 font-mono leading-normal">
                {new Date(order.createdAt).toLocaleString(isAr ? 'ar-SA' : 'en-US', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  hour12: false
                })}
              </span>
            </div>
          </div>

          {/* Pricing Summary Strip */}
          <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/10 flex flex-wrap justify-between items-center gap-2 text-xs">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-[9px] text-emerald-800/60 block font-bold">
                  {isAr ? 'الخاضع للضريبة' : 'Taxable Subtotal'}
                </span>
                <span className="font-bold text-slate-700 font-mono">
                  {(order.subtotal - (order.promoDiscount || 0)).toFixed(2)} SAR
                </span>
              </div>
              <div className="w-px h-6 bg-emerald-500/10" />
              <div>
                <span className="text-[9px] text-emerald-800/60 block font-bold">
                  {isAr ? `الضريبة (${businessSettings.taxPercent}%)` : `VAT (${businessSettings.taxPercent}%)`}
                </span>
                <span className="font-bold text-slate-700 font-mono">
                  {order.tax.toFixed(2)} SAR
                </span>
              </div>
            </div>
            <div>
              <span className="text-[9px] text-emerald-800/60 block font-bold text-end">
                {isAr ? 'المجموع النهائي شامل الضريبة' : 'Final VAT Inclusive Total'}
              </span>
              <span className="font-black text-emerald-800 text-sm font-mono block text-end">
                {order.total.toFixed(2)} SAR
              </span>
            </div>
          </div>

          {/* Inline Action Buttons */}
          <div className="flex gap-2.5 pt-1">
            {onViewFullInvoice && (
              <button
                onClick={onViewFullInvoice}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 rounded-xl font-bold text-[11px] cursor-pointer transition-all shadow-xs"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>{isAr ? 'عرض الفاتورة الكاملة' : 'View Full Invoice'}</span>
              </button>
            )}
            {onPrintInvoice && (
              <button
                onClick={onPrintInvoice}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[11px] cursor-pointer transition-all shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isAr ? 'طباعة سريعة' : 'Print Receipt'}</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
