import os
import json
import sys
import unittest
import tempfile
import zipfile
from xml.sax.saxutils import escape
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import build_data


class BuildDataTests(unittest.TestCase):
    def test_upcoming_event_script_gets_a_fresh_asset_version(self):
        with tempfile.TemporaryDirectory() as folder:
            index_path = Path(folder) / "index.html"
            index_path.write_text(
                '<script src="data/public-data.js?v=old" data-public-data-script></script>'
                '<script src="data/upcoming-events.js?v=old" data-versioned-asset></script>'
                '<script src="data/calendar-activities.js?v=old" data-versioned-asset></script>'
                '<script src="js/core.js?v=old" data-versioned-asset></script>'
                '<link rel="stylesheet" href="styles.css?v=old" data-versioned-asset>',
                encoding="utf-8",
            )
            with patch.object(build_data, "INDEX_PATH", index_path):
                build_data.update_asset_versions("fresh-version")

            html = index_path.read_text(encoding="utf-8")
            self.assertIn('src="data/public-data.js?v=fresh-version"', html)
            self.assertIn('src="data/upcoming-events.js?v=fresh-version"', html)
            self.assertIn('src="data/calendar-activities.js?v=fresh-version"', html)
            self.assertIn('src="js/core.js?v=fresh-version"', html)
            self.assertIn('href="styles.css?v=fresh-version"', html)

    def test_public_json_keeps_records_on_readable_compact_lines(self):
        payload = {
            "records": [
                {"competitionName": "測試盃", "teams": {"affirmative": "甲校", "negative": "乙校"}},
                {"competitionName": "另一盃", "teams": {"affirmative": "丙校", "negative": "丁校"}},
            ],
            "eventMetadata": {"測試盃": {"venue": "測試場地"}},
        }
        formatted = build_data.format_public_json(payload)
        self.assertEqual(json.loads(formatted), payload)
        self.assertIn('    {"competitionName": "測試盃", "teams": {"affirmative": "甲校", "negative": "乙校"}}', formatted)
        self.assertLess(len(formatted), len(json.dumps(payload, ensure_ascii=False, indent=2)))

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

    def test_xlsx_errors_report_physical_worksheet_row(self):
        def column_name(index):
            result = ""
            while index:
                index, remainder = divmod(index - 1, 26)
                result = chr(65 + remainder) + result
            return result

        def worksheet_row(row_number, values):
            cells = []
            for index, value in enumerate(values, start=1):
                if value:
                    cells.append(
                        f'<c r="{column_name(index)}{row_number}" t="inlineStr">'
                        f'<is><t>{escape(str(value))}</t></is></c>'
                    )
            return f'<row r="{row_number}">{"".join(cells)}</row>'

        headers = sorted(build_data.REQUIRED_COLUMNS | build_data.OPTIONAL_COLUMNS)
        row_values = {header: "" for header in headers}
        row_values.update({
            "資料類型": "公開戰績",
            "盃賽": "測試盃",
            "正方學校": "甲校",
            "反方學校": "乙校",
            "勝方": "丙校",
        })
        header_xml = worksheet_row(5, headers)
        data_xml = worksheet_row(22, [row_values[header] for header in headers])
        workbook_xml = (
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="測試賽事" sheetId="1" r:id="rId1"/></sheets></workbook>'
        )
        relationships_xml = (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="worksheet" Target="/xl/worksheets/sheet1.xml"/>'
            '</Relationships>'
        )
        worksheet_xml = (
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            f'<sheetData>{header_xml}{data_xml}</sheetData></worksheet>'
        )

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "source.xlsx"
            with zipfile.ZipFile(path, "w") as book:
                book.writestr("xl/workbook.xml", workbook_xml)
                book.writestr("xl/_rels/workbook.xml.rels", relationships_xml)
                book.writestr("xl/worksheets/sheet1.xml", worksheet_xml)
            records, _, _, _ = build_data.load_xlsx(path)

        with self.assertRaisesRegex(SystemExit, "第 22 列 的勝方「丙校」"):
            build_data.validate_records(records, [])

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

    def test_topic_entries_warn_when_explanation_has_no_matching_topic(self):
        row = {column: "" for column in build_data.REQUIRED_COLUMNS | build_data.OPTIONAL_COLUMNS}
        row.update({
            "資料類型": "公開戰績",
            "盃賽": "測試盃",
            "正方學校": "甲校",
            "反方學校": "乙校",
            "辯題": "題目一",
            "辯題解釋": "說明一|多出的說明",
        })
        with patch.object(build_data, "WARNINGS", []):
            build_data.parse_rows([row], "來源.csv")
            self.assertEqual(len(build_data.WARNINGS), 1)
            self.assertIn("來源.csv 第 2 列", build_data.WARNINGS[0])
            self.assertIn("多出的題解不會發布", build_data.WARNINGS[0])

    def test_topic_entries_allows_blank_explanation_slots(self):
        with patch.object(build_data, "WARNINGS", []):
            build_data.topic_entries("測試盃", "題目一", "說明一|")
            self.assertEqual(build_data.WARNINGS, [])

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

    def test_school_team_aliases_share_one_entity_without_losing_match_names(self):
        records = [
            {
                "competitionName": "測試盃",
                "matchDate": "2026-01-01",
                "teams": {"affirmative": "測試高中A", "negative": "對手高中"},
                "players": {"affirmative": [], "negative": []},
            },
            {
                "competitionName": "測試盃",
                "matchDate": "2026-01-02",
                "teams": {"affirmative": "測試高中B", "negative": "另一所高中"},
                "players": {"affirmative": [], "negative": []},
            },
        ]
        registry = [{"code": "s001", "type": "s", "name": "測試高中", "aliases": "測試高中A|測試高中B"}]
        with tempfile.TemporaryDirectory() as folder, patch.object(build_data, "REGISTRY_PATH", Path(folder) / "entity-registry.csv"):
            entries, lookup = build_data.build_entities(records, [], registry)
            build_data.attach_entities(records, [], lookup)

        self.assertEqual(lookup["測試高中A"], "s001")
        self.assertEqual(lookup["測試高中B"], "s001")
        self.assertEqual([record["teamIds"]["affirmative"] for record in records], ["s001", "s001"])
        self.assertEqual([record["teams"]["affirmative"] for record in records], ["測試高中A", "測試高中B"])
        self.assertEqual(sum(entry["name"] == "測試高中" for entry in entries), 1)

    def test_entity_building_reuses_unambiguous_normalized_aliases(self):
        records = [{
            "competitionName": "測試盃",
            "teams": {"affirmative": "臺南二中A", "negative": "Ａ校"},
            "players": {"affirmative": [], "negative": []},
        }]
        registry = [
            {"code": "s001", "type": "s", "name": "台南二中", "aliases": "台南二中A"},
            {"code": "s002", "type": "s", "name": "A校", "aliases": ""},
        ]
        with tempfile.TemporaryDirectory() as folder, patch.object(build_data, "REGISTRY_PATH", Path(folder) / "entity-registry.csv"):
            entries, lookup = build_data.build_entities(records, [], registry)
            build_data.attach_entities(records, [], lookup)

        self.assertEqual(records[0]["teamIds"], {"affirmative": "s001", "negative": "s002"})
        self.assertEqual(records[0]["teams"]["affirmative"], "臺南二中A")
        self.assertEqual(records[0]["teams"]["negative"], "Ａ校")
        self.assertIn("臺南二中A", next(item["aliases"] for item in entries if item["code"] == "s001"))
        self.assertIn("Ａ校", next(item["aliases"] for item in entries if item["code"] == "s002"))

    def test_roster_validation_matches_aliases_without_collapsing_school_teams(self):
        records = [
            {"competitionName": "測試盃", "teams": {"affirmative": "測試高中A", "negative": "甲校"}},
            {"competitionName": "測試盃", "teams": {"affirmative": "測試高中B", "negative": "乙校"}},
        ]
        rosters = {"測試盃": [
            {"team": "測試高中甲"}, {"team": "甲校"},
            {"team": "測試高中乙"}, {"team": "乙校"},
        ]}
        registry = [{
            "code": "s001", "type": "s", "name": "測試高中",
            "aliases": "測試高中A|測試高中B|測試高中甲|測試高中乙",
        }]
        with patch.object(build_data, "WARNINGS", []):
            build_data.validate_event_rosters(records, rosters, registry)
            self.assertEqual(build_data.WARNINGS, [])

    def test_roster_validation_warns_when_one_of_two_same_school_teams_is_missing(self):
        records = [
            {"competitionName": "測試盃", "teams": {"affirmative": "測試高中A", "negative": "甲校"}},
            {"competitionName": "測試盃", "teams": {"affirmative": "測試高中B", "negative": "乙校"}},
        ]
        rosters = {"測試盃": [
            {"team": "測試高中A"}, {"team": "甲校"}, {"team": "乙校"},
        ]}
        registry = [{"code": "s001", "type": "s", "name": "測試高中", "aliases": "測試高中A|測試高中B"}]
        with patch.object(build_data, "WARNINGS", []):
            build_data.validate_event_rosters(records, rosters, registry)
            self.assertEqual(len(build_data.WARNINGS), 1)
            self.assertIn("測試高中B", build_data.WARNINGS[0])

    def test_entity_registry_keeps_legacy_xlsx_fallback_and_csv_priority(self):
        workbook_xml = (
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="名冊" sheetId="1" r:id="rId1"/></sheets></workbook>'
        )
        relationships_xml = (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>'
            '</Relationships>'
        )
        worksheet_xml = (
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
            '<row r="1"><c r="A1" t="inlineStr"><is><t>code</t></is></c>'
            '<c r="B1" t="inlineStr"><is><t>type</t></is></c>'
            '<c r="C1" t="inlineStr"><is><t>name</t></is></c>'
            '<c r="D1" t="inlineStr"><is><t>aliases</t></is></c></row>'
            '<row r="2"><c r="A2" t="inlineStr"><is><t>s001</t></is></c>'
            '<c r="B2" t="inlineStr"><is><t>s</t></is></c>'
            '<c r="C2" t="inlineStr"><is><t>舊名冊學校</t></is></c>'
            '<c r="D2" t="inlineStr"><is><t>舊別名</t></is></c></row>'
            '</sheetData></worksheet>'
        )
        with tempfile.TemporaryDirectory() as folder:
            registry_path = Path(folder) / "entity-registry.csv"
            legacy_path = Path(folder) / "entity-registry.xlsx"
            with zipfile.ZipFile(legacy_path, "w") as book:
                book.writestr("xl/workbook.xml", workbook_xml)
                book.writestr("xl/_rels/workbook.xml.rels", relationships_xml)
                book.writestr("xl/worksheets/sheet1.xml", worksheet_xml)
            with patch.object(build_data, "REGISTRY_PATH", registry_path), patch.object(build_data, "REGISTRY_XLSX_PATH", legacy_path):
                legacy_entries = build_data.read_registry()
                self.assertEqual(legacy_entries[0]["name"], "舊名冊學校")
                registry_path.write_text("code,type,name,aliases\ns002,s,正式 CSV 學校,CSV 別名\n", encoding="utf-8")
                csv_entries = build_data.read_registry()
                self.assertEqual(csv_entries[0]["name"], "正式 CSV 學校")

    def test_entity_registry_warns_on_unicode_and_tai_character_collisions(self):
        with tempfile.TemporaryDirectory() as folder:
            registry_path = Path(folder) / "entity-registry.csv"
            legacy_path = Path(folder) / "missing.xlsx"
            registry_path.write_text(
                "code,type,name,aliases\n"
                "s001,s,台南二中,Ａ校\n"
                "s002,s,臺南二中,A校\n",
                encoding="utf-8",
            )
            with patch.object(build_data, "REGISTRY_PATH", registry_path), \
                    patch.object(build_data, "REGISTRY_XLSX_PATH", legacy_path), \
                    patch.object(build_data, "WARNINGS", []):
                entries = build_data.read_registry()
                self.assertEqual(len(entries), 2)
                self.assertEqual(len(build_data.WARNINGS), 2)
                self.assertIn("重複：臺南二中", build_data.WARNINGS[0])
                self.assertIn("重複：A校", build_data.WARNINGS[1])


if __name__ == "__main__":
    unittest.main()
