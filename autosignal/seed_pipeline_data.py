"""
seed_pipeline_data.py
=====================
Generates realistic benchmark data for all 4 AutoSignal niches:
- automotive
- finance
- technology
- productivity

Outputs the exact pipeline artifacts required by pipeline_paths.py,
full_audit.py, and the dashboard UI.
"""

import json
import random
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parent
DATA_ROOT = ROOT / "data"

NICHE_SPECS = {
    "automotive": {
        "display_name": "Automotive Repair",
        "icon": "🔧",
        "creators": [
            ("Wrench & Spark DIY", 14200, 8500),
            ("Garage Pete Diagnostics", 38000, 19000),
            ("SouthCoast Diesel Guy", 7200, 3800),
            ("Real Deal Auto Tech", 89000, 42000),
            ("Backyard Mechanic Steve", 5300, 2400),
            ("Precision OBDI & II", 22400, 11000),
            ("Torque & Piston Lab", 18500, 9200),
            ("Modern Car DIY Fixes", 45000, 21000),
        ],
        "video_seeds": [
            ("Why Your Alternator Keeps Dying (The Silent Parasitic Drain Nobody Tests)", "electrical", 5.2, 1850, "fix_now"),
            ("Never Replace This Brake Sensor Until You Try This 30-Second Reset", "brake_system", 6.8, 2400, "fix_now"),
            ("Ford 5.4 3V Spark Plug Broken Off In Head? Easy Removal Guide", "engine_repair", 8.4, 3800, "tutorial"),
            ("Transmission Slipping in 2nd? Don't Rebuild — Test This $40 Solenoid First", "transmission", 5.6, 2100, "comparison"),
            ("Cummins 6.7 Fuel Pressure Relief Valve Test (Hard Start When Hot Fixed)", "diesel_specific", 3.8, 1120, "fix_now"),
            ("How to Bleed Coolant System Fast with No Air Pockets & No Overheating", "cooling_system", 4.2, 1350, "tutorial"),
            ("5 OBD2 Scanner Live Data PID Graphs You Must Check for Rough Idle", "electrical", 7.1, 2600, "breakdown"),
            ("CV Axle Clicking Noise Diagnosis vs Bad Intermediate Shaft Bearing", "brake_system", 3.4, 980, "comparison"),
            ("Catalytic Converter P0420 Code Real Fix vs Oxygen Sensor Spacer Trick", "engine_repair", 5.9, 2100, "breakdown"),
            ("GM 4L60E Sun Shell Failure: What It Sounds Like & Permanent Upgrade", "transmission", 4.3, 1400, "tutorial"),
            ("AC Clutch Not Engaging? Bypass Relay Test Before Buying Compressor", "cooling_system", 4.8, 1750, "fix_now"),
            ("Power Steering Whine: Bleeding Air vs Failing Pump Bearing Test", "suspension", 3.2, 920, "tutorial"),
            ("Evap Smoke Machine Test: P0442 Small Leak Hidden Hose Location", "engine_repair", 4.1, 1250, "tutorial"),
            ("Brake Caliper Slide Pins Frozen: How to Extract Without Breaking Bracket", "brake_system", 3.9, 1100, "fix_now"),
            ("Starter Clicks Once But Won't Crank: Voltage Drop Test on Starter Cable", "electrical", 6.3, 2300, "fix_now"),
            ("Duramax L5P NOX Sensor Replacement & Forced Regeneration Walkthrough", "diesel_specific", 3.7, 1050, "tutorial"),
            ("Wheel Bearing Hum vs Tire Cupping: The 2-Minute Diagnostic Drive", "suspension", 4.5, 1500, "comparison"),
            ("Throttle Body Cleaning Gone Wrong: High Idle Reset Procedure", "engine_repair", 3.5, 960, "fix_now"),
            ("Radiator Fan Not Spinning on High Speed: Resistor Pack Diagnostic", "cooling_system", 4.0, 1200, "fix_now"),
            ("Brake Pedal Sinks to Floor at Red Lights: Master Cylinder Internal Bypass", "brake_system", 5.5, 1900, "breakdown"),
            ("Automatic Transmission Fluid Level Check Without a Dipstick (Temp Method)", "transmission", 4.4, 1450, "tutorial"),
            ("ABS Pump Running Continuously With Key Off: Module Relay Rebuild", "brake_system", 5.1, 1800, "tutorial"),
            ("Engine Misfire Cylinder 3: Coil Swap Method to Rule Out Injector", "engine_repair", 4.2, 1350, "fix_now"),
            ("Battery Terminal Acid Corrosion Neutralizer & Copper Terminal Upgrade", "electrical", 3.1, 880, "tutorial"),
            ("Blown Head Gasket Combustion Gas Test in Radiator (Block Tester Fluid)", "cooling_system", 6.1, 2200, "breakdown"),
            ("Sway Bar Link Rattle over Small Bumps: Play Test While Weight on Wheels", "suspension", 3.6, 1020, "tutorial"),
            ("Fuel Pump Relay Circuit Bypass to Test In-Tank Sender at Fuel Rail", "electrical", 4.7, 1600, "fix_now"),
            ("Torque Converter Shudder at 45 MPH: Lubegard ShudderFix Test", "transmission", 4.9, 1700, "comparison"),
            ("Serpentine Belt Squeal: Water Spray Test to Tell Belt from Tensioner", "engine_repair", 3.8, 1150, "comparison"),
            ("Diesel Glow Plug Resistance Ohm Test (P0674 Glow Plug Circuit Open)", "diesel_specific", 4.1, 1280, "tutorial"),
            ("Drum Brake Shoe Replacement & Spring Tool Trick That Saves 2 Hours", "brake_system", 3.3, 910, "tutorial"),
            ("Heater Core Clogged Flush with CLR & Garden Hose (Fix No Heat)", "cooling_system", 5.4, 1850, "fix_now"),
            ("Strut Mount Bearing Clunk When Turning Wheel While Parked", "suspension", 3.7, 1080, "tutorial"),
            ("Mass Air Flow Sensor Voltage vs Grams Per Second Live Fuel Trim Math", "engine_repair", 6.4, 2350, "breakdown"),
            ("Door Ajar Light Stays On: Latch Microswitch WD40 Flush Fix", "electrical", 4.5, 1550, "fix_now"),
        ],
        "clusters": [
            ("Parasitic Battery Drain & Alternator Testing", "electrical", 0.91, 92, 1850, 5.4, "IMMEDIATE"),
            ("Transmission Solenoid vs Full Rebuild Diagnosis", "transmission", 0.85, 87, 1520, 4.8, "EVERGREEN"),
            ("Heater Core & Cooling System Air Pocket Bleeding", "cooling_system", 0.79, 81, 1280, 4.2, "SEASONAL"),
            ("Brake Caliper Pin & Master Cylinder Pressure Loss", "brake_system", 0.82, 84, 1410, 4.4, "EVERGREEN"),
        ],
    },
    "finance": {
        "display_name": "Finance & Investing",
        "icon": "📈",
        "creators": [
            ("The Sensible Investor", 21000, 11000),
            ("Finance Decoded Daily", 49000, 24000),
            ("Money Mindset Matt", 8800, 4200),
            ("CashFlow Compass", 32000, 16000),
            ("Young Adult Wealth", 6500, 3100),
            ("Dividend Path Blueprint", 78000, 36000),
            ("Passive Wealth Academy", 15200, 7800),
            ("Smart Money Roadmap", 41000, 19500),
        ],
        "video_seeds": [
            ("VOO vs VTI in 2026: Why This 1% Difference Actually Matters Over 30 Years", "etfs", 5.6, 2800, "comparison"),
            ("Where to Park $20,000 Cash Right Now (HYSA vs Treasury Bills vs CD Ladders)", "savings", 7.4, 4200, "comparison"),
            ("The Backdoor Roth IRA Loophole Explained in 7 Plain English Minutes", "retirement", 6.2, 3100, "tutorial"),
            ("I Tested 6 Credit Cards for 1 Year — Here is the Brutal Point Truth", "credit_cards", 8.8, 5400, "case_study"),
            ("Why 'Maxing Out Your 401k' Might Be the Wrong Move for Your First $10K", "retirement", 9.1, 6200, "breakdown"),
            ("How to Build a $1,000/Month Qualified Dividend Portfolio from Scratch", "etfs", 4.8, 2300, "tutorial"),
            ("The 2026 Standard Deduction & Bracket Shifts That Change Your Tax Strategy", "taxes", 4.2, 1750, "breakdown"),
            ("Buying a Duplex with 3.5% Down FHA: The Real Numbers 2 Years In", "real_estate", 6.5, 3400, "case_study"),
            ("The Emergency Fund Myth: Why 6 Months of Cash Is Costing You Thousands", "savings", 7.9, 4600, "breakdown"),
            ("SCHD vs DGRO: Which Dividend Growth ETF Belongs in a Roth IRA?", "etfs", 5.1, 2500, "comparison"),
            ("HSA Investment Strategy: The Triple Tax Advantage Nobody Leverages", "taxes", 6.4, 3200, "tutorial"),
            ("How to Negotiate Your Cable, Insurance & Internet Bills with a 5-Minute Call", "savings", 3.8, 1400, "tutorial"),
            ("Credit Card Churning in 2026: 500k Points Strategy Without Ruining Credit Score", "credit_cards", 6.9, 3600, "tutorial"),
            ("S&P 500 Peak Price Anxiety: Lump Sum vs Dollar Cost Averaging Historical Data", "etfs", 5.5, 2700, "breakdown"),
            ("How to Structure a Living Trust Without Paying a $3,000 Attorney Retainer", "retirement", 4.9, 2100, "tutorial"),
            ("Real Estate Syndications vs REITs: Understanding K-1 Tax Depreciations", "real_estate", 4.4, 1850, "comparison"),
            ("Pay Off Mortgage Early vs Invest in Index Funds: The Real Math at 6.5%", "real_estate", 7.2, 3900, "comparison"),
            ("401k Loan Dangers: What Actually Happens if You Switch Jobs", "retirement", 4.6, 1950, "breakdown"),
            ("High Yield Savings Accounts: The Hidden Tiered Rate Bait and Switch", "savings", 5.8, 2600, "breakdown"),
            ("T-Bill Auctions on TreasuryDirect: Step-by-Step State Tax Free Guide", "savings", 6.1, 2900, "tutorial"),
            ("Amex Gold vs Chase Sapphire Preferred: The Final Dining/Travel Showdown", "credit_cards", 6.7, 3400, "comparison"),
            ("Roth 401k vs Traditional 401k: Peak Earning Years Decision Matrix", "retirement", 5.9, 2800, "comparison"),
            ("Small Cap Value Tilt (AVUV): Is Factor Investing Worth the Volatility?", "etfs", 4.1, 1600, "breakdown"),
            ("BRRRR Method in a High Interest Rate Environment: Realistic Cash Flow", "real_estate", 5.2, 2300, "case_study"),
            ("Automated Budgeting Architecture: The 3-Account Checking System", "savings", 4.7, 2150, "tutorial"),
            ("Target Date Funds vs 3-Fund Portfolio: Are the Higher Expense Ratios Worth It?", "etfs", 4.3, 1750, "comparison"),
            ("Capital Gains Tax Harvesting: How to Offset Profits Before Year End", "taxes", 5.3, 2250, "tutorial"),
            ("Costco Citi Card vs Fidelity 2% Cash Back: Which Daily Driver Wins?", "credit_cards", 4.5, 1900, "comparison"),
            ("The 4% Rule Revisited: Safe Withdrawal Rates for Early Retirees", "retirement", 6.6, 3300, "breakdown"),
            ("House Hacking Rent Roll Analysis: Living Rent Free with Roommates", "real_estate", 5.4, 2400, "case_study"),
            ("Series I Bonds vs TIPS in 2026: Which Protects Purchasing Power Better?", "savings", 4.0, 1550, "comparison"),
            ("How 1031 Exchanges Actually Work to Roll Over Rental Profits Tax-Free", "real_estate", 4.8, 2050, "tutorial"),
            ("Bogleheads Core Principles: Why Simple Portfolios Beat 95% of Active Traders", "etfs", 5.7, 2850, "breakdown"),
            ("Self-Employed Solo 401k Setup: Max Out $69,000 from Freelance Income", "taxes", 6.0, 2750, "tutorial"),
            ("How to Check Your ChexSystems and LexisNexis Consumer Reports for Errors", "credit_cards", 3.9, 1450, "tutorial"),
        ],
        "clusters": [
            ("Cash Yield Optimization (HYSA vs T-Bills vs Money Market)", "savings", 0.94, 95, 2950, 6.8, "IMMEDIATE"),
            ("401k Match vs Roth IRA Order of Operations", "retirement", 0.88, 89, 2150, 5.7, "SEASONAL"),
            ("VOO vs VTI vs Factor Investing Asset Allocation", "etfs", 0.81, 84, 1850, 4.7, "EVERGREEN"),
            ("Credit Card Rewards Points Churning & Redemption Truth", "credit_cards", 0.84, 86, 2050, 5.2, "EVERGREEN"),
        ],
    },
    "technology": {
        "display_name": "Technology & Software",
        "icon": "💻",
        "creators": [
            ("CodeCraft Studio", 34000, 18000),
            ("The Pragmatic Dev", 62000, 31000),
            ("LocalAI Lab", 11500, 5900),
            ("DevOps Simplified", 45000, 22000),
            ("Weekend Automator", 9200, 4100),
            ("Junior to Lead", 81000, 39000),
            ("FullStack Daily", 26000, 13000),
            ("Terminal & Cloud", 54000, 26000),
        ],
        "video_seeds": [
            ("I Replaced My Entire Backend with 1 Local LLM Agent (Step-by-Step)", "ai_agents", 8.9, 5800, "case_study"),
            ("Ollama + DeepSeek-R1 on a Budget PC: Complete Setup & Speed Benchmark", "local_ai", 9.4, 7200, "tutorial"),
            ("Next.js 15 Server Actions: The Security Vulnerabilities Nobody Warns You About", "web_frameworks", 7.2, 3900, "breakdown"),
            ("Docker in 2026: 7 Production Best Practices I Wish I Knew 5 Years Ago", "devops", 5.8, 2700, "tutorial"),
            ("Automating My Boring Daily Work with 40 Lines of Python (No Paid APIs)", "python", 8.2, 4900, "tutorial"),
            ("Why Redis Is Being Replaced in Modern Microservice Architectures", "architecture", 6.4, 3200, "breakdown"),
            ("Building an Autonomous Research Assistant with Gemini 2.5 Flash & LangGraph", "ai_agents", 7.6, 4100, "tutorial"),
            ("Tailwind CSS v4 Complete Migration Guide (What Broke & How to Fix It)", "web_frameworks", 5.1, 2300, "tutorial"),
            ("Deploying High-Availability PostgreSQL on Hetzner for Under $20/Month", "devops", 6.7, 3400, "tutorial"),
            ("Cursor vs Claude Code CLI: Full Hands-On Comparison for Real Codebases", "ai_agents", 9.8, 8100, "comparison"),
            ("vLLM vs Ollama vs Llama.cpp: High Throughput Self-Hosting Benchmarks", "local_ai", 7.1, 3800, "comparison"),
            ("PostgreSQL Index Tuning: Finding Missing Indexes with pg_stat_statements", "architecture", 5.5, 2600, "tutorial"),
            ("GitHub Actions CI/CD Pipeline from Scratch: Docker Build & Remote Deploy", "devops", 4.9, 2100, "tutorial"),
            ("FastAPI in Production: Gunicorn Workers, Async SQLAlchemy & Connection Pools", "python", 6.2, 3100, "tutorial"),
            ("React Server Components vs Traditional SSR: Memory & Bundle Footprint", "web_frameworks", 5.9, 2900, "breakdown"),
            ("WebSockets vs Server-Sent Events (SSE) for Real-Time Streaming AI Responses", "architecture", 6.8, 3600, "comparison"),
            ("How to Run Mistral Small 24B on a 16GB Mac with Zero Stuttering", "local_ai", 7.7, 4300, "tutorial"),
            ("Building a RAG Pipeline with Hybrid Search (BM25 + Semantic Embeddings)", "ai_agents", 8.1, 4700, "tutorial"),
            ("Python Polars vs Pandas 2.0: Speed Test on a 100 Million Row Dataset", "python", 5.4, 2500, "comparison"),
            ("Kubernetes Is Overkill: Modern Container Orchestration with Nomad & Docker Swarm", "devops", 6.3, 3300, "breakdown"),
            ("TypeScript 5.8 Decorators & Const Type Parameters: Real-World Patterns", "web_frameworks", 4.8, 2050, "tutorial"),
            ("System Design: How Stripe Handles Double-Charge Prevention with Idempotency Keys", "architecture", 8.5, 5300, "breakdown"),
            ("Fine-Tuning Llama 3.2 on Your Own Documentation with Unsloth", "local_ai", 7.4, 4000, "tutorial"),
            ("Linux Server Hardening: SSH Key Ed25519, UFW Firewall & Fail2ban", "devops", 5.2, 2400, "tutorial"),
            ("Building a Headless CMS with SQLite & Go for Blazing Fast Static Blogs", "web_frameworks", 4.6, 1950, "case_study"),
            ("Python Asyncio Under the Hood: Event Loops, Tasks & Common Gotchas", "python", 5.7, 2800, "breakdown"),
            ("Vector Database Shootout: Qdrant vs pgvector vs Chroma on Recall & Cost", "ai_agents", 6.9, 3700, "comparison"),
            ("Zero-Downtime Database Migrations with Prisma and Drizzle ORM", "architecture", 5.6, 2750, "tutorial"),
            ("Reverse Proxy Shootout: Caddy vs Nginx vs Traefik with Auto HTTPS", "devops", 5.0, 2200, "comparison"),
            ("OpenWebUI Setup Guide: Beautiful Private ChatGPT Alternative at Home", "local_ai", 8.0, 4600, "tutorial"),
            ("CSS Grid Subgrid Explained: Fixing 10 Years of Nested Layout Frustration", "web_frameworks", 4.4, 1850, "tutorial"),
            ("Building a CLI Tool in Rust vs Go: Developer Experience and Binary Size", "architecture", 4.7, 2100, "comparison"),
            ("Automated Web Scraping with Playwright Python & Cloudflare Bypass Tips", "python", 6.5, 3500, "tutorial"),
            ("Prompt Caching in Gemini & Anthropic: Cutting API Latency & Bill by 70%", "ai_agents", 7.9, 4450, "breakdown"),
            ("Distributed Tracing with OpenTelemetry and Grafana Tempo in 15 Minutes", "devops", 4.3, 1750, "tutorial"),
        ],
        "clusters": [
            ("Local AI & Private LLM Deployment (Ollama / DeepSeek / vLLM)", "local_ai", 0.95, 98, 4800, 8.1, "IMMEDIATE"),
            ("Autonomous Coding Agents & CLI Assistants (Cursor / Claude Code)", "ai_agents", 0.90, 94, 3900, 7.2, "IMMEDIATE"),
            ("Next.js 15 Server Actions & Web Security Best Practices", "web_frameworks", 0.82, 86, 2400, 5.1, "EVERGREEN"),
            ("Self-Hosted VPS & Production Docker Deployment on Budget Hardware", "devops", 0.85, 88, 2600, 5.6, "EVERGREEN"),
        ],
    },
    "productivity": {
        "display_name": "Productivity & Growth",
        "icon": "⚡",
        "creators": [
            ("The Intentional Mind", 28000, 14000),
            ("Focus Architect", 52000, 27000),
            ("Quiet Productivity", 14500, 7200),
            ("Systems Not Goals", 39000, 18500),
            ("Digital Calm", 8100, 3900),
            ("Deep Output Lab", 71000, 34000),
            ("Habit Mechanics", 22000, 10500),
            ("Mindful Execution", 46000, 23000),
        ],
        "video_seeds": [
            ("Why Your Notion Setup Makes You LESS Productive (The Clean Rebuild)", "second_brain", 8.4, 5200, "breakdown"),
            ("The 90-Minute Focus Block Protocol: How to Finish 8 Hours of Work by Noon", "deep_work", 9.1, 6400, "tutorial"),
            ("Dumbphone Experiment 30 Days Later: What Happened to My Attention Span", "digital_minimalism", 7.8, 4700, "case_study"),
            ("Stop Building Habit Trackers — Use This 2-Rule Friction System Instead", "habits", 6.5, 3300, "breakdown"),
            ("Obsidian vs Apple Notes in 2026: Why Simplicity Won Out", "second_brain", 7.1, 3900, "comparison"),
            ("How I Manage 5 Projects with Zero Stress (The Weekly Review Template)", "systems", 5.9, 2800, "tutorial"),
            ("ADHD Task Paralysis: The 5-Minute Entry Ramp That Actually Works", "focus", 8.7, 5600, "tutorial"),
            ("The Email Zero Trap: Why Inbox Zero Is Ruining Your Real High-Value Output", "deep_work", 6.2, 3100, "breakdown"),
            ("Screen Time Detox Without Buying a Second Phone (5 iOS Settings)", "digital_minimalism", 6.9, 3600, "tutorial"),
            ("Quarterly Review System: How to Reset Your Year Every 90 Days", "systems", 5.3, 2400, "tutorial"),
            ("Ultradian Rhythms: Why Forcing 8 Constant Work Hours Destroys Your Cognitive Output", "deep_work", 7.3, 4100, "breakdown"),
            ("Physical Notebook vs Digital PKM: Why Pen and Paper Keeps You Sane", "second_brain", 5.8, 2900, "comparison"),
            ("The 2-Minute Rule vs 2-Minute Trap: When Quick Tasks Steal Your Best Hours", "habits", 5.4, 2600, "breakdown"),
            ("Dopamine Fasting Weekend: What the Science Actually Says About Brain Resets", "digital_minimalism", 7.0, 3800, "case_study"),
            ("Calendar Blocking for Scatterbrains: Color-Coding Energy Instead of Hours", "focus", 6.6, 3400, "tutorial"),
            ("Morning Routine Without 14 Supplements: A Realistic 20-Minute Blueprint", "habits", 7.5, 4300, "tutorial"),
            ("The 'Anti-Todo' List: Logging Completed Actions to Overcome Imposter Syndrome", "systems", 5.1, 2300, "tutorial"),
            ("Noise-Cancelling Headphones & Binaural Beats: Do Focus Sounds Actually Work?", "focus", 4.8, 2050, "breakdown"),
            ("How to Stop Doomscrolling in Bed: The Charging Station Rule", "digital_minimalism", 6.4, 3200, "tutorial"),
            ("Obsidian Daily Notes Plugin Setup with Templater (Clean Daily Journal)", "second_brain", 5.5, 2700, "tutorial"),
            ("The Law of Diminishing Productivity: Why Working Over 50 Hours Is Counterproductive", "deep_work", 6.8, 3600, "breakdown"),
            ("Saying No Gracefully: 5 Email Scripts for Rejecting Low-Priority Requests", "systems", 4.6, 1950, "tutorial"),
            ("Eliminating Visual Clutter: How a Monastic Desk Setup Cuts Mental Fatigue", "focus", 5.7, 2850, "case_study"),
            ("Friction Engineering: Hiding Apps Inside Unlabeled Folders to Kill Compulsive Opens", "digital_minimalism", 6.1, 3100, "tutorial"),
            ("Task Batching: How Grouping Administrative Chores Frees 3 Full Days a Week", "deep_work", 6.0, 3000, "tutorial"),
            ("Habit Stacking in Real Life: Pairing Difficult Tasks with Inevitable Routines", "habits", 5.2, 2450, "tutorial"),
            ("The PARA Method Simplified: Projects, Areas, Resources, Archives for Realists", "second_brain", 6.7, 3500, "tutorial"),
            ("Pomodoro Technique Flaws: Why 25 Minutes Breaks Flow State in Creative Work", "focus", 7.2, 3950, "breakdown"),
            ("Sunday Planning Routine: The 30 Minutes That Saves My Entire Work Week", "systems", 5.6, 2750, "tutorial"),
            ("Digital Hoarding: Deleting 10,000 Bookmarks and 500 Unread Articles", "digital_minimalism", 6.3, 3300, "case_study"),
            ("The Power of Monotasking: Why Multitasking Lowers Effective IQ by 10 Points", "deep_work", 5.0, 2200, "breakdown"),
            ("Sleep Consistency Protocol: The Non-Negotiable Foundation of Daily Focus", "habits", 7.6, 4400, "tutorial"),
            ("Zettelkasten Note Taking for Beginners: Linking Ideas Without Getting Lost", "second_brain", 5.9, 2950, "tutorial"),
            ("Body Doubling and Virtual Co-Working: Why Working Near Others Fixes Procrastination", "focus", 6.5, 3450, "breakdown"),
            ("The 1-Page Life Plan: Translating 5-Year Visions into Daily Action Items", "systems", 5.4, 2550, "tutorial"),
        ],
        "clusters": [
            ("Digital Minimalism & Smartphone Detox Protocols", "digital_minimalism", 0.93, 96, 3900, 7.3, "IMMEDIATE"),
            ("Low-Friction Second Brain & Obsidian / Notes Architecture", "second_brain", 0.87, 91, 3100, 6.2, "EVERGREEN"),
            ("90-Minute Focus Protocols & Cognitive Energy Management", "deep_work", 0.89, 93, 3500, 6.8, "EVERGREEN"),
            ("Habit Systems & Friction Engineering vs Willpower", "habits", 0.83, 87, 2700, 5.4, "SEASONAL"),
        ],
    },
}

def generate_niche_data(niche_key, niche_info):
    base_dir = DATA_ROOT / niche_key
    base_dir.mkdir(parents=True, exist_ok=True)
    (base_dir / "categorized_videos").mkdir(parents=True, exist_ok=True)

    now = datetime.now(timezone.utc)
    rng = random.Random(hash(niche_key) & 0xFFFFFFFF)

    videos = []
    creators = niche_info["creators"]
    seeds = niche_info["video_seeds"]

    for idx, (title, subniche, outlier_mult, vph, intent) in enumerate(seeds):
        creator_name, sub_count, channel_avg = creators[idx % len(creators)]
        hours_ago = rng.randint(6, 120)
        published_at = (now - timedelta(hours=hours_ago)).isoformat()
        view_count = int(channel_avg * outlier_mult)

        winner_tag = "outlier" if outlier_mult >= 3.0 else ("viral" if vph >= 3000 else "evergreen_winner")
        # Spread analysis scores between 4.1 and 9.8
        score_base = 4.0 + (outlier_mult * 0.5) + (vph / 3500)
        analysis_score = round(max(3.8, min(9.8, score_base)), 2)
        engagement_score = round(rng.uniform(0.048, 0.098), 4)

        video = {
            "video_id": f"vid_{niche_key[:3]}_{idx+1:03d}",
            "title": title,
            "channel_title": creator_name,
            "channel_id": f"UC_{niche_key[:4]}_{idx+100}",
            "channel_subscriber_count": sub_count,
            "channel_avg_views": channel_avg,
            "view_count": view_count,
            "views_per_hour": vph,
            "outperformance_ratio": round(outlier_mult, 2),
            "analysis_score_10": analysis_score,
            "engagement_score": engagement_score,
            "hours_since_publish": hours_ago,
            "published_at": published_at,
            "repair_similarity": round(rng.uniform(0.78, 0.98), 3),
            "subniche": subniche,
            "intent_label": intent,
            "winner_tag": winner_tag,
            "thumbnail_url": f"https://picsum.photos/seed/{niche_key}{idx}/640/360",
            "semantic_embedding": [round(rng.uniform(-0.1, 0.1), 4) for _ in range(8)],
        }
        videos.append(video)

    videos.sort(key=lambda x: x["analysis_score_10"], reverse=True)

    # 1. top_100_videos.json
    t100_data = {
        "niche": niche_key,
        "generated_at": now.isoformat(),
        "total_discovered": 420 + len(videos) * 10,
        "total_survived_filtering": len(videos),
        "admission_rate_percent": round((len(videos) / (420 + len(videos) * 10)) * 100, 1),
        "videos": videos,
    }
    with open(base_dir / "top_100_videos.json", "w", encoding="utf-8") as f:
        json.dump(t100_data, f, indent=2)

    # 2. merged_videos.json & merged_videos_semantic.json
    with open(base_dir / "merged_videos.json", "w", encoding="utf-8") as f:
        json.dump({"videos": videos, "total": len(videos), "merged_at": now.isoformat()}, f, indent=2)

    with open(base_dir / "merged_videos_semantic.json", "w", encoding="utf-8") as f:
        json.dump({"videos": videos, "enriched_count": len(videos), "niche": niche_key}, f, indent=2)

    # 3. top_100_semantic.json
    with open(base_dir / "top_100_semantic.json", "w", encoding="utf-8") as f:
        json.dump({"videos": videos[:15], "top_n": 15}, f, indent=2)

    # 4. video_clusters_semantic.json
    clusters_output = []
    for c_rank, (c_label, c_sub, c_gap, c_demand, c_vph, c_outperf, c_win) in enumerate(niche_info["clusters"], 1):
        c_videos = [v for v in videos if v["subniche"] == c_sub]
        if len(c_videos) < 3:
            c_videos = videos[c_rank*3 : c_rank*3 + 4]
        
        clusters_output.append({
            "cluster_id": f"{niche_key}_c{c_rank}",
            "cluster_rank": c_rank,
            "cluster_label": c_label,
            "topic": c_sub,
            "cluster_score10": round(7.0 + (c_demand / 40.0) + (c_outperf * 0.2), 2),
            "video_count": len(c_videos),
            "search_gap": c_gap,
            "demand_score": c_demand,
            "avg_vph": c_vph,
            "avg_outperformance": c_outperf,
            "window": c_win,
            "contamination_flag": False,
            "top_videos": c_videos[:4],
        })

    with open(base_dir / "video_clusters_semantic.json", "w", encoding="utf-8") as f:
        json.dump({"clusters": clusters_output, "niche": niche_key, "total": len(clusters_output)}, f, indent=2)

    # 5. opportunities.json (full_audit.py expects a LIST of dicts!)
    opps_list = []
    for idx, c in enumerate(clusters_output):
        final_score = round(min(9.8, 6.2 + (c["demand_score"] / 30.0) + (c["avg_outperformance"] * 0.15)), 2)
        trending_score = round(min(9.9, c["avg_vph"] / 500.0), 2)
        gap_score = round(c["search_gap"] * 10.0, 2)
        sea_score = 8.5 if c["window"] == "SEASONAL" else (9.0 if c["window"] == "IMMEDIATE" else 7.8)
        out_score = round(min(9.8, c["avg_outperformance"] * 1.3), 2)

        sample_titles = [v["title"] for v in c["top_videos"][:3]]
        opps_list.append({
            "rank": idx + 1,
            "cluster_label": c["cluster_label"],
            "topic": c["topic"],
            "final_score": final_score,
            "window": c["window"],
            "trending_score": trending_score,
            "search_gap_score": gap_score,
            "seasonal_score": sea_score,
            "outlier_score": out_score,
            "video_count": c["video_count"],
            "avg_vph": c["avg_vph"],
            "outperformance_multiplier": f"{c['avg_outperformance']}x",
            "search_gap_percent": f"{int(c['search_gap'] * 100)}%",
            "recommended_angle": f"Target high-intent searchers dealing with {c['cluster_label'].lower()} without requiring high-cost equipment.",
            "sample_titles": sample_titles,
            "status": "ready_for_brief",
        })

    with open(base_dir / "opportunities.json", "w", encoding="utf-8") as f:
        json.dump(opps_list, f, indent=2)

    # 6. discovered_channels.json
    disc_channels = []
    for c_name, c_subs, c_avg in creators:
        disc_channels.append({
            "channel_title": c_name,
            "channel_id": f"UC_{niche_key}_{abs(hash(c_name)) % 100000}",
            "subscriber_count": c_subs,
            "avg_views_per_video": c_avg,
            "outlier_hit_rate": round(random.uniform(0.25, 0.65), 2),
            "status": "validated_seed",
            "niche": niche_key,
        })
    with open(base_dir / "discovered_channels.json", "w", encoding="utf-8") as f:
        json.dump({"channels": disc_channels, "total": len(disc_channels)}, f, indent=2)

    # 7. channel_metadata.json
    with open(base_dir / "channel_metadata.json", "w", encoding="utf-8") as f:
        json.dump({
            "channel_title": creators[0][0],
            "channel_id": f"UC_ref_{niche_key}",
            "subscribers": creators[0][1],
            "average_views": creators[0][2],
            "median_views": int(creators[0][2] * 0.88),
            "recent_vph_median": 450,
            "niche": niche_key,
            "top_performing_topics": [t[1] for t in seeds[:3]],
            "last_audited": now.isoformat(),
        }, f, indent=2)

    # 8. discarded_videos.json
    discarded = [
        {"video_id": f"disc_{niche_key}_1", "title": "Random daily vlog grocery shopping", "discard_reason": "off_niche_topic: daily lifestyle irrelevant to niche"},
        {"video_id": f"disc_{niche_key}_2", "title": "Short test video 10 seconds", "discard_reason": "too_short: duration < 180 seconds"},
        {"video_id": f"disc_{niche_key}_3", "title": "Dead old video with zero momentum", "discard_reason": "low_vph: velocity < 5 views/hour"},
    ]
    with open(base_dir / "discarded_videos.json", "w", encoding="utf-8") as f:
        json.dump({"discarded": discarded, "count": len(discarded)}, f, indent=2)

    print(f"✅ Generated {niche_key}: {len(videos)} videos, {len(clusters_output)} clusters, {len(opps_list)} opps")

if __name__ == "__main__":
    for n_key, n_info in NICHE_SPECS.items():
        generate_niche_data(n_key, n_info)
    print("✨ Benchmark generation complete!")
