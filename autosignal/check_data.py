import json, sys, os

def check_niche(niche):
    path = f"data/{niche}/merged_videos_semantic.json"
    if not os.path.exists(path):
        print(f"  [NOT FOUND] {path}")
        return

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    vids = data.get("videos", [])
    print(f"\n{'='*80}")
    print(f"  NICHE: {niche.upper()}  |  Total videos: {len(vids)}")
    print(f"{'='*80}")

    # Top 15 by views
    top = sorted(vids, key=lambda x: x.get("view_count", 0), reverse=True)[:15]
    print(f"\n  TOP 15 BY VIEWS:")
    for v in top:
        topic = str(v.get("topic_primary", "?"))[:18]
        views = int(v.get("view_count", 0) or 0)
        vph   = float(v.get("views_per_hour", 0) or 0)
        ch    = str(v.get("channel_title", "?"))[:20]
        title = str(v.get("title", ""))[:65]
        bp    = float(v.get("breakout_probability", 0) or 0)
        score = float(v.get("score10", 0) or 0)
        print(f"  [{topic:<18}] {views:>10,}v | VPH:{vph:>7.1f} | BP:{bp:.0%} | S:{score:.1f} | {ch:<20} | {title}")

    # Stats
    view_counts = [int(v.get("view_count", 0) or 0) for v in vids]
    vph_vals    = [float(v.get("views_per_hour", 0) or 0) for v in vids]
    bp_vals     = [float(v.get("breakout_probability", 0) or 0) for v in vids]
    scores      = [float(v.get("score10", 0) or 0) for v in vids]

    print(f"\n  DATASET STATS:")
    print(f"  Avg views:        {sum(view_counts)//max(len(view_counts),1):,}")
    print(f"  Median views:     {sorted(view_counts)[len(view_counts)//2]:,}")
    print(f"  Max views:        {max(view_counts):,}")
    print(f"  Avg VPH:          {sum(vph_vals)/max(len(vph_vals),1):.1f}")
    print(f"  Avg breakout prob:{sum(bp_vals)/max(len(bp_vals),1):.1%}")
    print(f"  Avg score10:      {sum(scores)/max(len(scores),1):.2f}")

    # Topic breakdown
    topics = {}
    for v in vids:
        t = str(v.get("topic_primary", "unknown"))
        topics[t] = topics.get(t, 0) + 1
    print(f"\n  TOPIC BREAKDOWN:")
    for t, cnt in sorted(topics.items(), key=lambda x: -x[1]):
        print(f"    {t:<25} {cnt:>3} videos")

    # High breakout videos
    breakouts = [v for v in vids if float(v.get("breakout_probability", 0) or 0) >= 0.5]
    print(f"\n  HIGH BREAKOUT PROBABILITY (>=50%): {len(breakouts)} videos")
    for v in sorted(breakouts, key=lambda x: float(x.get("breakout_probability", 0) or 0), reverse=True)[:8]:
        print(f"    BP:{float(v.get('breakout_probability',0)):.0%} | {str(v.get('title',''))[:70]}")

    # Noise check - look for off-niche titles
    print(f"\n  POTENTIAL NOISE CHECK (low score10 < 3.0):")
    noise = [v for v in vids if float(v.get("score10", 0) or 0) < 3.0]
    for v in sorted(noise, key=lambda x: float(x.get("score10", 0) or 0))[:8]:
        print(f"    S:{float(v.get('score10',0)):.1f} | {str(v.get('title',''))[:70]}")

for niche in sys.argv[1:] or ["automotive", "technology"]:
    check_niche(niche)
