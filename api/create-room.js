import { generateRoomId, deriveSecret, ROOM_REGEX } from "./_lib/room.js";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const slug = body.slug || req.query?.slug || "streamer";
  const requestedRoom = body.roomId || req.query?.roomId;

  const roomId =
    requestedRoom && ROOM_REGEX.test(String(requestedRoom))
      ? String(requestedRoom)
      : generateRoomId(slug);

  const secret = deriveSecret(roomId);

  return res.status(200).json({
    roomId,
    secret,
    channel: `private-streamkart-${roomId}`,
    pusherKey: process.env.PUSHER_KEY || null,
    pusherCluster: process.env.PUSHER_CLUSTER || "ap1",
  });
}
