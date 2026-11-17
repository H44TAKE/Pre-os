export interface PostoPreco {
  nome: string;
  rodovia: string;
  cidade: string;
  s500: number | null;
  s10: number | null;
  bandeira: string;
}
export interface Regiao {
  sigla: string;
  nome: string;
  postos: PostoPreco[];
}
export interface SnapshotPrecos {
  atualizadoEm: string; // YYYY-MM-DD
  regioes: Regiao[];
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
