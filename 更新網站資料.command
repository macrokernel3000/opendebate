#!/bin/zsh

DIR="${0:A:h}"
cd "$DIR"

if [[ -n "$1" ]]; then
  if ! cp "$1" "$DIR/data/public-data.csv"; then
    echo "無法複製 CSV。按 Return 關閉。"
    read
    exit 1
  fi
  echo "已將拖入的 CSV 設為網站資料。"
fi

echo "正在檢查並更新公開網站資料..."
if ! /usr/bin/python3 "$DIR/tools/build_data.py"; then
  echo ""
  echo "更新失敗，原本的網站資料沒有被覆蓋。請依上方訊息修正 CSV。"
  echo "按 Return 關閉。"
  read
  exit 1
fi
echo ""
echo "完成。按 Return 開啟網站。"
read
open "$DIR/index.html"
