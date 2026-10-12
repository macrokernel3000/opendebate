#!/usr/bin/env python3
"""Import one reviewed future-tournament CSV, without manufacturing historical results.

The CSV is a review input, not the authoritative website source. Only this
script converts it into upcoming-events.js and canonical registry/metadata.
"""
import argparse
import csv
import hashlib
import io
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse

import calendar_feed

ROOT = Path(__file__).resolve().parent.parent
UPCOMING_PATH = ROOT / "data/upcoming-events.js"
REGISTRY_PATH = ROOT / "data/competition-registry.csv"
METADATA_PATH = ROOT / "data/event-metadata.csv"
PREFIX = "// Source traceability status is maintained in docs/近期賽事來源核對.md; source links are not displayed on the website.\nwindow.DEBATE_UPCOMING_EVENTS = "
COLUMNS = {
    "開始日期": "startDate", "結束日期": "endDate",
    "舉辦地點": "location", "主辦單位": "organizer",
    "辯題": "topic", "辯題解釋": "topicNote",
    "公告網址": "sourceUrl", "報名網址": "registrationUrl",
    "活動說明": "note",
}
REQUIRED = {"資料類型", "盃賽", "開始日期", "結束日期", "舉辦地點", "主辦單位", "賽事ID", "賽事代碼", "公告網址"}


def parse_date(value, label):
    try:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError()
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"{label} 必須是 YYYY-MM-DD：{value!r}") from None


def read_csv(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED.difference(reader.fieldnames or [])
        if missing:
            raise ValueError("未來賽事 CSV 缺少欄位：" + "、".join(sorted(missing)))
        rows = [
            {key: str(value or "").strip() for key, value in row.items() if key is not None}
            for row in reader if any(str(x or "").strip() for x in row.values())
        ]
    if len(rows) != 1:
        raise ValueError("未來賽事每份 CSV 必須剛好一筆；不同賽事請各存一份。")
    if rows[0]["資料類型"] != "未來賽事":
        raise ValueError("資料類型必須是「未來賽事」；歷史戰績請使用 public-data-*.csv")
    return rows[0]


def csv_rows(path):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def csv_output(headers, rows):
    result = io.StringIO(newline="")
    writer = csv.DictWriter(result, fieldnames=headers, lineterminator="\n", extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    return "\ufeff" + result.getvalue()


def next_code(registry, year):
    available = [int(item["registrationSequence"]) for item in registry
                 if item.get("year") == year and item.get("registrationSequence", "").isdigit()]
    seq = max(available, default=0) + 1
    if seq > 99:
        raise ValueError(f"{year} 賽事編號已滿，請人工確認")
    return f"C{year[2:]}{seq:02d}", seq


def prepare(source, data_dir=None):
    data_dir = Path(data_dir) if data_dir else ROOT / "data"
    row = read_csv(Path(source))
    name = row["盃賽"]
    if not name:
        raise ValueError("請填寫完整正式賽事名稱")
    start = parse_date(row["開始日期"], "開始日期")
    end = parse_date(row["結束日期"], "結束日期")
    if end < start:
        raise ValueError("結束日期早於開始日期")
    if row["日期"] and parse_date(row["日期"], "日期") != start:
        raise ValueError("「日期」與「開始日期」不一致")
    if not row["舉辦地點"]:
        raise ValueError("舉辦地點不可空白；未知請先保留在待審資料")
    if not row["主辦單位"]:
        raise ValueError("主辦單位不可空白；未知請先保留在待審資料")

    existing = calendar_feed.read_upcoming_events(data_dir=data_dir)
    reg_path = data_dir / "competition-registry.csv"
    meta_path = data_dir / "event-metadata.csv"
    reg_headers, registry = csv_rows(reg_path)
    meta_headers, metadata = csv_rows(meta_path)

    matches = [i for i, item in enumerate(existing)
               if item.get("name") == name or
               (row["賽事ID"] and item.get("id") == row["賽事ID"])]
    if len(matches) > 1:
        raise ValueError("賽事名稱和 ID 指向不同既存活動，請人工確認")
    index = matches[0] if matches else None
    old = existing[index] if index is not None else {}
    if old and old["name"] != name:
        raise ValueError("既有 ID 的名稱不同，不能直接改名或重配")
    if old and row["賽事ID"] and old.get("id") != row["賽事ID"]:
        raise ValueError("賽事 ID 不能修改")

    reg_matches = [entry for entry in registry if entry["name"] == name]
    code = reg_matches[0]["code"] if reg_matches else None
    if reg_matches and reg_matches[0].get("status") == "results-recorded":
        raise ValueError("此賽事已轉入已收錄戰績，不能用未來資料 CSV 覆蓋")
    if code and row["賽事代碼"] and row["賽事代碼"] != code:
        raise ValueError("賽事代碼不符正式名冊")
    if not code:
        expected, seq = next_code(registry, str(start.year))
        provided = row["賽事代碼"]
        if provided and provided != expected:
            raise ValueError(f"新賽事代碼須為本年度下一個可用值 {expected}，或留空自動配發")
        code = expected
        registry.append({
            "code": code, "name": name, "year": str(start.year),
            "registrationSequence": str(seq), "registeredAt": date.today().isoformat(),
            "registrationSource": f"CSV review: {Path(source).name}",
            "registrationBasis": "Reviewed future-event announcement",
            "legacyIds": "", "status": "upcoming"
        })

    event_id = old.get("id") or row["賽事ID"] or (
        f"future-{start.year}-" + hashlib.sha256(name.encode("utf-8")).hexdigest()[:12]
    )
    if not old and any(x.get("id") == event_id for x in existing):
        raise ValueError("賽事 ID 已被其他賽事使用")
    if not old and not row["公告網址"]:
        raise ValueError("新賽事必須填公告來源網址供審核")
    updated = dict(old)
    updated.update({"id": event_id, "name": name, "competitionCode": code})
    for column, field in COLUMNS.items():
        value = row.get(column, "")
        if value:
            if field in ("sourceUrl", "registrationUrl"):
                url = urlparse(value)
                if url.scheme != "https" or not url.netloc:
                    raise ValueError(f"{column} 必須是完整 https 網址")
            updated[field] = value
    updated["startDate"] = start.isoformat()
    updated["endDate"] = end.isoformat()
    if index is not None:
        existing[index] = updated
    else:
        existing.append(updated)

    meta_matches = [i for i, m in enumerate(metadata) if m["盃賽"] == name]
    if len(meta_matches) > 1:
        raise ValueError("賽事 metadata 有重複名稱")
    if meta_matches:
        meta = dict(metadata[meta_matches[0]])
    else:
        meta = dict.fromkeys(meta_headers, "")
    meta.update({"盃賽": name, "開始日期": start.isoformat(), "結束日期": end.isoformat(),
                 "主辦單位": row["主辦單位"], "舉辦地點": row["舉辦地點"]})
    if meta_matches:
        metadata[meta_matches[0]] = meta
    else:
        metadata.append(meta)

    existing.sort(key=lambda item: (item.get("startDate", ""), item.get("id", "")))
    future_js = PREFIX + json.dumps(existing, ensure_ascii=False, indent=2) + ";\n"
    # Validate the final merged document before writing any canonical file.
    import tempfile
    with tempfile.TemporaryDirectory() as scratch:
        path = Path(scratch) / "upcoming-events.js"
        path.write_text(future_js, encoding="utf-8")
        calendar_feed.validate_upcoming_events(path)
    return {
        data_dir / "upcoming-events.js": future_js,
        reg_path: csv_output(reg_headers, registry),
        meta_path: csv_output(meta_headers, metadata),
    }, {"name": name, "code": code, "id": event_id, "mode": "update" if old else "new"}


def main():
    parser = argparse.ArgumentParser(description="審核後匯入未來賽事 CSV（不會產生歷史賽果）")
    parser.add_argument("source", type=Path)
    parser.add_argument("--apply", action="store_true", help="實際寫入網站公開來源")
    args = parser.parse_args()
    try:
        outputs, info = prepare(args.source)
    except (ValueError, OSError, SystemExit) as exc:
        print(f"未來賽事匯入失敗：{exc}", file=sys.stderr)
        raise SystemExit(1) from None
    print(f"已驗證{info['mode']}賽事：{info['name']} / {info['code']} / {info['id']}")
    if args.apply:
        for path, output in outputs.items():
            path.write_text(output, encoding="utf-8")
        print("未來賽事來源已更新；請繼續執行網站資料建置與驗收")
    else:
        print("這是唯讀預檢，正式匯入請加 --apply")


if __name__ == "__main__":
    main()
