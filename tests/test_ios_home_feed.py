import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
import ios_home_feed


class IOSHomeFeedTests(unittest.TestCase):
    def sample(self):
        return {
            "generatedAt": "2026-10-12T08:00:00",
            "competitionRegistry": [
                {"code": "C2601", "name": "測試盃", "year": "2026", "status": "results-recorded"}
            ],
            "eventMetadata": {"測試盃": {"endDate": "2026-10-11"}},
            "records": [{"competitionName": "測試盃", "matchDate": "2026-10-11"}],
            "honors": [
                {"id": "h1", "competitionName": "測試盃", "matchDate": "2026-10-11",
                 "honorName": "冠軍", "recipient": "甲校", "teamId": "s001", "honorType": "team"},
                {"id": "h2", "competitionName": "測試盃", "matchDate": "2026-10-11",
                 "honorName": "全程最佳辯士", "recipient": "小明", "teamId": "s001", "honorType": "player"},
            ],
            "entities": [{"type": "s", "code": "s001", "name": "甲校"}],
        }

    def test_podium_and_ranking_awards_link_to_real_public_event(self):
        home = ios_home_feed.build_home(self.sample(), [], [])
        self.assertEqual(home["recent"][0]["podium"][0]["recipient"], "甲校")
        self.assertEqual(home["recent"][0]["id"], "C2601")
        team = home["leaderboard"]["recent"]["team"][0]
        self.assertEqual(team["gold"], 1)
        self.assertEqual(team["awards"][0]["eventId"], "C2601")
        player = home["leaderboard"]["recent"]["individual"][0]
        self.assertEqual(player["fullBest"], 1)
        self.assertEqual(player["awards"][0]["recipient"], "小明")

    def test_upcoming_activity_keeps_detail_fields_and_expired_entry_drops(self):
        upcoming = [{"id": "next", "name": "下一屆", "competitionCode": "C2601",
                     "startDate": "2026-10-20", "endDate": "2026-10-21",
                     "topic": "辯題", "location": "校園"}]
        activities = [{"id": "lecture", "name": "講堂", "startDate": "2026-10-26",
                       "location": "教室", "organizer": "某單位", "note": "說明",
                       "days": [{"date": "2026-10-26", "sessions": [{
                           "startTime": "13:00", "endTime": "14:00", "title": "課程", "speaker": "老師"
                       }]}]}]
        home = ios_home_feed.build_home(self.sample(), upcoming, activities)
        self.assertEqual([x["kind"] for x in home["upcoming"]], ["tournament", "activity"])
        self.assertEqual(home["upcoming"][0]["topic"], "辯題")
        self.assertEqual(home["upcoming"][1]["days"][0]["sessions"][0]["speaker"], "老師")
        upcoming[0]["endDate"] = "2026-10-01"
        home = ios_home_feed.build_home(self.sample(), upcoming, activities)
        self.assertEqual(len(home["upcoming"]), 1)


if __name__ == "__main__":
    unittest.main()
