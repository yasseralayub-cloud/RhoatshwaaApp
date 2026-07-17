/**
 * Checks if the current client time falls within the business hours range.
 * Supports overnight ranges (e.g., 17:00 to 02:00).
 */
export function isRestaurantOpen(start?: string, end?: string): boolean {
  if (!start || !end) return true; // default to open if not set
  
  try {
    // Get KSA time components directly using Intl.DateTimeFormat
    const options: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Riyadh',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const formatted = formatter.format(new Date()); // e.g., "19:31" or "02:15"
    
    // In some systems, 24-hour format can return "24:15" instead of "00:15"
    const parts = formatted.split(':');
    let ksaHour = parseInt(parts[0], 10);
    const ksaMin = parseInt(parts[1], 10);
    
    if (ksaHour === 24) ksaHour = 0;
    
    const currentMinutes = ksaHour * 60 + ksaMin;
    
    // Parse hours and minutes
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (startMinutes < endMinutes) {
      // Standard range on same calendar day (e.g., 08:00 to 16:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight range spanning past midnight (e.g., 17:00 to 02:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch (err) {
    console.error('Error parsing Riyadh timezone in isRestaurantOpen:', err);
    // Fallback to local browser time if Intl fails
    const localNow = new Date();
    const currentMinutes = localNow.getHours() * 60 + localNow.getMinutes();
    
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (startMinutes < endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }
}

/**
 * Formats a 24-hour time string (e.g., "17:00") into a localized 12-hour representation.
 */
export function formatTime12h(timeStr?: string, lang: 'ar' | 'en' = 'ar'): string {
  if (!timeStr) return '';
  const [hourStr, minStr] = timeStr.split(':');
  if (!hourStr || !minStr) return '';
  
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  
  const formattedMin = min < 10 ? `0${min}` : min;
  
  // Period translation
  let period = '';
  if (hour >= 12) {
    period = lang === 'ar' ? 'م' : 'PM';
  } else {
    period = lang === 'ar' ? 'ص' : 'AM';
  }
  
  let hour12 = hour % 12;
  if (hour12 === 0) hour12 = 12;
  
  return `${hour12}:${formattedMin} ${period}`;
}

/**
 * TLV Encoder for Saudi ZATCA e-Invoicing
 */
export function generateZatcaQr(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  totalAmount: string,
  vatAmount: string
): string {
  const encodeTLV = (tag: number, val: string): Uint8Array => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(val);
    const result = new Uint8Array(2 + bytes.length);
    result[0] = tag;
    result[1] = bytes.length;
    result.set(bytes, 2);
    return result;
  };

  const t1 = encodeTLV(1, sellerName);
  const t2 = encodeTLV(2, vatNumber);
  const t3 = encodeTLV(3, timestamp);
  const t4 = encodeTLV(4, totalAmount);
  const t5 = encodeTLV(5, vatAmount);

  const combined = new Uint8Array(t1.length + t2.length + t3.length + t4.length + t5.length);
  let offset = 0;
  for (const arr of [t1, t2, t3, t4, t5]) {
    combined.set(arr, offset);
    offset += arr.length;
  }

  let binary = '';
  for (let i = 0; i < combined.byteLength; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}
