#!/usr/bin/env python3
"""Fail when committed website artifacts do not match the current data sources."""

import argparse
import subprocess
from pathlib import Path

from prepare_sheet_update import GENERATED_FILES, meaningful_change_paths


def main():
    parser = argparse.ArgumentParser(description="檢查已提交的網站生成檔是否與來源一致。")
    parser.add_argument("--base-ref", default="HEAD", help="比較的已提交版本，預設為 HEAD。")
    args = parser.parse_args()

    baseline = {
        path: subprocess.check_output(["git", "show", f"{args.base_ref}:{path}"])
        for path in GENERATED_FILES
    }
    generated = {path: Path(path).read_bytes() for path in GENERATED_FILES}
    changed = meaningful_change_paths(baseline, generated)
    if changed:
        print("已提交的網站生成檔與目前來源重建結果不一致：")
        for path in changed:
            print(f"- {path}")
        print("請先執行 `python tools/build_data.py`，檢視生成差異後一併提交。")
        raise SystemExit(1)

    print("網站生成檔與目前來源一致（已忽略建置時間和快取版本變化）。")


if __name__ == "__main__":
    main()
