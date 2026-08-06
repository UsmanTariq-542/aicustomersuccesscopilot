import { useState, useRef, useCallback } from "react";
import { Upload, FileAudio, X, Loader2 } from "lucide-react";

const accounts = [
  { value: "acme", label: "Acme Corp" },
  { value: "globex", label: "Globex Industries" },
  { value: "initech", label: "Initech" },
  { value: "umbrella", label: "Umbrella Co" },
];

const callTypes = [
  { value: "onboarding", label: "Onboarding Call" },
  { value: "qbr", label: "QBR / Quarterly Review" },
  { value: "support", label: "Support / Escalation" },
  { value: "discovery", label: "Discovery Call" },
  { value: "checkin", label: "Check-in / Touch base" },
  { value: "other", label: "Other" },
];

export default function UploadCall() {
  const [selectedAccount, setSelectedAccount] = useState("");
  const [selectedCallType, setSelectedCallType] = useState("");
  const [transcript, setTranscript] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isReady =
    selectedAccount && selectedCallType && (file || transcript.trim());

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

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }, []);

  const removeFile = useCallback(() => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleProcess = useCallback(async () => {
    if (!isReady) return;
    setIsProcessing(true);
    // Simulate processing
    await new Promise((r) => setTimeout(r, 2000));
    setIsProcessing(false);
  }, [isReady]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-foreground">Upload Call</h1>
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
            <select
              id="account"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-foreground/30 focus:border-ring focus:ring-2 focus:ring-ring/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23999%22%3E%3Cpath%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.16l3.71-3.93a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200L5.21%208.27a.75.75%200%2001.02-1.06z%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_10px_center] bg-no-repeat"
            >
              <option value="" disabled>
                Select an account…
              </option>
              {accounts.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
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
              Call Recording <span className="text-foreground/30 font-normal">(optional)</span>
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
              Transcript <span className="text-foreground/30 font-normal">(optional)</span>
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
            disabled={!isReady || isProcessing}
            onClick={handleProcess}
            className={`w-full h-11 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 ${
              isReady && !isProcessing
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
          {!isReady && (
            <p className="text-xs text-foreground/30 text-center">
              Select an account and call type, then upload a file or paste a transcript.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}