#!/usr/bin/env python3
"""Extrai seções, questões e gabarito de uma prova em Word (.docx)."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from docx import Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

QUESTION_RE = re.compile(
    r"^\s*(?:quest[aã]o\s*)?(\d{1,3})[\.\)\-\–\:]\s*(.*)$",
    re.IGNORECASE,
)
OPTION_RE = re.compile(r"^\s*[\(\[]?([A-Ea-e])[\)\]\.\:\-]\s+(.*)$")
GABARITO_HEADER_RE = re.compile(r"gabarito", re.IGNORECASE)
PAIR_RE = re.compile(r"(\d{1,3})\s*[\-\:\.=]\s*([A-Ea-e])")
SECTION_STYLES = {"heading 1", "heading 2", "heading 3", "título 1", "título 2", "título 3"}


def _iter_blocks(document: Document):
    body = document.element.body
    for child in body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, document)
        elif child.tag == qn("w:tbl"):
            yield Table(child, document)


def _is_section(paragraph: Paragraph) -> bool:
    style_name = (paragraph.style.name or "").lower() if paragraph.style else ""
    text = paragraph.text.strip()
    if not text:
        return False
    if style_name in SECTION_STYLES:
        return True
    return bool(re.match(r"^(se[cç][aã]o|parte|bloco)\b", text, re.IGNORECASE))


def _table_text_rows(table: Table) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in table.rows:
        rows.append([cell.text.strip() for cell in row.cells])
    return rows


def _parse_gabarito_blob(text: str) -> dict[int, str]:
    found: dict[int, str] = {}
    for number, letter in PAIR_RE.findall(text):
        found[int(number)] = letter.upper()
    return found


def parse_docx(path: str | Path) -> dict[str, Any]:
    document = Document(str(path))
    sections: list[dict[str, Any]] = []
    questions: list[dict[str, Any]] = []
    gabarito: dict[int, str] = {}
    current_section = "Geral"
    in_gabarito = False
    current_question: dict[str, Any] | None = None

    def ensure_section():
        nonlocal sections
        if not sections or sections[-1]["nome"] != current_section:
            sections.append({"nome": current_section, "questoes": []})

    for block in _iter_blocks(document):
        if isinstance(block, Table):
            blob = " ".join(" ".join(row) for row in _table_text_rows(block))
            if in_gabarito or GABARITO_HEADER_RE.search(blob):
                gabarito.update(_parse_gabarito_blob(blob))
                in_gabarito = True
            continue

        text = block.text.strip()
        if not text:
            continue

        if GABARITO_HEADER_RE.search(text):
            in_gabarito = True
            gabarito.update(_parse_gabarito_blob(text))
            continue

        if in_gabarito:
            gabarito.update(_parse_gabarito_blob(text))
            continue

        if _is_section(block) and not QUESTION_RE.match(text):
            current_section = text
            ensure_section()
            continue

        qmatch = QUESTION_RE.match(text)
        if qmatch:
            ensure_section()
            current_question = {
                "numero": int(qmatch.group(1)),
                "enunciado": qmatch.group(2).strip(),
                "alternativas": {},
                "secao": current_section,
            }
            questions.append(current_question)
            sections[-1]["questoes"].append(current_question["numero"])
            continue

        omatch = OPTION_RE.match(text)
        if omatch and current_question is not None:
            current_question["alternativas"][omatch.group(1).upper()] = omatch.group(2).strip()
            continue

        if current_question is not None:
            current_question["enunciado"] = (current_question["enunciado"] + " " + text).strip()

    for question in questions:
        letter = gabarito.get(question["numero"])
        if letter:
            question["gabarito"] = letter

    missing = [q["numero"] for q in questions if "gabarito" not in q]
    return {
        "arquivo": str(path),
        "titulo": document.core_properties.title or Path(path).stem,
        "secoes": sections,
        "total_questoes": len(questions),
        "questoes": questions,
        "gabarito": [{"numero": n, "resposta": gabarito[n]} for n in sorted(gabarito)],
        "questoes_sem_gabarito": missing,
    }


def to_prova_json(parsed: dict[str, Any], prova_id: str | None = None) -> dict[str, Any]:
    answers = []
    for question in parsed["questoes"]:
        answers.append(question.get("gabarito") or "")
    return {
        "id": prova_id,
        "titulo": parsed["titulo"],
        "total_questoes": parsed["total_questoes"] or 20,
        "alternativas": 5,
        "gabarito": answers,
        "questoes": parsed["questoes"],
        "secoes": parsed["secoes"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extrai questões e gabarito de um .docx")
    parser.add_argument("docx", help="Caminho do arquivo Word da prova")
    parser.add_argument("-o", "--out", help="JSON de saída (padrão: stdout)")
    parser.add_argument("--prova-id", help="UUID da prova para o gerador de PDF")
    args = parser.parse_args()

    parsed = parse_docx(args.docx)
    payload = to_prova_json(parsed, args.prova_id)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"Salvo em {args.out} — {payload['total_questoes']} questões.")
        if parsed["questoes_sem_gabarito"]:
            print("Sem gabarito:", parsed["questoes_sem_gabarito"])
    else:
        print(text)


if __name__ == "__main__":
    main()
