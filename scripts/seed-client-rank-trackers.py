#!/usr/bin/env python3
"""
Seed real rank trackers for the 3 client projects that have none:
  - Communication Station SLT (commstationslt.com)
  - Alfonso Dental (alfonsodental305.com)
  - Maitel Optical (maiteloptical.com)

Creates a weekly, depth-40, both-devices config + 10 money keywords each.
NO synthetic snapshots — real position data comes from the scheduled
DataForSEO check (kicked by the daily pulse via /cdn-cgi/handler/scheduled).

Why direct sqlite: the app's own getPlatformProxy write path (scripts/
seed-rank-tracking.ts) is broken on Node 26 (ERR_UNSUPPORTED_ESM_URL_SCHEME
'cloudflare:'). Direct WAL-mode sqlite writes are verified safe — workerd
reads them back via the MCP get_rank_tracker tool.

Usage:
  python3 scripts/seed-client-rank-trackers.py
"""

import glob
import os
import sqlite3
import sys
import uuid

D1_DIR = "/Users/ramai/Projects/open-seo/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
LOCATION_CODE = 2840
SERP_DEPTH = 40

# projectId -> { domain, keywords: [{keyword, volume, kd, cpc}] }
CLIENT_TRACKERS = {
    # Communication Station SLT — speech-language therapy, Miami
    "ad3950c0-f176-4b30-810a-50f04680c8d2": {
        "domain": "commstationslt.com",
        "keywords": [
            {"keyword": "speech therapy miami", "volume": 1000, "kd": 30, "cpc": 4.5},
            {"keyword": "speech therapist miami", "volume": 880, "kd": 28, "cpc": 4.2},
            {"keyword": "speech therapy near me", "volume": 7400, "kd": 35, "cpc": 5.1},
            {"keyword": "pediatric speech therapy miami", "volume": 480, "kd": 24, "cpc": 3.8},
            {"keyword": "adult speech therapy miami", "volume": 210, "kd": 18, "cpc": 3.2},
            {"keyword": "communication station slt", "volume": 10, "kd": 0, "cpc": None},
            {"keyword": "speech language pathologist miami", "volume": 390, "kd": 26, "cpc": 4.0},
            {"keyword": "stuttering therapy miami", "volume": 170, "kd": 15, "cpc": 2.9},
            {"keyword": "voice therapy miami", "volume": 140, "kd": 14, "cpc": 2.7},
            {"keyword": "accent reduction miami", "volume": 90, "kd": 10, "cpc": 2.4},
        ],
    },
    # Alfonso Dental — dental, Miami
    "928cb0f7-d359-40ef-8d5d-9428de277143": {
        "domain": "alfonsodental305.com",
        "keywords": [
            {"keyword": "dentist miami", "volume": 12100, "kd": 45, "cpc": 6.8},
            {"keyword": "dentist near me", "volume": 33100, "kd": 50, "cpc": 7.2},
            {"keyword": "alfonso dental", "volume": 10, "kd": 0, "cpc": None},
            {"keyword": "cosmetic dentist miami", "volume": 1900, "kd": 38, "cpc": 6.1},
            {"keyword": "dental implants miami", "volume": 2400, "kd": 42, "cpc": 7.5},
            {"keyword": "emergency dentist miami", "volume": 2900, "kd": 40, "cpc": 6.9},
            {"keyword": "teeth whitening miami", "volume": 1600, "kd": 33, "cpc": 5.4},
            {"keyword": "family dentist miami", "volume": 720, "kd": 30, "cpc": 5.0},
            {"keyword": "dental cleaning miami", "volume": 880, "kd": 28, "cpc": 4.6},
            {"keyword": "invisalign miami", "volume": 1300, "kd": 36, "cpc": 6.3},
        ],
    },
    # Maitel Optical — optical, Miami
    "5bc43a10-a169-48c6-a64c-169acdd3dc40": {
        "domain": "maiteloptical.com",
        "keywords": [
            {"keyword": "optical store miami", "volume": 480, "kd": 22, "cpc": 3.5},
            {"keyword": "eyeglasses miami", "volume": 880, "kd": 25, "cpc": 3.8},
            {"keyword": "eye exam miami", "volume": 1900, "kd": 30, "cpc": 4.4},
            {"keyword": "optometrist miami", "volume": 1600, "kd": 32, "cpc": 4.6},
            {"keyword": "maitel optical", "volume": 10, "kd": 0, "cpc": None},
            {"keyword": "eyeglasses store miami", "volume": 390, "kd": 20, "cpc": 3.2},
            {"keyword": "contact lenses miami", "volume": 720, "kd": 24, "cpc": 3.6},
            {"keyword": "prescription glasses miami", "volume": 480, "kd": 22, "cpc": 3.4},
            {"keyword": "designer eyeglasses miami", "volume": 210, "kd": 18, "cpc": 3.0},
            {"keyword": "children eye exam miami", "volume": 90, "kd": 12, "cpc": 2.6},
        ],
    },
}


def find_db():
    dbs = glob.glob(os.path.join(D1_DIR, "*.sqlite"))
    dbs = [p for p in dbs if "metadata" not in os.path.basename(p)]
    if not dbs:
        sys.exit(f"OpenSEO D1 sqlite not found under {D1_DIR}")
    return dbs[0]


def main():
    db_path = find_db()
    con = sqlite3.connect(db_path, timeout=10)
    con.execute("PRAGMA busy_timeout=10000")
    cur = con.cursor()

    # Verify projects exist
    cur.execute("SELECT id, name, domain FROM projects")
    projects = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    now = "2026-08-06 12:30:00"
    for project_id, cfg in CLIENT_TRACKERS.items():
        if project_id not in projects:
            print(f"SKIP: project {project_id} not found")
            continue
        name, domain = projects[project_id]

        # Reset any existing config for this domain (cascades keywords/runs)
        cur.execute(
            "SELECT id FROM rank_tracking_configs WHERE domain=?",
            (cfg["domain"],),
        )
        existing = cur.fetchone()
        if existing:
            cur.execute(
                "DELETE FROM rank_tracking_configs WHERE id=?", (existing[0],)
            )
            print(f"Reset existing config for {cfg['domain']}")

        config_id = str(uuid.uuid4())
        cur.execute(
            """INSERT INTO rank_tracking_configs
               (id, project_id, domain, location_code, language_code, devices,
                schedule_interval, is_active, last_checked_at, next_check_at,
                last_skip_reason, created_at, serp_depth, location_name)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                config_id, project_id, cfg["domain"], LOCATION_CODE, "en",
                "both", "weekly", 1, now, now, None, now, SERP_DEPTH, None,
            ),
        )

        for kw in cfg["keywords"]:
            cur.execute(
                """INSERT INTO rank_tracking_keywords
                   (id, config_id, keyword, search_volume, keyword_difficulty,
                    cpc, metrics_fetched_at, created_at)
                   VALUES (?,?,?,?,?,?,?,?)""",
                (
                    str(uuid.uuid4()), config_id, kw["keyword"], kw["volume"],
                    kw["kd"], kw["cpc"], now, now,
                ),
            )

        con.commit()
        print(
            f"✅ {name} ({cfg['domain']}) — config {config_id}, "
            f"{len(cfg['keywords'])} keywords"
        )

    con.close()
    print("\nDone. Next: kick the scheduled check to populate real ranks.")


if __name__ == "__main__":
    main()
