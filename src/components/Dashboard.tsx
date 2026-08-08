import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  LayoutGrid,
  Minus,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";

// ── Types ──

interface Account {
  id: string;
  name: string;
  owner: string | null;
}

interface CallSummary {
  account_id: string;
  date: string;
  risk_score: "low" | "medium" | "high" | null;
  sentiment_trend: "improving" | "flat" | "declining" | null;
}

interface AccountRow {
  account: Account;
  latestCall: CallSummary | null;
  trendRisks: string[]; // risk scores for last 3 calls, oldest → newest
}

// ── Helpers (shared with CallHistory / ReviewCall) ──

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

// ── Sparkline dot colors ──

function trendDotColor(risk: string | null): string {
  switch (risk) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-400";
    case "low":
      return "bg-emerald-500";
    default:
      return "bg-foreground/20";
  }
}

// ── Risk sort weight ──

function riskWeight(score: string | null): number {
  if (score === "high") return 0;
  if (score === "medium") return 1;
  if (score === "low") return 2;
  return 3; // null / unassessed — last
}

// ── Component ──

export default function Dashboard() {
  const navigate = useNavigate();

  // Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [calls, setCalls] = useState<CallSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter
  const [riskFilter, setRiskFilter] = useState("");

  // ── Fetch accounts & calls ──
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);

      const [accountsResult, callsResult] = await Promise.all([
        supabase.from("accounts").select("id, name, owner").order("name"),
        supabase
          .from("calls")
          .select("account_id, date, risk_score, sentiment_trend")
          .neq("status", "transcribing")
          .order("date", { ascending: false }),
      ]);

      if (cancelled) return;

      if (!accountsResult.error && accountsResult.data) {
        setAccounts(accountsResult.data);
      }
      if (!callsResult.error && callsResult.data) {
        setCalls(callsResult.data as unknown as CallSummary[]);
      }

      setLoading(false);
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Build per-account rows ──
  const allRows = useMemo<AccountRow[]>(() => {
    // Group calls by account_id
    const grouped = new Map<string, CallSummary[]>();
    for (const call of calls) {
      const list = grouped.get(call.account_id);
      if (list) {
        list.push(call);
      } else {
        grouped.set(call.account_id, [call]);
      }
    }

    return accounts
      .map((account) => {
        const accountCalls = grouped.get(account.id) ?? [];

        // Latest call is first in the sorted list (desc)
        const latestCall = accountCalls[0] ?? null;

        // Last 3 calls for trend — take first 3 (most recent), reverse to oldest → newest
        const trendRisks = accountCalls
          .slice(0, 3)
          .map((c) => c.risk_score ?? "none")
          .reverse();

        return { account, latestCall, trendRisks };
      })
      .filter((row) => row.latestCall !== null); // Only accounts with at least one call
  }, [accounts, calls]);

  // ── Filtered + sorted rows ──
  const rows = useMemo(() => {
    let filtered = allRows;
    if (riskFilter === "high" || riskFilter === "medium" || riskFilter === "low") {
      filtered = allRows.filter((r) => r.latestCall?.risk_score === riskFilter);
    }

    return [...filtered].sort(
      (a, b) =>
        riskWeight(a.latestCall?.risk_score ?? null) -
        riskWeight(b.latestCall?.risk_score ?? null)
    );
  }, [allRows, riskFilter]);

  // ── Summary stats ──
  const stats = useMemo(() => {
    const total = allRows.length;
    const highRisk = allRows.filter(
      (r) => r.latestCall?.risk_score === "high"
    ).length;
    const mediumRisk = allRows.filter(
      (r) => r.latestCall?.risk_score === "medium"
    ).length;
    const declining = allRows.filter(
      (r) => r.latestCall?.sentiment_trend === "declining"
    ).length;
    return { total, highRisk, mediumRisk, declining };
  }, [allRows]);

  const hasFilter = riskFilter !== "";

  // ── Navigate to filtered call history ──
  const handleAccountClick = useCallback(
    (accountId: string) => {
      navigate(`/calls?account=${encodeURIComponent(accountId)}`);
    },
    [navigate]
  );

  // ── Render ──

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-10">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Team Dashboard
            </h1>
            <p className="text-sm text-foreground/50 mt-1">
              Risk overview across all accounts
            </p>
          </div>

          {/* Risk filter */}
          <div className="min-w-0 sm:min-w-[200px]">
            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-white text-sm text-foreground focus:border-ring focus:ring-2 focus:ring-ring/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23999%22%3E%3Cpath%20d%3D%22M5.23%207.21a.75.75%200%20011.06.02L10%2011.16l3.71-3.93a.75.75%200%20111.08%201.04l-4.25%204.5a.75.75%200%2001-1.08%200L5.21%208.27a.75.75%200%2001.02-1.06z%22/%3E%3C/svg%3E')] bg-[length:20px_20px] bg-[right_10px_center] bg-no-repeat"
              aria-label="Filter by risk level"
            >
              <option value="">All Risk Levels</option>
              <option value="high">High Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="low">Low Risk</option>
            </select>
          </div>
        </div>

        {/* ── Summary strip ── */}
        {!loading && allRows.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-8">
            <StatCard
              icon={Users}
              label="Total accounts"
              value={stats.total}
              color="text-foreground"
              bg="bg-muted"
            />
            <StatCard
              icon={TrendingUp}
              label="High risk"
              value={stats.highRisk}
              color="text-red-800"
              bg="bg-red-50"
            />
            <StatCard
              icon={TrendingUp}
              label="Medium risk"
              value={stats.mediumRisk}
              color="text-amber-800"
              bg="bg-amber-50"
            />
            <StatCard
              icon={TrendingDown}
              label="Declining trend"
              value={stats.declining}
              color="text-red-800"
              bg="bg-red-50"
            />
          </div>
        )}

        {/* ── Loading state ── */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {/* ── Empty state ── */}
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
              <LayoutGrid className="w-7 h-7 text-foreground/30" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              {hasFilter ? "No accounts match this filter" : "No accounts with calls yet"}
            </h2>
            <p className="text-sm text-foreground/50 max-w-sm">
              {hasFilter
                ? "No accounts have a latest call at this risk level. Try a different filter."
                : "Upload a call recording or paste a transcript to get your first AI analysis and start tracking account health."}
            </p>
          </div>
        )}

        {/* ── Account list ── */}
        {!loading && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row) => (
              <AccountRow
                key={row.account.id}
                row={row}
                onClick={() => handleAccountClick(row.account.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Stat Card ──

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
  bg: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-full ${bg} ${color} text-sm font-semibold`}
    >
      <Icon className="w-4 h-4" />
      <span>{value}</span>
      <span className="text-xs font-medium opacity-75">{label}</span>
    </div>
  );
}

// ── Account Row ──

function AccountRow({
  row,
  onClick,
}: {
  row: AccountRow;
  onClick: () => void;
}) {
  const { account, latestCall, trendRisks } = row;
  const riskBadge = riskBadgeColors(latestCall?.risk_score ?? null);
  const sentiment = sentimentIcon(latestCall?.sentiment_trend ?? null);
  const lastContact = latestCall?.date ?? null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 px-5 py-3.5 rounded-xl border border-border bg-white text-left transition-all duration-150 hover:shadow-sm hover:border-foreground/15 hover:bg-background active:scale-[0.995]"
    >
      {/* Account info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">
          {account.name}
        </p>
        {account.owner && (
          <p className="text-xs text-foreground/40 truncate mt-0.5">
            {account.owner}
          </p>
        )}
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

      {/* Trend sparkline */}
      <div className="flex-shrink-0 flex items-center gap-1" aria-label={`Risk trend: ${trendRisks.join(" → ")}`}>
        {trendRisks.map((risk, i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full ${trendDotColor(risk)}`}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Sentiment */}
      <div className="flex-shrink-0 hidden md:flex items-center gap-1.5 w-[90px]">
        <sentiment.Icon className={`w-4 h-4 ${sentiment.color}`} />
        <span className={`text-xs font-medium ${sentiment.color}`}>
          {sentiment.label}
        </span>
      </div>

      {/* Last contact date */}
      <div className="flex-shrink-0 min-w-0 w-[100px]">
        <p className="text-sm font-medium text-foreground leading-tight">
          {lastContact ? formatDate(lastContact) : "—"}
        </p>
        <p className="text-xs text-foreground/40 leading-tight mt-0.5">
          Last contact
        </p>
      </div>

      {/* Chevron */}
      <ChevronRight className="w-4 h-4 text-foreground/20 flex-shrink-0" />
    </button>
  );
}