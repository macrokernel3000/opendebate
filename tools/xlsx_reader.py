#!/usr/bin/env python3
"""Read worksheet cell values and physical row numbers from XLSX files."""

import re
import zipfile
from xml.etree import ElementTree as ET


def cell_column(reference):
    letters = re.match(r"[A-Z]+", reference or "")
    result = 0
    for char in letters.group(0) if letters else "":
        result = result * 26 + ord(char) - 64
    return result - 1


def read_sheets(path):
    """Yield (sheet name, rectangular row matrix, physical row numbers)."""
    with zipfile.ZipFile(path) as book:
        shared_strings = []
        if "xl/sharedStrings.xml" in book.namelist():
            root = ET.fromstring(book.read("xl/sharedStrings.xml"))
            shared_strings = ["".join(node.text or "" for node in item.iter() if node.tag.endswith("}t")) for item in root]
        rels_root = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
        relationships = {item.attrib["Id"]: item.attrib["Target"] for item in rels_root}
        workbook_root = ET.fromstring(book.read("xl/workbook.xml"))
        relation_key = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        for sheet in workbook_root.iter():
            if not sheet.tag.endswith("}sheet"):
                continue
            target = relationships.get(sheet.attrib.get(relation_key, ""), "")
            if not target:
                continue
            clean_target = target.lstrip("/")
            sheet_path = clean_target if clean_target.startswith("xl/") else "xl/" + clean_target
            sheet_root = ET.fromstring(book.read(sheet_path))
            matrix, row_numbers = [], []
            for row_node in sheet_root.iter():
                if not row_node.tag.endswith("}row"):
                    continue
                values = {}
                for cell in row_node:
                    if not cell.tag.endswith("}c"):
                        continue
                    column = cell_column(cell.attrib.get("r", ""))
                    cell_type = cell.attrib.get("t", "")
                    if cell_type == "inlineStr":
                        value = "".join(node.text or "" for node in cell.iter() if node.tag.endswith("}t"))
                    else:
                        value_node = next((node for node in cell if node.tag.endswith("}v")), None)
                        value = value_node.text if value_node is not None and value_node.text is not None else ""
                        if cell_type == "s" and value:
                            value = shared_strings[int(value)]
                    values[column] = value
                if values:
                    matrix.append([values.get(index, "") for index in range(max(values) + 1)])
                    row_numbers.append(int(row_node.attrib.get("r", len(matrix))))
            yield sheet.attrib.get("name", "未命名分頁"), matrix, row_numbers
