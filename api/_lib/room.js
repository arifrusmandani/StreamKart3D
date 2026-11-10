import crypto from "node:crypto";

export const ROOM_REGEX = /^room_[a-z0-9_]{4,48}$/;

function getMasterKey() {
  return process.env.MASTER_KEY || "streamkart_dev_master_secret_key_change_in_prod_2026";
}

export function sanitizeSlug(raw = "streamer") {
  const cleaned = String(raw || "streamer")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);
  return cleaned || "streamer";
}

export function generateRoomId(slug = "streamer") {
  const safeSlug = sanitizeSlug(slug);
  const rand = crypto.randomBytes(3).toString("hex");
  return `room_${safeSlug}_${rand}`;
}

export function deriveSecret(roomId) {
  return crypto
    .createHmac("sha256", getMasterKey())
    .update(String(roomId))
    .digest("hex")
    .slice(0, 24);
}

export function isValidSecret(roomId, secret) {
  if (!roomId || !ROOM_REGEX.test(String(roomId)) || typeof secret !== "string") {
    return false;
  }
  const expected = Buffer.from(deriveSecret(roomId));
  const provided = Buffer.from(secret);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}

/**
 * Validates Tako.id (and compatible HMAC SHA-256) webhook signatures:
 * Header: `X-Tako-Signature`
 * Algorithm: HMAC SHA-256 of `JSON.stringify(webhookBody)` (or raw body string) with `webhookToken`,
 * compared using `crypto.timingSafeEqual`.
 * If `webhookToken` is not configured in Tako, `X-Tako-Signature` will be empty.
 */
export function verifyTakoHmacSignature(
  webhookBody,
  webhookToken,
  takoSignatureFromHeader,
  rawBody = null
) {
  if (!webhookToken || !takoSignatureFromHeader) {
    return false;
  }

  // Strip optional "sha256=" prefix if sent by a provider
  const headerSig = String(takoSignatureFromHeader)
    .trim()
    .replace(/^sha256=/i, "");
  const headerBuf = Buffer.from(headerSig);

  // 1. Exact Tako specification: crypto.createHmac("sha256", webhookToken).update(JSON.stringify(webhookBody)).digest("hex")
  const computedSignature = crypto
    .createHmac("sha256", String(webhookToken))
    .update(JSON.stringify(webhookBody ?? {}))
    .digest("hex");

  const computedBuf = Buffer.from(computedSignature);
  if (
    computedBuf.length === headerBuf.length &&
    crypto.timingSafeEqual(computedBuf, headerBuf)
  ) {
    return true;
  }

  // 2. Fallback check against raw unparsed request body string (in case whitespace/key formatting differs)
  if (rawBody && typeof rawBody === "string") {
    const computedFromRaw = crypto
      .createHmac("sha256", String(webhookToken))
      .update(rawBody)
      .digest("hex");
    const rawBuf = Buffer.from(computedFromRaw);
    if (rawBuf.length === headerBuf.length && crypto.timingSafeEqual(rawBuf, headerBuf)) {
      return true;
    }
  }

  return false;
}

/**
 * Unified provider signature / token verifier for Tako (`X-Tako-Signature`),
 * Saweria (`Saweria-Callback-Signature`), Sociabuzz / BagiBagi (`X-Webhook-Token` / `X-Callback-Token`).
 */
export function verifyWebhookSignature({
  provider = "generic",
  webhookToken = "",
  roomSecret = "",
  body = {},
  rawBody = null,
  headers = {},
  requireSignature = false,
}) {
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) {
    h[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
  }

  const takoSig = h["x-tako-signature"] || "";
  const saweriaSig = h["saweria-callback-signature"] || "";
  const genericSig =
    h["x-webhook-signature"] || h["x-bagibagi-signature"] || h["x-signature"] || "";
  const headerToken =
    h["x-tako-token"] || h["x-callback-token"] || h["x-sociabuzz-webhook-token"] || "";

  const candidateTokens = [webhookToken, roomSecret, process.env.TAKO_WEBHOOK_TOKEN]
    .map((t) => String(t || "").trim())
    .filter(Boolean);

  // 1. Check X-Tako-Signature (HMAC SHA-256)
  if (takoSig) {
    for (const tok of candidateTokens) {
      if (verifyTakoHmacSignature(body, tok, takoSig, rawBody)) {
        return {
          valid: true,
          verified: true,
          receivedSignature: takoSig,
          method: "X-Tako-Signature (HMAC-SHA256)",
        };
      }
    }
    if (!requireSignature) {
      return {
        valid: true,
        verified: false,
        receivedSignature: takoSig,
        method: "URL Room Secret (X-Tako-Signature diterima, urutan JSON berbeda)",
      };
    }
    return {
      valid: false,
      verified: false,
      receivedSignature: takoSig,
      reason: "Header X-Tako-Signature tidak cocok dengan Webhook Token (HMAC SHA-256 mismatch).",
    };
  }

  // 2. Check Saweria / Generic HMAC SHA-256 signature headers if present
  const otherHmacSig = saweriaSig || genericSig;
  if (otherHmacSig) {
    for (const tok of candidateTokens) {
      if (verifyTakoHmacSignature(body, tok, otherHmacSig, rawBody)) {
        return {
          valid: true,
          verified: true,
          receivedSignature: otherHmacSig,
          method: saweriaSig
            ? "Saweria-Callback-Signature (HMAC-SHA256)"
            : "X-Webhook-Signature (HMAC-SHA256)",
        };
      }
    }
    if (!requireSignature) {
      return {
        valid: true,
        verified: false,
        receivedSignature: otherHmacSig,
        method: "URL Room Secret (Header Signature diterima)",
      };
    }
    return {
      valid: false,
      verified: false,
      receivedSignature: otherHmacSig,
      reason: "Signature HMAC SHA-256 pada header tidak cocok dengan Webhook Token.",
    };
  }

  // 3. Check direct token header if present
  if (headerToken) {
    for (const tok of candidateTokens) {
      const a = Buffer.from(tok);
      const b = Buffer.from(String(headerToken).trim());
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return {
          valid: true,
          verified: true,
          receivedSignature: headerToken,
          method: "Header Token Match",
        };
      }
    }
    if (!requireSignature) {
      return {
        valid: true,
        verified: false,
        receivedSignature: headerToken,
        method: "URL Room Secret",
      };
    }
    return {
      valid: false,
      verified: false,
      reason: "Header Webhook Token tidak cocok.",
    };
  }

  // 4. When no signature header is sent (e.g. Tako when Webhook Token is left empty in dashboard)
  if (requireSignature) {
    return {
      valid: false,
      verified: false,
      reason:
        "Mode Wajib Signature aktif, tetapi header X-Tako-Signature kosong. Pastikan Webhook Token sudah diisi di dashboard Tako.",
    };
  }

  return {
    valid: true,
    verified: false,
    receivedSignature: null,
    method: "URL Room Secret (Tanpa Header Signature)",
  };
}

/**
 * Normalizes webhook payloads from Indonesian donation platforms:
 * - Saweria (amount_raw, donator_name, message, id)
 * - Tako (amount / price / nominal, supporter_name / gifter_name / name / supporter, message, id)
 * - Bagi-Bagi (amount / nominal, supporter_name / donator_name, message, transaction_id)
 * - Sociabuzz (amount_settled / price, supporter, message, id)
 * - Generic JSON
 */
export function normalizeProviderPayload(provider = "generic", body = {}) {
  const b = body && typeof body === "object" ? body : {};
  const dataObj =
    b.data && typeof b.data === "object"
      ? b.data
      : b.gift && typeof b.gift === "object"
      ? b.gift
      : b.result && typeof b.result === "object"
      ? b.result
      : b;
  const prov = String(provider || "generic").toLowerCase();

  let providerEventId =
    dataObj.id ||
    dataObj.transaction_id ||
    dataObj.donation_id ||
    b.id ||
    `wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const nestedUser =
    (typeof dataObj.supporter === "object" && dataObj.supporter) ||
    (typeof dataObj.donator === "object" && dataObj.donator) ||
    (typeof dataObj.user === "object" && dataObj.user) ||
    (typeof dataObj.sender === "object" && dataObj.sender) ||
    null;

  let donatorName =
    dataObj.donator_name ||
    dataObj.supporter_name ||
    dataObj.gifter_name ||
    (typeof dataObj.supporter === "string" ? dataObj.supporter : null) ||
    dataObj.sender_name ||
    dataObj.username ||
    nestedUser?.name ||
    nestedUser?.username ||
    dataObj.name ||
    (typeof dataObj.sender === "string" ? dataObj.sender : null) ||
    b.supporter_name ||
    b.donator_name ||
    b.name ||
    "Sultan_Tako";

  let rawAmount =
    dataObj.amount_raw ??
    dataObj.amount_settled ??
    dataObj.amount ??
    dataObj.nominal ??
    dataObj.price ??
    dataObj.total ??
    dataObj.value ??
    dataObj.gift?.amount ??
    dataObj.gift?.price ??
    b.amount ??
    b.nominal ??
    b.price ??
    0;

  if (typeof rawAmount === "string") {
    rawAmount = Number(rawAmount.replace(/[^\d]/g, "")) || 0;
  } else {
    rawAmount = Number(rawAmount) || 0;
  }

  // If a dashboard "Tes Notifikasi" sends 0 or no amount, default to 10000 so the test triggers a visible skill
  if (rawAmount <= 0) {
    rawAmount = 10000;
  }

  let rawMessage =
    dataObj.message ??
    dataObj.support_message ??
    dataObj.comment ??
    dataObj.note ??
    dataObj.text ??
    dataObj.caption ??
    dataObj.gift?.message ??
    b.message ??
    "";

  rawMessage = String(rawMessage || "").trim().slice(0, 250);
  donatorName = String(donatorName || "Sultan_Tako").trim().slice(0, 40) || "Sultan_Tako";

  // Parse #<number> and !<skillKeyword>
  const targetMatch = rawMessage.match(/#(\d{1,2})/);
  const skillMatch = rawMessage.match(/!([a-z0-9_]+)/i);

  return {
    eventId: String(providerEventId),
    source: "webhook",
    provider: prov,
    donatorName,
    amount: Math.max(0, rawAmount),
    rawMessage,
    targetCarIndex: targetMatch ? parseInt(targetMatch[1], 10) - 1 : null,
    skillKeyword: skillMatch ? skillMatch[1].toLowerCase() : null,
    timestamp: Date.now(),
  };
}

/**
 * Zero-dependency Pusher Private Channel authorization signature (Pusher Protocol v7).
 */
export function authorizePusherChannel(socketId, channelName) {
  const key = process.env.PUSHER_KEY || "";
  const secret = process.env.PUSHER_SECRET || "";
  if (!key || !secret) {
    return null;
  }
  const stringToSign = `${socketId}:${channelName}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(stringToSign)
    .digest("hex");
  return { auth: `${key}:${signature}` };
}

/**
 * Zero-dependency Pusher HTTP REST Event Trigger (supports Vercel Edge & Node 18+).
 */
export async function triggerPusherEvent(channel, eventName, dataObj) {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || "ap1";

  if (!appId || !key || !secret) {
    return { delivered: false, reason: "pusher_env_not_configured" };
  }

  const bodyString = JSON.stringify({
    name: eventName,
    channels: [channel],
    data: JSON.stringify(dataObj),
  });

  const bodyMd5 = crypto.createHash("md5").update(bodyString).digest("hex");
  const authTimestamp = Math.floor(Date.now() / 1000);
  const queryString = [
    `auth_key=${key}`,
    `auth_timestamp=${authTimestamp}`,
    `auth_version=1.0`,
    `body_md5=${bodyMd5}`,
  ].join("&");

  const path = `/apps/${appId}/events`;
  const stringToSign = `POST\n${path}\n${queryString}`;
  const authSignature = crypto
    .createHmac("sha256", secret)
    .update(stringToSign)
    .digest("hex");

  const url = `https://api-${cluster}.pusher.com${path}?${queryString}&auth_signature=${authSignature}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyString,
  });

  return {
    delivered: response.ok,
    status: response.status,
  };
}
