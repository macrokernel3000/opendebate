"""Isolated, public-only iOS homepage contract tests."""
import json
import tempfile
import unittest
from pathlib import Path

from tools import ios_home_feed


class HomeFeedTests(unittest.TestCase):
    def fixture(self):
        return {
            "generatedAt": "2026-10-12T08:08:32",
            "competitionRegistry": [
                {"code": "C2501", "name": "舊盃"},
                {"code": "C2601", "name": "新盃"},
            ],
            "eventMetadata": {
                "舊盃": {"startDate": "2025-08-01", "endDate": "2025-08-02"},
                "新盃": {"startDate": "2026-10-01", "endDate": "2026-10-02"},
            },
            "records": [
                {"competitionName": "舊盃", "matchDate": "2025-08-02"},
                {"competitionName": "新盃", "matchDate": "2026-10-02"},
            ],
            "honors": [
                {"id": "gold", "competitionName": "新盃", "honorName": "冠軍", "recipient": "甲校A", "teamId": "s001", "honorType": "team"},
                {"id": "bronze", "competitionName": "新盃", "honorName": "季軍", "recipient": "乙校", "teamId": "s002", "honorType": "team"},
                {"id": "best", "competitionName": "新盃", "honorName": "全程最佳辯士", "recipient": "甲同學", "teamId": "s001", "honorType": "player"},
                {"id": "old", "competitionName": "舊盃", "honorName": "冠軍", "recipient": "乙校", "teamId": "s002", "honorType": "team"},
                {"id": "unmapped", "competitionName": "新盃", "honorName": "冠軍", "recipient": "校外隊", "teamId": "p001", "honorType": "team"},
            ],
            "entities": [
                {"code": "s001", "name": "甲校", "type": "s"},
                {"code": "s002", "name": "乙校", "type": "s"},
                {"code": "p001", "name": "校外隊", "type": "p"},
            ],
        }

    def test_podium_retains_multiple_recipients_and_stable_ids(self):
        result = ios_home_feed.build_home(self.fixture(), [], [])
        self.assertEqual(result["recent"][0]["id"], "C2601")
        self.assertEqual(result["recent"][0]["recordCount"], 1)
        self.assertEqual([x["recipient"] for x in result["recent"][0]["podium"]],
                         ["甲校A", "校外隊", "乙校"])
        self.assertEqual(result["recentYears"], ["2025", "2026"])

    def test_rankings_only_count_school_entities(self):
        result = ios_home_feed.build_home(self.fixture(), [], [])
        rows = {x["id"]: x for x in result["leaderboard"]["recent"]["team"]}
        self.assertEqual(rows["s001"]["gold"], 1)
        self.assertEqual(rows["s002"]["bronze"], 1)
        self.assertNotIn("p001", rows)
        self.assertEqual(result["leaderboard"]["recent"]["individual"][0]["fullBest"], 1)

    def test_future_only_event_does_not_shift_recent_honor_years(self):
        fixture = self.fixture()
        fixture["competitionRegistry"].append({"code": "C2701", "name": "尚未舉辦"})
        fixture["eventMetadata"]["尚未舉辦"] = {
            "startDate": "2027-05-01", "endDate": "2027-05-02"
        }
        result = ios_home_feed.build_home(
            fixture, [{"name": "尚未舉辦", "startDate": "2027-05-01"}], []
        )
        self.assertEqual(result["recentYears"], ["2025", "2026"])
        self.assertNotIn("尚未舉辦", [event["name"] for event in result["recent"]])
        self.assertTrue(any(event["name"] == "尚未舉辦" for event in result["upcoming"]))

    def test_upcoming_and_activities_are_separate(self):
        result = ios_home_feed.build_home(
            self.fixture(),
            [{"name": "新盃", "startDate": "2026-11-01", "location": "甲地"}],
            [{"id": "forum-1", "name": "講座", "startDate": "2026-10-19", "location": "乙地"}],
        )
        self.assertEqual(result["upcoming"][0]["kind"], "activity")
        self.assertEqual(result["upcoming"][1]["id"], "C2601")
        self.assertEqual(result["upcoming"][1]["eventId"], "C2601")

    def test_read_js_accepts_provenance_comment_but_rejects_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "input.js"
            path.write_text('// Note\nwindow.DATA = [{"id":1}];\n', encoding="utf-8")
            self.assertEqual(ios_home_feed.read_js(path, "window.DATA = "), [{"id": 1}])
            path.write_text('alert(1);\nwindow.DATA = [];', encoding="utf-8")
            with self.assertRaises(ValueError):
                ios_home_feed.read_js(path, "window.DATA = ")

    def test_existing_public_sources_have_real_home_information(self):
        result = ios_home_feed.build_home(
            ios_home_feed.read_js(ios_home_feed.ROOT / "data/public-data.js", "window.DEBATE_PUBLIC_DATA = "),
            ios_home_feed.read_js(ios_home_feed.ROOT / "data/upcoming-events.js", "window.DEBATE_UPCOMING_EVENTS = "),
            ios_home_feed.read_js(ios_home_feed.ROOT / "data/calendar-activities.js", "window.DEBATE_CALENDAR_ACTIVITIES = "),
        )
        self.assertTrue(any(r["podium"] for r in result["recent"]))
        self.assertGreater(len(result["upcoming"]), 0)
        self.assertGreater(len(result["leaderboard"]["recent"]["team"]), 0)
        self.assertEqual(result, json.loads(json.dumps(result, ensure_ascii=False)))


if __name__ == "__main__":
    unittest.main()
