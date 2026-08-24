import { put } from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mimeType } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({
        error: "画像データがありません",
      });
    }

    const type = mimeType || "image/jpeg";

    // Base64 → 画像データ
    const buffer = Buffer.from(imageBase64, "base64");

    // 拡張子を決める
    let ext = "jpg";
    if (type === "image/png") ext = "png";
    if (type === "image/webp") ext = "webp";

    // 同じ名前にならないようにする
    const filename =
      `instagram/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    // Vercel Blobへ保存
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: type,
      addRandomSuffix: false,
    });

    console.log("Blob uploaded:", blob.url);

    return res.status(200).json({
      ok: true,
      imageUrl: blob.url,
    });

  } catch (error) {
    console.error("Blob upload error:", error);

    return res.status(500).json({
      error: String(error?.message || error),
    });
  }
}
