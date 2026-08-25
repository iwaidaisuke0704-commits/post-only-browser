import { handleUpload } from "@vercel/blob/client";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const body = req.body;

    const jsonResponse = await handleUpload({
      body,
      request: req,

      onBeforeGenerateToken: async (pathname) => {
        console.log("Generating token for:", pathname);

        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/heic",
            "image/heif",
          ],

          maximumSizeInBytes: 20 * 1024 * 1024,

          addRandomSuffix: true,

          tokenPayload: JSON.stringify({
            purpose: "scheduled-post",
          }),
        };
      },

      onUploadCompleted: async ({
        blob,
        tokenPayload,
      }) => {
        console.log(
          "Upload completed:",
          blob?.url,
          tokenPayload
        );
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    console.error("STACK:", error?.stack);

    return res.status(500).json({
      error: error?.message || String(error),
    });
  }
}
