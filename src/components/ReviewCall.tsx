import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle,
  ClipboardList,
  Loader2,
  Mail,
  Minus,
  Plus,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

// ── Types ──

interface CallRecord {
  id: string;
  account_id: string;
  call_type: string | null;
  summary: string | null;
  risk_score: "low" | "medium" | "high" | null;
  risk_reason: string | null;
  sentiment_trend: "improving" | "flat" | "declining" | null;
  key_concerns: unknown;
  commitments: unknown;
  draft_email_subject: string | null;
  draft_email_body: string | null;
  tasks: unknown;
  status: string;
  accounts: { name: string } | null;
}

interface TaskItem {
  done: boolean;
  text: string;
}

// ── Helpers ──

const callTypeLabels: Record<string, string> = {
  onboarding: "Onboarding Call",
  qbr: "QBR / Quarterly Review",
  support: "Support / Escalation",
  discovery: "Discovery Call",
  checkin: "Check-in / Touch base",
  other: "Other",
};

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === "string");
      }
    } catch {
      /* not valid JSON */
    }
  }
  return [];
}

function parseTasks(value: unknown): TaskItem[] {
  if (Array.isArray(value)) {
    return value
      .filter((t): t is Record<string, unknown> =>
        typeof t === "object" && t !== null
      )
      .map((t) => ({
        done: Boolean(t.done),
        text: typeof t.text === "string" ? t.text : "",
      }));
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parseTasks(parsed);
    } catch {
      /* not valid JSON */
    }
  }
  return [];
}

function riskBadgeColors(score: string | null) {
  switch (score) {
    case "low":
      return {
        bg: "bg-emerald-50",
        text: "text-emerald-800",
        dot: "bg-emerald-500",
        label: "Low Risk",
      };
    case "medium":
      return {
        bg: "bg-amber-50",
        text: "text-amber-800",
        dot: "bg-amber-400",
        label: "Medium Risk",
      };
    case "high":
      return {
        bg: "bg-red-50",
        text: "text-red-800",
        dot: "bg-red-500",
        label: "High Risk",
      };
    default:
      return {
        bg: "bg-muted",
        text: "text-foreground/40",
        dot: "bg-foreground/20",
        label: "Not assessed",
      };
  }
}

function sentimentIcon(trend: string | null) {
  switch (trend) {
    case "improving":
      return { Icon: TrendingUp, color: "text-emerald-600", label: "Improving" };
    case "declining":
      return { Icon: TrendingDown, color: "text-red-600", label: "Declining" };
    default:
      return { Icon: Minus, color: "text-foreground/40", label: "Flat" };
  }
}

// ── Component ──

export default function ReviewCall() {
  const { callId } = useParams<{ callId: string }>();
  const navigate = useNavigate();

  // Data state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [call, setCall] = useState<CallRecord | null>(null);

  // Editable fields
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [riskScore, setRiskScore] = useState<"low" | "medium" | "high">("low");
  const [originalRisk, setOriginalRisk] = useState<"low" | "medium" | "high">("low");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Add-task input ref
  const newTaskRef = useRef<HTMLInputElement>(null);
  const hasAddedTaskFromRef = useRef(false);

  // ── Fetch data ──
  useEffect(() => {
    if (!callId) {
      setError("No call ID provided.");
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase
      .from("calls")
      .select(
        "id, account_id, call_type, summary, risk_score, risk_reason, sentiment_trend, key_concerns, commitments, draft_email_subject, draft_email_body, tasks, status, accounts(name)"
      )
      .eq("id", callId)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        setLoading(false);

        if (fetchError) {
          setError(fetchError.message);
          return;
        }

        if (!data) {
          setError("Call not found.");
          return;
        }

        const record = data as unknown as CallRecord;

        // Pre-populate editable state from DB
        setCall(record);
        setEmailSubject(record.draft_email_subject ?? "");
        setEmailBody(record.draft_email_body ?? "");
        setTasks(parseTasks(record.tasks));
        const original = record.risk_score ?? "low";
        setRiskScore(original);
        setOriginalRisk(original);
      });

    return () => {
      cancelled = true;
    };
  }, [callId]);

  // ── Parsed display data ──
  const keyConcerns = useMemo(
    () => parseStringArray(call?.key_concerns),
    [call?.key_concerns]
  );
  const commitments = useMemo(
    () => parseStringArray(call?.commitments),
    [call?.commitments]
  );

  const callTypeLabel = call
    ? callTypeLabels[call.call_type ?? ""] ?? call.call_type ?? "—"
    : "—";

  const accountName = call?.accounts?.name ?? "—";

  const riskBadge = riskBadgeColors(riskScore);
  const sentiment = sentimentIcon(call?.sentiment_trend ?? null);

  const riskChanged = riskScore !== originalRisk;

  // ── Task handlers ──
  const addTask = useCallback(() => {
    setTasks((prev) => [...prev, { done: false, text: "" }]);
    // Focus the new row after render
    hasAddedTaskFromRef.current = true;
  }, []);

  const updateTask = useCallback(
    (index: number, patch: Partial<TaskItem>) => {
      setTasks((prev) => {
        const next = [...prev];
        if (next[index]) {
          next[index] = { ...next[index], ...patch };
        }
        return next;
      });
    },
    []
  );

  const removeTask = useCallback((index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Focus the newly added task row
  useEffect(() => {
    if (hasAddedTaskFromRef.current && newTaskRef.current) {
      newTaskRef.current.focus();
      hasAddedTaskFromRef.current = false;
    }
  }, [tasks.length]);

  // ── Save handler ──
  const handleApproveAndSave = useCallback(async () => {
    if (!callId) return;
    setSaving(true);
    setSaveError(null);

    const { error: updateError } = await supabase
      .from("calls")
      .update({
        draft_email_subject: emailSubject.trim() || null,
        draft_email_body: emailBody.trim() || null,
        tasks,
        risk_score: riskScore,
        status: "approved",
      })
      .eq("id", callId);

    setSaving(false);

    if (updateError) {
      setSaveError(
        `We couldn't save your changes — ${updateError.message}. Please try again.`
      );
      return;
    }

    setSaved(true);

    // Show success momentarily, then navigate home
    setTimeout(() => {
      navigate("/");
    }, 1600);
  }, [callId, emailSubject, emailBody, tasks, riskScore, navigate]);

  // ── Render helpers ──

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">
          {/* Skeleton header */}
          <div className="mb-6 animate-pulse">
            <div className="h-4 w-24 bg-muted rounded mb-4" />
            <div className="h-7 w-72 bg-muted rounded mb-2" />
            <div className="h-4 w-40 bg-muted rounded" />
          </div>
          {/* Skeleton cards */}
          <div className="space-y-4 animate-pulse">
            <div className="h-28 rounded-xl bg-muted" />
            <div className="h-20 rounded-xl bg-muted" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="h-32 rounded-xl bg-muted" />
              <div className="h-32 rounded-xl bg-muted" />
            </div>
            <div className="h-48 rounded-xl bg-muted" />
            <div className="h-52 rounded-xl bg-muted" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !call) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground/50 hover:text-foreground mb-6 transition-colors duration-150"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </button>
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <ShieldAlert className="w-7 h-7 text-destructive" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              We couldn't load this call
            </h2>
            <p className="text-sm text-foreground/50 max-w-sm">
              {error ?? "The call record was not found. It may have been deleted."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ── Saved (success confirmation) ──
  if (saved) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-5">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Call approved!
            </h2>
            <p className="text-sm text-foreground/50">
              Your changes have been saved. Returning to dashboard…
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ── Main review layout ──
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-8 py-10">
        {/* Back button & header */}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm font-medium text-foreground/50 hover:text-foreground mb-4 transition-colors duration-150"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <h1 className="text-xl font-semibold text-foreground mb-1">
          {accountName}
        </h1>
        <p className="text-sm text-foreground/50 mb-8">
          {callTypeLabel}
        </p>

        {/* ── Risk + Sentiment Card ── */}
        <section className="rounded-xl border border-border bg-white p-5 mb-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            {/* Risk badge + reason */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5 mb-2">
                <ShieldAlert className="w-5 h-5 text-foreground/50" />
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${riskBadge.bg} ${riskBadge.text}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${riskBadge.dot}`}
                    aria-hidden="true"
                  />
                  {riskBadge.label}
                </span>
              </div>
              {call.risk_reason && (
                <p className="text-sm text-foreground/60 leading-relaxed">
                  {call.risk_reason}
                </p>
              )}
            </div>

            {/* Sentiment trend */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-medium text-foreground/40 uppercase tracking-wider">
                Sentiment
              </span>
              <span
                className={`flex items-center gap-1 text-sm font-medium ${sentiment.color}`}
              >
                <sentiment.Icon className="w-4 h-4" />
                {sentiment.label}
              </span>
            </div>
          </div>
        </section>

        {/* ── Summary ── */}
        <section className="rounded-xl border border-border bg-white p-5 mb-4">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            Summary
          </h2>
          <p className="text-sm text-foreground/70 leading-relaxed whitespace-pre-wrap">
            {call.summary ?? "No summary available."}
          </p>
        </section>

        {/* ── Key Concerns & Commitments ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <section className="rounded-xl border border-border bg-white p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Key Concerns
            </h2>
            {keyConcerns.length > 0 ? (
              <ul className="space-y-1.5">
                {keyConcerns.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-foreground/60"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground/20 mt-1.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-foreground/40 italic">
                No concerns identified.
              </p>
            )}
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Commitments
            </h2>
            {commitments.length > 0 ? (
              <ul className="space-y-1.5">
                {commitments.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-foreground/60"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-foreground/20 mt-1.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-foreground/40 italic">
                No commitments recorded.
              </p>
            )}
          </section>
        </div>

        {/* ── Email Draft ── */}
        <section className="rounded-xl border border-border bg-white p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4 text-foreground/50" />
            <h2 className="text-sm font-semibold text-foreground">Email Draft</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label
                htmlFor="email-subject"
                className="block text-xs font-medium text-foreground/60 mb-1"
              >
                Subject
              </label>
              <input
                id="email-subject"
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Email subject…"
                className="w-full h-10 px-3 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-foreground/20 focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
            <div>
              <label
                htmlFor="email-body"
                className="block text-xs font-medium text-foreground/60 mb-1"
              >
                Body
              </label>
              <textarea
                id="email-body"
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                placeholder="Compose your email draft…"
                rows={5}
                className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm text-foreground placeholder:text-foreground/20 resize-y focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </div>
          </div>
        </section>

        {/* ── Tasks ── */}
        <section className="rounded-xl border border-border bg-white p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="w-4 h-4 text-foreground/50" />
            <h2 className="text-sm font-semibold text-foreground">Tasks</h2>
          </div>

          {tasks.length === 0 && (
            <p className="text-sm text-foreground/40 italic mb-4">
              No tasks yet. Add one below.
            </p>
          )}

          <ul className="space-y-2 mb-3">
            {tasks.map((task, i) => (
              <li
                key={i}
                className="flex items-center gap-2.5 group"
              >
                <input
                  type="checkbox"
                  id={`task-done-${i}`}
                  checked={task.done}
                  onChange={(e) => updateTask(i, { done: e.target.checked })}
                  className="w-4 h-4 rounded accent-primary cursor-pointer flex-shrink-0"
                />
                <input
                  ref={i === tasks.length - 1 ? newTaskRef : undefined}
                  type="text"
                  value={task.text}
                  onChange={(e) => updateTask(i, { text: e.target.value })}
                  placeholder="Describe the task…"
                  className={`flex-1 px-2 py-1.5 rounded-lg border-0 bg-transparent text-sm text-foreground placeholder:text-foreground/20 focus:bg-muted focus:ring-2 focus:ring-ring/20 ${
                    task.done ? "line-through text-foreground/35" : ""
                  }`}
                />
                <button
                  type="button"
                  onClick={() => removeTask(i)}
                  className="p-1 rounded-lg text-foreground/20 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all duration-150 focus:opacity-100"
                  aria-label={`Remove task "${task.text || "untitled"}"`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addTask}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:opacity-80 transition-opacity duration-150"
          >
            <Plus className="w-4 h-4" />
            Add task
          </button>
        </section>

        {/* ── Risk Override ── */}
        <section className="rounded-xl border border-border bg-white p-5 mb-6">
          <label
            htmlFor="risk-override"
            className="block text-sm font-semibold text-foreground mb-1"
          >
            Risk Assessment
          </label>
          <p className="text-xs text-foreground/40 mb-3">
            Override the AI's risk score if needed.
          </p>
          <div className="flex items-center gap-3">
            <select
              id="risk-override"
              value={riskScore}
              onChange={(e) =>
                setRiskScore(e.target.value as "low" | "medium" | "high")
              }
              className="h-10 px-3 rounded-lg border border-border bg-white text-sm text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23999%22%3E%3Cpath%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.16l3.71-3.93a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200L5.21%208.27a.75.75%200%2001.02-1.06z%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_10px_center] bg-no-repeat min-w-[140px]"
            >
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
            </select>
            {riskChanged && (
              <span className="text-xs text-amber-600 font-medium">
                Modified from original
              </span>
            )}
          </div>
        </section>

        {/* ── Save error ── */}
        {saveError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 mb-4">
            <ShieldAlert className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-xs text-destructive/70">{saveError}</p>
          </div>
        )}

        {/* ── Approve & Save ── */}
        <button
          type="button"
          disabled={saving}
          onClick={handleApproveAndSave}
          className="w-full h-12 rounded-xl bg-primary text-on-primary text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all duration-150 disabled:bg-muted disabled:text-foreground/25 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              Approve &amp; Save
            </>
          )}
        </button>
      </div>
    </main>
  );
}