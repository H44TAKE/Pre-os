"""Acrescenta abastecimentos ao histórico a partir do relatório da frota (RelatorioParametrizado).

Uso:
    python scripts/importar_abastecimentos.py RELATORIO.xls

O .xls do sistema é HTML disfarçado; um .xlsx real também é aceito. Os registros novos
são somados aos de public/data/abastecimentos.json, sem duplicar (mesma data, hora, posto,
motorista, produto, valor e quantidade).
"""
import argparse
import sys
from datetime import datetime
from html.parser import HTMLParser

from comum import DADOS, achar_coluna, gravar_json, ler_json, limpar, numero


class _Tabelas(HTMLParser):
    def __init__(self):
        super().__init__()
        self.linhas: list[list[str]] = []
        self._linha = None
        self._celula = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._linha = []
        elif tag in ("td", "th") and self._linha is not None:
            self._celula = []

    def handle_data(self, data):
        if self._celula is not None:
            self._celula.append(data)

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._celula is not None and self._linha is not None:
            self._linha.append(limpar("".join(self._celula)))
            self._celula = None
        elif tag == "tr" and self._linha is not None:
            if any(self._linha):
                self.linhas.append(self._linha)
            self._linha = None


def ler_linhas(caminho: str) -> list[list]:
    with open(caminho, "rb") as f:
        inicio = f.read(2)
    if inicio == b"PK":  # xlsx de verdade
        import openpyxl

        wb = openpyxl.load_workbook(caminho, data_only=True, read_only=True)
        return [list(r) for r in wb.worksheets[0].iter_rows(values_only=True)]
    texto = ""
    for enc in ("utf-8", "cp1252"):
        try:
            with open(caminho, encoding=enc) as f:
                texto = f.read()
            break
        except UnicodeDecodeError:
            continue
    p = _Tabelas()
    p.feed(texto)
    return p.linhas


FORMATOS = ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d")


def _data(v):
    if isinstance(v, datetime):
        return v
    s = limpar(v)
    for fmt in FORMATOS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def extrair(linhas: list[list]) -> list[dict]:
    """Localiza o cabeçalho e converte cada linha seguinte em um abastecimento."""
    n = None
    for k, cab in enumerate(linhas):
        if achar_coluna(cab, "data", obrigatoria=False) is not None and achar_coluna(
            cab, "estabelecimento", "posto", obrigatoria=False
        ) is not None:
            n = k
            break
    if n is None:
        raise SystemExit(f"Cabeçalho não encontrado. Primeiras linhas: {linhas[:3]}")
    cab = linhas[n]

    i_data = achar_coluna(cab, "data")
    i_estab = achar_coluna(cab, "estabelecimento", "posto")
    i_hora = achar_coluna(cab, "hora", obrigatoria=False)
    i_serv = achar_coluna(cab, "servico", "produto", "combustivel")
    i_val = achar_coluna(cab, "valor unitario", "preco unitario", "valor unit", "preco")
    i_mot = achar_coluna(cab, "motorista", "condutor", obrigatoria=False)
    i_qtd = achar_coluna(cab, "quantidade", "litros", "qtd", obrigatoria=False)
    i_tot = achar_coluna(cab, "valor total", "total", obrigatoria=False)

    rows, ignoradas = [], 0
    for lin in linhas[n + 1:]:
        def get(i):
            return lin[i] if i is not None and i < len(lin) else ""

        quando = _data(get(i_data))
        valor = numero(get(i_val))
        estab = limpar(get(i_estab))
        if quando is None or valor is None or not estab:
            ignoradas += 1
            continue
        bruto = limpar(get(i_hora)) if i_hora is not None else ""
        if ":" in bruto:
            hora = bruto[-8:] if len(bruto) > 8 else bruto
        elif ":" in limpar(get(i_data)) or isinstance(get(i_data), datetime):
            hora = quando.strftime("%H:%M:%S")
        else:
            hora = ""
        rows.append({
            "dataISO": quando.date().isoformat(),
            "servico": limpar(get(i_serv)).upper(),
            "valor": valor,
            "estabKey": estab.upper(),
            "estabNome": estab.title(),
            "hora": hora,
            "motorista": limpar(get(i_mot)).title(),
            "quantidade": numero(get(i_qtd)),
            "valorTotal": numero(get(i_tot)),
        })
    if ignoradas:
        print(f"Aviso: {ignoradas} linha(s) ignorada(s) por falta de data, valor ou posto.", file=sys.stderr)
    return rows


def assinatura(r: dict) -> tuple:
    return (r["dataISO"], r["hora"], r["estabKey"], r["motorista"], r["servico"], r["valor"], r["quantidade"])


def mesclar(existentes: list[dict], novos: list[dict]) -> tuple[list[dict], int]:
    """Soma os novos aos existentes sem duplicar; devolve (lista ordenada, quantos entraram)."""
    vistos = {assinatura(r) for r in existentes}
    adicionados = []
    for r in novos:
        a = assinatura(r)
        if a not in vistos:
            vistos.add(a)
            adicionados.append(r)
    todos = sorted(existentes + adicionados, key=lambda r: (r["dataISO"], r["hora"]))
    return todos, len(adicionados)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("arquivo")
    args = ap.parse_args()

    novos = extrair(ler_linhas(args.arquivo))
    if not novos:
        sys.exit("Nenhum abastecimento válido encontrado no arquivo.")
    caminho = DADOS / "abastecimentos.json"
    atual = ler_json(caminho) if caminho.exists() else {"rows": [], "servicos": [], "servicoPadrao": "DIESEL S-10 COMUM"}
    todos, n = mesclar(atual["rows"], novos)
    atual["rows"] = todos
    ordem = atual.get("servicos", [])
    atual["servicos"] = ordem + sorted({r["servico"] for r in todos} - set(ordem))
    gravar_json(caminho, atual)
    print(f"{n} abastecimento(s) novo(s) de {len(novos)} lidos; total agora: {len(todos)}.")


if __name__ == "__main__":
    main()
