#!/usr/bin/env python3
"""Stamp legacy public match/honor IDs onto a newly consolidated CSV.

The legacy public-data.js is read from stdin so migration can use an immutable
Git blob without creating a second working copy. This is a one-time migration
guard; later edits retain the explicit ID already stored in the master CSV.
"""

import argparse
import csv
import json
import os
import sys
import tempfile
from pathlib import Path


PREFIX = "window.DEBATE_PUBLIC_DATA = "


def read_legacy(stream):
    source = stream.read().strip()
    if not source.startswith(PREFIX) or not source.endswith(";"):
        raise SystemExit("舊 public-data.js 格式無法辨識。")
    payload = json.loads(source[len(PREFIX):-1])
    return payload.get("records", []), payload.get("honors", [])


def same_match(row, item):
    teams = item.get("teams", {})
    return (
        row.get("盃賽", "").strip() == item.get("competitionName", "")
        and row.get("正方學校", "").strip() == teams.get("affirmative", "")
        and row.get("反方學校", "").strip() == teams.get("negative", "")
    )


def same_honor(row, item):
    return (
        row.get("盃賽", "").strip() == item.get("competitionName", "")
        and row.get("榮譽名稱", "").strip() == item.get("honorName", "")
        and row.get("獲獎者", "").strip() == item.get("recipient", "")
    )


def stamp(path, records, honors):
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        rows = list(reader)
    if "資料ID" not in headers:
        headers.append("資料ID")

    record_index = honor_index = 0
    for line_number, row in enumerate(rows, start=2):
        data_type = (row.get("資料類型") or "").strip()
        if "戰績" in data_type:
            if record_index >= len(records) or not same_match(row, records[record_index]):
                raise SystemExit(f"總表第 {line_number} 列與舊戰績順序不符，停止寫入 ID。")
            row["資料ID"] = records[record_index]["id"]
            record_index += 1
        elif "榮譽" in data_type:
            if honor_index >= len(honors) or not same_honor(row, honors[honor_index]):
                raise SystemExit(f"總表第 {line_number} 列與舊榮譽順序不符，停止寫入 ID。")
            row["資料ID"] = honors[honor_index]["id"]
            honor_index += 1
        else:
            row["資料ID"] = (row.get("資料ID") or "").strip()

    if record_index != len(records) or honor_index != len(honors):
        raise SystemExit(
            f"ID 數量不符：戰績 {record_index}/{len(records)}，榮譽 {honor_index}/{len(honors)}。"
        )

    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)
        os.replace(temporary_name, path)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def main():
    parser = argparse.ArgumentParser(description="將舊公開 ID 寫入合併後賽事總表。")
    parser.add_argument("master", type=Path)
    args = parser.parse_args()
    records, honors = read_legacy(sys.stdin)
    stamp(args.master.resolve(), records, honors)
    print(f"已保留 {len(records)} 個戰績 ID、{len(honors)} 個榮譽 ID。")


if __name__ == "__main__":
    main()
