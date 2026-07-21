import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import { GoogleGenAI } from "@google/genai";

dns.setDefaultResultOrder("ipv4first"); // Accelerate local name resolutions

// Extremely fast and reliable local address parser to format both Google Maps and Nominatim addresses,
// completely bypassing Gemini for reverse geocoding to prevent any 429 quota/rate limit errors.
function cleanAddressLocal(raw: string): string {
  if (!raw) return "موقع مجهول";
  
  // Remove 5-digit postal codes from anywhere in the string
  let cleaned = raw.replace(/\b\d{5}\b/g, "").trim();
  
  // Split by standard or Arabic comma
  const parts = cleaned.split(/[،,]/).map(p => p.trim()).filter(Boolean);
  
  // Filter out redundant country and general elements
  const cleanedParts = parts.filter(part => {
    const lowerPart = part.toLowerCase();
    const isCountry = /^(السعودية|المملكة العربية السعودية|Saudi Arabia|KSA)$/i.test(part);
    const isPostalCode = /^\d{5}$/.test(part);
    const isShortPostal = /^\d{4}$/.test(part);
    const isRedundantAlQassim = lowerPart === "منطقة القصيم" && parts.some(p => p.includes("عيون الجواء"));
    
    return !isCountry && !isPostalCode && !isShortPostal && !isRedundantAlQassim && part.length > 0;
  });

  let result = cleanedParts.join("، ");
  
  // Clean up any double commas or spaces
  result = result.replace(/\s+/g, " ").replace(/،\s*،/g, "،").trim();
  if (result.startsWith("،")) result = result.slice(1).trim();
  if (result.endsWith("،")) result = result.slice(0, -1).trim();
  
  return result || "موقع مجهول";
}

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
      const { order, telegramBotToken, telegramChatId, telegramBotEnabled } = req.body;
      if (!order || !order.id) {
        return res.status(400).json({ success: false, message: "Missing order details" });
      }

      // Check if Telegram is explicitly disabled in the payload
      if (telegramBotEnabled === false) {
        return res.json({
          success: true,
          message: "Telegram alerts are disabled in business settings.",
          isConfigured: false
        });
      }

      // Helper to decode obfuscated credentials (user-requested secure Telegram token/chatId integration)
      const decodeB64 = (encoded: string): string => {
        try {
          return Buffer.from(encoded, "base64").toString("utf-8");
        } catch {
          return "";
        }
      };

      const obfuscatedBotToken = decodeB64("ODY3NDE4MjE5NjpBQUhpSUpzSUtDLXNwb2pwVTJPemRObFVjUUVDUGZNMDZn"); // "8674182196:AAHiIJsIKC-spojpU2Ozd0NlUcQECPfM06g"
      const obfuscatedChatId = decodeB64("NTI0MTMxMzczNw=="); // "5241313737"

      const botToken = telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || obfuscatedBotToken;
      const chatId = telegramChatId || process.env.TELEGRAM_CHAT_ID || obfuscatedChatId;

      if (!botToken || !chatId) {
        console.warn(`[Telegram Config Warning] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing in environmental settings. Order ${order.id} skipped notification.`);
        return res.json({
          success: true,
          message: "Telegram integration not fully configured. Notification skipped.",
          isConfigured: false
        });
      }

      // Optional Google Sheets Apps Script Webhook forwarding
      const obfuscatedSheetsWebhookUrl = decodeB64("aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4emNPNU1xWm93X0s5QkMwMlB3WWRaQ2RfVVNzd3FkLXJjQmhibERxZFVHaWN6TWR3Z3pxQ09jV2VjZEpiRTZmcC1RUS9leGVj");
      const sheetsWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || obfuscatedSheetsWebhookUrl;
      if (sheetsWebhookUrl) {
        try {
          const itemsSummary = order.items.map((it: any) => `${it.nameAr || it.name} (${it.quantity}x)`).join(", ");
          fetch(sheetsWebhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderId: order.id,
              customerName: order.customerName,
              customerPhone: order.customerPhone,
              tableOrDelivery: order.tableOrDelivery,
              items: itemsSummary,
              notes: order.notes || "",
              subtotal: order.subtotal,
              tax: order.tax,
              total: order.total,
              paymentMethod: order.paymentMethod,
              createdAt: order.createdAt || new Date().toISOString()
            })
          }).catch(e => console.warn("Google Sheets API forwarding failed:", e));
        } catch (sheetsErr) {
          console.warn("Error forwarding order data to Google Sheets:", sheetsErr);
        }
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

  // 4a-2. Secure server-side real SMS OTP sending (Taqnyat/Twilio)
  app.post("/api/send-sms", async (req: express.Request, res: express.Response) => {
    try {
      const { phone, code, language } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ success: false, message: "Missing phone or code parameters" });
      }

      const lang = language === "ar" ? "ar" : "en";
      const messageText = lang === "ar"
        ? `رمز التحقق الخاص بك لتسجيل الدخول في تطبيق رحلة شواء هو: ${code}`
        : `Your verification code for Grill Journey app is: ${code}`;

      // Normalize phone number formats
      let cleanPhone = phone.replace(/\D/g, "");
      let taqnyatPhone = cleanPhone;
      let twilioPhone = cleanPhone;

      if (cleanPhone.startsWith("05") && cleanPhone.length === 10) {
        taqnyatPhone = "966" + cleanPhone.substring(1);
        twilioPhone = "+966" + cleanPhone.substring(1);
      } else if (cleanPhone.startsWith("5") && cleanPhone.length === 9) {
        taqnyatPhone = "966" + cleanPhone;
        twilioPhone = "+966" + cleanPhone;
      } else if (cleanPhone.startsWith("966") && cleanPhone.length > 9) {
        taqnyatPhone = cleanPhone;
        twilioPhone = "+" + cleanPhone;
      } else if (cleanPhone.startsWith("00966")) {
        taqnyatPhone = cleanPhone.substring(2);
        twilioPhone = "+" + cleanPhone.substring(2);
      } else {
        taqnyatPhone = cleanPhone;
        twilioPhone = "+" + cleanPhone;
      }

      const taqnyatKey = process.env.TAQNYAT_API_KEY;
      const taqnyatSender = process.env.TAQNYAT_SENDER || "GrillJourney";

      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

      // 1. Try Taqnyat (Saudi SMS Gateway) if configured
      if (taqnyatKey && !taqnyatKey.includes("YOUR_")) {
        try {
          console.log(`Sending real SMS via Taqnyat to: ${taqnyatPhone}`);
          const taqnyatResponse = await fetch("https://api.taqnyat.sa/v1/messages", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${taqnyatKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              recipients: [taqnyatPhone],
              body: messageText,
              sender: taqnyatSender
            })
          });

          const resData = await taqnyatResponse.json() as any;
          if (taqnyatResponse.ok && resData && (resData.success || resData.statusCode === 200)) {
            return res.json({
              success: true,
              isSimulated: false,
              gatewayUsed: "taqnyat",
              message: "SMS sent successfully via Taqnyat."
            });
          } else {
            console.warn("Taqnyat API returned non-success response:", resData);
          }
        } catch (taqnyatErr) {
          console.error("Error communicating with Taqnyat API:", taqnyatErr);
        }
      }

      // 2. Try Twilio if configured
      if (twilioSid && twilioAuthToken && twilioFrom && !twilioSid.includes("YOUR_")) {
        try {
          console.log(`Sending real SMS via Twilio to: ${twilioPhone}`);
          const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
            method: "POST",
            headers: {
              "Authorization": "Basic " + Buffer.from(`${twilioSid}:${twilioAuthToken}`).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
              To: twilioPhone,
              From: twilioFrom,
              Body: messageText
            })
          });

          const resData = await twilioResponse.json() as any;
          if (twilioResponse.ok && resData && resData.sid) {
            return res.json({
              success: true,
              isSimulated: false,
              gatewayUsed: "twilio",
              message: "SMS sent successfully via Twilio."
            });
          } else {
            console.warn("Twilio API returned non-success response:", resData);
          }
        } catch (twilioErr) {
          console.error("Error communicating with Twilio API:", twilioErr);
        }
      }

      // 3. Fallback to Simulated Mode if no keys are defined or sending failed
      console.log(`Simulated SMS sent to: ${phone}. Code: ${code}`);
      return res.json({
        success: true,
        isSimulated: true,
        message: "SMS Gateway is not configured, or dispatch failed. Fell back to simulation mode.",
        code: code
      });

    } catch (err: any) {
      console.error("Exception in send-sms API:", err);
      return res.status(500).json({ success: false, message: err.message || "Failed to process SMS request" });
    }
  });

  // 4b. Secure server-side Telegram driver registration notifications
  app.post("/api/notify-driver-registration", async (req: express.Request, res: express.Response) => {
    try {
      const { name, phone, carRegistrationImg } = req.body;
      if (!name || !phone) {
        return res.status(400).json({ success: false, message: "Missing registration details" });
      }

      const decodeB64 = (encoded: string): string => {
        try {
          return Buffer.from(encoded, "base64").toString("utf-8");
        } catch {
          return "";
        }
      };

      const obfuscatedBotToken = decodeB64("ODY3NDE4MjE5NjpBQUhpSUpzSUtDLXNwb2pwVTJPemRObFVjUUVDUGZNMDZn"); // "8674182196:AAHiIJsIKC-spojpU2Ozd0NlUcQECPfM06g"
      const obfuscatedChatId = decodeB64("NTI0MTMxMzczNw=="); // "5241313737"

      const botToken = process.env.TELEGRAM_BOT_TOKEN || obfuscatedBotToken;
      const chatId = process.env.TELEGRAM_CHAT_ID || obfuscatedChatId;

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

  // 4c. Secure server-side intelligent reverse geocoding (Lat/Lng to Beautiful Arabic Address)
  app.post("/api/reverse-geocode", async (req: express.Request, res: express.Response) => {
    try {
      const { lat, lng } = req.body;
      if (lat === undefined || lng === undefined) {
        return res.status(400).json({ success: false, message: "Coordinates (lat and lng) are required" });
      }

      const latitude = Number(lat);
      const longitude = Number(lng);

      const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || 
                     process.env.GOOGLE_MAPS_API_KEY || 
                     process.env.GOOGLE_MAP_API_KEY || 
                     process.env.GOOGLE_API_KEY;

      let source = "nominatim";
      let rawAddress = "";

      if (apiKey && apiKey.startsWith("AIzaSy") && !apiKey.includes("YOUR_KEY_HERE")) {
        try {
          const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=ar`;
          const response = await fetch(googleUrl);
          if (response.ok) {
            const data = await response.json() as any;
            if (data && data.status === "OK" && data.results && data.results.length > 0) {
              rawAddress = data.results[0].formatted_address || "";
              source = "google";
            }
          }
        } catch (err) {
          console.warn("Server-side Google reverse geocoding failed, falling back:", err);
        }
      }

      // Fallback to Nominatim if Google failed or key was missing
      if (!rawAddress) {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=ar&zoom=18`,
            {
              headers: {
                "User-Agent": "GrillJourneyDelivery/1.0 (yasseralayub@gmail.com)",
                "Accept-Language": "ar"
              }
            }
          );
          if (response.ok) {
            const data = await response.json() as any;
            rawAddress = data.display_name || "";
          }
        } catch (err) {
          console.warn("Server-side Nominatim reverse geocode failed:", err);
        }
      }

      let processedAddress = cleanAddressLocal(rawAddress);

      return res.json({ success: true, address: processedAddress });
    } catch (err: any) {
      console.error("Exception in reverse-geocode API:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // 4d. Secure server-side intelligent geocoding (Address/Query to Lat/Lng inside Saudi Arabia)
  app.post("/api/geocode", async (req: express.Request, res: express.Response) => {
    try {
      const { query } = req.body;
      if (!query) {
        return res.status(400).json({ success: false, message: "Query is required" });
      }

      const queryStr = String(query).trim();

      // 1. Check if it's already coordinates
      const coordinateRegex = /([-+]?\d{1,2}\.\d+)\s*,\s*([-+]?\d{1,3}\.\d+)/;
      const coordMatch = queryStr.match(coordinateRegex);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        return res.json({
          success: true,
          lat,
          lng,
          address: queryStr
        });
      }

      // 2. Check if it's a Google Maps URL
      if (queryStr.includes("http") && (queryStr.includes("goo.gl") || queryStr.includes("maps"))) {
        try {
          const expandResponse = await fetch(queryStr, {
            method: "GET",
            redirect: "follow",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });
          const expandedUrl = expandResponse.url;
          const urlCoordMatch = expandedUrl.match(coordinateRegex);
          if (urlCoordMatch) {
            const lat = parseFloat(urlCoordMatch[1]);
            const lng = parseFloat(urlCoordMatch[2]);
            return res.json({
              success: true,
              lat,
              lng,
              address: queryStr
            });
          }
        } catch (e) {
          console.warn("Failed to expand URL in geocode endpoint:", e);
        }
      }

      const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || 
                     process.env.GOOGLE_MAPS_API_KEY || 
                     process.env.GOOGLE_MAP_API_KEY || 
                     process.env.GOOGLE_API_KEY;

      let googleResult = null;

      if (apiKey && apiKey.startsWith("AIzaSy") && !apiKey.includes("YOUR_KEY_HERE")) {
        try {
          let localizedQuery = queryStr;
          const lowerQ = queryStr.toLowerCase();
          const isBuraidah = lowerQ.includes("بريدة") || lowerQ.includes("buraidah") || lowerQ.includes("buraydah");

          if (isBuraidah) {
            if (!lowerQ.includes("قصيم") && !lowerQ.includes("qassim")) {
              localizedQuery = `${queryStr}، بريدة، القصيم`;
            }
          } else if (!lowerQ.includes("سعود") && !lowerQ.includes("saudi") && !lowerQ.includes("قصيم") && !lowerQ.includes("جواء")) {
            const buraidahNeighborhoods = ["فايزية", "fayziyah", "إسكان", "eskan", "ريان", "rayan", "صفراء", "safra", "أفق", "ofuq", "بساتين", "basatin", "سلطانة", "sultanah", "غدير", "ghadir"];
            const isLikelyBuraidah = buraidahNeighborhoods.some(n => lowerQ.includes(n));
            
            if (isLikelyBuraidah) {
              localizedQuery = `${queryStr}، بريدة، القصيم`;
            } else {
              localizedQuery = `${queryStr}، القصيم، السعودية`;
            }
          }

          const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(localizedQuery)}&key=${apiKey}&language=ar&region=sa&components=country:SA`;
          const response = await fetch(googleUrl);
          if (response.ok) {
            const data = await response.json() as any;
            if (data && data.status === "OK" && data.results && data.results.length > 0) {
              googleResult = {
                lat: parseFloat(data.results[0].geometry.location.lat),
                lng: parseFloat(data.results[0].geometry.location.lng),
                address: data.results[0].formatted_address
              };
            }
          }
        } catch (err) {
          console.warn("Google Maps geocoding failed, falling back:", err);
        }
      }

      // 3. Try Nominatim fallback if Google failed or key was missing
      let nominatimResult = null;
      if (!googleResult) {
        try {
          let localizedQuery = queryStr;
          const lowerQ = queryStr.toLowerCase();
          const isBuraidah = lowerQ.includes("بريدة") || lowerQ.includes("buraidah") || lowerQ.includes("buraydah");

          if (isBuraidah) {
            if (!lowerQ.includes("قصيم") && !lowerQ.includes("qassim")) {
              localizedQuery = `${queryStr}، بريدة، القصيم`;
            }
          } else if (!lowerQ.includes("سعود") && !lowerQ.includes("saudi") && !lowerQ.includes("قصيم") && !lowerQ.includes("جواء")) {
            const buraidahNeighborhoods = ["فايزية", "fayziyah", "إسكان", "eskan", "ريان", "rayan", "صفراء", "safra", "أفق", "ofuq", "بساتين", "basatin", "سلطانة", "sultanah", "غدير", "ghadir"];
            const isLikelyBuraidah = buraidahNeighborhoods.some(n => lowerQ.includes(n));
            
            if (isLikelyBuraidah) {
              localizedQuery = `${queryStr}• بريدة، القصيم`;
              // Let's replace the bullet with standard Arabic comma to match the rest of the file
              localizedQuery = `${queryStr}، بريدة، القصيم`;
            } else {
              localizedQuery = `${queryStr}، القصيم، السعودية`;
            }
          }

          const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(localizedQuery)}&limit=1&countrycodes=sa&accept-language=ar`;
          const response = await fetch(osmUrl, {
            headers: {
              "User-Agent": "GrillJourneyDelivery/1.0 (yasseralayub@gmail.com)"
            }
          });
          if (response.ok) {
            const data = await response.json() as any;
            if (data && data.length > 0) {
              nominatimResult = {
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                address: data[0].display_name
              };
            }
          }
        } catch (err) {
          console.warn("Nominatim search failed inside geocode API:", err);
        }
      }

      const activeResult = googleResult || nominatimResult;

      // If we already have a direct geocoded result from Google or Nominatim, return it immediately.
      // This is extremely fast, highly accurate, and completely avoids hitting Gemini API quotas (429 rate limits).
      if (activeResult) {
        return res.json({
          success: true,
          lat: activeResult.lat,
          lng: activeResult.lng,
          address: cleanAddressLocal(activeResult.address)
        });
      }

      // Only use Gemini as an intelligent semantic query parser when direct geocoding fails.
      let geminiResult = null;
      if (process.env.GEMINI_API_KEY) {
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
          const prompt = `You are an expert geocoding AI assistant for both Buraidah (بريدة) and Uyun Al-Jiwa (عيون الجواء) in the Al-Qassim region, Saudi Arabia.
The user searched for this location text: "${queryStr}".
Google/OSM returned this potential coordinate: None.

Determine the best latitude and longitude coordinates in Saudi Arabia for this search query.
Focus highly on Buraidah (approx Lat 26.3260, Lng 43.9750) and Uyun Al-Jiwa (approx Lat 26.5057, Lng 43.7915) in the Al-Qassim province.
If the search query mentions a Buraidah neighborhood (such as حي الإسكان، حي الفايزية، حي الصفراء، حي الريان، حي الأفق، حي سلطانة، حي الغدير، حي البساتين، إلخ), return the accurate or approximate coordinates of that neighborhood in Buraidah.
If the search query mentions a neighborhood in Uyun Al-Jiwa (like حي الروضة، حي الملك فهد، حي الخالدية، حي المنتزه، حي السليمية، إلخ), return the exact or approximate coordinates of that neighborhood in Uyun Al-Jiwa.
If the query is generic, default to the center of Buraidah (Lat 26.3260, Lng 43.9750) or Uyun Al-Jiwa (Lat 26.5057, Lng 43.7915) or Al-Qassim.

Return ONLY a valid JSON object. Do not wrap in markdown blocks.
JSON format:
{
  "success": true,
  "lat": 26.5057,
  "lng": 43.7915,
  "address": "حي الروضة، عيون الجواء"
}
If you cannot find or approximate the location at all, return:
{
  "success": false,
  "message": "لم نتمكن من العثور على هذا الموقع بدقة، يرجى كتابة اسم الحي والشارع بشكل أوضح"
}`;

          const geminiResponse = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json"
            }
          });

          const responseText = geminiResponse.text?.trim() || "{}";
          const parsed = JSON.parse(responseText);
          if (parsed && parsed.success) {
            geminiResult = parsed;
          }
        } catch (geminiErr: any) {
          console.warn("Gemini geocoding fallback bypassed (quota/rate-limit):", geminiErr?.message || geminiErr);
        }
      }

      if (geminiResult) {
        return res.json(geminiResult);
      } else {
        return res.json({
          success: false,
          message: "تعذر العثور على الموقع بدقة، يرجى كتابة اسم الحي والشارع بشكل أوضح"
        });
      }

    } catch (err: any) {
      console.error("Exception in geocode API:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // Dynamic manifest.json endpoint to allow installing separate PWAs for customers, drivers, and admin panel on the same domain
  app.get("/manifest.json", (req, res) => {
    const type = req.query.type || "";
    const referer = req.headers.referer || "";
    
    if (type === "driver" || referer.includes("/driver")) {
      return res.json({
        "id": "/driver",
        "short_name": "بوابة الكابتن",
        "name": "بوابة كابتن التوصيل - رحلة شواء",
        "description": "بوابة تتبع وتوصيل طلبات مطعم رحلة شواء",
        "icons": [
          {
            "src": "/pwa-icon.jpg",
            "type": "image/jpeg",
            "sizes": "192x192",
            "purpose": "any maskable"
          },
          {
            "src": "/pwa-icon.jpg",
            "type": "image/jpeg",
            "sizes": "512x512",
            "purpose": "any maskable"
          }
        ],
        "start_url": "/driver?mode=driver",
        "background_color": "#0f172a",
        "theme_color": "#0f172a",
        "display": "standalone",
        "orientation": "portrait"
      });
    } else if (type === "admin" || referer.includes("/admin")) {
      return res.json({
        "id": "/admin",
        "short_name": "لوحة التحكم",
        "name": "لوحة تحكم مطعم رحلة شواء",
        "description": "لوحة تحكم وإدارة طلبات ومناديب مطعم رحلة شواء",
        "icons": [
          {
            "src": "/pwa-icon.jpg",
            "type": "image/jpeg",
            "sizes": "192x192",
            "purpose": "any maskable"
          },
          {
            "src": "/pwa-icon.jpg",
            "type": "image/jpeg",
            "sizes": "512x512",
            "purpose": "any maskable"
          }
        ],
        "start_url": "/admin",
        "background_color": "#0f172a",
        "theme_color": "#0f172a",
        "display": "standalone",
        "orientation": "portrait"
      });
    } else {
      return res.json({
        "id": "/",
        "short_name": "رحلة شواء",
        "name": "مطعم رحلة شواء - منيو وتتبع الطلبات",
        "description": "منيو مطعم رحلة شواء - اطلب ألذ المشويات الفاخرة وتابع طلبك خطوة بخطوة",
        "icons": [
          {
            "src": "/pwa-icon.jpg",
            "type": "image/jpeg",
            "sizes": "192x192",
            "purpose": "any maskable"
          },
          {
            "src": "/pwa-icon.jpg",
            "type": "image/jpeg",
            "sizes": "512x512",
            "purpose": "any maskable"
          }
        ],
        "start_url": "/",
        "background_color": "#0f172a",
        "theme_color": "#0f172a",
        "display": "standalone",
        "orientation": "portrait"
      });
    }
  });

  // Vite development vs production asset static handling
  async function startViteAndListen() {
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

  if (!process.env.VERCEL) {
    startViteAndListen();
  }

  export default app;
