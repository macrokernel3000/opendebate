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
            "honors": [{"competitionName": "測試盃"}],
            "topics": [],
            "eventRosters": {},
            "eventMetadata": {"測試盃": {"competitionCode": "C2601", "location": "測試地點", "teamCount": 2}},
            "competitionRegistry": [{"code": "C2601", "name": "測試盃", "year": "2026", "status": "results-recorded"}],
        }

    def test_builds_stable_full_snapshot(self):
        first = ios_public_feed.build_catalog(self.sample())
        later = self.sample()
        later["generatedAt"] = "2026-10-12T12:00:00"
        second = ios_public_feed.build_catalog(later)

        self.assertEqual(first["datasetVersion"], second["datasetVersion"])
        self.assertEqual(first["events"][0]["id"], "C2601")
        self.assertEqual(first["events"][0]["recordCount"], 1)
        self.assertEqual(first["matches"][0]["period"], "2")

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


if __name__ == "__main__":
    unittest.main()
