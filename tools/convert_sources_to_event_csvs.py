#!/usr/bin/env python3
"""Convert public-data XLSX/CSV sources into one canonical CSV per competition."""

import argparse
import csv
import importlib.util
import re
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BUILD_DATA_PATH = ROOT / "tools" / "build_data.py"
HEADERS = [
    "資料類型", "盃賽", "日期", "時段", "會場", "正方學校", "反方學校",
    "正方比分", "反方比分", "勝方", "榮譽名稱", "獲獎者", "所屬學校",
    "榮譽類型", "備註", "正方登場選手", "反方登場選手", "辯題", "辯題解釋",
]


def load_build_data():
    spec = importlib.util.spec_from_file_location("public_data_builder", BUILD_DATA_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def safe_filename(name):
    cleaned = re.sub(r'[\\/:*?"<>|]+', "-", name).strip().strip(".")
    return f"public-data-{cleaned}.csv"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", nargs="+")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--rename", action="append", default=[], metavar="OLD=NEW")
    args = parser.parse_args()

    rename_map = {}
    for item in args.rename:
        old, separator, new = item.partition("=")
        if not separator or not old.strip() or not new.strip():
            raise SystemExit(f"無效的賽事更名：{item}")
        rename_map[old.strip()] = new.strip()

    build_data = load_build_data()
    grouped = defaultdict(lambda: {"records": [], "honors": [], "topics": []})
    for source_name in args.sources:
        source = Path(source_name).resolve()
        loader = build_data.load_xlsx if source.suffix.lower() == ".xlsx" else build_data.load_csv
        records, honors, topics, _ = loader(source)
        for kind, items in (("records", records), ("honors", honors), ("topics", topics)):
            for item in items:
                original = item.get("competitionName", "").strip()
                competition = rename_map.get(original, original)
                if competition:
                    normalized = dict(item)
                    normalized["competitionName"] = competition
                    grouped[competition][kind].append(normalized)

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    for existing in output_dir.glob("public-data-*.csv"):
        existing.unlink()

    for competition in sorted(grouped):
        payload = grouped[competition]
        rows = []
        for record in payload["records"]:
            rows.append({
                "資料類型": "公開戰績",
                "盃賽": competition,
                "日期": record.get("matchDate", ""),
                "時段": record.get("period", ""),
                "會場": record.get("venue", ""),
                "正方學校": record.get("teams", {}).get("affirmative", ""),
                "反方學校": record.get("teams", {}).get("negative", ""),
                "正方比分": record.get("scores", {}).get("affirmative", ""),
                "反方比分": record.get("scores", {}).get("negative", ""),
                "勝方": record.get("winner", ""),
                "備註": record.get("note", ""),
                "正方登場選手": "、".join(record.get("players", {}).get("affirmative", [])),
                "反方登場選手": "、".join(record.get("players", {}).get("negative", [])),
            })
        for honor in payload["honors"]:
            rows.append({
                "資料類型": "公開榮譽",
                "盃賽": competition,
                "日期": honor.get("matchDate", ""),
                "榮譽名稱": honor.get("honorName", ""),
                "獲獎者": honor.get("recipient", ""),
                "所屬學校": honor.get("team", ""),
                "榮譽類型": "個人榮譽" if honor.get("honorType") == "player" else "隊伍榮譽",
                "備註": honor.get("note", ""),
            })
        for topic in payload["topics"]:
            rows.append({
                "資料類型": "辯題",
                "盃賽": competition,
                "辯題": topic.get("topic", ""),
                "辯題解釋": topic.get("explanation", ""),
            })

        target = output_dir / safe_filename(competition)
        with target.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=HEADERS)
            writer.writeheader()
            writer.writerows(rows)
        print(f"{target.name}：{len(payload['records'])} 場、{len(payload['honors'])} 筆榮譽、{len(payload['topics'])} 筆辯題")


if __name__ == "__main__":
    main()
