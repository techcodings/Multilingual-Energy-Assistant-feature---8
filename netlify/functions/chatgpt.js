// netlify/functions/chatgpt.js

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!OPENAI_API_KEY) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        error:
          "Missing OPENAI_API_KEY env variable. Set it in .env (local) and in Netlify site settings.",
      }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Invalid JSON body" }),
    };
  }

  const messages = body.messages || [];

  try {
    const openaiRes = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          max_tokens: 900,
          temperature: 0.7,
        }),
      }
    );

    const rawText = await openaiRes.text();

    if (!openaiRes.ok) {
      console.error("OpenAI error:", openaiRes.status, rawText);
      return {
        statusCode: openaiRes.status,
        headers: corsHeaders,
        body: rawText || JSON.stringify({ error: "OpenAI error" }),
      };
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (err) {
      console.error("Error parsing OpenAI JSON:", err, rawText);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "Failed to parse OpenAI response JSON",
        }),
      };
    }

    const text = data?.choices?.[0]?.message?.content || "";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({ text }),
    };
  } catch (err) {
    console.error("Function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: JSON.stringify({
        error: err.message || "Server error in chatgpt function",
      }),
    };
  }
};
