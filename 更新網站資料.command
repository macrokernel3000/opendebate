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
    if [[ "$EXT" != "csv" ]]; then
      echo "單位名冊請輸出為 UTF-8 CSV，更新程式會直接讀取 entity-registry.csv。按 Return 關閉。"
      read
      exit 1
    fi
    mkdir -p "$DIR/data/backups"
    if [[ -e "$DIR/data/entity-registry.csv" ]]; then
      cp "$DIR/data/entity-registry.csv" "$DIR/data/backups/entity-registry-$(date +%Y%m%d-%H%M%S).csv"
    fi
    TARGET="$DIR/data/entity-registry.csv"
  else
    echo "賽事資料已整合成一份總表，不再直接拖入單一賽事檔。"
    echo "請編輯 data/public-data-所有賽事.csv，再雙擊本更新程式。"
    echo "按 Return 關閉。"
    read
    exit 1
  fi
  if ! cp "$1" "$TARGET"; then
    echo "無法複製資料檔。按 Return 關閉。"
    read
    exit 1
  fi
  echo "已保留舊檔並載入：${TARGET:t}"
fi

echo "正在檢查並更新公開網站資料..."
if ! /usr/bin/python3 "$DIR/tools/build_data.py" --check --fail-on-warnings; then
  echo ""
  echo "預檢失敗，網站資料沒有被覆蓋。請依上方訊息修正總表。"
  echo "按 Return 關閉。"
  read
  exit 1
fi
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
