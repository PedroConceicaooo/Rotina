# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Rotina é um PWA instalável (sem backend, sem etapa de build) que junta
hábitos diários, ingestão de água, treinos de academia, controle de estudos
e uma agenda/calendário, tudo comandado por um interpretador de linguagem
natural em português no chat. Todo dado fica no aparelho, em IndexedDB (com
espelho em localStorage como fallback) — não tem servidor nem sistema de
conta.

## Comandos

```bash
# rodar localmente — service worker exige https:// ou localhost,
# abrir index.html direto com file:// não funciona
python3 -m http.server 8000        # depois abre http://localhost:8000
# ou: npx serve .

# instalar ferramentas de dev (eslint, prettier, playwright)
npm install

# lint e formatação
npm run lint                       # ESLint sobre js/, sw.js e testes/
npm run format                     # Prettier aplica formatação (js/, sw.js, testes/)
npm run format:check               # só verifica, não escreve — é o que o CI roda

# testes unitários — Node puro
npm test                           # = node testes/nlp.test.js — 44 casos do interpretador NLP

# testes e2e — precisa de Playwright + um servidor local rodando
npx playwright install chromium    # só na primeira vez
npx serve . -l 8899 &              # ou: python3 -m http.server 8899 &
npm run test:e2e                   # = node testes/e2e.js — 25 verificações no navegador contra localhost:8899, screenshots vão pra testes/

# typecheck opcional (JSDoc) — não roda no CI, é só ferramenta de dev
npm run typecheck                  # = tsc -p jsconfig.json
```

Não tem bundler nem etapa de build — é JS vanilla estilo ES5 carregado via
tags `<script>` / `importScripts`, publicado como arquivos estáticos. O
`package.json` existe só pra ferramentas de dev (ESLint, Prettier,
Playwright); nada é empacotado a partir dele, e o app roda sem `npm
install`. Config de lint fica em `eslint.config.js` (flat config, declara
os globais `RotinaStore`/`RotinaNLP`/`RotinaNotify`/`RotinaApp` por causa do
padrão de objeto global descrito abaixo) e de formatação em
`.prettierrc.json` (escopo limitado a `js/`, `sw.js` e `testes/` via
`.prettierignore` — CSS/HTML/Markdown ficam de fora de propósito).

Tipagem é só JSDoc, sem migrar pra ES Modules nem TypeScript de verdade: os
tipos dos modelos (`Estado`, `Habito`, `Evento`, `DivisaoTreino`,
`RegistroDia`, `Config`, `Lembrete`, `Acao` de `interpretar()`, e a
augmentation de `window.RotinaStore`/`RotinaNLP`/`RotinaNotify`/`RotinaApp`)
ficam em `js/types.d.ts` — arquivo ambiente, nunca carregado em runtime nem
listado em `ARQUIVOS`/`index.html`. `js/store.js`, `js/nlp.js` e
`js/notify.js` referenciam esses tipos globais direto pelo nome (sem
`import()`) porque `store.js`/`notify.js` são carregados via `importScripts`
no `sw.js`, que não aceita sintaxe de módulo ES. `jsconfig.json` +
`npm run typecheck` validam isso (`app.js`, `nlp.js`, `store.js`,
`notify.js` — `sw.js` fica de fora porque os globais só-de-service-worker
como `self.clients`/`caches` colidem com a lib DOM usada pro resto); é
puramente opt-in, não roda no CI.

## Arquitetura

Quatro módulos em `js/`, carregados em ordem de dependência (`store.js` →
`nlp.js` → `notify.js` → `app.js` no `index.html`; `store.js` → `notify.js`
no `sw.js` via `importScripts`). Cada módulo se pendura num objeto raiz
compartilhado (`self` no service worker, `window` na página) como `Rotina*`,
então o mesmo código roda sem alteração nos dois contextos:

- **`js/store.js`** (`RotinaStore`) — o modelo de dados, `estadoPadrao()`
  (estado padrão: perfil, config, hábitos, divisão de treino, eventos,
  registros diários), leitura/escrita em IndexedDB (`carregar`/`salvar`), e
  `sanear()`, que migra/completa qualquer estado carregado do disco pro
  formato atual. Os helpers de data/hora (`hoje`, `iso`, `deISO`,
  `minutosDoDia`, …) ficam aqui porque tanto a página quanto o service
  worker precisam deles.
- **`js/nlp.js`** (`RotinaNlp`) — o interpretador de português.
  `interpretar()` é o ponto de entrada; ele tokeniza texto livre e extrai
  datas, horários, recorrência ("toda terça", "dias úteis"), durações,
  quantidades de água, e casa nomes de hábitos/treinos. Os verbos/palavras-
  chave de cada intenção (água, treino, hábito, pendências…) ficam no objeto
  `LEXICO` no topo do arquivo — pra ensinar uma palavra nova a uma intenção
  já existente, edita a lista lá em vez de mexer na regex. `acharHabito()` e
  a detecção da palavra "água" toleram erro de digitação via
  `levenshtein()`/`temPalavraFuzzy()` (distância de edição). Frases
  totalmente novas (nova intenção, nova estrutura de frase) entram direto
  em `interpretar()`.
- **`js/notify.js`** (`RotinaNotify`) — lógica de lembrete pura, sem DOM.
  `lembretesDoDia()` calcula todo lembrete previsto pra um dia (hábitos,
  água em intervalos, treino, estudo, eventos da agenda); `pendentes()`
  filtra o que já venceu e ainda não disparou; `disparar()` mostra as
  notificações e marca `state.notificado`. Roda igual tanto pela página (em
  primeiro plano) quanto pelo `sw.js` (eventos `periodicsync`/`sync` em
  segundo plano).
- **`js/app.js`** — telas, execução de comando do chat (`executar()`),
  modais, e o timer pomodoro. `render()` despacha pros renderizadores de
  cada tela (`renderHoje`, `renderTreino`, `renderEstudos`, `renderAgenda`,
  `renderChat`).

**Service worker (`sw.js`)**: rede primeiro pra navegação HTML, cache
primeiro pro resto. `versao.json` é explicitamente excluído do cache
(buscado com `cache: 'no-store'`) — é o sinal de detecção de atualização
descrito abaixo. As checagens de lembrete em segundo plano vêm pelos eventos
`periodicsync` (background sync periódico do Android) e `sync`, ambos
chamando `checarLembretes()`, que carrega o estado via `RotinaStore` e
delega pra `RotinaNotify.disparar()`. `periodicSync` não existe no iOS —
lá o catch-up ao reabrir o app (ver abaixo) é o único jeito de perceber
lembrete atrasado. Quando `checarLembretes()` dispara alguma notificação,
avisa as páginas abertas pelo `BroadcastChannel('rotina-lembretes')`.

**Catch-up ao reabrir e sincronização entre abas**: `js/app.js` escuta
`visibilitychange` e, ao voltar a ficar visível, chama
`sincronizarNotificado()` (funde o `state.notificado` gravado pelo
`sw.js` no `st` em memória, sem tocar no resto — evita reavisar o que já
disparou em segundo plano) e então `checarLembretes(720)`: usa janela de
tolerância de 12h nesse momento específico (bem maior que o poll normal de
45 min) porque no iOS essa é a única chance de recuperar lembrete que
venceu enquanto o app estava fechado. `js/app.js` também escuta o
`BroadcastChannel('rotina-lembretes')` do `sw.js` — quando um lembrete
dispara em segundo plano com a página aberta em outra aba/janela, sincroniza
e re-renderiza sem esperar o próximo poll de 30s.

**Fluxo de atualização**: `js/app.js` faz polling em
`versao.json?t=<timestamp>` (no-store) e compara com a versão com que a
página carregou. Se diferente, mostra a barra "Nova versão disponível"; ao
tocar, limpa o cache do service worker e recarrega — o IndexedDB não é
tocado nessa troca. O `.github/workflows/deploy.yml` carimba `versao.json`
com o hash curto do commit em todo push pra `main` antes de publicar no
GitHub Pages, então cada deploy vira uma versão distinta que o cliente
consegue detectar.

**Onde mexer nas tarefas comuns**:
- Ensinar frases novas ao chat → `js/nlp.js`, `interpretar()`.
- Mudar as respostas/ações do bot → `js/app.js`, `executar()`.
- Mudar quando/o que os lembretes disparam → `js/notify.js`,
  `lembretesDoDia()`.
- Mudar hábitos/divisão de treino padrão → `js/store.js`, `estadoPadrao()`.
- Adicionar um arquivo ao cache → atualizar `ARQUIVOS` em `sw.js` (e
  incrementar `VERSAO` se precisar forçar limpeza de cache fora do fluxo
  normal do `versao.json`).

## Deploy

Push pra `main` → `.github/workflows/deploy.yml` roda lint + `format:check`
+ testes unitários (job `testar`) e os testes e2e num Chromium headless
(job `testar-e2e`); só se os dois passarem é que o job `publicar` carimba
`versao.json` e publica no GitHub Pages (Settings → Pages → Source: GitHub
Actions precisa estar ligado uma vez). Nenhum outro ambiente
(Vercel/Netlify) recebe o carimbo de versão automático nem passa pelo
gate de testes — lá o `versao.json` precisaria ser incrementado à mão pra
barra de atualização funcionar.
