"""Atualiza os preços do site a partir do portal Gestão de Abastecimentos (tela Comercial).

Uso:
    python scripts/atualizar_precos_portal.py                  # entra no portal, lê e grava o snapshot de hoje
    python scripts/atualizar_precos_portal.py --sem-gravar     # só mostra o que mudaria
    python scripts/atualizar_precos_portal.py --mostrar        # abre o navegador à vista (para depurar o login)
    python scripts/atualizar_precos_portal.py --json ARQ.json  # usa uma resposta já salva, sem entrar no portal
    python scripts/atualizar_precos_portal.py --automatico     # modo do agendador (veja abaixo)

Modo --automatico: só grava se algum preço mudou desde o último snapshot e se recusa a gravar
(código de saída 3) quando aparece posto novo sem região/bandeira em scripts/postos_meta.json.

O login fica no arquivo scripts/.env (veja scripts/.env.example), que o Git ignora.
Só lê: o robô faz login, abre a tela Comercial e captura a resposta que o próprio portal pede.
"""
import argparse
import json
import os
import re
import sys
from datetime import date
from pathlib import Path

from comum import DADOS, RAIZ, gravar_json, ler_json, limpar, numero, sem_acento

URL_PADRAO = "https://gestaoabastecimento.redehg.com.br"
ARQ_ENV = RAIZ / "scripts" / ".env"
ARQ_META = RAIZ / "scripts" / "postos_meta.json"

ROMANOS = {"I": "1", "II": "2", "III": "3", "IV": "4", "V": "5", "VI": "6"}
BANDEIRAS = ["BR", "IPIRANGA", "SHELL", "REDE HG", "TOTAL", "RIO BRANCO"]

# o portal só informa a UF; BA e MG têm mais de uma região no site e precisam de classificação
REGIAO_POR_UF = {"AL": ("AL", "Alagoas"), "ES": ("ES", "Espírito Santo"), "TO": ("TO", "Tocantins")}
REGIAO_A_CLASSIFICAR = {"BA": ("BA", "Bahia (a classificar)"), "MG": ("MG", "Minas Gerais (a classificar)")}


def normalizar(nome: str) -> str:
    """Mesma regra do site (src/lib/match.ts): sem prefixo POSTO, sem bandeira no fim, sem acento, romano -> arábico."""
    s = sem_acento(nome).upper().strip()
    s = re.sub(r"^AUTO\s+POSTO\s+", "", s)
    s = re.sub(r"^POSTO\s+", "", s)
    for b in BANDEIRAS:
        s = re.sub(r"\s+" + re.escape(b) + "$", "", s)
    partes = re.sub(r"\s+", " ", s).strip().split(" ")
    partes[-1] = ROMANOS.get(partes[-1], partes[-1])
    return " ".join(partes)


def titulo(nome: str) -> str:
    """Nome de exibição de um posto novo: sem o prefixo POSTO e em caixa de título."""
    s = re.sub(r"^(AUTO\s+)?POSTO\s+", "", limpar(nome), flags=re.I)
    return re.sub(r"\bHg\b", "HG", s.title())


# ---------------------------------------------------------------- conversão (sem rede)

def converter(linhas: list[dict], anterior: dict, meta: dict) -> tuple[dict, dict]:
    """Converte a resposta do portal no formato do site.

    Postos que já existiam mantêm região, nome, rodovia, cidade e bandeira do snapshot anterior (o
    portal não informa isso). Postos novos usam `meta` ({nome normalizado: {regiao, bandeira, ...}});
    sem meta, caem numa região "a classificar" da UF. Devolve (snapshot, relatório).
    """
    antigos = {}
    ordem_regioes = []
    for r in anterior.get("regioes", []):
        ordem_regioes.append((r["sigla"], r["nome"]))
        for p in r["postos"]:
            antigos[normalizar(p["nome"])] = (r["sigla"], r["nome"], p)

    por_regiao: dict[tuple[str, str], list[dict]] = {}
    novos, vistos = [], set()
    for d in linhas:
        k = normalizar(d.get("POSTO", ""))
        if not k or k in vistos:
            continue
        vistos.add(k)
        preco = {"s500": numero(d.get("OLEO_DIESEL_COMUM")), "s10": numero(d.get("OLEO_DIESEL_SDEZ"))}
        if k in antigos:
            sigla, nome_regiao, p = antigos[k]
            posto = {"nome": p["nome"], "rodovia": p["rodovia"], "cidade": p["cidade"], **preco, "bandeira": p["bandeira"]}
            chave = (sigla, nome_regiao)
        else:
            m = meta.get(k, {})
            uf = limpar(d.get("UF")).upper()
            if m.get("regiao"):
                chave = next((rg for rg in ordem_regioes if rg[0] == m["regiao"]), (m["regiao"], m.get("nomeRegiao", m["regiao"])))
            else:
                chave = REGIAO_POR_UF.get(uf) or REGIAO_A_CLASSIFICAR.get(uf) or (uf or "??", f"{uf or 'Sem UF'} (a classificar)")
            posto = {
                "nome": m.get("nome") or titulo(d["POSTO"]),
                "rodovia": limpar(d.get("ENDERECO")),
                "cidade": limpar(d.get("CIDADE")).title(),
                **preco,
                "bandeira": m.get("bandeira", ""),
            }
            if not m.get("regiao") or "bandeira" not in m:
                novos.append({"posto": posto["nome"], "uf": uf, "regiao": chave[0], "falta": [x for x, ok in (("regiao", m.get("regiao")), ("bandeira", "bandeira" in m)) if not ok]})
        por_regiao.setdefault(chave, []).append(posto)

    ordem = [r for r in ordem_regioes if r in por_regiao] + sorted(r for r in por_regiao if r not in ordem_regioes)
    regioes = [{"sigla": s, "nome": n, "postos": por_regiao[(s, n)]} for s, n in ordem]

    precos_antes = {normalizar(p["nome"]): (p["s500"], p["s10"]) for r in anterior.get("regioes", []) for p in r["postos"]}
    mudaram = [
        p["nome"]
        for r in regioes
        for p in r["postos"]
        if normalizar(p["nome"]) in precos_antes and precos_antes[normalizar(p["nome"])] != (p["s500"], p["s10"])
    ]
    sumiram = sorted(p["nome"] for r in anterior.get("regioes", []) for p in r["postos"] if normalizar(p["nome"]) not in vistos)
    relatorio = {
        "total": sum(len(r["postos"]) for r in regioes),
        "mudaram": mudaram,
        "novos": novos,
        "sumiram": sumiram,
        "sem_s10": sorted(p["nome"] for r in regioes for p in r["postos"] if p["s10"] is None),
    }
    return {"atualizadoEm": "", "regioes": regioes}, relatorio


def mudou(snapshot: dict, base: dict) -> bool:
    """True se algum posto entrou, saiu ou trocou de preço em relação ao snapshot-base."""
    def mapa(s: dict) -> dict:
        return {normalizar(p["nome"]): (p["s500"], p["s10"]) for r in s.get("regioes", []) for p in r["postos"]}

    return mapa(snapshot) != mapa(base)


def manual_do_dia(idx: dict, data: str) -> bool:
    """True se o snapshot da própria data foi gravado à mão a partir de um PDF e o robô não deve sobrescrevê-lo.

    O snapshot da Ticketlog não entra aqui: o robô pode refazê-lo, porque preserva o S-10 da Ticketlog que
    ainda estiver dentro do prazo (veja manter_ticketlog).
    """
    if data not in idx["snapshots"]:
        return False
    return ler_json(DADOS / "precos" / f"{data}.json").get("origem") == "pdf"


LIMITE_TICKETLOG_DIAS = 7


def manter_ticketlog(snapshot: dict, ultimo: dict, hoje: date, max_dias: int = LIMITE_TICKETLOG_DIAS) -> dict:
    """Prioridade da Ticketlog: o S-10 dela vale enquanto o preço tiver até max_dias dias.

    O robô só passa na frente (usa o preço do portal) nos postos em que o preço da Ticketlog ficou mais velho que
    isso ou não existe. Copia do snapshot anterior o S-10 vindo da Ticketlog ainda dentro do prazo, e também os
    postos "extras" (fora da tabela) com preço dentro do prazo.
    """
    def idade(iso: str) -> int:
        return (hoje - date.fromisoformat(iso)).days

    vigentes = {
        normalizar(p["nome"]): p
        for r in ultimo.get("regioes", [])
        for p in r["postos"]
        if p.get("s10Fonte") == "ticketlog" and p.get("s10Data") and p.get("s10") is not None and 0 <= idade(p["s10Data"]) <= max_dias
    }
    for r in snapshot["regioes"]:
        for p in r["postos"]:
            t = vigentes.get(normalizar(p["nome"]))
            if t:
                p["s10"], p["s10Fonte"], p["s10Data"] = t["s10"], "ticketlog", t["s10Data"]
    extras = [e for e in ultimo.get("extras", []) if 0 <= idade(e["data"]) <= max_dias]
    if (vigentes or extras) and ultimo.get("ticketlogEm"):
        snapshot["ticketlogEm"] = ultimo["ticketlogEm"]
        snapshot["extras"] = extras
    return snapshot


# ---------------------------------------------------------------- leitura do portal (rede)

def carregar_credenciais() -> tuple[str, str, str]:
    """Lê PORTAL_USUARIO / PORTAL_SENHA (e PORTAL_URL) de scripts/.env ou das variáveis de ambiente."""
    env = dict(os.environ)
    if ARQ_ENV.exists():
        for linha in ARQ_ENV.read_text(encoding="utf8").splitlines():
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    usuario, senha = env.get("PORTAL_USUARIO", ""), env.get("PORTAL_SENHA", "")
    if not usuario or not senha:
        sys.exit("Faltam PORTAL_USUARIO e PORTAL_SENHA. Copie scripts/.env.example para scripts/.env e preencha.")
    return usuario, senha, env.get("PORTAL_URL", URL_PADRAO).rstrip("/")


def ler_portal(usuario: str, senha: str, base: str, mostrar: bool) -> list[dict]:
    from playwright.sync_api import TimeoutError as Timeout
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        navegador = pw.chromium.launch(channel="chrome", headless=not mostrar)
        try:
            pagina = navegador.new_page()
            pagina.goto(base + "/portal/login", wait_until="domcontentloaded")
            pagina.locator("input[type=password]").fill(senha)
            pagina.locator("input:not([type=password]):not([type=hidden])").first.fill(usuario)
            pagina.get_by_role("button", name=re.compile("entrar", re.I)).click()
            try:
                pagina.wait_for_url(lambda u: "/portal/login" not in u, timeout=30_000)
            except Timeout:
                sys.exit("O login não completou. Confira usuário e senha (rode com --mostrar para ver a tela).")
            try:
                with pagina.expect_response(lambda r: "/api/commercial/" in r.url and r.request.method == "GET" and r.status == 200, timeout=120_000) as resp:
                    pagina.goto(base + "/portal/comercial", wait_until="domcontentloaded")
                dados = resp.value.json()
            except Timeout:
                sys.exit("A tela Comercial não devolveu os preços a tempo. Tente de novo.")
        finally:
            navegador.close()
    if not isinstance(dados, list):
        sys.exit("Resposta do portal em formato inesperado (esperava uma lista de postos).")
    return dados


# ---------------------------------------------------------------- principal

def mostrar(relatorio: dict, anterior_total: int) -> None:
    print(f"{relatorio['total']} postos no portal (snapshot anterior: {anterior_total}).")
    print(f"  Preços alterados: {len(relatorio['mudaram'])}")
    if relatorio["novos"]:
        print(f"  Postos novos ({len(relatorio['novos'])}), a classificar em scripts/postos_meta.json:")
        for n in relatorio["novos"]:
            print(f"    - {n['posto']} ({n['uf']}) falta: {', '.join(n['falta'])}")
    if relatorio["sumiram"]:
        print(f"  Saíram da lista do portal ({len(relatorio['sumiram'])}): {', '.join(relatorio['sumiram'])}")
    if relatorio["sem_s10"]:
        print(f"  Sem S-10 ({len(relatorio['sem_s10'])}): {', '.join(relatorio['sem_s10'])}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=date.today().isoformat(), help="data do snapshot (AAAA-MM-DD); padrão: hoje")
    ap.add_argument("--json", help="usa um JSON já salvo em vez de entrar no portal")
    ap.add_argument("--mostrar", action="store_true", help="abre o navegador à vista")
    ap.add_argument("--sem-gravar", action="store_true", help="só mostra o resumo, sem gravar")
    ap.add_argument("--automatico", action="store_true", help="modo do agendador: só grava se algo mudou e recusa postos novos sem classificação")
    args = ap.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.data):
        sys.exit("--data deve estar no formato AAAA-MM-DD")

    idx_path = DADOS / "precos" / "index.json"
    idx = ler_json(idx_path) if idx_path.exists() else {"snapshots": []}
    if args.automatico and manual_do_dia(idx, args.data):
        print("Os preços de hoje vieram de um PDF manual: o robô não sobrescreve. Amanhã volta ao normal.")
        return

    if args.json:
        linhas = json.loads(Path(args.json).read_text(encoding="utf8"))
    else:
        usuario, senha, base = carregar_credenciais()
        linhas = ler_portal(usuario, senha, base, args.mostrar)

    anteriores = [d for d in idx["snapshots"] if d < args.data]
    anterior = ler_json(DADOS / "precos" / f"{anteriores[-1]}.json") if anteriores else {"regioes": []}
    anterior_total = sum(len(r["postos"]) for r in anterior["regioes"])
    ultimos = [d for d in idx["snapshots"] if d <= args.data]
    ultimo = ler_json(DADOS / "precos" / f"{ultimos[-1]}.json") if ultimos else {"regioes": []}
    meta = ler_json(ARQ_META) if ARQ_META.exists() else {}

    snapshot, relatorio = converter(linhas, anterior, meta)
    if anterior_total and relatorio["total"] < anterior_total * 0.5:
        sys.exit(f"Resposta suspeita: só {relatorio['total']} postos (antes: {anterior_total}). Nada foi gravado.")
    snapshot["atualizadoEm"] = args.data
    snapshot = manter_ticketlog(snapshot, ultimo, date.fromisoformat(args.data))
    mostrar(relatorio, anterior_total)
    if args.automatico:
        if relatorio["novos"]:
            print("Há posto novo a classificar em scripts/postos_meta.json. Nada foi gravado.", file=sys.stderr)
            sys.exit(3)
        if not mudou(snapshot, ultimo):
            print("Sem mudanças desde o último snapshot. Nada gravado.")
            return
    if args.sem_gravar:
        print("Nada gravado (--sem-gravar).")
        return
    gravar_json(DADOS / "precos" / f"{args.data}.json", snapshot)
    idx["snapshots"] = sorted(set(idx["snapshots"]) | {args.data})
    gravar_json(idx_path, idx)
    print(f"Gravado em public/data/precos/{args.data}.json")


if __name__ == "__main__":
    main()
