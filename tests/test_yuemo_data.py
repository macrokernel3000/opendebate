import csv
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EVENT = "第一屆幽墨盃全國高中職辯論比賽"


def read_csv(relative_path):
    with (ROOT / relative_path).open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


class YuemoDataTests(unittest.TestCase):
    def test_confirmed_public_scope_is_stable(self):
        rows = [
            row
            for row in read_csv("data/public-data-所有賽事.csv")
            if row["盃賽"] == EVENT
        ]
        matches = [row for row in rows if row["資料類型"] == "公開戰績"]
        honors = [row for row in rows if row["資料類型"] == "公開榮譽"]

        self.assertEqual(len(matches), 17)
        self.assertEqual(len(honors), 8)
        self.assertEqual({row["日期"] for row in matches}, {""})
        self.assertEqual(
            {row["榮譽名稱"] for row in honors},
            {"冠軍", "亞軍", "季軍", "殿軍", "全程最佳辯士", "我們都很棒", "您辛苦了", "全程最佳小丑"},
        )
        clown = next(row for row in honors if row["榮譽名稱"] == "全程最佳小丑")
        self.assertEqual(clown["獲獎者"], "劉哲安")
        self.assertEqual(clown["所屬學校"], "南山高中")

    def test_registry_keeps_the_verified_name_and_short_name(self):
        registry = next(
            row
            for row in read_csv("data/competition-registry.csv")
            if row["name"] == EVENT
        )

        self.assertEqual(registry["code"], "C2409")
        self.assertEqual(registry["shortName"], "2024 幽墨盃")


if __name__ == "__main__":
    unittest.main()
