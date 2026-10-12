"""Build the small, public, backend-free data feed used by the iOS app."""

import hashlib
import json
import re
from pathlib import Path


CATALOG_SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 1


def canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def app_text(value):
    """Keep public context readable in-app without exposing tappable-looking source URLs."""
    text = str(value or "").strip()
    text = re.sub(r"[（(]?https://[^\s）)；;]+[）)]?", "", text)
    return re.sub(r"\s*；\s*；+", "；", text).strip(" ；;") or None


def build_public_index(public_data):
    entities = [{
        "id": item["code"],
        "type": item.get("type", ""),
        "name": item.get("name", ""),
        "aliases": [alias for alias in item.get("aliases", "").split("|") if alias],
    } for item in public_data.get("entities", []) if item.get("code") and item.get("name")]
    records = [{
        "id": item["id"],
        "competitionName": item["competitionName"],
        "affirmativeEntityID": item.get("teamIds", {}).get("affirmative", ""),
        "negativeEntityID": item.get("teamIds", {}).get("negative", ""),
        "winner": item.get("winner", ""),
    } for item in public_data.get("records", []) if item.get("id") and item.get("competitionName")]
    honors = [{
        "id": item["id"],
        "competitionName": item["competitionName"],
        "entityID": item.get("teamId", ""),
    } for item in public_data.get("honors", []) if item.get("id") and item.get("competitionName")]
    topics = [{
        "id": item["topicId"],
        "title": item["topic"],
        "competitionName": item["competitionName"],
        "explanation": app_text(item.get("explanation")) or "",
    } for item in public_data.get("topics", []) if item.get("topicId") and item.get("topic")]

    people = {}

    def add_person(name, role, team="", competition="", honor_id=""):
        name = str(name or "").strip()
        if not name:
            return
        person = people.setdefault(name, {
            "roles": set(), "teams": set(), "honorIDs": set(), "appearances": {}
        })
        if role:
            person["roles"].add(role)
        if team:
            person["teams"].add(team)
        if honor_id:
            person["honorIDs"].add(honor_id)
        if competition:
            person["appearances"].setdefault((competition, team), set()).add(role)

    for honor in public_data.get("honors", []):
        if honor.get("honorType") == "player":
            add_person(
                honor.get("recipient"), "選手", honor.get("team", ""),
                honor.get("competitionName", ""), honor.get("id", "")
            )
    for competition, entries in public_data.get("eventRosters", {}).items():
        for roster in entries:
            team = roster.get("team", "")
            for name in roster.get("players", []):
                add_person(name, "選手", team, competition)
            for name in roster.get("leaders", []):
                add_person(name, "領隊", team, competition)

    person_rows = [{
        "id": "person-" + hashlib.sha1(name.encode("utf-8")).hexdigest()[:12],
        "name": name,
        "roles": sorted(value["roles"]),
        "teams": sorted(value["teams"]),
        "honorIDs": sorted(value["honorIDs"]),
        "appearances": [{
            "competitionName": competition,
            "team": team,
            "roles": sorted(roles),
        } for (competition, team), roles in sorted(value["appearances"].items())],
    } for name, value in sorted(people.items())]

    core = {
        "entities": entities,
        "records": records,
        "honors": honors,
        "topics": topics,
        "people": person_rows,
    }
    return {
        "schemaVersion": 1,
        "generatedAt": public_data["generatedAt"],
        "sourceSHA256": hashlib.sha256(canonical_bytes(core)).hexdigest(),
        **core,
    }


def build_catalog(public_data):
    records = public_data.get("records", [])
    honors = public_data.get("honors", [])
    topics = public_data.get("topics", [])
    rosters = public_data.get("eventRosters", {})
    metadata = public_data.get("eventMetadata", {})
    registry = {item["name"]: item for item in public_data.get("competitionRegistry", [])}

    names = {
        item.get("competitionName", "").strip()
        for collection in (records, honors, topics)
        for item in collection
        if item.get("competitionName", "").strip()
    }
    names.update(name for name in rosters if name)

    missing_codes = sorted(name for name in names if not registry.get(name, {}).get("code"))
    if missing_codes:
        raise ValueError("iOS 公開資料缺少穩定賽事代碼：" + "、".join(missing_codes))

    summaries = {name: {"records": 0, "honors": 0, "teams": set()} for name in names}
    for record in records:
        name = record.get("competitionName")
        if name not in summaries:
            continue
        summaries[name]["records"] += 1
        summaries[name]["teams"].update(team for team in record.get("teams", {}).values() if team)
    for honor in honors:
        name = honor.get("competitionName")
        if name in summaries:
            summaries[name]["honors"] += 1
    for name, entries in rosters.items():
        if name in summaries:
            summaries[name]["teams"].update(item.get("team") for item in entries if item.get("team"))

    events = []
    for name in sorted(names, key=lambda item: (registry[item].get("year", ""), registry[item]["code"])):
        details = metadata.get(name, {})
        summary = summaries[name]
        event_topics = [
            {
                "id": topic.get("topicId") or f"{registry[name]['code']}-topic-{index + 1}",
                "title": topic.get("topic", "").strip(),
                "explanation": app_text(topic.get("explanation")),
            }
            for index, topic in enumerate(topics)
            if topic.get("competitionName") == name and topic.get("topic", "").strip()
        ]
        event_honors = [
            {
                "id": honor.get("id") or f"{registry[name]['code']}-honor-{index + 1}",
                "name": honor.get("honorName", "").strip(),
                "recipient": honor.get("recipient", "").strip(),
                "team": honor.get("team", "").strip() or None,
                "type": honor.get("honorType", "").strip() or None,
                "date": honor.get("matchDate", "").strip() or None,
                "note": app_text(honor.get("note")),
            }
            for index, honor in enumerate(honors)
            if honor.get("competitionName") == name
            and honor.get("honorName", "").strip()
            and honor.get("recipient", "").strip()
        ]
        events.append({
            "id": registry[name]["code"],
            "name": name,
            "aliases": [],
            "startDate": details.get("startDate") or None,
            "endDate": details.get("endDate") or None,
            "location": details.get("location") or None,
            "recordCount": summary["records"],
            "honorCount": summary["honors"],
            "teamCount": details.get("teamCount", len(summary["teams"])),
            "organizer": app_text(details.get("organizer")),
            "executionUnit": app_text(details.get("executionUnit")),
            "note": app_text(details.get("note")),
            "awardSelectionCriteria": app_text(details.get("awardSelectionCriteria")),
            "ageRestriction": details.get("ageRestriction"),
            "topics": event_topics,
            "honors": event_honors,
            "teams": sorted(team for team in summary["teams"] if team),
        })

    matches = []
    for record in records:
        teams = record.get("teams", {})
        if not record.get("id") or not record.get("competitionName") or not teams.get("affirmative") or not teams.get("negative"):
            continue
        scores = record.get("scores", {})
        matches.append({
            "id": record["id"],
            "competitionName": record["competitionName"],
            "affirmative": teams["affirmative"],
            "negative": teams["negative"],
            "affirmativeScore": scores.get("affirmative") if isinstance(scores.get("affirmative"), (int, float)) else None,
            "negativeScore": scores.get("negative") if isinstance(scores.get("negative"), (int, float)) else None,
            "date": record.get("matchDate") or None,
            "period": str(record["period"]) if record.get("period") not in (None, "") else None,
            "venue": str(record["venue"]) if record.get("venue") not in (None, "") else None,
        })

    if len({item["id"] for item in events}) != len(events):
        raise ValueError("iOS 公開資料含有重複賽事 ID")
    if len({item["id"] for item in matches}) != len(matches):
        raise ValueError("iOS 公開資料含有重複場次 ID")

    event_names = {item["name"] for item in events}
    missing_events = sorted({item["competitionName"] for item in matches} - event_names)
    if missing_events:
        raise ValueError("iOS 場次找不到對應賽事：" + "、".join(missing_events))

    public_index = build_public_index(public_data)
    content = {"events": events, "matches": matches, "publicIndex": public_index}
    version_content = {
        "events": events,
        "matches": matches,
        "publicIndex": {key: value for key, value in public_index.items() if key != "generatedAt"},
    }
    dataset_version = hashlib.sha256(canonical_bytes(version_content)).hexdigest()
    return {
        "schemaVersion": CATALOG_SCHEMA_VERSION,
        "datasetVersion": dataset_version,
        "generatedAt": public_data["generatedAt"],
        **content,
    }


def write_feed(public_data, output_dir, home_manifest=None):
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    catalog = build_catalog(public_data)
    catalog_bytes = (json.dumps(catalog, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    manifest = {
        "schemaVersion": MANIFEST_SCHEMA_VERSION,
        "catalogSchemaVersion": CATALOG_SCHEMA_VERSION,
        "datasetVersion": catalog["datasetVersion"],
        "generatedAt": catalog["generatedAt"],
        "catalogPath": "catalog.json",
        "sha256": hashlib.sha256(catalog_bytes).hexdigest(),
        "byteCount": len(catalog_bytes),
        "eventCount": len(catalog["events"]),
        "matchCount": len(catalog["matches"]),
    }
    if home_manifest:
        manifest.update(home_manifest)
    (output_dir / "catalog.json").write_bytes(catalog_bytes)
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return catalog, manifest
