const { createClient } = require("redis");

let client;

async function getRedis() {
  if (client && client.isOpen) return client;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Missing REDIS_URL env var");

  client = createClient({ url });
  client.on("error", (err) => console.error("Redis Client Error", err));

  if (!client.isOpen) await client.connect();
  return client;
}

const KEY_YES = "dn:yes";
const KEY_NO = "dn:no";
const KEY_ROUND = "dn:round";

module.exports = async function handler(req, res) {
  try {
    // ✅ Disable caching (Vercel/CDN/browser)
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const redis = await getRedis();

    // Read all three values together
    const [yes, no, round] = await redis.mGet([KEY_YES, KEY_NO, KEY_ROUND]);

    return res.status(200).json({
      yes: Number(yes || 0),
      no: Number(no || 0),
      round: Number(round || 0)
    });
  } catch (e) {
    console.error("GET /api/votes error:", e);

    // Also prevent caching error responses
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate"
    );
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");

    return res.status(500).json({ error: e?.message || "Server error" });
  }
};
