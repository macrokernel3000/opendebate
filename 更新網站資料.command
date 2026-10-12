#!/bin/zsh
# OpenDebate public-data update: one reviewed CSV at a time; never auto-publish.
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
PYTHON="/usr/bin/python3"
BACKUPS="$DIR/data/backups"
mkdir -p "$BACKUPS"
STAMP="$(date +%Y%m%d-%H%M%S)"
MODE="rebuild"
SOURCE=""
TARGET=""
ORIGINAL_BACKUP=""

wait_for_close() {
  echo ""
  echo "按 Return 關閉。"
  read
}
restore_inputs() {
  if [[ "$MODE" == "historical" && -n "$TARGET" && "$SOURCE" != "$TARGET" ]]; then
    if [[ -n "$ORIGINAL_BACKUP" ]]; then
      cp "$ORIGINAL_BACKUP" "$TARGET"
    else
      rm -f "$TARGET"
    fi
  fi
  if [[ "$MODE" == "future" ]]; then
    for file in upcoming-events.js competition-registry.csv event-metadata.csv; do
      cp "$BACKUPS/$file-$STAMP" "$DIR/data/$file"
    done
  fi
}
# Double-click opens a file picker. Drag-and-drop passes the CSV path directly.
if [[ -z "$1" ]]; then
  CHOSEN="$(/usr/bin/osascript \
    -e 'try' \
    -e 'set selectedCSV to choose file with prompt "選擇已審核的 OpenDebate 賽事 CSV（取消則只重建現有資料）"' \
    -e 'return POSIX path of selectedCSV' \
    -e 'on error' \
    -e 'return ""' \
    -e 'end try' 2>/dev/null)"
  if [[ -n "$CHOSEN" ]]; then
    set -- "$CHOSEN"
  fi
fi
if [[ -n "$1" ]]; then
  SOURCE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  case "$SOURCE" in
    *.csv) ;;
    *) echo "只接受 CSV 檔。請從「資料登錄CSV」分頁下載 CSV。"; wait_for_close; exit 1;;
  esac
  [[ -f "$SOURCE" ]] || { echo "找不到匯入檔案"; wait_for_close; exit 1; }
  NAME="$(basename "$SOURCE")"
  if [[ "$NAME" == upcoming-data-*.csv ]]; then
    MODE="future"
    if ! "$PYTHON" "$DIR/tools/import_upcoming_csv.py" "$SOURCE"; then
      wait_for_close
      exit 1
    fi
    for file in upcoming-events.js competition-registry.csv event-metadata.csv; do
      cp "$DIR/data/$file" "$BACKUPS/$file-$STAMP"
    done
    if ! "$PYTHON" "$DIR/tools/import_upcoming_csv.py" "$SOURCE" --apply; then
      restore_inputs
      wait_for_close
      exit 1
    fi
  elif [[ "$NAME" == entity-registry.csv ]]; then
    MODE="historical"
    TARGET="$DIR/data/entity-registry.csv"
  else
    MODE="historical"
    [[ "$NAME" == public-data-*.csv ]] || NAME="public-data-$NAME"
    TARGET="$DIR/data/$NAME"
  fi

  if [[ "$MODE" == "historical" ]]; then
    if [[ "$SOURCE" != "$TARGET" ]]; then
      if [[ -e "$TARGET" ]]; then
        ORIGINAL_BACKUP="$BACKUPS/$(basename "$TARGET").$STAMP"
        cp "$TARGET" "$ORIGINAL_BACKUP"
      fi
      cp "$SOURCE" "$TARGET" || { echo "複製 CSV 失敗"; wait_for_close; exit 1; }
    fi
    echo "已匯入 CSV（同名賽事覆蓋舊版並保留備份，不另開重複來源）：$(basename "$TARGET")"
  fi
fi

echo "正在預檢公開賽事資料..."
if ! "$PYTHON" "$DIR/tools/build_data.py" --check --fail-on-warnings; then
  echo "資料未通過預檢，復原此次來源匯入。"
  restore_inputs
  wait_for_close
  exit 1
fi
echo "正在更新公開網站及 iOS 共用公開快照..."
if ! "$PYTHON" "$DIR/tools/build_data.py"; then
  echo "更新失敗，復原此次來源匯入；請先核對上方錯誤。"
  restore_inputs
  wait_for_close
  exit 1
fi
echo "本機重建完成。尚未發布到 GitHub：請先比對資料差異再提交／推送。"
wait_for_close
open "$DIR/index.html"
