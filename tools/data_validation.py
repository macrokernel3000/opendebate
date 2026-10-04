#!/usr/bin/env python3
"""Validation rules for imported debate data."""

import csv
import re
import unicodedata


SIDE_WINNERS = {"正方勝", "反方勝"}


def clean(value):
    return str(value or "").strip()


def normalized_entity_name(value):
    return re.sub(r"\s+", "", clean(value)).lower()


def normalized_match_team(value):
    normalized = unicodedata.normalize("NFKC", clean(value)).replace("台", "臺")
    return re.sub(r"\s+", "", normalized).lower()


def validate_records(records, registry_entries, warn):
    alias_lookup = {}
    for entry in registry_entries:
        canonical = normalized_entity_name(entry["name"])
        alias_lookup[canonical] = canonical
        for alias in entry.get("aliases", "").split("|"):
            if normalized_entity_name(alias):
                alias_lookup[normalized_entity_name(alias)] = canonical

    seen_matchups = {}
    for record in records:
        source = record.get("_source", "資料來源")
        row = record.get("_row", "?")
        location = f"{source} 第 {row} 列"
        teams = record["teams"]
        team_names = {side: normalized_entity_name(name) for side, name in teams.items()}
        team_entities = {side: alias_lookup.get(name, name) for side, name in team_names.items()}
        match_date = clean(record.get("matchDate"))
        period = record.get("period")
        venue = record.get("venue")
        matchup = sorted(normalized_match_team(name) for name in teams.values())
        if match_date and period is not None and venue is not None and all(matchup):
            schedule_key = (
                normalized_entity_name(record.get("competitionName")),
                match_date,
                period,
                venue,
                tuple(matchup),
            )
            if schedule_key in seen_matchups:
                first_source, first_row = seen_matchups[schedule_key]
                warn(
                    f"疑似重複場次：{location} 與 {first_source} 第 {first_row} 列在同賽事、日期、時段、會場及隊伍配對重複；請核對來源，不會自動合併。"
                )
            else:
                seen_matchups[schedule_key] = (source, row)
        winner = clean(record.get("winner"))
        winner_name = normalized_entity_name(winner)
        winner_side = None

        if winner in SIDE_WINNERS:
            winner_side = "affirmative" if winner == "正方勝" else "negative"
        elif winner:
            if winner_name == team_names["affirmative"]:
                winner_side = "affirmative"
            elif winner_name == team_names["negative"]:
                winner_side = "negative"
            else:
                winner_entity = alias_lookup.get(winner_name, winner_name)
                matching_sides = [side for side, name in team_entities.items() if name == winner_entity]
                if not matching_sides:
                    raise SystemExit(
                        f"資料錯誤：{location} 的勝方「{winner}」不是正方隊伍、反方隊伍或正／反方勝標記。"
                    )
                if len(matching_sides) == 1:
                    winner_side = matching_sides[0]

        scores = record["scores"]
        affirmative_score = scores["affirmative"]
        negative_score = scores["negative"]
        if affirmative_score is None or negative_score is None:
            continue

        score_side = None
        if affirmative_score > negative_score:
            score_side = "affirmative"
        elif negative_score > affirmative_score:
            score_side = "negative"

        if winner_side and score_side and winner_side != score_side:
            warn(f"比分核對提醒：{location} 的勝方與比分高低不一致，請核對公告或備註。")
        elif not winner and score_side:
            warn(f"比分核對提醒：{location} 比分可分出高低，但勝方留白；請確認公告是否未列勝方。")


def validate_event_metadata_dates(path, checked_date):
    if not path.exists():
        return
    seen = set()
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        for line_number, row in enumerate(reader, start=2):
            event_name = clean(row.get("盃賽"))
            if not event_name:
                continue
            if event_name in seen:
                raise SystemExit(f"資料錯誤：{path.name} 第 {line_number} 列重複登錄賽事「{event_name}」。")
            seen.add(event_name)
            start = checked_date(row.get("開始日期"), path.name, line_number, "開始日期")
            end = checked_date(row.get("結束日期"), path.name, line_number, "結束日期")
            if start and end and len(start) == 10 and len(end) == 10 and end < start:
                raise SystemExit(f"資料錯誤：{path.name} 第 {line_number} 列結束日期早於開始日期：{event_name}。")


def validate_best_debater_categories(records, honors, warn):
    match_counts = {}
    for record in records:
        match_counts[record["competitionName"]] = match_counts.get(record["competitionName"], 0) + 1
    best_names = {"單場最佳辯士", "單場最佳", "最佳辯士", "單場優秀辯士", "單場優秀"}
    by_event = {}
    for honor in honors:
        if honor.get("honorLevel") != "全程最佳辯士" and honor["honorName"].strip() in best_names:
            by_event.setdefault(honor["competitionName"], []).append(honor)
    for competition, event_honors in by_event.items():
        count = len(event_honors)
        if 1 <= count <= 4 and match_counts.get(competition, 0) > count:
            warn(
                f"分類提醒：{competition} 只有 {count} 筆單場／最佳辯士類榮譽、"
                f"但有 {match_counts.get(competition, 0)} 場戰績；請依賽事規則確認是否應列為全程最佳辯士。"
            )
