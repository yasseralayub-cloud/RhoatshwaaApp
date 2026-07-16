export interface MenuItem {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  price: number;
  category: string;
  image: string;
  calories: number;
  isPopular?: boolean;
  isAvailable: boolean;
  dineInOnly?: boolean;
}

export interface OrderItem {
  id: string;
  name: string;
  nameAr: string;
  price: number;
  quantity: number;
}

export interface CartItemOption {
  notes: string[];
  addons: { nameAr: string; nameEn: string; price: number }[];
  selectedDrink?: { id: string; nameAr: string; nameEn: string; price: number };
}

export interface CartItem {
  id: string; // item.id + serialization of customizations to handle different configurations as separate line items
  item: MenuItem;
  quantity: number;
  customizations?: CartItemOption;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone: string;
  tableOrDelivery: 'table' | 'takeaway' | 'delivery';
  tableNumber?: string;
  deliveryAddress?: string;
  notes?: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  paymentMethod: 'cod' | 'applepay' | 'mada' | 'transfer';
  status: 'pending' | 'received' | 'searching_driver' | 'preparing' | 'ready' | 'driver_assigned' | 'driver_picked_up' | 'on_the_way' | 'delivered' | 'cancelled';
  whatsappSent: boolean;
  createdAt: string; 
  appliedPromoId?: string;
  promoDiscount?: number;
  latitude?: number;
  longitude?: number;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  deliveryFee?: number;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  status: 'available' | 'busy' | 'suspended';
  createdAt?: string;
  suspendedUntil?: string;
  completedCount?: number;
  totalEarnings?: number;
}

export interface Promotion {
  id: string;
  title: string;
  titleAr: string;
  discountPercent: number;
  isActive: boolean;
  endsAt: string; // ISO format
  imageUrl?: string; // Optional custom background image for ad campaign
}

export interface BusinessSettings {
  restaurantNameAr: string;
  restaurantNameEn: string;
  taglineAr: string;
  taglineEn: string;
  logoUrl: string;
  phone: string;
  whatsappNumber: string;
  addressAr: string;
  addressEn: string;
  taxEnabled: boolean;
  taxPercent: number;
  taxMethod?: 'inclusive' | 'exclusive'; // inclusive for ZATCA, exclusive for additional
  vatNumber: string; // ZATCA Seller VAT certificate ID
  workingHoursStart?: string; // 24h format, e.g., '17:00'
  workingHoursEnd?: string; // 24h format, e.g., '02:00'
  receiptWidth?: string; // e.g., '80mm', '58mm'
  receiptFontSize?: number; // e.g., 12
  receiptLogoSize?: number; // e.g., 80
  showKitchenSlipOnPrint?: boolean;
  showCustomerReceiptOnPrint?: boolean;
  kitchenSlipFontSize?: number;
  kitchenSlipHeaderAr?: string;
  kitchenSlipHeaderEn?: string;
  invoiceFooterAr?: string;
  invoiceFooterEn?: string;
  cashierPrinterType?: 'browser' | 'network';
  cashierPrinterIp?: string;
  cashierPrinterPort?: number;
  kitchenPrinterType?: 'browser' | 'network';
  kitchenPrinterIp?: string;
  kitchenPrinterPort?: number;
  printRoutingMode?: 'unified' | 'split';
  bankNameAr?: string;
  bankNameEn?: string;
  bankAccountNameAr?: string;
  bankAccountNameEn?: string;
  bankAccountNumber?: string;
  bankIban?: string;
  bankQrUrl?: string;
  bankEnabled?: boolean;
  deliveryFee?: number;
  gracePeriod?: number;
  ringtoneType?: string;
  websiteUrl?: string;
}

export interface Category {
  id: string;
  name: string;
  nameAr: string;
  icon: string;
}

export interface PendingDriver {
  id: string;
  name: string;
  phone: string;
  carRegistrationImg: string; // base64 representation of registration
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}
