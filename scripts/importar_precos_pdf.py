"""Atualiza os preços do dia a partir do PDF "PREÇOS - À VISTA" (tabela por região, com S-500, S-10 etc.).

Uso:
    python scripts/importar_precos_pdf.py "C:/caminho/Preços Atualizados.pdf" --sem-gravar   # só mostra
    python scripts/importar_precos_pdf.py "C:/caminho/Preços Atualizados.pdf"                # grava

Regras:
  - A data vem do cabeçalho do PDF (ou de --data).
  - Parte do snapshot desse dia (se já existir, por exemplo o do portal) ou do mais recente anterior.
  - Postos que estão no PDF recebem S-500 e S-10 do PDF ("-" no PDF = sem preço).
  - Postos que não estão no PDF mantêm o preço que já tinham. Postos do PDF que o site não conhece entram
    com a região e a bandeira do próprio PDF.
  - O snapshot gravado leva "origem": "pdf". O robô do portal (--automatico) não sobrescreve, no mesmo dia,
    um snapshot vindo de PDF; no dia seguinte ele volta a rodar normalmente.
Precisa de pdfplumber (pip install pdfplumber).
"""
import argparse
import copy
import re
import sys
from datetime import datetime

from atualizar_precos_portal import normalizar, titulo
from comum import DADOS, gravar_json, ler_json, limpar, numero
from importar_precos import REGIOES

COLUNAS = 13  # posto, rodovia, cidade, S-500, S-10, S-10 ADIT, ARLA, GAS COM, GAS ADT, ETANOL, GNV, BANDEIRA, CONTATO


def regiao_do_cabecalho(celulas: list[str]) -> str | None:
    """Chave de REGIOES se a linha for o cabeçalho de uma região; senão None."""
    nome = celulas[0].upper()
    if nome in REGIOES and celulas[3].upper().replace(" ", "") in ("S-500", "S500"):
        return nome
    # a primeira região vem embaralhada com o título das colunas ("OLEO AL")
    if nome.startswith("OLEO") and nome.split()[-1] in REGIOES:
        return nome.split()[-1]
    return None


def extrair_linhas(tabelas: list[list[list[str | None]]]) -> list[dict]:
    """Converte as tabelas do PDF em linhas {POSTO, regiao, rodovia, cidade, s500, s10, bandeira}."""
    linhas, regiao = [], None
    for tabela in tabelas:
        for bruta in tabela:
            celulas = [limpar(c) for c in bruta]
            if len(celulas) < COLUNAS:
                continue
            r = regiao_do_cabecalho(celulas)
            if r:
                regiao = r
                continue
            if regiao is None or not celulas[0] or not celulas[3] or celulas[3].upper().replace(" ", "") == "S-500":
                continue
            linhas.append({
                "POSTO": celulas[0],
                "regiao": regiao,
                "rodovia": celulas[1],
                "cidade": celulas[2],
                "s500": numero(celulas[3]),
                "s10": numero(celulas[4]),
                "bandeira": celulas[11].upper(),
            })
    return linhas


def sobrepor(base: dict, linhas: list[dict]) -> tuple[dict, dict]:
    """Aplica os preços do PDF sobre o snapshot-base. Devolve (snapshot novo, relatório)."""
    snap = copy.deepcopy(base)
    indice = {normalizar(p["nome"]): p for r in snap["regioes"] for p in r["postos"]}
    mudaram, novos, vistos = [], [], set()
    for ln in linhas:
        k = normalizar(ln["POSTO"])
        if k in vistos:
            continue
        vistos.add(k)
        posto = indice.get(k)
        if posto is None:
            sigla, nome_regiao = REGIOES[ln["regiao"]]
            regiao = next((r for r in snap["regioes"] if r["sigla"] == sigla), None)
            if regiao is None:
                regiao = {"sigla": sigla, "nome": nome_regiao, "postos": []}
                snap["regioes"].append(regiao)
            posto = {"nome": titulo(ln["POSTO"]), "rodovia": ln["rodovia"], "cidade": ln["cidade"], "s500": None, "s10": None, "bandeira": ln["bandeira"]}
            regiao["postos"].append(posto)
            novos.append(posto["nome"])
        antes = (posto["s500"], posto["s10"])
        posto["s500"], posto["s10"] = ln["s500"], ln["s10"]
        if antes != (posto["s500"], posto["s10"]) and posto["nome"] not in novos:
            mudaram.append(posto["nome"])
    mantidos = sorted(p["nome"] for r in snap["regioes"] for p in r["postos"] if normalizar(p["nome"]) not in vistos)
    return snap, {"no_pdf": len(vistos), "mudaram": mudaram, "novos": novos, "mantidos": mantidos}


def ler_pdf(caminho: str) -> tuple[str | None, list[dict]]:
    import pdfplumber

    tabelas, data_iso = [], None
    with pdfplumber.open(caminho) as pdf:
        for i, pagina in enumerate(pdf.pages):
            if i == 0:
                m = re.search(r"(\d{2})/(\d{2})/(\d{4})", pagina.extract_text() or "")
                if m:
                    data_iso = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
            tabelas.extend(pagina.extract_tables())
    return data_iso, extrair_linhas(tabelas)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("--data", help="data do snapshot (AAAA-MM-DD); padrão: a do cabeçalho do PDF")
    ap.add_argument("--sem-gravar", action="store_true")
    args = ap.parse_args()

    data_pdf, linhas = ler_pdf(args.pdf)
    data = args.data or data_pdf
    if not data or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", data):
        sys.exit("Não achei a data no PDF; informe com --data AAAA-MM-DD.")
    if not linhas:
        sys.exit("Nenhum posto encontrado no PDF: confira o formato.")
    if data > datetime.now().strftime("%Y-%m-%d"):
        sys.exit(f"A data {data} está no futuro. Nada gravado.")

    idx_path = DADOS / "precos" / "index.json"
    idx = ler_json(idx_path)
    bases = [d for d in idx["snapshots"] if d <= data]
    if not bases:
        sys.exit("Não há snapshot anterior para usar de base.")
    base = ler_json(DADOS / "precos" / f"{bases[-1]}.json")
    snap, rel = sobrepor(base, linhas)
    snap["atualizadoEm"] = data
    snap["origem"] = "pdf"

    print(f"PDF de {data}: {rel['no_pdf']} postos lidos (base: snapshot de {bases[-1]}).")
    print(f"  Preços alterados: {len(rel['mudaram'])}")
    if rel["novos"]:
        print(f"  Postos novos vindos do PDF: {', '.join(rel['novos'])}")
    if rel["mantidos"]:
        print(f"  Fora do PDF, mantidos como estavam ({len(rel['mantidos'])}): {', '.join(rel['mantidos'])}")
    if args.sem_gravar:
        print("Nada gravado (--sem-gravar).")
        return
    gravar_json(DADOS / "precos" / f"{data}.json", snap)
    idx["snapshots"] = sorted(set(idx["snapshots"]) | {data})
    gravar_json(idx_path, idx)
    print(f"Gravado em public/data/precos/{data}.json")


if __name__ == "__main__":
    main()
