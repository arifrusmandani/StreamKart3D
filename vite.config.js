import { defineConfig } from "vite";
import { EventEmitter } from "node:events";
import createRoomHandler from "./api/create-room.js";
import webhookHandler from "./api/webhook.js";
import pusherAuthHandler from "./api/pusher-auth.js";
import { isValidSecret } from "./api/_lib/room.js";

if (!globalThis.__streamkartLocalBus) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  globalThis.__streamkartLocalBus = emitter;
}

function parseBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      req.rawBody = raw;
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        // Also support application/x-www-form-urlencoded (used by Pusher JS auth)
        const params = new URLSearchParams(raw);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        resolve(obj);
      }
    });
  });
}

function wrapRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    if (!res.headersSent) {
      res.setHeader("Content-Type", "application/json");
    }
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

function streamkartApiDevPlugin() {
  return {
    name: "streamkart-serverless-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) {
          return next();
        }

        const urlObj = new URL(req.url, "http://localhost:5173");
        const query = Object.fromEntries(urlObj.searchParams.entries());
        req.query = query;

        // 1. Local SSE Realtime Stream (/api/local-stream?room=...&secret=...)
        if (urlObj.pathname === "/api/local-stream") {
          const { room, secret } = query;
          if (!isValidSecret(room, secret)) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: "Invalid room or secret" }));
            return;
          }

          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          res.write(`data: ${JSON.stringify({ type: "connected", room })}\n\n`);

          const onEvent = (payload) => {
            res.write(`data: ${JSON.stringify({ type: "donation-received", payload })}\n\n`);
          };
          globalThis.__streamkartLocalBus.on(room, onEvent);

          req.on("close", () => {
            globalThis.__streamkartLocalBus.off(room, onEvent);
          });
          return;
        }

        // 2. Serverless API Handlers (/api/create-room, /api/webhook, /api/pusher-auth)
        req.body = await parseBody(req);
        const wrappedRes = wrapRes(res);

        if (urlObj.pathname === "/api/create-room") {
          return createRoomHandler(req, wrappedRes);
        }
        if (urlObj.pathname === "/api/webhook") {
          return webhookHandler(req, wrappedRes);
        }
        if (urlObj.pathname === "/api/pusher-auth") {
          return pusherAuthHandler(req, wrappedRes);
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [streamkartApiDevPlugin()],
});
