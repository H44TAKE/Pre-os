# Painel de Preços · Rede HG

Painel interno da Rede HG / Transportadora Turbo para consultar o preço do diesel (S-500 e S-10) nos postos credenciados, acompanhar o histórico de abastecimentos da frota e comparar postos.

Site estático: React + Vite + TypeScript. Os dados ficam em arquivos JSON versionados e são atualizados por scripts Python.

## Telas

| Rota | O que faz |
| --- | --- |
| `/` Preços atuais | Resumo (menor/maior S-10, média por região, 5 mais baratos), busca, filtro por região e bandeira, ordenação, variação do S-10 contra a atualização anterior. Clicar num posto abre o painel lateral com preços, estatísticas, gráfico e abastecimentos. |
| `/historico` | Produto e período; resumo (abastecimentos, quantidade, gasto total, preço médio ponderado); gráfico com a média da rede e a faixa de menor/maior preço do dia, mais até 6 postos destacados; tabela de postos ordenável (preço médio, menor, maior, último, variação no período, tendência) com chave para ocultar o posto (a escolha fica salva no navegador); tabela diária estabelecimento × data. |
| `/comparar` | Dois postos lado a lado: preços, bandeira, histórico e diferenças. Inclui postos que só aparecem no histórico ("fora da tabela de preços"). |

Todo o estado de navegação (filtros, produto, período, posto aberto, postos comparados) fica na URL, então qualquer link pode ser compartilhado. O tema claro/escuro é lembrado no navegador.

## Requisitos

- Node.js 20 ou superior
- Python 3.10 ou superior com `openpyxl` (`pip install openpyxl`), só para atualizar dados

## Rodando

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes unitários (Vitest)
npm run typecheck  # checagem de tipos
npm run build      # checa tipos e gera dist/
npm run preview    # serve o dist/ localmente
```

## Estrutura

```
public/
  brand/               logos
  data/
    abastecimentos.json  histórico de abastecimentos
    precos/
      index.json         lista das datas de snapshot
      AAAA-MM-DD.json    um snapshot de preços por data
scripts/               importadores Python e seus testes
src/
  lib/                 regras puras: tipos, formatação, cruzamento de nomes, agregações, dados
  hooks/               estado na URL e filtro de período
  components/          layout, gaveta do posto, gráfico, lista de abastecimentos, UI comum
  pages/               PrecosPage, HistoricoPage, CompararPage
  styles/              tokens, base, layout, componentes, páginas
tests/                 testes unitários e de paridade com os dados reais
```

## Atualizando os dados

Rode a partir da raiz do projeto. Coloque os arquivos de origem em `scripts/entrada/` (crie a pasta; ela é ignorada pelo Git).

**Preços direto do portal (recomendado)**: o robô entra no portal Gestão de Abastecimentos, abre a tela Comercial e grava o snapshot de hoje.

1. Uma vez só: copie `scripts/.env.example` para `scripts/.env` e preencha `PORTAL_USUARIO` e `PORTAL_SENHA`. O Git ignora esse arquivo, então a senha nunca vai para o GitHub. Também precisa do Google Chrome instalado e de `pip install playwright`.
2. Para atualizar:

```bash
python scripts/atualizar_precos_portal.py --sem-gravar   # só mostra o que mudaria
python scripts/atualizar_precos_portal.py                # grava public/data/precos/<hoje>.json
```

O portal só informa a UF do posto, sem região do site (BA Norte/Sul, MG Norte/Centro/Sul) nem bandeira. Para postos que já existiam, o robô mantém esses dados do snapshot anterior. Postos novos aparecem no resumo como "a classificar"; para classificá-los, crie `scripts/postos_meta.json` com o nome normalizado como chave, por exemplo `{"EUCLIDES DA CUNHA 116": {"regiao": "BA-N", "bandeira": "BR", "nome": "Euclides da Cunha 116"}}`, e rode de novo. Se o robô não conseguir entrar, rode com `--mostrar` para ver a tela do login. Arquivos de apoio: `--json ARQ.json` usa uma resposta já salva.

**Atualização automática (Windows)**: uma tarefa agendada roda o robô em dias úteis, às 14h20 e às 17h30. Se os preços mudaram, ela grava o snapshot, faz commit e envia à `main`, e o Vercel atualiza o site. Se aparecer posto novo sem classificação, ou o login falhar, ela não publica nada e registra o motivo em `scripts/atualizacao.log`. Para ativar (uma vez, com `scripts/.env` preenchido):

```bash
powershell -ExecutionPolicy Bypass -File scripts/agendar_windows.ps1 -Nome "Seu Nome" -Email "voce@exemplo.com"
```

O script cria uma cópia dedicada do repositório em `%LOCALAPPDATA%\PainelPrecosRedeHG\repo` (a automação não mexe na pasta onde você trabalha) e copia o `scripts/.env` para lá. A tarefa só roda com você logado no Windows; se o PC estiver desligado no horário, roda ao ligar. Para rodar uma vez à mão: `python scripts/atualizar_e_publicar.py`. Para desativar: `Unregister-ScheduledTask -TaskName PainelPrecosRedeHG-AtualizarPrecos -Confirm:$false`.

**Preços por planilha** (alternativa; planilha `.xlsx`, aba `A VISTA`):

```bash
python scripts/importar_precos.py scripts/entrada/precos.xlsx --data 2026-11-20
```

Cria `public/data/precos/2026-11-20.json` e registra a data em `index.json`. O site usa o snapshot mais recente e compara com o anterior para exibir a variação do S-10. Os snapshots antigos ficam guardados.

**Abastecimentos** (relatório `RelatorioParametrizado`, `.xls`/`.xlsx`):

```bash
python scripts/importar_abastecimentos.py scripts/entrada/relatorio.xls
```

Acrescenta ao `abastecimentos.json` sem duplicar registros já existentes.

Depois, confira com `npm test` e `npm run build`, e faça commit dos JSON.

> Os scripts localizam as colunas pelo nome do cabeçalho. Se uma coluna esperada não existir, eles param e listam os cabeçalhos encontrados, sem gravar nada. O formato foi montado a partir da descrição das planilhas, e os testes usam dados sintéticos: **na primeira vez com um arquivo real, confira o resultado** (contagem de postos/registros impressa no final) e ajuste o mapeamento em `scripts/` se preciso.

Testes dos scripts: `python -m unittest discover -s scripts -p "test_*.py"`

## Cruzamento de nomes

Preços e histórico usam nomes diferentes para o mesmo posto ("Ravena" × "POSTO RAVENA REDE HG"; "Planalto II" × "POSTO PLANALTO 2"). `src/lib/match.ts` normaliza (prefixo POSTO, bandeira no fim, acentos, romano → arábico) e só casa nomes que ficam idênticos. Postos do histórico sem correspondência aparecem como "fora da tabela de preços".

## Publicação (Vercel)

O deploy sai da branch `main`. O Vercel detecta o Vite sozinho (`npm run build`, saída `dist/`). O `vercel.json` só redireciona as rotas do site (`/historico`, `/comparar`) para `index.html`, exceto `/data/`, `/brand/` e `/assets/`.

## Privacidade

Os JSON em `public/data/` incluem nomes de motoristas e valores de abastecimento e são servidos publicamente junto com o site. Quem tiver o link consegue ler esses arquivos. Para restringir o acesso é preciso proteger o site no próprio Vercel (por exemplo, proteção por senha ou autenticação); o repositório privado, sozinho, não esconde o site publicado.
