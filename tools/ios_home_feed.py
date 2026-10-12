"""Create the versioned, public-only iOS homepage snapshot.

This consumes the same reviewed public data and calendar announcements used
by the website. It never reads membership, Sites, or private datasets.
"""
import hashlib
import json
import re
from datetime import date


def compact(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def podium_rank(name):
    for suffix, label in (("冠軍", "冠"), ("亞軍", "亞"), ("季軍", "季"), ("殿軍", "殿")):
        if re.search(r"(?:^|組)" + suffix + r"$", (name or "").strip()):
            return label
    return None


def honor_category(honor):
    if podium_rank(honor.get("honorName", "")):
        return "team"
    title = honor.get("honorName", "")
    if honor.get("honorType") == "player" and ("全程最佳" in title or "全程優秀" in title):
        return "individual"
    return "other"


def build_home(public_data, upcoming, activities):
    registry = {entry["name"]: entry["code"] for entry in public_data["competitionRegistry"]}
    metadata = public_data.get("eventMetadata", {})
    records = public_data.get("records", [])
    honors = public_data.get("honors", [])
    schools = {x["code"]: x["name"] for x in public_data.get("entities", []) if x.get("type") == "s"}
    generated = public_data["generatedAt"]
    today = generated[:10]

    results = []
    last_dates = {}
    for name, code in registry.items():
        corresponding = [x for x in records if x.get("competitionName") == name]
        achievements = [x for x in honors if x.get("competitionName") == name]
        date_candidates = [metadata.get(name, {}).get("endDate") or ""] + [
            x.get("matchDate") or "" for x in corresponding + achievements
        ]
        latest = max(date_candidates)
        last_dates[name] = latest
        if not latest or latest > today or not (corresponding or achievements):
            continue
        podium = [
            {"rank": label, "recipient": x.get("recipient") or x.get("team") or "未提供",
             "honorId": x["id"]}
            for x in achievements if (label := podium_rank(x.get("honorName")))
        ]
        results.append({
            "id": code, "name": name, "date": latest,
            "recordCount": len(corresponding), "podium": podium
        })
    results.sort(key=lambda x: (x["date"], x["id"]), reverse=True)

    upcoming_rows = []
    for kind, items in (("tournament", upcoming), ("activity", activities)):
        for item in items:
            start = item.get("startDate") or ""
            end = item.get("endDate") or max(
                [start] + [day.get("date") or start for day in item.get("days", [])]
            )
            if not start or end < today:
                continue
            row = {
                "id": f"{kind}:{item['id']}",
                "eventId": (item.get("competitionCode") if kind == "tournament" else None),
                "name": item["name"],
                "startDate": start,
                "endDate": end,
                "location": item.get("location") or "",
                "kind": kind,
            }
            for field in ("startTime", "endTime", "organizer", "topic", "topicNote",
                          "note", "statusNote", "registrationUrl", "sourceUrl", "keyDates",
                          "days", "links", "pricing", "registrationNotes"):
                if item.get(field):
                    row[field] = item[field]
            upcoming_rows.append(row)
    upcoming_rows.sort(key=lambda x: (x["startDate"], x["id"]))

    event_years = {name: latest[:4] for name, latest in last_dates.items() if latest}
    recent_years = sorted(set(event_years.values()))[-2:]
    def rankings(year_range):
        scoped = [
            honor for honor in honors if honor.get("teamId") in schools
            and (year_range == "all" or event_years.get(honor.get("competitionName")) in recent_years)
        ]
        groups = {"team": {}, "individual": {}, "other": {}}
        for honor in scoped:
            category = honor_category(honor)
            id_ = honor["teamId"]
            group = groups[category]
            row = group.setdefault(id_, {
                "id": id_, "name": schools[id_], "count": 0,
                "gold": 0, "silver": 0, "bronze": 0, "white": 0,
                "fullBest": 0, "fullExcellent": 0, "other": 0, "awards": [],
            })
            rank = podium_rank(honor.get("honorName", ""))
            if rank:
                row[{"冠": "gold", "亞": "silver", "季": "bronze", "殿": "white"}[rank]] += 1
            elif category == "individual":
                row["fullBest" if "全程最佳" in honor.get("honorName", "") else "fullExcellent"] += 1
            else:
                row["other"] += 1
            event_name = honor.get("competitionName") or ""
            row["count"] += 1
            row["awards"].append({
                "id": honor["id"], "eventId": registry.get(event_name),
                "eventName": event_name,
                "name": honor.get("honorName") or "公開榮譽",
                "recipient": honor.get("recipient") or honor.get("team") or "",
                "date": honor.get("matchDate") or last_dates.get(event_name) or "",
            })
        for category in groups:
            for row in groups[category].values():
                row["awards"].sort(key=lambda x: (x["date"], x["id"]), reverse=True)
            groups[category] = sorted(
                groups[category].values(), key=lambda x: (-x["count"], x["name"], x["id"])
            )
        return groups

    return {
        "schemaVersion": 1,
        "generatedAt": generated,
        "recentYears": recent_years,
        "recent": results[:8],
        "upcoming": upcoming_rows,
        "leaderboard": {"recent": rankings("recent"), "all": rankings("all")},
    }


def write_home(public_data, upcoming, activities, output_dir):
    home = build_home(public_data, upcoming, activities)
    content = (json.dumps(home, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    path = output_dir / "home.json"
    path.write_bytes(content)
    return {
        "homePath": "home.json",
        "homeSHA256": hashlib.sha256(content).hexdigest(),
        "homeByteCount": len(content),
        "homeVersion": hashlib.sha256(compact({k: v for k, v in home.items() if k != "generatedAt"})).hexdigest(),
        "homeGeneratedAt": home["generatedAt"],
    }
