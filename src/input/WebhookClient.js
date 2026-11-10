const ROOM_STORAGE_KEY = "streamkart_room_credentials_v1";

export class WebhookClient {
  constructor({ onDonationEvent, onStatusChange }) {
    this.onDonationEvent = onDonationEvent;
    this.onStatusChange = onStatusChange;

    this.roomId = "";
    this.secret = "";
    this.webhookToken = "";
    this.requireSignature = false;
    this.provider = "tako";
    this.pusherKey = import.meta.env.VITE_PUSHER_KEY || "";
    this.pusherCluster = import.meta.env.VITE_PUSHER_CLUSTER || "ap1";

    this.status = "disconnected"; // 'connected_pusher' | 'connected_local' | 'connected_cloud_poll' | 'connecting' | 'disconnected'
    this.statusDetail = "Belum terhubung";
    this.sseSource = null;
    this.pollIntervalId = null;
    this.lastPollTimestamp = Date.now() - 120000;
    this.seenEventIds = new Set();
    this.pusherInstance = null;
    this.pusherChannel = null;
    this.webhookLogs = [];
  }

  async init() {
    this._loadSavedRoom();
    await this.ensureRoomCredentials(this.roomId ? undefined : "streamer", this.roomId);
    await this.connectRealtime();
  }

  _loadSavedRoom() {
    try {
      const raw = localStorage.getItem(ROOM_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.roomId) this.roomId = parsed.roomId;
      if (parsed.secret) this.secret = parsed.secret;
      if (parsed.webhookToken) this.webhookToken = parsed.webhookToken;
      if (typeof parsed.requireSignature === "boolean") {
        this.requireSignature = parsed.requireSignature;
      }
      if (parsed.provider) this.provider = parsed.provider;
      if (parsed.pusherKey) this.pusherKey = parsed.pusherKey;
      if (parsed.pusherCluster) this.pusherCluster = parsed.pusherCluster;
    } catch {
      // ignore
    }
  }

  saveConfig() {
    try {
      localStorage.setItem(
        ROOM_STORAGE_KEY,
        JSON.stringify({
          roomId: this.roomId,
          secret: this.secret,
          webhookToken: this.webhookToken,
          requireSignature: this.requireSignature,
          provider: this.provider,
          pusherKey: this.pusherKey,
          pusherCluster: this.pusherCluster,
        })
      );
    } catch {
      // ignore
    }
  }

  async ensureRoomCredentials(slug = "streamer", existingRoomId = null) {
    try {
      const res = await fetch("/api/create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          roomId: existingRoomId || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        this.roomId = data.roomId;
        this.secret = data.secret;
        if (!this.webhookToken) {
          this.webhookToken = data.secret;
        }
        if (data.pusherKey && !this.pusherKey) {
          this.pusherKey = data.pusherKey;
        }
        if (data.pusherCluster) {
          this.pusherCluster = data.pusherCluster;
        }
        this.saveConfig();
        this._emitStatus();
        return data;
      }
    } catch {
      // Fallback if running on pure static hosting without /api
      if (!this.roomId) {
        const rand = Math.random().toString(36).substring(2, 8);
        this.roomId = `room_${slug}_${rand}`;
        this.secret = `sec_${Math.random().toString(36).substring(2, 14)}`;
        if (!this.webhookToken) {
          this.webhookToken = this.secret;
        }
        this.saveConfig();
      }
    }
    if (!this.webhookToken) {
      this.webhookToken = this.secret;
    }
    this._emitStatus();
    return { roomId: this.roomId, secret: this.secret, webhookToken: this.webhookToken };
  }

  generateNewWebhookToken() {
    const arr = new Uint8Array(16);
    if (window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(arr);
    }
    const hex = Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
    this.webhookToken = `tako_${hex.slice(0, 24)}`;
    this.saveConfig();
    this._emitStatus();
    return this.webhookToken;
  }

  async regenerateRoom(slug = "streamer") {
    this.disconnect();
    this.webhookToken = "";
    await this.ensureRoomCredentials(slug, null);
    await this.connectRealtime();
  }

  getWebhookUrl() {
    const origin = window.location.origin;
    const params = new URLSearchParams({
      provider: this.provider || "tako",
      room: this.roomId,
      secret: this.secret,
    });
    const cleanToken = (this.webhookToken || "").trim();
    if (cleanToken && cleanToken !== this.secret) {
      params.set("token", cleanToken);
    }
    if (this.requireSignature) {
      params.set("requireSig", "1");
    }
    return `${origin}/api/webhook?${params.toString()}`;
  }

  disconnect() {
    if (this.sseSource) {
      this.sseSource.close();
      this.sseSource = null;
    }
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    if (this.pusherInstance) {
      try {
        this.pusherInstance.disconnect();
      } catch {
        // ignore
      }
      this.pusherInstance = null;
      this.pusherChannel = null;
    }
    this.status = "disconnected";
    this.statusDetail = "Terputus";
    this._emitStatus();
  }

  async connectRealtime() {
    this.disconnect();
    if (!this.roomId || !this.secret) return;

    this.status = "connecting";
    this.statusDetail = "Menghubungkan ke channel room...";
    this._emitStatus();

    // 1. Always start Built-in Cloud Relay Poller (GET /api/webhook) so Vercel works 100% Zero-Config without Pusher
    this._startCloudRelayPoller();

    // 2. Connect Local Dev SSE stream if running on localhost (/api/local-stream)
    const isLocalhost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalhost) {
      try {
        const sseUrl = `/api/local-stream?room=${encodeURIComponent(
          this.roomId
        )}&secret=${encodeURIComponent(this.secret)}`;
        const es = new EventSource(sseUrl);
        this.sseSource = es;

        es.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "connected") {
              if (this.status !== "connected_pusher") {
                this.status = "connected_local";
                this.statusDetail = `Aktif • Relay Lokal (${this.roomId})`;
                this._emitStatus();
              }
            } else if (msg.type === "donation-received" && msg.payload) {
              this._handleIncomingWebhookPayload(msg.payload);
            }
          } catch {
            // ignore malformed message
          }
        };

        es.onerror = () => {
          es.close();
          this.sseSource = null;
        };
      } catch {
        // ignore SSE error
      }
    }

    // 3. If Pusher Key is configured, also connect Pusher Private Channel
    if (this.pusherKey && this.pusherKey.trim().length > 4) {
      try {
        const PusherClass = await this._loadPusherScript();
        if (PusherClass) {
          this.pusherInstance = new PusherClass(this.pusherKey.trim(), {
            cluster: this.pusherCluster || "ap1",
            channelAuthorization: {
              endpoint: "/api/pusher-auth",
              transport: "ajax",
              params: {
                room: this.roomId,
                secret: this.secret,
              },
            },
          });

          const channelName = `private-streamkart-${this.roomId}`;
          this.pusherChannel = this.pusherInstance.subscribe(channelName);

          this.pusherChannel.bind("pusher:subscription_succeeded", () => {
            this.status = "connected_pusher";
            this.statusDetail = `Terhubung Pusher Private (${this.roomId})`;
            this._emitStatus();
          });

          this.pusherChannel.bind("pusher:subscription_error", () => {
            if (this.status === "connecting") {
              this.status = "connected_cloud_poll";
              this._emitStatus();
            }
          });

          this.pusherChannel.bind("donation-received", (payload) => {
            const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
            this._handleIncomingWebhookPayload(parsed);
          });
        }
      } catch (err) {
        console.warn("Pusher connection warning:", err);
      }
    }
  }

  _startCloudRelayPoller() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
    }

    const pollOnce = async () => {
      if (!this.roomId || !this.secret) return;
      try {
        const params = new URLSearchParams({
          room: this.roomId,
          secret: this.secret,
          since: String(this.lastPollTimestamp),
        });
        const res = await fetch(`/api/webhook?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();

        if (this.status !== "connected_pusher" && this.status !== "connected_local") {
          this.status = "connected_cloud_poll";
          this.statusDetail = `Aktif • Cloud Relay (${this.roomId})`;
          this._emitStatus();
        }

        if (Array.isArray(data.events) && data.events.length > 0) {
          for (const evt of data.events) {
            if (evt.timestamp && evt.timestamp > this.lastPollTimestamp) {
              this.lastPollTimestamp = evt.timestamp;
            }
            this._handleIncomingWebhookPayload(evt);
          }
        }
      } catch {
        // ignore transient network error
      }
    };

    pollOnce();
    this.pollIntervalId = setInterval(pollOnce, 1400);
  }

  _handleIncomingWebhookPayload(payload) {
    if (!payload) return;
    const evtId = payload.eventId || `${payload.donatorName}_${payload.timestamp}`;
    if (this.seenEventIds.has(evtId)) {
      return;
    }
    this.seenEventIds.add(evtId);
    if (this.seenEventIds.size > 200) {
      const firstKey = this.seenEventIds.values().next().value;
      this.seenEventIds.delete(firstKey);
    }

    if (payload.timestamp && payload.timestamp > this.lastPollTimestamp) {
      this.lastPollTimestamp = payload.timestamp;
    }

    this.webhookLogs.unshift({
      time: new Date(payload.timestamp || Date.now()).toLocaleTimeString("id-ID"),
      provider: payload.provider || this.provider,
      donatorName: payload.donatorName,
      amount: payload.amount,
      rawMessage: payload.rawMessage,
      signatureVerified: Boolean(payload.signatureVerified),
      signatureMethod: payload.signatureMethod || "",
      rawPayload: payload.rawPayload || null,
      receivedHeaders: payload.receivedHeaders || null,
    });
    if (this.webhookLogs.length > 20) this.webhookLogs.pop();
    this._emitStatus();

    if (this.onDonationEvent) {
      this.onDonationEvent(payload);
    }
  }

  async _computeHmacSha256Hex(secretToken, messageStr) {
    if (!window.crypto?.subtle || !secretToken) return "";
    const enc = new TextEncoder();
    const key = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(String(secretToken)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sigBuf = await window.crypto.subtle.sign("HMAC", key, enc.encode(messageStr));
    return Array.from(new Uint8Array(sigBuf), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Sends a real HTTP POST test payload to `/api/webhook` in the selected provider's format,
   * including the `X-Tako-Signature` HMAC SHA-256 header when a Webhook Token is present.
   */
  async sendTestWebhook({
    provider = this.provider,
    donatorName = "Sultan_Tako",
    amount = 50000,
    message = "#1 !misil gas pol bang!",
  } = {}) {
    const url = this.getWebhookUrl();
    let sampleBody;

    switch (provider) {
      case "saweria":
        sampleBody = {
          version: "2022.01",
          id: `saw_${Date.now()}`,
          donator_name: donatorName,
          amount_raw: amount,
          message,
        };
        break;
      case "tako":
        sampleBody = {
          id: `tako_${Date.now()}`,
          supporter_name: donatorName,
          amount,
          message,
        };
        break;
      case "bagibagi":
        sampleBody = {
          transaction_id: `bb_${Date.now()}`,
          donator_name: donatorName,
          nominal: amount,
          message,
        };
        break;
      case "sociabuzz":
        sampleBody = {
          id: `sb_${Date.now()}`,
          supporter: donatorName,
          amount_settled: amount,
          message,
        };
        break;
      default:
        sampleBody = {
          id: `gen_${Date.now()}`,
          name: donatorName,
          amount,
          message,
        };
    }

    const bodyJson = JSON.stringify(sampleBody);
    const headers = { "Content-Type": "application/json" };
    const activeToken = (this.webhookToken || this.secret || "").trim();

    if (activeToken) {
      const hmacSignature = await this._computeHmacSha256Hex(activeToken, bodyJson);
      if (hmacSignature) {
        if (provider === "tako") {
          headers["X-Tako-Signature"] = hmacSignature;
        } else if (provider === "saweria") {
          headers["Saweria-Callback-Signature"] = hmacSignature;
        } else {
          headers["X-Webhook-Signature"] = hmacSignature;
        }
      }
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: bodyJson,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  }

  _loadPusherScript() {
    if (window.Pusher) return Promise.resolve(window.Pusher);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://js.pusher.com/8.2.0/pusher.min.js";
      script.async = true;
      script.onload = () => resolve(window.Pusher);
      script.onerror = (e) => reject(e);
      document.head.appendChild(script);
    });
  }

  _emitStatus() {
    if (this.onStatusChange) {
      this.onStatusChange({
        status: this.status,
        statusDetail: this.statusDetail,
        roomId: this.roomId,
        secret: this.secret,
        webhookToken: this.webhookToken || this.secret,
        requireSignature: this.requireSignature,
        provider: this.provider,
        webhookUrl: this.getWebhookUrl(),
        logs: this.webhookLogs,
      });
    }
  }
}
