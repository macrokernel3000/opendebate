import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import ios_public_feed


class IOSPublicFeedTests(unittest.TestCase):
    def sample(self):
        return {
            "generatedAt": "2026-10-11T12:00:00",
            "records": [{
                "id": "match-1", "competitionName": "測試盃", "matchDate": "2026-10-10",
                "period": 2, "venue": 3,
                "teams": {"affirmative": "甲校", "negative": "乙校"},
                "scores": {"affirmative": 2, "negative": 1},
            }],
            "honors": [{
                "id": "honor-1", "competitionName": "測試盃", "honorName": "冠軍",
                "recipient": "甲校", "team": "", "honorType": "team", "matchDate": "2026-10-10",
                "note": "公開成績",
            }],
            "topics": [{
                "topicId": "topic-1", "competitionName": "測試盃",
                "topic": "我國應採行測試制度", "explanation": "測試說明",
            }],
            "eventRosters": {},
            "eventMetadata": {"測試盃": {
                "competitionCode": "C2601", "location": "測試地點", "teamCount": 2,
                "organizer": "測試主辦", "executionUnit": "測試執行",
                "note": "測試備註", "awardSelectionCriteria": "測試標準", "ageRestriction": True,
            }},
            "competitionRegistry": [{"code": "C2601", "name": "測試盃", "year": "2026", "status": "results-recorded"}],
            "entities": [
                {"code": "s001", "type": "s", "name": "甲校", "aliases": "甲中|測試甲校"},
                {"code": "s002", "type": "s", "name": "乙校", "aliases": ""},
            ],
        }

    def test_builds_stable_full_snapshot(self):
        first = ios_public_feed.build_catalog(self.sample())
        later = self.sample()
        later["generatedAt"] = "2026-10-12T12:00:00"
        second = ios_public_feed.build_catalog(later)

        self.assertEqual(first["datasetVersion"], second["datasetVersion"])
        self.assertEqual(first["events"][0]["id"], "C2601")
        self.assertEqual(first["events"][0]["recordCount"], 1)
        self.assertEqual(first["events"][0]["organizer"], "測試主辦")
        self.assertEqual(first["events"][0]["topics"][0]["title"], "我國應採行測試制度")
        self.assertEqual(first["events"][0]["honors"][0]["recipient"], "甲校")
        self.assertEqual(first["events"][0]["teams"], ["乙校", "甲校"])
        self.assertEqual(first["matches"][0]["period"], "2")
        self.assertEqual(first["publicIndex"]["entities"][0]["aliases"], ["甲中", "測試甲校"])
        self.assertEqual(first["publicIndex"]["records"][0]["affirmativeEntityID"], "")
        self.assertRegex(first["publicIndex"]["sourceSHA256"], r"^[0-9a-f]{64}$")

    def test_omits_incomplete_topic_and_honor_rows(self):
        sample = self.sample()
        sample["topics"].append({"competitionName": "測試盃", "topic": ""})
        sample["honors"].append({"competitionName": "測試盃", "honorName": "亞軍", "recipient": ""})
        event = ios_public_feed.build_catalog(sample)["events"][0]
        self.assertEqual(len(event["topics"]), 1)
        self.assertEqual(len(event["honors"]), 1)

    def test_app_text_removes_source_urls_without_erasing_context(self):
        self.assertEqual(
            ios_public_feed.app_text("資料來源（https://example.com/source）；其餘說明"),
            "資料來源；其餘說明",
        )

    def test_public_index_includes_people_from_honors_and_rosters(self):
        sample = self.sample()
        sample["honors"][0].update({"honorType": "player", "recipient": "王小明", "team": "甲校"})
        sample["eventRosters"] = {"測試盃": [{
            "team": "甲校", "players": ["王小明", "李小華"], "leaders": ["陳老師"],
        }]}
        people = ios_public_feed.build_catalog(sample)["publicIndex"]["people"]
        by_name = {person["name"]: person for person in people}
        self.assertEqual(by_name["王小明"]["roles"], ["選手"])
        self.assertEqual(by_name["王小明"]["honorIDs"], ["honor-1"])
        self.assertEqual(by_name["王小明"]["appearances"][0]["competitionName"], "測試盃")
        self.assertEqual(by_name["陳老師"]["roles"], ["領隊"])

    def test_rejects_event_without_public_code(self):
        sample = self.sample()
        sample["competitionRegistry"] = []
        with self.assertRaisesRegex(ValueError, "缺少穩定賽事代碼"):
            ios_public_feed.build_catalog(sample)

    def test_manifest_matches_exact_catalog_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            catalog, manifest = ios_public_feed.write_feed(self.sample(), folder)
            data = (Path(folder) / "catalog.json").read_bytes()
            self.assertEqual(manifest["sha256"], hashlib.sha256(data).hexdigest())
            self.assertEqual(manifest["byteCount"], len(data))
            self.assertEqual(json.loads(data)["datasetVersion"], catalog["datasetVersion"])

    def test_new_public_event_changes_version_and_enters_snapshot(self):
        original = ios_public_feed.build_catalog(self.sample())
        updated = self.sample()
        updated["competitionRegistry"].append({
            "code": "C2602", "name": "新增盃", "year": "2026", "status": "results-recorded"
        })
        updated["records"].append({
            "id": "match-2", "competitionName": "新增盃", "matchDate": "2026-10-11",
            "period": 1, "venue": 1,
            "teams": {"affirmative": "丙校", "negative": "丁校"},
            "scores": {"affirmative": 1, "negative": 2},
        })
        refreshed = ios_public_feed.build_catalog(updated)

        self.assertNotEqual(original["datasetVersion"], refreshed["datasetVersion"])
        self.assertIn("C2602", {event["id"] for event in refreshed["events"]})
        self.assertIn("match-2", {match["id"] for match in refreshed["matches"]})


if __name__ == "__main__":
    unittest.main()
