import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Upload,
  FileAudio,
  X,
  Loader2,
  CheckCircle,
  Plus,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface Account {
  id: string;
  name: string;
}

const callTypes = [
  { value: "onboarding", label: "Onboarding Call" },
  { value: "qbr", label: "QBR / Quarterly Review" },
  { value: "support", label: "Support / Escalation" },
  { value: "discovery", label: "Discovery Call" },
  { value: "checkin", label: "Check-in / Touch base" },
  { value: "other", label: "Other" },
];

type PageState = "form" | "success";

export default function UploadCall() {
  const [pageState, setPageState] = useState<PageState>("form");
  const [lastCallId, setLastCallId] = useState<string | null>(null);

  // Accounts
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [selectedAccount, setSelectedAccount] = useState("");

  // Add new account
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [addingAccount, setAddingAccount] = useState(false);

  // Form fields
  const [selectedCallType, setSelectedCallType] = useState("");
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addAccountInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch accounts on mount ──
  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    const { data, error } = await supabase
      .from("accounts")
      .select("id, name")
      .order("name", { ascending: true });
    if (!error && data) {
      setAccounts(data);
    }
    setAccountsLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Focus the add-account input when it appears
  useEffect(() => {
    if (showAddAccount) {
      addAccountInputRef.current?.focus();
    }
  }, [showAddAccount]);

  // ── Derived state ──
  const isReady =
    selectedAccount && selectedCallType && (file || transcript.trim());

  const noAccounts = !accountsLoading && accounts.length === 0;

  // ── File handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.size <= 50 * 1024 * 1024) {
      setFile(droppedFile);
    }
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected) setFile(selected);
    },
    []
  );

  const removeFile = useCallback(() => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ── Account dropdown change ──
  const handleAccountChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (val === "__add_new__") {
        setShowAddAccount(true);
        setSelectedAccount("");
      } else {
        setSelectedAccount(val);
        setShowAddAccount(false);
      }
    },
    []
  );

  // ── Create new account ──
  const handleAddAccount = useCallback(async () => {
    const name = newAccountName.trim();
    if (!name) return;
    setAddingAccount(true);
    const { data, error } = await supabase
      .from("accounts")
      .insert({ name })
      .select("id, name")
      .single();
    if (!error && data) {
      setAccounts((prev) =>
        [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
      );
      setSelectedAccount(data.id);
      setShowAddAccount(false);
      setNewAccountName("");
    }
    setAddingAccount(false);
  }, [newAccountName]);

  const handleAddAccountKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddAccount();
      }
      if (e.key === "Escape") {
        setShowAddAccount(false);
        setNewAccountName("");
      }
    },
    [handleAddAccount]
  );

  // ── Process Call ──
  const handleProcess = useCallback(async () => {
    if (!isReady) return;
    setIsProcessing(true);

    // Audio file uploads get transcribed first; pasted transcripts skip
    // straight to AI analysis.
    const isAudioUpload = file !== null;

    // 1. Save the call to Supabase
    const { data: callData, error: insertError } = await supabase
      .from("calls")
      .insert({
        account_id: selectedAccount,
        call_type: selectedCallType,
        transcript: isAudioUpload ? null : transcript.trim(),
        status: isAudioUpload ? "transcribing" : "pending_review",
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Failed to save call:", insertError);
      setIsProcessing(false);
      return;
    }

    setLastCallId(callData.id);

    const failAnalysis = (message: string) => {
      console.error(message);
      setAnalysisError(
        "Your call was saved, but transcription/analysis couldn't start. You can retry by re-uploading the call."
      );
    };

    if (isAudioUpload) {
      // 2a. Upload the recording to Supabase Storage (transcribe-call reads it
      // from here server-side)
      const storagePath = `${callData.id}/${file!.name}`;
      const { error: uploadError } = await supabase.storage
        .from("call-recordings")
        .upload(storagePath, file!, { upsert: true, contentType: file!.type });

      if (uploadError) {
        console.error("Failed to upload recording:", uploadError);
        // Persist the error on the row so it's not silent
        await supabase
          .from("calls")
          .update({
            processing_error: `Failed to upload recording to storage: ${uploadError.message}`,
          })
          .eq("id", callData.id);
        failAnalysis("Failed to upload recording to storage");
        setIsProcessing(false);
        setPageState("success");
        return;
      }

      // Record where the audio lives so transcribe-call can fetch it
      await supabase
        .from("calls")
        .update({ audio_path: storagePath })
        .eq("id", callData.id);

      // 3a. Trigger transcription via Edge Function (fire-and-forget — the
      // function polls Speechmatics and then fires analyze-call itself)
      supabase.functions
        .invoke("transcribe-call", {
          body: { call_id: callData.id },
        })
        .then(({ error }) => {
          if (error) failAnalysis("Failed to trigger transcription");
        })
        .catch((err) => {
          console.error("Failed to trigger transcription:", err);
          failAnalysis("Failed to trigger transcription");
        });
    } else {
      // 2b. Trigger AI analysis via Edge Function (fire-and-forget — the
      // function fetches the transcript from the DB itself)
      supabase.functions
        .invoke("analyze-call", {
          body: { call_id: callData.id },
        })
        .then(({ error }) => {
          if (error) failAnalysis("Failed to trigger AI analysis");
        })
        .catch((err) => {
          console.error("Failed to trigger AI analysis:", err);
          failAnalysis("Failed to trigger AI analysis");
        });
    }

    setIsProcessing(false);
    setPageState("success");
  }, [isReady, selectedAccount, selectedCallType, file, transcript]);

  // ── Reset form ──
  const handleReset = useCallback(() => {
    setPageState("form");
    setAnalysisError(null);
    setSelectedAccount("");
    setSelectedCallType("");
    setTranscript("");
    setFile(null);
    setShowAddAccount(false);
    setNewAccountName("");
    fetchAccounts();
  }, [fetchAccounts]);

  // ── Helpers ──
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Render: Success State ──
  if (pageState === "success") {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
            <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mb-5">
              <CheckCircle className="w-8 h-8 text-accent" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Call submitted successfully!
            </h2>
            <p className="text-sm text-foreground/50 max-w-sm mb-8">
              {file
                ? "Your recording has been queued for transcription and AI analysis. You'll be able to review the insights once processing is complete."
                : "Your call has been queued for AI analysis. You'll be able to review the insights once processing is complete."}
            </p>

            {analysisError && (
              <div className="flex items-start gap-2.5 max-w-sm rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-left mb-8">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-xs text-destructive/70">{analysisError}</p>
              </div>
            )}

            <div className="flex flex-col items-center gap-3 sm:flex-row">
              {lastCallId && (
                <Link
                  to={`/review/${lastCallId}`}
                  className="h-11 px-6 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all duration-150"
                >
                  Review call
                  <ArrowRight className="w-4 h-4" />
                </Link>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="h-11 px-6 rounded-xl border border-border text-foreground/60 text-sm font-semibold hover:text-foreground hover:border-foreground/20 active:scale-[0.98] transition-all duration-150"
              >
                Upload another call
              </button>
            </div>
        </div>
      </main>
    );
  }

  // ── Render: Form State ──
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-foreground">
            Upload Call
          </h1>
          <p className="text-sm text-foreground/50 mt-1">
            Upload a call recording or paste a transcript for analysis.
          </p>
        </div>

        <div className="space-y-5">
          {/* ── Account Select ── */}
          <div>
            <label
              htmlFor="account"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Account
            </label>
            {accountsLoading ? (
              <div className="w-full h-10 flex items-center px-3 rounded-lg border border-border bg-white text-sm text-foreground/40">
                Loading accounts…
              </div>
            ) : showAddAccount ? (
              <div className="flex gap-2">
                <input
                  ref={addAccountInputRef}
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  onKeyDown={handleAddAccountKeyDown}
                  placeholder="Type account name and press Enter…"
                  className="flex-1 h-10 px-3 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-foreground/20 focus:border-ring focus:ring-2 focus:ring-ring/20"
                />
                <button
                  type="button"
                  onClick={handleAddAccount}
                  disabled={!newAccountName.trim() || addingAccount}
                  className="h-10 w-10 rounded-lg bg-primary text-on-primary flex items-center justify-center hover:opacity-90 active:scale-[0.97] disabled:bg-muted disabled:text-foreground/25 disabled:cursor-not-allowed"
                >
                  {addingAccount ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                </button>
              </div>
            ) : (
              <select
                id="account"
                value={selectedAccount}
                onChange={handleAccountChange}
                className="w-full h-10 px-3 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-foreground/30 focus:border-ring focus:ring-2 focus:ring-ring/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23999%22%3E%3Cpath%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.16l3.71-3.93a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200L5.21%208.27a.75.75%200%2001.02-1.06z%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_10px_center] bg-no-repeat"
              >
                <option value="" disabled>
                  {noAccounts ? "No accounts yet" : "Select an account…"}
                </option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
                <option value="__add_new__">+ Add new account…</option>
              </select>
            )}
          </div>

          {/* ── Call Type Select ── */}
          <div>
            <label
              htmlFor="callType"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Call Type
            </label>
            <select
              id="callType"
              value={selectedCallType}
              onChange={(e) => setSelectedCallType(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-foreground/30 focus:border-ring focus:ring-2 focus:ring-ring/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23999%22%3E%3Cpath%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.16l3.71-3.93a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200L5.21%208.27a.75.75%200%2001.02-1.06z%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_10px_center] bg-no-repeat"
            >
              <option value="" disabled>
                Select call type…
              </option>
              {callTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* ── File Upload Zone ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Call Recording{" "}
              <span className="text-foreground/30 font-normal">
                (optional)
              </span>
            </label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors duration-150 ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-foreground/20 hover:bg-muted/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.flac,.mp4,.mov"
                onChange={handleFileInput}
                className="hidden"
              />

              {file ? (
                <div className="flex items-center justify-between gap-3 text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileAudio className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-foreground/40">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile();
                    }}
                    className="p-1.5 rounded-lg hover:bg-destructive/10 text-foreground/30 hover:text-destructive flex-shrink-0"
                    aria-label="Remove file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Upload className="w-5 h-5 text-foreground/30" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground/60">
                      Drop a file here or click to browse
                    </p>
                    <p className="text-xs text-foreground/30 mt-0.5">
                      MP3, WAV, M4A — up to 50 MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-medium text-foreground/30 uppercase tracking-wider">
              Or paste a transcript
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* ── Transcript Textarea ── */}
          <div>
            <label
              htmlFor="transcript"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Transcript{" "}
              <span className="text-foreground/30 font-normal">
                (optional)
              </span>
            </label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Paste your call transcript, notes, or summary here…"
              rows={6}
              className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-foreground/20 resize-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>

          {/* ── Submit ── */}
          <button
            type="button"
            disabled={!isReady || isProcessing || addingAccount}
            onClick={handleProcess}
            className={`w-full h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 ${
              isReady && !isProcessing && !addingAccount
                ? "bg-primary text-on-primary hover:opacity-90 active:scale-[0.98]"
                : "bg-muted text-foreground/25 cursor-not-allowed"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing…
              </>
            ) : (
              "Process Call"
            )}
          </button>

          {/* ── Helper text ── */}
          {!isReady && !isProcessing && (
            <p className="text-xs text-foreground/30 text-center">
              Select an account and call type, then upload a file or paste a
              transcript.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}