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

    def parse_date(value, index, field):
        try:
            return datetime.strptime(clean(value), "%Y-%m-%d").date()
        except ValueError as error:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆「{field}」須為 YYYY-MM-DD。") from error

    def validate_time(value, index, field):
        if not re.fullmatch(r"(?:[01]\d|2[0-3]):[0-5]\d", clean(value)):
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆「{field}」格式錯誤：{value}。")

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
        start_date = parse_date(activity.get("startDate"), index, "startDate")
        end_date = parse_date(activity.get("endDate") or activity.get("startDate"), index, "endDate")
        if end_date < start_date:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆結束日期早於開始日期。")
        for field in ("startTime", "endTime"):
            value = clean(activity.get(field))
            if value:
                validate_time(value, index, field)
        if clean(activity.get("startTime")) and clean(activity.get("endTime")) and activity["endTime"] <= activity["startTime"]:
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆結束時間必須晚於開始時間。")
        days = activity.get("days", [])
        if not isinstance(days, list):
            raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆「days」必須是陣列。")
        seen_days = set()
        for day_index, day in enumerate(days, start=1):
            if not isinstance(day, dict):
                raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆第 {day_index} 個上課日必須是物件。")
            day_date = parse_date(day.get("date"), index, f"days[{day_index}].date")
            if day_date < start_date or day_date > end_date or day_date in seen_days:
                raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆第 {day_index} 個上課日超出活動日期或重複。")
            seen_days.add(day_date)
            sessions = day.get("sessions", [])
            if not isinstance(sessions, list) or not sessions:
                raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆第 {day_index} 個上課日缺少課程。")
            for session_index, session in enumerate(sessions, start=1):
                if not isinstance(session, dict) or not clean(session.get("title")) or not clean(session.get("speaker")):
                    raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆第 {day_index} 日第 {session_index} 堂缺少講師或主題。")
                validate_time(session.get("startTime"), index, f"days[{day_index}].sessions[{session_index}].startTime")
                validate_time(session.get("endTime"), index, f"days[{day_index}].sessions[{session_index}].endTime")
                if session["endTime"] <= session["startTime"]:
                    raise SystemExit(f"資料錯誤：{source_path.name} 第 {index} 筆第 {day_index} 日第 {session_index} 堂結束時間必須晚於開始時間。")
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
    def append_activity_event(activity, start, start_time="", end_time="", sessions=None, uid_suffix=""):
        if start < today:
            return
        sessions = sessions or []
        session_lines = [
            f"{session['startTime']}–{session['endTime']} {session['title']}（{session['speaker']}）"
            for session in sessions
        ]
        description = "\n".join(filter(None, [
            activity.get("note", ""),
            *session_lines,
            f"辯題：{activity['topic']}" if activity.get("topic") else "",
            f"報名連結：{activity['registrationUrl']}" if activity.get("registrationUrl") else "公告未列報名連結。",
            f"公告來源：{activity['sourceUrl']}" if activity.get("sourceUrl") else "",
        ]))
        detail_url = f"https://macrokernel3000.github.io/opendebate/#activity/{quote(activity['id'])}"
        summary = activity["name"] if not sessions else f"{activity['name']}｜{start.strftime('%m/%d')}"
        activity_lines = [
            "BEGIN:VEVENT",
            f"UID:{escape_ical(activity['id'] + uid_suffix)}@opendebate.macrokernel3000.github.io",
            f"DTSTAMP:{stamp}",
            f"SUMMARY:{escape_ical(summary)}",
            f"LOCATION:{escape_ical(activity['location'])}",
            f"DESCRIPTION:{escape_ical(description)}",
            f"URL:{detail_url if sessions else (activity.get('registrationUrl') or activity.get('sourceUrl') or detail_url)}",
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

    for activity in activities:
        days = activity.get("days") or []
        if days:
            for day in days:
                sessions = day["sessions"]
                append_activity_event(
                    activity,
                    datetime.strptime(day["date"], "%Y-%m-%d").date(),
                    sessions[0]["startTime"],
                    sessions[-1]["endTime"],
                    sessions,
                    f"-{day['date']}",
                )
        else:
            append_activity_event(
                activity,
                datetime.strptime(activity["startDate"], "%Y-%m-%d").date(),
                clean(activity.get("startTime")),
                clean(activity.get("endTime")),
            )
    lines.append("END:VCALENDAR")
    (project_root / "calendar.ics").write_bytes(("\r\n".join(fold_line(line) for line in lines) + "\r\n").encode("utf-8"))
