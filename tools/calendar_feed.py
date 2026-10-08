#!/usr/bin/env python3
"""Validate future-event data and generate the public iCalendar feed."""

import json
import re
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import quote


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def clean(value):
    return str(value or "").strip()


def read_upcoming_events(path=None, data_dir=None):
    source_path = Path(path) if path else Path(data_dir or PROJECT_ROOT / "data") / "upcoming-events.js"
    source = source_path.read_text(encoding="utf-8")
    try:
        payload = source.split("=", 1)[1].rsplit(";", 1)[0].strip()
        events = json.loads(payload)
    except (IndexError, json.JSONDecodeError) as error:
        raise SystemExit(f"資料錯誤：{source_path.name} 不是有效的未來賽事資料。") from error
    if not isinstance(events, list):
        raise SystemExit(f"資料錯誤：{source_path.name} 最外層必須是賽事陣列。")
    return events


def validate_upcoming_events(path=None, data_dir=None):
    source_path = Path(path) if path else Path(data_dir or PROJECT_ROOT / "data") / "upcoming-events.js"
    events = read_upcoming_events(source_path)
    seen_ids, seen_names = set(), set()

    def parse_event_date(value, row, field):
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {row} 筆「{field}」必須使用 YYYY-MM-DD。")
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError as error:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {row} 筆「{field}」不是有效日期：{value}。") from error

    for index, event in enumerate(events, start=1):
        if not isinstance(event, dict):
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆必須是物件。")
        event_id, name = clean(event.get("id")), clean(event.get("name"))
        if not event_id or not name:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆缺少賽事 id 或名稱。")
        if event_id in seen_ids:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆賽事 id 重複：{event_id}。")
        if name in seen_names:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆賽事名稱重複：{name}。")
        seen_ids.add(event_id)
        seen_names.add(name)
        start = parse_event_date(event.get("startDate"), index, "startDate")
        end = parse_event_date(event.get("endDate") or event.get("startDate"), index, "endDate")
        if end < start:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆結束日期早於開始日期：{name}。")
        key_dates = event.get("keyDates", [])
        if not isinstance(key_dates, list):
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆「keyDates」必須是陣列：{name}。")
        for date_index, item in enumerate(key_dates, start=1):
            if not isinstance(item, dict) or not clean(item.get("label")):
                raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆第 {date_index} 個重要時程缺少標籤。")
            if clean(item.get("date")):
                parse_event_date(item["date"], index, f"keyDates[{date_index}].date")
            if clean(item.get("time")) and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", clean(item["time"])):
                raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆第 {date_index} 個重要時程時間格式錯誤：{item['time']}。")
    return events


def read_calendar_activities(path=None, data_dir=None):
    source_path = Path(path) if path else Path(data_dir or PROJECT_ROOT / "data") / "calendar-activities.js"
    if not source_path.exists():
        return []
    source = source_path.read_text(encoding="utf-8")
    try:
        payload = source.split("=", 1)[1].rsplit(";", 1)[0].strip()
        activities = json.loads(payload)
    except (IndexError, json.JSONDecodeError) as error:
        raise SystemExit(f"資料錯誤：{source_path.name} 不是有效的行事曆活動資料。") from error
    if not isinstance(activities, list):
        raise SystemExit(f"資料錯誤：{source_path.name} 最外層必須是活動陣列。")
    seen_ids = set()
    for index, activity in enumerate(activities, start=1):
        if not isinstance(activity, dict):
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆必須是物件。")
        activity_id = clean(activity.get("id"))
        if not activity_id or activity_id in seen_ids:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆缺少或重複活動 id。")
        seen_ids.add(activity_id)
        for field in ("name", "location"):
            if not clean(activity.get(field)):
                raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆缺少「{field}」。")
        try:
            datetime.strptime(clean(activity.get("startDate")), "%Y-%m-%d")
        except ValueError as error:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆「startDate」須為 YYYY-MM-DD。") from error
        for field in ("startTime", "endTime"):
            value = clean(activity.get(field))
            if value and not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", value):
                raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆「{field}」格式錯誤：{value}。")
        if clean(activity.get("startTime")) and clean(activity.get("endTime")) and activity["endTime"] <= activity["startTime"]:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆結束時間必須晚於開始時間。")
        for field in ("sourceUrl", "registrationUrl"):
            value = clean(activity.get(field))
            if value and not re.match(r"^https?://", value, re.IGNORECASE):
                raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆「{field}」必須是 http(s) 網址。")
    return activities


def write_calendar_feed(root=None, data_dir=None):
    project_root = Path(root or PROJECT_ROOT)
    upcoming = read_upcoming_events(data_dir=data_dir)
    activities = read_calendar_activities(data_dir=data_dir)
    today = datetime.now().date()

    def escape_ical(value):
        value = str(value or "").replace("\\", "\\\\").replace("\r\n", "\\n").replace("\n", "\\n")
        return value.replace(",", "\\,").replace(";", "\\;")

    def fold_line(line):
        chunks, current, current_bytes = [], "", 0
        for char in line:
            char_bytes = len(char.encode("utf-8"))
            if current_bytes + char_bytes > 73:
                chunks.append(current)
                current, current_bytes = " " + char, 1 + char_bytes
            else:
                current += char
                current_bytes += char_bytes
        chunks.append(current)
        return "\r\n".join(chunks)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Open Debate//TW Event Calendar//ZH-TW",
        "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:台灣辯論與思辨活動",
        "X-WR-TIMEZONE:Asia/Taipei", "X-PUBLISHED-TTL:PT12H",
    ]
    for event in upcoming:
        start = datetime.strptime(event["startDate"], "%Y-%m-%d").date()
        end = datetime.strptime(event.get("endDate") or event["startDate"], "%Y-%m-%d").date()
        if end < today:
            continue
        description = "\n".join(filter(None, [
            f"主辦單位：{event.get('organizer', '')}" if event.get("organizer") else "",
            f"辯題：{event.get('topic', '')}" if event.get("topic") else "",
            f"題目補充：{event.get('topicNote', '')}" if event.get("topicNote") else "",
            *(
                f"{item.get('label', '重要時程')}：{item.get('date', '')}{' ' + item['time'] if item.get('time') else ''}{'（' + item['note'] + '）' if item.get('note') else ''}"
                for item in event.get("keyDates", [])
                if item.get("label") and (item.get("date") or item.get("note"))
            ),
        ]))
        detail_url = f"https://macrokernel3000.github.io/opendebate/#event/{quote(event['name'])}"
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{escape_ical(event.get('id') or event['name'])}@opendebate.macrokernel3000.github.io",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{start.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(end + timedelta(days=1)).strftime('%Y%m%d')}",
            f"SUMMARY:{escape_ical(event['name'])}",
            f"LOCATION:{escape_ical(event.get('location', ''))}",
            f"DESCRIPTION:{escape_ical(description)}",
            f"URL:{detail_url}",
            "STATUS:CONFIRMED", "TRANSP:TRANSPARENT", "END:VEVENT",
        ])
    for activity in activities:
        start = datetime.strptime(activity["startDate"], "%Y-%m-%d").date()
        if start < today:
            continue
        start_time = clean(activity.get("startTime"))
        end_time = clean(activity.get("endTime"))
        description = "\n".join(filter(None, [
            activity.get("note", ""),
            f"辯題：{activity['topic']}" if activity.get("topic") else "",
            f"報名連結：{activity['registrationUrl']}" if activity.get("registrationUrl") else "公告未列報名連結。",
        ]))
        detail_url = f"https://macrokernel3000.github.io/opendebate/#activity/{quote(activity['id'])}"
        activity_lines = [
            "BEGIN:VEVENT",
            f"UID:{escape_ical(activity['id'])}@opendebate.macrokernel3000.github.io",
            f"DTSTAMP:{stamp}",
            f"SUMMARY:{escape_ical(activity['name'])}",
            f"LOCATION:{escape_ical(activity['location'])}",
            f"DESCRIPTION:{escape_ical(description)}",
            f"URL:{activity.get('registrationUrl') or activity.get('sourceUrl') or detail_url}",
            "STATUS:CONFIRMED", "TRANSP:TRANSPARENT",
        ]
        if start_time:
            taipei = timezone(timedelta(hours=8))
            start_at = datetime.combine(start, time.fromisoformat(start_time), tzinfo=taipei).astimezone(timezone.utc)
            activity_lines.insert(3, f"DTSTART:{start_at.strftime('%Y%m%dT%H%M%SZ')}")
            if end_time:
                end_at = datetime.combine(start, time.fromisoformat(end_time), tzinfo=taipei).astimezone(timezone.utc)
                activity_lines.insert(4, f"DTEND:{end_at.strftime('%Y%m%dT%H%M%SZ')}")
        else:
            activity_lines.insert(3, f"DTSTART;VALUE=DATE:{start.strftime('%Y%m%d')}")
            activity_lines.insert(4, f"DTEND;VALUE=DATE:{(start + timedelta(days=1)).strftime('%Y%m%d')}")
        activity_lines.append("END:VEVENT")
        lines.extend(activity_lines)
    lines.append("END:VCALENDAR")
    (project_root / "calendar.ics").write_bytes(("\r\n".join(fold_line(line) for line in lines) + "\r\n").encode("utf-8"))
