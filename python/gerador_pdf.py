#!/usr/bin/env python3
"""Gera folhas de resposta nominais A4 com QR e 4 ancoragens pretas."""

from __future__ import annotations

import argparse
import csv
import json
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import uuid4

import qrcode
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

PAGE_W, PAGE_H = A4
FIDUCIAL_MM = 12
FIDUCIAL_INSET_MM = 6
OPTIONS = ["A", "B", "C", "D", "E"]

# Coordenadas em milímetros — devem coincidir com js/omrWorker.js LAYOUT
QR = {"x": 18, "y_from_top": 22, "size": 42}
GRID = {
    "x": 18,
    "y_from_top": 72,
    "cols": 2,
    "questions_per_col": 25,
    "bubble": 4.2,
    "option_gap": 8.2,
    "row_gap": 8.4,
    "number_width": 10,
    "col_gap": 92,
}


def _top(y_from_top_mm: float) -> float:
    return PAGE_H - y_from_top_mm * mm


def _qr_image(payload: str) -> ImageReader:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=8, border=1)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    buf = BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def _draw_fiducials(c: canvas.Canvas) -> None:
    size = FIDUCIAL_MM * mm
    inset = FIDUCIAL_INSET_MM * mm
    positions = [
        (inset, PAGE_H - inset - size),
        (PAGE_W - inset - size, PAGE_H - inset - size),
        (PAGE_W - inset - size, inset),
        (inset, inset),
    ]
    c.setFillColorRGB(0, 0, 0)
    for x, y in positions:
        c.rect(x, y, size, size, fill=1, stroke=0)
        c.setFillColorRGB(1, 1, 1)
        inner = size * 0.28
        c.rect(x + (size - inner) / 2, y + (size - inner) / 2, inner, inner, fill=1, stroke=0)
        c.setFillColorRGB(0, 0, 0)


def _draw_header(c: canvas.Canvas, prova: dict[str, Any], aluno: dict[str, Any]) -> None:
    c.setFillColorRGB(0.07, 0.12, 0.2)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(68 * mm, _top(24), "GABA  ·  FOLHA DE RESPOSTAS")
    c.setFont("Helvetica", 10)
    c.drawString(68 * mm, _top(31), str(prova.get("titulo") or "Prova"))
    c.setFont("Helvetica-Bold", 11)
    c.drawString(68 * mm, _top(40), f"Aluno: {aluno.get('nome', '')}")
    c.setFont("Helvetica", 10)
    c.drawString(68 * mm, _top(46), f"Matrícula: {aluno.get('matricula', '')}")
    c.drawString(120 * mm, _top(46), f"Turma: {aluno.get('turma', '')}")
    c.setStrokeColorRGB(0.12, 0.64, 0.32)
    c.setLineWidth(1.4)
    c.line(68 * mm, _top(50), PAGE_W - 18 * mm, _top(50))
    c.setFillColorRGB(0.25, 0.3, 0.38)
    c.setFont("Helvetica", 8)
    c.drawString(
        18 * mm,
        _top(64),
        "Preencha completamente a bolha com caneta preta ou azul. Não amasse. Mantenha as 4 marcas pretas visíveis.",
    )


def _draw_bubbles(c: canvas.Canvas, total: int) -> None:
    total = min(total, GRID["cols"] * GRID["questions_per_col"])
    radius = (GRID["bubble"] / 2) * mm
    c.setStrokeColorRGB(0.1, 0.12, 0.16)
    c.setFillColorRGB(0.1, 0.12, 0.16)
    c.setLineWidth(1)
    for q in range(total):
        col = q // GRID["questions_per_col"]
        row = q % GRID["questions_per_col"]
        number = q + 1
        base_x = (GRID["x"] + col * GRID["col_gap"] + GRID["number_width"]) * mm
        base_y = _top(GRID["y_from_top"] + row * GRID["row_gap"] + GRID["bubble"] / 2)
        c.setFont("Helvetica-Bold", 8)
        c.drawRightString(base_x - 2 * mm, base_y - 2.2, f"{number:02d}")
        for i, letter in enumerate(OPTIONS):
            cx = base_x + i * GRID["option_gap"] * mm + radius
            c.circle(cx, base_y, radius, fill=0, stroke=1)
            c.setFont("Helvetica", 6)
            c.drawCentredString(cx, base_y - 6.8, letter)


def build_payload(prova: dict[str, Any], aluno: dict[str, Any]) -> str:
    data = {
        "v": 1,
        "prova_id": prova.get("id") or "",
        "aluno_id": aluno.get("id") or "",
        "matricula": aluno.get("matricula") or "",
        "nome": aluno.get("nome") or "",
        "n": int(prova.get("total_questoes") or 20),
    }
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def draw_sheet(c: canvas.Canvas, prova: dict[str, Any], aluno: dict[str, Any]) -> None:
    _draw_fiducials(c)
    payload = build_payload(prova, aluno)
    qr_img = _qr_image(payload)
    size = QR["size"] * mm
    c.drawImage(qr_img, QR["x"] * mm, _top(QR["y_from_top"] + QR["size"]), size, size, mask="auto")
    _draw_header(c, prova, aluno)
    _draw_bubbles(c, int(prova.get("total_questoes") or 20))
    c.setFont("Helvetica", 7)
    c.setFillColorRGB(0.4, 0.45, 0.5)
    c.drawCentredString(PAGE_W / 2, 8 * mm, "Gaba OMR · não escreva sobre as marcas de canto nem sobre o QR Code")


def load_alunos(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "alunos" in data:
            data = data["alunos"]
        return list(data)
    alunos: list[dict[str, Any]] = []
    with path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            alunos.append(
                {
                    "id": (row.get("id") or "").strip(),
                    "nome": (row.get("nome") or "").strip(),
                    "matricula": (row.get("matricula") or "").strip(),
                    "turma": (row.get("turma") or "").strip(),
                }
            )
    return alunos


def generate(prova: dict[str, Any], alunos: list[dict[str, Any]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(out_path), pagesize=A4)
    if not alunos:
        raise SystemExit("Nenhum aluno informado.")
    for aluno in alunos:
        if not aluno.get("id"):
            aluno["id"] = str(uuid4())
        draw_sheet(c, prova, aluno)
        c.showPage()
    c.save()


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera PDF nominal A4 com QR e âncoras OMR")
    parser.add_argument("--prova", required=True, help="JSON da prova (saída do parser_docx.py)")
    parser.add_argument("--alunos", required=True, help="CSV ou JSON com id,nome,matricula,turma")
    parser.add_argument("-o", "--out", default="saida/folhas_nominais.pdf", help="PDF de saída")
    args = parser.parse_args()

    prova = json.loads(Path(args.prova).read_text(encoding="utf-8"))
    if not prova.get("id"):
        prova["id"] = str(uuid4())
    alunos = load_alunos(Path(args.alunos))
    out = Path(args.out)
    generate(prova, alunos, out)
    print(f"PDF gerado: {out} ({len(alunos)} folhas). prova_id={prova['id']}")


if __name__ == "__main__":
    main()
