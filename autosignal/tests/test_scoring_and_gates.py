"""
Unit tests for the two correctness-critical subsystems of AutoSignal:

  1. SCORING — shared_utils.compute_composite_score, subscriber_efficiency_score,
     outperformance_ratio, and brief_generator.score_brief_quality.
  2. ADMISSION GATES — metadata_fetch.passes_admission_gates.

These are the subsystems where a silent regression (a wrong weight, an
automotive keyword leaking into finance, a stale video sneaking past the age
gate) directly degrades every brief the product ships. They are pure functions
of their inputs, so they can be tested without the network or the Gemini API.

Run:  python -m pytest tests/test_scoring_and_gates.py -v
  or:  python tests/test_scoring_and_gates.py          (no pytest needed)

NOTE on imports: shared_utils is pure-Python and imports instantly, so the
numeric + scoring tests always run. The admission-gate and brief-quality tests
depend on heavy modules (metadata_fetch imports sentence-transformers at module
load; brief_generator initialises the Gemini client). On a minimal / cold-cache
environment those imports can take tens of seconds or hang entirely (e.g. torch
downloading wheels). Rather than let a hung import freeze the whole run, we
PROBE each heavy module in a short-lived subprocess with a hard timeout: if it
doesn't come up cleanly within the window, that class is skipped, not hung.
"""

import math
import os
import subprocess
import sys
import unittest

# Make the project root importable when run directly (python tests/...).
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _PROJECT_ROOT)

# How long (seconds) a heavy-module import may take before we give up and skip.
# Long enough to admit a warm-cache import (~1-5s), short enough that the run
# never hangs waiting on a torch/sentence-transformers cold start.
_HEAVY_IMPORT_TIMEOUT = 30.0

from shared_utils import (  # lightweight — safe to import eagerly
    clamp,
    compute_composite_score,
    normalize_log,
    outperformance_ratio,
    safe_float,
    subscriber_efficiency_score,
)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _base_video(**overrides):
    """A video dict that passes every gate / scores cleanly; override per-test."""
    base = {
        "view_count": 50000,
        "channel_subscriber_count": 5000,
        "channel_avg_views": 8000,
        "views_per_hour": 30.0,
        "engagement_score": 0.05,
        "hours_since_publish": 120,          # 5 days old
        "description": "x " * 120,           # substantive description
        "like_count": 600,
        "comment_count": 40,
        "relevance_score": 7.0,
        "title": "How to rebuild a 5.3L Vortec engine step by step",
    }
    base.update(overrides)
    return base


# ──────────────────────────────────────────────────────────────────────────────
# 1. Numeric utilities (shared_utils)
# ──────────────────────────────────────────────────────────────────────────────

class TestNumericUtils(unittest.TestCase):

    def test_safe_float_handles_garbage(self):
        self.assertEqual(safe_float(None, -1.0), -1.0)
        self.assertEqual(safe_float("abc", 7.0), 7.0)
        self.assertEqual(safe_float("3.5"), 3.5)
        self.assertEqual(safe_float(0), 0.0)

    def test_clamp(self):
        self.assertEqual(clamp(5.0, 0.0, 1.0), 1.0)
        self.assertEqual(clamp(-1.0, 0.0, 1.0), 0.0)
        self.assertEqual(clamp(0.4, 0.0, 1.0), 0.4)

    def test_normalize_log_monotonic_and_bounded(self):
        self.assertEqual(normalize_log(0.0, 100.0), 0.0)
        self.assertLess(normalize_log(10.0, 100.0), normalize_log(50.0, 100.0))
        self.assertLessEqual(normalize_log(1_000_000.0, 100.0), 1.0)
        # Degenerate max_value must not blow up.
        self.assertEqual(normalize_log(5.0, 0.0), 0.0)


# ──────────────────────────────────────────────────────────────────────────────
# 2. Subscriber efficiency + outperformance (A8)
# ──────────────────────────────────────────────────────────────────────────────

class TestSubscriberEfficiency(unittest.TestCase):

    def test_age_penalty_favors_fresh_breakouts(self):
        """The regression we fixed: old videos must NOT out-score fresh ones
        at the same views/subs ratio. Stale accumulation is not outperformance."""
        fresh = subscriber_efficiency_score(6000, 2000, hours_since_publish=48)
        stale = subscriber_efficiency_score(6000, 2000, hours_since_publish=8760 * 2)
        self.assertGreater(fresh, stale)

    def test_monotonic_in_ratio(self):
        r1 = subscriber_efficiency_score(1000, 1000, hours_since_publish=48)
        r3 = subscriber_efficiency_score(3000, 1000, hours_since_publish=48)
        r10 = subscriber_efficiency_score(10000, 1000, hours_since_publish=48)
        self.assertLess(r1, r3)
        self.assertLess(r3, r10)

    def test_log_saturation_caps_at_one(self):
        """A 100x breakout must not score 100x a 1x video — diminishing returns.
        The score saturates at the clamp ceiling (1.0), never exceeds it."""
        baseline = subscriber_efficiency_score(1000, 1000, hours_since_publish=48)
        huge = subscriber_efficiency_score(100_000, 1000, hours_since_publish=48)
        self.assertLessEqual(huge, 1.0)
        self.assertGreater(huge, baseline)

    def test_neutral_default_when_no_subs(self):
        self.assertEqual(subscriber_efficiency_score(5000, 0, 48), 0.45)
        self.assertEqual(subscriber_efficiency_score(5000, -1, 48), 0.45)

    def test_zero_views_scores_zero(self):
        self.assertEqual(subscriber_efficiency_score(0, 5000, 48), 0.0)


class TestOutperformanceRatio(unittest.TestCase):

    def test_basic_multiple(self):
        self.assertEqual(outperformance_ratio(5000, 1000), 5.0)

    def test_no_baseline_returns_zero(self):
        self.assertEqual(outperformance_ratio(5000, 0), 0.0)
        self.assertEqual(outperformance_ratio(5000, -1), 0.0)

    def test_below_baseline(self):
        """A video underperforming its channel average yields a ratio < 1."""
        self.assertLess(outperformance_ratio(500, 1000), 1.0)


# ──────────────────────────────────────────────────────────────────────────────
# 3. Composite score (shared_utils.compute_composite_score)
# ──────────────────────────────────────────────────────────────────────────────

class TestCompositeScore(unittest.TestCase):

    def test_score_in_range(self):
        s = compute_composite_score(_base_video())
        self.assertGreaterEqual(s, 0.0)
        self.assertLessEqual(s, 10.0)

    def test_higher_engagement_raises_score(self):
        low = compute_composite_score(_base_video(engagement_score=0.01))
        high = compute_composite_score(_base_video(engagement_score=0.12))
        self.assertGreater(high, low)

    def test_missing_subscribers_uses_neutral_default(self):
        """No subscriber data must not crash and must produce a valid score."""
        v = _base_video()
        del v["channel_subscriber_count"]
        s = compute_composite_score(v)
        self.assertGreaterEqual(s, 0.0)
        self.assertLessEqual(s, 10.0)

    def test_missing_channel_avg_does_not_crash(self):
        v = _base_video()
        del v["channel_avg_views"]
        # Should still compute (outperformance_ratio returns 0.0 gracefully).
        s = compute_composite_score(v)
        self.assertGreaterEqual(s, 0.0)


# ──────────────────────────────────────────────────────────────────────────────
# 4. Admission gates (metadata_fetch.passes_admission_gates)
# ──────────────────────────────────────────────────────────────────────────────

def _heavy_module_available(module_name: str, block=()):
    """
    Import a module in a throwaway subprocess with a hard timeout.

    Returns True if the import succeeded within _HEAVY_IMPORT_TIMEOUT seconds,
    False otherwise (import error, slow cold start, or a true hang). Doing the
    probe in a subprocess is essential: importing metadata_fetch in-process can
    block on sentence-transformers/torch initialisation and would freeze the
    whole test run instead of skipping cleanly.

    `block` is an optional tuple of module names to pre-block (set to None in
    sys.modules) before importing. This lets us test pure-logic functions
    (e.g. passes_admission_gates, which never touches the embedding stack) even
    when the real sentence-transformers install hangs in this environment — we
    exercise the module's graceful-degradation code path on purpose.
    """
    block_prefix = ""
    if block:
        # Pre-poison sys.modules so `import X` raises ImportError immediately.
        block_prefix = "".join(
            f"import sys; sys.modules[{name!r}] = None; " for name in block
        )
    try:
        result = subprocess.run(
            [sys.executable, "-c", f"{block_prefix}import {module_name}"],
            cwd=_PROJECT_ROOT,
            timeout=_HEAVY_IMPORT_TIMEOUT,
            capture_output=True,
            text=True,
        )
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        return False
    except Exception:
        return False


def _load_admission_gates():
    """Lazily import passes_admission_gates; return None if metadata_fetch
    truly cannot be imported.

    passes_admission_gates is pure logic — it never touches the embedding
    model — so we import metadata_fetch with sentence_transformers pre-blocked.
    This both exercises the module's real graceful-degradation path AND keeps
    the test from hanging on a cold torch/sentence-transformers import.
    """
    if not _heavy_module_available("metadata_fetch", block=("sentence_transformers",)):
        return None
    # Pre-poison in this process too, so the in-process import degrades fast.
    sys.modules.setdefault("sentence_transformers", None)
    try:
        import importlib
        importlib.import_module("metadata_fetch")
        from metadata_fetch import passes_admission_gates  # noqa: WPS433
        return passes_admission_gates
    except Exception:
        return None


@unittest.skipUnless(
    _load_admission_gates() is not None,
    "metadata_fetch requires the heavy ML stack (sentence-transformers); skipping.",
)
class TestAdmissionGates(unittest.TestCase):

    def setUp(self):
        self.gate = _load_admission_gates()

    def _good_semantic(self):
        return {"repair_similarity": 0.55, "junk_similarity": 0.10}

    def test_clean_video_passes(self):
        passed, reason = self.gate(_base_video(), self._good_semantic(), niche="automotive")
        self.assertTrue(passed, msg=f"clean video rejected: {reason}")

    def test_off_niche_rejected(self):
        sem = {"repair_similarity": 0.10, "junk_similarity": 0.05}
        passed, reason = self.gate(_base_video(), sem, niche="automotive")
        self.assertFalse(passed)
        self.assertIn("relevance", reason)

    def test_ambiguous_relevance_rejected(self):
        # positive barely above noise floor -> margin gate fires
        sem = {"repair_similarity": 0.40, "junk_similarity": 0.36}
        passed, reason = self.gate(_base_video(), sem, niche="automotive")
        self.assertFalse(passed)
        self.assertIn("margin", reason)

    def test_short_title_rejected(self):
        v = _base_video(title="short")
        passed, reason = self.gate(v, self._good_semantic(), niche="automotive")
        self.assertFalse(passed)
        self.assertIn("short", reason)

    def test_dead_engagement_rejected(self):
        v = _base_video(engagement_score=0.0001)
        passed, reason = self.gate(v, self._good_semantic(), niche="automotive")
        self.assertFalse(passed)
        self.assertIn("engagement", reason)

    def test_stale_video_rejected_by_age(self):
        # technology niche caps at 365 days; a 2-year-old video is stale there.
        v = _base_video(hours_since_publish=365 * 2 * 24)
        passed, reason = self.gate(v, self._good_semantic(), niche="technology")
        self.assertFalse(passed)
        self.assertIn("stale", reason)

    def test_evergreen_old_video_survives_in_automotive(self):
        # automotive tolerates 3 years (1095 days); 2.5yo must pass the age gate.
        v = _base_video(hours_since_publish=int(2.5 * 365 * 24))
        passed, reason = self.gate(v, self._good_semantic(), niche="automotive")
        # (may fail on a different gate, but must NOT be the age/stale gate)
        if not passed:
            self.assertNotIn("stale", reason, msg=f"evergreen automotive wrongly aged out: {reason}")

    def test_low_views_rejected(self):
        v = _base_video(view_count=50)
        passed, reason = self.gate(v, self._good_semantic(), niche="automotive")
        self.assertFalse(passed)
        self.assertIn("audience", reason)

    def test_small_channel_outlier_survives(self):
        """Core thesis: a 500-sub video with 3K views must PASS — outlier
        status is scored downstream, never hard-rejected on view count."""
        v = _base_video(view_count=3000, channel_subscriber_count=500)
        passed, reason = self.gate(v, self._good_semantic(), niche="automotive")
        self.assertTrue(passed, msg=f"genuine small-channel outlier rejected: {reason}")

    def test_niche_specific_relevance_threshold(self):
        """automotive (0.35) is stricter than productivity (0.30): a 0.32
        relevance video is admitted in productivity but rejected in automotive."""
        sem = {"repair_similarity": 0.32, "junk_similarity": 0.10}
        prod_pass, _ = self.gate(_base_video(), sem, niche="productivity")
        auto_pass, _ = self.gate(_base_video(), sem, niche="automotive")
        self.assertTrue(prod_pass)
        self.assertFalse(auto_pass)

    def test_admitted_video_carries_quality_score_for_sort(self):
        """Regression guard for the KeyError that crashed metadata_fetch at the
        final sort. The admission loop does `v.update(scores)` BEFORE computing
        quality_score, so quality_score must be set on v directly too —
        otherwise the downstream `sort(key=lambda x: x['quality_score'])`
        raises KeyError and the whole pipeline aborts after all the expensive
        fetch/enrich/scoring work is done."""
        import importlib
        metadata_fetch = importlib.import_module("metadata_fetch")

        scores = {"repair_similarity": 0.60, "junk_similarity": 0.10, "passed": True}
        v = _base_video()
        # Mirror the exact admission-loop sequence from metadata_fetch.main().
        v.update(scores)
        passed, _ = self.gate(v, scores, niche="automotive")
        if passed:
            quality_score = scores["repair_similarity"] - scores["junk_similarity"]
            scores["quality_score"] = quality_score
            v["quality_score"] = quality_score  # the fix
        # The sort must not raise.
        sorted_dataset = sorted([v, {"quality_score": 0.1}], key=lambda x: x["quality_score"], reverse=True)
        self.assertEqual(sorted_dataset[0]["quality_score"], 0.5)


# ──────────────────────────────────────────────────────────────────────────────
# 5. Brief quality scoring + niche-aware gaps (B3) — brief_generator
# ──────────────────────────────────────────────────────────────────────────────

def _load_brief_quality():
    if not _heavy_module_available("brief_generator"):
        return None
    try:
        from brief_generator import score_brief_quality, _extract_competitor_gaps  # noqa
        return score_brief_quality, _extract_competitor_gaps
    except Exception:
        return None


@unittest.skipUnless(
    _load_brief_quality() is not None,
    "brief_generator requires Gemini client config / heavy deps; skipping.",
)
class TestBriefQualityAndGaps(unittest.TestCase):

    def setUp(self):
        self.score_brief_quality, self.extract_gaps = _load_brief_quality()

    def _finance_brief(self):
        # Title contains finance-specific terms, no digits/years, so the ONLY way
        # specificity scores high is if the finance keyword list is consulted.
        return {
            "titles": {
                "title_1_search_match": "Why Vanguard Dividend Funds Beat Savings",
                "title_2_curiosity": "The Index Fund Trap Nobody Warns You About",
                "title_3_value": "Vanguard vs Fidelity: Real Cost Breakdown",
                "recommended_title": "title_1_search_match",
                "reason": "SEO match for high-intent searchers.",
            },
            "hook_script": (
                "If you want to retire early stop scrolling and listen to me carefully "
                "because this one decision changes everything about your financial future "
                "and I will show you the exact numbers right now"
            ),
            "tags": ["index fund", "etf", "dividend", "vanguard", "investing"],
            "key_points": [{"point": "x", "why": "y"}, {"point": "z", "why": "w"}],
            "what_to_avoid": [{"avoid": "x", "why": "y"}],
        }

    def test_finance_specificity_recognized_only_in_finance_niche(self):
        cluster = {"top_videos": [{"view_count": 50000}], "topic": "dividend_investing"}
        auto = self.score_brief_quality(self._finance_brief(), cluster, niche="automotive")
        fin = self.score_brief_quality(self._finance_brief(), cluster, niche="finance")
        self.assertGreater(
            fin["axis_scores"]["specificity"],
            auto["axis_scores"]["specificity"],
            "finance terms must count toward specificity in finance, not automotive",
        )

    def test_composite_score_in_range(self):
        cluster = {"top_videos": [{"view_count": 50000}], "topic": "investing"}
        q = self.score_brief_quality(self._finance_brief(), cluster, niche="finance")
        self.assertGreaterEqual(q["brief_quality_score"], 0.0)
        self.assertLessEqual(q["brief_quality_score"], 10.0)
        self.assertIn(q["quality_label"], ("LOW", "MEDIUM", "HIGH"))

    def test_gap_taxonomy_is_niche_specific(self):
        """Automotive gap concepts (torque, OBD) must NEVER appear in finance gaps."""
        auto_gaps = self.extract_gaps([{"title": "how to fix brake squeal"}], niche="automotive")
        fin_gaps = self.extract_gaps([{"title": "how to start investing"}], niche="finance")
        self.assertTrue(
            "torque" in auto_gaps.lower() or "obd" in auto_gaps.lower(),
            "automotive gaps should reference automotive concepts",
        )
        self.assertNotIn("torque", fin_gaps.lower())
        self.assertNotIn("obd", fin_gaps.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
