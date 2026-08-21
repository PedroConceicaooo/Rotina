/* Testes do interpretador. Rode com: node testes/nlp.test.js */
global.self = global;
require('../js/nlp.js');
const NLP = global.RotinaNLP;

// Quinta-feira, 20/08/2026, 08:30
const AGORA = new Date(2026, 7, 20, 8, 30, 0, 0);

const ctx = {
  agora: AGORA,
  copoPadrao: 250,
  habitos: [
    { id: 'h1', nome: 'Remédios', tipo: 'check', ativo: true },
    { id: 'h2', nome: 'Creatina', tipo: 'quantidade', ativo: true },
    { id: 'h3', nome: 'Alongamento', tipo: 'check', ativo: true }
  ],
  divisao: [
    { id: 'dA', nome: 'A', foco: 'Peito, ombro e tríceps' },
    { id: 'dB', nome: 'B', foco: 'Costas e bíceps' },
    { id: 'dC', nome: 'C', foco: 'Pernas e abdômen' }
  ]
};

let passou = 0,
  falhou = 0;
const falhas = [];

function t(entrada, verificar) {
  const r = NLP.interpretar(entrada, ctx);
  try {
    verificar(r);
    passou++;
  } catch (e) {
    falhou++;
    falhas.push(
      `  "${entrada}"\n    -> ${e.message}\n    -> obtido: ${JSON.stringify(r, dateRepl)}`
    );
  }
}

function dateRepl(k, v) {
  return v;
}
function eq(a, b, msg) {
  if (a !== b)
    throw new Error(`${msg || ''} esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}
function fmt(d) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- água ---------- */
t('bebi 300ml', (r) => {
  eq(r.tipo, 'agua');
  eq(r.ml, 300);
});
t('tomei um copo de água', (r) => {
  eq(r.tipo, 'agua');
  eq(r.ml, 250);
});
t('bebi 2 copos de agua', (r) => {
  eq(r.tipo, 'agua');
  eq(r.ml, 500);
});
t('água 500', (r) => {
  eq(r.tipo, 'agua');
  eq(r.ml, 500);
});
t('bebi 1,5 litro de água', (r) => {
  eq(r.tipo, 'agua');
  eq(r.ml, 1500);
});
t('bebi uma garrafa', (r) => {
  eq(r.tipo, 'agua');
  eq(r.ml, 500);
});

/* ---------- hábitos ---------- */
t('tomei meus remédios', (r) => {
  eq(r.tipo, 'habito');
  eq(r.habito.id, 'h1');
  eq(r.valor, true);
});
t('tomei creatina', (r) => {
  eq(r.tipo, 'habito');
  eq(r.habito.id, 'h2');
});
t('tomei 5g de creatina', (r) => {
  eq(r.tipo, 'habito');
  eq(r.habito.id, 'h2');
  eq(r.valor, 5);
});
t('não tomei o remédio ainda', (r) => {
  eq(r.tipo, 'habito');
  eq(r.desmarcar, true);
});
t('já fiz o alongamento', (r) => {
  eq(r.tipo, 'habito');
  eq(r.habito.id, 'h3');
});

/* ---------- estudo ---------- */
t('estudei 1h30', (r) => {
  eq(r.tipo, 'estudo');
  eq(r.minutos, 90);
});
t('estudei 45 minutos', (r) => {
  eq(r.tipo, 'estudo');
  eq(r.minutos, 45);
});
t('estudei uma hora hoje', (r) => {
  eq(r.tipo, 'estudo');
  eq(r.minutos, 60);
});
t('estudei 2 horas', (r) => {
  eq(r.tipo, 'estudo');
  eq(r.minutos, 120);
});

/* ---------- treino ---------- */
t('treinei peito ombro e tríceps', (r) => {
  eq(r.tipo, 'treino');
  eq(r.divisao.id, 'dA');
});
t('fui na academia', (r) => {
  eq(r.tipo, 'treino');
});
t('treinei costas e bíceps', (r) => {
  eq(r.tipo, 'treino');
  eq(r.divisao.id, 'dB');
});
t('fiz treino de perna', (r) => {
  eq(r.tipo, 'treino');
  eq(r.divisao.id, 'dC');
});
t('qual o treino de hoje?', (r) => {
  eq(r.tipo, 'consulta');
  eq(r.escopo, 'treino');
});

/* ---------- compromissos ---------- */
t('consulta no dentista quinta 15h', (r) => {
  eq(r.tipo, 'evento');
  eq(fmt(r.inicio), '2026-08-20 15:00');
  eq(r.titulo, 'Consulta no dentista');
});
t('tenho reunião amanhã às 9h', (r) => {
  eq(r.tipo, 'evento');
  eq(fmt(r.inicio), '2026-08-21 09:00');
  eq(r.titulo, 'Reunião');
});
t('prova de paradigmas dia 15/09 às 19:30', (r) => {
  eq(r.tipo, 'evento');
  eq(fmt(r.inicio), '2026-09-15 19:30');
  eq(r.titulo, 'Prova de paradigmas');
});
t('me lembra de pagar o boleto sexta 10h', (r) => {
  eq(r.tipo, 'evento');
  eq(fmt(r.inicio), '2026-08-21 10:00');
  eq(r.titulo, 'Pagar o boleto');
});
t('aniversário da minha mãe dia 3 de setembro', (r) => {
  eq(r.tipo, 'evento');
  eq(fmt(r.inicio), '2026-09-03 09:00');
});
t('jantar com a família sábado às 8 da noite', (r) => {
  eq(r.tipo, 'evento');
  eq(fmt(r.inicio), '2026-08-22 20:00');
  eq(r.titulo, 'Jantar com a família');
});
t('call com o cliente daqui a 3 dias 14h', (r) => {
  eq(r.tipo, 'evento');
  eq(fmt(r.inicio), '2026-08-23 14:00');
});
t('almoço meio-dia', (r) => {
  eq(r.tipo, 'evento');
  eq(fmt(r.inicio), '2026-08-20 12:00');
});

/* ---------- recorrência ---------- */
t('inglês toda terça às 20h', (r) => {
  eq(r.tipo, 'evento');
  eq(r.recorrencia.tipo, 'semanal');
  eq(JSON.stringify(r.recorrencia.dias), '[2]');
  eq(r.titulo, 'Inglês');
});
t('tomar vitamina todo dia às 8h', (r) => {
  eq(r.tipo, 'evento');
  eq(r.recorrencia.tipo, 'diaria');
});
t('faculdade segunda, quarta e sexta às 19h', (r) => {
  eq(r.tipo, 'evento');
  eq(JSON.stringify(r.recorrencia.dias), '[1,3,5]');
  eq(r.titulo, 'Faculdade');
});
t('academia dias úteis 19h', (r) => {
  eq(r.recorrencia.tipo, 'semanal');
  eq(JSON.stringify(r.recorrencia.dias), '[1,2,3,4,5]');
});

/* ---------- consultas ---------- */
t('o que eu tenho hoje?', (r) => {
  eq(r.tipo, 'consulta');
  eq(r.escopo, 'hoje');
});
t('hoje', (r) => {
  eq(r.tipo, 'consulta');
  eq(r.escopo, 'hoje');
});
t('o que tenho amanhã', (r) => {
  eq(r.tipo, 'consulta');
  eq(r.escopo, 'amanha');
});
t('minha agenda da semana', (r) => {
  eq(r.tipo, 'consulta');
  eq(r.escopo, 'semana');
});
t('o que ainda falta hoje', (r) => {
  eq(r.tipo, 'consulta');
  eq(r.escopo, 'pendente');
});
t('ajuda', (r) => {
  eq(r.tipo, 'ajuda');
});

/* ---------- novo hábito ---------- */
t('novo hábito tomar ômega 3 às 12h todo dia', (r) => {
  eq(r.tipo, 'novoHabito');
  eq(r.horario, '12:00');
  eq(JSON.stringify(r.dias), '[0,1,2,3,4,5,6]');
});

/* ---------- desconhecido ---------- */
t('blablabla xyz', (r) => {
  eq(r.tipo, 'desconhecido');
});

/* ---------- duração não pode capturar o horário ---------- */
t('consulta no dentista quinta 15h', (r) => {
  eq(r.duracaoMin, 60, 'duracao');
});
t('inglês toda terça às 20h', (r) => {
  eq(r.duracaoMin, 60, 'duracao');
});
t('reunião amanhã 14h por 30 min', (r) => {
  eq(r.duracaoMin, 30, 'duracao');
  eq(fmt(r.inicio), '2026-08-21 14:00');
});
t('me lembra de tomar remédio às 22h', (r) => {
  eq(r.tipo, 'evento');
  eq(r.duracaoMin, 0);
});

console.log(`\n${passou} passaram, ${falhou} falharam\n`);
if (falhas.length) {
  console.log(falhas.join('\n\n'));
  process.exit(1);
}
