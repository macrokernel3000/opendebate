import os
import sys
import unittest
import tempfile
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import build_data


class BuildDataTests(unittest.TestCase):
    def test_event_metadata_dates_are_optional(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "event-metadata.csv"
            with patch.object(build_data, "EVENT_METADATA_PATH", path):
                path.write_text("盃賽,主辦單位,舉辦地點,備註\n舊盃賽,,,\n", encoding="utf-8")
                legacy = build_data.load_event_metadata()["舊盃賽"]
                self.assertEqual(legacy["startDate"], "")
                self.assertEqual(legacy["endDate"], "")
                path.write_text("盃賽,開始日期,結束日期\n新盃賽,2026-09-11,2026-09-14\n", encoding="utf-8")
                current = build_data.load_event_metadata()["新盃賽"]
                self.assertEqual(current["startDate"], "2026-09-11")
                self.assertEqual(current["endDate"], "2026-09-14")

    def test_number_normalizes_numeric_values(self):
        self.assertEqual(build_data.number("12.0"), 12)
        self.assertEqual(build_data.number("3.5"), 3.5)
        self.assertEqual(build_data.number("不是數字"), "")
        self.assertEqual(build_data.number("NaN"), "")
        self.assertEqual(build_data.number("Infinity"), "")

    def test_checked_number_reports_source_location(self):
        with self.assertRaisesRegex(SystemExit, "來源.csv 第 4 列「正方比分」不是有效數字"):
            build_data.checked_number("三分", "來源.csv", 4, "正方比分")

    def test_checked_date_rejects_impossible_calendar_date(self):
        with self.assertRaisesRegex(SystemExit, "來源.csv 第 5 列「日期」日期無法辨認"):
            build_data.checked_date("2026-02-30", "來源.csv", 5, "日期")

    def test_parse_rows_rejects_partial_scores_and_unknown_data_type(self):
        row = {column: "" for column in build_data.REQUIRED_COLUMNS | build_data.OPTIONAL_COLUMNS}
        row.update({"資料類型": "公開戰績", "盃賽": "測試盃", "正方學校": "甲校", "反方學校": "乙校", "正方比分": "2"})
        with self.assertRaisesRegex(SystemExit, "只填了一方比分"):
            build_data.parse_rows([row], "來源.csv")
        row["資料類型"] = "公開賽果"
        with self.assertRaisesRegex(SystemExit, "資料類型」不在支援範圍"):
            build_data.parse_rows([row], "來源.csv")

    def test_validate_records_accepts_team_and_side_winners_but_flags_score_conflicts(self):
        record = {
            "competitionName": "測試盃",
            "teams": {"affirmative": "甲校", "negative": "乙校"},
            "winner": "正方勝",
            "scores": {"affirmative": 1, "negative": 2},
            "_source": "來源.csv",
            "_row": 6,
        }
        with patch.object(build_data, "WARNINGS", []):
            build_data.validate_records([record], [])
            self.assertEqual(len(build_data.WARNINGS), 1)
            self.assertIn("來源.csv 第 6 列", build_data.WARNINGS[0])
        record["winner"] = "乙校"
        record["scores"] = {"affirmative": 2, "negative": 2}
        with patch.object(build_data, "WARNINGS", []):
            build_data.validate_records([record], [])
            self.assertEqual(build_data.WARNINGS, [])

    def test_validate_records_rejects_winner_not_in_match(self):
        record = {
            "competitionName": "測試盃",
            "teams": {"affirmative": "甲校", "negative": "乙校"},
            "winner": "丙校",
            "scores": {"affirmative": None, "negative": None},
            "_source": "來源.csv",
            "_row": 7,
        }
        with self.assertRaisesRegex(SystemExit, "勝方「丙校」不是正方隊伍"):
            build_data.validate_records([record], [])

    def test_validate_records_warns_for_repeated_scheduled_match(self):
        records = [
            {
                "competitionName": "測試盃", "matchDate": "2026-10-01", "period": 1, "venue": 2,
                "teams": {"affirmative": "台中女中", "negative": "甲校"},
                "scores": {"affirmative": 2, "negative": 1}, "winner": "正方勝",
                "_source": "來源.csv", "_row": row,
            }
            for row in (3, 4)
        ]
        records[1]["teams"]["affirmative"] = "臺中 女中"
        with patch.object(build_data, "WARNINGS", []):
            build_data.validate_records(records, [])
            self.assertEqual(len(build_data.WARNINGS), 1)
            self.assertIn("疑似重複場次", build_data.WARNINGS[0])

    def test_duplicate_match_check_preserves_school_team_suffixes(self):
        records = []
        for row, team in ((3, "桃園高中A"), (4, "桃園高中B")):
            records.append({
                "competitionName": "測試盃", "matchDate": "2026-10-01", "period": 1, "venue": 2,
                "teams": {"affirmative": team, "negative": "甲校"},
                "scores": {"affirmative": 2, "negative": 1}, "winner": team,
                "_source": "來源.csv", "_row": row,
            })
        with patch.object(build_data, "WARNINGS", []):
            build_data.validate_records(records, [])
            self.assertEqual(build_data.WARNINGS, [])

    def test_normalize_date_accepts_excel_serial_date(self):
        self.assertEqual(build_data.normalize_date("46023"), "2026-01-01")

    def test_topic_entries_align_explanations(self):
        result = build_data.topic_entries("測試盃", "題目一|題目二", "說明一|說明二")
        self.assertEqual(result[1]["topic"], "題目二")
        self.assertEqual(result[1]["explanation"], "說明二")

    def test_upcoming_event_validation_checks_dates_and_key_dates(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "upcoming-events.js"
            path.write_text(
                'window.DEBATE_UPCOMING_EVENTS = [{"id":"test","name":"測試盃",'
                '"startDate":"2026-11-01","endDate":"2026-10-31",'
                '"keyDates":[{"label":"報名","date":"2026-10-20","time":"24:00"}]}];',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(SystemExit, "結束日期早於開始日期"):
                build_data.validate_upcoming_events(path)
            path.write_text(
                'window.DEBATE_UPCOMING_EVENTS = [{"id":"test","name":"測試盃",'
                '"startDate":"2026-10-30","keyDates":[{"label":"報名",'
                '"date":"2026-10-20","time":"24:00"}]}];',
                encoding="utf-8",
            )
            with self.assertRaisesRegex(SystemExit, "時間格式錯誤"):
                build_data.validate_upcoming_events(path)

    def test_calendar_feed_escapes_and_folds_utf8_lines(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            data_dir = root / "data"
            data_dir.mkdir()
            path = data_dir / "upcoming-events.js"
            path.write_text(
                'window.DEBATE_UPCOMING_EVENTS = [{"id":"feed-test","name":"測試盃,甲隊",'
                '"startDate":"2999-10-30","endDate":"2999-10-31",'
                '"location":"臺北;會議室","organizer":"' + "主辦單位" * 20 + '"}];',
                encoding="utf-8",
            )
            with patch.object(build_data, "DATA_DIR", data_dir), patch.object(build_data, "ROOT", root):
                build_data.write_calendar_feed()
            content = (root / "calendar.ics").read_bytes()
            self.assertNotIn(b"\n", content.replace(b"\r\n", b""))
            lines = content.split(b"\r\n")
            self.assertTrue(all(len(line) <= 75 for line in lines))
            self.assertIn("SUMMARY:測試盃\\,甲隊".encode(), content)
            self.assertIn("LOCATION:臺北\\;會議室".encode(), content)
            self.assertIn(b"END:VCALENDAR", content)

    def test_csv_is_default_source(self):
        old = os.environ.pop("PUBLIC_DATA_SOURCE", None)
        try:
            self.assertTrue(all(path.suffix.lower() == ".csv" for path in build_data.source_files()))
        finally:
            if old is not None:
                os.environ["PUBLIC_DATA_SOURCE"] = old

    def test_best_debater_count_warns_when_label_may_be_full_course(self):
        with patch.object(build_data, "WARNINGS", []):
            records = [{"competitionName": "測試盃"} for _ in range(12)]
            honors = [{"competitionName": "測試盃", "honorName": "單場最佳辯士"}]
            build_data.validate_best_debater_categories(records, honors)
            self.assertEqual(len(build_data.WARNINGS), 1)
            self.assertIn("是否應列為全程最佳辯士", build_data.WARNINGS[0])

    def test_best_debater_count_does_not_warn_for_many_awards(self):
        with patch.object(build_data, "WARNINGS", []):
            records = [{"competitionName": "測試盃"} for _ in range(12)]
            honors = [{"competitionName": "測試盃", "honorName": "單場最佳辯士"} for _ in range(5)]
            build_data.validate_best_debater_categories(records, honors)
            self.assertEqual(build_data.WARNINGS, [])


if __name__ == "__main__":
    unittest.main()
