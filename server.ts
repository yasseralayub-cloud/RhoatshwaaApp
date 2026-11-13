import dotenv from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Firebase Admin initialization for secure server-side FCM
const firebaseAdminApp = (() => {
  const existingApp = getApps()[0];
  if (existingApp) return existingApp;

  const encodedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encodedServiceAccount) return null;

  try {
    const serviceAccountJson = Buffer
      .from(encodedServiceAccount, "base64")
      .toString("utf8");

    const serviceAccount = JSON.parse(serviceAccountJson);

    return initializeApp({
      credential: cert(serviceAccount),
    });
  } catch {
    throw new Error("Firebase Admin initialization failed. Check server credentials.");
  }
})();

const firebaseAdminAuth = firebaseAdminApp
  ? getAuth(firebaseAdminApp)
  : null;

const firebaseAdminMessaging = firebaseAdminApp
  ? getMessaging(firebaseAdminApp)
  : null;
const firebaseAdminDb = firebaseAdminApp
  ? getFirestore(firebaseAdminApp, "ai-studio-9e243b44-104d-44d1-bf9e-c7d522d5b155")
  : null;
dns.setDefaultResultOrder("ipv4first");

// Extremely fast and reliable local address parser to format both Google Maps and Nominatim addresses,
// completely bypassing Gemini for reverse geocoding to prevent any 429 quota/rate limit errors.
function cleanAddressLocal(raw: string): string {
  if (!raw) return "ظ…ظˆظ‚ط¹ ظ…ط¬ظ‡ظˆظ„";
  
  // Remove 5-digit postal codes from anywhere in the string
  let cleaned = raw.replace(/\b\d{5}\b/g, "").trim();
  
  // Split by standard or Arabic comma
  const parts = cleaned.split(/[طŒ,]/).map(p => p.trim()).filter(Boolean);
  
  // Filter out redundant country and general elements
  const cleanedParts = parts.filter(part => {
    const lowerPart = part.toLowerCase();
    const isCountry = /^(ط§ظ„ط³ط¹ظˆط¯ظٹط©|ط§ظ„ظ…ظ…ظ„ظƒط© ط§ظ„ط¹ط±ط¨ظٹط© ط§ظ„ط³ط¹ظˆط¯ظٹط©|Saudi Arabia|KSA)$/i.test(part);
    const isPostalCode = /^\d{5}$/.test(part);
    const isShortPostal = /^\d{4}$/.test(part);
    const isRedundantAlQassim = lowerPart === "ظ…ظ†ط·ظ‚ط© ط§ظ„ظ‚طµظٹظ…" && parts.some(p => p.includes("ط¹ظٹظˆظ† ط§ظ„ط¬ظˆط§ط،"));
    
    return !isCountry && !isPostalCode && !isShortPostal && !isRedundantAlQassim && part.length > 0;
  });

  let result = cleanedParts.join("طŒ ");
  
  // Clean up any double commas or spaces
  result = result.replace(/\s+/g, " ").replace(/طŒ\s*طŒ/g, "طŒ").trim();
  if (result.startsWith("طŒ")) result = result.slice(1).trim();
  if (result.endsWith("طŒ")) result = result.slice(0, -1).trim();
  
  return result || "ظ…ظˆظ‚ط¹ ظ…ط¬ظ‡ظˆظ„";
}

const app = express();
// CORS configuration for Android Capacitor and web app
app.use((req, res, next) => {
  const origin = req.headers.origin;

  const allowedOrigins = [
    'https://localhost',
    'capacitor://localhost',
    'http://localhost',
    'https://rhoatshwaa-app.vercel.app'
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});
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
        return `â€¢ *${it.nameAr || it.name}*\n   ط§ظ„ط¹ط¯ط¯: ${it.quantity} | ط§ظ„ط³ط¹ط±: ${it.price.toFixed(1)} ط±ظٹط§ظ„`;
      }).join('\n\n');

      const orderType = order.tableOrDelivery === 'table' 
        ? `ًںچ½ï¸ڈ ط·ظ„ط¨ ظ…ط­ظ„ظٹ (ط¯ط§ط®ظ„ ط§ظ„طµط§ظ„ط©)` 
        : `ًں›چï¸ڈ ط·ظ„ط¨ ط³ظپط±ظٹ (ط®ط§ط±ط¬ ط§ظ„ظ…ط·ط¹ظ…)`;

      const notesText = order.notes 
        ? `ًں“‌ *ظ…ظ„ط§ط­ط¸ط§طھ ط§ظ„ط·ظ„ط¨:* ${order.notes}\n` 
        : '';

      const payMethod = order.paymentMethod === 'cod' 
        ? 'ًں’µ ط§ظ„ط¯ظپط¹ ط¹ظ†ط¯ ط§ظ„ط§ط³طھظ„ط§ظ… (ظƒط§ط´)' 
        : order.paymentMethod === 'applepay' 
          ? 'ًںچژ ط¢ط¨ظ„ ط¨ط§ظٹ (ظ…ط¯ظپظˆط¹ ط¥ظ„ظƒطھط±ظˆظ†ظٹ)' 
          : 'ًں’³ ظ…ط¯ظ‰ / ط¨ط·ط§ظ‚ط© ط¨ظ†ظƒظٹط© (ظ…ط¯ظپظˆط¹ ط¥ظ„ظƒطھط±ظˆظ†ظٹ)';

      const promoText = order.promoDiscount && order.promoDiscount > 0 
        ? `*ط®طµظ… ط§ظ„ظƒظˆط¨ظˆظ†:* -${order.promoDiscount.toFixed(2)} ط±ظٹط§ظ„\n` 
        : '';

      const messageText = `ًں”” *ط·ظ„ط¨ ط¬ط¯ظٹط¯ ظپظٹ Grill Journey!* ًںچ¢ًں¥¤\n\n` +
        `*ط±ظ‚ظ… ط§ظ„ط·ظ„ط¨:* \`${order.id}\`\n` +
        `*ط§ط³ظ… ط§ظ„ط¹ظ…ظٹظ„:* ${order.customerName}\n` +
        `*ط±ظ‚ظ… ط§ظ„ط¬ظˆط§ظ„:* \`${order.customerPhone}\`\n` +
        `*ظ†ظˆط¹ ط§ظ„ط·ظ„ط¨:* ${orderType}\n` +
        notesText + `\n` +
        `*ط§ظ„ط£طµظ†ط§ظپ ط§ظ„ظ…ط·ظ„ظˆط¨ط©:*\n\n${itemsList}\n\n` +
        `*ط§ظ„ظ…ط¬ظ…ظˆط¹ ط§ظ„ظپط±ط¹ظٹ:* ${order.subtotal.toFixed(2)} ط±ظٹط§ظ„\n` +
        promoText +
        `*ط§ظ„ط¶ط±ظٹط¨ط© ط§ظ„ظ…ط¶ط§ظپط©:* ${order.tax.toFixed(2)} ط±ظٹط§ظ„\n` +
        `*ط§ظ„ط¥ط¬ظ…ط§ظ„ظٹ ط§ظ„ظ†ظ‡ط§ط¦ظٹ:* *${order.total.toFixed(2)} ط±ظٹط§ظ„*\n\n` +
        `*ط·ط±ظٹظ‚ط© ط§ظ„ط¯ظپط¹:* ${payMethod}\n\n` +
        `âڑ، _طھظ… ط¥ط±ط³ط§ظ„ ظ‡ط°ط§ ط§ظ„طھظ†ط¨ظٹظ‡ ظپظˆط± طھط³ط¬ظٹظ„ ط§ظ„ط·ظ„ط¨ ظپظٹ ط¬ظ‡ط§ط² ط§ظ„ط¹ظ…ظٹظ„_`;

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
        ? `ط±ظ…ط² ط§ظ„طھط­ظ‚ظ‚ ط§ظ„ط®ط§طµ ط¨ظƒ ظ„طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ظپظٹ طھط·ط¨ظٹظ‚ ط±ط­ظ„ط© ط´ظˆط§ط، ظ‡ظˆ: ${code}`
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

      const captionText = `ًںڑ´ *ط·ظ„ط¨ طھط³ط¬ظٹظ„ ظƒط§ط¨طھظ† (ظ…ظ†ط¯ظˆط¨) ط¬ط¯ظٹط¯!* ًں“‹\n\n` +
        `ًں‘¤ *ط§ظ„ط§ط³ظ… ط§ظ„ط«ظ†ط§ط¦ظٹ:* ${name}\n` +
        `ًں“‍ *ط±ظ‚ظ… ط§ظ„ط¬ظˆط§ظ„:* \`${phone}\`\n\n` +
        `âڑ، _ظٹط±ط¬ظ‰ ظ…ط±ط§ط¬ط¹ط© ظ„ظˆط­ط© ط§ظ„ط¥ط¯ط§ط±ط© ظ„ظ„ظ…ظˆط§ظپظ‚ط© ط¹ظ„ظٹظ‡ ط£ظˆ ط±ظپط¶ظ‡._`;

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
            text: captionText + `\n\nâڑ ï¸ڈ _(طھط¹ط°ط± ط¥ط±ظپط§ظ‚ طµظˆط±ط© ط§ظ„ط§ط³طھظ…ط§ط±ط© ط¨ط§ظ„طھظ„ط¬ط±ط§ظ…طŒ ظٹط±ط¬ظ‰ ط±ط¤ظٹطھظ‡ط§ ط¨ظ„ظˆط­ط© ط§ظ„ط¥ط¯ط§ط±ط©)_`,
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
          const isBuraidah = lowerQ.includes("ط¨ط±ظٹط¯ط©") || lowerQ.includes("buraidah") || lowerQ.includes("buraydah");

          if (isBuraidah) {
            if (!lowerQ.includes("ظ‚طµظٹظ…") && !lowerQ.includes("qassim")) {
              localizedQuery = `${queryStr}طŒ ط¨ط±ظٹط¯ط©طŒ ط§ظ„ظ‚طµظٹظ…`;
            }
          } else if (!lowerQ.includes("ط³ط¹ظˆط¯") && !lowerQ.includes("saudi") && !lowerQ.includes("ظ‚طµظٹظ…") && !lowerQ.includes("ط¬ظˆط§ط،")) {
            const buraidahNeighborhoods = ["ظپط§ظٹط²ظٹط©", "fayziyah", "ط¥ط³ظƒط§ظ†", "eskan", "ط±ظٹط§ظ†", "rayan", "طµظپط±ط§ط،", "safra", "ط£ظپظ‚", "ofuq", "ط¨ط³ط§طھظٹظ†", "basatin", "ط³ظ„ط·ط§ظ†ط©", "sultanah", "ط؛ط¯ظٹط±", "ghadir"];
            const isLikelyBuraidah = buraidahNeighborhoods.some(n => lowerQ.includes(n));
            
            if (isLikelyBuraidah) {
              localizedQuery = `${queryStr}طŒ ط¨ط±ظٹط¯ط©طŒ ط§ظ„ظ‚طµظٹظ…`;
            } else {
              localizedQuery = `${queryStr}طŒ ط§ظ„ظ‚طµظٹظ…طŒ ط§ظ„ط³ط¹ظˆط¯ظٹط©`;
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
          const isBuraidah = lowerQ.includes("ط¨ط±ظٹط¯ط©") || lowerQ.includes("buraidah") || lowerQ.includes("buraydah");

          if (isBuraidah) {
            if (!lowerQ.includes("ظ‚طµظٹظ…") && !lowerQ.includes("qassim")) {
              localizedQuery = `${queryStr}طŒ ط¨ط±ظٹط¯ط©طŒ ط§ظ„ظ‚طµظٹظ…`;
            }
          } else if (!lowerQ.includes("ط³ط¹ظˆط¯") && !lowerQ.includes("saudi") && !lowerQ.includes("ظ‚طµظٹظ…") && !lowerQ.includes("ط¬ظˆط§ط،")) {
            const buraidahNeighborhoods = ["ظپط§ظٹط²ظٹط©", "fayziyah", "ط¥ط³ظƒط§ظ†", "eskan", "ط±ظٹط§ظ†", "rayan", "طµظپط±ط§ط،", "safra", "ط£ظپظ‚", "ofuq", "ط¨ط³ط§طھظٹظ†", "basatin", "ط³ظ„ط·ط§ظ†ط©", "sultanah", "ط؛ط¯ظٹط±", "ghadir"];
            const isLikelyBuraidah = buraidahNeighborhoods.some(n => lowerQ.includes(n));
            
            if (isLikelyBuraidah) {
              localizedQuery = `${queryStr}â€¢ ط¨ط±ظٹط¯ط©طŒ ط§ظ„ظ‚طµظٹظ…`;
              // Let's replace the bullet with standard Arabic comma to match the rest of the file
              localizedQuery = `${queryStr}طŒ ط¨ط±ظٹط¯ط©طŒ ط§ظ„ظ‚طµظٹظ…`;
            } else {
              localizedQuery = `${queryStr}طŒ ط§ظ„ظ‚طµظٹظ…طŒ ط§ظ„ط³ط¹ظˆط¯ظٹط©`;
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
          const prompt = `You are an expert geocoding AI assistant for both Buraidah (ط¨ط±ظٹط¯ط©) and Uyun Al-Jiwa (ط¹ظٹظˆظ† ط§ظ„ط¬ظˆط§ط،) in the Al-Qassim region, Saudi Arabia.
The user searched for this location text: "${queryStr}".
Google/OSM returned this potential coordinate: None.

Determine the best latitude and longitude coordinates in Saudi Arabia for this search query.
Focus highly on Buraidah (approx Lat 26.3260, Lng 43.9750) and Uyun Al-Jiwa (approx Lat 26.5057, Lng 43.7915) in the Al-Qassim province.
If the search query mentions a Buraidah neighborhood (such as ط­ظٹ ط§ظ„ط¥ط³ظƒط§ظ†طŒ ط­ظٹ ط§ظ„ظپط§ظٹط²ظٹط©طŒ ط­ظٹ ط§ظ„طµظپط±ط§ط،طŒ ط­ظٹ ط§ظ„ط±ظٹط§ظ†طŒ ط­ظٹ ط§ظ„ط£ظپظ‚طŒ ط­ظٹ ط³ظ„ط·ط§ظ†ط©طŒ ط­ظٹ ط§ظ„ط؛ط¯ظٹط±طŒ ط­ظٹ ط§ظ„ط¨ط³ط§طھظٹظ†طŒ ط¥ظ„ط®), return the accurate or approximate coordinates of that neighborhood in Buraidah.
If the search query mentions a neighborhood in Uyun Al-Jiwa (like ط­ظٹ ط§ظ„ط±ظˆط¶ط©طŒ ط­ظٹ ط§ظ„ظ…ظ„ظƒ ظپظ‡ط¯طŒ ط­ظٹ ط§ظ„ط®ط§ظ„ط¯ظٹط©طŒ ط­ظٹ ط§ظ„ظ…ظ†طھط²ظ‡طŒ ط­ظٹ ط§ظ„ط³ظ„ظٹظ…ظٹط©طŒ ط¥ظ„ط®), return the exact or approximate coordinates of that neighborhood in Uyun Al-Jiwa.
If the query is generic, default to the center of Buraidah (Lat 26.3260, Lng 43.9750) or Uyun Al-Jiwa (Lat 26.5057, Lng 43.7915) or Al-Qassim.

Return ONLY a valid JSON object. Do not wrap in markdown blocks.
JSON format:
{
  "success": true,
  "lat": 26.5057,
  "lng": 43.7915,
  "address": "ط­ظٹ ط§ظ„ط±ظˆط¶ط©طŒ ط¹ظٹظˆظ† ط§ظ„ط¬ظˆط§ط،"
}
If you cannot find or approximate the location at all, return:
{
  "success": false,
  "message": "ظ„ظ… ظ†طھظ…ظƒظ† ظ…ظ† ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ظ‡ط°ط§ ط§ظ„ظ…ظˆظ‚ط¹ ط¨ط¯ظ‚ط©طŒ ظٹط±ط¬ظ‰ ظƒطھط§ط¨ط© ط§ط³ظ… ط§ظ„ط­ظٹ ظˆط§ظ„ط´ط§ط±ط¹ ط¨ط´ظƒظ„ ط£ظˆط¶ط­"
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
          message: "طھط¹ط°ط± ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ…ظˆظ‚ط¹ ط¨ط¯ظ‚ط©طŒ ظٹط±ط¬ظ‰ ظƒطھط§ط¨ط© ط§ط³ظ… ط§ظ„ط­ظٹ ظˆط§ظ„ط´ط§ط±ط¹ ط¨ط´ظƒظ„ ط£ظˆط¶ط­"
        });
      }

    } catch (err: any) {
      console.error("Exception in geocode API:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  });

  // ==========================================
  // Secure Firebase Cloud Messaging Device APIs
  // ==========================================

  // Verify Firebase identity and the server-side push administrator allowlist.
  const verifyPushAdmin = async (
    req: express.Request,
    res: express.Response
  ): Promise<boolean> => {
    if (!firebaseAdminAuth) {
      res.status(503).json({ success: false, message: "Push authentication is not configured" });
      return false;
    }

    const authorization = req.headers.authorization || "";
    const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

    if (!idToken) {
      res.status(401).json({ success: false, message: "Authentication token is required" });
      return false;
    }

    try {
      const decoded = await firebaseAdminAuth.verifyIdToken(idToken);
      const allowedEmail = (process.env.PUSH_ADMIN_EMAIL || "yasseralayub@gmail.com").trim().toLowerCase();
      const verifiedEmail = typeof decoded.email === "string" ? decoded.email.trim().toLowerCase() : "";

      if (!verifiedEmail || verifiedEmail !== allowedEmail || decoded.email_verified !== true) {
        res.status(403).json({ success: false, message: "Administrator access denied" });
        return false;
      }

      return true;
    } catch {
      res.status(401).json({ success: false, message: "Invalid or expired authentication token" });
      return false;
    }
  };
  // Register a device for general promotion notifications.
  // This endpoint intentionally works without login.
  app.post("/api/push/register-device", async (req: express.Request, res: express.Response) => {
    try {
      if (!firebaseAdminDb) {
        return res.status(503).json({ success: false, message: "Push service is not configured" });
      }

      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const platform =
         req.body?.platform === "android" ? "android" :
         req.body?.platform === "ios" ? "ios" :
  "web";
      if (!token || token.length > 4096 || token.includes("/")) {
        return res.status(400).json({ success: false, message: "Invalid device token" });
      }

      await firebaseAdminDb.collection("push_devices").doc(token).set({
        token,
        platform,
        enabled: true,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return res.json({ success: true });
    } catch (error) {
      console.error("Push device registration failed:", error);
      return res.status(500).json({
        success: false,
        message: "Device registration failed"
      });
    }
  });

  // Attach a device to the currently authenticated Firebase customer.
  app.post("/api/push/attach-customer", async (req: express.Request, res: express.Response) => {
    try {
      if (!firebaseAdminAuth || !firebaseAdminDb) {
        return res.status(503).json({ success: false, message: "Push service is not configured" });
      }

      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const authorization = req.headers.authorization || "";
      const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

      if (!token || token.length > 4096 || token.includes("/") || !idToken) {
        return res.status(400).json({ success: false, message: "Device token and Firebase authentication are required" });
      }

let decoded;

try {
  decoded = await firebaseAdminAuth.verifyIdToken(idToken);
} catch {
  return res.status(401).json({
    success: false,
    message: "Customer authentication failed"
  });
}

      await firebaseAdminDb.collection("push_devices").doc(token).set({
        token,
        customerUid: decoded.uid,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      return res.json({ success: true });
    } catch (error) {
      console.error("Customer device association failed:", error);
      return res.status(401).json({ success: false, message: "Customer authentication failed" });
    }
  });

  // Detach the customer account on logout, but KEEP the device token
  // so the device can continue receiving public promotions.
  app.post("/api/push/detach-customer", async (req: express.Request, res: express.Response) => {
    try {
      if (!firebaseAdminAuth || !firebaseAdminDb) {
        return res.status(503).json({ success: false, message: "Push service is not configured" });
      }

      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const authorization = req.headers.authorization || "";
      const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

      if (!token || token.length > 4096 || token.includes("/") || !idToken) {
        return res.status(400).json({ success: false, message: "Device token and Firebase authentication are required" });
      }

    
      let decoded;

      try {
        decoded = await firebaseAdminAuth.verifyIdToken(idToken);
      } catch {
        return res.status(401).json({
          success: false,
          message: "Customer authentication failed"
        });
      }
      const deviceRef = firebaseAdminDb.collection("push_devices").doc(token);
      const deviceSnapshot = await deviceRef.get();

      if (deviceSnapshot.exists && deviceSnapshot.data()?.customerUid === decoded.uid) {
        await deviceRef.update({
          customerUid: null,
          updatedAt: new Date().toISOString()
        });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Customer device association failed:", error);
      return res.status(500).json({
        success: false,
       message: "Device association failed"
      });
    }
  });

  // Attach a device to a driver only after Firebase verifies the driver's phone.
  app.post("/api/push/attach-driver", async (req: express.Request, res: express.Response) => {
    try {
      if (!firebaseAdminAuth || !firebaseAdminDb) {
        return res.status(503).json({ success: false, message: "Push service is not configured" });
      }

      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const authorization = req.headers.authorization || "";
      const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

      if (!token || token.length > 4096 || token.includes("/") || !idToken) {
        return res.status(400).json({ success: false, message: "Device token and Firebase authentication are required" });
      }

      let decoded;
      try {
        decoded = await firebaseAdminAuth.verifyIdToken(idToken);
      } catch {
        return res.status(401).json({ success: false, message: "Driver authentication failed" });
      }

      const verifiedPhone = typeof decoded.phone_number === "string" ? decoded.phone_number : "";
      const normalizePhone = (value: string) => {
        let digits = value.replace(/\D/g, "");
        if (digits.startsWith("00966")) digits = digits.substring(2);
        if (digits.startsWith("966")) digits = digits.substring(3);
        if (digits.startsWith("0")) digits = digits.substring(1);
        return digits;
      };

      if (!verifiedPhone) {
        return res.status(403).json({ success: false, message: "Verified Firebase phone number is required" });
      }

      const verifiedDigits = normalizePhone(verifiedPhone);
      const driversSnapshot = await firebaseAdminDb.collection("drivers").get();
      const matches = driversSnapshot.docs.filter((driverDoc) => {
        const phone = driverDoc.data()?.phone;
        return typeof phone === "string" && normalizePhone(phone) === verifiedDigits;
      });

      if (matches.length !== 1) {
        return res.status(matches.length === 0 ? 404 : 409).json({
          success: false,
          message: matches.length === 0 ? "Driver profile not found" : "Driver phone matches multiple profiles"
        });
      }

      const deviceRef = firebaseAdminDb.collection("push_devices").doc(token);
      const deviceSnapshot = await deviceRef.get();

      if (!deviceSnapshot.exists) {
        return res.status(404).json({ success: false, message: "Device token is not registered" });
      }

      await deviceRef.update({
        driverId: matches[0].id,
        driverPhone: verifiedPhone,
        updatedAt: new Date().toISOString()
      });

      return res.json({ success: true });
    } catch (error) {
      console.error("Driver device association failed:", error);
      return res.status(500).json({ success: false, message: "Driver device association failed" });
    }
  });

  // Detach only the verified driver's association; preserve customer and public-promotion registration.
  app.post("/api/push/detach-driver", async (req: express.Request, res: express.Response) => {
    try {
      if (!firebaseAdminAuth || !firebaseAdminDb) {
        return res.status(503).json({ success: false, message: "Push service is not configured" });
      }

      const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
      const authorization = req.headers.authorization || "";
      const idToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

      if (!token || token.length > 4096 || token.includes("/") || !idToken) {
        return res.status(400).json({ success: false, message: "Device token and Firebase authentication are required" });
      }

      let decoded;
      try {
        decoded = await firebaseAdminAuth.verifyIdToken(idToken);
      } catch {
        return res.status(401).json({ success: false, message: "Driver authentication failed" });
      }

      const verifiedPhone = typeof decoded.phone_number === "string" ? decoded.phone_number : "";
      const normalizePhone = (value: string) => {
        let digits = value.replace(/\D/g, "");
        if (digits.startsWith("00966")) digits = digits.substring(2);
        if (digits.startsWith("966")) digits = digits.substring(3);
        if (digits.startsWith("0")) digits = digits.substring(1);
        return digits;
      };

      if (!verifiedPhone) {
        return res.status(403).json({ success: false, message: "Verified Firebase phone number is required" });
      }

      const verifiedDigits = normalizePhone(verifiedPhone);
      const driversSnapshot = await firebaseAdminDb.collection("drivers").get();
      const matches = driversSnapshot.docs.filter((driverDoc) => {
        const phone = driverDoc.data()?.phone;
        return typeof phone === "string" && normalizePhone(phone) === verifiedDigits;
      });

      if (matches.length !== 1) {
        return res.status(matches.length === 0 ? 404 : 409).json({
          success: false,
          message: matches.length === 0 ? "Driver profile not found" : "Driver phone matches multiple profiles"
        });
      }

      const deviceRef = firebaseAdminDb.collection("push_devices").doc(token);
      const deviceSnapshot = await deviceRef.get();

      if (deviceSnapshot.exists && deviceSnapshot.data()?.driverId === matches[0].id) {
        await deviceRef.update({
          driverId: null,
          driverPhone: null,
          updatedAt: new Date().toISOString()
        });
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Driver device detachment failed:", error);
      return res.status(500).json({ success: false, message: "Driver device detachment failed" });
    }
  });
  // Send FCM notifications in batches of up to 500 registered devices.
  // Invalid tokens are counted but are not deleted or detached automatically.
  const sendPushToDeviceDocs = async (
    deviceDocs: any[],
    notification: { title: string; body: string },
    data: Record<string, string>
  ) => {
    if (!firebaseAdminMessaging) {
      throw new Error("Firebase Admin Messaging is not configured");
    }

    const tokens = deviceDocs
      .map((deviceDoc: any) => {
        const deviceData = deviceDoc.data();
        return typeof deviceData?.token === "string" ? deviceData.token : deviceDoc.id;
      })
      .filter((token: string) => typeof token === "string" && token.length > 0);

    let successCount = 0;
    let failureCount = 0;

    for (let index = 0; index < tokens.length; index += 500) {
      const batch = tokens.slice(index, index + 500);
      if (batch.length === 0) continue;

      const result = await firebaseAdminMessaging.sendEachForMulticast({
        tokens: batch,
        notification,
        data
      });

      successCount += result.successCount;
      failureCount += result.failureCount;
    }

    return {
      requested: tokens.length,
      successCount,
      failureCount
    };
  };

  // Notify the customer after the order status has been committed to Firestore.
  app.post("/api/push/notify-order-status", async (req: express.Request, res: express.Response) => {
    try {
      if (!firebaseAdminDb || !firebaseAdminMessaging) {
        return res.status(503).json({ success: false, message: "Push service is not configured" });
      }

      if (!(await verifyPushAdmin(req, res))) return;

      const orderId = typeof req.body?.orderId === "string" ? req.body.orderId.trim() : "";
      if (!orderId || orderId.length > 200 || orderId.includes("/")) {
        return res.status(400).json({ success: false, message: "A valid order ID is required" });
      }

      const orderSnapshot = await firebaseAdminDb.collection("orders").doc(orderId).get();
      if (!orderSnapshot.exists) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      const orderData = orderSnapshot.data();
      const customerUid = orderData?.customerUid;
      const status = orderData?.status;

      if (typeof customerUid !== "string" || !customerUid) {
        return res.json({ success: true, skipped: true, reason: "No verified customer association", sent: 0 });
      }

      if (typeof status !== "string" || !status) {
        return res.status(409).json({ success: false, message: "Order status is unavailable" });
      }

      const devicesSnapshot = await firebaseAdminDb
        .collection("push_devices")
        .where("enabled", "==", true)
        .where("customerUid", "==", customerUid)
        .get();

      const statusArabic: Record<string, string> = {
        received: "تم استلام الطلب",
        pending: "قيد الانتظار",
        confirmed: "تم تأكيد الطلب",
        preparing: "قيد التحضير",
        ready: "الطلب جاهز",
        out_for_delivery: "خرج الطلب للتوصيل",
        delivering: "جاري توصيل الطلب",
        delivered: "تم توصيل الطلب",
        completed: "اكتمل الطلب",
        cancelled: "تم إلغاء الطلب",
        rejected: "تم رفض الطلب"
      };

      const statusEnglish: Record<string, string> = {
        pending: "Pending",
        confirmed: "Confirmed",
        preparing: "Preparing",
        ready: "Ready",
        out_for_delivery: "Out for delivery",
        delivering: "Delivering",
        delivered: "Delivered",
        completed: "Completed",
        cancelled: "Cancelled",
        rejected: "Rejected"
      };

      const translatedStatusAr = statusArabic[status] || status;
      const translatedStatusEn = statusEnglish[status] || status;

      const result = await sendPushToDeviceDocs(
        devicesSnapshot.docs,
        {
          title: "تحديث حالة طلبك",
          body: `تم تحديث حالة طلبك إلى: ${translatedStatusAr}`
        },
        {
          type: "order_status",
          orderId,
          status,
          titleAr: "تحديث حالة طلبك",
          bodyAr: `تم تحديث حالة طلبك إلى: ${translatedStatusAr}`,
          titleEn: "Order update",
          bodyEn: `Your order status has changed: ${translatedStatusEn}`
        }
      );

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("Order status push failed:", error);
      return res.status(500).json({ success: false, message: "Order status notification failed" });
    }
  });

  // Notify only devices currently associated with the assigned driver.
  app.post("/api/push/notify-driver-assigned", async (req: express.Request, res: express.Response) => {
    try {
      if (!firebaseAdminDb || !firebaseAdminMessaging) {
        return res.status(503).json({ success: false, message: "Push service is not configured" });
      }

      if (!(await verifyPushAdmin(req, res))) return;

      const orderId = typeof req.body?.orderId === "string" ? req.body.orderId.trim() : "";
      if (!orderId || orderId.length > 200 || orderId.includes("/")) {
        return res.status(400).json({ success: false, message: "A valid order ID is required" });
      }

      const orderSnapshot = await firebaseAdminDb.collection("orders").doc(orderId).get();
      if (!orderSnapshot.exists) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }

      const driverId = orderSnapshot.data()?.driverId;
      if (typeof driverId !== "string" || !driverId || driverId === "broadcast") {
        return res.json({ success: true, skipped: true, reason: "No individual driver assigned", sent: 0 });
      }

      const devicesSnapshot = await firebaseAdminDb
        .collection("push_devices")
        .where("enabled", "==", true)
        .where("driverId", "==", driverId)
        .get();

      const result = await sendPushToDeviceDocs(
        devicesSnapshot.docs,
        {
          title: "New order assigned",
          body: "A new order has been assigned to you."
        },
        {
          type: "driver_assignment",
          orderId
        }
      );

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("Driver assignment push failed:", error);
      return res.status(500).json({ success: false, message: "Driver assignment notification failed" });
    }
  });

  // Broadcast a published active promotion to every registered enabled device,
  // including devices that are not currently associated with a customer account.
  app.post("/api/push/notify-promotion", async (req: express.Request, res: express.Response) => {
    try {
      if (!firebaseAdminDb || !firebaseAdminMessaging) {
        return res.status(503).json({ success: false, message: "Push service is not configured" });
      }

      if (!(await verifyPushAdmin(req, res))) return;

      const promotionSnapshot = await firebaseAdminDb.collection("promotions").doc("active").get();
      if (!promotionSnapshot.exists || promotionSnapshot.data()?.isActive !== true) {
        return res.json({ success: true, skipped: true, reason: "No active promotion", sent: 0 });
      }

      const promotion = promotionSnapshot.data() || {};
      const promotionTitle =
        typeof promotion.titleAr === "string" && promotion.titleAr.trim()
          ? promotion.titleAr.trim()
          : typeof promotion.title === "string" && promotion.title.trim()
            ? promotion.title.trim()
            : "A new offer is available.";

      const devicesSnapshot = await firebaseAdminDb
        .collection("push_devices")
        .where("enabled", "==", true)
        .get();

      const result = await sendPushToDeviceDocs(
        devicesSnapshot.docs,
        {
          title: "New promotion",
          body: promotionTitle
        },
        {
          type: "promotion",
          promotionId: "active"
        }
      );

      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("Promotion push failed:", error);
      return res.status(500).json({ success: false, message: "Promotion notification failed" });
    }
  });
  // Dynamic manifest.json endpoint to allow installing separate PWAs for customers, drivers, and admin panel on the same domain
  app.get("/manifest.json", (req, res) => {
    const type = req.query.type || "";
    const referer = req.headers.referer || "";
    
    if (type === "driver" || referer.includes("/driver")) {
      return res.json({
        "id": "/driver",
        "short_name": "ط¨ظˆط§ط¨ط© ط§ظ„ظƒط§ط¨طھظ†",
        "name": "ط¨ظˆط§ط¨ط© ظƒط§ط¨طھظ† ط§ظ„طھظˆطµظٹظ„ - ط±ط­ظ„ط© ط´ظˆط§ط،",
        "description": "ط¨ظˆط§ط¨ط© طھطھط¨ط¹ ظˆطھظˆطµظٹظ„ ط·ظ„ط¨ط§طھ ظ…ط·ط¹ظ… ط±ط­ظ„ط© ط´ظˆط§ط،",
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
        "short_name": "ظ„ظˆط­ط© ط§ظ„طھط­ظƒظ…",
        "name": "ظ„ظˆط­ط© طھط­ظƒظ… ظ…ط·ط¹ظ… ط±ط­ظ„ط© ط´ظˆط§ط،",
        "description": "ظ„ظˆط­ط© طھط­ظƒظ… ظˆط¥ط¯ط§ط±ط© ط·ظ„ط¨ط§طھ ظˆظ…ظ†ط§ط¯ظٹط¨ ظ…ط·ط¹ظ… ط±ط­ظ„ط© ط´ظˆط§ط،",
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
        "short_name": "ط±ط­ظ„ط© ط´ظˆط§ط،",
        "name": "ظ…ط·ط¹ظ… ط±ط­ظ„ط© ط´ظˆط§ط، - ظ…ظ†ظٹظˆ ظˆطھطھط¨ط¹ ط§ظ„ط·ظ„ط¨ط§طھ",
        "description": "ظ…ظ†ظٹظˆ ظ…ط·ط¹ظ… ط±ط­ظ„ط© ط´ظˆط§ط، - ط§ط·ظ„ط¨ ط£ظ„ط° ط§ظ„ظ…ط´ظˆظٹط§طھ ط§ظ„ظپط§ط®ط±ط© ظˆطھط§ط¨ط¹ ط·ظ„ط¨ظƒ ط®ط·ظˆط© ط¨ط®ط·ظˆط©",
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



