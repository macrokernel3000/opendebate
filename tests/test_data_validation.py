import sys
import unittest
from pathlib import Path
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import data_validation


class HonorTeamValidationTests(unittest.TestCase):
    def setUp(self):
        self.records = [{
            "competitionName": "測試盃",
            "teams": {"affirmative": "台南二中A", "negative": "甲校"},
        }]
        self.registry = [{"name": "臺南二中", "aliases": "台南二中A|台南二中B"}]

    def test_roster_validation_accepts_taiwan_character_variants(self):
        records = [{
            "competitionName": "測試盃",
            "teams": {"affirmative": "台南二中A", "negative": "台南二中B"},
        }]
        rosters = {"測試盃": [{"team": "臺南二中A"}, {"team": "臺南二中B"}]}
        warn = Mock()
        data_validation.validate_event_rosters(records, rosters, self.registry, warn)
        warn.assert_not_called()

    def test_honor_team_matches_traditional_variant_and_roster_alias(self):
        honors = [{
            "competitionName": "測試盃", "honorName": "全程最佳辯士",
            "recipient": "選手甲", "team": "臺南二中A", "honorType": "player",
            "_source": "測試.csv", "_row": 8,
        }]
        warn = Mock()
        data_validation.validate_honor_teams(self.records, honors, {}, self.registry, warn)
        warn.assert_not_called()

    def test_unmatched_honor_team_reports_source_and_row_without_rewriting(self):
        honors = [{
            "competitionName": "測試盃", "honorName": "冠軍",
            "recipient": "丙校", "team": "丙校", "honorType": "team",
            "_source": "來源.csv", "_row": 12,
        }]
        warn = Mock()
        data_validation.validate_honor_teams(self.records, honors, {}, [], warn)
        self.assertEqual(len(warn.call_args_list), 1)
        self.assertIn("來源.csv 第 12 列", warn.call_args.args[0])
        self.assertIn("丙校", warn.call_args.args[0])
        self.assertEqual(honors[0]["team"], "丙校")

    def test_honor_for_team_a_does_not_match_only_team_b(self):
        records = [{
            "competitionName": "測試盃",
            "teams": {"affirmative": "台南二中B", "negative": "甲校"},
        }]
        honors = [{
            "competitionName": "測試盃", "honorName": "全程最佳辯士",
            "recipient": "選手甲", "team": "臺南二中A", "honorType": "player",
        }]
        warn = Mock()
        data_validation.validate_honor_teams(records, honors, {}, self.registry, warn)
        self.assertEqual(len(warn.call_args_list), 1)

    def test_roster_can_confirm_award_team_when_match_results_are_missing(self):
        honors = [{
            "competitionName": "測試盃", "honorName": "冠軍",
            "recipient": "甲校", "team": "甲校", "honorType": "team",
        }]
        rosters = {"測試盃": [{"team": "甲校"}]}
        warn = Mock()
        data_validation.validate_honor_teams([], honors, rosters, [], warn)
        warn.assert_not_called()

    def test_award_only_event_without_rosters_is_not_flagged(self):
        honors = [{
            "competitionName": "測試盃", "honorName": "冠軍",
            "recipient": "甲校", "team": "甲校", "honorType": "team",
        }]
        warn = Mock()
        data_validation.validate_honor_teams([], honors, {}, [], warn)
        warn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
