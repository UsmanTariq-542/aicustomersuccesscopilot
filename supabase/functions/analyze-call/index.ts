import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface AnalysisResult {
  summary: string;
  risk_score: "low" | "medium" | "high";
  risk_reason: string;
  key_concerns: string[];
  commitments: string[];
  sentiment_trend: "improving" | "flat" | "declining";
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    // ── Parse request ──
    const { call_id, transcript } = await req.json();

    if (!call_id || !transcript) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: call_id, transcript",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Verify caller is authenticated ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing Authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Call AI/ML API (OpenAI-compatible) ──
    const apiKey = Deno.env.get("AIMLAPI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "AI/ML API key not configured on server" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const systemPrompt =
      `You are an AI customer success analyst. Analyze the following customer call transcript and extract key information.

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences, no extra text):
{
  "summary": "A concise 2-3 sentence summary of the call covering what was discussed and key outcomes",
  "risk_score": "low" | "medium" | "high",
  "risk_reason": "Brief explanation of why this risk score was assigned",
  "key_concerns": ["concern 1", "concern 2"],
  "commitments": ["commitment 1", "commitment 2"],
  "sentiment_trend": "improving" | "flat" | "declining"
}

Risk scoring guidance:
- HIGH: Customer mentions cancelling, significant dissatisfaction, competitive threat, or major product/service gaps
- MEDIUM: Some frustration, feature requests not addressed, concerns about value or ROI
- LOW: Generally positive interaction, minor issues, standard requests, or neutral check-in`;

    const aiResponse = await fetch(
      "https://api.aimlapi.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: transcript },
          ],
          temperature: 0.1,
        }),
      },
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return new Response(
        JSON.stringify({
          error: "AI/ML API request failed",
          status: aiResponse.status,
          details: errorText,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ error: "Empty response from AI/ML API" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Parse structured JSON from AI response ──
    let analysis: AnalysisResult;
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      analysis = JSON.parse(cleaned);

      // Validate required fields
      if (
        !analysis.summary ||
        !analysis.risk_score ||
        !analysis.risk_reason ||
        !Array.isArray(analysis.key_concerns) ||
        !Array.isArray(analysis.commitments) ||
        !analysis.sentiment_trend
      ) {
        throw new Error("Missing or invalid fields in AI response");
      }
    } catch (parseError) {
      return new Response(
        JSON.stringify({
          error: "Failed to parse AI response as JSON",
          raw: content,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Update the call record with analysis results ──
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Supabase server configuration missing" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { error: updateError } = await supabaseAdmin
      .from("calls")
      .update({
        summary: analysis.summary,
        risk_score: analysis.risk_score,
        risk_reason: analysis.risk_reason,
        key_concerns: analysis.key_concerns,
        commitments: analysis.commitments,
        sentiment_trend: analysis.sentiment_trend,
        status: "approved",
      })
      .eq("id", call_id);

    if (updateError) {
      return new Response(
        JSON.stringify({
          error: "Database update failed",
          details: updateError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // ── Return results ──
    return new Response(
      JSON.stringify({ success: true, analysis }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});