/* ============================================================
   types.d.ts — só tipagem (JSDoc/VS Code). Nunca é carregado em
   runtime: store.js/nlp.js/notify.js/app.js seguem JS vanilla puro,
   pendurados em `self`/`window` como sempre. Tipos globais ambientes
   porque os arquivos são <script> clássico / importScripts, não
   módulos ES — dá pra checar sem mudar como o app roda.
   ============================================================ */

interface Habito {
  id: string;
  nome: string;
  emoji: string;
  tipo: 'check' | 'quantidade';
  meta?: number;
  unidade?: string;
  /** 'HH:MM' */
  horario: string;
  /** 0=domingo .. 6=sábado — ignorado quando frequenciaSemanal está definido */
  dias: number[];
  /** recorrência livre ("3x por semana"): quantas vezes por semana, sem dia fixo */
  frequenciaSemanal?: number | null;
  lembrete: boolean;
  ativo: boolean;
}

interface Exercicio {
  id: string;
  nome: string;
  series: number;
  reps: string;
  carga: string;
}

interface DivisaoTreino {
  id: string;
  nome: string;
  foco: string;
  dias: number[];
  exercicios: Exercicio[];
  /** substitui treino.horario só pra essa divisão, se definido */
  horario?: string;
}

interface Evento {
  id: string;
  titulo: string;
  /** ISO string */
  inicio: string;
  duracaoMin: number;
  subtipo: 'evento' | 'lembrete';
  recorrencia?: { tipo: 'diaria' } | { tipo: 'semanal'; dias: number[] } | null;
  alertaMin?: number;
  arquivado?: boolean;
  notas?: string;
}

interface TreinoRegistrado {
  divisaoId: string;
  nome: string;
  foco: string;
  /** 'HH:MM' */
  hora: string;
  exercicios: Array<{ nome: string; series: number; reps: string; carga: string }>;
}

interface RegistroDia {
  /** progresso por id de hábito */
  habitos: Record<string, boolean | number>;
  /** ml */
  agua: number;
  estudoMin: number;
  /** treinos feitos no dia */
  treinos: TreinoRegistrado[];
  /** ids de Evento concluídos no dia */
  eventosFeitos: string[];
}

interface Config {
  metaAgua: number;
  copoPadrao: number;
  metaEstudoMin: number;
  pomodoroMin: number;
  pausaMin: number;
  notificacoes: boolean;
  alertaEventoMin: number;
  tema: 'auto' | 'claro' | 'escuro';
  lembreteAgua: boolean;
  intervaloAguaMin: number;
  congelamentosPorMes: number;
}

interface Estado {
  versao: number;
  criadoEm: string;
  perfil: { nome: string; acordar: string; dormir: string };
  config: Config;
  habitos: Habito[];
  treino: { lembrete: boolean; horario: string; divisao: DivisaoTreino[] };
  eventos: Evento[];
  /** chave 'YYYY-MM-DD' */
  registros: Record<string, RegistroDia>;
  chat: Array<{ papel: string; texto: string }>;
  /** chave do lembrete -> timestamp */
  notificado: Record<string, number>;
  /** dias 'YYYY-MM-DD' protegidos manualmente (congelamento de streak) */
  diasProtegidos: string[];
  /** pausas de lembrete/streak (modo férias) */
  pausas: Array<{ inicio: string; fim: string }>;
  /** pontos de experiência acumulados, base do nível */
  xp: number;
}

/** Um lembrete calculado por notify.js pra um dia específico. */
interface Lembrete {
  /** identifica o lembrete p/ não notificar 2x (state.notificado) */
  chave: string;
  quando: Date;
  titulo: string;
  corpo: string;
  tag: string;
}

/** Contexto passado pro interpretador de linguagem natural. */
interface NlpCtx {
  agora?: Date;
  copoPadrao?: number;
  habitos?: Habito[];
  divisao?: DivisaoTreino[];
}

type AcaoVazia = { tipo: 'vazio' };
type AcaoAjuda = { tipo: 'ajuda' };
type AcaoConsulta = {
  tipo: 'consulta';
  escopo: 'hoje' | 'amanha' | 'semana' | 'pendente' | 'stats' | 'treino';
};
type AcaoConfig = { tipo: 'config'; campo: string; valor: unknown };
type AcaoAgua = { tipo: 'agua'; ml: number };
type AcaoEstudo = { tipo: 'estudo'; minutos: number | null; data?: Date; perguntar?: boolean };
type AcaoPomodoro = { tipo: 'pomodoro' };
type AcaoTreino = { tipo: 'treino'; divisao: DivisaoTreino | null; data: Date };
type AcaoHabito = { tipo: 'habito'; habito: Habito; valor: boolean | number; desmarcar: boolean };
type AcaoNovoHabito = {
  tipo: 'novoHabito';
  nome: string;
  horario: string;
  dias: number[];
  frequenciaSemanal: number | null;
};
type AcaoEvento = {
  tipo: 'evento';
  titulo: string;
  inicio: Date;
  duracaoMin: number;
  recorrencia: unknown;
  subtipo: 'evento' | 'lembrete';
  temHora: boolean;
};
type AcaoDesconhecida = { tipo: 'desconhecido'; texto: string };

/** Retorno de RotinaNLP.interpretar(). */
type Acao =
  | AcaoVazia
  | AcaoAjuda
  | AcaoConsulta
  | AcaoConfig
  | AcaoAgua
  | AcaoEstudo
  | AcaoPomodoro
  | AcaoTreino
  | AcaoHabito
  | AcaoNovoHabito
  | AcaoEvento
  | AcaoDesconhecida;

/* store.js/nlp.js/notify.js se penduram em `self`/`window` em vez de usar
   export — isso deixa o VS Code saber que window.RotinaStore etc existem
   (sem isso o app.js inteiro cai pra `any`). */
interface RotinaStoreApi {
  KEY: string;
  idbGet(key: string): Promise<unknown>;
  idbSet(key: string, value: unknown): Promise<boolean>;
  carregar(): Promise<Estado>;
  salvar(state: Estado): Promise<boolean>;
  estadoPadrao(): Estado;
  registroDe(state: Estado, data?: string): RegistroDia;
  sanear(s: unknown): Estado;
  emPausa(state: Estado, data: string): boolean;
  diaProtegido(state: Estado, data: string): boolean;
  congelamentosUsados(state: Estado, mes: string): number;
  congelamentosDisponiveis(state: Estado, mes: string): number;
  pad(n: number): string;
  iso(d?: Date): string;
  hoje(): string;
  hhmm(d: Date): string;
  deISO(s: string): Date;
  addDias(d: Date, n: number): Date;
  minutosDoDia(str: string): number | null;
  uid(): string;
}

interface RotinaNotifyApi {
  lembretesDoDia(state: Estado, dia: Date): Lembrete[];
  pendentes(state: Estado, agora: Date, toleranciaMin?: number): Lembrete[];
  disparar(
    state: Estado,
    agora: Date,
    reg: ServiceWorkerRegistration,
    toleranciaMin?: number
  ): Promise<number>;
  eventosDoDia(state: Estado, dia: Date): Array<{ ev: Evento; quando: Date }>;
  treinoDoDia(state: Estado, dia: Date): DivisaoTreino[] | null;
  ocorreEm(ev: Evento, dia: Date): Date | null;
  isoData(d: Date): string;
  emPausa(state: Estado, dataStr: string): boolean;
}

interface RotinaNlpApi {
  interpretar(texto: string, ctx?: NlpCtx): Acao;
  normalizar(txt: string): string;
  extrairHora(n: string, marcas: unknown): { h: number; m: number } | null;
  extrairData(n: string, agora: Date, marcas: unknown): Date | null;
  extrairDuracao(n: string, marcas: unknown): number | null;
  extrairRecorrencia(
    n: string,
    marcas: unknown
  ): { tipo: 'diaria' } | { tipo: 'semanal'; dias: number[] } | null;
  extrairAgua(n: string, copoPadrao: number): number;
  limparTitulo(s: string): string;
  proximoDiaSemana(agora: Date, alvo: number, forcarProxima: boolean): Date;
  levenshtein(a: string, b: string): number;
  NOMES_DIA: string[];
  NOMES_DIA_CURTO: string[];
}

interface Window {
  RotinaStore: RotinaStoreApi;
  RotinaNotify: RotinaNotifyApi;
  RotinaNLP: RotinaNlpApi;
  RotinaApp: { irPara(vista: string): void; readonly estado: Estado };
}
