import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first"); // Accelerate local name resolutions

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Accept and parse body payloads with high limit for driver photo/document uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API endpoints FIRST

  // 1. Health check routing
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // 1.5. Expand Google Maps short URLs to extract coordinates
  app.post("/api/expand-url", async (req: express.Request, res: express.Response) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, message: "URL is required" });
      }

      const cleanUrl = url.trim();
      if (!cleanUrl.includes("goo.gl") && !cleanUrl.includes("maps")) {
        return res.status(400).json({ success: false, message: "Not a Google Maps URL" });
      }

      const response = await fetch(cleanUrl, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      res.json({
        success: true,
        expandedUrl: response.url
      });
    } catch (err: any) {
      console.error("Error expanding URL on server:", err);
      res.status(500).json({
        success: false,
        message: err.message || "Failed to expand Google Maps shortened URL"
      });
    }
  });

  // 2. Create Charge Transaction with Tap Payments
  app.post("/api/pay-tap", async (req: express.Request, res: express.Response) => {
    try {
      const { orderId, amount, customerName, customerPhone, customerEmail, redirectOrigin } = req.body;

      if (!orderId || !amount || !customerName || !customerPhone) {
        return res.status(400).json({ 
          success: false, 
          message: "Required parameters missing (orderId, amount, customerName, customerPhone)" 
        });
      }

      // Format name details
      const nameParts = customerName.trim().split(/\s+/);
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || "Client";

      // Normalize phone number for Saudi standards (Tap requires valid international prefixing)
      let cleanPhone = customerPhone.replace(/\D/g, "");
      let countryCode = "966";
      let phoneNumberOnly = cleanPhone;

      if (cleanPhone.startsWith("966") && cleanPhone.length > 9) {
        countryCode = "966";
        phoneNumberOnly = cleanPhone.substring(3);
      } else if (cleanPhone.startsWith("05") && cleanPhone.length === 10) {
        phoneNumberOnly = cleanPhone.substring(1);
      } else if (cleanPhone.startsWith("5") && cleanPhone.length === 9) {
        phoneNumberOnly = cleanPhone;
      }

      const email = customerEmail?.trim() || `${firstName.toLowerCase().replace(/[^a-z0-9]/g, "") || "guest"}@example.com`;
      const secretKey = process.env.TAP_SECRET_KEY;

      if (!secretKey) {
        console.warn("TAP_SECRET_KEY environment variable is not defined. Initiating safe mock simulator checkout URL...");
        
        // Generate cryptographic-looking mock charge ID
        const mockTapId = `chg_mock${Math.floor(100000 + Math.random() * 900000)}`;
        const mockRedirectUrl = `${redirectOrigin}/?orderId=${orderId}&tap_id=${mockTapId}&payment_status=check`;
        
        return res.json({
          success: true,
          isSimulated: true,
          chargeId: mockTapId,
          transaction: {
            url: mockRedirectUrl
          },
          message: "Simulated Tap transaction interface created locally."
        });
      }

      const payload = {
        amount: Number(amount),
        currency: "SAR",
        threeDSecure: true,
        save_card: false,
        description: `Order ${orderId} at Grill Journey`,
        statement_descriptor: "GRILL JOURNEY",
        metadata: {
          order_id: orderId
        },
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: {
            country_code: countryCode,
            number: phoneNumberOnly
          }
        },
        source: {
          id: "src_all" // Activates mada, Visa, Mastercard, Apple Pay depending on payer browser & cards
        },
        redirect: {
          url: `${redirectOrigin}/?orderId=${orderId}&payment_status=check`
        }
      };

      console.log(`Sending charge request object to Tap for Order ${orderId}:`, JSON.stringify(payload));

      const tapResponse = await fetch("https://api.tap.company/v2/charges", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secretKey}`,
          "Content-Type": "application/json",
          "accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const responseData = await tapResponse.json() as any;

      if (!tapResponse.ok) {
        console.error("Tap API raw network response failed:", tapResponse.status, responseData);
        return res.status(tapResponse.status).json({
          success: false,
          message: responseData?.errors?.[0]?.description || responseData?.message || "Payment initiation failed with Tap gateway.",
          errors: responseData?.errors
        });
      }

      return res.json({
        success: true,
        isSimulated: false,
        chargeId: responseData.id,
        transaction: {
          url: responseData.transaction?.url
        }
      });

    } catch (err: any) {
      console.error("Exception during Tap charge initialization:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Internal server error occurred configuring payment gateway session."
      });
    }
  });

  // 3. Verify Charge Status with Tap Payments
  app.get("/api/check-tap-status/:chargeId", async (req: express.Request, res: express.Response) => {
    try {
      const { chargeId } = req.params;

      if (!chargeId) {
        return res.status(400).json({ success: false, message: "Missing charge ID reference value" });
      }

      // Check if it's a local/sandbox simulator payment
      if (chargeId.startsWith("chg_mock")) {
        return res.json({
          success: true,
          isSimulated: true,
          status: "CAPTURED",
          amount: 0,
          currency: "SAR",
          metadata: {
            order_id: req.query.orderId || ""
          },
          gatewayResponse: {
            id: chargeId,
            status: "CAPTURED"
          }
        });
      }

      const secretKey = process.env.TAP_SECRET_KEY;
      if (!secretKey) {
        return res.status(500).json({
          success: false,
          message: "TAP_SECRET_KEY environment key missing. Cannot query gateway APIs."
        });
      }

      const tapResponse = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${secretKey}`,
          "accept": "application/json"
        }
      });

      const responseData = await tapResponse.json() as any;

      if (!tapResponse.ok) {
        console.error("Tap Status retrieving failed for ID:", chargeId, responseData);
        return res.status(tapResponse.status).json({
          success: false,
          message: responseData?.errors?.[0]?.description || "Could not retrieve transaction validation from Tap."
        });
      }

      return res.json({
        success: true,
        isSimulated: false,
        status: responseData.status, // e.g. "CAPTURED", "FAILED", "CANCELLED"
        metadata: responseData.metadata,
        amount: responseData.amount,
        currency: responseData.currency,
        gatewayResponse: responseData
      });

    } catch (err: any) {
      console.error("Exception verifying Tap transaction details:", err);
      return res.status(500).json({
        success: false,
        message: err.message || "Internal error querying payment gateway validation."
      });
    }
  });

  // 4. Secure server-side Telegram notifications
  app.post("/api/notify-telegram", async (req: express.Request, res: express.Response) => {
    try {
      const { order } = req.body;
      if (!order || !order.id) {
        return res.status(400).json({ success: false, message: "Missing order details" });
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (!botToken || !chatId) {
        console.warn(`[Telegram Config Warning] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in environmental settings. Order ${order.id} skipped notification.`);
        return res.json({
          success: true,
          message: "Telegram integration not fully configured. Notification skipped.",
          isConfigured: false
        });
      }

      // Format elegant, beautiful order message for real-time delivery notification
      const itemsList = order.items.map((it: any) => {
        return `• *${it.nameAr || it.name}*\n   العدد: ${it.quantity} | السعر: ${it.price.toFixed(1)} ريال`;
      }).join('\n\n');

      const orderType = order.tableOrDelivery === 'table' 
        ? `🍽️ طلب محلي (داخل الصالة)` 
        : `🛍️ طلب سفري (خارج المطعم)`;

      const notesText = order.notes 
        ? `📝 *ملاحظات الطلب:* ${order.notes}\n` 
        : '';

      const payMethod = order.paymentMethod === 'cod' 
        ? '💵 الدفع عند الاستلام (كاش)' 
        : order.paymentMethod === 'applepay' 
          ? '🍎 آبل باي (مدفوع إلكتروني)' 
          : '💳 مدى / بطاقة بنكية (مدفوع إلكتروني)';

      const promoText = order.promoDiscount && order.promoDiscount > 0 
        ? `*خصم الكوبون:* -${order.promoDiscount.toFixed(2)} ريال\n` 
        : '';

      const messageText = `🔔 *طلب جديد في Grill Journey!* 🍢🥤\n\n` +
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
        `⚡ _تم إرسال هذا التنبيه فور تسجيل الطلب في جهاز العميل_`;

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

      const data = await response.json() as any;

      if (!response.ok || !data.ok) {
        console.error("Telegram API endpoint error response:", data);
        return res.status(502).json({
          success: false,
          message: data.description || "Telegram API rejected notification request."
        });
      }

      return res.json({
        success: true,
        message: "Notification sent successfully to administrator on Telegram.",
        isConfigured: true
      });

    } catch (telegramErr: any) {
      console.error("Exception handling Telegram dispatch:", telegramErr);
      return res.status(500).json({
        success: false,
        message: telegramErr.message || "Failed to route Telegram notification webhook."
      });
    }
  });

  // 4b. Secure server-side Telegram driver registration notifications
  app.post("/api/notify-driver-registration", async (req: express.Request, res: express.Response) => {
    try {
      const { name, phone, carRegistrationImg } = req.body;
      if (!name || !phone) {
        return res.status(400).json({ success: false, message: "Missing registration details" });
      }

      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (!botToken || !chatId) {
        console.warn(`[Telegram Config Warning] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in environmental settings. Registration skipped telegram dispatch.`);
        return res.json({
          success: true,
          message: "Telegram integration not fully configured. Notification skipped.",
          isConfigured: false
        });
      }

      const captionText = `🚴 *طلب تسجيل كابتن (مندوب) جديد!* 📋\n\n` +
        `👤 *الاسم الثنائي:* ${name}\n` +
        `📞 *رقم الجوال:* \`${phone}\`\n\n` +
        `⚡ _يرجى مراجعة لوحة الإدارة للموافقة عليه أو رفضه._`;

      let telegramResponse;
      
      if (carRegistrationImg && carRegistrationImg.includes(";base64,")) {
        try {
          const parts = carRegistrationImg.split(";base64,");
          const contentType = parts[0].split(":")[1] || "image/jpeg";
          const base64Data = parts[1];
          const buffer = Buffer.from(base64Data, 'base64');
          
          const formData = new FormData();
          formData.append("chat_id", chatId);
          
          const blob = new Blob([buffer], { type: contentType });
          formData.append("photo", blob, "registration_document.jpg");
          formData.append("caption", captionText);
          formData.append("parse_mode", "Markdown");

          const telegramUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
          telegramResponse = await fetch(telegramUrl, {
            method: "POST",
            body: formData
          });
        } catch (photoErr) {
          console.error("Failed to send photo to Telegram, falling back to message text:", photoErr);
        }
      }

      if (!telegramResponse || !telegramResponse.ok) {
        const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
        telegramResponse = await fetch(telegramUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: chatId,
            text: captionText + `\n\n⚠️ _(تعذر إرفاق صورة الاستمارة بالتلجرام، يرجى رؤيتها بلوحة الإدارة)_`,
            parse_mode: "Markdown"
          })
        });
      }

      const data = await telegramResponse.json() as any;

      if (!telegramResponse.ok || !data.ok) {
        console.error("Telegram API registration endpoint error response:", data);
        return res.status(502).json({
          success: false,
          message: data.description || "Telegram API rejected notification request."
        });
      }

      return res.json({
        success: true,
        message: "Registration notification sent successfully to Telegram.",
        isConfigured: true
      });

    } catch (telegramErr: any) {
      console.error("Exception handling Telegram registration dispatch:", telegramErr);
      return res.status(500).json({
        success: false,
        message: telegramErr.message || "Failed to route Telegram notification webhook."
      });
    }
  });

  // Vite development vs production asset static handling
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fullstack Express Server bound to host 0.0.0.0 and port ${PORT}`);
  });
}

startServer();
