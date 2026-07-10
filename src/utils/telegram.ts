import { Order, BusinessSettings } from "../types";

export async function sendTelegramNotification(order: Order, settings: BusinessSettings | null): Promise<boolean> {
  // 1. Try server-side notification first
  try {
    const res = await fetch("/api/notify-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.isConfigured !== false) {
        console.log("Telegram notification sent successfully via server API");
        return true;
      }
    }
    console.warn("Server-side Telegram notification failed or not configured, trying client-side fallback...");
  } catch (err) {
    console.warn("Server-side Telegram notification API unreachable, trying client-side fallback...", err);
  }

  // 2. Client-side fallback
  const botToken = settings?.telegramBotToken || (import.meta as any).env.VITE_TELEGRAM_BOT_TOKEN;
  const chatId = settings?.telegramChatId || (import.meta as any).env.VITE_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn("Telegram bot token or chat ID is missing. Cannot send client-side fallback notification.");
    return false;
  }

  try {
    // Format elegant, beautiful order message for real-time delivery notification (same as server)
    const itemsList = order.items.map((it: any) => {
      return `• *${it.nameAr || it.name}*\n   العدد: ${it.quantity} | السعر: ${it.price.toFixed(1)} ريال`;
    }).join('\n\n');

    const orderType = order.tableOrDelivery === 'table' 
      ? `🍽️ طلب محلي (داخل الصالة)` 
      : order.tableOrDelivery === 'delivery'
        ? `🛍️ طلب توصيل منزلي`
        : `🛍️ طلب سفري (خارج المطعم)`;

    const notesText = order.notes 
      ? `📝 *ملاحظات الطلب:* ${order.notes}\n` 
      : '';

    const payMethod = order.paymentMethod === 'cod' 
      ? '💵 الدفع عند الاستلام (كاش)' 
      : order.paymentMethod === 'applepay' 
        ? '🍎 آبل باي (مدفوع إلكتروني)' 
        : order.paymentMethod === 'transfer'
          ? '🏦 تحويل بنكي الراجحي'
          : '💳 مدى / بطاقة بنكية (مدفوع إلكتروني)';

    const promoText = order.promoDiscount && order.promoDiscount > 0 
      ? `*خصم الكوبون:* -${order.promoDiscount.toFixed(2)} ريال\n` 
      : '';

    const messageText = `🔔 *طلب جديد في Rehla Grill!* 🍢🥤\n\n` +
      `*رقم الطلب:* \`${order.id}\`\n` +
      `*اسم العميل:* ${order.customerName}\n` +
      `*رقم الجوال:* \`${order.customerPhone}\`\n` +
      `*نوع الطلب:* ${orderType}\n` +
      notesText + `\n` +
      `*الأصناف المطلوبة:*\n\n${itemsList}\n\n` +
      `*المجموع الفرعي:* ${order.subtotal.toFixed(2)} ريال\n` +
      promoText +
      `*الضريبة المضافة:* ${order.tax.toFixed(2)} ريال\n` +
      `*الإجمالي النهائي:* *${order.total.toFixed(2)} ريال*\n\n` +
      `*طريقة الدفع:* ${payMethod}\n\n` +
      `⚡ _تم إرسال هذا التنبيه فوراً عن طريق متصفح العميل (Vercel Direct Cloud)_`;

    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
        parse_mode: "Markdown"
      })
    });

    const data = await response.json();
    if (response.ok && data.ok) {
      console.log("Client-side fallback Telegram notification sent successfully!");
      return true;
    } else {
      console.error("Client-side fallback Telegram API rejected request:", data);
      return false;
    }
  } catch (clientErr) {
    console.error("Exception during client-side fallback Telegram notification:", clientErr);
    return false;
  }
}
