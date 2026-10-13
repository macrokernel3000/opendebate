import csv
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVENT = "第二屆鳶飛盃高中職辯論賽"


def read_csv(relative_path):
    with (ROOT / relative_path).open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


class YuanfeiDataTests(unittest.TestCase):
    def test_public_rows_match_confirmed_announcements(self):
        rows = [
            row
            for row in read_csv("data/public-data-所有賽事.csv")
            if row["盃賽"] == EVENT
        ]
        matches = [row for row in rows if row["資料類型"] == "公開戰績"]
        honors = [row for row in rows if row["資料類型"] == "公開榮譽"]
        teams = {
            team
            for row in matches
            for team in (row["正方學校"], row["反方學校"])
            if team
        }

        self.assertEqual(len(matches), 28)
        self.assertEqual(len(teams), 24)
        self.assertEqual(len(honors), 8)
        self.assertEqual(
            {row["日期"] for row in matches},
            {"2023-12-16", "2023-12-17"},
        )
        self.assertNotIn("南山中學", teams)
        self.assertNotIn("薇閣高中", teams)
        self.assertNotIn("政大附中", teams)

    def test_registry_and_metadata_keep_verified_scope(self):
        registry = next(
            row
            for row in read_csv("data/competition-registry.csv")
            if row["name"] == EVENT
        )
        metadata = next(
            row
            for row in read_csv("data/event-metadata.csv")
            if row["盃賽"] == EVENT
        )

        self.assertEqual(registry["code"], "C2302")
        self.assertEqual(registry["shortName"], "2023 鳶飛盃")
        self.assertEqual(metadata["開始日期"], "2023-12-16")
        self.assertEqual(metadata["結束日期"], "2023-12-17")
        self.assertEqual(metadata["主辦單位"], "")
        self.assertEqual(metadata["舉辦地點"], "")
        self.assertIn("不依最終名次反推未公布場次", metadata["備註"])


if __name__ == "__main__":
    unittest.main()
