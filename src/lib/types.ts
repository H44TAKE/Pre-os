export interface PostoPreco {
  nome: string;
  rodovia: string;
  cidade: string;
  s500: number | null;
  s10: number | null;
  bandeira: string;
  /** o S-10 veio da leitura da Ticketlog (e não do portal/PDF), com a data da última atualização do preço */
  s10Fonte?: "ticketlog";
  s10Data?: string;
}
export interface Regiao {
  sigla: string;
  nome: string;
  postos: PostoPreco[];
}
/** Posto que a Ticketlog conhece e a tabela de preços não (os "fora da tabela"), só com S-10. */
export interface ExtraTicketlog {
  nome: string;
  cidade: string;
  uf: string;
  s10: number;
  data: string; // YYYY-MM-DD
}
export interface SnapshotPrecos {
  atualizadoEm: string; // YYYY-MM-DD
  regioes: Regiao[];
  /** de onde o snapshot veio: ausente = portal; "pdf" ou "ticketlog" = atualização manual */
  origem?: string;
  /** dia da leitura da Ticketlog que alimenta o S-10 deste snapshot */
  ticketlogEm?: string;
  extras?: ExtraTicketlog[];
}
export interface Abastecimento {
  dataISO: string;
  servico: string;
  valor: number;
  estabKey: string;
  estabNome: string;
  hora: string | null;
  motorista: string | null;
  quantidade: number | null;
  valorTotal: number | null;
}
export interface DadosAbastecimento {
  rows: Abastecimento[];
  servicos: string[];
  servicoPadrao: string;
}

/** Posto unificado: vem da tabela de preços, do histórico, ou dos dois. */
export interface Posto {
  id: string;
  nome: string;
  regiaoSigla: string | null;
  regiaoNome: string | null;
  cidade: string | null;
  rodovia: string | null;
  bandeira: string | null;
  s500: number | null;
  s10: number | null;
  /** variação do S-10 desde o snapshot anterior (R$); null se não houver base */
  deltaS10: number | null;
  histKey: string | null;
  foraDaTabela: boolean;
  /** a rede não abastece mais neste posto (lista em public/data/avisos.json) */
  naoAbastece: boolean;
  /** de onde veio o S-10 mostrado; null = da tabela (portal/PDF) */
  s10Fonte: "ticketlog" | null;
  s10Data: string | null;
}

export interface AggPosto {
  key: string;
  nome: string;
  records: Abastecimento[];
  count: number;
  min: number;
  max: number;
  avg: number;
  totalGasto: number;
  byDate: Record<string, number>;
  tableMin: number;
  tableMax: number;
}
