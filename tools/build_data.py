#!/usr/bin/env python3
import csv
import json
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "public-data.csv"
JS_PATH = ROOT / "data" / "public-data.js"
INDEX_PATH = ROOT / "index.html"

REQUIRED_COLUMNS = {
    "資料類型", "盃賽", "日期", "時段", "會場", "正方學校", "反方學校",
    "正方比分", "反方比分", "勝方", "榮譽名稱", "獲獎者", "所屬學校", "榮譽類型", "備註",
}


def text(row, key):
    return (row.get(key) or "").strip()


def number(value):
    value = (value or "").strip()
    if not value:
        return ""
    try:
        return int(float(value))
    except ValueError:
        return ""


def build():
    if not CSV_PATH.exists():
        raise SystemExit(f"找不到資料檔：{CSV_PATH}")

    records = []
    honors = []
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        columns = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_COLUMNS - columns)
        if missing:
            raise SystemExit("CSV 缺少欄位：" + "、".join(missing))

        for line_number, row in enumerate(reader, start=2):
            data_type = text(row, "資料類型")
            competition = text(row, "盃賽")
            if not data_type and not competition:
                continue
            if "戰績" in data_type:
                if not competition or not text(row, "正方學校") or not text(row, "反方學校"):
                    print(f"略過第 {line_number} 列：戰績缺少盃賽或隊伍名稱")
                    continue
                records.append({
                    "id": f"csv-match-{len(records)}",
                    "competitionName": competition,
                    "matchDate": text(row, "日期"),
                    "period": number(row.get("時段")),
                    "venue": number(row.get("會場")),
                    "teams": {"affirmative": text(row, "正方學校"), "negative": text(row, "反方學校")},
                    "scores": {"affirmative": number(row.get("正方比分")) or 0, "negative": number(row.get("反方比分")) or 0},
                    "winner": text(row, "勝方"),
                    "note": text(row, "備註"),
                })
            elif "榮譽" in data_type:
                if not competition or not text(row, "榮譽名稱") or not text(row, "獲獎者"):
                    print(f"略過第 {line_number} 列：榮譽缺少盃賽、名稱或獲獎者")
                    continue
                team = text(row, "所屬學校")
                honors.append({
                    "id": f"csv-honor-{len(honors)}",
                    "competitionName": competition,
                    "matchDate": text(row, "日期"),
                    "honorName": text(row, "榮譽名稱"),
                    "recipient": text(row, "獲獎者"),
                    "team": team,
                    "honorType": text(row, "榮譽類型") or ("player" if team else "school"),
                    "note": text(row, "備註"),
                })

    if not records and not honors:
        raise SystemExit("CSV 沒有可用的公開戰績或榮譽資料。")

    payload = {"records": records, "honors": honors}
    output = "window.DEBATE_PUBLIC_DATA = " + json.dumps(payload, ensure_ascii=False, indent=2) + ";\n"
    JS_PATH.write_text(output, encoding="utf-8")
    index_html = INDEX_PATH.read_text(encoding="utf-8")
    version = datetime.now().strftime("%Y%m%d%H%M%S")
    index_html, data_replacements = re.subn(
        r'(src="data/public-data\.js)(?:\?v=[^"]*)?(" data-public-data-script)',
        rf'\1?v={version}\2',
        index_html,
        count=1,
    )
    index_html, style_replacements = re.subn(
        r'(href="styles\.css)(?:\?v=[^"]*)?(" data-versioned-asset)',
        rf'\1?v={version}\2',
        index_html,
        count=1,
    )
    index_html, app_replacements = re.subn(
        r'(src="app\.js)(?:\?v=[^"]*)?(" data-versioned-asset)',
        rf'\1?v={version}\2',
        index_html,
        count=1,
    )
    if (data_replacements, style_replacements, app_replacements) != (1, 1, 1):
        raise SystemExit("找不到 index.html 的公開資料版本標記，網站資料未更新。")
    INDEX_PATH.write_text(index_html, encoding="utf-8")
    print(f"更新完成：{len(records)} 場戰績、{len(honors)} 筆榮譽")
    print(f"網站資料：{JS_PATH}")
    print(f"快取版本：{version}")


if __name__ == "__main__":
    build()
