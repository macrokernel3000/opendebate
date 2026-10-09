#!/usr/bin/env python3
"""Load the canonical entity registry and attach stable entity IDs."""

import csv
import re
import unicodedata
from contextlib import closing

import xlsx_reader as xlsx_reader_module


SCHOOL_ENDINGS = ("高中", "高工", "高商", "高職", "中學", "國中", "國小", "女中", "女高", "一中", "二中", "壢中", "附中", "實中", "護專", "五專", "國中部")
KNOWN_SCHOOL_SHORT_NAMES = {"市立大同", "市立復興", "市立東山", "新北三民", "桃園陽明", "私立東山", "高市三民", "高市中正"}


def clean(value):
    return str(value or "").strip()


def normalize_entity_label(value):
    """Normalize formatting and common Taiwan character variants for collision checks."""
    normalized = unicodedata.normalize("NFKC", clean(value))
    normalized = re.sub(r"\s+", "", normalized).lower()
    return normalized.replace("台", "臺")


def entity_base_name(name):
    name = clean(name)
    name = re.sub(r"\s+(?:正|反)$", "", name)
    suffix = re.search(r"(?:\(二\)|（二）|[AB]|\d+)$", name)
    if suffix and name[:suffix.start()].endswith(SCHOOL_ENDINGS):
        name = name[:suffix.start()]
    return name.strip()


def suggested_type(name):
    compact = re.sub(r"\s+", "", name)
    if "大學" in compact or compact in {"臺大", "台大", "政大", "師大", "輔大", "東吳", "中山大", "中正大"}:
        return "u"
    if compact.endswith(SCHOOL_ENDINGS) or "國際學校" in compact or compact in KNOWN_SCHOOL_SHORT_NAMES:
        return "s"
    return "p"


def read_registry(registry_path, legacy_xlsx_path, warn):
    entries = []
    source_name = registry_path.name
    # Keep the maintained CSV registry authoritative; XLSX is a fallback for
    # legacy imports when the CSV registry is not present.
    if registry_path.exists():
        with registry_path.open("r", encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                if clean(row.get("name")):
                    entries.append({key: clean(row.get(key)) for key in ("code", "type", "name", "aliases")})
    elif legacy_xlsx_path.exists():
        source_name = legacy_xlsx_path.name
        with closing(xlsx_reader_module.read_sheets(legacy_xlsx_path)) as sheets:
            first_sheet = next(sheets, None)
        if first_sheet is None:
            raise SystemExit("entity-registry.xlsx 找不到工作分頁")
        _, matrix, _ = first_sheet
        header_index = next((index for index, row in enumerate(matrix) if {"code", "type", "name", "aliases"}.issubset(set(row))), None)
        if header_index is None:
            raise SystemExit("entity-registry.xlsx 缺少 code、type、name、aliases 標題")
        headers = matrix[header_index]
        for row in matrix[header_index + 1:]:
            item = {header: clean(row[index]) if index < len(row) else "" for index, header in enumerate(headers)}
            if item.get("name"):
                entries.append({key: clean(item.get(key)) for key in ("code", "type", "name", "aliases")})
    seen_codes = set()
    seen_names = {}
    for line_number, entry in enumerate(entries, start=2):
        entry["code"] = entry["code"].lower()
        if not entry["code"] or not entry["name"]:
            raise SystemExit(f"{source_name} 第 {line_number} 筆缺少 code 或 name")
        if not re.fullmatch(r"[spu]\d{3}", entry["code"]):
            raise SystemExit(f"{source_name} 的代碼格式錯誤：{entry['code']}")
        if entry["code"] in seen_codes:
            raise SystemExit(f"{source_name} 有重複代碼：{entry['code']}")
        seen_codes.add(entry["code"])
        entry["type"] = entry["code"][0]
        for name in [entry["name"], *entry["aliases"].split("|")]:
            name = clean(name)
            if not name:
                continue
            normalized = normalize_entity_label(name)
            if normalized in seen_names and seen_names[normalized] != entry["code"]:
                warn(f"提醒：{source_name} 的名稱或別名重複：{name}；正式名稱會優先，別名衝突時保留先出現的歸戶")
            else:
                seen_names[normalized] = entry["code"]
        if entry["type"] == "s":
            school_names = [entry["name"], *entry["aliases"].split("|")]
            school_name_set = {clean(name) for name in school_names if clean(name)}
            for name in school_name_set:
                alternate = name.replace("台", "臺") if "台" in name else name.replace("臺", "台")
                if ("台" in name or "臺" in name) and alternate not in school_name_set:
                    warn(f"提醒：{source_name} 的學校名稱缺少台／臺別名：{entry['code']} {name} → {alternate}")
    return entries


def write_registry(entries, registry_path):
    with registry_path.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=["code", "type", "name", "aliases"])
        writer.writeheader()
        writer.writerows(entries)


def build_entities(records, honors, registry_entries, registry_path):
    raw_names = set()
    for record in records:
        raw_names.update(record["teams"].values())
    for honor in honors:
        if honor["team"]:
            raw_names.add(honor["team"])
        elif honor["honorType"] == "team":
            raw_names.add(honor["recipient"])

    entries = [dict(entry) for entry in registry_entries]
    alias_lookup = {entry["name"]: entry for entry in entries}
    normalized_alias_lookup = {}
    ambiguous_aliases = set()
    for entry in entries:
        for alias in (entry["name"], *entry["aliases"].split("|")):
            alias = clean(alias)
            if not alias:
                continue
            alias_lookup.setdefault(alias, entry)
            normalized = normalize_entity_label(alias)
            previous = normalized_alias_lookup.get(normalized)
            if previous and previous["code"] != entry["code"]:
                normalized_alias_lookup.pop(normalized, None)
                ambiguous_aliases.add(normalized)
            elif normalized not in ambiguous_aliases:
                normalized_alias_lookup[normalized] = entry

    grouped = {}
    for name in sorted(raw_names):
        if not name or name in alias_lookup:
            continue
        normalized = normalize_entity_label(name)
        matched_entry = None if normalized in ambiguous_aliases else normalized_alias_lookup.get(normalized)
        if matched_entry:
            aliases = [alias for alias in matched_entry["aliases"].split("|") if clean(alias)]
            if name not in aliases and name != matched_entry["name"]:
                aliases.append(name)
                matched_entry["aliases"] = "|".join(aliases)
            alias_lookup[name] = matched_entry
            normalized_alias_lookup[normalized] = matched_entry
            continue
        grouped.setdefault(entity_base_name(name), []).append(name)

    used_codes = {entry["code"] for entry in entries}
    # 500-999 is reserved for member-site approvals. Public auto-numbering
    # must not enter that range, even if approved codes are imported later.
    counters = {prefix: max([int(code[1:]) for code in used_codes if re.fullmatch(prefix + r"\d{3}", code) and int(code[1:]) < 500] or [0]) for prefix in "spu"}
    for base, names in grouped.items():
        entity_type = suggested_type(base)
        while True:
            counters[entity_type] += 1
            if counters[entity_type] >= 500:
                raise SystemExit(f"{entity_type} 公開自動代碼區已用完；500–999 保留給會員站核准代碼")
            code = f"{entity_type}{counters[entity_type]:03d}"
            if code not in used_codes:
                break
        used_codes.add(code)
        entry = {"code": code, "type": entity_type, "name": base, "aliases": "|".join(name for name in names if name != base)}
        entries.append(entry)
        for name in names:
            alias_lookup[name] = entry

    # Store both 台／臺 spellings, including aliases discovered from source
    # records above. Preserve the first occurrence and keep the CSV stable.
    for entry in entries:
        aliases = []
        seen_aliases = {entry["name"]}
        for alias in entry["aliases"].split("|"):
            alias = clean(alias)
            if alias and alias not in seen_aliases:
                aliases.append(alias)
                seen_aliases.add(alias)
        if entry["type"] == "s":
            for name in [entry["name"], *aliases]:
                if "台" not in name and "臺" not in name:
                    continue
                alternate = name.replace("台", "臺") if "台" in name else name.replace("臺", "台")
                if alternate not in seen_aliases:
                    aliases.append(alternate)
                    seen_aliases.add(alternate)
        entry["aliases"] = "|".join(aliases)

    entries.sort(key=lambda entry: entry["code"])
    write_registry(entries, registry_path)
    lookup = {entry["name"]: entry["code"] for entry in entries}
    for entry in entries:
        for alias in entry["aliases"].split("|"):
            if clean(alias):
                lookup.setdefault(clean(alias), entry["code"])
    return entries, lookup


def attach_entities(records, honors, lookup, stable_id):
    attendance = []
    valid_codes = set(lookup.values())
    for record in records:
        explicit_codes = record.pop("_teamEntityCodes", {})
        record["teamIds"] = {}
        for side, name in record["teams"].items():
            code = clean(explicit_codes.get(side)) or lookup.get(name, "")
            if code and code not in valid_codes:
                raise SystemExit(f"{record['competitionName']}：隊伍「{name}」指定了不存在的學校代碼「{code}」")
            record["teamIds"][side] = code
        record["id"] = stable_id("match", record)
        for side in ("affirmative", "negative"):
            for player in record["players"][side]:
                attendance.append({
                    "id": stable_id("appearance", [record["id"], side, player]),
                    "matchId": record["id"],
                    "competitionName": record["competitionName"],
                    "matchDate": record["matchDate"],
                    "side": side,
                    "player": player,
                    "team": record["teams"][side],
                    "teamId": record["teamIds"][side],
                })
    for honor in honors:
        entity_name = honor["team"] if honor["honorType"] == "player" else honor["recipient"]
        honor["teamId"] = lookup.get(entity_name, "")
        honor["id"] = stable_id("honor", honor)
    return attendance
