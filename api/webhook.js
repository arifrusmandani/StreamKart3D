import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  isValidSecret,
  normalizeProviderPayload,
  triggerPusherEvent,
  verifyWebhookSignature,
} from "./_lib/room.js";

const TMP_STORE_PATH = path.join(os.tmpdir(), "streamkart_webhook_store_v1.json");
const MAX_EVENTS_PER_ROOM = 35;

if (!globalThis.__streamkartWebhookStore) {
  globalThis.__streamkartWebhookStore = {};
}

function loadStore() {
  try {
    if (fs.existsSync(TMP_STORE_PATH)) {
      const raw = fs.readFileSync(TMP_STORE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [room, list] of Object.entries(parsed)) {
          if (Array.isArray(list)) {
            globalThis.__streamkartWebhookStore[room] = list;
          }
        }
      }
    }
  } catch {
    // ignore tmp read error
  }
  return globalThis.__streamkartWebhookStore;
}

function appendRoomEvent(room, eventObj) {
  const store = loadStore();
  if (!Array.isArray(store[room])) {
    store[room] = [];
  }
  // Avoid duplicate eventId
  if (!store[room].some((e) => e.eventId === eventObj.eventId)) {
    store[room].push(eventObj);
    if (store[room].length > MAX_EVENTS_PER_ROOM) {
      store[room] = store[room].slice(-MAX_EVENTS_PER_ROOM);
    }
  }
  try {
    fs.writeFileSync(TMP_STORE_PATH, JSON.stringify(store), "utf8");
  } catch {
    // ignore tmp write error
  }
}

function getRoomEventsSince(room, sinceTs = 0) {
  const store = loadStore();
  const list = Array.isArray(store[room]) ? store[room] : [];
  return list.filter((e) => Number(e.timestamp || 0) > Number(sinceTs || 0));
}

export default async function handler(req, res) {
  // Set CORS & no-cache headers so browser polling and external webhooks work smoothly
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Tako-Signature, Saweria-Callback-Signature, X-Webhook-Signature, X-Callback-Token"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  const {
    room,
    secret,
    provider = "generic",
    token = "",
    requireSig = "0",
    since = "0",
  } = req.query || {};

  // 1. Validasi Room ID & Stateless HMAC Secret
  if (!isValidSecret(room, secret)) {
    return res.status(401).json({
      error: "Unauthorized: Parameter room atau secret pada URL Webhook tidak valid.",
    });
  }

  // 2. Mode GET: Built-in Zero-Config Cloud Relay Polling & Raw Payload Inspector
  if (req.method === "GET") {
    const events = getRoomEventsSince(room, Number(since) || 0);
    return res.status(200).json({
      status: "ok",
      room,
      serverTime: Date.now(),
      events,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Gunakan HTTP POST atau GET." });
  }

  // 3. Validasi Signature Header Platform (mis. X-Tako-Signature HMAC SHA-256)
  const sigCheck = verifyWebhookSignature({
    provider,
    webhookToken: token,
    roomSecret: secret,
    body: req.body || {},
    rawBody: req.rawBody || null,
    headers: req.headers || {},
    requireSignature: requireSig === "1" || requireSig === "true",
  });

  if (!sigCheck.valid) {
    return res.status(401).json({
      error: `Unauthorized Signature: ${sigCheck.reason}`,
    });
  }

  // 4. Normalisasi Payload Donasi + Simpan Raw Data & Header untuk Inspeksi UI
  const eventPayload = normalizeProviderPayload(provider, req.body || {});
  eventPayload.signatureVerified = sigCheck.verified;
  eventPayload.signatureMethod = sigCheck.method;
  eventPayload.receivedHeaders = {
    "x-tako-signature": req.headers?.["x-tako-signature"] || null,
    "saweria-callback-signature": req.headers?.["saweria-callback-signature"] || null,
    "content-type": req.headers?.["content-type"] || null,
    "user-agent": req.headers?.["user-agent"] || null,
  };
  eventPayload.rawPayload = req.body || {};

  try {
    // 5. Simpan ke Built-in Cloud Relay Store (agar browser di Vercel langsung menerima tanpa wajib Pusher)
    appendRoomEvent(room, eventPayload);

    // 6. Broadcast ke Private Channel Pusher (jika dikonfigurasi)
    const pusherResult = await triggerPusherEvent(
      `private-streamkart-${room}`,
      "donation-received",
      eventPayload
    );

    // 7. Jika berjalan di dev server lokal Vite, teruskan juga ke local SSE bus
    if (globalThis.__streamkartLocalBus) {
      globalThis.__streamkartLocalBus.emit(room, eventPayload);
    }

    return res.status(200).json({
      status: "success",
      room,
      provider,
      event: eventPayload,
      relay: {
        cloudPollerStored: true,
        ...pusherResult,
      },
    });
  } catch (error) {
    console.error("Webhook relay error:", error);
    return res.status(500).json({
      error: "Gagal meneruskan event donasi ke real-time relay.",
    });
  }
}
