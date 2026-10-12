import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import import_upcoming_csv as importer


class FutureCSVImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.dir = Path(self.temp.name)
        self.data = self.dir / "data"
        self.data.mkdir()
        self.name = "第二屆論衡盃全國高中職辯論比賽"
        self.event = {
            "id": "lunheng-2",
            "name": self.name,
            "startDate": "2026-10-24",
            "endDate": "2026-10-25",
            "location": "原始場地",
            "organizer": "原主辦",
            "competitionCode": "C2631",
            "keyDates": [{"label": "保險期限", "date": "2026-10-23", "time": "23:59"}],
            "scheduleImage": {"src": "assets/test.jpg"},
        }
        (self.data / "upcoming-events.js").write_text(
            importer.PREFIX + json.dumps([self.event], ensure_ascii=False) + ";\n",
            encoding="utf-8",
        )
        self.registry_headers = [
            "code", "name", "year", "registrationSequence", "registeredAt",
            "registrationSource", "registrationBasis", "legacyIds", "status",
        ]
        self.metadata_headers = [
            "盃賽", "主辦單位", "舉辦地點", "備註", "開始日期", "結束日期",
            "年齡限制", "簡章滿額隊數", "個人獎遴選標準", "執行單位",
        ]
        self.write_csv(self.data / "competition-registry.csv", self.registry_headers, [
            {"code": "C2631", "name": self.name, "year": "2026",
             "registrationSequence": "31", "status": "upcoming"}
        ])
        self.write_csv(self.data / "event-metadata.csv", self.metadata_headers, [
            {"盃賽": self.name, "主辦單位": "原主辦", "舉辦地點": "原始場地",
             "開始日期": "2026-10-24", "結束日期": "2026-10-25"}
        ])
        self.columns = [
            "資料類型", "盃賽", "日期", "辯題", "辯題解釋", "備註",
            "開始日期", "結束日期", "舉辦地點", "主辦單位",
            "賽事ID", "賽事代碼", "公告網址", "報名網址", "活動說明",
        ]
        self.csv = self.dir / "upcoming-data-lunheng.csv"
        self.csv_row = {
            "資料類型": "未來賽事", "盃賽": self.name, "日期": "2026-10-24",
            "辯題": "我國普通刑法應廢除死刑",
            "辯題解釋": "正取隊伍投票選出",
            "開始日期": "2026-10-24", "結束日期": "2026-10-25",
            "舉辦地點": "新版場地", "主辦單位": "新版主辦",
            "賽事ID": "lunheng-2", "賽事代碼": "C2631",
            "公告網址": "https://example.com/announcement",
        }
        self.write_csv(self.csv, self.columns, [self.csv_row])

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def write_csv(path, headers, rows):
        with path.open("w", encoding="utf-8-sig", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)

    def test_example_updates_only_public_future_fields_and_preserves_schedule(self):
        outputs, status = importer.prepare(self.csv, self.data)
        self.assertEqual(status["mode"], "update")
        self.assertEqual(status["code"], "C2631")
        event = json.loads(outputs[self.data / "upcoming-events.js"].split("=", 1)[1].rstrip(";\n"))[0]
        self.assertEqual(event["topic"], self.csv_row["辯題"])
        self.assertEqual(event["location"], "新版場地")
        self.assertEqual(event["id"], "lunheng-2")
        self.assertEqual(event["keyDates"], self.event["keyDates"])
        self.assertEqual(event["scheduleImage"], self.event["scheduleImage"])
        # Dry run: source files remain unchanged until the user applies.
        self.assertIn("原始場地", (self.data / "upcoming-events.js").read_text())

    def test_empty_optional_cells_keep_existing_public_info(self):
        self.csv_row["辯題"] = ""
        self.csv_row["活動說明"] = ""
        self.write_csv(self.csv, self.columns, [self.csv_row])
        outputs, _ = importer.prepare(self.csv, self.data)
        event = json.loads(outputs[self.data / "upcoming-events.js"].split("=", 1)[1].rstrip(";\n"))[0]
        self.assertNotIn("topic", event)
        self.assertNotIn("note", event)

    def test_rejects_unknown_historical_data_or_reassigned_id(self):
        self.csv_row["資料類型"] = "公開戰績"
        self.write_csv(self.csv, self.columns, [self.csv_row])
        with self.assertRaisesRegex(ValueError, "未來賽事"):
            importer.prepare(self.csv, self.data)
        self.csv_row["資料類型"] = "未來賽事"
        self.csv_row["賽事ID"] = "other-event"
        self.write_csv(self.csv, self.columns, [self.csv_row])
        with self.assertRaisesRegex(ValueError, "賽事 ID"):
            importer.prepare(self.csv, self.data)

    def test_new_future_event_requires_source_and_allocates_next_stable_code(self):
        self.csv_row.update({
            "盃賽": "2026新示範盃", "賽事ID": "", "賽事代碼": "",
            "公告網址": "",
        })
        self.write_csv(self.csv, self.columns, [self.csv_row])
        with self.assertRaisesRegex(ValueError, "公告來源"):
            importer.prepare(self.csv, self.data)
        self.csv_row["公告網址"] = "https://example.com/rules"
        self.write_csv(self.csv, self.columns, [self.csv_row])
        outputs, status = importer.prepare(self.csv, self.data)
        self.assertEqual(status["mode"], "new")
        self.assertEqual(status["code"], "C2632")
        self.assertTrue(status["id"].startswith("future-2026-"))
        self.assertIn("C2632", outputs[self.data / "competition-registry.csv"])
        self.assertIn("2026新示範盃", outputs[self.data / "event-metadata.csv"])

    def test_rejects_invalid_dates_without_touching_sources(self):
        self.csv_row["結束日期"] = "2026-10-01"
        self.write_csv(self.csv, self.columns, [self.csv_row])
        original = (self.data / "upcoming-events.js").read_bytes()
        with self.assertRaisesRegex(ValueError, "早於"):
            importer.prepare(self.csv, self.data)
        self.assertEqual(original, (self.data / "upcoming-events.js").read_bytes())


if __name__ == "__main__":
    unittest.main()
