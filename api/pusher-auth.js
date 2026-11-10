import { isValidSecret, authorizePusherChannel } from "./_lib/room.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const socketId = body.socket_id || req.query?.socket_id;
  const channelName = body.channel_name || req.query?.channel_name;
  const room = body.room || req.query?.room;
  const secret = body.secret || req.query?.secret;

  if (
    !socketId ||
    channelName !== `private-streamkart-${room}` ||
    !isValidSecret(room, secret)
  ) {
    return res.status(403).json({ error: "Forbidden: Room atau secret tidak cocok." });
  }

  const authPayload = authorizePusherChannel(socketId, channelName);
  if (!authPayload) {
    return res.status(503).json({
      error: "PUSHER_KEY / PUSHER_SECRET belum dikonfigurasi pada environment server.",
    });
  }

  return res.status(200).json(authPayload);
}
