import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first"); // Accelerate local name resolutions

async function getBusinessSettings() {
  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    let projectId = "gen-lang-client-0153467187";
    let databaseId = "ai-studio-9e243b44-104d-44d1-bf9e-c7d522d5b155";
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      projectId = config.projectId || projectId;
      databaseId = config.firestoreDatabaseId || databaseId;
    }
    
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/settings/business`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    
    const fields = data.fields || {};
    const settings: any = {};
    for (const [key, value] of Object.entries(fields)) {
      const valObj: any = value;
      if (valObj.stringValue !== undefined) {
        settings[key] = valObj.stringValue;
      } else if (valObj.booleanValue !== undefined) {
        settings[key] = valObj.booleanValue;
      } else if (valObj.integerValue !== undefined) {
        settings[key] = parseInt(valObj.integerValue, 10);
      } else if (valObj.doubleValue !== undefined) {
        settings[key] = parseFloat(valObj.doubleValue);
      }
    }
    return settings;
  } catch (err) {
    console.error("Error reading business settings from Firestore:", err);
    return null;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Accept and parse body payloads
  app.use(express.json());

  // API endpoints FIRST

  // 1. Health check routing
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
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
      
      // Load secret key from Firestore business settings, with env fallback
      const settings = await getBusinessSettings();
      const secretKey = settings?.tapSecretKey || process.env.TAP_SECRET_KEY;

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

      // Load secret key from Firestore business settings, with env fallback
      const settings = await getBusinessSettings();
      const secretKey = settings?.tapSecretKey || process.env.TAP_SECRET_KEY;
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

  // 3.5. Admin Forgot Password Telegram Notification
  app.post("/api/admin-forgot-password", async (req: express.Request, res: express.Response) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;

      if (!botToken || !chatId) {
        console.warn("[Telegram Config Warning] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.");
        return res.status(400).json({
          success: false,
          message: "تنبيه: لم يتم ربط البوت بتلجرام بعد في خيارات البيئة. يرجى مراجعة الإعدادات."
        });
      }

      const clientOrigin = req.body.origin || req.headers.origin || req.headers.referer || process.env.APP_URL || "https://ais-dev.run.app";
      const cleanOrigin = clientOrigin.replace(/\/$/, ""); // remove trailing slash if any
      const passwordVal = "Aa102030@";

      const messageText = `🔑 *طلب استعادة كلمة مرور لوحة التحكم* 🔐\n\n` +
        `مرحباً بك! لقد تم طلب استعادة كلمة مرور لوحة التحكم بناءً على نقر زر "نسيت كلمة المرور".\n\n` +
        `*بيانات تسجيل الدخول للوحة التحكم:*\n` +
        `• الرابط المباشر: [اضغط هنا للدخول](${cleanOrigin}/admin)\n` +
        `• الرابط البديل: ${cleanOrigin}/?page=admin\n` +
        `• كلمة المرور الحالية: \`${passwordVal}\`\n\n` +
        `⚡ _تم إرسال هذا التنبيه التلقائي الآمن لحماية حسابك._`;

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
        console.error("Telegram API admin password send failed:", data);
        return res.status(502).json({
          success: false,
          message: data.description || "فشل إرسال الرسالة عبر تلجرام."
        });
      }

      return res.json({
        success: true,
        message: "تم إرسال كلمة المرور ورابط لوحة التحكم بنجاح إلى حساب تلجرام الخاص بك!"
      });

    } catch (err: any) {
      console.error("Exception in admin-forgot-password:", err);
      return res.status(500).json({
        success: false,
        message: "حدث خطأ داخلي في الخادم أثناء معالجة الطلب."
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
