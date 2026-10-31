"""
rate_limiter.py
===============
Budget controls and cost tracking for Gemini API calls.

Features:
  - Tracks token usage per brief in SQLite (gemini_usage table)
  - Configurable daily budget cap (default: 50 briefs / day)
  - Logs estimated cost per run (based on Gemini 2.5 Flash pricing)
  - Raises BudgetExceededError when daily quota is hit
  - Graceful degradation: callers should catch BudgetExceededError and
    fall back to rule-based brief generation

Usage:
    from rate_limiter import RateLimiter

    rl = RateLimiter()

    # Before generating a brief:
    rl.check_budget()               # raises BudgetExceededError if over cap

    # After Gemini responds:
    rl.record_usage(
        brief_id="abc123",
        input_tokens=1200,
        output_tokens=800,
        model="gemini-2.5-flash",
        cluster_label="AC & HVAC",
    )

    # Summary for the run:
    print(rl.daily_summary())
"""

import sqlite3
import logging
from datetime import datetime, timezone, date
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

ROOT    = Path(__file__).resolve().parent


def _default_db_path() -> Path:
    """Resolve the active niche DB via pipeline_paths so the Gemini cost ledger
    lives in the same database as the niche's pipeline data. Falls back to the
    legacy root path if pipeline_paths is unavailable."""
    try:
        from pipeline_paths import get_paths
        return get_paths("automotive").db
    except Exception:
        return ROOT / "youtube_automotive.db"


DB_PATH = _default_db_path()

# ── Pricing constants (USD per 1M tokens) ─────────────────────────────────────
# Source: https://ai.google.dev/pricing  (Gemini 2.5 Flash, as of 2025-06)
_PRICING: dict = {
    "gemini-2.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-1.5-flash": {"input": 0.075, "output": 0.30},
    "gemini-1.5-pro":   {"input": 3.50,  "output": 10.50},
    "default":          {"input": 0.075, "output": 0.30},
}

# ── Default limits ────────────────────────────────────────────────────────────
DEFAULT_DAILY_BRIEF_CAP      = 50    # max Gemini brief calls per calendar day
DEFAULT_DAILY_TOKEN_CAP      = 5_000_000   # max input+output tokens per day


class BudgetExceededError(Exception):
    """Raised when the daily Gemini API budget cap has been reached."""


class RateLimiter:
    """
    Tracks Gemini token usage and enforces daily caps.

    Args:
        db_path:           Path to SQLite database.
        daily_brief_cap:   Max number of Gemini brief generations per day.
        daily_token_cap:   Max total tokens (input + output) per day.
    """

    def __init__(
        self,
        db_path: Path = DB_PATH,
        daily_brief_cap: int = DEFAULT_DAILY_BRIEF_CAP,
        daily_token_cap: int = DEFAULT_DAILY_TOKEN_CAP,
    ):
        self.db_path         = db_path
        self.daily_brief_cap = daily_brief_cap
        self.daily_token_cap = daily_token_cap
        self._conn: Optional[sqlite3.Connection] = None
        self._ensure_table()

    # ── DB helpers ──────────────────────────────────────────────────────────

    def _connect(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
        return self._conn

    def _ensure_table(self) -> None:
        try:
            conn = self._connect()
            conn.execute("""
                CREATE TABLE IF NOT EXISTS gemini_usage (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    used_at         TEXT    NOT NULL,
                    usage_date      TEXT    NOT NULL,
                    brief_id        TEXT,
                    cluster_label   TEXT,
                    model           TEXT,
                    input_tokens    INTEGER DEFAULT 0,
                    output_tokens   INTEGER DEFAULT 0,
                    total_tokens    INTEGER DEFAULT 0,
                    estimated_cost  REAL    DEFAULT 0.0
                )
            """)
            conn.commit()
        except Exception as e:
            log.warning("RateLimiter: could not create gemini_usage table: %s", e)

    # ── Core API ────────────────────────────────────────────────────────────

    def check_budget(self) -> None:
        """
        Check whether the daily budget allows another Gemini call.
        Raises BudgetExceededError if either cap is exceeded.
        """
        today = date.today().isoformat()
        try:
            conn = self._connect()
            row = conn.execute("""
                SELECT COUNT(*), SUM(total_tokens)
                FROM gemini_usage
                WHERE usage_date = ?
            """, (today,)).fetchone()

            brief_count  = int(row[0] or 0)
            token_total  = int(row[1] or 0)

            if brief_count >= self.daily_brief_cap:
                raise BudgetExceededError(
                    f"Daily brief cap reached: {brief_count}/{self.daily_brief_cap} "
                    f"Gemini calls today. Falling back to rule-based generation."
                )
            if token_total >= self.daily_token_cap:
                raise BudgetExceededError(
                    f"Daily token cap reached: {token_total:,}/{self.daily_token_cap:,} "
                    f"tokens used today. Falling back to rule-based generation."
                )
        except BudgetExceededError:
            raise
        except Exception as e:
            # Don't block generation if DB check fails — just warn
            log.warning("RateLimiter: budget check failed (non-fatal): %s", e)

    def record_usage(
        self,
        input_tokens: int,
        output_tokens: int,
        model: str = "gemini-2.5-flash",
        brief_id: Optional[str] = None,
        cluster_label: Optional[str] = None,
    ) -> float:
        """
        Record a completed Gemini call and return the estimated USD cost.

        Args:
            input_tokens:   Number of prompt tokens sent.
            output_tokens:  Number of completion tokens received.
            model:          Model name (used for pricing lookup).
            brief_id:       Brief UUID for cross-referencing.
            cluster_label:  Human-readable cluster name for the log.

        Returns:
            Estimated cost in USD.
        """
        pricing     = _PRICING.get(model, _PRICING["default"])
        cost        = (input_tokens / 1_000_000 * pricing["input"] +
                       output_tokens / 1_000_000 * pricing["output"])
        total_tokens = input_tokens + output_tokens
        now          = datetime.now(timezone.utc)

        try:
            conn = self._connect()
            conn.execute("""
                INSERT INTO gemini_usage
                    (used_at, usage_date, brief_id, cluster_label, model,
                     input_tokens, output_tokens, total_tokens, estimated_cost)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                now.isoformat(),
                now.date().isoformat(),
                brief_id,
                cluster_label,
                model,
                input_tokens,
                output_tokens,
                total_tokens,
                round(cost, 6),
            ))
            conn.commit()
        except Exception as e:
            log.warning("RateLimiter: could not record usage (non-fatal): %s", e)

        log.info(
            "  Gemini usage: %s | in=%d out=%d total=%d | est. $%.4f",
            cluster_label or brief_id or "?", input_tokens, output_tokens, total_tokens, cost
        )
        return cost

    def daily_summary(self, target_date: Optional[str] = None) -> dict:
        """
        Return a summary dict for today's (or a specific date's) Gemini usage.

        Returns:
            {date, brief_count, total_tokens, estimated_cost_usd,
             cap_remaining_briefs, cap_remaining_tokens,
             budget_pct_used}
        """
        today = target_date or date.today().isoformat()
        try:
            conn = self._connect()
            row = conn.execute("""
                SELECT COUNT(*), SUM(input_tokens), SUM(output_tokens),
                       SUM(total_tokens), SUM(estimated_cost)
                FROM gemini_usage
                WHERE usage_date = ?
            """, (today,)).fetchone()
        except Exception as e:
            log.warning("RateLimiter: daily_summary query failed: %s", e)
            row = (0, 0, 0, 0, 0.0)

        brief_count    = int(row[0] or 0)
        input_tokens   = int(row[1] or 0)
        output_tokens  = int(row[2] or 0)
        total_tokens   = int(row[3] or 0)
        estimated_cost = float(row[4] or 0.0)

        return {
            "date":                    today,
            "brief_count":             brief_count,
            "input_tokens":            input_tokens,
            "output_tokens":           output_tokens,
            "total_tokens":            total_tokens,
            "estimated_cost_usd":      round(estimated_cost, 4),
            "cap_remaining_briefs":    max(0, self.daily_brief_cap - brief_count),
            "cap_remaining_tokens":    max(0, self.daily_token_cap - total_tokens),
            "budget_pct_used":         round(brief_count / self.daily_brief_cap * 100, 1),
        }

    def log_daily_summary(self) -> None:
        """Print a formatted daily summary to the log."""
        s = self.daily_summary()
        log.info(
            "Gemini daily usage: %d/%d briefs | %s/%s tokens | est. $%.4f | %.1f%% of cap",
            s["brief_count"], self.daily_brief_cap,
            f"{s['total_tokens']:,}", f"{self.daily_token_cap:,}",
            s["estimated_cost_usd"],
            s["budget_pct_used"],
        )

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


# ── Module-level singleton (lazy-initialised) ─────────────────────────────────
_default_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Return the module-level singleton RateLimiter."""
    global _default_limiter
    if _default_limiter is None:
        _default_limiter = RateLimiter()
    return _default_limiter


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    """Print today's Gemini usage summary."""
    import argparse
    parser = argparse.ArgumentParser(description="Gemini API usage report")
    parser.add_argument("--date", default=None, help="Date (YYYY-MM-DD) to query (default: today)")
    args = parser.parse_args()

    rl = RateLimiter()
    s  = rl.daily_summary(target_date=args.date)
    rl.close()

    print()
    print("━" * 50)
    print(f"  Gemini Usage Summary — {s['date']}")
    print("━" * 50)
    print(f"  Briefs generated:    {s['brief_count']} / {DEFAULT_DAILY_BRIEF_CAP} cap")
    print(f"  Tokens used:         {s['total_tokens']:,} / {DEFAULT_DAILY_TOKEN_CAP:,} cap")
    print(f"  Input tokens:        {s['input_tokens']:,}")
    print(f"  Output tokens:       {s['output_tokens']:,}")
    print(f"  Estimated cost:      ${s['estimated_cost_usd']:.4f}")
    print(f"  Budget used:         {s['budget_pct_used']:.1f}%")
    print(f"  Remaining briefs:    {s['cap_remaining_briefs']}")
    print(f"  Remaining tokens:    {s['cap_remaining_tokens']:,}")
    print("━" * 50)
    print()


if __name__ == "__main__":
    main()
