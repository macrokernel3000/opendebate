#!/usr/bin/env python3
"""Read CSV and XLSX source files, delegating row interpretation to the builder."""

import csv
import re

import xlsx_reader


def validate_headers(headers, label, required_columns):
    missing = sorted(required_columns - set(headers))
    if missing:
        raise SystemExit(f"{label} 缺少欄位：" + "、".join(missing))


def load_csv(path, required_columns, parse_rows):
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        validate_headers(reader.fieldnames or [], f"CSV「{path.name}」", required_columns)
        return (*parse_rows(list(reader), f"CSV「{path.name}」"), path.name)


def load_xlsx(path, *, clean, warn, required_columns, parse_rows, topic_entries):
    records, honors, topics = [], [], []
    for sheet_name, matrix, matrix_row_numbers in xlsx_reader.read_sheets(path):
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
        validate_headers(headers, f"工作分頁「{label}」", required_columns)
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
            sheet_topics.extend(topic_entries(competition, item.get("topic", ""), item.get("explanation", ""), label))
        topics.extend(sheet_topics)
        topics.extend(row_topics)
        print(f"讀取工作分頁「{label}」：{len(sheet_records)} 場、{len(sheet_honors)} 筆榮譽、{len(sheet_topics) + len(row_topics)} 筆辯題")
    return records, honors, topics, path.name
