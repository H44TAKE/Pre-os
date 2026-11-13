"""Testes dos scripts de importação, com dados sintéticos (não tocam em public/data).

Rodar: python -m unittest discover -s scripts -p "test_*.py"
"""
import unittest

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

    def test_html_disfarcado_de_xls(self):
        p = ab._Tabelas()
        p.feed("<table><tr><th>Data</th><th>Posto</th></tr><tr><td>01/10/2026</td><td>A\n B</td></tr></table>")
        self.assertEqual(p.linhas, [["Data", "Posto"], ["01/10/2026", "A B"]])


if __name__ == "__main__":
    unittest.main()
