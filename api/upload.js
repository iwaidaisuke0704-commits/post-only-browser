import { put } from "@vercel/blob";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return res.status(500).json({
        ok: false,
        error: "BLOB_READ_WRITE_TOKEN がありません",
      });
    }

    const contentType =
      req.headers["content-type"] ||
      "application/octet-stream";

    if (!contentType.startsWith("image/")) {
      return res.status(400).json({
        ok: false,
        error: "画像ファイルではありません",
      });
    }

    const filenameHeader =
      req.headers["x-file-name"];

    const originalName =
      filenameHeader
        ? decodeURIComponent(filenameHeader)
        : "image";

    const safeName =
      originalName.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

    const pathname =
      `post-images/${crypto.randomUUID()}-${safeName}`;

    const fileBuffer =
      await readBody(req);

    if (!fileBuffer.length) {
      return res.status(400).json({
        ok: false,
        error: "画像データがありません",
      });
    }

    console.log(
      "Server Blob upload:",
      pathname,
      fileBuffer.length,
      contentType
    );

    const blob =
      await put(
        pathname,
        fileBuffer,
        {
          access: "public",

          contentType,

          addRandomSuffix: false,

          token:
            process.env
              .BLOB_READ_WRITE_TOKEN,
        }
      );

    return res.status(200).json({
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      mimeType: contentType,
    });

  } catch (error) {
    console.error(
      "SERVER BLOB UPLOAD ERROR:",
      error
    );

    console.error(
      "STACK:",
      error?.stack
    );

    return res.status(500).json({
      ok: false,
      error:
        error?.message ||
        String(error),
    });
  }
}
