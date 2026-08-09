import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
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

  // ── Parse multipart form data ──
  let call_id: string;
  let fileBlob: Blob;
  let fileName: string;
  let contentType: string;

  const contentTypeHeader = req.headers.get("content-type") ?? "";

  if (contentTypeHeader.includes("multipart/form-data")) {
    // Standard browser FormData upload
    const formData = await req.formData();
    const callIdField = formData.get("call_id");
    const fileField = formData.get("file");

    if (!callIdField || !fileField) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: call_id and file" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    call_id = String(callIdField);

    if (!(fileField instanceof File)) {
      return new Response(
        JSON.stringify({ error: "File field must be a file" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    fileBlob = fileField;
    fileName = fileField.name;
    contentType = fileField.type || "application/octet-stream";
  } else {
    // JSON fallback — for non-form-data clients
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    call_id = body?.call_id as string;
    const base64 = body?.file as string;
    fileName = (body?.filename as string) || "recording.mp3";
    contentType = (body?.content_type as string) || "audio/mpeg";

    if (!call_id || !base64) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: call_id and file" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Decode base64 to binary
    const binaryStr = atob(base64.replace(/^data:.+;base64,/, ""));
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    fileBlob = new Blob([bytes], { type: contentType });
  }

  // ── Upload to Supabase Storage ──
  const storagePath = `${call_id}/${fileName}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from("call-recordings")
    .upload(storagePath, fileBlob, {
      upsert: true,
      contentType,
    });

  if (uploadError) {
    // Persist the error on the call row
    await supabaseAdmin
      .from("calls")
      .update({
        processing_error: `Failed to upload recording to storage: ${uploadError.message}`,
      })
      .eq("id", call_id);

    return new Response(
      JSON.stringify({ error: uploadError.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // ── Record audio_path on the call ──
  const { error: updateError } = await supabaseAdmin
    .from("calls")
    .update({ audio_path: storagePath })
    .eq("id", call_id);

  if (updateError) {
    return new Response(
      JSON.stringify({
        error: `Failed to update call record: ${updateError.message}`,
        uploaded: true,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({ success: true, storage_path: storagePath }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});