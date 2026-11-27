"""Atualiza o S-10 dos preços com a página TED > Gestão de Preço da Ticketlog ("Postos onde abasteço").

Uso:
    python scripts/importar_precos_ticketlog.py scripts/entrada/ticketlog.csv --sem-gravar   # só mostra
    python scripts/importar_precos_ticketlog.py scripts/entrada/ticketlog.csv                # grava

O arquivo vem de scripts/ticketlog_extrair.js (rodado no console da página, logado na Ticketlog): uma linha por
posto e combustível, com campos separados por ";": posto;endereço;cidade - UF;combustível;volume;preço;última atualização.

Regras (decididas com o time):
  - Só "Diesel S-10 Comum". O S-500 não existe nessa página e continua vindo do PDF/portal.
  - Parte do snapshot mais recente até a data (por padrão, hoje) e troca o S-10 dos postos que casam por nome.
  - O preço da Ticketlog só vale se a "última atualização" tiver até --max-dias dias (padrão 7) e o valor for
    plausível (R$ 5,00 a R$ 11,00). Fora disso, o posto mantém o preço que já tinha.
  - Postos que a Ticketlog tem e a tabela não (os "fora da tabela") entram em "extras" com o S-10 válido.
  - Nomes que não casam sozinhos ficam em scripts/apelidos_ticketlog.json (nome normalizado -> nome normalizado).
  - O snapshot sai com "origem": "ticketlog". O robô do portal pode refazê-lo no mesmo dia e nos seguintes: ele
    preserva o S-10 da Ticketlog enquanto o preço tiver até 7 dias e só usa o preço do portal nos demais postos.
"""
import argparse
import copy
import re
import sys
from datetime import date, datetime

from atualizar_precos_portal import normalizar, titulo
from comum import DADOS, RAIZ, gravar_json, ler_json, limpar, numero

COMBUSTIVEL = "Diesel S-10 Comum"
ARQ_APELIDOS = RAIZ / "scripts" / "apelidos_ticketlog.json"
PRECO_MIN, PRECO_MAX = 5.0, 11.0


def ler_linhas(texto: str) -> list[dict]:
    """Linhas de Diesel S-10 Comum do arquivo extraído da página."""
    linhas = []
    for bruta in texto.splitlines():
        partes = [limpar(p) for p in bruta.split(";")]
        if len(partes) < 7 or partes[3] != COMBUSTIVEL:
            continue
        try:
            data = datetime.strptime(partes[6], "%d/%m/%Y").date()
        except ValueError:
            data = None  # a página mostra "-" quando não há data
        cidade, _, uf = partes[2].rpartition(" - ")
        linhas.append({"nome": partes[0], "cidade": cidade or partes[2], "uf": uf if cidade else "", "preco": numero(partes[5]), "data": data})
    return linhas


def motivo_descarte(t: dict, hoje: date, max_dias: int) -> str | None:
    if t["preco"] is None or not (PRECO_MIN <= t["preco"] <= PRECO_MAX):
        return "preço fora do plausível"
    if t["data"] is None:
        return "sem data"
    idade = (hoje - t["data"]).days
    if idade < 0:
        return "data no futuro"
    if idade > max_dias:
        return f"preço de {idade} dias atrás"
    return None


def sobrepor(base: dict, linhas: list[dict], hoje: date, max_dias: int, apelidos: dict) -> tuple[dict, dict]:
    """Aplica o S-10 da Ticketlog sobre o snapshot-base. Devolve (snapshot novo, relatório)."""
    snap = copy.deepcopy(base)
    indice = {normalizar(p["nome"]): p for r in snap["regioes"] for p in r["postos"]}
    for p in indice.values():  # recomeça: a marca de fonte vale só para esta leitura
        p.pop("s10Fonte", None)
        p.pop("s10Data", None)

    atualizados, mudaram, velhos, extras, vistos = [], [], [], [], set()
    for t in linhas:
        k = normalizar(t["nome"])
        k = apelidos.get(k, k)
        if k in vistos:
            continue
        vistos.add(k)
        motivo = motivo_descarte(t, hoje, max_dias)
        posto = indice.get(k)
        if posto is not None:
            if motivo:
                velhos.append((posto["nome"], motivo))
                continue
            if posto["s10"] != t["preco"]:
                mudaram.append(posto["nome"])
            posto["s10"], posto["s10Fonte"], posto["s10Data"] = t["preco"], "ticketlog", t["data"].isoformat()
            atualizados.append(posto["nome"])
        elif not motivo:
            extras.append({"nome": titulo(t["nome"]), "cidade": t["cidade"].title(), "uf": t["uf"], "s10": t["preco"], "data": t["data"].isoformat()})

    snap["extras"] = sorted(extras, key=lambda e: e["nome"])
    snap["ticketlogEm"] = hoje.isoformat()
    snap["origem"] = "ticketlog"
    sem_linha = sorted(p["nome"] for k, p in indice.items() if k not in vistos)
    return snap, {"atualizados": atualizados, "mudaram": mudaram, "velhos": velhos, "extras": [e["nome"] for e in extras], "sem_linha": sem_linha}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("arquivo")
    ap.add_argument("--data", default=date.today().isoformat(), help="data do snapshot (AAAA-MM-DD); padrão: hoje")
    ap.add_argument("--max-dias", type=int, default=7, help="idade máxima do preço da Ticketlog, em dias (padrão 7)")
    ap.add_argument("--sem-gravar", action="store_true")
    args = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.data):
        sys.exit("--data deve estar no formato AAAA-MM-DD")
    hoje = date.fromisoformat(args.data)

    with open(args.arquivo, encoding="utf8") as f:
        linhas = ler_linhas(f.read())
    if not linhas:
        sys.exit(f"Nenhuma linha de '{COMBUSTIVEL}' no arquivo: confira se ele veio de scripts/ticketlog_extrair.js.")

    idx_path = DADOS / "precos" / "index.json"
    idx = ler_json(idx_path)
    bases = [d for d in idx["snapshots"] if d <= args.data]
    if not bases:
        sys.exit("Não há snapshot anterior para usar de base.")
    base = ler_json(DADOS / "precos" / f"{bases[-1]}.json")
    apelidos = ler_json(ARQ_APELIDOS) if ARQ_APELIDOS.exists() else {}

    snap, rel = sobrepor(base, linhas, hoje, args.max_dias, apelidos)
    snap["atualizadoEm"] = args.data

    print(f"Ticketlog de {args.data}: {len(linhas)} linhas de S-10 (base: snapshot de {bases[-1]}, idade máxima {args.max_dias} dias).")
    print(f"  S-10 atualizado em {len(rel['atualizados'])} postos da tabela ({len(rel['mudaram'])} com preço diferente).")
    if rel["velhos"]:
        print(f"  Mantidos como estavam, por preço velho ou inválido ({len(rel['velhos'])}): " + "; ".join(f"{n} ({m})" for n, m in rel["velhos"]))
    if rel["sem_linha"]:
        print(f"  Postos da tabela sem linha de S-10 na Ticketlog ({len(rel['sem_linha'])}): {', '.join(rel['sem_linha'])}")
    print(f"  Postos fora da tabela com S-10 válido ({len(rel['extras'])}): {', '.join(rel['extras'])}")
    if args.sem_gravar:
        print("Nada gravado (--sem-gravar).")
        return
    gravar_json(DADOS / "precos" / f"{args.data}.json", snap)
    idx["snapshots"] = sorted(set(idx["snapshots"]) | {args.data})
    gravar_json(idx_path, idx)
    print(f"Gravado em public/data/precos/{args.data}.json")


if __name__ == "__main__":
    main()
