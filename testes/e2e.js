/* Teste de fumaça no navegador. node testes/e2e.js */
const { chromium } = require('playwright');

const BASE = 'http://localhost:8899/index.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
  const page = await ctx.newPage();

  const erros = [];
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', e => erros.push('pageerror: ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const passos = [];
  const ok = (nome, cond, extra = '') => passos.push(`${cond ? '✓' : '✗'} ${nome}${extra ? ' — ' + extra : ''}`);

  // 1. Carregou a tela Hoje
  ok('tela Hoje renderiza', await page.locator('#lista-habitos .item').count() >= 2);
  ok('anel de progresso presente', (await page.locator('#anel-valor').textContent()).includes('%'));

  // 2. Água
  await page.click('[data-agua="250"]');
  await page.waitForTimeout(200);
  ok('água soma 250ml', (await page.locator('#agua-n').textContent()).trim() === '250 ml',
     await page.locator('#agua-n').textContent());

  // 3. Marcar hábito
  await page.locator('#lista-habitos .marcar').first().click();
  await page.waitForTimeout(250);
  ok('hábito marcado', await page.locator('#lista-habitos .item.feito').count() === 1);

  // 4. Chat
  await page.click('#nav button[data-vista="chat"]');
  await page.waitForTimeout(200);
  const dizer = async (txt) => {
    await page.fill('#entrada-chat', txt);
    await page.press('#entrada-chat', 'Enter');
    await page.waitForTimeout(320);
    const msgs = await page.locator('.msg.bot').allTextContents();
    return msgs[msgs.length - 1];
  };

  let r = await dizer('bebi 500ml');
  ok('chat: água', /750 ml/.test(r), r.slice(0, 60));

  r = await dizer('estudei 1h30');
  ok('chat: estudo', /90 min/.test(r), r.slice(0, 60));

  r = await dizer('consulta no dentista quinta 15h');
  ok('chat: compromisso', /Consulta no dentista/.test(r), r.slice(0, 70));

  r = await dizer('inglês toda terça às 20h');
  ok('chat: recorrência', /ter/.test(r) && /20:00/.test(r), r.slice(0, 70));

  r = await dizer('treinei peito e ombro');
  ok('chat: treino', /Treino A/.test(r), r.slice(0, 60));

  r = await dizer('o que tenho hoje?');
  ok('chat: resumo do dia', /Rotina:/.test(r) && /Compromissos:/.test(r), r.slice(0, 50));

  r = await dizer('o que ainda falta hoje');
  ok('chat: pendências', /falta/i.test(r), r.slice(0, 50));

  r = await dizer('novo hábito tomar vitamina D às 12h todo dia');
  ok('chat: novo hábito', /criado/.test(r), r.slice(0, 70));

  // 5. Agenda mostra o evento criado
  await page.click('#nav button[data-vista="agenda"]');
  await page.waitForTimeout(300);
  const agenda = await page.locator('#lista-agenda').textContent();
  ok('agenda lista compromissos', /Consulta no dentista/.test(agenda) && /Inglês/.test(agenda));

  // 6. Treino
  await page.click('#nav button[data-vista="treino"]');
  await page.waitForTimeout(300);
  ok('treino lista 3 divisões', await page.locator('#treino-conteudo .cartao').count() === 3);
  ok('histórico de treino', /nos últimos 14 dias/.test(await page.locator('#treino-historico').textContent()));

  // 7. Estudos
  await page.click('#nav button[data-vista="estudos"]');
  await page.waitForTimeout(300);
  ok('estudo registrado no dia', (await page.locator('#estudo-n2').textContent()).trim() === '90 min',
     await page.locator('#estudo-n2').textContent());
  ok('gráfico da semana com 7 colunas', await page.locator('#estudo-semana .col').count() === 7);

  // 8. Modal de configurações abre
  await page.click('#btn-config');
  await page.waitForTimeout(250);
  ok('modal de configurações abre', await page.locator('#modal.aberto').count() === 1);
  await page.click('[data-fechar]');
  await page.waitForTimeout(200);

  // 9. Persistência: recarrega e confere
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  ok('dados persistem após reload', (await page.locator('#agua-n').textContent()).trim() === '750 ml',
     await page.locator('#agua-n').textContent());

  // 10. Service worker registrado
  const swOk = await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r));
  ok('service worker registrado', swOk);

  // 11. Manifest acessível
  const mf = await page.evaluate(() => fetch('manifest.webmanifest').then(r => r.ok));
  ok('manifest acessível', mf);

  // 12. Aviso de nova versão
  const fs = require('fs');
  const path = require('path');
  const arqVersao = path.join(__dirname, '..', 'versao.json');
  const original = fs.readFileSync(arqVersao, 'utf8');
  ok('sem barra de atualização quando a versão é a mesma',
     await page.locator('#barra-atualizacao').count() === 0);
  try {
    fs.writeFileSync(arqVersao, JSON.stringify({ versao: 'teste-2' }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#barra-atualizacao', { timeout: 5000 }).catch(() => {});
    ok('barra aparece quando sai versão nova', await page.locator('#barra-atualizacao').count() === 1);
    await page.click('#barra-atualizacao button');
    await page.waitForTimeout(1500);
    ok('barra some depois de atualizar', await page.locator('#barra-atualizacao').count() === 0);
    ok('dados sobrevivem à atualização', (await page.locator('#agua-n').textContent()).trim() === '750 ml',
       await page.locator('#agua-n').textContent());
  } finally {
    fs.writeFileSync(arqVersao, original);
  }

  // screenshots
  await page.click('#nav button[data-vista="hoje"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'testes/tela-hoje.png', fullPage: true });
  await page.click('#nav button[data-vista="chat"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'testes/tela-chat.png', fullPage: true });
  await page.click('#nav button[data-vista="treino"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'testes/tela-treino.png', fullPage: true });
  await page.click('#nav button[data-vista="agenda"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'testes/tela-agenda.png', fullPage: true });
  await page.click('#nav button[data-vista="estudos"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'testes/tela-estudos.png', fullPage: true });

  console.log('\n' + passos.join('\n'));
  const falhas = passos.filter(p => p.startsWith('✗')).length;
  console.log(`\n${passos.length - falhas}/${passos.length} verificações passaram`);
  if (erros.length) console.log('\nErros no console:\n' + erros.slice(0, 12).join('\n'));

  await browser.close();
  process.exit(falhas || erros.length ? 1 : 0);
})();
