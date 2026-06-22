#!/usr/bin/env python3
import csv
import hashlib
import json
import os
import re
import zipfile
from datetime import datetime, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
JS_PATH = DATA_DIR / "public-data.js"
REGISTRY_PATH = DATA_DIR / "entity-registry.csv"
REGISTRY_XLSX_PATH = DATA_DIR / "entity-registry.xlsx"
INDEX_PATH = ROOT / "index.html"
REPORT_PATH = DATA_DIR / "update-report.txt"

REQUIRED_COLUMNS = {
    "資料類型", "盃賽", "日期", "時段", "會場", "正方學校", "反方學校",
    "正方比分", "反方比分", "勝方", "榮譽名稱", "獲獎者", "所屬學校", "榮譽類型", "備註",
}
OPTIONAL_COLUMNS = {"正方登場選手", "反方登場選手"}
SCHOOL_ENDINGS = ("高中", "高工", "高商", "高職", "中學", "國中", "國小", "女中", "女高", "一中", "二中", "壢中", "附中", "實中", "護專", "五專", "國中部")
KNOWN_SCHOOL_SHORT_NAMES = {"市立大同", "市立復興", "市立東山", "新北三民", "桃園陽明", "私立東山", "高市三民", "高市中正"}
WARNINGS = []


def warn(message):
    WARNINGS.append(message)
    print(message)


def clean(value):
    return str(value or "").strip()


def number(value):
    value = clean(value)
    if not value:
        return ""
    try:
        return int(float(value))
    except ValueError:
        return ""


def normalize_date(value):
    value = clean(value)
    if re.fullmatch(r"\d+(?:\.0+)?", value) and float(value) > 20000:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).strftime("%Y-%m-%d")
    return value


def normalize_honor_type(value, team):
    value = clean(value).lower()
    if value in {"player", "個人", "個人榮譽", "選手", "選手榮譽"} or team:
        return "player"
    return "team"


def split_players(value):
    return [name.strip() for name in re.split(r"[、,，;；|/\n]+", clean(value)) if name.strip()]


def split_topics(value):
    return [topic.strip() for topic in re.split(r"[|\n]+", clean(value)) if topic.strip()]


def topic_entries(competition, topic_value, explanation_value=""):
    topic_list = split_topics(topic_value)
    explanations = split_topics(explanation_value)
    return [{
        "competitionName": competition,
        "topic": topic,
        "explanation": explanations[index] if index < len(explanations) else "",
    } for index, topic in enumerate(topic_list) if competition]


def stable_id(prefix, value):
    digest = hashlib.sha1(json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def parse_rows(rows, source_name, default_competition=""):
    records, honors, topics = [], [], []
    for line_number, row in enumerate(rows, start=2):
        data_type = clean(row.get("資料類型"))
        competition = clean(row.get("盃賽")) or default_competition
        topics.extend(topic_entries(competition, row.get("辯題"), row.get("辯題解釋")))
        if not data_type and not competition:
            continue
        if "戰績" in data_type:
            affirmative = clean(row.get("正方學校"))
            negative = clean(row.get("反方學校"))
            if not competition or not affirmative or not negative:
                warn(f"略過 {source_name} 第 {line_number} 列：戰績缺少盃賽或隊伍名稱")
                continue
            records.append({
                "competitionName": competition,
                "matchDate": normalize_date(row.get("日期")),
                "period": number(row.get("時段")),
                "venue": number(row.get("會場")),
                "teams": {"affirmative": affirmative, "negative": negative},
                "scores": {"affirmative": number(row.get("正方比分")) or 0, "negative": number(row.get("反方比分")) or 0},
                "winner": clean(row.get("勝方")),
                "note": clean(row.get("備註")),
                "players": {
                    "affirmative": split_players(row.get("正方登場選手")),
                    "negative": split_players(row.get("反方登場選手")),
                },
            })
        elif "榮譽" in data_type:
            honor_name = clean(row.get("榮譽名稱"))
            recipient = clean(row.get("獲獎者"))
            if not competition or not honor_name or not recipient:
                warn(f"略過 {source_name} 第 {line_number} 列：榮譽缺少盃賽、名稱或獲獎者")
                continue
            team = clean(row.get("所屬學校"))
            honors.append({
                "competitionName": competition,
                "matchDate": normalize_date(row.get("日期")),
                "honorName": honor_name,
                "recipient": recipient,
                "team": team,
                "honorType": normalize_honor_type(row.get("榮譽類型"), team),
                "note": clean(row.get("備註")),
            })
    return records, honors, topics


def validate_headers(headers, label):
    missing = sorted(REQUIRED_COLUMNS - set(headers))
    if missing:
        raise SystemExit(f"{label} 缺少欄位：" + "、".join(missing))


def load_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        validate_headers(reader.fieldnames or [], f"CSV「{path.name}」")
        return (*parse_rows(list(reader), f"CSV「{path.name}」"), path.name)


def cell_column(reference):
    letters = re.match(r"[A-Z]+", reference or "")
    result = 0
    for char in letters.group(0) if letters else "":
        result = result * 26 + ord(char) - 64
    return result - 1


def load_xlsx(path):
    records, honors, topics = [], [], []
    with zipfile.ZipFile(path) as book:
        shared_strings = []
        if "xl/sharedStrings.xml" in book.namelist():
            root = ET.fromstring(book.read("xl/sharedStrings.xml"))
            shared_strings = ["".join(node.text or "" for node in item.iter() if node.tag.endswith("}t")) for item in root]
        rels_root = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
        relationships = {item.attrib["Id"]: item.attrib["Target"] for item in rels_root}
        workbook_root = ET.fromstring(book.read("xl/workbook.xml"))
        relation_key = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        for sheet in workbook_root.iter():
            if not sheet.tag.endswith("}sheet"):
                continue
            sheet_name = sheet.attrib.get("name", "未命名分頁")
            target = relationships.get(sheet.attrib.get(relation_key, ""), "")
            if not target:
                continue
            clean_target = target.lstrip("/")
            sheet_path = clean_target if clean_target.startswith("xl/") else "xl/" + clean_target
            sheet_root = ET.fromstring(book.read(sheet_path))
            matrix = []
            for row_node in sheet_root.iter():
                if not row_node.tag.endswith("}row"):
                    continue
                values = {}
                for cell in row_node:
                    if not cell.tag.endswith("}c"):
                        continue
                    column = cell_column(cell.attrib.get("r", ""))
                    cell_type = cell.attrib.get("t", "")
                    if cell_type == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter() if node.tag.endswith("}t"))
                    else:
                        value_node = next((node for node in cell if node.tag.endswith("}v")), None)
                        value = value_node.text if value_node is not None and value_node.text is not None else ""
                        if cell_type == "s" and value:
                            value = shared_strings[int(value)]
                    values[column] = value
                if values:
                    matrix.append([values.get(index, "") for index in range(max(values) + 1)])
            competition, header_index, headers, sheet_topic_rows = "", None, [], {}
            for index, row in enumerate(matrix):
                trimmed = [clean(value) for value in row]
                if trimmed and trimmed[0] == "賽事名稱":
                    competition = trimmed[1] if len(trimmed) > 1 else ""
                topic_match = re.fullmatch(r"辯題(\d*)", trimmed[0] if trimmed else "")
                explanation_match = re.fullmatch(r"辯題解釋(\d*)", trimmed[0] if trimmed else "")
                if topic_match:
                    key = topic_match.group(1) or str(index)
                    sheet_topic_rows.setdefault(key, {})["topic"] = trimmed[1] if len(trimmed) > 1 else ""
                    if len(trimmed) > 3 and trimmed[2] in {"解釋", "辯題解釋"}:
                        sheet_topic_rows[key]["explanation"] = trimmed[3]
                elif explanation_match:
                    key = explanation_match.group(1) or str(index)
                    sheet_topic_rows.setdefault(key, {})["explanation"] = trimmed[1] if len(trimmed) > 1 else ""
                if "資料類型" in trimmed:
                    header_index, headers = index, trimmed
                    break
            label = f"{path.name}／{sheet_name}"
            if header_index is None:
                warn(f"略過工作分頁「{label}」：找不到資料表標題")
                continue
            validate_headers(headers, f"工作分頁「{label}」")
            sheet_rows = []
            for row in matrix[header_index + 1:]:
                if any(clean(value) for value in row):
                    sheet_rows.append({header: clean(row[index]) if index < len(row) else "" for index, header in enumerate(headers)})
            sheet_records, sheet_honors, row_topics = parse_rows(sheet_rows, f"工作分頁「{label}」", competition)
            records.extend(sheet_records)
            honors.extend(sheet_honors)
            sheet_topics = []
            for item in sheet_topic_rows.values():
                sheet_topics.extend(topic_entries(competition, item.get("topic", ""), item.get("explanation", "")))
            topics.extend(sheet_topics)
            topics.extend(row_topics)
            print(f"讀取工作分頁「{label}」：{len(sheet_records)} 場、{len(sheet_honors)} 筆榮譽、{len(sheet_topics) + len(row_topics)} 筆辯題")
    return records, honors, topics, path.name


def source_files():
    explicit_sources = os.environ.get("PUBLIC_DATA_SOURCE", "").strip()
    if explicit_sources:
        paths = []
        for source in explicit_sources.split(os.pathsep):
            path = Path(source)
            if not path.is_absolute():
                path = ROOT / path
            paths.append(path)
        return paths
    xlsx = sorted(DATA_DIR.glob("public-data*.xlsx"), key=lambda path: path.name.lower())
    csv_files = sorted(DATA_DIR.glob("public-data*.csv"), key=lambda path: path.name.lower())
    if xlsx:
        csv_files = [path for path in csv_files if path.name.lower() != "public-data.csv"]
    return xlsx + csv_files


def deduplicate(items):
    merged = {}
    for item in items:
        key = json.dumps(item, ensure_ascii=False, sort_keys=True)
        merged[key] = item
    return list(merged.values())


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


def read_registry():
    entries = []
    source_name = REGISTRY_PATH.name
    if REGISTRY_XLSX_PATH.exists():
        source_name = REGISTRY_XLSX_PATH.name
        with zipfile.ZipFile(REGISTRY_XLSX_PATH) as book:
            shared_strings = []
            if "xl/sharedStrings.xml" in book.namelist():
                root = ET.fromstring(book.read("xl/sharedStrings.xml"))
                shared_strings = ["".join(node.text or "" for node in item.iter() if node.tag.endswith("}t")) for item in root]
            workbook_root = ET.fromstring(book.read("xl/workbook.xml"))
            rels_root = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
            relationships = {item.attrib["Id"]: item.attrib["Target"] for item in rels_root}
            relation_key = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            sheet = next((item for item in workbook_root.iter() if item.tag.endswith("}sheet")), None)
            if sheet is None:
                raise SystemExit("entity-registry.xlsx 找不到工作分頁")
            target = relationships.get(sheet.attrib.get(relation_key, ""), "").lstrip("/")
            sheet_path = target if target.startswith("xl/") else "xl/" + target
            sheet_root = ET.fromstring(book.read(sheet_path))
            matrix = []
            for row_node in sheet_root.iter():
                if not row_node.tag.endswith("}row"):
                    continue
                values = {}
                for cell in row_node:
                    if not cell.tag.endswith("}c"):
                        continue
                    column = cell_column(cell.attrib.get("r", ""))
                    cell_type = cell.attrib.get("t", "")
                    if cell_type == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter() if node.tag.endswith("}t"))
                    else:
                        value_node = next((node for node in cell if node.tag.endswith("}v")), None)
                        value = value_node.text if value_node is not None and value_node.text is not None else ""
                        if cell_type == "s" and value:
                            value = shared_strings[int(value)]
                    values[column] = clean(value)
                if values:
                    matrix.append([values.get(index, "") for index in range(max(values) + 1)])
        header_index = next((index for index, row in enumerate(matrix) if {"code", "type", "name", "aliases"}.issubset(set(row))), None)
        if header_index is None:
            raise SystemExit("entity-registry.xlsx 缺少 code、type、name、aliases 標題")
        headers = matrix[header_index]
        for row in matrix[header_index + 1:]:
            item = {header: clean(row[index]) if index < len(row) else "" for index, header in enumerate(headers)}
            if item.get("name"):
                entries.append({key: clean(item.get(key)) for key in ("code", "type", "name", "aliases")})
    elif REGISTRY_PATH.exists():
        with REGISTRY_PATH.open("r", encoding="utf-8-sig", newline="") as source:
            for row in csv.DictReader(source):
                if clean(row.get("name")):
                    entries.append({key: clean(row.get(key)) for key in ("code", "type", "name", "aliases")})
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
            normalized = re.sub(r"\s+", "", name).lower()
            if normalized in seen_names and seen_names[normalized] != entry["code"]:
                warn(f"提醒：{source_name} 的名稱或別名重複：{name}；正式名稱會優先，別名衝突時保留先出現的歸戶")
            else:
                seen_names[normalized] = entry["code"]
    return entries


def write_registry(entries):
    with REGISTRY_PATH.open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=["code", "type", "name", "aliases"])
        writer.writeheader()
        writer.writerows(entries)


def build_entities(records, honors):
    raw_names = set()
    for record in records:
        raw_names.update(record["teams"].values())
    for honor in honors:
        if honor["team"]:
            raw_names.add(honor["team"])
        elif honor["honorType"] == "team":
            raw_names.add(honor["recipient"])

    entries = read_registry()
    alias_lookup = {entry["name"]: entry for entry in entries}
    for entry in entries:
        for alias in entry["aliases"].split("|"):
            if clean(alias):
                alias_lookup.setdefault(clean(alias), entry)

    grouped = {}
    for name in sorted(raw_names):
        if not name:
            continue
        if name in alias_lookup:
            continue
        base = entity_base_name(name)
        grouped.setdefault(base, []).append(name)

    used_codes = {entry["code"] for entry in entries}
    counters = {prefix: max([int(code[1:]) for code in used_codes if re.fullmatch(prefix + r"\d{3}", code)] or [0]) for prefix in "spu"}
    for base, names in grouped.items():
        entity_type = suggested_type(base)
        counters[entity_type] += 1
        code = f"{entity_type}{counters[entity_type]:03d}"
        entry = {"code": code, "type": entity_type, "name": base, "aliases": "|".join(name for name in names if name != base)}
        entries.append(entry)
        for name in names:
            alias_lookup[name] = entry

    entries.sort(key=lambda entry: entry["code"])
    write_registry(entries)
    lookup = {entry["name"]: entry["code"] for entry in entries}
    for entry in entries:
        for alias in entry["aliases"].split("|"):
            if clean(alias):
                lookup.setdefault(clean(alias), entry["code"])
    return entries, lookup


def attach_entities(records, honors, lookup):
    attendance = []
    for record in records:
        record["teamIds"] = {side: lookup.get(name, "") for side, name in record["teams"].items()}
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


def update_asset_versions(version):
    index_html = INDEX_PATH.read_text(encoding="utf-8")
    patterns = [
        (r'(src="data/public-data\.js)(?:\?v=[^"]*)?(" data-public-data-script)', rf'\1?v={version}\2'),
        (r'(href="styles\.css)(?:\?v=[^"]*)?(" data-versioned-asset)', rf'\1?v={version}\2'),
        (r'(src="(?:js/[^"?]+|app\.js))(?:\?v=[^"]*)?(" data-versioned-asset)', rf'\1?v={version}\2'),
    ]
    for pattern, replacement in patterns:
        index_html = re.sub(pattern, replacement, index_html)
    INDEX_PATH.write_text(index_html, encoding="utf-8")


def event_names(records, honors, topics):
    return sorted({
        clean(item.get("competitionName"))
        for item in [*records, *honors, *topics]
        if clean(item.get("competitionName"))
    }, key=lambda name: name.lower())


def write_update_report(version, sources, events, records, honors, attendance, topics, entities, registry_source):
    lines = [
        f"更新時間：{datetime.now().isoformat(timespec='seconds')}",
        f"快取版本：{version}",
        "",
        "資料來源：" + "、".join(sources),
        f"目前收錄盃賽：{len(events)} 個",
        f"資料筆數：{len(records)} 場戰績、{len(honors)} 筆榮譽、{len(attendance)} 筆登場紀錄、{len(topics)} 筆辯題",
        f"單位名冊：{len(entities)} 筆（來源 {registry_source}，已同步 {REGISTRY_PATH.name}）",
        "",
        "盃賽清單：",
        *[f"- {name}" for name in events],
        "",
        "資料檢查回報：",
    ]
    if WARNINGS:
        lines.extend(f"- {message}" for message in WARNINGS)
    else:
        lines.append("- 本次沒有略過資料或提醒項目。")
    REPORT_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build():
    paths = source_files()
    if not paths:
        raise SystemExit("找不到資料檔：請在 data 資料夾放入 public-data 開頭的 .xlsx 或 .csv")
    records, honors, topics, sources = [], [], [], []
    for path in paths:
        loader = load_xlsx if path.suffix.lower() == ".xlsx" else load_csv
        source_records, source_honors, source_topics, source_name = loader(path)
        records.extend(source_records)
        honors.extend(source_honors)
        topics.extend(source_topics)
        sources.append(source_name)
    records, honors, topics = deduplicate(records), deduplicate(honors), deduplicate(topics)
    if not records and not honors:
        raise SystemExit("資料檔沒有可用的公開戰績或榮譽資料。")
    entities, lookup = build_entities(records, honors)
    attendance = attach_entities(records, honors, lookup)
    payload = {
        "schemaVersion": 4,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sources": sources,
        "entities": entities,
        "records": records,
        "honors": honors,
        "attendance": attendance,
        "topics": topics,
    }
    JS_PATH.write_text("window.DEBATE_PUBLIC_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    version = datetime.now().strftime("%Y%m%d%H%M%S")
    update_asset_versions(version)
    events = event_names(records, honors, topics)
    registry_source = REGISTRY_XLSX_PATH.name if REGISTRY_XLSX_PATH.exists() else REGISTRY_PATH.name
    write_update_report(version, sources, events, records, honors, attendance, topics, entities, registry_source)
    print("資料來源：" + "、".join(sources))
    print(f"目前收錄盃賽：{len(events)} 個")
    print(f"更新完成：{len(records)} 場戰績、{len(honors)} 筆榮譽、{len(attendance)} 筆登場紀錄、{len(topics)} 筆辯題")
    print(f"單位名冊：{len(entities)} 筆（來源 {registry_source}，已同步 {REGISTRY_PATH.name}）")
    if WARNINGS:
        print(f"資料檢查回報：{len(WARNINGS)} 則，已寫入 {REPORT_PATH.relative_to(ROOT)}")
    else:
        print(f"資料檢查回報：沒有略過資料或提醒項目，摘要已寫入 {REPORT_PATH.relative_to(ROOT)}")
    print(f"快取版本：{version}")


if __name__ == "__main__":
    build()
