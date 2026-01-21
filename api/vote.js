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
const KEY_TX_SET = "dn:txs"; // dedupe by tx hash

function isHexTxHash(v) {
  return typeof v === "string" && /^0x[a-fA-F0-9]{64}$/.test(v);
}
function isAddress(v) {
  return typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v);
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { txHash, wallet, choice } = req.body || {};

    if (!isHexTxHash(txHash)) return res.status(400).json({ error: "Invalid txHash" });
    if (!isAddress(wallet)) return res.status(400).json({ error: "Invalid wallet" });
    if (choice !== "yes" && choice !== "no") return res.status(400).json({ error: "Invalid choice" });

    const redis = await getRedis();

    // SADD returns 1 if added, 0 if already exists
    const added = await redis.sAdd(KEY_TX_SET, txHash);

    if (added === 0) {
      const [yes, no, round] = await redis.mGet([KEY_YES, KEY_NO, KEY_ROUND]);
      return res.status(200).json({
        ok: true,
        deduped: true,
        yes: Number(yes || 0),
        no: Number(no || 0),
        round: Number(round || 0)
      });
    }

    const multi = redis.multi();
    multi.incr(KEY_ROUND);
    if (choice === "yes") multi.incr(KEY_YES);
    if (choice === "no") multi.incr(KEY_NO);
    await multi.exec();

    const [yes, no, round] = await redis.mGet([KEY_YES, KEY_NO, KEY_ROUND]);

    return res.status(200).json({
      ok: true,
      deduped: false,
      yes: Number(yes || 0),
      no: Number(no || 0),
      round: Number(round || 0)
    });
  } catch (e) {
    console.error("POST /api/vote error:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
};
