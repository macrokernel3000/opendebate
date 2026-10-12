#!/usr/bin/env python3
"""Combine per-event public CSV files into one canonical, editable CSV."""

import argparse
import csv
import os
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
HEADERS = [
    "資料類型", "盃賽", "日期", "時段", "會場", "正方學校", "反方學校",
    "正方比分", "反方比分", "勝方", "榮譽名稱", "獲獎者", "所屬學校",
    "榮譽類型", "備註", "正方登場選手", "反方登場選手", "辯題", "辯題解釋",
    "分組名稱", "榮譽層級", "推定依據", "來源名稱", "來源網址", "資料ID",
]

LEGACY_GROUP_LABELS = {
    "2025「青聲說」全國高中職辯論賽": {
        "A", "B", "C", "D", "E", "F", "G",
        "甲", "乙", "丙", "丁", "戊", "己", "庚", "辛",
        "高", "雄", "青", "年",
    },
}


def normalize_legacy_group_fields(row):
    """Move known legacy group labels out of notes without losing real notes."""
    if "戰績" not in row["資料類型"] or row["分組名稱"]:
        return row
    note_parts = [part.strip() for part in row["備註"].split("；")]
    if not note_parts or note_parts[0] not in LEGACY_GROUP_LABELS.get(row["盃賽"], set()):
        return row
    row["分組名稱"] = note_parts[0]
    row["備註"] = "；".join(part for part in note_parts[1:] if part)
    return row


def source_files(source_dir, output):
    return [
        path for path in sorted(source_dir.glob("public-data*.csv"), key=lambda item: item.name.lower())
        if path.resolve() != output.resolve()
    ]


def read_rows(paths):
    rows = []
    for path in paths:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            headers = reader.fieldnames or []
            if len(headers) != len(set(headers)):
                raise SystemExit(f"{path.name} 含有重複表頭，無法安全合併。")
            unknown = sorted(set(headers) - set(HEADERS))
            missing = sorted(set(HEADERS[:15]) - set(headers))
            if unknown:
                raise SystemExit(f"{path.name} 有總表不認得的欄位：{'、'.join(unknown)}")
            if missing:
                raise SystemExit(f"{path.name} 缺少必要欄位：{'、'.join(missing)}")
            for line_number, row in enumerate(reader, start=2):
                if None in row:
                    raise SystemExit(f"{path.name} 第 {line_number} 列有超出表頭的欄位，無法安全合併。")
                normalized = {header: (row.get(header) or "").strip() for header in HEADERS}
                if not any(normalized.values()):
                    continue
                if not normalized["資料類型"]:
                    raise SystemExit(f"{path.name} 第 {line_number} 列有內容但缺少資料類型。")
                rows.append(normalize_legacy_group_fields(normalized))
    return rows


def write_atomic(output, rows):
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{output.name}.", dir=output.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=HEADERS)
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temporary_name, output)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def main():
    parser = argparse.ArgumentParser(description="把逐賽事 CSV 合併成網站使用的單一總表。")
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    sources = source_files(args.source_dir.resolve(), args.output.resolve())
    if not sources:
        raise SystemExit("找不到可合併的 public-data CSV。")
    rows = read_rows(sources)
    if not rows:
        raise SystemExit("來源 CSV 沒有可合併的資料列。")
    write_atomic(args.output.resolve(), rows)
    print(f"已合併 {len(sources)} 個 CSV、{len(rows)} 列資料：{args.output.resolve()}")


if __name__ == "__main__":
    main()
