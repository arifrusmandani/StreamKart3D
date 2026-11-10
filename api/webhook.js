import {
  isValidSecret,
  normalizeProviderPayload,
  triggerPusherEvent,
  verifyWebhookSignature,
} from "./_lib/room.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Gunakan HTTP POST." });
  }

  const {
    room,
    secret,
    provider = "generic",
    token = "",
    requireSig = "0",
  } = req.query || {};

  // 1. Validasi Room ID & Stateless HMAC Secret
  if (!isValidSecret(room, secret)) {
    return res.status(401).json({
      error: "Unauthorized: Parameter room atau secret pada URL Webhook tidak valid.",
    });
  }

  // 2. Validasi Signature Header Platform (mis. X-Tako-Signature HMAC SHA-256)
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

  // 3. Normalisasi Payload Donasi (Saweria, Tako, Bagi-Bagi, Sociabuzz, Generic)
  const eventPayload = normalizeProviderPayload(provider, req.body || {});
  eventPayload.signatureVerified = sigCheck.verified;
  eventPayload.signatureMethod = sigCheck.method;
  // Catatan Keamanan: secret & token TIDAK PERNAH dimasukkan ke dalam eventPayload.

  try {
    // 3. Broadcast ke Private Channel Pusher (jika dikonfigurasi)
    const pusherResult = await triggerPusherEvent(
      `private-streamkart-${room}`,
      "donation-received",
      eventPayload
    );

    // 4. Jika berjalan di dev server lokal Vite, teruskan juga ke local SSE bus
    if (globalThis.__streamkartLocalBus) {
      globalThis.__streamkartLocalBus.emit(room, eventPayload);
    }

    return res.status(200).json({
      status: "success",
      room,
      provider,
      event: eventPayload,
      relay: pusherResult,
    });
  } catch (error) {
    console.error("Webhook relay error:", error);
    return res.status(500).json({
      error: "Gagal meneruskan event donasi ke real-time relay.",
    });
  }
}
