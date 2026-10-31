"""
brief_evaluation.py
===================
Evaluation harness that proves (or disproves) AutoSignal's core claim:
"briefs increase the probability of beating the creator's channel average."

It does NOT generate data. It reads the 48h performance verdicts that
feedback_loop.py already records and turns them into a single, honest
performance picture:

    - sample size (n)
    - win rate          = % of briefed videos that beat channel average (ratio >= 1.0)
    - outperformance    = % that strongly beat it (ratio >= 1.5 -> OUTPERFORMED)
    - median / mean performance_ratio (views_48h / creator_avg_views)
    - verdict split     OUTPERFORMED / MATCHED / UNDERPERFORMED
    - per-niche breakdown

Data sources, in priority order:
    1. Supabase `brief_performance` table (production source of truth)
    2. Local SQLite `briefs` table (brief_score / video_views_48h) as a fallback

IMPORTANT — statistical honesty:
    With fewer than MIN_SAMPLES verdicts, the numbers are descriptive only and
    must NOT be presented as evidence the product works. The harness labels the
    result CONFIDENCE = LOW / MEDIUM / HIGH based on sample size so nobody quotes
    a 100% win rate off 2 data points.

Usage:
    python brief_evaluation.py                 # all niches, auto source
    python brief_evaluation.py --niche finance # one niche
    python brief_evaluation.py --source sqlite # force local DB
    python brief_evaluation.py --json          # machine-readable output
"""

import argparse
import json
import logging
import sqlite3
import statistics
from dataclasses import dataclass, asdict, field
from typing import Any, Dict, List, Optional

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s")
log = logging.getLogger("BriefEval")

# ── Thresholds (kept in sync with feedback_loop.py verdict bands) ─────────────
VERDICT_OUTPERFORMED = 1.5    # ratio >= 1.5x channel avg
VERDICT_MATCHED_MIN  = 0.8    # 0.8x - 1.5x = MATCHED
WIN_THRESHOLD        = 1.0    # ratio >= 1.0x = "won" (beat the average)

# Sample-size confidence bands. Below LOW the result is anecdote, not evidence.
MIN_SAMPLES_MEDIUM = 20
MIN_SAMPLES_HIGH   = 50


@dataclass
class PerfRow:
    """One evaluated brief -> video outcome."""
    brief_id: Optional[str]
    channel_id: Optional[str]
    niche: Optional[str]
    performance_ratio: float
    verdict: Optional[str] = None

    def resolved_verdict(self) -> str:
        if self.verdict:
            return self.verdict.upper()
        r = self.performance_ratio
        if r >= VERDICT_OUTPERFORMED:
            return "OUTPERFORMED"
        if r >= VERDICT_MATCHED_MIN:
            return "MATCHED"
        return "UNDERPERFORMED"


@dataclass
class EvalReport:
    sample_size: int
    confidence: str
    win_rate: float            # % ratio >= 1.0
    outperformance_rate: float # % verdict == OUTPERFORMED
    median_ratio: float
    mean_ratio: float
    verdict_split: Dict[str, int]
    per_niche: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    source: str = "unknown"


# ── Data loading ──────────────────────────────────────────────────────────────

def _rows_from_supabase(niche: Optional[str]) -> List[PerfRow]:
    try:
        from supabase_client import get_brief_performance_rows
    except Exception as exc:  # noqa: BLE001
        log.info("Supabase source unavailable (%s).", exc)
        return []

    try:
        raw = get_brief_performance_rows(niche=niche)
    except Exception as exc:  # noqa: BLE001
        log.warning("Supabase brief_performance query failed: %s", exc)
        return []

    rows: List[PerfRow] = []
    for r in raw or []:
        ratio = _safe_ratio(r.get("performance_ratio"),
                            r.get("views_48h"), r.get("creator_avg_views"))
        if ratio is None:
            continue
        rows.append(PerfRow(
            brief_id=r.get("brief_id"),
            channel_id=r.get("channel_id"),
            niche=r.get("niche"),
            performance_ratio=ratio,
            verdict=r.get("verdict"),
        ))
    return rows


def _rows_from_sqlite(niche: Optional[str]) -> List[PerfRow]:
    """Fallback: derive ratios from the local briefs table.
    brief_score was stored as min(10, ratio*5), so ratio = brief_score / 5."""
    try:
        from pipeline_paths import get_paths, resolve_niche
        db_path = get_paths(resolve_niche(niche or "automotive")).db
    except Exception:
        from pathlib import Path
        db_path = Path(__file__).resolve().parent / "youtube_automotive.db"

    if not db_path.exists():
        log.info("SQLite source not found at %s.", db_path)
        return []

    rows: List[PerfRow] = []
    try:
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='briefs'")
        if not cur.fetchone():
            conn.close()
            return []
        cur.execute(
            """
            SELECT brief_id, channel_id, brief_score, video_views_48h
            FROM briefs
            WHERE brief_score IS NOT NULL AND was_used = 1
            """
        )
        for brief_id, channel_id, brief_score, _views in cur.fetchall():
            if brief_score is None:
                continue
            ratio = float(brief_score) / 5.0  # invert the stored score formula
            rows.append(PerfRow(
                brief_id=brief_id,
                channel_id=channel_id,
                niche=niche,
                performance_ratio=ratio,
            ))
        conn.close()
    except Exception as exc:  # noqa: BLE001
        log.warning("SQLite read failed: %s", exc)
    return rows


def _safe_ratio(ratio: Any, views: Any, avg: Any) -> Optional[float]:
    """Prefer a stored ratio; otherwise derive from views / channel avg."""
    try:
        if ratio is not None:
            return float(ratio)
    except (TypeError, ValueError):
        pass
    try:
        v = float(views)
        a = float(avg)
        if a > 0:
            return v / a
    except (TypeError, ValueError):
        pass
    return None


# ── Aggregation ───────────────────────────────────────────────────────────────

def _confidence(n: int) -> str:
    if n >= MIN_SAMPLES_HIGH:
        return "HIGH"
    if n >= MIN_SAMPLES_MEDIUM:
        return "MEDIUM"
    return "LOW"


def _aggregate(rows: List[PerfRow], source: str) -> EvalReport:
    n = len(rows)
    if n == 0:
        return EvalReport(0, "LOW", 0.0, 0.0, 0.0, 0.0,
                          {"OUTPERFORMED": 0, "MATCHED": 0, "UNDERPERFORMED": 0},
                          {}, source)

    ratios = [r.performance_ratio for r in rows]
    verdicts = [r.resolved_verdict() for r in rows]

    split = {
        "OUTPERFORMED":   verdicts.count("OUTPERFORMED"),
        "MATCHED":        verdicts.count("MATCHED"),
        "UNDERPERFORMED": verdicts.count("UNDERPERFORMED"),
    }
    wins = sum(1 for r in ratios if r >= WIN_THRESHOLD)

    per_niche: Dict[str, Dict[str, Any]] = {}
    by_niche: Dict[str, List[PerfRow]] = {}
    for r in rows:
        by_niche.setdefault(r.niche or "unknown", []).append(r)
    for niche, nrows in by_niche.items():
        nratios = [r.performance_ratio for r in nrows]
        per_niche[niche] = {
            "sample_size": len(nrows),
            "win_rate": round(sum(1 for x in nratios if x >= WIN_THRESHOLD) / len(nrows) * 100, 1),
            "median_ratio": round(statistics.median(nratios), 3),
        }

    return EvalReport(
        sample_size=n,
        confidence=_confidence(n),
        win_rate=round(wins / n * 100, 1),
        outperformance_rate=round(split["OUTPERFORMED"] / n * 100, 1),
        median_ratio=round(statistics.median(ratios), 3),
        mean_ratio=round(statistics.fmean(ratios), 3),
        verdict_split=split,
        per_niche=per_niche,
        source=source,
    )


def evaluate(niche: Optional[str] = None, source: str = "auto") -> EvalReport:
    """Build the evaluation report. source: 'auto' | 'supabase' | 'sqlite'."""
    rows: List[PerfRow] = []
    used = "none"

    if source in ("auto", "supabase"):
        rows = _rows_from_supabase(niche)
        if rows:
            used = "supabase"

    if not rows and source in ("auto", "sqlite"):
        rows = _rows_from_sqlite(niche)
        if rows:
            used = "sqlite"

    return _aggregate(rows, used)


# ── Presentation ──────────────────────────────────────────────────────────────

def format_report(report: EvalReport) -> str:
    lines = []
    lines.append("")
    lines.append("━" * 60)
    lines.append("  AUTOSIGNAL — BRIEF OUTPERFORMANCE REPORT")
    lines.append("━" * 60)
    lines.append(f"  Source:              {report.source}")
    lines.append(f"  Sample size:         {report.sample_size}")
    lines.append(f"  Confidence:          {report.confidence}")
    lines.append("─" * 60)

    if report.sample_size == 0:
        lines.append("  No evaluated briefs yet.")
        lines.append("  Run the pipeline + feedback_loop on real creators first;")
        lines.append("  verdicts appear here once videos are 48h old.")
        lines.append("━" * 60)
        return "\n".join(lines)

    lines.append(f"  Win rate (>= channel avg):   {report.win_rate:.1f}%")
    lines.append(f"  Strong outperformance:       {report.outperformance_rate:.1f}%")
    lines.append(f"  Median performance ratio:    {report.median_ratio:.2f}x")
    lines.append(f"  Mean performance ratio:      {report.mean_ratio:.2f}x")
    lines.append("─" * 60)
    lines.append("  Verdict split:")
    for k in ("OUTPERFORMED", "MATCHED", "UNDERPERFORMED"):
        v = report.verdict_split.get(k, 0)
        pct = v / report.sample_size * 100
        bar = "█" * int(pct / 5)
        lines.append(f"    {k:<15} {bar} {v} ({pct:.0f}%)")

    if report.per_niche:
        lines.append("─" * 60)
        lines.append("  Per-niche:")
        for niche, d in sorted(report.per_niche.items()):
            lines.append(
                f"    {niche:<14} n={d['sample_size']:<4} "
                f"win {d['win_rate']:.0f}%  median {d['median_ratio']:.2f}x"
            )

    lines.append("─" * 60)
    if report.confidence == "LOW":
        lines.append("  ⚠  LOW confidence: too few samples to claim the product")
        lines.append(f"     works. Collect at least {MIN_SAMPLES_MEDIUM} evaluated briefs.")
    elif report.confidence == "MEDIUM":
        lines.append("  Directional signal only. Keep collecting toward 50+ for HIGH.")
    else:
        lines.append("  HIGH confidence: this is a defensible performance claim.")
    lines.append("━" * 60)
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="AutoSignal brief outperformance report")
    parser.add_argument("--niche", default=None, help="Filter to one niche slug")
    parser.add_argument("--source", default="auto", choices=["auto", "supabase", "sqlite"])
    parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    args = parser.parse_args()

    report = evaluate(niche=args.niche, source=args.source)

    if args.json:
        print(json.dumps(asdict(report), indent=2))
    else:
        print(format_report(report))


if __name__ == "__main__":
    main()