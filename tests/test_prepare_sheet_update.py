import json
import unittest

from tools.prepare_sheet_update import (
    GENERATED_FILES,
    create_summary,
    has_meaningful_changes,
    meaningful_change_paths,
)


def generated_files(public_data=None, report="report", index="index", calendar="calendar", sitemap="sitemap"):
    files = {path: "same" for path in GENERATED_FILES}
    files.update({
        "data/public-data.js": "window.DEBATE_PUBLIC_DATA = " + json.dumps(
            public_data or {"records": [{"score": 1}], "generatedAt": "2026-10-05T10:00:00"}
        ) + ";\n",
        "data/update-report.txt": report,
        "index.html": index,
        "calendar.ics": calendar,
        "sitemap.xml": sitemap,
    })
    return files


class PrepareSheetUpdateTests(unittest.TestCase):
    def test_ignores_generated_timestamps_and_cache_versions(self):
        baseline = generated_files(
            report="更新時間：10:00\n快取版本：1\n資料筆數：1場",
            index='<script src="data/public-data.js?v=1"></script>',
            calendar="BEGIN:VEVENT\r\nDTSTAMP:20261005T100000Z\r\nSUMMARY:test\r\nEND:VEVENT\r\n",
            sitemap="<lastmod>2026-10-04</lastmod>",
        )
        updated = generated_files(
            report="更新時間：11:00\n快取版本：2\n資料筆數：1場",
            index='<script src="data/public-data.js?v=2"></script>',
            calendar="BEGIN:VEVENT\r\nDTSTAMP:20261005T110000Z\r\nSUMMARY:test\r\nEND:VEVENT\r\n",
            sitemap="<lastmod>2026-10-05</lastmod>",
        )
        self.assertFalse(has_meaningful_changes(baseline, updated))

    def test_detects_public_data_change_even_when_totals_match(self):
        before = generated_files(public_data={"records": [{"score": 1}], "generatedAt": "old"})
        after = generated_files(public_data={"records": [{"score": 2}], "generatedAt": "new"})
        self.assertTrue(has_meaningful_changes(before, after))

    def test_detects_other_generated_file_change(self):
        before = generated_files()
        after = generated_files()
        after["debate-records.html"] = "updated summary"
        self.assertTrue(has_meaningful_changes(before, after))

    def test_reports_exact_stale_generated_files(self):
        before = generated_files()
        after = generated_files()
        after["data/public-data.js"] = after["data/public-data.js"].replace('"score": 1', '"score": 2')
        after["calendar.ics"] = "updated calendar"
        self.assertEqual(
            meaningful_change_paths(before, after),
            ["data/public-data.js", "calendar.ics"],
        )

    def test_summary_contains_before_and_after_counts_and_warnings(self):
        before = "目前收錄盃賽：4 個\n資料筆數：10 場\n公告隊伍名單：2 隊\n單位名冊：8 筆"
        after = "目前收錄盃賽：5 個\n資料筆數：11 場\n公告隊伍名單：3 隊\n單位名冊：9 筆\n資料檢查回報：\n- 請核對來源"
        summary = create_summary(before, after)
        self.assertIn("4 個 → 5 個", summary)
        self.assertIn("10 場 → 11 場", summary)
        self.assertIn("- 請核對來源", summary)


if __name__ == "__main__":
    unittest.main()
