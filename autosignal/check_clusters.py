import json, sys

def check_clusters(niche):
    try:
        with open(f"data/{niche}/video_clusters_semantic.json","r",encoding="utf-8") as f:
            clusters = json.load(f)
    except FileNotFoundError:
        print(f"No cluster file for {niche}")
        return

    all_c = clusters.get("all_clusters_ranked", [])
    print(f"\n{'='*80}")
    print(f"  {niche.upper()} CLUSTERS: {len(all_c)} total")
    print(f"{'='*80}")
    for c in all_c:
        opp    = c.get("opportunity_metrics", {}) or {}
        score  = float(opp.get("opportunity_score", 0) or 0)
        demand = float(opp.get("demand", 0) or 0)
        comp   = float(opp.get("competition", 0) or 0)
        growth = float(opp.get("growth", 0) or 0)
        label  = str(c.get("cluster_label", "?"))
        cnt    = c.get("video_count", 0)
        avg_bp = float(c.get("avg_breakout_prob", 0) or 0)
        print(f"  Cluster: {label:<32} | OppScore:{score:4.1f} | Demand:{demand:4.1f} | Comp:{comp:4.1f} | Growth:{growth:4.1f} | Videos:{cnt:3d} | AvgBP:{avg_bp:.0%}")
        # Top 3 videos in cluster
        top_vids = c.get("top_videos", [])[:3]
        for v in top_vids:
            views = int(v.get("view_count", 0) or 0)
            vph   = float(v.get("views_per_hour", 0) or 0)
            bp    = float(v.get("breakout_probability", 0) or 0)
            title = str(v.get("title", ""))[:60]
            print(f"      -> {views:>9,}v | VPH:{vph:>7.1f} | BP:{bp:.0%} | {title}")

for niche in sys.argv[1:] or ["automotive", "technology"]:
    check_clusters(niche)
