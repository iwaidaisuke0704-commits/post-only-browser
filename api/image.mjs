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

    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    const userId = process.env.INSTAGRAM_USER_ID;

    if (!accessToken || !userId) {
      return res.status(500).json({
        error: "Instagramの環境変数が設定されていません",
      });
    }

    return res.status(200).json({
      ok: true,
      message: "Instagram画像API準備OK",
      hasImage: true,
      mimeType: mimeType || "image/jpeg",
      instagramUserIdConfigured: true,
      instagramAccessTokenConfigured: true,
    });

  } catch (error) {
    console.error("Instagram image API error:", error);

    return res.status(500).json({
      error: String(error?.message || error),
    });
  }
}
