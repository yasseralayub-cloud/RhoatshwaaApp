var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// server.ts
var server_exports = {};
__export(server_exports, {
  default: () => server_default
});
module.exports = __toCommonJS(server_exports);
var import_dotenv = __toESM(require("dotenv"), 1);
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_dns = __toESM(require("dns"), 1);
var import_genai = require("@google/genai");
import_dotenv.default.config();
import_dns.default.setDefaultResultOrder("ipv4first");
function cleanAddressLocal(raw) {
  if (!raw) return "\u0645\u0648\u0642\u0639 \u0645\u062C\u0647\u0648\u0644";
  let cleaned = raw.replace(/\b\d{5}\b/g, "").trim();
  const parts = cleaned.split(/[،,]/).map((p) => p.trim()).filter(Boolean);
  const cleanedParts = parts.filter((part) => {
    const lowerPart = part.toLowerCase();
    const isCountry = /^(السعودية|المملكة العربية السعودية|Saudi Arabia|KSA)$/i.test(part);
    const isPostalCode = /^\d{5}$/.test(part);
    const isShortPostal = /^\d{4}$/.test(part);
    const isRedundantAlQassim = lowerPart === "\u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0642\u0635\u064A\u0645" && parts.some((p) => p.includes("\u0639\u064A\u0648\u0646 \u0627\u0644\u062C\u0648\u0627\u0621"));
    return !isCountry && !isPostalCode && !isShortPostal && !isRedundantAlQassim && part.length > 0;
  });
  let result = cleanedParts.join("\u060C ");
  result = result.replace(/\s+/g, " ").replace(/،\s*،/g, "\u060C").trim();
  if (result.startsWith("\u060C")) result = result.slice(1).trim();
  if (result.endsWith("\u060C")) result = result.slice(0, -1).trim();
  return result || "\u0645\u0648\u0642\u0639 \u0645\u062C\u0647\u0648\u0644";
}
var app = (0, import_express.default)();
var PORT = 3e3;
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.post("/api/expand-url", async (req, res) => {
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
  } catch (err) {
    console.error("Error expanding URL on server:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to expand Google Maps shortened URL"
    });
  }
});
app.post("/api/pay-tap", async (req, res) => {
  try {
    const { orderId, amount, customerName, customerPhone, customerEmail, redirectOrigin } = req.body;
    if (!orderId || !amount || !customerName || !customerPhone) {
      return res.status(400).json({
        success: false,
        message: "Required parameters missing (orderId, amount, customerName, customerPhone)"
      });
    }
    const nameParts = customerName.trim().split(/\s+/);
    const firstName = nameParts[0] || "Customer";
    const lastName = nameParts.slice(1).join(" ") || "Client";
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
      const mockTapId = `chg_mock${Math.floor(1e5 + Math.random() * 9e5)}`;
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
        email,
        phone: {
          country_code: countryCode,
          number: phoneNumberOnly
        }
      },
      source: {
        id: "src_all"
        // Activates mada, Visa, Mastercard, Apple Pay depending on payer browser & cards
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
    const responseData = await tapResponse.json();
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
  } catch (err) {
    console.error("Exception during Tap charge initialization:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error occurred configuring payment gateway session."
    });
  }
});
app.get("/api/check-tap-status/:chargeId", async (req, res) => {
  try {
    const { chargeId } = req.params;
    if (!chargeId) {
      return res.status(400).json({ success: false, message: "Missing charge ID reference value" });
    }
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
    const responseData = await tapResponse.json();
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
      status: responseData.status,
      // e.g. "CAPTURED", "FAILED", "CANCELLED"
      metadata: responseData.metadata,
      amount: responseData.amount,
      currency: responseData.currency,
      gatewayResponse: responseData
    });
  } catch (err) {
    console.error("Exception verifying Tap transaction details:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal error querying payment gateway validation."
    });
  }
});
app.post("/api/notify-telegram", async (req, res) => {
  try {
    const { order, telegramBotToken, telegramChatId, telegramBotEnabled } = req.body;
    if (!order || !order.id) {
      return res.status(400).json({ success: false, message: "Missing order details" });
    }
    if (telegramBotEnabled === false) {
      return res.json({
        success: true,
        message: "Telegram alerts are disabled in business settings.",
        isConfigured: false
      });
    }
    const decodeB64 = (encoded) => {
      try {
        return Buffer.from(encoded, "base64").toString("utf-8");
      } catch {
        return "";
      }
    };
    const obfuscatedBotToken = decodeB64("ODY3NDE4MjE5NjpBQUhpSUpzSUtDLXNwb2pwVTJPemRObFVjUUVDUGZNMDZn");
    const obfuscatedChatId = decodeB64("NTI0MTMxMzczNw==");
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
    const obfuscatedSheetsWebhookUrl = decodeB64("aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4emNPNU1xWm93X0s5QkMwMlB3WWRaQ2RfVVNzd3FkLXJjQmhibERxZFVHaWN6TWR3Z3pxQ09jV2VjZEpiRTZmcC1RUS9leGVj");
    const sheetsWebhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL || obfuscatedSheetsWebhookUrl;
    if (sheetsWebhookUrl) {
      try {
        const itemsSummary = order.items.map((it) => `${it.nameAr || it.name} (${it.quantity}x)`).join(", ");
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
            createdAt: order.createdAt || (/* @__PURE__ */ new Date()).toISOString()
          })
        }).catch((e) => console.warn("Google Sheets API forwarding failed:", e));
      } catch (sheetsErr) {
        console.warn("Error forwarding order data to Google Sheets:", sheetsErr);
      }
    }
    const itemsList = order.items.map((it) => {
      return `\u2022 *${it.nameAr || it.name}*
   \u0627\u0644\u0639\u062F\u062F: ${it.quantity} | \u0627\u0644\u0633\u0639\u0631: ${it.price.toFixed(1)} \u0631\u064A\u0627\u0644`;
    }).join("\n\n");
    const orderType = order.tableOrDelivery === "table" ? `\u{1F37D}\uFE0F \u0637\u0644\u0628 \u0645\u062D\u0644\u064A (\u062F\u0627\u062E\u0644 \u0627\u0644\u0635\u0627\u0644\u0629)` : `\u{1F6CD}\uFE0F \u0637\u0644\u0628 \u0633\u0641\u0631\u064A (\u062E\u0627\u0631\u062C \u0627\u0644\u0645\u0637\u0639\u0645)`;
    const notesText = order.notes ? `\u{1F4DD} *\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0627\u0644\u0637\u0644\u0628:* ${order.notes}
` : "";
    const payMethod = order.paymentMethod === "cod" ? "\u{1F4B5} \u0627\u0644\u062F\u0641\u0639 \u0639\u0646\u062F \u0627\u0644\u0627\u0633\u062A\u0644\u0627\u0645 (\u0643\u0627\u0634)" : order.paymentMethod === "applepay" ? "\u{1F34E} \u0622\u0628\u0644 \u0628\u0627\u064A (\u0645\u062F\u0641\u0648\u0639 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A)" : "\u{1F4B3} \u0645\u062F\u0649 / \u0628\u0637\u0627\u0642\u0629 \u0628\u0646\u0643\u064A\u0629 (\u0645\u062F\u0641\u0648\u0639 \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A)";
    const promoText = order.promoDiscount && order.promoDiscount > 0 ? `*\u062E\u0635\u0645 \u0627\u0644\u0643\u0648\u0628\u0648\u0646:* -${order.promoDiscount.toFixed(2)} \u0631\u064A\u0627\u0644
` : "";
    const messageText = `\u{1F514} *\u0637\u0644\u0628 \u062C\u062F\u064A\u062F \u0641\u064A Grill Journey!* \u{1F362}\u{1F964}

*\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628:* \`${order.id}\`
*\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644:* ${order.customerName}
*\u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644:* \`${order.customerPhone}\`
*\u0646\u0648\u0639 \u0627\u0644\u0637\u0644\u0628:* ${orderType}
` + notesText + `
*\u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629:*

${itemsList}

*\u0627\u0644\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0641\u0631\u0639\u064A:* ${order.subtotal.toFixed(2)} \u0631\u064A\u0627\u0644
` + promoText + `*\u0627\u0644\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629:* ${order.tax.toFixed(2)} \u0631\u064A\u0627\u0644
*\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0646\u0647\u0627\u0626\u064A:* *${order.total.toFixed(2)} \u0631\u064A\u0627\u0644*

*\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062F\u0641\u0639:* ${payMethod}

\u26A1 _\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0647\u0630\u0627 \u0627\u0644\u062A\u0646\u0628\u064A\u0647 \u0641\u0648\u0631 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u0637\u0644\u0628 \u0641\u064A \u062C\u0647\u0627\u0632 \u0627\u0644\u0639\u0645\u064A\u0644_`;
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
  } catch (telegramErr) {
    console.error("Exception handling Telegram dispatch:", telegramErr);
    return res.status(500).json({
      success: false,
      message: telegramErr.message || "Failed to route Telegram notification webhook."
    });
  }
});
app.post("/api/send-sms", async (req, res) => {
  try {
    const { phone, code, language } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ success: false, message: "Missing phone or code parameters" });
    }
    const lang = language === "ar" ? "ar" : "en";
    const messageText = lang === "ar" ? `\u0631\u0645\u0632 \u0627\u0644\u062A\u062D\u0642\u0642 \u0627\u0644\u062E\u0627\u0635 \u0628\u0643 \u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0641\u064A \u062A\u0637\u0628\u064A\u0642 \u0631\u062D\u0644\u0629 \u0634\u0648\u0627\u0621 \u0647\u0648: ${code}` : `Your verification code for Grill Journey app is: ${code}`;
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
        const resData = await taqnyatResponse.json();
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
        const resData = await twilioResponse.json();
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
    console.log(`Simulated SMS sent to: ${phone}. Code: ${code}`);
    return res.json({
      success: true,
      isSimulated: true,
      message: "SMS Gateway is not configured, or dispatch failed. Fell back to simulation mode.",
      code
    });
  } catch (err) {
    console.error("Exception in send-sms API:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to process SMS request" });
  }
});
app.post("/api/notify-driver-registration", async (req, res) => {
  try {
    const { name, phone, carRegistrationImg } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ success: false, message: "Missing registration details" });
    }
    const decodeB64 = (encoded) => {
      try {
        return Buffer.from(encoded, "base64").toString("utf-8");
      } catch {
        return "";
      }
    };
    const obfuscatedBotToken = decodeB64("ODY3NDE4MjE5NjpBQUhpSUpzSUtDLXNwb2pwVTJPemRObFVjUUVDUGZNMDZn");
    const obfuscatedChatId = decodeB64("NTI0MTMxMzczNw==");
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
    const captionText = `\u{1F6B4} *\u0637\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 \u0643\u0627\u0628\u062A\u0646 (\u0645\u0646\u062F\u0648\u0628) \u062C\u062F\u064A\u062F!* \u{1F4CB}

\u{1F464} *\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u062B\u0646\u0627\u0626\u064A:* ${name}
\u{1F4DE} *\u0631\u0642\u0645 \u0627\u0644\u062C\u0648\u0627\u0644:* \`${phone}\`

\u26A1 _\u064A\u0631\u062C\u0649 \u0645\u0631\u0627\u062C\u0639\u0629 \u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0644\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u064A\u0647 \u0623\u0648 \u0631\u0641\u0636\u0647._`;
    let telegramResponse;
    if (carRegistrationImg && carRegistrationImg.includes(";base64,")) {
      try {
        const parts = carRegistrationImg.split(";base64,");
        const contentType = parts[0].split(":")[1] || "image/jpeg";
        const base64Data = parts[1];
        const buffer = Buffer.from(base64Data, "base64");
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
          text: captionText + `

\u26A0\uFE0F _(\u062A\u0639\u0630\u0631 \u0625\u0631\u0641\u0627\u0642 \u0635\u0648\u0631\u0629 \u0627\u0644\u0627\u0633\u062A\u0645\u0627\u0631\u0629 \u0628\u0627\u0644\u062A\u0644\u062C\u0631\u0627\u0645\u060C \u064A\u0631\u062C\u0649 \u0631\u0624\u064A\u062A\u0647\u0627 \u0628\u0644\u0648\u062D\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629)_`,
          parse_mode: "Markdown"
        })
      });
    }
    const data = await telegramResponse.json();
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
  } catch (telegramErr) {
    console.error("Exception handling Telegram registration dispatch:", telegramErr);
    return res.status(500).json({
      success: false,
      message: telegramErr.message || "Failed to route Telegram notification webhook."
    });
  }
});
app.post("/api/reverse-geocode", async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (lat === void 0 || lng === void 0) {
      return res.status(400).json({ success: false, message: "Coordinates (lat and lng) are required" });
    }
    const latitude = Number(lat);
    const longitude = Number(lng);
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAP_API_KEY || process.env.GOOGLE_API_KEY;
    let source = "nominatim";
    let rawAddress = "";
    if (apiKey && apiKey.startsWith("AIzaSy") && !apiKey.includes("YOUR_KEY_HERE")) {
      try {
        const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=ar`;
        const response = await fetch(googleUrl);
        if (response.ok) {
          const data = await response.json();
          if (data && data.status === "OK" && data.results && data.results.length > 0) {
            rawAddress = data.results[0].formatted_address || "";
            source = "google";
          }
        }
      } catch (err) {
        console.warn("Server-side Google reverse geocoding failed, falling back:", err);
      }
    }
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
          const data = await response.json();
          rawAddress = data.display_name || "";
        }
      } catch (err) {
        console.warn("Server-side Nominatim reverse geocode failed:", err);
      }
    }
    let processedAddress = cleanAddressLocal(rawAddress);
    return res.json({ success: true, address: processedAddress });
  } catch (err) {
    console.error("Exception in reverse-geocode API:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.post("/api/geocode", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, message: "Query is required" });
    }
    const queryStr = String(query).trim();
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
    const apiKey = process.env.GOOGLE_MAPS_PLATFORM_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAP_API_KEY || process.env.GOOGLE_API_KEY;
    let googleResult = null;
    if (apiKey && apiKey.startsWith("AIzaSy") && !apiKey.includes("YOUR_KEY_HERE")) {
      try {
        let localizedQuery = queryStr;
        const lowerQ = queryStr.toLowerCase();
        const isBuraidah = lowerQ.includes("\u0628\u0631\u064A\u062F\u0629") || lowerQ.includes("buraidah") || lowerQ.includes("buraydah");
        if (isBuraidah) {
          if (!lowerQ.includes("\u0642\u0635\u064A\u0645") && !lowerQ.includes("qassim")) {
            localizedQuery = `${queryStr}\u060C \u0628\u0631\u064A\u062F\u0629\u060C \u0627\u0644\u0642\u0635\u064A\u0645`;
          }
        } else if (!lowerQ.includes("\u0633\u0639\u0648\u062F") && !lowerQ.includes("saudi") && !lowerQ.includes("\u0642\u0635\u064A\u0645") && !lowerQ.includes("\u062C\u0648\u0627\u0621")) {
          const buraidahNeighborhoods = ["\u0641\u0627\u064A\u0632\u064A\u0629", "fayziyah", "\u0625\u0633\u0643\u0627\u0646", "eskan", "\u0631\u064A\u0627\u0646", "rayan", "\u0635\u0641\u0631\u0627\u0621", "safra", "\u0623\u0641\u0642", "ofuq", "\u0628\u0633\u0627\u062A\u064A\u0646", "basatin", "\u0633\u0644\u0637\u0627\u0646\u0629", "sultanah", "\u063A\u062F\u064A\u0631", "ghadir"];
          const isLikelyBuraidah = buraidahNeighborhoods.some((n) => lowerQ.includes(n));
          if (isLikelyBuraidah) {
            localizedQuery = `${queryStr}\u060C \u0628\u0631\u064A\u062F\u0629\u060C \u0627\u0644\u0642\u0635\u064A\u0645`;
          } else {
            localizedQuery = `${queryStr}\u060C \u0627\u0644\u0642\u0635\u064A\u0645\u060C \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629`;
          }
        }
        const googleUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(localizedQuery)}&key=${apiKey}&language=ar&region=sa&components=country:SA`;
        const response = await fetch(googleUrl);
        if (response.ok) {
          const data = await response.json();
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
    let nominatimResult = null;
    if (!googleResult) {
      try {
        let localizedQuery = queryStr;
        const lowerQ = queryStr.toLowerCase();
        const isBuraidah = lowerQ.includes("\u0628\u0631\u064A\u062F\u0629") || lowerQ.includes("buraidah") || lowerQ.includes("buraydah");
        if (isBuraidah) {
          if (!lowerQ.includes("\u0642\u0635\u064A\u0645") && !lowerQ.includes("qassim")) {
            localizedQuery = `${queryStr}\u060C \u0628\u0631\u064A\u062F\u0629\u060C \u0627\u0644\u0642\u0635\u064A\u0645`;
          }
        } else if (!lowerQ.includes("\u0633\u0639\u0648\u062F") && !lowerQ.includes("saudi") && !lowerQ.includes("\u0642\u0635\u064A\u0645") && !lowerQ.includes("\u062C\u0648\u0627\u0621")) {
          const buraidahNeighborhoods = ["\u0641\u0627\u064A\u0632\u064A\u0629", "fayziyah", "\u0625\u0633\u0643\u0627\u0646", "eskan", "\u0631\u064A\u0627\u0646", "rayan", "\u0635\u0641\u0631\u0627\u0621", "safra", "\u0623\u0641\u0642", "ofuq", "\u0628\u0633\u0627\u062A\u064A\u0646", "basatin", "\u0633\u0644\u0637\u0627\u0646\u0629", "sultanah", "\u063A\u062F\u064A\u0631", "ghadir"];
          const isLikelyBuraidah = buraidahNeighborhoods.some((n) => lowerQ.includes(n));
          if (isLikelyBuraidah) {
            localizedQuery = `${queryStr}\u2022 \u0628\u0631\u064A\u062F\u0629\u060C \u0627\u0644\u0642\u0635\u064A\u0645`;
            localizedQuery = `${queryStr}\u060C \u0628\u0631\u064A\u062F\u0629\u060C \u0627\u0644\u0642\u0635\u064A\u0645`;
          } else {
            localizedQuery = `${queryStr}\u060C \u0627\u0644\u0642\u0635\u064A\u0645\u060C \u0627\u0644\u0633\u0639\u0648\u062F\u064A\u0629`;
          }
        }
        const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(localizedQuery)}&limit=1&countrycodes=sa&accept-language=ar`;
        const response = await fetch(osmUrl, {
          headers: {
            "User-Agent": "GrillJourneyDelivery/1.0 (yasseralayub@gmail.com)"
          }
        });
        if (response.ok) {
          const data = await response.json();
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
    if (activeResult) {
      return res.json({
        success: true,
        lat: activeResult.lat,
        lng: activeResult.lng,
        address: cleanAddressLocal(activeResult.address)
      });
    }
    let geminiResult = null;
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new import_genai.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `You are an expert geocoding AI assistant for both Buraidah (\u0628\u0631\u064A\u062F\u0629) and Uyun Al-Jiwa (\u0639\u064A\u0648\u0646 \u0627\u0644\u062C\u0648\u0627\u0621) in the Al-Qassim region, Saudi Arabia.
The user searched for this location text: "${queryStr}".
Google/OSM returned this potential coordinate: None.

Determine the best latitude and longitude coordinates in Saudi Arabia for this search query.
Focus highly on Buraidah (approx Lat 26.3260, Lng 43.9750) and Uyun Al-Jiwa (approx Lat 26.5057, Lng 43.7915) in the Al-Qassim province.
If the search query mentions a Buraidah neighborhood (such as \u062D\u064A \u0627\u0644\u0625\u0633\u0643\u0627\u0646\u060C \u062D\u064A \u0627\u0644\u0641\u0627\u064A\u0632\u064A\u0629\u060C \u062D\u064A \u0627\u0644\u0635\u0641\u0631\u0627\u0621\u060C \u062D\u064A \u0627\u0644\u0631\u064A\u0627\u0646\u060C \u062D\u064A \u0627\u0644\u0623\u0641\u0642\u060C \u062D\u064A \u0633\u0644\u0637\u0627\u0646\u0629\u060C \u062D\u064A \u0627\u0644\u063A\u062F\u064A\u0631\u060C \u062D\u064A \u0627\u0644\u0628\u0633\u0627\u062A\u064A\u0646\u060C \u0625\u0644\u062E), return the accurate or approximate coordinates of that neighborhood in Buraidah.
If the search query mentions a neighborhood in Uyun Al-Jiwa (like \u062D\u064A \u0627\u0644\u0631\u0648\u0636\u0629\u060C \u062D\u064A \u0627\u0644\u0645\u0644\u0643 \u0641\u0647\u062F\u060C \u062D\u064A \u0627\u0644\u062E\u0627\u0644\u062F\u064A\u0629\u060C \u062D\u064A \u0627\u0644\u0645\u0646\u062A\u0632\u0647\u060C \u062D\u064A \u0627\u0644\u0633\u0644\u064A\u0645\u064A\u0629\u060C \u0625\u0644\u062E), return the exact or approximate coordinates of that neighborhood in Uyun Al-Jiwa.
If the query is generic, default to the center of Buraidah (Lat 26.3260, Lng 43.9750) or Uyun Al-Jiwa (Lat 26.5057, Lng 43.7915) or Al-Qassim.

Return ONLY a valid JSON object. Do not wrap in markdown blocks.
JSON format:
{
  "success": true,
  "lat": 26.5057,
  "lng": 43.7915,
  "address": "\u062D\u064A \u0627\u0644\u0631\u0648\u0636\u0629\u060C \u0639\u064A\u0648\u0646 \u0627\u0644\u062C\u0648\u0627\u0621"
}
If you cannot find or approximate the location at all, return:
{
  "success": false,
  "message": "\u0644\u0645 \u0646\u062A\u0645\u0643\u0646 \u0645\u0646 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0642\u0639 \u0628\u062F\u0642\u0629\u060C \u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0627\u0633\u0645 \u0627\u0644\u062D\u064A \u0648\u0627\u0644\u0634\u0627\u0631\u0639 \u0628\u0634\u0643\u0644 \u0623\u0648\u0636\u062D"
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
      } catch (geminiErr) {
        console.warn("Gemini geocoding fallback bypassed (quota/rate-limit):", geminiErr?.message || geminiErr);
      }
    }
    if (geminiResult) {
      return res.json(geminiResult);
    } else {
      return res.json({
        success: false,
        message: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0627\u0644\u0645\u0648\u0642\u0639 \u0628\u062F\u0642\u0629\u060C \u064A\u0631\u062C\u0649 \u0643\u062A\u0627\u0628\u0629 \u0627\u0633\u0645 \u0627\u0644\u062D\u064A \u0648\u0627\u0644\u0634\u0627\u0631\u0639 \u0628\u0634\u0643\u0644 \u0623\u0648\u0636\u062D"
      });
    }
  } catch (err) {
    console.error("Exception in geocode API:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});
app.get("/manifest.json", (req, res) => {
  const type = req.query.type || "";
  const referer = req.headers.referer || "";
  if (type === "driver" || referer.includes("/driver")) {
    return res.json({
      "id": "/driver",
      "short_name": "\u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0643\u0627\u0628\u062A\u0646",
      "name": "\u0628\u0648\u0627\u0628\u0629 \u0643\u0627\u0628\u062A\u0646 \u0627\u0644\u062A\u0648\u0635\u064A\u0644 - \u0631\u062D\u0644\u0629 \u0634\u0648\u0627\u0621",
      "description": "\u0628\u0648\u0627\u0628\u0629 \u062A\u062A\u0628\u0639 \u0648\u062A\u0648\u0635\u064A\u0644 \u0637\u0644\u0628\u0627\u062A \u0645\u0637\u0639\u0645 \u0631\u062D\u0644\u0629 \u0634\u0648\u0627\u0621",
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
      "short_name": "\u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645",
      "name": "\u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0645\u0637\u0639\u0645 \u0631\u062D\u0644\u0629 \u0634\u0648\u0627\u0621",
      "description": "\u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 \u0648\u0625\u062F\u0627\u0631\u0629 \u0637\u0644\u0628\u0627\u062A \u0648\u0645\u0646\u0627\u062F\u064A\u0628 \u0645\u0637\u0639\u0645 \u0631\u062D\u0644\u0629 \u0634\u0648\u0627\u0621",
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
      "short_name": "\u0631\u062D\u0644\u0629 \u0634\u0648\u0627\u0621",
      "name": "\u0645\u0637\u0639\u0645 \u0631\u062D\u0644\u0629 \u0634\u0648\u0627\u0621 - \u0645\u0646\u064A\u0648 \u0648\u062A\u062A\u0628\u0639 \u0627\u0644\u0637\u0644\u0628\u0627\u062A",
      "description": "\u0645\u0646\u064A\u0648 \u0645\u0637\u0639\u0645 \u0631\u062D\u0644\u0629 \u0634\u0648\u0627\u0621 - \u0627\u0637\u0644\u0628 \u0623\u0644\u0630 \u0627\u0644\u0645\u0634\u0648\u064A\u0627\u062A \u0627\u0644\u0641\u0627\u062E\u0631\u0629 \u0648\u062A\u0627\u0628\u0639 \u0637\u0644\u0628\u0643 \u062E\u0637\u0648\u0629 \u0628\u062E\u0637\u0648\u0629",
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
async function startViteAndListen() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fullstack Express Server bound to host 0.0.0.0 and port ${PORT}`);
  });
}
if (!process.env.VERCEL) {
  startViteAndListen();
}
var server_default = app;
//# sourceMappingURL=server.cjs.map
