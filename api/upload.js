import {
  generateClientTokenFromReadWriteToken
} from "@vercel/blob";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const token =
      process.env.BLOB_READ_WRITE_TOKEN;

    if (!token) {
      return res.status(500).json({
        error:
          "BLOB_READ_WRITE_TOKEN がありません",
      });
    }

    const body = req.body || {};

    /*
      @vercel/blob/client の upload() が
      handleUploadUrl に送ってくる要求
    */
    if (
      body.type !==
      "blob.generate-client-token"
    ) {
      /*
        upload完了通知については
        今回DB更新などをしていないので
        成功として返す
      */
      if (
        body.type ===
        "blob.upload-completed"
      ) {
        console.log(
          "Blob upload completed:",
          body
        );

        return res.status(200).json({
          type:
            "blob.upload-completed",

          response:
            "ok",
        });
      }

      return res.status(400).json({
        error:
          "Unknown Blob request type",
        receivedType:
          body.type || null,
      });
    }

    const payload =
      body.payload || {};

    const pathname =
      payload.pathname;

    if (
      !pathname ||
      typeof pathname !== "string"
    ) {
      return res.status(400).json({
        error:
          "pathname がありません",
      });
    }

    /*
      予約投稿画像専用に制限
    */
    if (
      !pathname.startsWith(
        "post-images/"
      )
    ) {
      return res.status(400).json({
        error:
          "許可されていないpathnameです",
      });
    }

    const clientToken =
      await generateClientTokenFromReadWriteToken({
        token,

        pathname,

        allowedContentTypes: [
          "image/jpeg",
          "image/png",
          "image/webp",
          "image/heic",
          "image/heif",
        ],

        maximumSizeInBytes:
          20 * 1024 * 1024,

        addRandomSuffix:
          true,

        tokenPayload:
          JSON.stringify({
            purpose:
              "scheduled-post",
          }),
      });

    console.log(
      "Blob client token generated:",
      pathname
    );

    /*
      upload() が期待している形式
    */
    return res.status(200).json({
      type:
        "blob.generate-client-token",

      clientToken,
    });

  } catch (error) {
    console.error(
      "UPLOAD TOKEN ERROR:",
      error
    );

    console.error(
      "message:",
      error?.message
    );

    console.error(
      "stack:",
      error?.stack
    );

    return res.status(500).json({
      error:
        error?.message ||
        String(error),
    });
  }
}
