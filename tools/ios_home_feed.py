"""Generate iOS public-home preview data without changing the existing v1 feed.

Run from the public website repository root:
    python3 tools/ios_home_feed.py
Produces data/ios/home-preview/{home.json,manifest.json}. This is NOT a
published endpoint until a separate, reviewed deployment is authorized.
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "ios" / "home-preview"
RANKS = (("冠", r"(?:^|組)冠軍$"), ("亞", r"(?:^|組)亞軍$"),
         ("季", r"(?:^|組)季軍$"), ("殿", r"(?:^|組)殿軍$"))


def read_js(path, prefix):
    text = path.read_text(encoding="utf-8").strip()
    index = text.find(prefix)
    if index < 0:
        raise ValueError(f"Unexpected JS data prefix: {path}")
    # The existing public files may start with source-provenance comments.
    prelude = text[:index].strip()
    if any(line.strip() and not line.strip().startswith("//") for line in prelude.splitlines()):
        raise ValueError(f"Unexpected content before public data: {path}")
    return json.loads(text[index + len(prefix):].rstrip(";\\n "))



def medal(honor):
    name = (honor.get("honorName") or "").strip()
    return next((label for label, pattern in RANKS if re.search(pattern, name)), "")


def is_full_course_best(honor):
    return honor.get("honorLevel") == "全程最佳辯士" or (honor.get("honorName") or "").strip() == "全程最佳辯士"


def is_full_course_excellent(honor):
    return honor.get("honorLevel") == "全程優秀辯士" or (honor.get("honorName") or "").strip() == "全程優秀辯士"


def latest_event_dates(data):
    dates = {}
    for name, item in data.get("eventMetadata", {}).items():
        for value in (item.get("startDate"), item.get("endDate")):
            if isinstance(value, str) and value > dates.get(name, ""):
                dates[name] = value
    for item in (*data.get("records", []), *data.get("honors", [])):
        name = item.get("competitionName")
        value = item.get("matchDate") or ""
        if name and value > dates.get(name, ""):
            dates[name] = value
    return dates


def build_home(data, upcoming, activities):
    registry = {item["name"]: item["code"] for item in data.get("competitionRegistry", [])}
    records = data.get("records", [])
    honors = data.get("honors", [])
    entities = {e["code"]: e["name"] for e in data.get("entities", []) if e.get("type") == "s"}
    dates = latest_event_dates(data)
    year_for = {name: date[:4] for name, date in dates.items() if re.match(r"^\d{4}", date)}
    years = sorted(set(year_for.values()))
    recent_years = years[-2:]
    grouped = {}
    counts = {}
    for row in records:
        name = row.get("competitionName")
        if name:
            counts[name] = counts.get(name, 0) + 1
    for honor in honors:
        name = honor.get("competitionName")
        rank = medal(honor)
        if name not in registry or not rank or not honor.get("recipient"):
            continue
        grouped.setdefault(name, []).append({
            "rank": rank, "recipient": honor["recipient"],
            "honorId": honor.get("id") or ""
        })
    for value in grouped.values():
        value.sort(key=lambda item: next(i for i, (rank, _) in enumerate(RANKS) if item["rank"] == rank))

    recent = [{
        "id": registry[name], "name": name, "date": dates[name],
        "recordCount": counts[name],
        "podium": grouped.get(name, [])
    } for name in sorted(counts, key=lambda name: (dates.get(name, ""), name), reverse=True)
        if name in registry and dates.get(name)][:8]

    upcoming_items = []
    for kind, items in (("tournament", upcoming), ("activity", activities)):
        for item in items:
            name = item.get("name")
            date = item.get("startDate")
            if not name or not date:
                continue
            upcoming_items.append({
                "id": (registry.get(name) if kind == "tournament" else None) or item.get("id") or name,
                "eventId": registry.get(name) if kind == "tournament" else None,
                "name": name,
                "startDate": date,
                "endDate": item.get("endDate") or date,
                "location": item.get("location") or "",
                "kind": kind
            })
    upcoming_items.sort(key=lambda row: (row["startDate"], row["name"], row["id"]))

    def leaderboards(selected):
        rows = {code: {"id": code, "name": name, "gold": 0, "silver": 0,
                       "bronze": 0, "white": 0, "fullBest": 0,
                       "fullExcellent": 0, "other": 0, "totalHonors": 0}
                for code, name in entities.items()}
        for honor in honors:
            year = year_for.get(honor.get("competitionName")) or (honor.get("matchDate") or "")[:4]
            if selected and year not in selected:
                continue
            row = rows.get(honor.get("teamId"))
            if row is None:
                continue
            rank = medal(honor)
            if rank:
                row[{"冠": "gold", "亞": "silver", "季": "bronze", "殿": "white"}[rank]] += 1
                row["totalHonors"] += 1
            elif honor.get("honorType") == "player" and (is_full_course_best(honor) or is_full_course_excellent(honor)):
                row["fullBest" if is_full_course_best(honor) else "fullExcellent"] += 1
                row["totalHonors"] += 1
            else:
                row["other"] += 1

        categories = {}
        for category in ("team", "individual", "other"):
            def count(row):
                if category == "team":
                    return row["gold"] + row["silver"] + row["bronze"] + row["white"]
                if category == "individual":
                    return row["fullBest"] + row["fullExcellent"]
                return row["other"]
            result = sorted(({"id": r["id"], "name": r["name"], "count": count(r),
                              "gold": r["gold"], "silver": r["silver"],
                              "bronze": r["bronze"], "white": r["white"],
                              "fullBest": r["fullBest"], "fullExcellent": r["fullExcellent"],
                              "other": r["other"]}
                             for r in rows.values() if count(r) > 0),
                            key=lambda r: (-r["count"], -rows[r["id"]]["totalHonors"], r["name"]))
            categories[category] = result[:10]
        return categories

    return {
        "schemaVersion": 1,
        "generatedAt": data["generatedAt"],
        "recentYears": recent_years,
        "recent": recent,
        "upcoming": upcoming_items,
        "leaderboard": {
            "recent": leaderboards(set(recent_years)),
            "all": leaderboards(None)
        }
    }


def write_home():
    data = read_js(ROOT / "data/public-data.js", "window.DEBATE_PUBLIC_DATA = ")
    upcoming = read_js(ROOT / "data/upcoming-events.js", "window.DEBATE_UPCOMING_EVENTS = ")
    activities = read_js(ROOT / "data/calendar-activities.js", "window.DEBATE_CALENDAR_ACTIVITIES = ")
    payload = build_home(data, upcoming, activities)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (OUTPUT / "home.json").write_bytes(encoded)
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "schemaVersion": 1, "generatedAt": data["generatedAt"],
        "sha256": hashlib.sha256(encoded).hexdigest(), "byteCount": len(encoded)
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = write_home()
    print(f"iOS home: {len(result['recent'])} recent, {len(result['upcoming'])} upcoming, "
          f"{len(result['leaderboard']['recent']['team'])} ranked schools")
