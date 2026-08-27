import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export const config = { api: { bodyParser: false } };

function getClient() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT } = process.env;
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) throw new Error("R2の環境変数が不足しています");
  return new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function proxyUrl(req, key) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/api/upload?key=${encodeURIComponent(key)}`;
}

export default async function handler(req, res) {
  try {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) return res.status(500).json({ ok: false, error: "R2_BUCKET_NAME がありません" });

    if (req.method === "POST") {
      const contentType = req.headers["content-type"] || "application/octet-stream";
      if (!contentType.startsWith("image/")) return res.status(400).json({ ok: false, error: "画像ファイルではありません" });

      const rawName = req.headers["x-file-name"] ? decodeURIComponent(req.headers["x-file-name"]) : "image";
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `post-images/${crypto.randomUUID()}-${safeName}`;
      const body = await readBody(req);

      if (!body.length) return res.status(400).json({ ok: false, error: "画像データがありません" });
      if (body.length > 15 * 1024 * 1024) return res.status(413).json({ ok: false, error: "画像サイズは15MB以下にしてください" });

      await getClient().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
      return res.status(200).json({ ok: true, url: proxyUrl(req, key), pathname: key, mimeType: contentType });
    }

    if (req.method === "GET") {
      const key = typeof req.query?.key === "string" ? req.query.key : "";
      if (!key.startsWith("post-images/")) return res.status(400).send("Invalid key");
      const obj = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      res.setHeader("Content-Type", obj.ContentType || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
      if (obj.ContentLength != null) res.setHeader("Content-Length", String(obj.ContentLength));
      if (!obj.Body) return res.status(404).send("Image not found");
      if (typeof obj.Body.pipe === "function") { obj.Body.pipe(res); return; }
      const bytes = await obj.Body.transformToByteArray();
      return res.status(200).send(Buffer.from(bytes));
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    console.error("R2 UPLOAD/READ ERROR:", error);
    console.error("STACK:", error?.stack);
    return res.status(500).json({ ok: false, error: error?.message || String(error) });
  }
}
