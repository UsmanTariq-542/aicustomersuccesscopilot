import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../lib/supabase";

// ── Types ──

interface Account {
  id: string;
  name: string;
}

interface CallRecord {
  id: string;
  account_id: string;
  date: string;
  call_type: string | null;
  risk_score: "low" | "medium" | "high" | null;
  sentiment_trend: "improving" | "flat" | "declining" | null;
  status: string;
  accounts: { name: string } | null;
}

// ── Helpers (shared with ReviewCall) ──

const callTypeLabels: Record<string, string> = {
  onboarding: "Onboarding Call",
  qbr: "QBR / Quarterly Review",
  support: "Support / Escalation",
  discovery: "Discovery Call",
  checkin: "Check-in / Touch base",
  other: "Other",
};

function riskBadgeColors(score: string | null) {
  switch (score) {
    case "low":
      return { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500", label: "Low Risk" };
    case "medium":
      return { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-400", label: "Medium Risk" };
    case "high":
      return { bg: "bg-red-50", text: "text-red-800", dot: "bg-red-500", label: "High Risk" };
    default:
      return { bg: "bg-muted", text: "text-foreground/40", dot: "bg-foreground/20", label: "Not assessed" };
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function riskScoreToNumber(score: string | null): number {
  switch (score) {
    case "low":
      return 1;
    case "medium":
      return 2;
    case "high":
      return 3;
    default:
      return 0;
  }
}

function riskScoreToHex(score: string | null): string {
  switch (score) {
    case "low":
      return "#10b981";
    case "medium":
      return "#f59e0b";
    case "high":
      return "#ef4444";
    default:
      return "#94a3b8";
  }
}

// ── Component ──

export default function CallHistory() {
  const navigate = useNavigate();

  // Account filter
  const [searchParams] = useSearchParams();
  const accountFromUrl = searchParams.get("account") || "";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState(accountFromUrl);

  // Calls data
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Fetch accounts ──
  useEffect(() => {
    supabase
      .from("accounts")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) {
          setAccounts(data);
        }
        setAccountsLoading(false);
      });
  }, []);

  // ── Fetch calls ──
  const fetchCalls = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("calls")
      .select(
        "id, account_id, date, call_type, risk_score, sentiment_trend, status, accounts(name)"
      )
      .neq("status", "transcribing")
      .order("date", { ascending: false });

    if (selectedAccountId) {
      query = query.eq("account_id", selectedAccountId);
    }

    const { data, error } = await query;

    if (!error && data) {
      setCalls(data as unknown as CallRecord[]);
    }
    setLoading(false);
  }, [selectedAccountId]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  // ── Filtered / sorted ──
  // (already sorted by DB query; we just group conceptually for rendering)
  const pendingCalls = useMemo(
    () => calls.filter((c) => c.status === "pending_review"),
    [calls]
  );

  const approvedCalls = useMemo(
    () => calls.filter((c) => c.status === "approved"),
    [calls]
  );

  const hasFilter = selectedAccountId !== "";
  const selectedAccountName =
    accounts.find((a) => a.id === selectedAccountId)?.name ?? "All Accounts";

  // ── Render ──

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Call History
            </h1>
            <p className="text-sm text-foreground/50 mt-1">
              {hasFilter
                ? `Review calls for ${selectedAccountName}`
                : "Review all calls across your accounts"}
            </p>
          </div>

          {/* Account filter */}
          <div className="min-w-0 sm:min-w-[220px]">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-white text-sm text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23999%22%3E%3Cpath%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.16l3.71-3.93a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200L5.21%208.27a.75.75%200%2001.02-1.06z%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_10px_center] bg-no-repeat"
              aria-label="Filter by account"
            >
              <option value="">All Accounts</option>
              {accountsLoading ? (
                <option disabled>Loading accounts…</option>
              ) : (
                accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* ── Risk trend chart (account-specific only) ── */}
        {hasFilter && calls.length >= 2 && (
          <RiskTrendChart calls={calls} />
        )}
        {hasFilter && calls.length === 1 && (
          <div className="mb-8 rounded-xl border border-border/60 bg-background/50 px-5 py-6 text-center">
            <p className="text-sm text-foreground/50">
              Trend will appear after more calls are analysed for this account.
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl bg-muted"
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && calls.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <CalendarDays className="w-7 h-7 text-foreground/30" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              No calls yet
            </h2>
            <p className="text-sm text-foreground/50 max-w-sm">
              {hasFilter
                ? `${selectedAccountName} doesn't have any processed calls yet. Upload a call to get started.`
                : "No processed calls found. Upload a call recording or paste a transcript to get your first AI analysis."}
            </p>
          </div>
        )}

        {/* Call list */}
        {!loading && calls.length > 0 && (
          <div className="space-y-1">
            {/* ── Pending calls section ── */}
            {pendingCalls.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    {pendingCalls.length} pending
                  </span>
                </div>

                <div className="space-y-2">
                  {pendingCalls.map((call) => (
                    <CallRow
                      key={call.id}
                      call={call}
                      onClick={() => navigate(`/review/${call.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Approved calls section ── */}
            {approvedCalls.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {approvedCalls.length} approved
                  </span>
                </div>

                <div className="space-y-2">
                  {approvedCalls.map((call) => (
                    <CallRow
                      key={call.id}
                      call={call}
                      onClick={() => navigate(`/review/${call.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Risk Trend Chart ──

function RiskTrendChart({ calls }: { calls: CallRecord[] }) {
  const chartData = useMemo(() => {
    return [...calls]
      .filter((c) => c.risk_score !== null)
      .sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      .map((c) => ({
        callId: c.id,
        date: c.date, // full ISO timestamp — unique per call
        riskValue: riskScoreToNumber(c.risk_score),
        riskColor: riskScoreToHex(c.risk_score),
        accountName: c.accounts?.name ?? "—",
      }));
  }, [calls]);

  if (chartData.length < 2) return null;

  const yTickFormatter = (value: number) => {
    switch (value) {
      case 1:
        return "Low";
      case 2:
        return "Med";
      case 3:
        return "High";
      default:
        return "";
    }
  };

  return (
    <div className="mb-8">
      <h3 className="text-sm font-semibold text-foreground mb-3">
        Risk Trend
      </h3>
      <div className="rounded-xl border border-border/60 bg-white p-4">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 12, bottom: 0, left: -16 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--color-border)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(val: string) => formatDate(val)}
              tick={{ fontSize: 11, fill: "var(--color-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              dy={6}
            />
            <YAxis
              domain={[0.5, 3.5]}
              ticks={[1, 2, 3]}
              tickFormatter={yTickFormatter}
              tick={{ fontSize: 11, fill: "var(--color-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-sm">
                    <p className="font-medium text-foreground">{formatDate(d.date)}</p>
                    <p className="text-foreground/50">{formatTime(d.date)}</p>
                    <p className="text-foreground/60 mt-0.5">
                      {d.accountName}
                    </p>
                    <p className="mt-1 font-semibold" style={{ color: d.riskColor }}>
                      Risk: {yTickFormatter(d.riskValue)}
                    </p>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="riskValue"
              stroke="var(--color-border)"
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy, payload } = props as {
                  cx: number;
                  cy: number;
                  payload: { riskColor: string };
                };
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={payload.riskColor}
                    stroke="#fff"
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                  />
                );
              }}
              activeDot={(props: any) => {
                const { cx, cy, payload } = props as {
                  cx: number;
                  cy: number;
                  payload: { riskColor: string };
                };
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={7}
                    fill={payload.riskColor}
                    stroke="#fff"
                    strokeWidth={2}
                    style={{ cursor: "pointer" }}
                    className="drop-shadow-sm"
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Call Row ──

function CallRow({
  call,
  onClick,
}: {
  call: CallRecord;
  onClick: () => void;
}) {
  const riskBadge = riskBadgeColors(call.risk_score);
  const sentiment = sentimentIcon(call.sentiment_trend);
  const isPending = call.status === "pending_review";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-xl border text-left transition-all duration-150 hover:shadow-sm active:scale-[0.995] ${
        isPending
          ? "bg-white border-border hover:border-foreground/15 hover:bg-background"
          : "bg-background/50 border-border/60 hover:border-border hover:bg-white"
      }`}
    >
      {/* Date */}
      <div className="flex-shrink-0 min-w-0 w-[110px]">
        <p className="text-sm font-medium text-foreground leading-tight">
          {formatDate(call.date)}
        </p>
        <p className="text-xs text-foreground/40 leading-tight mt-0.5">
          {formatTime(call.date)}
        </p>
      </div>

      {/* Account name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {call.accounts?.name ?? "—"}
        </p>
        <p className="text-xs text-foreground/40 truncate mt-0.5">
          {callTypeLabels[call.call_type ?? ""] ?? call.call_type ?? "—"}
        </p>
      </div>

      {/* Risk badge */}
      <div className="flex-shrink-0 hidden sm:block">
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${riskBadge.bg} ${riskBadge.text}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${riskBadge.dot}`} />
          {riskBadge.label}
        </span>
      </div>

      {/* Sentiment */}
      <div className="flex-shrink-0 hidden md:flex items-center gap-1.5 w-[90px]">
        <sentiment.Icon className={`w-4 h-4 ${sentiment.color}`} />
        <span className={`text-xs font-medium ${sentiment.color}`}>
          {sentiment.label}
        </span>
      </div>

      {/* Status badge */}
      <div className="flex-shrink-0">
        {isPending ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Pending
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Approved
          </span>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight className="w-4 h-4 text-foreground/20 flex-shrink-0" />
    </button>
  );
}