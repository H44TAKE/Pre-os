// Extrai a tabela "Postos onde abasteço" da Ticketlog para um arquivo de texto.
//
// Como usar (leva 1 minuto, com a sessão da Ticketlog já logada):
//   1. Abra https://plataforma.ticketlog.com.br/fuel-negotiation/price-management/list
//   2. Aperte F12, vá na aba "Console", cole este arquivo inteiro e aperte Enter.
//   3. Quando aparecer "Copiado: N linhas", abra um arquivo novo, cole (Ctrl+V) e salve como
//      scripts/entrada/ticketlog.csv. Depois rode: python scripts/importar_precos_ticketlog.py scripts/entrada/ticketlog.csv
//
// Só lê a tela: não clica em nada que altere negociações ou preços. Cada linha sai como
//   posto;endereço;cidade - UF;combustível;volume;preço;última atualização
(async () => {
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  // mostra todas as linhas de uma vez (escolhe "Todas" no seletor de quantidade por página)
  const caixa = document.querySelector("#per-page .ng-select-container");
  if (caixa) {
    caixa.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    await espera(500);
    const todas = [...document.querySelectorAll(".ng-dropdown-panel .ng-option")].find((o) => o.textContent.trim() === "Todas");
    if (todas) todas.click();
    await espera(2500);
  }
  const linhas = [...document.querySelectorAll("[role=row]")].slice(1).map((linha) => {
    const c = [...linha.querySelectorAll("[role=cell]")].map((x) => x.innerText.trim().replace(/\s*\n\s*/g, " | "));
    const [posto, endereco] = (c[1] || "").split(" | ");
    return [posto, endereco || "", c[2], c[3], (c[4] || "").replace(/[L.]/g, ""), c[5], c[7]].join(";");
  });
  const rodape = document.querySelector(".controls")?.getAttribute("aria-label") || "";
  const texto = linhas.join("\n");
  if (typeof copy === "function") copy(texto);
  console.log(`Copiado: ${linhas.length} linhas. ${rodape}`);
  if (!/de (\d+) registros/.test(rodape) || Number(rodape.match(/de (\d+) registros/)[1]) !== linhas.length) {
    console.warn("Atenção: o número de linhas não bate com o rodapé da tabela. Confira se a opção 'Todas' foi selecionada.");
  }
  return texto;
})();
