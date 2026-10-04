#!/usr/bin/env python3
import csv
import hashlib
import json
import math
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

import calendar_feed as calendar_feed_module
import data_validation as data_validation_module
import entity_registry as entity_registry_module
import xlsx_reader as xlsx_reader_module

SCHOOL_ENDINGS = entity_registry_module.SCHOOL_ENDINGS
KNOWN_SCHOOL_SHORT_NAMES = entity_registry_module.KNOWN_SCHOOL_SHORT_NAMES
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
JS_PATH = DATA_DIR / "public-data.js"
REGISTRY_PATH = DATA_DIR / "entity-registry.csv"
REGISTRY_XLSX_PATH = DATA_DIR / "entity-registry.xlsx"
INDEX_PATH = ROOT / "index.html"
REPORT_PATH = DATA_DIR / "update-report.txt"
SITE_CONTENT_PATH = DATA_DIR / "site-content.csv"
EVENT_METADATA_PATH = DATA_DIR / "event-metadata.csv"
SITEMAP_PATH = ROOT / "sitemap.xml"
SEO_PAGE_PATH = ROOT / "debate-records.html"
EVENT_ROSTERS_PATH = DATA_DIR / "event-rosters.csv"

REQUIRED_COLUMNS = {
    "資料類型", "盃賽", "日期", "時段", "會場", "正方學校", "反方學校",
    "正方比分", "反方比分", "勝方", "榮譽名稱", "獲獎者", "所屬學校", "榮譽類型", "備註",
}
OPTIONAL_COLUMNS = {"正方登場選手", "反方登場選手"}
WARNINGS = []
VALID_DATA_TYPES = {"公開戰績", "公開榮譽", "辯題"}


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
        parsed = float(value)
        if not math.isfinite(parsed):
            return ""
        return int(parsed) if parsed.is_integer() else parsed
    except ValueError:
        return ""


def normalize_date(value):
    value = clean(value)
    if re.fullmatch(r"\d+(?:\.0+)?", value) and float(value) > 20000:
        try:
            return (datetime(1899, 12, 30) + timedelta(days=float(value))).strftime("%Y-%m-%d")
        except (OverflowError, ValueError):
            return value
    return value


def checked_date(value, source_name, line_number, field_name):
    raw = clean(value)
    if not raw:
        return ""
    normalized = normalize_date(raw)
    if re.fullmatch(r"\d{4}", normalized):
        return normalized
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", normalized):
        raise SystemExit(
            f"資料錯誤：{source_name} 第 {line_number} 列「{field_name}」日期格式錯誤：{raw}；請使用 YYYY 或 YYYY-MM-DD。"
        )
    try:
        datetime.strptime(normalized, "%Y-%m-%d")
    except ValueError as error:
        raise SystemExit(
            f"資料錯誤：{source_name} 第 {line_number} 列「{field_name}」日期無法辨認：{raw}；請使用 YYYY 或 YYYY-MM-DD。"
        ) from error
    return normalized


def checked_number(value, source_name, line_number, field_name, allow_empty=True, nonnegative=False):
    raw = clean(value)
    if not raw:
        if allow_empty:
            return ""
        raise SystemExit(f"資料錯誤：{source_name} 第 {line_number} 列缺少「{field_name}」。")
    parsed = number(raw)
    if parsed == "":
        raise SystemExit(f"資料錯誤：{source_name} 第 {line_number} 列「{field_name}」不是有效數字：{raw}。")
    if nonnegative and parsed < 0:
        raise SystemExit(f"資料錯誤：{source_name} 第 {line_number} 列「{field_name}」不可為負數：{raw}。")
    return parsed


def normalize_honor_type(value, team):
    value = clean(value).lower()
    if value in {"player", "個人", "個人榮譽", "選手", "選手榮譽"}:
        return "player"
    if value in {"team", "團體", "團體榮譽", "隊伍", "隊伍榮譽", "團隊", "團隊榮譽"}:
        return "team"
    if team:
        return "player"
    return "team"


def split_players(value):
    return [name.strip() for name in re.split(r"[、,，;；|/\n]+", clean(value)) if name.strip()]


def split_topics(value):
    return [topic.strip() for topic in re.split(r"[|\n]+", clean(value)) if topic.strip()]


def topic_entries(competition, topic_value, explanation_value="", source_name="", line_number=None):
    topic_list = split_topics(topic_value)
    explanations = [part.strip() for part in clean(explanation_value).split("|")]
    if len(explanations) > len(topic_list) and any(explanations[len(topic_list):]):
        location = (
            f"{source_name} 第 {line_number} 列"
            if source_name and line_number is not None
            else source_name or "資料來源"
        )
        warn(
            f"題解核對提醒：{location} 有 {len(explanations)} 段題解、"
            f"但只有 {len(topic_list)} 個辯題；多出的題解不會發布，請核對分隔符與原文。"
        )
    return [{
        "competitionName": competition,
        "topic": topic,
        "topicId": stable_id("topic", topic),
        "explanation": explanations[index] if index < len(explanations) else "",
    } for index, topic in enumerate(topic_list) if competition]


def stable_id(prefix, value):
    digest = hashlib.sha1(json.dumps(value, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    return f"{prefix}-{digest}"


def parse_rows(rows, source_name, default_competition=""):
    records, honors, topics = [], [], []
    for ordinal, row in enumerate(rows, start=2):
        line_number = row.get("_source_row", ordinal)
        data_type = clean(row.get("資料類型"))
        competition = clean(row.get("盃賽")) or default_competition
        if not data_type:
            if any(clean(value) for key, value in row.items() if key != "_source_row"):
                raise SystemExit(f"資料錯誤：{source_name} 第 {line_number} 列有內容但缺少「資料類型」。")
            continue
        if data_type not in VALID_DATA_TYPES:
            raise SystemExit(f"資料錯誤：{source_name} 第 {line_number} 列「資料類型」不在支援範圍：{data_type}。")
        topics.extend(topic_entries(
            competition,
            row.get("辯題"),
            row.get("辯題解釋"),
            source_name,
            line_number,
        ))
        if "戰績" in data_type:
            affirmative = clean(row.get("正方學校"))
            negative = clean(row.get("反方學校"))
            if not competition or not affirmative or not negative:
                warn(f"略過 {source_name} 第 {line_number} 列：戰績缺少盃賽或隊伍名稱")
                continue
            affirmative_score = checked_number(row.get("正方比分"), source_name, line_number, "正方比分", nonnegative=True)
            negative_score = checked_number(row.get("反方比分"), source_name, line_number, "反方比分", nonnegative=True)
            if bool(affirmative_score != "") != bool(negative_score != ""):
                raise SystemExit(f"資料錯誤：{source_name} 第 {line_number} 列只填了一方比分；請補齊另一方或清空兩邊比分。")
            record = {
                "competitionName": competition,
                "matchDate": checked_date(row.get("日期"), source_name, line_number, "日期"),
                "period": checked_number(row.get("時段"), source_name, line_number, "時段", nonnegative=True),
                "venue": checked_number(row.get("會場"), source_name, line_number, "會場", nonnegative=True),
                "teams": {"affirmative": affirmative, "negative": negative},
                "scores": {
                    "affirmative": affirmative_score if affirmative_score != "" else None,
                    "negative": negative_score if negative_score != "" else None,
                },
                "winner": clean(row.get("勝方")),
                "note": clean(row.get("備註")),
                "players": {
                    "affirmative": split_players(row.get("正方登場選手")),
                    "negative": split_players(row.get("反方登場選手")),
                },
            }
            group_name = clean(row.get("分組名稱"))
            inference_note = clean(row.get("推定依據"))
            if group_name:
                record["groupName"] = group_name
            if inference_note:
                record["inferenceNote"] = inference_note
            record["_source"] = source_name
            record["_row"] = line_number
            records.append(record)
        elif "榮譽" in data_type:
            honor_name = clean(row.get("榮譽名稱"))
            recipient = clean(row.get("獲獎者"))
            if not competition or not honor_name or not recipient:
                warn(f"略過 {source_name} 第 {line_number} 列：榮譽缺少盃賽、名稱或獲獎者")
                continue
            team = clean(row.get("所屬學校"))
            honor_period = checked_number(row.get("時段"), source_name, line_number, "時段", nonnegative=True)
            honor = {
                "competitionName": competition,
                "matchDate": checked_date(row.get("日期"), source_name, line_number, "日期"),
                "honorName": honor_name,
                "recipient": recipient,
                "team": team,
                "honorType": normalize_honor_type(row.get("榮譽類型"), team),
                "note": clean(row.get("備註")),
            }
            honor_level = clean(row.get("榮譽層級"))
            if honor_level:
                honor["honorLevel"] = honor_level
            if honor_period != "":
                honor["period"] = honor_period
            honors.append(honor)
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


def load_site_content():
    if not SITE_CONTENT_PATH.exists():
        return {}
    with SITE_CONTENT_PATH.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames or not {"key", "value"}.issubset(reader.fieldnames):
            raise SystemExit(f"{SITE_CONTENT_PATH.name} 必須包含 key、value 欄位")
        return {
            clean(row.get("key")): clean(row.get("value"))
            for row in reader
            if clean(row.get("key"))
        }


def load_event_metadata():
    if not EVENT_METADATA_PATH.exists():
        return {}
    with EVENT_METADATA_PATH.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if not reader.fieldnames or "盃賽" not in reader.fieldnames:
            raise SystemExit(f"{EVENT_METADATA_PATH.name} 必須包含盃賽欄位")
        metadata = {}
        for row in reader:
            competition = clean(row.get("盃賽"))
            if not competition:
                continue
            item = {
                "startDate": normalize_date(row.get("開始日期")),
                "endDate": normalize_date(row.get("結束日期")),
                "organizer": clean(row.get("主辦單位")),
                "location": clean(row.get("舉辦地點")),
                "note": clean(row.get("備註")),
                "awardSelectionCriteria": clean(row.get("個人獎遴選標準")),
                "ageRestriction": (
                    True if clean(row.get("年齡限制")).lower() in {"是", "有", "true", "1", "yes", "✓"}
                    else False if clean(row.get("年齡限制")).lower() in {"否", "無", "false", "0", "no"}
                    else None
                ),
            }
            team_limit = number(row.get("簡章滿額隊數"))
            if team_limit:
                item["brochureTeamLimit"] = team_limit
            metadata[competition] = item
        return metadata


def load_event_rosters():
    """Load published team rosters separately from confirmed match appearances."""
    if not EVENT_ROSTERS_PATH.exists():
        return {}
    with EVENT_ROSTERS_PATH.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {"盃賽", "隊伍", "領隊", "選手", "名單狀態", "來源說明"}
        if not reader.fieldnames or not required.issubset(reader.fieldnames):
            raise SystemExit(f"{EVENT_ROSTERS_PATH.name} 必須包含欄位：" + "、".join(sorted(required)))
        rosters = {}
        for line_number, row in enumerate(reader, start=2):
            competition = clean(row.get("盃賽"))
            team = clean(row.get("隊伍"))
            if not competition or not team:
                warn(f"略過 {EVENT_ROSTERS_PATH.name} 第 {line_number} 列：缺少盃賽或隊伍")
                continue
            item = {
                "competitionName": competition,
                "team": team,
                "leaders": split_players(row.get("領隊")),
                "players": split_players(row.get("選手")),
                "status": clean(row.get("名單狀態")) or "公告名單",
                "sourceNote": clean(row.get("來源說明")),
            }
            rosters.setdefault(competition, []).append(item)
        for competition, entries in rosters.items():
            seen = set()
            for entry in entries:
                if entry["team"] in seen:
                    raise SystemExit(f"{EVENT_ROSTERS_PATH.name}：{competition} 的隊伍「{entry['team']}」重複")
                seen.add(entry["team"])
        return rosters


def cell_column(reference):
    return xlsx_reader_module.cell_column(reference)


def load_xlsx(path):
    records, honors, topics = [], [], []
    for sheet_name, matrix, matrix_row_numbers in xlsx_reader_module.read_sheets(path):
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
        for matrix_index, row in enumerate(matrix[header_index + 1:], start=header_index + 1):
            if any(clean(value) for value in row):
                sheet_row = {header: clean(row[index]) if index < len(row) else "" for index, header in enumerate(headers)}
                sheet_row["_source_row"] = matrix_row_numbers[matrix_index]
                sheet_rows.append(sheet_row)
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
    csv_files = sorted(DATA_DIR.glob("public-data*.csv"), key=lambda path: path.name.lower())
    # CSV is the canonical source. XLSX is intentionally opt-in through
    # PUBLIC_DATA_SOURCE so an old workbook cannot silently override or
    # duplicate the maintained CSV dataset.
    return csv_files


def deduplicate(items):
    merged = {}
    for item in items:
        key = json.dumps(item, ensure_ascii=False, sort_keys=True)
        merged[key] = item
    return list(merged.values())


def normalized_entity_name(value):
    return data_validation_module.normalized_entity_name(value)


def normalized_match_team(value):
    return data_validation_module.normalized_match_team(value)


def validate_records(records, registry_entries):
    return data_validation_module.validate_records(records, registry_entries, warn)


def validate_event_metadata_dates(path=EVENT_METADATA_PATH):
    return data_validation_module.validate_event_metadata_dates(path, checked_date)


def entity_base_name(name):
    return entity_registry_module.entity_base_name(name)


def suggested_type(name):
    return entity_registry_module.suggested_type(name)


def read_registry():
    return entity_registry_module.read_registry(REGISTRY_PATH, REGISTRY_XLSX_PATH, warn)


def write_registry(entries):
    return entity_registry_module.write_registry(entries, REGISTRY_PATH)


def build_entities(records, honors, registry_entries=None):
    entries = [dict(entry) for entry in registry_entries] if registry_entries is not None else read_registry()
    return entity_registry_module.build_entities(records, honors, entries, REGISTRY_PATH)


def attach_entities(records, honors, lookup):
    return entity_registry_module.attach_entities(records, honors, lookup, stable_id)


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


def update_seo_files(events, records, honors):
    today = datetime.now().strftime("%Y-%m-%d")
    if SITEMAP_PATH.exists():
        sitemap = SITEMAP_PATH.read_text(encoding="utf-8")
        sitemap = re.sub(r"<lastmod>[^<]+</lastmod>", f"<lastmod>{today}</lastmod>", sitemap)
        SITEMAP_PATH.write_text(sitemap, encoding="utf-8")
    if SEO_PAGE_PATH.exists():
        page = SEO_PAGE_PATH.read_text(encoding="utf-8")
        summary = (
            f'<p id="dataSummary"><strong>目前已收錄 {len(events)} 個辯論賽事、'
            f'{len(records)} 場辯論戰績與 {len(honors)} 筆公開榮譽。</strong>'
            '資料持續依公開賽務資訊更新。</p>'
        )
        page = re.sub(
            r"<!-- DATA_SUMMARY_START -->.*?<!-- DATA_SUMMARY_END -->",
            f"<!-- DATA_SUMMARY_START -->\n      {summary}\n      <!-- DATA_SUMMARY_END -->",
            page,
            flags=re.DOTALL,
        )
        SEO_PAGE_PATH.write_text(page, encoding="utf-8")


def event_names(records, honors, topics):
    return sorted({
        clean(item.get("competitionName"))
        for item in [*records, *honors, *topics]
        if clean(item.get("competitionName"))
    }, key=lambda name: name.lower())


def validate_best_debater_categories(records, honors):
    return data_validation_module.validate_best_debater_categories(records, honors, warn)


def write_update_report(version, sources, events, records, honors, attendance, topics, entities, registry_source, event_rosters):
    lines = [
        f"更新時間：{datetime.now().isoformat(timespec='seconds')}",
        f"快取版本：{version}",
        "",
        "資料來源：" + "、".join(sources),
        f"目前收錄盃賽：{len(events)} 個",
        f"資料筆數：{len(records)} 場戰績、{len(honors)} 筆榮譽、{len(attendance)} 筆登場紀錄、{len(topics)} 筆辯題",
        f"公告隊伍名單：{sum(len(items) for items in event_rosters.values())} 隊（獨立保存，不計入逐場登場紀錄）",
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


def write_calendar_feed():
    return calendar_feed_module.write_calendar_feed(root=ROOT, data_dir=DATA_DIR)


def read_upcoming_events(path=None):
    return calendar_feed_module.read_upcoming_events(path=path, data_dir=DATA_DIR)


def validate_upcoming_events(path=None):
    return calendar_feed_module.validate_upcoming_events(path=path, data_dir=DATA_DIR)


def build(check_only=False, fail_on_warnings=False):
    WARNINGS.clear()
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
    validate_event_metadata_dates()
    validate_upcoming_events()
    registry_entries = read_registry()
    validate_records(records, registry_entries)
    for record in records:
        record.pop("_source", None)
        record.pop("_row", None)
    records, honors, topics = deduplicate(records), deduplicate(honors), deduplicate(topics)
    if not records and not honors:
        raise SystemExit("資料檔沒有可用的公開戰績或榮譽資料。")
    validate_best_debater_categories(records, honors)
    site_content = load_site_content()
    event_metadata = load_event_metadata()
    event_rosters = load_event_rosters()
    if event_rosters:
        sources.append(EVENT_ROSTERS_PATH.name)
    for competition, entries in event_rosters.items():
        match_teams = {
            clean(team)
            for record in records if record["competitionName"] == competition
            for team in record["teams"].values() if clean(team)
        }
        roster_teams = {entry["team"] for entry in entries}
        if match_teams != roster_teams:
            missing = sorted(match_teams - roster_teams)
            additional = sorted(roster_teams - match_teams)
            warn(f"名單核對提醒：{competition} 公布名單與已收錄賽事隊伍不同；未列於名單：{missing}；名單另列：{additional}")

    if check_only:
        events = event_names(records, honors, topics)
        print(f"預檢完成：{len(events)} 個賽事、{len(records)} 場戰績、{len(honors)} 筆榮譽、{len(topics)} 筆辯題。")
        if WARNINGS:
            print(f"資料檢查提醒：{len(WARNINGS)} 則")
            for message in WARNINGS:
                print(f"- {message}")
            if fail_on_warnings:
                raise SystemExit("預檢未通過：請先處理所有提醒，再執行正式建置。")
        else:
            print("資料檢查提醒：沒有")
        return

    entities, lookup = build_entities(records, honors, registry_entries)
    attendance = attach_entities(records, honors, lookup)
    for competition in event_names(records, honors, topics):
        metadata = event_metadata.setdefault(competition, {})
        participating_teams = {
            clean(team)
            for record in records if record["competitionName"] == competition
            for team in record["teams"].values() if clean(team)
        }
        metadata["teamCount"] = len(participating_teams)
        metadata.setdefault("ageRestriction", None)
    payload = {
        "schemaVersion": 5,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "sources": sources,
        "entities": entities,
        "records": records,
        "honors": honors,
        "attendance": attendance,
        "topics": topics,
        "siteContent": site_content,
        "eventMetadata": event_metadata,
        "eventRosters": event_rosters,
    }
    JS_PATH.write_text("window.DEBATE_PUBLIC_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")
    version = datetime.now().strftime("%Y%m%d%H%M%S")
    update_asset_versions(version)
    events = event_names(records, honors, topics)
    update_seo_files(events, records, honors)
    registry_source = REGISTRY_PATH.name if REGISTRY_PATH.exists() else REGISTRY_XLSX_PATH.name
    write_update_report(version, sources, events, records, honors, attendance, topics, entities, registry_source, event_rosters)
    write_calendar_feed()
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
    import argparse

    parser = argparse.ArgumentParser(description="建立網站資料，或只檢查來源資料。")
    parser.add_argument("--check", action="store_true", help="只讀取並檢查來源，不寫入生成檔。")
    parser.add_argument("--fail-on-warnings", action="store_true", help="搭配 --check 使用；有任何提醒時以失敗狀態結束。")
    arguments = parser.parse_args()
    if arguments.fail_on_warnings and not arguments.check:
        parser.error("--fail-on-warnings 必須與 --check 一起使用。")
    build(check_only=arguments.check, fail_on_warnings=arguments.fail_on_warnings)
