export const normalizePhone = (phoneStr?: string): string => {
  if (!phoneStr) return '';
  let cleaned = phoneStr.replace(/\D/g, ''); // keep only digits
  if (cleaned.startsWith('966')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
};

export const phonesMatch = (p1?: string, p2?: string): boolean => {
  const norm1 = normalizePhone(p1);
  const norm2 = normalizePhone(p2);
  if (!norm1 || !norm2) return false;
  return norm1 === norm2;
};

export const getPhoneVariants = (phoneStr?: string): string[] => {
  if (!phoneStr) return [];
  const norm = normalizePhone(phoneStr);
  if (!norm) return [];
  return Array.from(new Set([
    phoneStr,
    '0' + norm,
    '+966' + norm,
    '966' + norm,
    norm
  ]));
};
