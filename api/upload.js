import { handleUpload } from "@vercel/blob/client";

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {

    const body = req.body;

    const jsonResponse =
      await handleUpload({
        body,
        request: req,

        onBeforeGenerateToken:
          async (pathname) => {

            return {
              allowedContentTypes: [
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/heic",
                "image/heif",
              ],

              addRandomSuffix: true,

              tokenPayload:
                JSON.stringify({
                  purpose:
                    "scheduled-post",
                }),
            };
          },

        onUploadCompleted:
          async ({
            blob,
            tokenPayload,
          }) => {

            console.log(
              "Scheduled image uploaded:",
              blob.url,
              tokenPayload
            );
          },
      });


    return res.status(200).json(
      jsonResponse
    );


  } catch (error) {

    console.error(
      "Upload token error:",
      error
    );

    return res.status(400).json({
      error:
        String(
          error?.message ||
          error
        ),
    });
  }
}
