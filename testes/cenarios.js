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

// Texto de EXEMPLO do regimento, usado só quando o apm.html ainda não tem o texto real.
const REGIMENTO_EXEMPLO = ['I','II','III','IV','V','VI','VII'].map((c, i) => `
  <h2>CAPÍTULO ${c}</h2><p>DO CAPÍTULO DE TESTE ${c}</p>
  <p><b>Art. ${i * 2 + 1}º</b> Texto do artigo sobre gratificações negativas ${c}.</p>
  <p>§ 1º Parágrafo do artigo ${i * 2 + 1}.</p>
  <p><b>Art. ${i * 2 + 2}º</b> Outro artigo, sobre conduta.</p>`).join('');
const temRegimentoReal = !/<template id="apm-regimento-fonte">\s*<\/template>/.test(fonte);
const htmlComRegimento = temRegimentoReal ? html
  : html.replace(/<template id="apm-regimento-fonte">\s*<\/template>/, `<template id="apm-regimento-fonte">${REGIMENTO_EXEMPLO}</template>`);

const esperar = ms => new Promise(r => setTimeout(r, ms));
let falhas = 0;
const ok = (cond, msg) => { if (!cond) { falhas++; console.log('   ✗ ' + msg); } };

async function abrir(qs, url = 'http://127.0.0.1:8765/apm.html', conteudo = html) {
  const dom = new JSDOM(conteudo, { url: url + qs, runScripts: 'dangerously', pretendToBeVisual: true });
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
  ok(cards.length === 8, `8 módulos na E-Academy (veio ${cards.length})`);
  ok([...d.querySelectorAll('[data-secao]')].map(e => e.dataset.secao).join() === 'cfo,afo,instrutoria', 'seções CFO, AFO, Admissão e Graduação');
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

const CFO = ['cfo-modulo-1', 'cfo-modulo-2', 'cfo-modulo-3'];
const AFO = ['especializacao-basica', 'especializacao-intermediaria', 'especializacao-avancada'];
const TODOS = [...CFO, ...AFO, 'teste-admissao', 'graduacao'];

(async () => {
  await cenario('Comandante', '?dev=1', { liberados: TODOS, comando: true });
  await cenario('Subcomandante (Soldado)', '?dev=1&cargo=Subcomandante&patente=Soldado', { liberados: TODOS, comando: true });
  await cenario('Admin (Aluno, Soldado)', '?dev=1&cargo=Aluno&patente=Soldado&admin=1', { liberados: TODOS, comando: true });
  await cenario('Aluno (Cabo)', '?dev=1&cargo=Aluno&patente=Cabo', { liberados: CFO, comando: false });
  await cenario('Supervisor', '?dev=1&cargo=Aluno&patente=Supervisor', { liberados: [...CFO, 'especializacao-basica'], comando: false });
  await cenario('Soldado', '?dev=1&cargo=Aluno&patente=Soldado', { liberados: CFO, comando: false });
  await cenario('Instrutor (Inspetor-Geral)', '?dev=1&cargo=Instrutor&patente=Inspetor-Geral',
    { liberados: [...CFO, 'especializacao-basica', 'especializacao-intermediaria', 'teste-admissao'], comando: false });
  await cenario('Coordenador (Vice-Presidente)', '?dev=1&cargo=Coordenador&patente=Vice-Presidente',
    { liberados: [...CFO, ...AFO, 'graduacao'], comando: true });
  await cenario('Fora da APM + Admin', '?dev=1&fora=1&admin=1', { liberados: TODOS, comando: true });
  await bloqueio('Fora da APM', '?dev=1&fora=1', 'Acesso exclusivo para membros da APM');
  await bloqueio('Inativo', '?dev=1&status=inativo', 'Conta sem acesso');

  console.log('• Mural com muitos membros (?membros=60)');
  {
    const { w, d, erros } = await abrir('?dev=1&membros=60');
    await ir(w, '/mural');
    const cards = [...d.querySelectorAll('.mural-card')];
    ok(cards.length === 70, `todos os membros no Mural (veio ${cards.length}, esperado 70 = 10 fixos + 60)`);
    const lista = cards.map(c => ({ nick: c.querySelector('.mural-nick').textContent, cargo: c.querySelector('.mural-cargo').textContent }));
    const ordem = ['comandante', 'subcomandante', 'coordenador', 'instrutor'];
    const pos = (c) => { const i = ordem.indexOf(c.toLowerCase()); return i < 0 ? ordem.length : i; };
    const col = new Intl.Collator('pt-BR', { sensitivity: 'base' });
    let emOrdem = true;
    for (let i = 1; i < lista.length; i++) {
      const a = lista[i - 1], b = lista[i];
      const dif = pos(a.cargo) - pos(b.cargo) || (pos(a.cargo) === 4 ? col.compare(a.cargo, b.cargo) : 0);
      if (dif > 0 || (dif === 0 && col.compare(a.nick, b.nick) > 0)) { emOrdem = false; console.log('     fora de ordem:', a, b); break; }
    }
    ok(emOrdem, 'ordem: Comandante, Subcomandante, Coordenador, Instrutor, demais; alfabética dentro do cargo');
    ok(lista[0].nick === 'Lider' && lista[0].cargo === 'Comandante', 'primeiro card é o Comandante');
    ok(cards[0].classList.contains('comandante') && !cards[1].classList.contains('comandante'), 'só o Comandante tem destaque dourado');
    ['.:Persceu:.', 'Wingeet:', 'DG17.'].forEach(n => ok(lista.some(l => l.nick === n), `nick ${n} no Mural`));
    ok(!d.querySelector('#apm-app b'), 'nick com HTML não pode virar tag');
    const nickEl = cards[0].querySelector('.mural-nick');
    ok(w.getComputedStyle(nickEl).whiteSpace === 'nowrap' && w.getComputedStyle(nickEl).textOverflow === 'ellipsis', 'nick em uma linha com reticências');
    // sem indicador online/offline: todos os cards iguais e coloridos
    await esperar(200);
    ok(!d.querySelector('.mural-status, [data-status-nick]'), 'Mural não tem bolinha de status');
    ok(!cards.some(c => c.classList.contains('offline') || c.classList.contains('online')), 'nenhum card marcado online/offline');
    ok(!/grayscale/.test(fonte), 'nenhum avatar em escala de cinza');
    // visual estilo WaveX
    ok(d.querySelector('.mural-titulo h1')?.textContent === 'MURAL', 'título "MURAL"');
    const img = cards[0].querySelector('.mural-busto img');
    ok(img && /size=l/.test(img.src) && /direction=2/.test(img.src) && /head_direction=2/.test(img.src), 'busto com size=l, direction=2, head_direction=2: ' + (img && img.src.slice(0, 80)));
    const janela = cards[0].querySelector('.mural-busto');
    ok(w.getComputedStyle(janela).overflow === 'hidden' && w.getComputedStyle(janela).bottom === '0px', 'janela do busto com overflow:hidden alinhada na base');
    ok(/image-rendering:\s*pixelated/.test(fonte), 'CSS com image-rendering: pixelated');
    ok(!cards.some(c => c.querySelector('.avatar-crop')), 'Mural não usa mais o avatar de corpo inteiro');
    ok(erros.length === 0, 'erros de JS: ' + erros.join(' | '));
  }

  console.log(`• Regimento (${temRegimentoReal ? 'texto real' : 'texto de EXEMPLO — o real ainda não foi embutido'})`);
  {
    const { w, d, erros } = await abrir('?dev=1', undefined, htmlComRegimento);
    await ir(w, '/regimento');
    const itens = [...d.querySelectorAll('.reg-sumario-item')];
    ok(itens.map(i => i.querySelector('.reg-sumario-num').textContent).join() === 'I,II,III,IV,V,VI,VII', 'sumário com capítulos I a VII: ' + itens.length);
    const busca = d.getElementById('apm-reg-busca');
    const buscar = async (t) => { busca.value = t; busca.dispatchEvent(new w.Event('input')); await esperar(220); };
    const visiveis = () => [...d.querySelectorAll('#apm-reg-texto .reg-artigo-inicio')].filter(e => !e.classList.contains('reg-oculto'));
    const total = visiveis().length;
    await buscar('gratificacoes');   // sem acento também acha
    ok(visiveis().length > 0 && visiveis().length < total, `busca filtra artigos (${visiveis().length} de ${total})`);
    ok(d.querySelectorAll('mark.reg-destaque').length > 0, 'busca destaca o termo');
    if (temRegimentoReal) {
      const t = d.getElementById('apm-reg-texto').textContent.replace(/\s+/g, ' ');
      [['é formada pela união', 'é formado pela união'], ['Constituem os objetivos', 'Constituíssem'],
       ['[CIA] Academia de PM ®', ':registered:'], ['levando 200 gratificações negativas', '200 medalhas'],
       ['20 gratificações negativas efetivas', 'medalhas negativas efetivas'], ['limite estipulado', 'limite estimulado'],
       ['cometida pelos instrutores e coordenadores', 'professores/avaliadores']]
        .forEach(([novo, velho]) => ok(t.includes(novo) && !t.includes(velho), `correção no texto: "${novo}"`));
      ok(d.querySelectorAll('#apm-reg-texto .reg-artigo-inicio').length === 35, 'Regimento com 35 artigos');
      await buscar('reintegração');
      const tabela = d.querySelector('#apm-reg-texto table');
      ok(tabela && tabela.classList.contains('reg-oculto'), 'tabela do Art. 7º some em busca sem relação');
      await buscar('quinzena');
      ok(tabela && !tabela.classList.contains('reg-oculto'), 'tabela do Art. 7º aparece na busca "quinzena"');
    }
    await buscar('art 12');
    ok(visiveis().length === 1 && /^Art\.?\s*12/.test(visiveis()[0].textContent.trim()), 'busca "art 12" mostra só o Art. 12');
    await buscar('xyzxyz');
    ok(!d.getElementById('apm-reg-vazio').hidden, 'mensagem de nenhum resultado');
    await buscar('');
    ok(visiveis().length === total && !d.querySelector('mark.reg-destaque'), 'limpar a busca mostra tudo de novo');
    ok(erros.length === 0, 'erros de JS: ' + erros.join(' | '));
  }
  {
    // CSS do Regimento não pode vazar: toda regra com .reg- começa com .apm-regimento
    const css = fonte.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
    const seletores = css.split('}').map(r => r.split('{')[0]).flatMap(s => s.split(',')).map(s => s.trim()).filter(s => /\.reg-/.test(s));
    const vazando = seletores.filter(s => !s.startsWith('.apm-regimento'));
    ok(vazando.length === 0, 'CSS do Regimento fora de .apm-regimento: ' + vazando.join(' | '));
  }

  console.log('• Logo, insígnias e rodapé');
  {
    const { w, d } = await abrir('?dev=1');
    const logos = [...d.querySelectorAll('.apm-logo-slot img')];
    ok(logos.length === 2 && logos.every(i => i.getAttribute('src') === 'https://imaging.habblet.city/badge/b2511s36134s164124s19114s17118'), 'logo novo na sidebar e no topo do celular');
    const fim = d.querySelector('footer').textContent.trim();
    ok(fim === 'Desenvolvido por Lider', 'rodapé: ' + fim);
    await ir(w, '/academy');
    const ins = Object.fromEntries([...fonte.matchAll(/const (INSIGNIA_\w+) = '([^']*)';/g)].map(m => [m[1], m[2]]));
    const usaInsignia = { 'cfo-modulo-1': 'INSIGNIA_CFO', 'especializacao-basica': 'INSIGNIA_AFO_B', 'especializacao-intermediaria': 'INSIGNIA_AFO_I', 'especializacao-avancada': 'INSIGNIA_AFO_A' };
    for (const [id, nome] of Object.entries(usaInsignia)) {
      const img = d.querySelector(`[data-modulo-id="${id}"] img.apm-insignia-modulo`);
      if (ins[nome]) ok(img && img.getAttribute('src') === ins[nome], `${nome} renderizada no card ${id}`);
      else { ok(!img && d.querySelector(`[data-modulo-id="${id}"] .icon-box`), `${id} sem insígnia deveria mostrar o ícone`); console.log(`   (aviso) ${nome} ainda vazia`); }
    }
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
