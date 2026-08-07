import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Speechmatics batch API base URL
const SPEECHMATICS_BASE = "https://asr.api.speechmatics.com/v2";

// ── Helpers ──

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Sleep for `ms` milliseconds in a promise-friendly way. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Extract the speechmatics job id from a job-creation response.
 * The id lives both in the body (`.id`) and in the `Location` header as the
 * last path segment. We try `.id` first.
 */
function extractJobId(body: Record<string, unknown>, locationHeader: string | null): string | null {
  if (typeof body.id === "string") return body.id;
  if (locationHeader) {
    const segments = locationHeader.split("/");
    const last = segments[segments.length - 1];
    if (last) return last;
  }
  return null;
}

// ── Handler ──

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
  const speechmaticsKey = Deno.env.get("SPEECHMATICS_API_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase server configuration missing" }, 500);
  }

  if (!speechmaticsKey) {
    return jsonResponse({ error: "SPEECHMATICS_API_KEY not configured on server" }, 500);
  }

  // Note: no auth check — same approach as analyze-call (single-user demo,
  // anon key is publishable in the client bundle, so a manual check would
  // add no real security).

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

  // Helper: persist an error on the row so it's not silent (same pattern as analyze-call)
  const recordError = async (message: string) => {
    await supabaseAdmin
      .from("calls")
      .update({ processing_error: message })
      .eq("id", call_id);
  };

  try {
    // ── 1. Fetch the call record ──
    const { data: call, error: fetchError } = await supabaseAdmin
      .from("calls")
      .select("id, audio_path, status, transcript")
      .eq("id", call_id)
      .maybeSingle();

    if (fetchError || !call) {
      const msg = `Failed to fetch call ${call_id}: ${fetchError?.message ?? "not found"}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 404);
    }

    // If the call already has a transcript (pasted), skip transcription
    if (call.transcript && call.transcript.trim() && call.audio_path === null) {
      const msg = "Call already has a transcript — no audio to transcribe";
      await recordError(msg);
      return jsonResponse({ error: msg }, 400);
    }

    if (!call.audio_path) {
      const msg = "Call has no audio file to transcribe";
      await recordError(msg);
      return jsonResponse({ error: msg }, 400);
    }

    // ── 2. Download audio from Storage ──
    const { data: fileBlob, error: downloadError } = await supabaseAdmin.storage
      .from("call-recordings")
      .download(call.audio_path);

    if (downloadError || !fileBlob) {
      const msg = `Failed to download audio file: ${downloadError?.message ?? "unknown error"}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 502);
    }

    // Derive a filename for the Speechmatics upload (used for format detection)
    const fileName = extractFileName(call.audio_path);

    // ── 3. Submit batch transcription job to Speechmatics ──
    // Notes: `transcription_config` must NOT include `enable_partials` (RT-only),
    // or batch API rejects with 400. Only accepted keys: language, operating_point,
    // max_delay, diarization, speakers, additional_vocab, output_locale.
    const configPayload = JSON.stringify({
      type: "transcription",
      transcription_config: {
        language: "en",
        operating_point: "enhanced", // highest accuracy
      },
    });

    let jobResponse: Response;
    try {
      const formData = new FormData();
      formData.append("data_file", fileBlob, fileName);
      formData.append("config", configPayload);

      jobResponse = await fetch(`${SPEECHMATICS_BASE}/jobs/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${speechmaticsKey}`,
          // Do NOT set Content-Type — let fetch set the multipart boundary
        },
        body: formData,
      });
    } catch (err) {
      const msg = `Speechmatics job creation failed: ${err instanceof Error ? err.message : "network error"}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 502);
    }

    if (!jobResponse.ok) {
      const detail = await jobResponse.text();
      const msg = `Speechmatics job creation failed (${jobResponse.status}): ${detail.slice(0, 500)}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 502);
    }

    const jobBody: Record<string, unknown> = await jobResponse.json();
    const locationHeader = jobResponse.headers.get("location");
    const jobId = extractJobId(jobBody, locationHeader);

    if (!jobId) {
      const msg = `Could not extract job id from Speechmatics response`;
      await recordError(msg);
      return jsonResponse({ error: msg, body: jobBody }, 502);
    }

    console.log(`Transcription job ${jobId} created for call ${call_id}`);

    // ── 4. Poll until the job is done (or timeout) ──
    const POLL_INTERVAL_MS = 4000;
    const POLL_TIMEOUT_MS = 120_000; // 2 minutes max — generous for demo audio
    const startedAt = Date.now();
    let jobStatus: string | null = null;
    let pollAttempts = 0;

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      pollAttempts++;
      await sleep(POLL_INTERVAL_MS);

      let statusResponse: Response;
      try {
        statusResponse = await fetch(`${SPEECHMATICS_BASE}/jobs/${encodeURIComponent(jobId)}/`, {
          headers: { Authorization: `Bearer ${speechmaticsKey}` },
        });
      } catch (err) {
        const msg = `Poll attempt ${pollAttempts} failed: ${err instanceof Error ? err.message : "network error"}`;
        await recordError(msg);
        return jsonResponse({ error: msg }, 502);
      }

      if (!statusResponse.ok) {
        const detail = await statusResponse.text();
        const msg = `Poll attempt ${pollAttempts} failed (${statusResponse.status}): ${detail.slice(0, 300)}`;
        await recordError(msg);
        return jsonResponse({ error: msg }, 502);
      }

      const statusBody: Record<string, unknown> = await statusResponse.json();
      jobStatus = (statusBody.status as string) ?? (statusBody.job_status as string) ?? null;

      console.log(`Job ${jobId} poll #${pollAttempts}: status = ${jobStatus}`);

      if (jobStatus === "done") break;
      if (jobStatus === "rejected") {
        const reason = (statusBody.reason as string) ?? (statusBody.failure ?? "Unknown reason");
        const msg = `Speechmatics job ${jobId} was rejected: ${reason}`;
        await recordError(msg);
        return jsonResponse({ error: msg }, 502);
      }
      // "queued" and "processing" are expected — keep polling
    }

    // ── 5. Check timeout ──
    if (jobStatus !== "done") {
      const elapsed = Date.now() - startedAt;
      const msg =
        `Transcription job ${jobId} did not complete within the timeout ` +
        `(${Math.round(elapsed / 1000)}s). Last status: ${jobStatus ?? "unknown"}. ` +
        `The job may still be running on Speechmatics.`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 504);
    }

    // ── 6. Fetch the transcript ──
    let transcriptText: string;
    try {
      const transcriptResponse = await fetch(
        `${SPEECHMATICS_BASE}/jobs/${encodeURIComponent(jobId)}/transcript?format=txt`,
        { headers: { Authorization: `Bearer ${speechmaticsKey}` } },
      );

      if (!transcriptResponse.ok) {
        const detail = await transcriptResponse.text();
        const msg = `Failed to fetch transcript for job ${jobId} (${transcriptResponse.status}): ${detail.slice(0, 300)}`;
        await recordError(msg);
        return jsonResponse({ error: msg }, 502);
      }

      transcriptText = await transcriptResponse.text();
    } catch (err) {
      const msg = `Failed to fetch transcript: ${err instanceof Error ? err.message : "network error"}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 502);
    }

    if (!transcriptText.trim()) {
      const msg = `Speechmatics returned an empty transcript for job ${jobId}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 502);
    }

    // ── 7. Update the call record with the transcript ──
    //   - Set transcript to the transcribed text
    //   - Set status to 'pending_review' so analyze-call can proceed
    //   - Clear processing_error (success)
    const { error: updateError } = await supabaseAdmin
      .from("calls")
      .update({
        transcript: transcriptText,
        status: "pending_review",
        processing_error: null,
      })
      .eq("id", call_id);

    if (updateError) {
      const msg = `Database update failed after transcription: ${updateError.message}`;
      await recordError(msg);
      return jsonResponse({ error: msg }, 500);
    }

    // ── 8. Fire-and-forget: trigger analyze-call on the same call_id ──
    // This mirrors what the frontend normally does when a transcript is pasted.
    try {
      const analyzeUrl = `${supabaseUrl}/functions/v1/analyze-call`;
      // Fire-and-forget — no need to await the response
      fetch(analyzeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id }),
      }).catch((err) => {
        console.error(`Failed to trigger analyze-call for ${call_id}:`, err);
      });
    } catch {
      // Fire-and-forget — errors handled in the promise above
    }

    return jsonResponse({
      success: true,
      job_id: jobId,
      transcript_preview: transcriptText.slice(0, 200),
    });
  } catch (err) {
    const msg = `Internal server error: ${err instanceof Error ? err.message : "Unknown error"}`;
    try {
      await recordError(msg);
    } catch {
      // ignore — DB write failed too
    }
    return jsonResponse({ error: msg }, 500);
  }
});

// ── Helpers (file-scope) ──

/**
 * Extract a sensible filename from a storage path for Speechmatics upload.
 * Speechmatics uses the file extension to determine the audio format.
 */
function extractFileName(storagePath: string): string {
  // Storage paths look like "<call-uuid>/<original-filename>"
  // We take the last segment
  const segments = storagePath.split("/");
  const last = segments[segments.length - 1];
  if (last) return last;
  // Fallback
  return "recording.mp3";
}