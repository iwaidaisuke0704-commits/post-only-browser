function getPublishUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (!host) throw new Error("ホスト名を取得できません");
  return `https://${host}/api/publish`;
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\\/\\//i.test(value);
}

async function imageUrlToBase64(item) {
  const url = typeof item === "string" ? item : item?.url;
  const fallbackMime = item && typeof item === "object" && typeof item.mimeType === "string" ? item.mimeType : "image/jpeg";
  if (!isHttpUrl(url)) throw new Error("予約画像URLが正しくありません");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`予約画像取得失敗 (${response.status})`);
  const arrayBuffer = await response.arrayBuffer();
  return {
    imageBase64: Buffer.from(arrayBuffer).toString("base64"),
    mimeType: response.headers.get("content-type") || fallbackMime || "image/jpeg",
  };
}

async function normalizeScheduledImages(items) {
  if (!Array.isArray(items)) return [];
  return await Promise.all(items.map(async (item) => {
    if (isHttpUrl(item) || (item && typeof item === "object" && isHttpUrl(item.url))) {
      return await imageUrlToBase64(item);
    }
    if (item && typeof item === "object" && typeof item.imageBase64 === "string" && item.imageBase64) {
      return { imageBase64: item.imageBase64, mimeType: item.mimeType || "image/jpeg" };
    }
    throw new Error("予約画像データの形式が正しくありません");
  }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });
  try {
    const job = req.body || {};
    if (!job.id || !job.caption) return res.status(400).json({ ok:false, error:"予約データが正しくありません" });

    const images = await normalizeScheduledImages(job.images);
    const xImages = await normalizeScheduledImages(job.xImages);

    console.log("QSTASH RUN:", {
      id: job.id, scheduleAt: job.scheduleAt, x: Boolean(job.x),
      instagram: Boolean(job.instagram), images: images.length, xImages: xImages.length
    });

    const response = await fetch(getPublishUrl(req), {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        caption: job.caption, x: Boolean(job.x), instagram: Boolean(job.instagram),
        images, xImages, imageBase64: job.imageBase64 || undefined, mimeType: job.mimeType || undefined,
      }),
    });

    let data;
    try { data = await response.json(); }
    catch { throw new Error(`publish API応答エラー (${response.status})`); }

    if (!response.ok || !data.ok) {
      throw new Error(data.error || Object.values(data.errors || {}).join(" / ") || `投稿失敗 (${response.status})`);
    }

    console.log("QStash scheduled post completed:", job.id);
    return res.status(200).json({ ok:true, id:job.id, status:"completed", result:data });
  } catch (error) {
    console.error("QSTASH RUN ERROR:", error);
    console.error("STACK:", error?.stack);
    return res.status(500).json({ ok:false, error:error?.message || String(error) });
  }
}
