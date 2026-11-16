"""Testes dos scripts de importação, com dados sintéticos (não tocam em public/data).

Rodar: python -m unittest discover -s scripts -p "test_*.py"
"""
import unittest

import atualizar_precos_portal as pp
import importar_abastecimentos as ab
import importar_precos as pr
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


if __name__ == "__main__":
    unittest.main()
