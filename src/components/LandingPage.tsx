import { Link } from "react-router-dom";
import {
  Upload,
  FileAudio,
  BarChart3,
  CheckCircle,
  Headphones,
  Search,
  MessageSquare,
  Clock,
  ArrowRight,
  Check,
} from "lucide-react";

const problems = [
  {
    icon: Headphones,
    title: "Manual re-listening",
    desc: "CSMs manually re-listen to calls to find what matters.",
  },
  {
    icon: Search,
    title: "Buried churn signals",
    desc: "Churn signals get buried in transcripts and never surface.",
  },
  {
    icon: MessageSquare,
    title: "Memory-driven follow-ups",
    desc: "Follow-up emails get written from memory hours later.",
  },
  {
    icon: Clock,
    title: "Untracked account signals",
    desc: "Nothing is tracked or connected across accounts.",
  },
];

const workflowSteps = [
  {
    icon: Upload,
    label: "Upload",
    desc: "Upload a recording or paste a transcript.",
  },
  {
    icon: FileAudio,
    label: "Transcribe",
    desc: "AI transcribes audio into searchable text.",
  },
  {
    icon: BarChart3,
    label: "Analyze",
    desc: "AI scores churn risk and surfaces signals.",
  },
  {
    icon: CheckCircle,
    label: "Review & Approve",
    desc: "You approve the summary, email, and tasks.",
  },
];

const btn = "inline-flex h-12 px-8 items-center justify-center rounded-xl bg-primary text-on-primary text-sm font-semibold gap-2 hover:opacity-90 active:scale-[0.98] transition-all duration-150";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ── */}
      <section className="px-4 sm:px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left column — text & CTA */}
          <div className="text-left">
            <h1 className="text-4xl sm:text-5xl font-bold font-heading text-foreground leading-[1.1] tracking-tight">
              Never miss a churn signal again
            </h1>
            <p className="mt-5 text-base sm:text-lg text-foreground/60 max-w-lg leading-relaxed">
              AI turns every customer call into a risk score, a drafted follow-up,
              and an approved action — in under 2 minutes.
            </p>
            <div className="mt-8">
              <Link
                to="/upload"
                className="inline-flex h-12 px-8 items-center justify-center rounded-xl bg-primary text-on-primary text-sm font-semibold gap-2 hover:opacity-90 active:scale-[0.98] transition-all duration-150"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Right column — preview card */}
          <div className="flex items-center justify-center lg:justify-end overflow-visible py-4">
            <div
              className="w-full max-w-[420px] bg-white rounded-2xl border border-border p-5 sm:p-6 -rotate-[2deg] origin-center will-change-transform"
            >
              {/* Top row — label + badge */}
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                  Review call
                </span>
                <span className="text-[11px] font-semibold text-white bg-destructive rounded-full px-2.5 py-0.5">
                  High risk
                </span>
              </div>

              {/* Summary placeholder bars */}
              <div className="space-y-2">
                <div className="h-3 w-full rounded-sm bg-foreground/10" />
                <div className="h-3 w-3/4 rounded-sm bg-foreground/10" />
              </div>

              {/* Divider */}
              <hr className="my-4 border-border" />

              {/* Draft email label */}
              <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                Draft email
              </span>

              {/* Green-tinted placeholder bars */}
              <div className="mt-2 space-y-2">
                <div className="h-3 w-full rounded-sm bg-accent/20" />
                <div className="h-3 w-2/3 rounded-sm bg-accent/20" />
              </div>

              {/* Bottom buttons */}
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-9 px-5 items-center justify-center rounded-lg bg-accent text-white text-xs font-semibold gap-1.5 hover:opacity-90 active:scale-[0.97] transition-all duration-150"
                >
                  <Check className="w-3.5 h-3.5" />
                  Approve
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 px-5 items-center justify-center rounded-lg border border-border text-foreground/50 text-xs font-semibold hover:bg-muted hover:text-foreground/70 active:scale-[0.97] transition-all duration-150"
                >
                  Save draft
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Problem ── */}
      <section className="px-4 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-foreground text-center mb-10">
            The problem today
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {problems.map((p) => (
              <div
                key={p.title}
                className="bg-white rounded-xl p-5 border border-border shadow-sm"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <p.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1">
                  {p.title}
                </h3>
                <p className="text-sm text-foreground/50 leading-relaxed">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What we built ── */}
      <section className="px-4 py-16 sm:py-20">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-foreground mb-5">
            What we built
          </h2>
          <p className="text-base text-foreground/60 leading-relaxed">
            An AI copilot that transcribes every call and analyzes it for churn
            risk in real time. It drafts the follow-up email and action items
            automatically — so nothing falls through the cracks. Everything is
            reviewed and approved by a human before it's final.
          </p>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="px-4 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-foreground text-center mb-12">
            How it works
          </h2>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-center gap-8 md:gap-0">
            {workflowSteps.map((step, i) => (
              <div
                key={step.label}
                className="flex items-center w-full md:w-auto"
              >
                <div className="flex flex-col items-center text-center flex-1 md:flex-none md:px-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <step.icon className="w-6 h-6 text-primary" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-foreground">
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-foreground/40 max-w-[130px]">
                    {step.desc}
                  </p>
                </div>
                {i < workflowSteps.length - 1 && (
                  <div className="hidden md:flex items-center justify-center w-8 flex-shrink-0">
                    <ArrowRight className="w-5 h-5 text-foreground/20" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="px-4 pb-24 pt-8 sm:pb-32 text-center">
        <Link to="/upload" className={btn}>
          Get Started
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>
    </div>
  );
}