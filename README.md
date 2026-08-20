# Rotina — assistente pessoal de rotina (PWA)

Um app instalável no celular que junta **rotina diária, água, academia, estudos e compromissos**, com um chat que entende português e anota as coisas pra você.

Tudo roda no navegador. **Nenhum dado sai do seu aparelho** — não tem servidor, não tem conta, não tem custo.

---

## O que ele faz

**Chat em português (sem IA externa)**
Você escreve normal e ele entende. Exemplos que funcionam hoje:

| Você escreve | O que acontece |
|---|---|
| `bebi 500ml` / `tomei 2 copos de água` | soma na meta de água |
| `tomei os remédios` / `tomei 5g de creatina` | marca o hábito do dia |
| `não tomei o remédio ainda` | desmarca |
| `estudei 1h30` | soma no tempo de estudo |
| `treinei peito ombro e tríceps` | registra o treino A (acha pelo grupo muscular) |
| `consulta no dentista quinta 15h` | cria o compromisso e o alerta |
| `inglês toda terça às 20h` | cria compromisso **recorrente** |
| `faculdade segunda, quarta e sexta às 19h` | recorrência em vários dias |
| `academia dias úteis 19h` | entende "dias úteis" e "fim de semana" |
| `me lembra de pagar o boleto sexta 10h` | cria lembrete |
| `prova dia 15/09 às 19:30` | entende data numérica e "3 de setembro" |
| `o que tenho hoje?` / `o que ainda falta` | resumo do dia |
| `minha agenda da semana` | os 7 dias |
| `qual o treino de hoje?` | lista os exercícios |
| `novo hábito tomar ômega 3 às 12h todo dia` | cria hábito novo |
| `ajuda` | lista tudo que ele entende |

Ele também entende `amanhã`, `depois de amanhã`, `hoje`, `ontem`, `daqui a 3 dias`, `semana que vem`, `meio-dia`, `8 da noite`, `às 9`, `15h30`, `19:30`.

**Telas**

- **Hoje** — anel de progresso do dia, água com botões rápidos, checklist da rotina com sequência (🔥 dias seguidos), treino do dia, estudo e próximos compromissos.
- **Chat** — o interpretador acima, com sugestões clicáveis.
- **Treino** — divisão ABC (vem pré-configurada, dá pra editar), exercícios com séries/reps, registro de treino com **carga que fica salva pro próximo**, e histórico de 14 dias.
- **Estudos** — timer pomodoro (que continua contando se você fechar o app), meta diária, gráfico dos últimos 7 dias e streak.
- **Agenda** — compromissos e lembretes por dia, com recorrência e alerta configurável.
- **Configurações** — horário de acordar/dormir, metas, tema claro/escuro/automático, backup e restauração em JSON.

**Notificações**

- Lembrete de cada hábito no horário, só se ainda não estiver marcado.
- Lembrete de água a cada X minutos entre acordar e dormir, enquanto a meta não bate.
- Cutucão de treino: *"Você ainda não fez peito, ombro e tríceps. Vamos pra academia?"*
- Alerta de compromisso N minutos antes.
- Lembrete de estudo se faltar tempo pra meta perto do fim do dia.

---

## Como rodar

### Testar no computador

Service worker só funciona em `https://` ou `localhost`, então não adianta abrir o `index.html` com dois cliques. Rode um servidor local:

```bash
cd rotina
python3 -m http.server 8000
# abre http://localhost:8000
```

Ou, se preferir Node: `npx serve .`

### Colocar no ar (de graça)

**GitHub Pages** — o caminho recomendado, porque já vem com publicação automática:

```bash
cd rotina
git init -b main
git add .
git commit -m "primeira versão"
gh repo create rotina --public --source=. --push
```

Depois, no repositório: *Settings → Pages → Source: **GitHub Actions***.

Em ~1 minuto o app está em `https://SEU-USUARIO.github.io/rotina/`.
Daí em diante, **todo `git push` na branch `main` republica o app sozinho** —
o workflow em `.github/workflows/deploy.yml` faz o resto.

**Vercel** — `npx vercel --prod` na pasta. Zero configuração, é só HTML estático.

**Netlify** — arrastar a pasta em [app.netlify.com/drop](https://app.netlify.com/drop).

> Nesses dois, o `versao.json` não é carimbado automaticamente — edite o valor
> à mão a cada publicação pra que o app avise da atualização (veja abaixo).

---

## Como as atualizações chegam no celular

Você não precisa reinstalar nada. O fluxo é:

1. Você muda o código e dá `git push`.
2. O GitHub Actions publica e escreve o hash do commit em `versao.json`.
3. Na próxima vez que você abrir o app (ou voltar pra ele), ele lê o
   `versao.json` — que nunca vai pro cache — e compara com a versão que
   estava rodando.
4. Se mudou, aparece a barra **"Nova versão disponível → Atualizar"**.
   Um toque limpa o cache do service worker e recarrega.

**Seus dados não são apagados nessa troca** — água, hábitos, treinos,
estudos e agenda ficam no IndexedDB, que a atualização não toca.

### Instalar no celular

1. Abra o link no **Chrome do Android**.
2. Menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").
3. Abra pelo ícone e toque em **Ativar** no aviso amarelo pra liberar as notificações.

No **iPhone**: Safari → Compartilhar → **Adicionar à Tela de Início** (iOS 16.4+ é necessário pra notificação funcionar).

---

## Sobre as notificações — leia isso

Essa é a única limitação real da escolha por PWA, e é melhor você saber antes:

| Situação | Funciona? |
|---|---|
| App aberto ou em segundo plano (Android) | ✅ sempre |
| App instalado e fechado (Android/Chrome) | ⚠️ na maioria das vezes — o Chrome acorda o app a cada ~15 min via *Periodic Background Sync*, mas o Android pode adiar isso pra economizar bateria |
| iPhone com o app fechado | ❌ o iOS não suporta background sync em PWA — os lembretes aparecem quando você abre o app |
| Celular desligado / sem o app instalado | ❌ |

Se você quiser **alarme garantido** com o app fechado, existem dois caminhos:

1. **Web Push** — precisa de um servidorzinho (Node + `web-push` + chaves VAPID) que dispara as notificações. Umas 100 linhas, roda de graça em Cloudflare Workers ou Vercel. Continua sendo o mesmo app.
2. **Empacotar como app nativo** — [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) transforma esse PWA num APK/Play Store, ou refazer em Expo/React Native com notificações locais (essas são 100% confiáveis porque o próprio Android agenda o alarme).

O caminho 2 com Bubblewrap é bem barato: o código continua sendo este aqui.

---

## Estrutura

```
rotina/
├── index.html                 estrutura das 5 telas
├── manifest.webmanifest       metadados do PWA (nome, ícones, atalhos)
├── versao.json                carimbo de versão (o app compara pra avisar de update)
├── sw.js                      service worker: cache offline + lembretes
├── .github/workflows/
│   └── deploy.yml             publica no GitHub Pages a cada push na main
├── css/styles.css             estilos (tema claro e escuro)
├── js/
│   ├── store.js               modelo de dados + IndexedDB (compartilhado com o sw)
│   ├── nlp.js                 interpretador de português — datas, horas, recorrência
│   ├── notify.js              cálculo dos lembretes do dia (sem DOM, roda no sw também)
│   └── app.js                 telas, chat, modais, timer
├── icons/                     ícones gerados
└── testes/
    ├── nlp.test.js            44 casos do interpretador
    └── e2e.js                 21 verificações no navegador (Playwright)
```

**Onde mexer primeiro**

- Ensinar frases novas ao chat → `js/nlp.js`, função `interpretar()`.
- Mudar as respostas do bot → `js/app.js`, função `executar()`.
- Mudar quando os lembretes disparam → `js/notify.js`, função `lembretesDoDia()`.
- Hábitos e treinos que já vêm prontos → `js/store.js`, função `estadoPadrao()`.

## Testes

```bash
node testes/nlp.test.js          # 44 casos do interpretador (não precisa instalar nada)

# e2e precisa do Playwright:
npm i -D playwright && npx playwright install chromium
python3 -m http.server 8899 &
node testes/e2e.js               # 25 verificações no Chromium + screenshots em testes/
```

## Dados

Ficam em **IndexedDB** (com cópia em `localStorage`), no seu aparelho. Limpar os dados do site apaga tudo — por isso tem o botão **Backup** em Configurações, que baixa um `.json`, e o **Restaurar**, que lê de volta.

## Ideias pra próxima versão

- Web Push pra notificação garantida com o app fechado
- Exportar os compromissos pro Google Calendar (`.ics`)
- Registro de peso e medidas junto com o treino
- Gráfico de evolução de carga por exercício
- Widget/atalho na tela inicial pra marcar água com um toque
- Modo "checklist da manhã": uma tela só, em sequência, ao acordar
