import crypto from "node:crypto";

const enc = (v) =>
  encodeURIComponent(String(v))
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");

function auth(method, url, ck, cs, at, ats, bodyParams = {}) {
  const oauth = {
    oauth_consumer_key: ck,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: at,
    oauth_version: "1.0",
  };

  const params = Object.entries({ ...oauth, ...bodyParams })
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join("&");

  const base = [
    method.toUpperCase(),
    enc(url),
    enc(params),
  ].join("&");

  const key = `${enc(cs)}&${enc(ats)}`;

  oauth.oauth_signature = crypto
    .createHmac("sha1", key)
    .update(base)
    .digest("base64");

  return (
    "OAuth " +
    Object.entries(oauth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${enc(k)}="${enc(v)}"`)
      .join(", ")
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { caption: text, imageBase64, mimeType } = req.body || {};
    if (!text) {
      return res.status(400).json({ error: "投稿文がありません" });
    }

    const ck = process.env.X_CONSUMER_KEY;
    const cs = process.env.X_CONSUMER_SECRET;
    const at = process.env.X_ACCESS_TOKEN;
    const ats = process.env.X_ACCESS_TOKEN_SECRET;

    if (!ck || !cs || !at || !ats) {
      return res.status(500).json({
        error: "Xの環境変数が設定されていません",
      });
    }
let mediaId = null;

if (imageBase64) {
  const uploadUrl = "https://upload.twitter.com/1.1/media/upload.json";

  const form = new URLSearchParams();
  form.set("media_data", imageBase64);

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: auth("POST", uploadUrl, ck, cs, at, ats, {
  media_data: imageBase64,
}),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const uploadData = await uploadResponse.json();
console.log("X upload response:", uploadResponse.status, uploadData);
  if (!uploadResponse.ok) {
    return res.status(uploadResponse.status).json({
      error: "画像のアップロードに失敗しました",
      details: uploadData,
    });
  }

  mediaId = uploadData.media_id_string;
}
    const url = "https://api.x.com/2/tweets";

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth("POST", url, ck, cs, at, ats),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
  mediaId ? { text, media: { media_ids: [mediaId] } } : { text }
),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json({
      ok: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      error: String(error?.message || error),
    });
  }
}
