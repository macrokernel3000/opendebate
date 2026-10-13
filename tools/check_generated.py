#!/usr/bin/env python3
"""Fail when committed website artifacts do not match the current data sources."""

import argparse
import subprocess
import sys
from pathlib import Path

from prepare_sheet_update import GENERATED_FILES, meaningful_change_paths


ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description="檢查已提交的網站生成檔是否與來源一致。")
    parser.add_argument("--base-ref", default="HEAD", help="比較的已提交版本，預設為 HEAD。")
    parser.add_argument(
        "--skip-rebuild",
        action="store_true",
        help="只供已在同一程序明確重建過的流程使用；一般人工與 Agent 驗收不可省略重建。",
    )
    args = parser.parse_args()

    original = {path: (ROOT / path).read_bytes() for path in GENERATED_FILES}
    if not args.skip_rebuild:
        subprocess.run([sys.executable, str(ROOT / "tools/build_data.py")], cwd=ROOT, check=True)

    baseline = {
        path: subprocess.check_output(["git", "show", f"{args.base_ref}:{path}"], cwd=ROOT)
        for path in GENERATED_FILES
    }
    generated = {path: (ROOT / path).read_bytes() for path in GENERATED_FILES}
    changed = meaningful_change_paths(baseline, generated)
    if changed:
        print("已提交的網站生成檔與目前來源重建結果不一致：")
        for path in changed:
            print(f"- {path}")
        print("請先執行 `python tools/build_data.py`，檢視生成差異後一併提交。")
        raise SystemExit(1)

    # A successful check may have refreshed timestamps and cache-busting values.
    # Put back the exact committed bytes so verification itself leaves a clean
    # working tree.  On failure, keep the rebuilt output for inspection.
    if not args.skip_rebuild:
        for path, content in original.items():
            (ROOT / path).write_bytes(content)

    print("網站生成檔與目前來源一致（已忽略建置時間和快取版本變化）。")


if __name__ == "__main__":
    main()
