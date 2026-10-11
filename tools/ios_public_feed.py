"""Build the small, public, backend-free data feed used by the iOS app."""

import hashlib
import json
from pathlib import Path


CATALOG_SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 1


def canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


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

    content = {"events": events, "matches": matches}
    dataset_version = hashlib.sha256(canonical_bytes(content)).hexdigest()
    return {
        "schemaVersion": CATALOG_SCHEMA_VERSION,
        "datasetVersion": dataset_version,
        "generatedAt": public_data["generatedAt"],
        **content,
    }


def write_feed(public_data, output_dir):
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
    (output_dir / "catalog.json").write_bytes(catalog_bytes)
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return catalog, manifest
