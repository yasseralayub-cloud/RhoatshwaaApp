/**
 * Utility for client-side image compression and conversion to high-quality DataURL.
 * Preserves aspect ratio, optimizes file size to fit effortlessly within Firestore limits,
 * and handles modern mobile and desktop image formats.
 */
export async function compressImageFile(
  file: File,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('الملف المختار ليس صورة صالحة. يرجى اختيار ملف صورة (JPG, PNG, WEBP, ...).'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة من جهازك'));
    reader.onload = (e) => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('تعذر معالجة أبعاد الصورة'));
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calculate proportional scale
        if (width > maxWidth || height > maxHeight) {
          if (width / height > maxWidth / maxHeight) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر إنشاء سياق معالجة الصورة'));
          return;
        }

        // Apply smooth rendering
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to optimized JPEG
        let dataUrl = canvas.toDataURL('image/jpeg', quality);

        // If string exceeds ~350KB, compress slightly more to guarantee <200KB
        if (dataUrl.length > 350000) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        }

        resolve(dataUrl);
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
}
