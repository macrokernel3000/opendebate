#!/usr/bin/env python3
import csv
import json
import re
import sys
import zipfile
from datetime import datetime
from datetime import timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "data" / "public-data.csv"
XLSX_PATH = ROOT / "data" / "public-data.xlsx"
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


def normalize_date(value):
    value = str(value or "").strip()
    if re.fullmatch(r"\d+(?:\.0+)?", value) and float(value) > 20000:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).strftime("%Y-%m-%d")
    return value


def parse_rows(rows, source_name, default_competition=""):
    records = []
    honors = []
    for line_number, row in enumerate(rows, start=2):
        data_type = text(row, "資料類型")
        competition = text(row, "盃賽") or default_competition
        if not data_type and not competition:
            continue
        if "戰績" in data_type:
            if not competition or not text(row, "正方學校") or not text(row, "反方學校"):
                print(f"略過 {source_name} 第 {line_number} 列：戰績缺少盃賽或隊伍名稱")
                continue
            records.append({
                "competitionName": competition,
                "matchDate": normalize_date(text(row, "日期")),
                "period": number(row.get("時段")),
                "venue": number(row.get("會場")),
                "teams": {"affirmative": text(row, "正方學校"), "negative": text(row, "反方學校")},
                "scores": {"affirmative": number(row.get("正方比分")) or 0, "negative": number(row.get("反方比分")) or 0},
                "winner": text(row, "勝方"),
                "note": text(row, "備註"),
            })
        elif "榮譽" in data_type:
            if not competition or not text(row, "榮譽名稱") or not text(row, "獲獎者"):
                print(f"略過 {source_name} 第 {line_number} 列：榮譽缺少盃賽、名稱或獲獎者")
                continue
            team = text(row, "所屬學校")
            honors.append({
                "competitionName": competition,
                "matchDate": normalize_date(text(row, "日期")),
                "honorName": text(row, "榮譽名稱"),
                "recipient": text(row, "獲獎者"),
                "team": team,
                "honorType": text(row, "榮譽類型") or ("player" if team else "school"),
                "note": text(row, "備註"),
            })
    return records, honors


def load_csv():
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        columns = set(reader.fieldnames or [])
        missing = sorted(REQUIRED_COLUMNS - columns)
        if missing:
            raise SystemExit("CSV 缺少欄位：" + "、".join(missing))
        records, honors = parse_rows(list(reader), CSV_PATH.name)
    return records, honors, CSV_PATH.name


def cell_column(reference):
    letters = re.match(r"[A-Z]+", reference or "")
    result = 0
    for char in letters.group(0) if letters else "":
        result = result * 26 + ord(char) - 64
    return result - 1


def load_xlsx():
    records = []
    honors = []
    with zipfile.ZipFile(XLSX_PATH) as book:
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
                    value = ""
                    if cell_type == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter() if node.tag.endswith("}t"))
                    else:
                        value_node = next((node for node in cell if node.tag.endswith("}v")), None)
                        value = value_node.text if value_node is not None and value_node.text is not None else ""
                        if cell_type == "s" and value:
                            value = shared_strings[int(value)]
                    values[column] = value
                if values:
                    width = max(values) + 1
                    matrix.append([values.get(index, "") for index in range(width)])

            competition = ""
            header_index = None
            headers = []
            for index, row in enumerate(matrix):
                trimmed = [str(value).strip() for value in row]
                if trimmed and trimmed[0] == "賽事名稱":
                    competition = trimmed[1] if len(trimmed) > 1 else ""
                if "資料類型" in trimmed:
                    header_index = index
                    headers = trimmed
                    break
            if header_index is None:
                print(f"略過工作分頁「{sheet_name}」：找不到資料表標題")
                continue
            missing = sorted(REQUIRED_COLUMNS - set(headers))
            if missing:
                raise SystemExit(f"工作分頁「{sheet_name}」缺少欄位：" + "、".join(missing))
            sheet_rows = []
            for row in matrix[header_index + 1:]:
                if not any(str(value).strip() for value in row):
                    continue
                sheet_rows.append({header: str(row[index]).strip() if index < len(row) else "" for index, header in enumerate(headers)})
            sheet_records, sheet_honors = parse_rows(sheet_rows, f"工作分頁「{sheet_name}」", competition)
            records.extend(sheet_records)
            honors.extend(sheet_honors)
            print(f"讀取工作分頁「{sheet_name}」：{len(sheet_records)} 場、{len(sheet_honors)} 筆榮譽")
    return records, honors, XLSX_PATH.name


def build():
    if XLSX_PATH.exists():
        records, honors, source_name = load_xlsx()
    elif CSV_PATH.exists():
        records, honors, source_name = load_csv()
    else:
        raise SystemExit(f"找不到資料檔：請放入 {XLSX_PATH.name} 或 {CSV_PATH.name}")

    if not records and not honors:
        raise SystemExit("資料檔沒有可用的公開戰績或榮譽資料。")

    for index, record in enumerate(records):
        record["id"] = f"sheet-match-{index}"
    for index, honor in enumerate(honors):
        honor["id"] = f"sheet-honor-{index}"

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
    print(f"資料來源：{source_name}")
    print(f"更新完成：{len(records)} 場戰績、{len(honors)} 筆榮譽")
    print(f"網站資料：{JS_PATH}")
    print(f"快取版本：{version}")


if __name__ == "__main__":
    build()
