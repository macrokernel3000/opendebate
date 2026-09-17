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

    def test_normalize_date_accepts_excel_serial_date(self):
        self.assertEqual(build_data.normalize_date("46023"), "2026-01-01")

    def test_topic_entries_align_explanations(self):
        result = build_data.topic_entries("測試盃", "題目一|題目二", "說明一|說明二")
        self.assertEqual(result[1]["topic"], "題目二")
        self.assertEqual(result[1]["explanation"], "說明二")

    def test_csv_is_default_source(self):
        old = os.environ.pop("PUBLIC_DATA_SOURCE", None)
        try:
            self.assertTrue(all(path.suffix.lower() == ".csv" for path in build_data.source_files()))
        finally:
            if old is not None:
                os.environ["PUBLIC_DATA_SOURCE"] = old


if __name__ == "__main__":
    unittest.main()
