"""Funções compartilhadas pelos scripts de atualização de dados."""
import json
import re
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "public" / "data"


def limpar(s) -> str:
    """Remove quebras de linha e espaços duplicados."""
    return re.sub(r"\s+", " ", str(s if s is not None else "")).strip()


def sem_acento(s) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn")


def chave(s) -> str:
    """Forma comparável de um cabeçalho: sem acento, minúscula, só letras e números."""
    return re.sub(r"[^a-z0-9]+", " ", sem_acento(s).lower()).strip()


def achar_coluna(cabecalhos, *candidatos, obrigatoria=True):
    """Índice da primeira coluna cujo cabeçalho casa com algum dos candidatos.

    Falha listando os cabeçalhos encontrados, para o mapeamento ser corrigido em vez de chutado.
    """
    chaves = [chave(h) for h in cabecalhos]
    for cand in candidatos:
        c = chave(cand)
        for i, h in enumerate(chaves):
            if h == c:
                return i
    for cand in candidatos:
        c = chave(cand)
        for i, h in enumerate(chaves):
            if c in h:
                return i
    if obrigatoria:
        raise SystemExit(
            f"Coluna não encontrada (procurei por {list(candidatos)}).\n"
            f"Cabeçalhos da planilha: {[limpar(h) for h in cabecalhos]}"
        )
    return None


def numero(v):
    """Converte '1.234,56', 'R$ 6,78' ou número em float; vazio vira None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = limpar(v).replace("R$", "").strip()
    if s in ("", "-", "—"):
        return None
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def ler_json(caminho: Path):
    with open(caminho, encoding="utf8") as f:
        return json.load(f)


def gravar_json(caminho: Path, dados) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    with open(caminho, "w", encoding="utf8", newline="\n") as f:
        json.dump(dados, f, ensure_ascii=False, indent=1)
        f.write("\n")
