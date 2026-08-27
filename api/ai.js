export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        ok: false,
        error: "OPENAI_API_KEY is not configured"
      });
    }

    const { text } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        ok: false,
        error: "text is required"
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You are the AI writing assistant for POST ONLY. Follow the user's request, keep output concise, and never invent facts that were not provided."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: text
              }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", data);
      return res.status(response.status).json({
        ok: false,
        error: data?.error?.message || `OpenAI API request failed (${response.status})`
      });
    }

    const outputText =
      data.output_text ||
      data.output
        ?.flatMap(item => item.content || [])
        ?.find(item => item.type === "output_text")
        ?.text ||
      "";

    if (!outputText) {
      return res.status(502).json({
        ok: false,
        error: "AI response did not contain text"
      });
    }

    return res.status(200).json({
      ok: true,
      text: outputText
    });
  } catch (error) {
    console.error("AI handler error:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "AI request failed"
    });
  }
}

