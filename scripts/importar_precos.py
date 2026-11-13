"""Gera um novo snapshot de preços a partir da aba "A VISTA" da planilha de preços (.xlsx).

Uso:
    python scripts/importar_precos.py ARQUIVO.xlsx --data 2026-11-20

A aba tem blocos por região: uma linha com a sigla da região na coluna B, uma linha de
cabeçalho (S-500, S-10, BANDEIRA...) e depois uma linha por posto. O script grava
public/data/precos/<data>.json e acrescenta a data em public/data/precos/index.json.
O site compara o snapshot mais recente com o anterior para mostrar a variação do S-10.
"""
import argparse
import re
import sys
from datetime import date

import openpyxl

from comum import DADOS, achar_coluna, chave, gravar_json, ler_json, limpar, numero

REGIOES = {
    "AL": ("AL", "Alagoas"),
    "ES": ("ES", "Espírito Santo"),
    "TO": ("TO", "Tocantins"),
    "BA NORTE": ("BA-N", "Bahia Norte"),
    "BA SUL": ("BA-S", "Bahia Sul"),
    "MG NORTE": ("MG-N", "Minas Gerais Norte"),
    "MG CENTRO": ("MG-C", "Minas Gerais Centro"),
    "MG SUL": ("MG-S", "Minas Gerais Sul"),
}


def extrair(linhas) -> list[dict]:
    """Recebe linhas (listas de células) e devolve as regiões com seus postos."""
    regioes: list[dict] = []
    atual = None
    cab = None
    for linha in linhas:
        celulas = [limpar(c) for c in linha]
        if not any(celulas):
            continue
        # linha de região: só a coluna B preenchida, com uma sigla conhecida
        outras = [c for i, c in enumerate(celulas) if c and i != 1]
        if len(celulas) > 1 and celulas[1].upper() in REGIOES and not outras:
            sigla, nome = REGIOES[celulas[1].upper()]
            atual = {"sigla": sigla, "nome": nome, "postos": []}
            regioes.append(atual)
            cab = None
            continue
        if atual is None:
            continue
        if cab is None:
            if any(chave(c) == "s 10" for c in celulas):
                cab = celulas
            continue

        def idx(*c):
            return achar_coluna(cab, *c, obrigatoria=False)

        def texto(*c):
            i = idx(*c)
            return celulas[i] if i is not None and i < len(celulas) else ""

        def valor(*c):
            i = idx(*c)
            return numero(linha[i]) if i is not None and i < len(linha) else None

        nome = texto("posto", "nome", "estabelecimento")
        if not nome:
            continue
        atual["postos"].append({
            "nome": nome,
            "rodovia": texto("rodovia", "km"),
            "cidade": texto("cidade", "municipio"),
            "s500": valor("s 500"),
            "s10": valor("s 10"),
            "bandeira": texto("bandeira").upper(),
        })
    return [r for r in regioes if r["postos"]]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("arquivo")
    ap.add_argument("--data", default=date.today().isoformat(), help="data dos preços (AAAA-MM-DD)")
    ap.add_argument("--aba", default="A VISTA")
    args = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.data):
        sys.exit("--data deve estar no formato AAAA-MM-DD")

    wb = openpyxl.load_workbook(args.arquivo, data_only=True, read_only=True)
    if args.aba not in wb.sheetnames:
        sys.exit(f"Aba '{args.aba}' não existe. Abas: {wb.sheetnames}")
    regioes = extrair(wb[args.aba].iter_rows(values_only=True))
    total = sum(len(r["postos"]) for r in regioes)
    if total == 0:
        sys.exit("Nenhum posto encontrado: confira o formato da aba.")

    gravar_json(DADOS / "precos" / f"{args.data}.json", {"atualizadoEm": args.data, "regioes": regioes})
    idx_path = DADOS / "precos" / "index.json"
    idx = ler_json(idx_path) if idx_path.exists() else {"snapshots": []}
    idx["snapshots"] = sorted(set(idx["snapshots"]) | {args.data})
    gravar_json(idx_path, idx)
    sem_s10 = sum(1 for r in regioes for p in r["postos"] if p["s10"] is None)
    print(f"{total} postos em {len(regioes)} regiões gravados em precos/{args.data}.json ({sem_s10} sem S-10).")


if __name__ == "__main__":
    main()
