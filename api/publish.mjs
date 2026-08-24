import crypto from "node:crypto";
import { put } from "@vercel/blob";

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

async function postToX(text, imageBase64) {
  const ck = process.env.X_CONSUMER_KEY;
  const cs = process.env.X_CONSUMER_SECRET;
  const at = process.env.X_ACCESS_TOKEN;
  const ats = process.env.X_ACCESS_TOKEN_SECRET;

  if (!ck || !cs || !at || !ats) {
    throw new Error("Xの環境変数が設定されていません");
  }

  let mediaId = null;

  if (imageBase64) {
    const uploadUrl =
      "https://upload.twitter.com/1.1/media/upload.json";

    const form = new URLSearchParams();
    form.set("media_data", imageBase64);

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: auth(
          "POST",
          uploadUrl,
          ck,
          cs,
          at,
          ats,
          { media_data: imageBase64 }
        ),
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const uploadData = await uploadResponse.json();

    console.log(
      "X upload response:",
      uploadResponse.status,
      uploadData
    );

    if (!uploadResponse.ok) {
      throw new Error(
        "X画像アップロード失敗: " +
        JSON.stringify(uploadData)
      );
    }

    mediaId = uploadData.media_id_string;
  }

  const url = "https://api.x.com/2/tweets";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: auth(
        "POST",
        url,
        ck,
        cs,
        at,
        ats
      ),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      mediaId
        ? { text, media: { media_ids: [mediaId] } }
        : { text }
    ),
  });

  const data = await response.json();

  console.log(
    "X publish response:",
    response.status,
    data
  );

  if (!response.ok) {
    throw new Error(
      "X投稿失敗: " + JSON.stringify(data)
    );
  }

  return data;
}

async function postToInstagram(
  text,
  imageBase64,
  mimeType
) {
  if (!imageBase64) {
    throw new Error(
      "Instagram投稿には画像が必要です"
    );
  }

  const userId = process.env.INSTAGRAM_USER_ID;
  const accessToken =
    process.env.INSTAGRAM_ACCESS_TOKEN;

  if (!userId || !accessToken) {
    throw new Error(
      "Instagramの環境変数が設定されていません"
    );
  }

  const type = mimeType || "image/jpeg";

  let ext = "jpg";
  if (type === "image/png") ext = "png";
  if (type === "image/webp") ext = "webp";

  const buffer = Buffer.from(
    imageBase64,
    "base64"
  );

  const filename =
    `instagram/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const blob = await put(
    filename,
    buffer,
    {
      access: "public",
      contentType: type,
      addRandomSuffix: false,
    }
  );

  console.log("Instagram Blob URL:", blob.url);

  const createUrl =
    `https://graph.instagram.com/v24.0/${userId}/media`;

  const createBody = new URLSearchParams({
    image_url: blob.url,
    caption: text,
    access_token: accessToken,
  });

  const createResponse = await fetch(
    createUrl,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: createBody.toString(),
    }
  );

  const createData =
    await createResponse.json();

  console.log(
    "Instagram media response:",
    createResponse.status,
    createData
  );

  if (!createResponse.ok || !createData.id) {
    throw new Error(
      "Instagramメディア作成失敗: " +
      JSON.stringify(createData)
    );
  }

  const publishUrl =
    `https://graph.instagram.com/v24.0/${userId}/media_publish`;

  const publishBody = new URLSearchParams({
    creation_id: createData.id,
    access_token: accessToken,
  });

  const publishResponse = await fetch(
    publishUrl,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: publishBody.toString(),
    }
  );

  const publishData =
    await publishResponse.json();

  console.log(
    "Instagram publish response:",
    publishResponse.status,
    publishData
  );

  if (!publishResponse.ok) {
    throw new Error(
      "Instagram公開失敗: " +
      JSON.stringify(publishData)
    );
  }

  return publishData;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      caption: text,
      imageBase64,
      mimeType,
      x,
      instagram,
    } = req.body || {};

    if (!text) {
      return res.status(400).json({
        error: "投稿文がありません",
      });
    }

    if (!x && !instagram) {
      return res.status(400).json({
        error: "投稿先が選択されていません",
      });
    }

    const results = {};
    const errors = {};

    if (x) {
      try {
        results.x = await postToX(
          text,
          imageBase64
        );
      } catch (error) {
        errors.x = String(
          error?.message || error
        );
      }
    }

    if (instagram) {
      try {
        results.instagram =
          await postToInstagram(
            text,
            imageBase64,
            mimeType
          );
      } catch (error) {
        errors.instagram = String(
          error?.message || error
        );
      }
    }

    const ok =
      Object.keys(errors).length === 0;

    return res
      .status(ok ? 200 : 500)
      .json({
        ok,
        results,
        errors,
        error: ok
          ? undefined
          : Object.values(errors).join(" / "),
      });

  } catch (error) {
    console.error(
      "Publish error:",
      error
    );

    return res.status(500).json({
      error: String(
        error?.message || error
      ),
    });
  }
}
