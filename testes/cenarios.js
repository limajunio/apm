/*
 * Testes de cenário do apm.html (modo ?dev=1, sem navegador).
 * Uso:  npm install   (uma vez)
 *       npm test
 * Sai com código 1 se algum cenário falhar.
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ARQUIVO = path.join(__dirname, '..', 'apm.html');
const fonte = fs.readFileSync(ARQUIVO, 'utf8');
// Scripts de CDN não rodam no teste; o CSS inline sim.
// Simula a regra do Font Awesome para conferir que a fonte dos ícones não é sobrescrita.
const html = fonte
  .replace(/<script src=[^>]*><\/script>/g, '')
  .replace('<style>', '<style>.fa-solid{font-family:"Font Awesome 6 Free";font-weight:900}');

const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => { if (!cond) { falhas++; console.log('   ✗ ' + msg); } };

async function abrir(qs, url = 'http://127.0.0.1:8765/apm.html') {
  const dom = new JSDOM(html, { url: url + qs, runScripts: 'dangerously', pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  w.fetch = () => Promise.reject(new Error('sem rede no teste'));
  const erros = [];
  w.addEventListener('error', e => erros.push(e.message));
  w.console.error = (...a) => erros.push(a.join(' '));
  w.console.info = () => {}; w.console.warn = () => {};
  await esperar(150);
  return { w, d: w.document, erros };
}

const toast = (d) => {
  const t = d.getElementById('apm-toast');
  const s = t.classList.contains('show') ? t.textContent : '';
  t.className = 'toast'; t.textContent = '';
  return s;
};

async function ir(w, hash) { w.location.hash = hash; await esperar(40); }

// liberados: ids dos módulos que devem abrir; comando: deve acessar a Área do Comando
async function cenario(nome, qs, { liberados, comando }) {
  console.log(`• ${nome}  (${qs})`);
  const { w, d, erros } = await abrir(qs);
  ok(d.getElementById('apm-bloqueio').style.display === 'none', 'não deveria cair em tela de bloqueio');
  ok(d.querySelector('#apm-hero h1')?.textContent === 'Academia de Polícia Militar', 'headline do hero');

  await ir(w, '/academy');
  const cards = [...d.querySelectorAll('[data-modulo-id]')];
  ok(cards.length === 5, `5 módulos na E-Academy (veio ${cards.length})`);
  for (const c of cards) {
    const deveAbrir = liberados.includes(c.dataset.moduloId);
    ok(c.classList.contains('locked') !== deveAbrir, `cadeado de ${c.dataset.moduloId} (esperado ${deveAbrir ? 'liberado' : 'trancado'})`);
  }
  // URL digitada não pode pular o cadeado
  for (const c of cards.filter(c => !liberados.includes(c.dataset.moduloId))) {
    await ir(w, '/academy/' + c.dataset.moduloId);
    ok(/requer/.test(toast(d)) && w.location.hash === '#/academy', `URL de ${c.dataset.moduloId} deveria ser barrada`);
  }

  await ir(w, '/comando');
  const entrou = w.location.hash === '#/comando' && !!d.querySelector('#apm-app h1') && d.querySelector('#apm-app h1').textContent === 'Área do Comando';
  ok(entrou === comando, `Área do Comando (esperado ${comando ? 'acesso' : 'bloqueio'})`);
  toast(d);

  // Fonte: ícones mantêm a fonte do Font Awesome, textos usam Plus Jakarta Sans
  await ir(w, '/');
  const icone = d.querySelector('#apm-nav i.fa-solid');
  const texto = d.querySelector('#apm-hero h1');
  ok(/Font Awesome/.test(w.getComputedStyle(icone).fontFamily), `ícone com fonte errada: ${w.getComputedStyle(icone).fontFamily}`);
  ok(/Plus Jakarta Sans/.test(w.getComputedStyle(texto).fontFamily), `texto com fonte errada: ${w.getComputedStyle(texto).fontFamily}`);

  ok(erros.length === 0, 'erros de JS: ' + erros.join(' | '));
}

async function bloqueio(nome, qs, tituloEsperado) {
  console.log(`• ${nome}  (${qs})`);
  const { d, erros } = await abrir(qs);
  const el = d.getElementById('apm-bloqueio');
  ok(el.style.display !== 'none' && el.querySelector('h1')?.textContent === tituloEsperado, `deveria mostrar "${tituloEsperado}"`);
  ok(erros.length === 0, 'erros de JS: ' + erros.join(' | '));
}

const TODOS = ['especializacao-basica', 'especializacao-intermediaria', 'especializacao-avancada', 'teste-admissao', 'graduacao'];

(async () => {
  await cenario('Comandante', '?dev=1', { liberados: TODOS, comando: true });
  await cenario('Subcomandante (Soldado)', '?dev=1&cargo=Subcomandante&patente=Soldado', { liberados: TODOS, comando: true });
  await cenario('Admin (Aluno, Soldado)', '?dev=1&cargo=Aluno&patente=Soldado&admin=1', { liberados: TODOS, comando: true });
  await cenario('Aluno (Cabo)', '?dev=1&cargo=Aluno&patente=Cabo', { liberados: [], comando: false });
  await cenario('Supervisor', '?dev=1&cargo=Aluno&patente=Supervisor', { liberados: ['especializacao-basica'], comando: false });
  await cenario('Soldado', '?dev=1&cargo=Aluno&patente=Soldado', { liberados: [], comando: false });
  await cenario('Instrutor (Inspetor-Geral)', '?dev=1&cargo=Instrutor&patente=Inspetor-Geral',
    { liberados: ['especializacao-basica', 'especializacao-intermediaria', 'teste-admissao'], comando: false });
  await cenario('Coordenador (Vice-Presidente)', '?dev=1&cargo=Coordenador&patente=Vice-Presidente',
    { liberados: ['especializacao-basica', 'especializacao-intermediaria', 'especializacao-avancada', 'graduacao'], comando: true });
  await cenario('Fora da APM + Admin', '?dev=1&fora=1&admin=1', { liberados: TODOS, comando: true });
  await bloqueio('Fora da APM', '?dev=1&fora=1', 'Acesso exclusivo para membros da APM');
  await bloqueio('Inativo', '?dev=1&status=inativo', 'Conta sem acesso');

  console.log('• Mural (nicks com pontuação e HTML)');
  {
    const { w, d } = await abrir('?dev=1');
    await ir(w, '/mural');
    const nicks = [...d.querySelectorAll('.membro-lider .apm-nick')].map(e => e.textContent);
    ok(nicks[0] === 'Lider' && nicks.includes('.:Persceu:.') && nicks.includes('Wingeet:') && nicks.includes('DG17.'), 'liderança com nicks pontuados: ' + nicks.join(', '));
    ok(!d.querySelector('#apm-app b'), 'nick com HTML não pode virar tag');
    const fim = d.querySelector('footer').textContent.trim();
    ok(fim === 'Desenvolvido por Lider', 'rodapé: ' + fim);
  }

  console.log('• Produção com ?dev=1 (modo de teste NÃO pode ligar)');
  {
    const { d } = await abrir('?dev=1', 'https://system.policiacia.com/p/apm');
    ok(!d.getElementById('apm-dev-badge') && !d.querySelector('#apm-hero'), 'modo de teste ligou em produção');
  }
  {
    const { d } = await abrir('?dev=1', 'https://limajunio.github.io/apm/apm.html');
    ok(!d.getElementById('apm-dev-badge'), 'modo de teste ligou no GitHub Pages');
  }

  console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\n✓ Todos os cenários passaram');
  process.exit(falhas ? 1 : 0);
})();
