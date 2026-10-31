"""
tests/full_audit.py
===================
Comprehensive cross-niche audit of every pipeline JSON output.

For each niche it inspects:
  - top_100_videos.json        (discovery funnel, admission gates)
  - merged_videos.json         (dedup, freshness)
  - merged_videos_semantic.json(field completeness, score sanity)
  - video_clusters_semantic.json(cluster quality, contamination)
  - opportunities.json         (ranking sanity, signal spread)
  - discarded_videos.json      (rejection reasons)

Reports: noise / garbage / off-niche leakage / dead signal / scoring pathologies.
Exits non-zero if any niche fails a hard quality bar.
"""
import json
import math
import sys
from collections import Counter
from pathlib import Path
from statistics import median, mean

ROOT = Path(__file__).resolve().parent.parent

# Foreign keywords per niche — a finance dataset with "alternator" titles is leakage.
OFF_NICHE = {
    "automotive": ["stock", "invest", "dividend", "etf", "crypto", "notion", "study with me",
                   "morning routine", "chatgpt", "react tutorial", "budgeting"],
    "finance":    ["alternator", "oil change", "transmission", "brake pad", "spark plug",
                   "diesel", "cummins", "notion setup", "morning routine", "chatgpt tutorial"],
    "technology": ["alternator", "oil change", "dividend", "study with me", "morning routine",
                   "brake pad", "transmission flush", "roth ira"],
    "productivity":["alternator", "oil change", "transmission", "brake pad", "spark plug",
                    "diesel", "cummins", "stock market", "dividend", "etf"],
}

def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return {"_error": f"{type(e).__name__}: {e}"}

def vids(payload):
    if isinstance(payload, list): return payload
    if isinstance(payload, dict):
        for k in ("videos", "items", "data"):
            if isinstance(payload.get(k), list): return payload[k]
    return []

def pct(a, b): return 100.0 * a / b if b else 0.0

def hr(label, char="═"):
    print("\n" + char * 78)
    print(f"  {label}")
    print(char * 78)

def audit_niche(niche):
    base = ROOT / "data" / niche
    hr(f"NICHE: {niche.upper()}   ·   path = {base}")

    issues, wins = [], []

    # ── 1. top_100_videos.json ─────────────────────────────────────────────────
    hr("1. DISCOVERY FUNNEL  (top_100_videos.json)", "─")
    t100 = load(base / "top_100_videos.json")
    if "_error" in t100:
        print("  ✗", t100["_error"]); issues.append(f"{niche}: top_100 unreadable"); return issues, wins
    discovered = t100.get("total_discovered", 0)
    survived = t100.get("total_survived_filtering", 0)
    videos = vids(t100)
    admit_rate = pct(survived, discovered)
    print(f"  discovered={discovered}  survived={survived}  videos_in_file={len(videos)}  admit_rate={admit_rate:.1f}%")
    if discovered == 0:
        issues.append(f"{niche}: nothing discovered (API failure?)"); return issues, wins
    if admit_rate < 3 and discovered > 100:
        print(f"  ⚠ very low admit rate ({admit_rate:.1f}%) — admission gates may be too strict")
        issues.append(f"{niche}: admit rate {admit_rate:.1f}% very low")
    if not videos:
        issues.append(f"{niche}: no videos survived"); return issues, wins

    # ── 2. merged_videos_semantic.json (the working dataset) ───────────────────
    hr("2. SEMANTIC DATASET  (merged_videos_semantic.json)", "─")
    sem = load(base / "merged_videos_semantic.json")
    svids = vids(sem)
    print(f"  videos: {len(svids)}")
    if len(svids) < 30:
        issues.append(f"{niche}: only {len(svids)} videos in semantic set (<30 = thin)")

    # Field completeness
    crit = ["view_count","channel_subscriber_count","channel_avg_views","views_per_hour",
            "engagement_score","hours_since_publish","repair_similarity","analysis_score_10",
            "outperformance_ratio","semantic_embedding","intent_label"]
    print("  field completeness:")
    for field in crit:
        present = sum(1 for v in svids if v.get(field) not in (None, "", [], 0)
                      or (field in ("semantic_embedding",) and v.get(field)))
        p = pct(present, len(svids)) if svids else 0
        flag = " ⚠" if p < 80 else ""
        if flag and field != "semantic_embedding":
            issues.append(f"{niche}: {field} coverage {p:.0f}%")
        print(f"     {field:<28} {present:>4}/{len(svids):<4} {p:5.1f}%{flag}")

    # Score distribution
    scores = [v.get("analysis_score_10") for v in svids if isinstance(v.get("analysis_score_10"), (int,float))]
    if scores:
        print(f"  analysis_score_10: min={min(scores):.2f} median={median(scores):.2f} max={max(scores):.2f} mean={mean(scores):.2f}")
        if max(scores) < 3.0:
            issues.append(f"{niche}: max analysis_score_10 {max(scores):.2f} — scoring looks dead/broken")
            print(f"  ⚠ ALL SCORES LOW — scoring model may be broken for this niche")
        if max(scores) - min(scores) < 1.0:
            issues.append(f"{niche}: score spread {max(scores)-min(scores):.2f} — no differentiation")
            print(f"  ⚠ NO SCORE SPREAD — everything scores the same, ranking is meaningless")
        else:
            wins.append(f"{niche}: healthy score spread ({max(scores)-min(scores):.1f})")

    # Outlier / outperformance signal (the product thesis)
    outperf = [v.get("outperformance_ratio") for v in svids if isinstance(v.get("outperformance_ratio"), (int,float)) and v.get("outperformance_ratio") > 0]
    if outperf:
        strong = sum(1 for o in outperf if o >= 3.0)
        print(f"  outperformance_ratio present on {len(outperf)}/{len(svids)} videos; ≥3x: {strong}")
        if strong == 0:
            issues.append(f"{niche}: zero strong outliers (≥3x channel avg) — core thesis signal absent")
            print(f"  ⚠ NO STRONG OUTLIERS — the product's main value signal is missing")
        else:
            wins.append(f"{niche}: {strong} strong outliers (≥3x channel avg)")
    else:
        issues.append(f"{niche}: outperformance_ratio missing on all videos")
        print(f"  ⚠ outperformance_ratio MISSING — channel_avg_views enrichment failed")

    # ── 3. Off-niche leakage ───────────────────────────────────────────────────
    hr("3. OFF-NICHE LEAKAGE", "─")
    leak_kw = OFF_NICHE.get(niche, [])
    leaks = Counter()
    for v in svids:
        text = f"{v.get('title','')} {v.get('description','')}".lower()
        for kw in leak_kw:
            if kw in text: leaks[kw] += 1
    if leaks:
        print(f"  ⚠ potential off-niche leakage:")
        for kw, c in leaks.most_common(8):
            print(f"     {c:>4} videos mention '{kw}'")
        issues.append(f"{niche}: off-niche leakage ({dict(leaks.most_common(3))})")
    else:
        print(f"  ✓ no off-niche keyword leakage ({len(leak_kw)} markers scanned)")
        wins.append(f"{niche}: clean of off-niche leakage")

    # ── 4. Title noise / garbage detection ─────────────────────────────────────
    hr("4. TITLE NOISE / GARBAGE", "─")
    garbage = []
    for v in svids:
        title = (v.get("title") or "").strip()
        if len(title) < 10:
            garbage.append((v.get("video_id"), f"short title: '{title}'"))
        elif title.isupper() and len(title) > 60:
            garbage.append((v.get("video_id"), f"all-caps shouty: '{title[:50]}...'"))
    # Non-English / non-niche script detection (devanagari, etc.)
    import re as _re
    non_latin = []
    for v in svids:
        title = v.get("title") or ""
        if _re.search(r"[\u0900-\u097F\u4e00-\u9fff\u0600-\u06FF]", title):
            non_latin.append((v.get("video_id"), title[:60]))
    if garbage:
        print(f"  ⚠ {len(garbage)} titles flagged as noise:")
        for vid, reason in garbage[:5]: print(f"     {vid}: {reason}")
        issues.append(f"{niche}: {len(garbage)} noisy titles")
    else:
        print(f"  ✓ no obviously noisy titles")
    if non_latin:
        print(f"  ⚠ {len(non_latin)} non-Latin-script titles (likely wrong-language leakage):")
        for vid, t in non_latin[:5]: print(f"     {vid}: {t}")
        issues.append(f"{niche}: {len(non_latin)} non-Latin titles (language leakage)")

    # ── 5. Clusters ────────────────────────────────────────────────────────────
    hr("5. CLUSTERS  (video_clusters_semantic.json)", "─")
    cl = load(base / "video_clusters_semantic.json")
    clusters = cl.get("clusters", []) if isinstance(cl, dict) else []
    print(f"  clusters: {len(clusters)}")
    viable = [c for c in clusters if c.get("video_count", 0) >= 3]
    tiny = [c for c in clusters if c.get("video_count", 0) < 3]
    print(f"  viable (≥3 videos): {len(viable)}   tiny (<3): {len(tiny)}")
    if tiny:
        print(f"  ⚠ {len(tiny)} clusters too small to be statistically meaningful (still scored & ranked)")
    contamination = [c for c in clusters if c.get("contamination_flag") or any(v.get("contamination_flag") for v in (c.get("top_videos") or []))]
    if contamination:
        print(f"  ⚠ {len(contamination)} clusters with contamination flags")
        issues.append(f"{niche}: {len(contamination)} contaminated clusters")
    if clusters:
        for c in clusters[:5]:
            print(f"     #{c.get('cluster_rank')} {c.get('cluster_label','?'):<32} vc={c.get('video_count'):>3} score={c.get('cluster_score10','?')} topic={c.get('topic')}")

    # ── 6. Opportunities ───────────────────────────────────────────────────────
    hr("6. OPPORTUNITIES  (opportunities.json)", "─")
    opps = load(base / "opportunities.json")
    if isinstance(opps, list) and opps:
        finals = [o.get("final_score",0) for o in opps]
        print(f"  opportunities: {len(opps)}  top={max(finals):.2f} median={median(finals):.2f} min={min(finals):.2f}")
        if max(finals) < 4.0:
            issues.append(f"{niche}: top opportunity score {max(finals):.2f} — weak/no signal")
            print(f"  ⚠ TOP OPPORTUNITY ONLY {max(finals):.2f}/10 — nothing looks worth recommending")
        # Are windows diverse or all NICHE?
        windows = Counter(o.get("window") for o in opps)
        print(f"  windows: {dict(windows)}")
        if len(windows) <= 1:
            issues.append(f"{niche}: all opportunities same window — no timing differentiation")
        print(f"  top 5:")
        for i,o in enumerate(opps[:5],1):
            print(f"     #{i} {o.get('cluster_label','?'):<30} final={o.get('final_score')} window={o.get('window')} vel={o.get('trending_score')} gap={o.get('search_gap_score')} sea={o.get('seasonal_score')}")
    else:
        issues.append(f"{niche}: opportunities.json empty/invalid")

    # ── 7. Discards ────────────────────────────────────────────────────────────
    hr("7. ADMISSION FUNNEL  (discarded_videos.json)", "─")
    disc = load(base / "discarded_videos.json")
    dlist = disc.get("discarded", []) if isinstance(disc, dict) else []
    print(f"  total discarded on record: {len(dlist)}")
    if dlist:
        reasons = Counter((v.get("discard_reason") or "unknown")[:55] for v in dlist)
        for r,c in reasons.most_common(5):
            print(f"     {c:>5} × {r}")

    return issues, wins


def main():
    niches = sys.argv[1:] or ["automotive", "finance", "technology", "productivity"]
    all_issues, all_wins = [], []
    for n in niches:
        i, w = audit_niche(n)
        all_issues += i; all_wins += w

    hr("GLOBAL VERDICT")
    print(f"  WINS  ({len(all_wins)}):")
    for x in all_wins: print(f"    ✓ {x}")
    print(f"\n  ISSUES ({len(all_issues)}):")
    for x in all_issues: print(f"    ✗ {x}")
    print("\n" + "═"*78)
    print(f"  {'PASS' if not all_issues else 'ISSUES FOUND'} — {len(all_issues)} issue(s) across {len(niches)} niche(s)")
    print("═"*78)
    return 1 if all_issues else 0


if __name__ == "__main__":
    sys.exit(main())
