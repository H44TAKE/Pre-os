"""Testes dos scripts de importação, com dados sintéticos (não tocam em public/data).

Rodar: python -m unittest discover -s scripts -p "test_*.py"
"""
import unittest

import atualizar_e_publicar as pub
import atualizar_precos_portal as pp
import importar_abastecimentos as ab
import importar_precos as pr
import importar_precos_pdf as pdf
import importar_precos_ticketlog as tl
from comum import achar_coluna, numero


class Comum(unittest.TestCase):
    def test_numero(self):
        self.assertEqual(numero("R$ 6,78"), 6.78)
        self.assertEqual(numero("1.234,56"), 1234.56)
        self.assertEqual(numero(7), 7.0)
        self.assertIsNone(numero(""))
        self.assertIsNone(numero("-"))

    def test_coluna_ignora_acento_e_caixa(self):
        self.assertEqual(achar_coluna(["Data", "Serviço", "Valor Unitário"], "servico"), 1)

    def test_coluna_ausente_lista_cabecalhos(self):
        with self.assertRaises(SystemExit) as e:
            achar_coluna(["A", "B"], "motorista")
        self.assertIn("Cabeçalhos da planilha", str(e.exception))


class Precos(unittest.TestCase):
    def test_blocos_por_regiao(self):
        linhas = [
            [None, "AL", None, None, None, None],
            ["", "POSTO", "S-500", "S-10", "BANDEIRA", "RODOVIA"],
            ["", "Alagoas 101", 7.19, 6.99, "br", "BR 101 / KM 204"],
            [None, None, None, None, None, None],
            [None, "BA NORTE", None, None, None, None],
            ["", "POSTO", "S-500", "S-10", "BANDEIRA", "RODOVIA"],
            ["", "Bendego", 6.97, None, "BR", "BR 116"],
        ]
        r = pr.extrair(linhas)
        self.assertEqual([x["sigla"] for x in r], ["AL", "BA-N"])
        self.assertEqual(r[0]["postos"][0]["s10"], 6.99)
        self.assertEqual(r[0]["postos"][0]["bandeira"], "BR")
        self.assertIsNone(r[1]["postos"][0]["s10"])


class Abastecimentos(unittest.TestCase):
    CAB = ["Data", "Hora", "Estabelecimento", "Motorista", "Serviço", "Quantidade", "Valor Unitário", "Valor Total"]

    def linhas(self):
        return [
            ["Relatório", "", "", "", "", "", "", ""],
            self.CAB,
            ["01/10/2026", "06:39:44", "POSTO RAVENA REDE HG", "AUGUSTO  CESAR", "diesel s-10 comum", "130", "6,78", "881,40"],
            ["texto solto sem valor", "", "", "", "", "", "", ""],
        ]

    def test_extrai_e_normaliza(self):
        rows = ab.extrair(self.linhas())
        self.assertEqual(len(rows), 1)
        r = rows[0]
        self.assertEqual(r["dataISO"], "2026-10-01")
        self.assertEqual(r["servico"], "DIESEL S-10 COMUM")
        self.assertEqual(r["estabKey"], "POSTO RAVENA REDE HG")
        self.assertEqual(r["motorista"], "Augusto Cesar")
        self.assertEqual(r["valor"], 6.78)
        self.assertEqual(r["valorTotal"], 881.4)
        self.assertEqual(r["hora"], "06:39:44")

    def test_mesclar_nao_duplica(self):
        rows = ab.extrair(self.linhas())
        todos, n = ab.mesclar(rows, rows)
        self.assertEqual((len(todos), n), (1, 0))
        outro = [dict(rows[0], hora="07:00:00")]
        todos, n = ab.mesclar(rows, outro)
        self.assertEqual((len(todos), n), (2, 1))
        self.assertEqual(todos[0]["hora"], "06:39:44")

    def test_nome_do_posto_segue_o_historico(self):
        novo = ab.extrair(self.linhas())
        assert novo[0]["estabNome"] == "Posto Ravena Rede HG"
        antigo = [dict(novo[0], estabNome="Posto Ravena (grafia antiga)", hora="01:00:00")]
        todos, _ = ab.mesclar(antigo, novo)
        self.assertEqual({r["estabNome"] for r in todos}, {"Posto Ravena (grafia antiga)"})

    def test_html_disfarcado_de_xls(self):
        p = ab._Tabelas()
        p.feed("<table><tr><th>Data</th><th>Posto</th></tr><tr><td>01/10/2026</td><td>A\n B</td></tr></table>")
        self.assertEqual(p.linhas, [["Data", "Posto"], ["01/10/2026", "A B"]])


class Portal(unittest.TestCase):
    ANTERIOR = {
        "atualizadoEm": "2026-11-13",
        "regioes": [
            {"sigla": "AL", "nome": "Alagoas", "postos": [{"nome": "Alagoas 101", "rodovia": "BR 101 / KM 204", "cidade": "São Sebastião", "s500": 7.19, "s10": 6.99, "bandeira": "BR"}]},
            {"sigla": "BA-N", "nome": "Bahia Norte", "postos": [
                {"nome": "Planalto II", "rodovia": "BR 116", "cidade": "Valadares", "s500": 6.69, "s10": 6.89, "bandeira": "SHELL"},
                {"nome": "Sumido", "rodovia": "BR 1", "cidade": "X", "s500": 7.0, "s10": 7.0, "bandeira": "BR"},
            ]},
        ],
    }

    def api(self, **extra):
        base = [
            {"POSTO": "POSTO ALAGOAS 101", "UF": "AL", "CIDADE": "SÃO SEBASTIÃO", "ENDERECO": "BR 101 KM 204 ZONA RURAL", "OLEO_DIESEL_COMUM": "R$ 8,17", "OLEO_DIESEL_SDEZ": "R$ 7,46", "ARLA": "R$ 3,89"},
            {"POSTO": "POSTO PLANALTO 2", "UF": "MG", "CIDADE": "GOV VALADARES", "ENDERECO": "ROD BR 116", "OLEO_DIESEL_SDEZ": "R$ 6,89"},
            {"POSTO": "POSTO NOVO TESTE", "UF": "BA", "CIDADE": "ITABUNA", "ENDERECO": "ROD BR 101", "OLEO_DIESEL_COMUM": "R$ 9,03", "OLEO_DIESEL_SDEZ": "R$ 9,02"},
        ]
        return base + extra.get("extras", [])

    def test_normalizar_igual_ao_do_site(self):
        self.assertEqual(pp.normalizar("POSTO PLANALTO 2"), pp.normalizar("Planalto II"))
        self.assertEqual(pp.normalizar("POSTO FALCÃO"), "FALCAO")
        self.assertEqual(pp.normalizar("Posto Ravena Rede HG"), "RAVENA")

    def test_posto_conhecido_mantem_regiao_nome_e_bandeira(self):
        snap, _ = pp.converter(self.api(), self.ANTERIOR, {})
        al = snap["regioes"][0]["postos"][0]
        self.assertEqual((snap["regioes"][0]["sigla"], al["nome"], al["bandeira"], al["rodovia"]), ("AL", "Alagoas 101", "BR", "BR 101 / KM 204"))
        self.assertEqual((al["s500"], al["s10"]), (8.17, 7.46))
        bn = next(r for r in snap["regioes"] if r["sigla"] == "BA-N")["postos"][0]
        self.assertEqual((bn["nome"], bn["bandeira"], bn["s500"], bn["s10"]), ("Planalto II", "SHELL", None, 6.89))

    def test_posto_novo_vai_para_regiao_a_classificar_e_e_reportado(self):
        snap, rel = pp.converter(self.api(), self.ANTERIOR, {})
        ba = next(r for r in snap["regioes"] if r["sigla"] == "BA")
        self.assertEqual(ba["postos"][0]["nome"], "Novo Teste")
        self.assertEqual(rel["novos"][0]["falta"], ["regiao", "bandeira"])

    def test_meta_classifica_posto_novo(self):
        meta = {"NOVO TESTE": {"regiao": "BA-N", "bandeira": "IPIRANGA", "nome": "Novo Teste"}}
        snap, rel = pp.converter(self.api(), self.ANTERIOR, meta)
        bn = next(r for r in snap["regioes"] if r["sigla"] == "BA-N")
        self.assertEqual({p["nome"] for p in bn["postos"]}, {"Planalto II", "Novo Teste"})
        self.assertEqual(rel["novos"], [])

    def test_relatorio_mudou_sumiu_sem_s10(self):
        _, rel = pp.converter(self.api(), self.ANTERIOR, {})
        self.assertEqual(rel["mudaram"], ["Alagoas 101", "Planalto II"])
        self.assertEqual(rel["sumiram"], ["Sumido"])
        self.assertEqual(rel["total"], 3)

    def test_ignora_duplicado_e_linha_sem_nome(self):
        extras = [{"POSTO": "POSTO ALAGOAS 101", "UF": "AL"}, {"POSTO": "", "UF": "AL"}]
        snap, rel = pp.converter(self.api(extras=extras), self.ANTERIOR, {})
        self.assertEqual(rel["total"], 3)


class ModoAutomatico(unittest.TestCase):
    def snap(self, s10):
        return {"regioes": [{"sigla": "AL", "nome": "Alagoas", "postos": [{"nome": "Alagoas 101", "rodovia": "", "cidade": "", "s500": 7.19, "s10": s10, "bandeira": "BR"}]}]}

    def test_mudou_detecta_preco_e_ignora_ordem_e_regiao(self):
        self.assertFalse(pp.mudou(self.snap(6.99), self.snap(6.99)))
        self.assertTrue(pp.mudou(self.snap(7.46), self.snap(6.99)))
        self.assertTrue(pp.mudou(self.snap(6.99), {"regioes": []}))


class PrecosPdf(unittest.TestCase):
    CAB = ["", "", "", "S-500", "S-10", "S-10 ADIT", "ARLA 32", "GAS COM", "GAS ADT", "ETANOL", "GNV", "BANDEIRA", "CONTATO"]

    def linha(self, nome, s500, s10, bandeira="BR", rodovia="BR 101 / KM 1", cidade="Cidade"):
        return [nome, rodovia, cidade, s500, s10, "-", "R$ 3,99", "R$ 6,69", "R$ 6,79", "R$ 5,24", "R$ -", bandeira, "Fulano\n77 9999-0000"]

    def tabelas(self):
        titulo = ["24/11/2026 PREÇOS - À VISTA"] + [""] * 12
        primeira = ["OLEO\nAL", "", "", "DIESEL B\nS-500", "S-10"] + [""] * 8  # cabeçalho embaralhado da 1ª região
        return [[
            titulo,
            primeira,
            self.linha("ALAGOAS 101", "R$ 7,19", "R$ 6,89"),
            ["BA SUL"] + self.CAB[1:],
            self.linha("ANEL VIÁRIO", "R$ 6,89", "R$ 6,99"),
            self.linha("LAJINHA", "R$ 6,49", "-", "IPIRANGA"),
            ["TO"] + self.CAB[1:],
            self.linha("TALISMA", "-", "R$ 6,59", "IPIRANGA"),
        ]]

    def base(self):
        mk = lambda nome, s500, s10: {"nome": nome, "rodovia": "r", "cidade": "c", "s500": s500, "s10": s10, "bandeira": "BR"}
        return {"regioes": [
            {"sigla": "AL", "nome": "Alagoas", "postos": [mk("Alagoas 101", 8.17, 7.46)]},
            {"sigla": "BA-S", "nome": "Bahia Sul", "postos": [mk("Anel Viário", 7.0, 7.0), mk("Só no portal", 9.0, 9.0)]},
        ]}

    def test_extrai_regioes_inclusive_a_do_cabecalho_embaralhado(self):
        ls = pdf.extrair_linhas(self.tabelas())
        self.assertEqual([(l["POSTO"], l["regiao"]) for l in ls], [("ALAGOAS 101", "AL"), ("ANEL VIÁRIO", "BA SUL"), ("LAJINHA", "BA SUL"), ("TALISMA", "TO")])
        self.assertEqual((ls[0]["s500"], ls[0]["s10"], ls[0]["bandeira"]), (7.19, 6.89, "BR"))

    def test_traco_no_pdf_vira_sem_preco(self):
        ls = {l["POSTO"]: l for l in pdf.extrair_linhas(self.tabelas())}
        self.assertIsNone(ls["LAJINHA"]["s10"])
        self.assertIsNone(ls["TALISMA"]["s500"])

    def test_sobrepor_atualiza_precos_e_mantem_quem_nao_esta_no_pdf(self):
        snap, rel = pdf.sobrepor(self.base(), pdf.extrair_linhas(self.tabelas()))
        precos = {p["nome"]: (p["s500"], p["s10"]) for r in snap["regioes"] for p in r["postos"]}
        self.assertEqual(precos["Alagoas 101"], (7.19, 6.89))
        self.assertEqual(precos["Anel Viário"], (6.89, 6.99))
        self.assertEqual(precos["Só no portal"], (9.0, 9.0))
        self.assertEqual(rel["mantidos"], ["Só no portal"])
        self.assertEqual(rel["mudaram"], ["Alagoas 101", "Anel Viário"])

    def test_posto_do_pdf_desconhecido_entra_com_regiao_e_bandeira_do_pdf(self):
        snap, rel = pdf.sobrepor(self.base(), pdf.extrair_linhas(self.tabelas()))
        to = next(r for r in snap["regioes"] if r["sigla"] == "TO")
        self.assertEqual((to["postos"][0]["nome"], to["postos"][0]["bandeira"], to["postos"][0]["s10"]), ("Talisma", "IPIRANGA", 6.59))
        lajinha = next(p for r in snap["regioes"] for p in r["postos"] if p["nome"] == "Lajinha")
        self.assertEqual(lajinha["bandeira"], "IPIRANGA")
        self.assertEqual(sorted(rel["novos"]), ["Lajinha", "Talisma"])

    def test_base_nao_e_alterada(self):
        base = self.base()
        pdf.sobrepor(base, pdf.extrair_linhas(self.tabelas()))
        self.assertEqual(base["regioes"][0]["postos"][0]["s10"], 7.46)

    def test_robo_nao_sobrescreve_snapshot_do_dia_vindo_de_pdf(self):
        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "precos").mkdir()
            antigo = pp.DADOS
            pp.DADOS = Path(tmp)
            try:
                (Path(tmp) / "precos" / "2026-11-24.json").write_text(json.dumps({"atualizadoEm": "2026-11-24", "origem": "pdf", "regioes": []}))
                (Path(tmp) / "precos" / "2026-11-23.json").write_text(json.dumps({"atualizadoEm": "2026-11-23", "regioes": []}))
                idx = {"snapshots": ["2026-11-23", "2026-11-24"]}
                self.assertTrue(pp.manual_do_dia(idx, "2026-11-24"))
                self.assertFalse(pp.manual_do_dia(idx, "2026-11-23"))  # snapshot do robô
                self.assertFalse(pp.manual_do_dia(idx, "2026-11-25"))  # dia seguinte: robô volta ao normal
            finally:
                pp.DADOS = antigo


class TicketlogS10(unittest.TestCase):
    HOJE = tl.date(2026, 11, 27)

    ARQUIVO = "\n".join([
        "POSTO ALAGOAS 101;RODOVIA BR 101;SAO SEBASTIAO - AL;Diesel S-10 Comum;13598;R$ 6,88;26/11/2026",
        "POSTO ALAGOAS 101;RODOVIA BR 101;SAO SEBASTIAO - AL;Arla 32;925;R$ 3,99;30/06/2026",
        "POSTO UIRAPURU REDE HG;RODOVIA BR 116;ITATIM - BA;Diesel S-10 Comum;1808;R$ 7,98;16/09/2026",
        "POSTO SALVADOR 324;RODOVIA BR 324;SALVADOR - BA;Diesel S-10 Comum;413;R$ 6,56;27/11/2026",
        "POSTO ITABUNA;TRAVESSA;ITABUNA - BA;Diesel S-10 Comum;623;R$ 94,90;26/11/2026",
        "POSTO REFORCO II;RODOVIA BR 101;UMBAUBA - SE;Diesel S-10 Comum;3889;R$ 7,42;26/11/2026",
        "POSTO TIGRAO;ROD BR 020;VILA BOA - GO;Diesel S-10 Comum;965;R$ 7,39;-",
        "POSTO ANTIGO;ROD;CIDADE - MG;Diesel S-10 Comum;10;R$ 7,00;01/01/2026",
    ])

    def base(self):
        mk = lambda nome, s10: {"nome": nome, "rodovia": "r", "cidade": "c", "s500": 7.0, "s10": s10, "bandeira": "BR"}
        return {"atualizadoEm": "2026-11-26", "origem": "pdf", "regioes": [
            {"sigla": "AL", "nome": "Alagoas", "postos": [mk("Alagoas 101", 6.89)]},
            {"sigla": "BA-N", "nome": "Bahia Norte", "postos": [mk("Uirapuru", 6.70), mk("Itabuna", 6.79), mk("Salvador", 6.80), mk("Sem Linha", 7.0)]},
        ]}

    def aplicar(self, base=None):
        linhas = tl.ler_linhas(self.ARQUIVO)
        return tl.sobrepor(base or self.base(), linhas, self.HOJE, 7, {"SALVADOR 324": "SALVADOR"})

    def postos(self, snap):
        return {p["nome"]: p for r in snap["regioes"] for p in r["postos"]}

    def test_le_so_s10_comum_e_trata_data_ausente(self):
        linhas = tl.ler_linhas(self.ARQUIVO)
        self.assertEqual(len(linhas), 7)  # a linha de Arla não entra
        self.assertEqual((linhas[0]["cidade"], linhas[0]["uf"], linhas[0]["preco"]), ("SAO SEBASTIAO", "AL", 6.88))
        self.assertIsNone(next(l for l in linhas if l["nome"] == "POSTO TIGRAO")["data"])

    def test_preco_recente_substitui_e_leva_a_marca_da_fonte(self):
        snap, rel = self.aplicar()
        p = self.postos(snap)
        self.assertEqual((p["Alagoas 101"]["s10"], p["Alagoas 101"]["s10Fonte"], p["Alagoas 101"]["s10Data"]), (6.88, "ticketlog", "2026-11-26"))
        self.assertEqual(p["Alagoas 101"]["s500"], 7.0)  # S-500 não vem da Ticketlog
        self.assertEqual(snap["origem"], "ticketlog")
        self.assertEqual(snap["ticketlogEm"], "2026-11-27")

    def test_apelido_liga_nome_diferente(self):
        snap, _ = self.aplicar()
        self.assertEqual(self.postos(snap)["Salvador"]["s10"], 6.56)

    def test_preco_velho_ou_implausivel_mantem_o_que_ja_havia(self):
        snap, rel = self.aplicar()
        p = self.postos(snap)
        self.assertEqual((p["Uirapuru"]["s10"], "s10Fonte" in p["Uirapuru"]), (6.70, False))
        self.assertEqual((p["Itabuna"]["s10"], "s10Fonte" in p["Itabuna"]), (6.79, False))
        motivos = dict(rel["velhos"])
        self.assertIn("72 dias", motivos["Uirapuru"])
        self.assertEqual(motivos["Itabuna"], "preço fora do plausível")

    def test_posto_fora_da_tabela_vira_extra_so_se_o_preco_for_valido(self):
        snap, rel = self.aplicar()
        self.assertEqual([e["nome"] for e in snap["extras"]], ["Reforco Ii"])
        self.assertEqual((snap["extras"][0]["s10"], snap["extras"][0]["uf"], snap["extras"][0]["data"]), (7.42, "SE", "2026-11-26"))
        self.assertEqual(rel["sem_linha"], ["Sem Linha"])

    def test_nova_leitura_apaga_marcas_antigas_e_nao_altera_a_base(self):
        base = self.base()
        base["regioes"][0]["postos"][0].update({"s10Fonte": "ticketlog", "s10Data": "2026-11-01"})
        original = repr(base)
        snap, _ = tl.sobrepor(base, [], self.HOJE, 7, {})
        self.assertNotIn("s10Fonte", self.postos(snap)["Alagoas 101"])
        self.assertEqual(repr(base), original)

    def test_snapshot_da_ticketlog_nao_trava_o_robo(self):
        import json
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "precos").mkdir()
            antigo = pp.DADOS
            pp.DADOS = Path(tmp)
            try:
                (Path(tmp) / "precos" / "2026-11-27.json").write_text(json.dumps({"origem": "ticketlog", "regioes": []}))
                self.assertFalse(pp.manual_do_dia({"snapshots": ["2026-11-27"]}, "2026-11-27"))  # o robô pode refazer, preservando a Ticketlog
            finally:
                pp.DADOS = antigo


class PrioridadeTicketlog(unittest.TestCase):
    """O robô do portal só passa na frente da Ticketlog quando o preço dela tem mais de 7 dias (ou não existe)."""

    HOJE = pp.date(2026, 12, 2)

    def posto(self, nome, s10, fonte=None, data=None):
        p = {"nome": nome, "rodovia": "r", "cidade": "c", "s500": 7.0, "s10": s10, "bandeira": "BR"}
        if fonte:
            p["s10Fonte"], p["s10Data"] = fonte, data
        return p

    def snap(self, *postos, **extra):
        return {"regioes": [{"sigla": "AL", "nome": "Alagoas", "postos": list(postos)}], **extra}

    def test_ticketlog_dentro_do_prazo_vence_o_portal(self):
        portal = self.snap(self.posto("Alagoas 101", 7.46))
        anterior = self.snap(self.posto("Alagoas 101", 6.88, "ticketlog", "2026-11-26"), ticketlogEm="2026-11-27")
        r = pp.manter_ticketlog(portal, anterior, self.HOJE)  # 6 dias de idade
        p = r["regioes"][0]["postos"][0]
        self.assertEqual((p["s10"], p["s10Fonte"], p["s10Data"]), (6.88, "ticketlog", "2026-11-26"))
        self.assertEqual(r["ticketlogEm"], "2026-11-27")

    def test_ticketlog_com_mais_de_7_dias_perde_para_o_portal(self):
        anterior = self.snap(self.posto("Alagoas 101", 6.88, "ticketlog", "2026-11-25"), ticketlogEm="2026-11-27")
        r = pp.manter_ticketlog(self.snap(self.posto("Alagoas 101", 7.46)), anterior, pp.date(2026, 12, 3))  # 8 dias
        p = r["regioes"][0]["postos"][0]
        self.assertEqual((p["s10"], "s10Fonte" in p), (7.46, False))
        self.assertNotIn("ticketlogEm", r)

    def test_limite_de_7_dias_e_inclusivo(self):
        anterior = self.snap(self.posto("Alagoas 101", 6.88, "ticketlog", "2026-11-25"), ticketlogEm="2026-11-27")
        r = pp.manter_ticketlog(self.snap(self.posto("Alagoas 101", 7.46)), anterior, self.HOJE)  # 25/11 -> 02/12 = 7 dias
        self.assertEqual(r["regioes"][0]["postos"][0]["s10"], 6.88)

    def test_posto_sem_leitura_da_ticketlog_fica_com_o_portal(self):
        portal = self.snap(self.posto("Linhares", 6.97))
        anterior = self.snap(self.posto("Linhares", 6.77))  # veio de PDF, sem marca
        r = pp.manter_ticketlog(portal, anterior, self.HOJE)
        self.assertEqual(r["regioes"][0]["postos"][0]["s10"], 6.97)

    def test_extras_vencidos_somem_e_os_validos_continuam(self):
        extras = [{"nome": "Reforco Ii", "cidade": "x", "uf": "SE", "s10": 7.42, "data": "2026-11-30"},
                  {"nome": "Reforco 6", "cidade": "y", "uf": "AL", "s10": 7.82, "data": "2026-11-20"}]
        anterior = self.snap(self.posto("Alagoas 101", 6.88, "ticketlog", "2026-11-30"), ticketlogEm="2026-12-01", extras=extras)
        r = pp.manter_ticketlog(self.snap(self.posto("Alagoas 101", 7.46)), anterior, self.HOJE)
        self.assertEqual([e["nome"] for e in r["extras"]], ["Reforco Ii"])

    def test_nao_altera_o_snapshot_anterior(self):
        anterior = self.snap(self.posto("Alagoas 101", 6.88, "ticketlog", "2026-11-30"), ticketlogEm="2026-12-01")
        antes = repr(anterior)
        pp.manter_ticketlog(self.snap(self.posto("Alagoas 101", 7.46)), anterior, self.HOJE)
        self.assertEqual(repr(anterior), antes)


class Publicar(unittest.TestCase):
    """Usa um repositório 'origem' temporário no disco; nada vai para o GitHub."""

    def setUp(self):
        import subprocess
        import tempfile
        from pathlib import Path

        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        self.origem = base / "origem.git"
        self.clone = base / "clone"
        run = lambda *a, cwd=None: subprocess.run(a, cwd=cwd, check=True, capture_output=True, text=True, encoding="utf8", errors="replace")
        run("git", "init", "--bare", "-b", "main", str(self.origem))
        run("git", "clone", str(self.origem), str(self.clone))
        run("git", "config", "user.name", "Teste", cwd=self.clone)
        run("git", "config", "user.email", "teste@example.com", cwd=self.clone)
        (self.clone / "public/data/precos").mkdir(parents=True)
        (self.clone / "public/data/precos/a.json").write_text("{}")
        run("git", "add", "-A", cwd=self.clone)
        run("git", "commit", "-m", "base", cwd=self.clone)
        run("git", "push", "origin", "HEAD:main", cwd=self.clone)
        self.run = run

    def tearDown(self):
        self.tmp.cleanup()

    def test_sem_mudanca_nao_publica(self):
        publicou, detalhe = pub.publicar(self.clone, "main", "x")
        self.assertEqual((publicou, detalhe), (False, "nada a publicar"))

    def test_com_mudanca_commita_e_envia_so_a_pasta_de_dados(self):
        (self.clone / "public/data/precos/b.json").write_text('{"novo": true}')
        (self.clone / "outro.txt").write_text("nao deve entrar")
        publicou, _ = pub.publicar(self.clone, "main", "Preços de teste")
        self.assertTrue(publicou)
        log = self.run("git", "log", "--oneline", "main", cwd=self.origem).stdout
        self.assertIn("Preços de teste", log)
        arquivos = self.run("git", "show", "--name-only", "--format=", "main", cwd=self.origem).stdout.split()
        self.assertEqual(arquivos, ["public/data/precos/b.json"])


if __name__ == "__main__":
    unittest.main()
