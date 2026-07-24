#!/bin/zsh

DIR="${0:A:h}"
cd "$DIR"

if [[ -n "$1" ]]; then
  EXT="${1:e:l}"
  if [[ "$EXT" != "xlsx" && "$EXT" != "csv" ]]; then
    echo "只支援 .xlsx 或 .csv。按 Return 關閉。"
    read
    exit 1
  fi
  NAME="${1:t}"
  if [[ "$NAME" == entity-registry* ]]; then
    if [[ "$EXT" != "xlsx" ]]; then
      echo "單位名冊請輸出為 Excel .xlsx。按 Return 關閉。"
      read
      exit 1
    fi
    mkdir -p "$DIR/data/backups"
    if [[ -e "$DIR/data/entity-registry.xlsx" ]]; then
      cp "$DIR/data/entity-registry.xlsx" "$DIR/data/backups/entity-registry-$(date +%Y%m%d-%H%M%S).xlsx"
    fi
    TARGET="$DIR/data/entity-registry.xlsx"
  else
    [[ "$NAME" == public-data* ]] || NAME="public-data-${NAME}"
    TARGET="$DIR/data/$NAME"
    if [[ -e "$TARGET" ]]; then
      TARGET="$DIR/data/${NAME:r}-$(date +%Y%m%d-%H%M%S).${NAME:e}"
    fi
  fi
  if ! cp "$1" "$TARGET"; then
    echo "無法複製資料檔。按 Return 關閉。"
    read
    exit 1
  fi
  echo "已保留舊檔並載入：${TARGET:t}"
fi

echo "正在檢查並更新公開網站資料..."
if ! /usr/bin/python3 "$DIR/tools/build_data.py"; then
  echo ""
  echo "更新失敗，原本的網站資料沒有被覆蓋。請依上方訊息修正資料檔。"
  echo "按 Return 關閉。"
  read
  exit 1
fi
echo ""
echo "完成。按 Return 開啟網站。"
read
open "$DIR/index.html"
