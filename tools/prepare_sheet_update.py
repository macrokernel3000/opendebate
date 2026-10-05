#!/usr/bin/env python3
"""Compare generated Google Sheet outputs and prepare a review summary."""

import argparse
import json
import re
import subprocess
from pathlib import Path


GENERATED_FILES = (
    "data/public-data.js",
    "data/update-report.txt",
    "data/entity-registry.csv",
    "index.html",
    "calendar.ics",
    "sitemap.xml",
    "debate-records.html",
)


def normalize_output(path, content):
    """Remove expected build timestamps while retaining meaningful changes."""
    if isinstance(content, bytes):
        content = content.decode("utf-8")

    if path == "data/public-data.js":
        marker = "window.DEBATE_PUBLIC_DATA = "
        if not content.startswith(marker):
            raise ValueError("public-data.js 缺少預期的資料宣告，拒絕略過差異。")
        json_text = content[len(marker):].strip()
        if json_text.endswith(";"):
            json_text = json_text[:-1]
        payload = json.loads(json_text)
        payload.pop("generatedAt", None)
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)

    if path == "data/update-report.txt":
        content = re.sub(r"更新時間：[^\n]+\n", "", content)
        content = re.sub(r"快取版本：[^\n]+\n", "", content)
    elif path == "calendar.ics":
        content = re.sub(r"^DTSTAMP:[^\r\n]+\r?\n", "", content, flags=re.MULTILINE)
    elif path == "sitemap.xml":
        content = re.sub(r"<lastmod>[^<]+</lastmod>", "<lastmod>DATE</lastmod>", content)
    elif path == "index.html":
        content = re.sub(r"\?v=\d+", "?v=<version>", content)
    return content


def has_meaningful_changes(baseline, generated):
    return bool(meaningful_change_paths(baseline, generated))


def meaningful_change_paths(baseline, generated):
    """Return generated files whose normalized output differs from the baseline."""
    return [
        path for path in GENERATED_FILES
        if normalize_output(path, baseline[path]) != normalize_output(path, generated[path])
    ]


def _report_value(pattern, report):
    match = re.search(pattern, report)
    return match.group(1) if match else "未提供"


def create_summary(before_report, after_report):
    before_events = _report_value(r"目前收錄盃賽：([^\n]+)", before_report)
    after_events = _report_value(r"目前收錄盃賽：([^\n]+)", after_report)
    before_counts = _report_value(r"資料筆數：([^\n]+)", before_report)
    after_counts = _report_value(r"資料筆數：([^\n]+)", after_report)
    before_rosters = _report_value(r"公告隊伍名單：([^\n]+)", before_report)
    after_rosters = _report_value(r"公告隊伍名單：([^\n]+)", after_report)
    before_entities = _report_value(r"單位名冊：([^\n]+)", before_report)
    after_entities = _report_value(r"單位名冊：([^\n]+)", after_report)

    lines = [
        "## 試算表匯入差異摘要",
        "",
        "- 資料檢核與網站建置：已通過",
        f"- 收錄賽事：{before_events} → {after_events}",
        f"- 資料筆數：{before_counts} → {after_counts}",
        f"- 公告名單：{before_rosters} → {after_rosters}",
        f"- 單位名冊：{before_entities} → {after_entities}",
        "",
        "### 檢查回報",
    ]
    sections = after_report.split("資料檢查回報：", 1)
    warnings = sections[1].strip().splitlines() if len(sections) == 2 else []
    lines.extend(warnings or ["- 未產生檢查回報"])
    lines.extend(["", "請先檢視檔案差異及網站預覽，再合併以公開更新。"])
    return "\n".join(lines) + "\n"


def compare_with_git(base_ref):
    baseline = {
        path: subprocess.check_output(["git", "show", f"{base_ref}:{path}"])
        for path in GENERATED_FILES
    }
    generated = {path: Path(path).read_bytes() for path in GENERATED_FILES}
    return has_meaningful_changes(baseline, generated)


def main():
    parser = argparse.ArgumentParser(description="準備試算表匯入的審查摘要。")
    parser.add_argument("--base-ref", required=True, help="用來比較的 Git ref，例如 origin/main")
    parser.add_argument("--before-report", required=True, type=Path)
    parser.add_argument("--summary-file", required=True, type=Path)
    parser.add_argument("--github-output", required=True, type=Path)
    parser.add_argument("--step-summary", required=True, type=Path)
    args = parser.parse_args()

    changed = compare_with_git(args.base_ref)
    with args.github_output.open("a", encoding="utf-8") as output:
        output.write(f"has_changes={'true' if changed else 'false'}\n")

    if not changed:
        with args.step_summary.open("a", encoding="utf-8") as summary:
            summary.write("試算表匯入完成，沒有產生實質網站資料變更。\n")
        return

    before = args.before_report.read_text(encoding="utf-8")
    after = Path("data/update-report.txt").read_text(encoding="utf-8")
    content = create_summary(before, after)
    args.summary_file.write_text(content, encoding="utf-8")
    with args.step_summary.open("a", encoding="utf-8") as summary:
        summary.write(content)


if __name__ == "__main__":
    main()
