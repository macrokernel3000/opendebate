import csv
import tempfile
import unittest
from pathlib import Path

from tools import consolidate_public_data


class ConsolidatePublicDataTest(unittest.TestCase):
    def write_source(self, folder, name, headers, rows):
        path = Path(folder) / name
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader()
            writer.writerows(rows)
        return path

    def test_combines_old_and_new_optional_columns_without_losing_values(self):
        with tempfile.TemporaryDirectory() as folder:
            required = consolidate_public_data.HEADERS[:15]
            self.write_source(folder, "public-data-a.csv", required, [{"資料類型": "辯題", "盃賽": "甲盃"}])
            self.write_source(
                folder,
                "public-data-b.csv",
                consolidate_public_data.HEADERS,
                [{
                    "資料類型": "公開戰績",
                    "盃賽": "乙盃",
                    "分組名稱": "A 組",
                    "推定依據": "賽程圖",
                    "來源名稱": "主辦方賽程公告",
                    "來源網址": "https://example.com/schedule",
                }],
            )
            output = Path(folder) / "public-data-所有賽事.csv"
            rows = consolidate_public_data.read_rows(consolidate_public_data.source_files(Path(folder), output))
            consolidate_public_data.write_atomic(output, rows)

            with output.open(encoding="utf-8-sig", newline="") as handle:
                result = list(csv.DictReader(handle))
            self.assertEqual(len(result), 2)
            self.assertEqual(result[1]["分組名稱"], "A 組")
            self.assertEqual(result[1]["推定依據"], "賽程圖")
            self.assertEqual(result[1]["來源名稱"], "主辦方賽程公告")
            self.assertEqual(result[1]["來源網址"], "https://example.com/schedule")
            self.assertEqual(list(result[0]), consolidate_public_data.HEADERS)

    def test_moves_known_legacy_group_prefix_without_losing_note(self):
        row = {header: "" for header in consolidate_public_data.HEADERS}
        row.update({
            "資料類型": "公開戰績",
            "盃賽": "2025「青聲說」全國高中職辯論賽",
            "備註": "D；三民高中棄賽；文件未載票數",
        })

        result = consolidate_public_data.normalize_legacy_group_fields(row)

        self.assertEqual(result["分組名稱"], "D")
        self.assertEqual(result["備註"], "三民高中棄賽；文件未載票數")

    def test_rejects_unknown_columns_instead_of_silently_dropping_them(self):
        with tempfile.TemporaryDirectory() as folder:
            headers = [*consolidate_public_data.HEADERS[:15], "未知欄位"]
            source = self.write_source(folder, "public-data-a.csv", headers, [{"資料類型": "辯題", "盃賽": "甲盃"}])
            with self.assertRaises(SystemExit):
                consolidate_public_data.read_rows([source])

    def test_rejects_duplicate_headers_and_overflow_values(self):
        with tempfile.TemporaryDirectory() as folder:
            duplicate = Path(folder) / "public-data-duplicate.csv"
            duplicate.write_text("資料類型,盃賽,盃賽\n辯題,甲盃,乙盃\n", encoding="utf-8-sig")
            with self.assertRaisesRegex(SystemExit, "重複表頭"):
                consolidate_public_data.read_rows([duplicate])

            overflow = Path(folder) / "public-data-overflow.csv"
            headers = consolidate_public_data.HEADERS[:15]
            overflow.write_text(
                ",".join(headers) + "\n" + ",".join(["辯題", "甲盃", *([""] * 13), "多餘值"]) + "\n",
                encoding="utf-8-sig",
            )
            with self.assertRaisesRegex(SystemExit, "超出表頭"):
                consolidate_public_data.read_rows([overflow])


if __name__ == "__main__":
    unittest.main()
