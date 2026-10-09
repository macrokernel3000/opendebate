import csv
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as source:
        return list(csv.DictReader(source))


class SchoolNameRulesTest(unittest.TestCase):
    def setUp(self):
        self.entities = {row["code"]: row for row in read_csv(ROOT / "data/entity-registry.csv")}

    def test_dongshan_registry_has_no_generic_entity(self):
        self.assertNotIn("s088", self.entities)
        self.assertEqual(self.entities["s046"]["name"], "市立東山")
        self.assertEqual(self.entities["s107"]["name"], "私立東山")
        names = {
            name
            for entity in self.entities.values()
            for name in [entity["name"], *entity["aliases"].split("|")]
            if name
        }
        self.assertNotIn("東山高中", names)
        self.assertNotIn("私立中山", names)

    def test_historical_generic_dongshan_rows_are_event_scoped(self):
        assignments = {
            (row["盃賽"], row["隊伍原名"]): row["學校代碼"]
            for row in read_csv(ROOT / "data/event-entity-assignments.csv")
        }
        expected_codes = {"s046", "s107"}
        seen = set()
        for path in ROOT.glob("data/public-data*.csv"):
            for row in read_csv(path):
                values = {row.get("正方學校", ""), row.get("反方學校", ""), row.get("所屬學校", ""), row.get("獲獎者", "")}
                if "東山高中" not in values:
                    continue
                key = (row["盃賽"], "東山高中")
                self.assertIn(key, assignments, f"{path.name} 的東山高中缺少逐屆歸戶")
                self.assertIn(assignments[key], expected_codes)
                seen.add(assignments[key])
        self.assertEqual(seen, expected_codes)

    def test_yangming_entities_remain_separate(self):
        self.assertEqual(self.entities["s092"]["name"], "桃市陽明")
        self.assertEqual(self.entities["s188"]["name"], "北市陽明")
        self.assertIn("桃園市立陽明高級中等學校", self.entities["s092"]["aliases"].split("|"))
        self.assertIn("臺北市立陽明高級中學", self.entities["s188"]["aliases"].split("|"))
        self.assertNotEqual(self.entities["s092"]["name"], self.entities["s188"]["name"])

    def test_legacy_school_routes_are_explicit(self):
        app_source = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn('s088: "s046"', app_source)
        self.assertIn('s147: "s092"', app_source)

    def test_generated_data_does_not_expose_s088(self):
        source = (ROOT / "data/public-data.js").read_text(encoding="utf-8")
        payload = source.split("=", 1)[1].strip().rstrip(";")
        data = json.loads(payload)
        entities = {entity["code"]: entity for entity in data["entities"]}
        self.assertNotIn("s088", entities)
        self.assertEqual(entities["s092"]["name"], "桃市陽明")
        self.assertEqual(entities["s188"]["name"], "北市陽明")


if __name__ == "__main__":
    unittest.main()
