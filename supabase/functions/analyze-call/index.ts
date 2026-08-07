import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Task {
  text: string;
  done: boolean;
}

interface AnalysisResult {
  summary: string;
  risk_score: "low" | "medium" | "high";
  risk_reason: string;
  key_concerns: string[];
  commitments: string[];
  sentiment_trend: "improving" | "flat" | "declining";
  draft_email_subject: string;
  draft_email_body: string;
  tasks: Task[];
}

const systemPrompt = `You are an AI customer success analyst. Analyze the following customer call transcript and extract key information.

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences, no extra text):
{
  "summary": "A concise 2-3 sentence summary of the call covering what was discussed and key outcomes",
  "risk_score": "low" | "medium" | "high",
  "risk_reason": "Brief explanation of why this risk score was assigned",
  "key_concerns": ["concern 1", "concern 2"],
  "commitments": ["commitment 1", "commitment 2"],
  "sentiment_trend": "improving" | "flat" | "declining",
  "draft_email_subject": "Short, actionable email subject line",
  "draft_email_body": "A professional follow-up email body addressed to the customer, using the insights from the call",
  "tasks": [
    {"text": "Follow up on feature request X", "done": false},
    {"text": "Send documentation on Y", "done": false}
  ]
}

Risk scoring guidance:
- HIGH: Customer mentions cancelling, significant dissatisfaction, competitive threat, or major product/service gaps
- MEDIUM: Some frustration, feature requests not addressed, concerns about value or ROI
- LOW: Generally positive interaction, minor issues, standard requests, or neutral check-in`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // ── CORS preflight ──
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("AIMLAPI_API_KEY");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase server configuration missing" }, 500);
  }

  if (!apiKey) {
    return jsonResponse({ error: "AI/ML API key not configured on server" }, 500);
  }

  // Verify caller: the app is a single-user demo with no auth, so we
  // require the project's anon key (publishable — what the frontend sends).
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");
  const expected = `Bearer ${supabaseAnonKey}`;

  if (authHeader !== expected && apikeyHeader !== supabaseAnonKey) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // Server-side admin client — bypasses RLS for DB reads/writes
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── Parse request ──
  let call_id: string;
  try {
    const body = await req.json();
    call_id = body?.call_id;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!call_id) {
    return jsonResponse({ error: "Missing required field: call_id" }, 400);
  }

  // Helper: persist an error on the row so it's not silent
  const recordError = async (message: string) => {
    await supabaseAdmin
      .from("calls")
      .update({ processing_error: message })
      .eq("id", call_id);
  };

  try {
    // ── 1. Fetch transcript from the DB ──
    const { data: call, error: fetchError } = await supabaseAdmin
      .from("calls")
      .select("id, transcript")
      .eq("id", call_id)
      .maybeSingle();

    if (fetchError || !call) {
      const msg = `Failed to fetch call ${call_id}: ${fetchError?.message ?? "not found"}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 404);
    }

    const transcript = call.transcript?.trim();
    if (!transcript) {
      const msg = "Call has no transcript to analyze";
      await recordError(msg);
      return jsonResponse({ error: msg }, 400);
    }

    // ── 2. Call AIML API ──
    let aiResponse: Response;
    try {
      aiResponse = await fetch("https://api.aimlapi.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: transcript },
          ],
          temperature: 0.1,
        }),
      });
    } catch (err) {
      const msg = `AI/ML API request failed: ${err instanceof Error ? err.message : "network error"}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 502);
    }

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      const msg = `AI/ML API request failed (${aiResponse.status}): ${detail.slice(0, 500)}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 502);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      const msg = "Empty response from AI/ML API";
      await recordError(msg);
      return jsonResponse({ error: msg }, 502);
    }

    // ── 3. Parse & validate JSON from AI response ──
    let analysis: AnalysisResult;
    try {
      const cleaned = content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);

      // Validate all required fields
      if (
        typeof parsed?.summary !== "string" ||
        !["low", "medium", "high"].includes(parsed?.risk_score) ||
        typeof parsed?.risk_reason !== "string" ||
        !Array.isArray(parsed?.key_concerns) ||
        !Array.isArray(parsed?.commitments) ||
        !["improving", "flat", "declining"].includes(parsed?.sentiment_trend) ||
        typeof parsed?.draft_email_subject !== "string" ||
        typeof parsed?.draft_email_body !== "string" ||
        !Array.isArray(parsed?.tasks)
      ) {
        throw new Error("Missing or invalid fields in AI response");
      }

      // Validate tasks shape
      for (const t of parsed.tasks) {
        if (
          !t ||
          typeof (t as Task).text !== "string" ||
          typeof (t as Task).done !== "boolean"
        ) {
          throw new Error("Invalid task in AI response: each task needs 'text' (string) and 'done' (boolean)");
        }
      }

      analysis = parsed as AnalysisResult;
    } catch (parseError) {
      const msg = `Failed to parse AI response as JSON: ${parseError instanceof Error ? parseError.message : "unknown error"}`;
      await recordError(msg);
      return jsonResponse({ error: msg, raw: content.slice(0, 1000) }, 502);
    }

    // ── 4. Update the call record ──
    const { error: updateError } = await supabaseAdmin
      .from("calls")
      .update({
        summary: analysis.summary,
        risk_score: analysis.risk_score,
        risk_reason: analysis.risk_reason,
        key_concerns: analysis.key_concerns,
        commitments: analysis.commitments,
        sentiment_trend: analysis.sentiment_trend,
        draft_email_subject: analysis.draft_email_subject,
        draft_email_body: analysis.draft_email_body,
        tasks: analysis.tasks,
        status: "pending_review",
        processing_error: null, // clear any previous error
      })
      .eq("id", call_id);

    if (updateError) {
      const msg = `Database update failed: ${updateError.message}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 500);
    }

    return jsonResponse({ success: true, analysis });
  } catch (err) {
    const msg = `Internal server error: ${err instanceof Error ? err.message : "Unknown error"}`;
    // Best-effort: persist the error on the row so it's visible in the UI
    try {
      await recordError(msg);
    } catch {
      // ignore — DB write failed too
    }
    return jsonResponse({ error: msg }, 500);
  }
});