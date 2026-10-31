"""
niche_config.py
===============
Single source of truth for all niche definitions in AutoSignal.

Every niche has:
  - display_name: human-readable label shown in UI
  - detection_keywords: used by NicheDetector to classify channels
  - subniches: taxonomy of sub-topics (replaces hardcoded SUBNICHE_DISPLAY)
  - centroids: semantic search queries for metadata_fetch.py
  - seasonal_calendar: month-aware score multipliers for opportunity_scorer.py
  - seed_channels: YouTube channel IDs to crawl for market data (nightly)
  - system_prompt_addon: injected into Gemini brief_generator.py system prompt
  - supabase_table: which Supabase table stores this niche's video data
  - tier_strategy_template: overrides CREATOR_TIERS 'strategy' field (vehicle → niche entity)

Adding a new niche: add one entry to NICHE_CONFIGS below. No other files need editing.
"""

from typing import Dict, Any

# ── Master niche registry ─────────────────────────────────────────────────────

NICHE_CONFIGS: Dict[str, Dict[str, Any]] = {

    # ══════════════════════════════════════════════════════════════════════════
    # AUTOMOTIVE (existing — migrated here for unified architecture)
    # ══════════════════════════════════════════════════════════════════════════
    "automotive": {
        "display_name": "Automotive Repair",
        "icon": "🔧",
        "ui_color": "#6c63ff",        # indigo — existing brand color
        "ui_color_rgb": "108,99,255",

        # How often metadata_fetch re-crawls a channel already in
        # discovered_channels.json. Higher priority = shorter interval.
        "refresh_interval_days": 3,

        "detection_keywords": [
            "car", "truck", "vehicle", "engine", "transmission", "brake", "oil change",
            "repair", "mechanic", "automotive", "auto", "ford", "chevy", "toyota",
            "honda", "nissan", "dodge", "ram", "jeep", "bmw", "mercedes", "audi",
            "suspension", "exhaust", "coolant", "alternator", "battery", "diagnostic",
            "obd", "spark plug", "timing belt", "radiator", "diy car", "fix my car",
            "cummins", "powerstroke", "duramax", "diesel",
        ],

        "subniches": {
            "engine_repair":          "Engine Repair",
            "transmission_repair":    "Transmission Repair",
            "brake_system":           "Brake System",
            "suspension_steering":    "Suspension & Steering",
            "electrical_electronics": "Electrical & Electronics",
            "cooling_system":         "Cooling System",
            "exhaust_system":         "Exhaust System",
            "fuel_system":            "Fuel System",
            "hvac_system":            "HVAC & Climate",
            "drivetrain":             "Drivetrain & 4WD",
            "general_maintenance":    "General Maintenance",
            "diesel_specific":        "Diesel Specialist",
            "performance_tuning":     "Performance & Tuning",
            "classic_restoration":    "Classic Restoration",
            "off_road":               "Off-Road & Overlanding",
        },

        "centroids": {
            "diagnostics":          "obd2 scan tool live data electrical troubleshooting wiring diagram multimeter check engine light",
            "repair":               "engine replacement fix leaking broken part installation removal how to fix",
            "rebuilds":             "complete engine teardown transmission overhaul block machining rebuild",
            "maintenance":          "oil change fluid flush brake pad rotor replacement regular service filter replacement",
            "oil_change":           "oil change synthetic conventional motor oil drain plug oil filter how often",
            "brake_service":        "brake pad replacement rotor resurfacing brake fluid flush caliper brake job diy",
            "coolant_service":      "coolant flush antifreeze change radiator drain refill thermostat overheating",
            "air_filter":           "air filter replacement cabin filter engine air filter dirty clogged intake",
            "transmission_service": "transmission fluid change drain fill pan drop filter automatic manual",
            "spark_plugs":          "spark plug replacement ignition coil misfire rough idle timing tune up",
            "diesel":               "cummins powerstroke duramax def dpf delete injector heavy duty diesel",
            "heavy_equipment":      "excavator loader tractor hydraulics caterpillar john deere",
            "restoration":          "classic car frame off rust repair panel welding painting barn find",
        },

        # Month-aware opportunity score multipliers per sub-topic
        # 1.0 = neutral, >1.0 = seasonal boost, <1.0 = seasonal drag
        #
        # IMPORTANT: keys MUST match the `centroids` keys above, because clusters
        # are labelled with topic_primary (a centroid key) and the scorer looks
        # up `cluster.topic` here. The previous version used physical-system keys
        # (battery/cooling/ac_hvac/...) that never matched a centroid, so the
        # entire 20% seasonal signal was silently dead for automotive.
        "seasonal_calendar": {
            1:  {"diagnostics": 1.30, "coolant_service": 1.25},                       # winter — battery/electrical/overheating
            2:  {"diagnostics": 1.25, "coolant_service": 1.20},
            3:  {"brake_service": 1.25, "oil_change": 1.15},                          # spring post-winter inspection
            4:  {"brake_service": 1.20, "oil_change": 1.20, "maintenance": 1.15},     # tires/suspension check
            5:  {"coolant_service": 1.25, "oil_change": 1.15},                        # pre-summer cooling prep
            6:  {"coolant_service": 1.35, "diagnostics": 1.10},                       # AC/overheating season
            7:  {"coolant_service": 1.45},                                            # peak cooling/AC month
            8:  {"coolant_service": 1.35, "diagnostics": 1.10},
            9:  {"oil_change": 1.20, "brake_service": 1.15},                          # back-to-school/fall service
            10: {"diagnostics": 1.25, "coolant_service": 1.20, "maintenance": 1.15},  # pre-winter battery/wipers
            11: {"diagnostics": 1.30, "coolant_service": 1.25},
            12: {"diagnostics": 1.35, "coolant_service": 1.30},                       # winter battery/electrical peak
        },

        # Channels crawled nightly to build market cluster data
        "seed_channels": [
            # Top automotive DIY repair YouTube channels
            "UCes1EvRjcKU4sY_UEavndBw",  # ChrisFix
            "UCuxpxCCevIlF-k-K5YU8XPA",  # Scotty Kilmer
            "UCo-Ws9-G4zEFcxnCLX5ATZQ",  # Eric the Car Guy
            "UCf3Vtm8OTBsyjJwYfmF2trw",  # TheMechanic868
            "UCsert8exifX7KA4KeKHNZyA",  # Ratchets And Wrenches
            "UC4x22m3bGlRVEHfhBH5tM5w",  # Nukem384
            "UCQnHIsGkNXbxDDzJqE3L7aA",  # South Main Auto Repair
            "UCv4mf3gPX9zHJFr_rq5Rrjg",  # 1A Auto: Repair Tips & Secrets Only Mechanics Know
            "UCW5kCFtSIALd0sGERWAWcLQ",  # HVAC School (for related diagnostics)
            "UCHp4v5lHM_GEWtfLPTHaU_g",  # FCP Euro
            "UCSft30PXMB8xQnBFxJanPZA",  # Donut Media (automotive entertainment)
            "UCPn9bvSwsEXBdBGPCNbg7Sg",  # Engineering Explained
            "UCXO-xUCFKGKXZs0uC2oC1DA",  # Wes Watson (fitness, wrong — placeholder)
            "UCmrAHgB3K3OoFGEMKBg-yaQ",  # Aaron's Auto Advice
            "UCp_9a8_7Kn_E96lVeVL2HoQ",  # Mighty Car Mods
            "UCa4WTsHe5b8x1bMEpIYX3qA",  # Project Farm
            "UCbqnf_XJYY0Q3NP4I0e4fZw",  # Shade Tree Mechanic
            "UCkL2T7gJT1kEPmMVMfbnBLw",  # The Car Care Nut
            "UCXtlge0qhcGW3bNhGFOqRtQ",  # Pine Hollow Auto Diagnostics
            "UCXrqtKuShFxGH-VvVm6BVUQ",  # Lisle Corporation (tools)
        ],

        # Appended to BRIEF_SYSTEM_PROMPT for Gemini
        "system_prompt_addon": """
AUTOMOTIVE NICHE EXPERTISE:
— You know that brake/suspension content gets a massive views spike in spring (March-April) as drivers inspect after winter.
— AC content in July performs 1.45x above any other month. Always note seasonal urgency in the hook.
— Battery replacement content peaks in December-January (cold weather fear).
— "F-150" and "Silverado" in the title add measurable CTR lift vs generic "truck".
— DIY repair searchers are 3x more likely to click a title with a specific part name over a generic symptom.
— Diagnostic content (check engine light, OBD2) has year-round evergreen demand regardless of season.
""",

        "negative_anchors": [
            "car racing", "drag race", "top speed run", "burnout", "drifting",
            "automotive review", "test drive", "new car launch",
            "podcast", "interview", "reaction clip", "drama", "commentary",
            "vlog", "entertainment", "challenge", "funny prank",
            "car wash", "detailing", "cleaning", "foam cannon", "ceramic coating",
            "gaming", "simulator", "beamng", "assetto corsa", "gta",
        ],

        "supabase_table": "youtube_videos",

        # Creator tier strategy — replaces {vehicle} with niche-specific entity
        "tier_strategies": {
            "micro":       "SEO-literal titles targeting long-tail searches. Niche down hard — exact make + exact symptom in every title. Specificity beats reach at this size.",
            "rising":      "Balance SEO precision with click-through hooks. Lead with vehicle + problem. You have enough authority for problem-first titles.",
            "established": "Compete on angle differentiation. Cover gaps competitors missed. Your brand pulls clicks — titles can lead with the angle, not just the keyword.",
            "major":       "Authority play. Cover definitive versions of high-volume repair topics. Trending breakdowns and industry-first diagnostics compound your reach.",
        },
    },

    # ══════════════════════════════════════════════════════════════════════════
    # FINANCE & INVESTING
    # ══════════════════════════════════════════════════════════════════════════
    "finance": {
        "display_name": "Finance & Investing",
        "icon": "💰",
        "ui_color": "#22c55e",        # emerald green
        "ui_color_rgb": "34,197,94",

        # How often metadata_fetch re-crawls a channel already in
        # discovered_channels.json. Higher priority = shorter interval.
        "refresh_interval_days": 7,

        "detection_keywords": [
            "stock", "stocks", "invest", "investing", "investor", "budget", "budgeting",
            "crypto", "bitcoin", "ethereum", "dividend", "dividends", "tax", "taxes",
            "income", "money", "wealth", "portfolio", "etf", "roth", "401k", "ira",
            "side hustle", "passive income", "financial", "finance", "savings", "debt",
            "credit score", "real estate", "rental", "index fund", "vanguard", "compound",
            "net worth", "frugal", "fire movement", "retire early", "cash flow", "revenue",
        ],

        "subniches": {
            "investing_basics":    "Investing Basics",
            "stock_market":        "Stock Market",
            "crypto_defi":         "Crypto & DeFi",
            "real_estate":         "Real Estate Investing",
            "budgeting":           "Budgeting & Saving",
            "side_hustles":        "Side Hustles",
            "tax_strategy":        "Tax Strategy",
            "retirement_planning": "Retirement Planning",
            "business_finance":    "Business Finance",
            "passive_income":      "Passive Income",
        },

        "centroids": {
            "investing_basics":    "how to start investing for beginners index fund ETF Vanguard S&P 500 stock market portfolio",
            "stock_market":        "stock market analysis growth stocks value stocks dividend stocks earnings report",
            "crypto_defi":         "bitcoin ethereum crypto investing DeFi altcoin blockchain wallet staking",
            "real_estate":         "real estate investing rental property cash flow house hacking BRRRR Airbnb",
            "budgeting":           "budgeting money saving tips frugal living zero based budget envelope method pay off debt",
            "side_hustles":        "side hustle make money online passive income extra income freelance gig economy",
            "tax_strategy":        "tax deductions tax savings tax strategy self employed write off 1099 LLC S-corp",
            "retirement_planning": "retirement planning 401k Roth IRA compound interest retire early FIRE financial independence",
            "business_finance":    "business revenue profit margin startup funding cash flow management payroll",
            "passive_income":      "passive income streams dividend investing affiliate marketing rental income royalties",
        },

        "seasonal_calendar": {
            1:  {"budgeting": 1.35, "retirement_planning": 1.25, "investing_basics": 1.20, "side_hustles": 1.15},  # New Year resolutions
            2:  {"tax_strategy": 1.50, "budgeting": 1.20, "investing_basics": 1.10},                              # Tax prep begins
            3:  {"tax_strategy": 1.55, "stock_market": 1.15},                                                     # Tax crunch month
            4:  {"tax_strategy": 1.40, "real_estate": 1.20, "side_hustles": 1.15},                               # Tax deadline
            5:  {"side_hustles": 1.25, "passive_income": 1.20, "investing_basics": 1.15},                        # Spring income push
            6:  {"side_hustles": 1.30, "passive_income": 1.25, "real_estate": 1.20},                             # Summer side hustle peak
            7:  {"side_hustles": 1.25, "crypto_defi": 1.15, "real_estate": 1.15},
            8:  {"investing_basics": 1.15, "stock_market": 1.10},
            9:  {"budgeting": 1.20, "investing_basics": 1.15},                                                    # Back to school / Q4 prep
            10: {"stock_market": 1.20, "investing_basics": 1.20, "retirement_planning": 1.15},                   # Q4 market activity
            11: {"tax_strategy": 1.20, "retirement_planning": 1.25, "stock_market": 1.20},                       # Year-end tax moves
            12: {"retirement_planning": 1.35, "tax_strategy": 1.30, "budgeting": 1.25, "investing_basics": 1.15},# Year-end push
        },

        "seed_channels": [
            # Top finance/investing YouTube channels for market data crawl
            "UCL8w_A8p8P1HozDIpYNaZMg",  # Graham Stephan
            "UCyNTzpTbfXfLcpI10tns9Ag",  # Andrei Jikh
            "UCbmNph6atAoGfqLoCL_duAg",  # Nate O'Brien
            "UCEZD1XpJjNnad4oqRSjL8yg",  # Mark Tilbury
            "UCu8ZVoLOFHLV9Jvz1hDIFYA",  # Ryan Scribner
            "UCvU5OnpBqJRHqxrNQ3jjIpA",  # Erin Talks Money
            "UCof7UPMHBjx3WlhVRwoM3Rg",  # Humphrey Yang
        ],

        "system_prompt_addon": """
FINANCE & INVESTING NICHE EXPERTISE:
— Tax season (Feb–April) is the single biggest seasonal driver in finance content. "Tax" videos in March get 2–3x normal views. Always lead with urgency framing during this window.
— "How I made $X in [time period]" and "I invested $X for Y days" dramatically outperform generic investing tutorials for Rising and Micro creators.
— "Beginner" in the title adds measurable CTR lift for creators under 200K subs. Avoid it for Major creators — it signals low effort to their established audience.
— Side hustle content has the highest CPM ($15–40) in YouTube's finance vertical.
— Crypto content is highly volatile — pair it with specific coins or events, not generic "crypto" titles. "Bitcoin in [current year]" gets 3x the impressions of "should I invest in crypto".
— Real estate content has evergreen search demand but spikes in spring (May–June) when buyers are active.
— Every finance brief MUST include a disclaimer note in the thumbnail direction: "Results not typical / Not financial advice" framing often IMPROVES CTR (it signals authenticity).
""",

        "negative_anchors": [
            # Speculation & Hype
            "crypto price prediction", "bitcoin to the moon", "1000x coin", "crypto crash",
            "is bitcoin dumping", "why is crypto dumping", "will bitcoin collapse",
            "shiba inu price", "dogecoin price", "xrp price prediction", "altcoin gems",
            "COLLAPSING", "BLOW UP Bitcoin", "Worst Crypto News Ever", "F**ked",
            # Non-English (common finance terms in Hindi)
            "क्या", "कैसे", "क्यों", "कब", "पैसा", "निवेश", "शेयर बाजार", "अब मौका",
            "छोड़ना मत",
        ],

        "supabase_table": "finance_videos",

        "tier_strategies": {
            "micro":       "SEO-literal titles: specific dollar amounts, specific assets, specific timeframes. 'I invested $500 in [X] for 30 days' beats 'should you invest in X?'",
            "rising":      "Lead with the outcome, then the method. Combine search-literal keywords with curiosity hooks. Specific numbers in titles perform 40% better at this tier.",
            "established": "Angle differentiation is everything. Cover the contrarian take, the underreported story, the thing your competitors got wrong. Authority grants you latitude.",
            "major":       "Trend-first, opinion-led content. Your audience trusts your framework. Economic commentary, market takes, and story-driven personal finance outperform tutorials.",
        },
    },

    # ══════════════════════════════════════════════════════════════════════════
    # TECHNOLOGY & SOFTWARE
    # ══════════════════════════════════════════════════════════════════════════
    "technology": {
        "display_name": "Technology & Software",
        "icon": "💻",
        "ui_color": "#3b82f6",        # blue
        "ui_color_rgb": "59,130,246",

        # How often metadata_fetch re-crawls a channel already in
        # discovered_channels.json. Higher priority = shorter interval.
        "refresh_interval_days": 3,

        "detection_keywords": [
            "ai", "chatgpt", "software", "app", "coding", "python", "tutorial",
            "saas", "tool", "automation", "claude", "gemini", "openai", "tech review",
            "developer", "programming", "javascript", "react", "node", "api", "llm",
            "machine learning", "ml", "gpt", "prompt", "workflow", "no-code", "zapier",
            "make.com", "notion", "figma", "vs code", "github", "build with ai",
            "tech stack", "startup tech", "product hunt", "cursor", "v0", "lovable",
        ],

        "subniches": {
            "ai_tools":           "AI Tools & Prompting",
            "software_tutorials": "Software Tutorials",
            "coding_dev":         "Coding & Development",
            "saas_reviews":       "SaaS & App Reviews",
            "automation":         "Automation & No-Code",
            "hardware_setup":     "Hardware & Setup",
            "cybersecurity":      "Cybersecurity",
            "data_analytics":     "Data & Analytics",
            "tech_news":          "Tech News & Commentary",
        },

        "centroids": {
            "ai_tools":           "AI tools chatgpt claude gemini prompt engineering LLM workflow automation productivity with AI",
            "software_tutorials": "how to use software tutorial step by step beginner guide setup walkthrough",
            "coding_dev":         "coding tutorial python javascript react web development build app project beginner",
            "saas_reviews":       "SaaS app review software comparison best tools pricing worth it alternative",
            "automation":         "automation workflow no-code zapier make.com airtable notion integration trigger action",
            "hardware_setup":     "PC build setup battlestation desk tour monitor GPU CPU RAM build guide",
            "cybersecurity":      "cybersecurity hacking ethical hacking VPN privacy data breach security tips",
            "data_analytics":     "data analysis Excel Python pandas dashboard Power BI Tableau SQL data visualization",
            "tech_news":          "tech news AI news product launch startup funding big tech analysis breakdown",
        },

        "seasonal_calendar": {
            1:  {"ai_tools": 1.35, "automation": 1.30, "coding_dev": 1.20, "saas_reviews": 1.15},  # New Year tech resolutions
            2:  {"ai_tools": 1.25, "coding_dev": 1.20, "saas_reviews": 1.15},
            3:  {"saas_reviews": 1.20, "ai_tools": 1.25, "automation": 1.15},
            4:  {"coding_dev": 1.20, "ai_tools": 1.15, "automation": 1.15},
            5:  {"ai_tools": 1.30, "saas_reviews": 1.25, "tech_news": 1.15},                      # Spring product launches (Google I/O)
            6:  {"ai_tools": 1.25, "software_tutorials": 1.20, "automation": 1.15},               # WWDC / dev conferences
            7:  {"software_tutorials": 1.25, "coding_dev": 1.20},                                 # Summer learning
            8:  {"coding_dev": 1.30, "software_tutorials": 1.25, "ai_tools": 1.20},               # Back to school / hackathon season
            9:  {"saas_reviews": 1.20, "ai_tools": 1.25, "tech_news": 1.15},                      # Q4 product launches
            10: {"ai_tools": 1.35, "tech_news": 1.30, "saas_reviews": 1.25},                      # Major product launches (Apple event etc)
            11: {"ai_tools": 1.30, "tech_news": 1.25, "saas_reviews": 1.20},                      # Black Friday deals
            12: {"ai_tools": 1.25, "tech_news": 1.20, "automation": 1.20, "coding_dev": 1.15},    # Year-in-review content
        },

        "seed_channels": [
            # Top tech/AI YouTube channels for market data crawl
            "UCsBjURrPoezykLs9EqgamOA",  # Fireship
            "UC8butISFwT-Wl7EV0hUK0BQ",  # freeCodeCamp
            "UCVhQ2NnY5Rskt6UjCUkJ_DA",  # Tech With Tim
            "UCnUYZLuoy1rq1aVMwx4aTzw",  # sentdex
            "UC0RhatS1pyxInC00YKjjBqQ",  # Marques Brownlee (MKBHD)
            "UCbmNph6atAoGfqLoCL_duAg",  # AI tools coverage
            "UCJXGnJCMgGjhSuGUiDwMT2A",  # Matt Wolfe (AI tools)
        ],

        "system_prompt_addon": """
TECHNOLOGY & SOFTWARE NICHE EXPERTISE:
— AI tool content has a 2–4 week peak traffic window after a major model/feature launch, then stabilizes at 15–25% of peak. Prioritize recency framing ("in 2024", "just released") for launch-week briefs.
— "Tutorial" titles outperform "review" titles 3:1 in tech when the creator is under 500K subs. Above 500K, opinion/commentary titles match or beat tutorial CTR.
— Comparison ("X vs Y") titles have 6–12 months of long-tail traffic. They are the most durable format in this niche.
— "I built X in Y minutes using AI" massively outperforms "how to build X" — the time constraint creates irresistible curiosity.
— Coding tutorials with a specific project outcome ("build a full-stack app", "build this bot") outperform concept tutorials ("learn Python classes") by 4:1 in search.
— Tech thumbnail formula that works: dark background + prominent tool logo + creator face reacting to output. Avoid stock-style imagery.
— Cybersecurity content spikes massively after public breach events — keep sensitivity to news cycles in the hook.
""",

        "negative_anchors": [
            # Generic non-actionable content
            "podcast interview reaction clip drama commentary",
            "vlog entertainment challenge funny prank",
            "gaming simulator beamng assetto corsa gta",
            # Tech-specific commentary, news, and deal-hunting
            "tech news analysis", "industry commentary", "tech drama",
            "gpu prices", "prime day deals", "price drop", "best tech deals",
            "unboxing", "dumpster dive", "i found this", "threw out",
            "the real reason why", "what you need to know about", "nvidia abandoned",
        ],

        "supabase_table": "technology_videos",

        "tier_strategies": {
            "micro":       "Tutorial-first, very specific outcomes. 'Build a [specific thing] with [specific tool] in [specific time]'. The more specific the promise, the higher the CTR at this size.",
            "rising":      "Mix tutorials with tool reviews and comparisons. 'X vs Y' comparison titles perform especially well at this tier — high search volume, low competition.",
            "established": "Lean into opinion-led content and build-in-public narratives. Your audience trusts your perspective. Contrarian takes on popular tools outperform pure tutorials.",
            "major":       "Commentary, breakdowns, and reactions to industry events. Hot takes on AI releases, funding rounds, and product launches get amplified by your existing audience.",
        },
    },

    # ══════════════════════════════════════════════════════════════════════════
    # PRODUCTIVITY & GROWTH
    # ══════════════════════════════════════════════════════════════════════════
    "productivity": {
        "display_name": "Productivity & Growth",
        "icon": "🚀",
        "ui_color": "#f59e0b",        # amber
        "ui_color_rgb": "245,158,11",

        # How often metadata_fetch re-crawls a channel already in
        # discovered_channels.json. Higher priority = shorter interval.
        "refresh_interval_days": 7,

        "detection_keywords": [
            "productivity", "notion", "habit", "morning routine", "deep work",
            "time management", "focus", "second brain", "journaling", "goal",
            "life hack", "obsidian", "remote work", "freelance", "self improvement",
            "study with me", "study tips", "pomodoro", "inbox zero", "pkm",
            "personal knowledge management", "essentialism", "atomic habits",
            "daily routine", "night routine", "desk setup", "work from home",
            "digital minimalism", "slow living", "intentional", "system", "workflow",
        ],

        "subniches": {
            "time_management":  "Time Management",
            "note_taking_pkm":  "Note-Taking & PKM",
            "habits_routines":  "Habits & Routines",
            "career_growth":    "Career Growth",
            "remote_work":      "Remote Work",
            "freelancing":      "Freelancing & Solopreneurship",
            "study_techniques": "Study Techniques",
            "mindset_focus":    "Mindset & Focus",
            "tool_reviews":     "Tool Reviews (Notion, Obsidian)",
        },

        "centroids": {
            "time_management":  "time management tips time blocking calendar schedule prioritize deep work GTD getting things done",
            "note_taking_pkm":  "note taking system Notion Obsidian Roam second brain PKM personal knowledge management Zettelkasten",
            "habits_routines":  "morning routine night routine habit stack habit tracker atomic habits daily system discipline",
            "career_growth":    "career growth promotion salary negotiation LinkedIn networking soft skills leadership",
            "remote_work":      "remote work work from home home office setup tips productivity WFH freelance digital nomad",
            "freelancing":      "freelancing solopreneur freelance tips client finding proposal rates income replace 9-5",
            "study_techniques": "study tips study with me focus techniques exam prep spaced repetition active recall Pomodoro",
            "mindset_focus":    "mindset focus discipline motivation stoicism self improvement mental health burnout energy",
            "tool_reviews":     "Notion review Obsidian review productivity tool comparison template setup tutorial workflow",
        },

        "seasonal_calendar": {
            1:  {"habits_routines": 1.55, "time_management": 1.45, "mindset_focus": 1.35, "note_taking_pkm": 1.20},  # New Year — absolute peak
            2:  {"habits_routines": 1.35, "time_management": 1.25, "mindset_focus": 1.20},
            3:  {"study_techniques": 1.30, "time_management": 1.20, "career_growth": 1.15},
            4:  {"career_growth": 1.25, "freelancing": 1.20, "remote_work": 1.15},                 # Spring hiring season
            5:  {"remote_work": 1.20, "freelancing": 1.25, "career_growth": 1.15},
            6:  {"freelancing": 1.30, "remote_work": 1.25, "study_techniques": 1.15},              # Summer / school out
            7:  {"remote_work": 1.20, "freelancing": 1.25, "mindset_focus": 1.15},
            8:  {"study_techniques": 1.35, "habits_routines": 1.25, "time_management": 1.20},      # Back to school
            9:  {"career_growth": 1.30, "time_management": 1.25, "habits_routines": 1.15},         # Q4 push / new job season
            10: {"time_management": 1.20, "career_growth": 1.20, "note_taking_pkm": 1.15},
            11: {"habits_routines": 1.25, "mindset_focus": 1.20, "time_management": 1.15},
            12: {"habits_routines": 1.40, "time_management": 1.35, "mindset_focus": 1.25},         # Year-end reflection peak
        },

        "seed_channels": [
            # Top productivity YouTube channels for market data crawl
            "UCG-KntY7aVnIGXYEBQvmBAQ",  # Thomas Frank
            "UCWX3yGbODI3TvdRngfAzFGA",  # Ali Abdaal
            "UC9-y-6csu5WGm29I7JiwpnA",  # Kurzgesagt (mindset/systems)
            "UCJ24N4O0bP7LGLBDvye7oCA",  # Matt D'Avella
            "UCEDkO7wshcDZ7UZo17rPkzQ",  # Better Ideas
            "UCoOae5nYA7VqaXzerajD0lg",  # CGP Grey
            "UCFe6jenM1Bc68oyLEADFkKg",  # Mike & Matty
        ],

        "system_prompt_addon": """
PRODUCTIVITY & GROWTH NICHE EXPERTISE:
— January is the single biggest month in this niche by a wide margin (New Year effect). Habit/routine content gets 1.5–2x normal views in the first 2 weeks of January. Always note this if the current month is December (pre-seed) or January (peak).
— "Day in my life" videos outperform "how to" videos for creators above 100K subs in this niche. Below 100K, specific how-to tutorials with a system/framework win.
— Tool review titles that include the creator's own opinion ("Why I switched from Notion to Obsidian") dramatically outperform neutral reviews ("Notion vs Obsidian comparison"). First-person opinion signals authenticity.
— Study content peaks in August (back to school) and December (finals/year-end). Exact timing: August 5–25 and December 1–15.
— The word "system" in a title outperforms "tips" by ~30% in search CTR for this niche. "My productivity system" > "productivity tips".
— Freelancing and remote work content has the highest watch time of any sub-topic in this niche (12–18 min average) — brief scripts should be written for depth, not brevity.
— Mindset content (discipline, focus, dopamine) spikes massively after a viral book release or podcast moment. Keep sensitivity to cultural triggers.
""",

        "negative_anchors": [
            # Generic non-actionable content
            "podcast interview reaction clip drama commentary",
            "vlog entertainment challenge funny prank",
            "gaming simulator beamng assetto corsa gta",
            # Productivity-specific lifestyle/vlog content
            "morning routine vlog", "daily vlog", "what i eat in a day",
            "school routine", "study with me live", "get ready with me",
            "motivation compilation", "inspirational speech", "motivational video",
        ],

        "supabase_table": "productivity_videos",

        "tier_strategies": {
            "micro":       "Ultra-specific system reveals. 'My exact morning routine for [specific goal]', 'The Notion template that changed my [X]'. Specificity and personal stakes drive CTR at this size.",
            "rising":      "Framework-first titles. Give the system a name, make it sound proprietary. 'The [Name] Method', 'My [X]-step system for Y'. Combine personal angle with searchable keywords.",
            "established": "Opinion-led content. Contrarian takes on popular methods ('Why I stopped using Notion'), personal evolution ('How my productivity system changed after [life event]').",
            "major":       "Cultural commentary and lifestyle content. 'Day in my life', reactions to productivity trends, collabs with other creators. Your personality IS the product at this tier.",
        },
    },
}


# ── Helper functions ──────────────────────────────────────────────────────────

def get_niche_config(niche: str) -> Dict[str, Any]:
    """
    Returns the config for a given niche key.
    Falls back to 'automotive' if the niche is unknown.
    """
    if niche not in NICHE_CONFIGS:
        import logging
        logging.getLogger(__name__).warning(
            "Unknown niche '%s' — falling back to 'automotive'", niche
        )
        return NICHE_CONFIGS["automotive"]
    return NICHE_CONFIGS[niche]


def list_niches() -> list:
    """Returns all registered niche keys."""
    return list(NICHE_CONFIGS.keys())


def get_seasonal_multiplier(niche: str, topic: str, month: int) -> float:
    """
    Returns the seasonal multiplier for a topic in a given niche and month.
    Returns 1.0 (neutral) if no entry found.
    """
    config = get_niche_config(niche)
    calendar = config.get("seasonal_calendar", {})
    month_boosts = calendar.get(month, {})
    return float(month_boosts.get(topic, 1.0))


def get_refresh_interval_days(niche: str) -> int:
    """
    Returns the per-niche re-crawl interval (days) for channels already in
    discovered_channels.json. High-priority niches (3d) refresh often; low-activity
    niches (14d) save quota. Defaults to 7 days when unset.
    """
    return int(get_niche_config(niche).get("refresh_interval_days", 7))


def get_all_seed_channels() -> Dict[str, list]:
    """Returns all seed channels organized by niche."""
    return {
        niche: cfg.get("seed_channels", [])
        for niche, cfg in NICHE_CONFIGS.items()
    }
