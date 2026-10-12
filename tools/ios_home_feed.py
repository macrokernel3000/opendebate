"""Generate an independent, public-only iOS home feed (preview; not yet deployed).

Run from repository root:
    python3 tools/ios_home_feed.py
No member data, D1 access or changes to the existing iOS v1 catalog.
"""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "ios" / "home-preview"


def read_js(path, prefix):
    text = path.read_text(encoding="utf-8").strip()
    if not text.startswith(prefix):
        raise ValueError(f"Unexpected JS data prefix: {path}")
    return json.loads(text[len(prefix):].rstrip(";\n "))


def write_home():
    data = read_js(ROOT / "data/public-data.js", "window.DEBATE_PUBLIC_DATA = ")
    upcoming = read_js(ROOT / "data/upcoming-events.js", "window.DEBATE_UPCOMING_EVENTS = ")
    activities = read_js(ROOT / "data/calendar-activities.js", "window.DEBATE_CALENDAR_ACTIVITIES = ")
    registry = {r["name"]: r["code"] for r in data["competitionRegistry"]}
    honors = data.get("honors", [])
    records = data.get("records", [])
    dates = {}
    for record in records:
        name, date = record.get("competitionName"), record.get("matchDate") or ""
        if name and date and date > dates.get(name, ""):
            dates[name] = date
    for name, meta in data.get("eventMetadata", {}).items():
        date = meta.get("endDate") or meta.get("startDate") or ""
        if date > dates.get(name, ""):
            dates[name] = date
    podium = {}
    ranks = [("冠", r"(?:^|組)冠軍$"), ("亞", r"(?:^|組)亞軍$"), ("季", r"(?:^|組)季軍$"), ("殿", r"(?:^|組)殿軍$")]
    for honor in honors:
        name = honor.get("competitionName")
        if name not in registry:
            continue
        title = (honor.get("honorName") or "").strip()
        label = next((label for label, pattern in ranks if re.search(pattern, title)), None)
        if not label:
            continue
        recipient = honor.get("recipient") or honor.get("awardee") or honor.get("winner") or honor.get("teamName") or ""
        if not recipient:
            # Do not fabricate a recipient from a different identity field.
            continue
        podium.setdefault(name, []).append({"rank": label, "recipient": recipient, "honorName": title})
    recent = [
        {"id": registry[name], "name": name, "date": date, "podium": podium.get(name, [])}
        for name, date in sorted(dates.items(), key=lambda pair: (-int(pair[1].replace("-", "") or "0"), pair[0]))
        if name in registry
    ][:8]
    future = [
        {"id": e.get("id") or e.get("competitionCode") or e.get("name"), "name": e["name"],
         "startDate": e.get("startDate", ""), "endDate": e.get("endDate") or e.get("startDate", ""),
         "location": e.get("location") or "", "kind": kind}
        for kind, items in (("tournament", upcoming), ("activity", activities))
        for e in items if e.get("name") and e.get("startDate")
    ]
    future.sort(key=lambda e: (e["startDate"], e["name"]))
    payload = {"schemaVersion": 1, "generatedAt": data["generatedAt"], "recent": recent,
               "upcoming": future, "leaderboard": [],
               "leaderboardStatus": "pending-exact-web-ranking-parity"}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    encoded = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode()
    (OUTPUT / "home.json").write_bytes(encoded)
    (OUTPUT / "manifest.json").write_text(json.dumps({
        "schemaVersion": 1, "sha256": hashlib.sha256(encoded).hexdigest(),
        "byteCount": len(encoded), "generatedAt": data["generatedAt"]
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = write_home()
    print(f"iOS home preview: {len(result['recent'])} recent, {len(result['upcoming'])} upcoming")
