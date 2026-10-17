/* =====================================================================
   8 - BUFFER CONTROL · MÓDULO PRO  (carregado DEPOIS do sistema original)
   ---------------------------------------------------------------------
   [1] OP de 7 dígitos  : aceita 1130000-SMT · -SMT-T · -SMT-B · -AI
   [2] Fluxo livre      : pode bipar o LPN ou a OP primeiro
   [3] Controle de OP   : vínculo SMT → IM (mesma lógica madura do
                          Consulta de Plano: SEGURO / PROVÁVEL / VERIFICAR)
   [4] Sala do buffer   : estacionamento FIFO — vaga sugerida na entrada,
                          vaga liberada na saída, ordem de retirada
   [5] Sala 3D + TV     : modelo 3D em tempo real para a TV
   [6] Backup           : a cada 3 h (JSON + Excel), apaga os de +14 dias
   [7] Acessos e Logins : perfis (Key User / Guardião / Operador), abas
                          liberadas por usuário, bloqueio e log de acessos
                          (a senha continua sendo da Plataforma MMT)
   Leitura por PALETE   : OP → LPN do palete → quantidade do palete inteiro
                          (sem teclado na tela) · 1 palete = 1 vaga
   Tudo que é novo fica em dbData.vinculo, dbData.sala, dbData.vagas e
   dbData.acessos.
   ===================================================================== */
(function () {
'use strict';

/* ─────────────────────────── utilidades ─────────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = v => (v === null || v === undefined || v === '0x2a') ? '' : v.toString().trim();
const normSheet = s => s.toString().trim().toUpperCase().replace(/\s+/g, ' ');
const key = s => (s || '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '');
const hkey = s => key((s === null || s === undefined ? '' : s).toString().normalize('NFD').replace(/[̀-ͯ]/g, ''));
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const p2 = n => String(n).padStart(2, '0');
const DIA = 86400000;
const icones = () => { try { lucide.createIcons(); } catch (e) { /* sem ícones */ } };

/* ═════════════════════ [1] OP DE 7 DÍGITOS ═════════════════════════
   A etiqueta vem 1130000-SMT, 1130000-SMT-T, 1130000-SMT-B, 1130000-AI.
   No plano a OP é só 1130000 → vale sempre os 7 dígitos iniciais.     */
const RX_OP = /^(\d{7})(?:[-_ ]?(?:SMT(?:[-_ ]?[TB])?|AI|IM|T|B))?$/;
function opDaEtiqueta(valor) {
  const s = String(valor || '').trim().toUpperCase().replace(/\s+/g, '');
  const m = s.match(RX_OP);
  if (m) return m[1];
  if (/^[SA]/.test(s) && s.length >= 15) return '';        // é LPN, não OP
  const m2 = s.match(/^(\d{7})(?!\d)/);                       // 7 dígitos no começo
  return m2 ? m2[1] : '';
}
const pareceOP = v => !!opDaEtiqueta(v);
normalizarOP = function (valor) { return opDaEtiqueta(valor) || String(valor || '').trim(); };

/* ═════════════════════ [2] LPN OU OP PRIMEIRO ═════════════════════ */
let _lpnPendente = '';
const _avancarOrig = avancarPasso;
avancarPasso = function () {
  const input = $('barra-input');
  const val = (input.value || '').trim();
  if (passoAtual === 1 && val && !pareceOP(val) && _lpnValido(val).ok) {
    _lpnPendente = val;
    beep('ok');
    msgLeitura('LPN ' + val + ' lido — agora bipe a OP.', true);
    input.value = '';
    _chipLPN();
    return;
  }
  _avancarOrig();
  if (passoAtual === 2 && _lpnPendente) {
    const lpn = _lpnPendente; _lpnPendente = ''; _chipLPN();
    $('barra-input').value = lpn;
    _avancarOrig();
  }
};
const _cancelarOrig = cancelarLeitura;
cancelarLeitura = function () { _lpnPendente = ''; _chipLPN(); _cancelarOrig(); };
function _chipLPN() {
  let c = $('bp-chip-lpn');
  const lab = $('barra-label');
  if (!c && lab) { c = document.createElement('div'); c.id = 'bp-chip-lpn'; lab.parentNode.insertBefore(c, lab.nextSibling); }
  if (!c) return;
  c.className = _lpnPendente ? 'mb-2 text-xs font-black text-tpv bg-blue-50 border border-blue-200 rounded px-3 py-1 inline-block' : 'hidden';
  c.textContent = _lpnPendente ? 'LPN guardado: ' + _lpnPendente + ' · falta a OP' : '';
}

/* ═════════════════ LEITURA POR PALETE ═════════════════════════════════
   Agora cada leitura é um PALETE inteiro: OP → LPN do palete → quantidade
   total do palete. Sem teclado na tela: só a barra para digitar.
   Assim que a OP é lida, aparece o KIT: modelo, quantidade, invoice e a
   OP de IM (Controle de OP / cruzamento) com linha e data planejada.   */
const _setPassoOrig = _setPassoUI;
_setPassoUI = function () {
  _setPassoOrig();
  const kp = $('kp-teclado'); if (kp) kp.classList.add('hidden');
  const ind = $('passo-indicador'), lab = $('barra-label'), inp = $('barra-input');
  if (passoAtual === 2) {
    if (ind) ind.textContent = 'Passo 2 de 3 — Bipe o LPN do palete';
    if (lab) lab.textContent = 'Bipe o LPN do palete (vem na etiqueta)';
  } else if (passoAtual === 3) {
    if (ind) ind.textContent = 'Passo 3 de 3 — Quantidade do palete';
    if (lab) lab.textContent = 'Digite a QUANTIDADE TOTAL de placas do palete e tecle Enter';
    if (inp) {
      inp.inputMode = 'numeric'; inp.placeholder = 'Quantidade de placas do palete inteiro';
      // saída: já sugere a quantidade que entrou com este LPN (o operador só confirma)
      if (modoLeitura === 'saida' && leituraBuffer.lpn) {
        const ent = (dbData.leituras || []).filter(l => l.lpn === leituraBuffer.lpn && _tipoLeitura(l) === 'entrada' && l.op === leituraBuffer.op).pop();
        if (ent && ent.qtd) { inp.value = ent.qtd; setTimeout(() => inp.select(), 80); }
      }
    }
  }
  const s3 = document.querySelector('#step-3 .text-sm');
  if (s3 && !s3.dataset.bp) { s3.dataset.bp = 1; s3.innerHTML = '<i data-lucide="calculator" class="w-4 h-4 text-tpv"></i> Qtd. do palete'; icones(); }
  renderKit();
};
/* o card do kit fica dentro da estação (aparece também na tela cheia do operador) */
function renderKit() {
  let el = $('bp-kit');
  if (!el) {
    const res = $('leitura-resumo'); if (!res) return;
    el = document.createElement('div'); el.id = 'bp-kit';
    res.parentNode.insertBefore(el, res);
  }
  const op = leituraBuffer && leituraBuffer.op;
  if (!op || passoAtual < 2) { el.className = 'hidden'; el.innerHTML = ''; return; }
  const o = (dbData.ops || []).find(x => x.numero === op) || {};
  const im = (typeof imDaOpSMT === 'function') ? imDaOpSMT(op) : null;
  const c = (dbData.cruzamentos || {})[op] || {};
  const tot = Number(o.total) || 0, rec = recebidoDaOP(op, 'entrada');
  const fN = v => Number(v || 0).toLocaleString('pt-BR');
  const campo = (rot, val, cls) => `<div class="min-w-0"><div class="text-[10px] font-black uppercase text-gray-500 tracking-wide">${rot}</div><div class="font-black ${cls || 'text-sidebar'} truncate" title="${esc(val)}">${esc(val || '—')}</div></div>`;
  let dIM = '', corIM = 'text-sidebar', bgIM = '';
  if (im && im.data) {
    const d = _dataPlanoObj(im.data), h = new Date(); h.setHours(0, 0, 0, 0);
    if (d) { const dd = Math.round((d.getTime() - h.getTime()) / DIA); dIM = dd < 0 ? 'ATRASADA' : dd === 0 ? 'HOJE' : dd === 1 ? 'AMANHÃ' : ''; corIM = dd < 0 ? 'text-[#c81e1e]' : dd === 0 ? 'text-orange-600' : dd === 1 ? 'text-yellow-600' : 'text-tpv'; bgIM = dd < 0 ? 'bg-[#c81e1e]' : dd === 0 ? 'bg-orange-500' : 'bg-yellow-500'; }
  }
  const motivoIM = im ? (c.match || '') : (c.status === 'AMBIGUO' ? 'Ambíguo — escolher no Plano de Produção' : 'Sem OP de IM no plano');
  el.className = 'mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3';
  el.innerHTML = `
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div class="flex items-center gap-2 mb-2"><span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-sidebar text-white">KIT SMT</span>
        <span class="font-mono font-black text-lg text-sidebar">OP ${esc(op)}</span>
        <span class="ml-auto text-[11px] font-bold text-gray-600">${fN(rec)} / ${fN(tot)} já recebido</span></div>
      <div class="mb-2 text-sm">${campo('Modelo', o.modelo)}</div>
      <div class="grid grid-cols-3 gap-3 text-sm">
        ${campo('Qtd. do kit', tot ? fN(tot) : '')}${campo('Invoice', o.invoice)}${campo('Linha SMT', o.linha)}
      </div></div>
    <div class="rounded-lg border-2 ${im ? 'border-tpv bg-blue-50' : 'border-orange-300 bg-orange-50'} p-3">
      <div class="flex items-center gap-2 mb-2"><span class="text-[10px] font-black px-2 py-0.5 rounded-full ${im ? 'bg-tpv' : 'bg-orange-500'} text-white">DESTINO IM</span>
        <span class="font-mono font-black text-lg ${im ? 'text-tpv' : 'text-orange-700'}">${im ? 'OP ' + esc(im.numero) : 'SEM OP DE IM'}</span>
        <span class="ml-auto text-[10px] font-bold text-gray-500 truncate" title="${esc(motivoIM)}">${esc(motivoIM)}</span></div>
      <div class="mb-2 text-sm">${campo('Modelo IM', im && im.modelo)}</div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        ${campo('Linha IM', im && im.linha)}
        <div class="min-w-0"><div class="text-[10px] font-black uppercase text-gray-500 tracking-wide">Data planejada${dIM ? ` <span class="ml-1 px-1.5 py-0.5 rounded text-white ${bgIM}">${dIM}</span>` : ''}</div><div class="font-black ${corIM}">${esc((im && im.data) || '—')}</div></div>
      </div></div>`;
}
const _infoOPOrig = atualizarInfoOP;
atualizarInfoOP = function () { _infoOPOrig(); renderKit(); };
const _renderLeitOrig = renderLeiturasOP;
renderLeiturasOP = function () { _renderLeitOrig(); const c = $('leituras-count'); if (c) c.textContent = c.textContent.replace(/magazines?$/, 'palete(s)'); };

/* ═════════════════ [3] CONTROLE DE OP — VÍNCULO SMT → IM ═════════════
   Copiado do Consulta de Plano (v4.11 → v4.14), que já está maduro:
     1) pega a OP de SMT (Fase SMT · Linha "SMT xx")
     2) lê o Cód.Placa Limpa dela
     3) procura a OP de IM (Fase IM) com o MESMO código, dentro da mesma
        Invoice/CEF — e dá um grau de confiança a cada vínculo.          */
const CONF_TXT = { SEGURO: 'SEGURO', PROVAVEL: 'PROVÁVEL', VERIFICAR: 'VERIFICAR', SEM: 'SEM OP DE IM', SEMCTRL: 'FORA DO CONTROLE' };
const CONF_CLS = { SEGURO: 'bg-green-600 text-white', PROVAVEL: 'bg-yellow-500 text-white', VERIFICAR: 'bg-orange-600 text-white', SEM: 'bg-[#c81e1e] text-white', SEMCTRL: 'bg-gray-200 text-gray-600' };
const _qtdCtrl = v => typeof v === 'number' ? v : num(String(v || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, ''));

function _preencherMesclas(ws, data) {
  const m = ws['!merges']; if (!m || !m.length || !ws['!ref']) return;
  const ini = XLSX.utils.decode_range(ws['!ref']).s;
  m.forEach(g => {
    const v = (data[g.s.r - ini.r] || [])[g.s.c - ini.c];
    if (v === '' || v === undefined || v === null) return;
    for (let r = g.s.r; r <= g.e.r; r++) for (let c = g.s.c; c <= g.e.c; c++) {
      const rr = r - ini.r, cc = c - ini.c; if (rr < 0 || cc < 0) continue;
      const row = data[rr] || (data[rr] = []);
      if (row[cc] === '' || row[cc] === undefined || row[cc] === null) row[cc] = v;
    }
  });
}

function detectarControle(wb) {
  const ordem = [...wb.SheetNames].sort((a, b) => (normSheet(b) === 'TPV DO') - (normSheet(a) === 'TPV DO'));
  for (const sn of ordem) {
    const ws = wb.Sheets[sn]; if (!ws || !ws['!ref']) continue;
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true });
    for (let i = 0; i < Math.min(40, data.length); i++) {
      const h = (data[i] || []).map(hkey);
      const cOp = h.indexOf('OP'), cFase = h.indexOf('FASE'), cPl = h.findIndex(x => x.includes('PLACALIMPA'));
      if (cOp >= 0 && cFase >= 0 && cPl >= 0) {
        _preencherMesclas(ws, data);
        return { sheet: sn, hdr: i, data, cOp, cFase, cPl,
          cLinha: h.indexOf('LINHA'),
          cInv: h.findIndex(x => x.includes('INVOICE') || x === 'CEF'),
          cQtd: h.findIndex(x => /^QTD/.test(x)),
          cMod: h.findIndex(x => x.startsWith('MODELO')),
          cTipo: h.indexOf('PLACA'),
          cCanc: h.findIndex(x => x.includes('OPCANCELADA')) };
      }
    }
  }
  return null;
}

function faseControle(fase, linha) {
  const f = hkey(fase), l = hkey(linha);
  if (/^PREP/.test(l)) return f === 'IM' ? 'PREP' : null;
  if (f.startsWith('SMT')) return 'SMT';
  if (f === 'IM') return 'IM';
  if (!f) { if (l.startsWith('SMT')) return 'SMT'; if (l.startsWith('LINHA')) return 'IM'; }
  return null;
}
const rankIm = l => /^PA\b|^PA$/.test(clean(l).toUpperCase()) ? 2 : 1;

function montarVinculos(ach) {
  const regs = [], vistos = new Set(), alias = {};
  let lidas = 0, semPlaca = 0, semNada = 0, outras = 0;
  for (let i = ach.hdr + 1; i < ach.data.length; i++) {
    const r = ach.data[i] || [];
    const op = (clean(r[ach.cOp]).match(/\d{5,}/) || [])[0]; if (!op) continue;
    lidas++;
    const linha = ach.cLinha >= 0 ? clean(r[ach.cLinha]) : '';
    const fase = faseControle(r[ach.cFase], linha); if (!fase) { outras++; continue; }
    const placaTxt = clean(r[ach.cPl]).replace(/\s*\n\s*/g, ' / '), placa = hkey(placaTxt);
    const tipo = ach.cTipo >= 0 ? hkey(r[ach.cTipo]) : '';
    if (!placa) { semPlaca++; if (!tipo) { semNada++; continue; } }
    const canc = ach.cCanc >= 0 ? (clean(r[ach.cCanc]).match(/\d{5,}/) || [])[0] : null;
    if (canc && canc !== op) alias[canc] = op;
    const id = fase + '|' + op;
    if (vistos.has(id)) continue;
    vistos.add(id);
    regs.push({ op, fase, placa, placaTxt, tipo, linha, rank: fase === 'IM' ? rankIm(linha) : 1, ln: i,
      inv: ach.cInv >= 0 ? hkey(r[ach.cInv]) : '',
      qtd: ach.cQtd >= 0 ? _qtdCtrl(r[ach.cQtd]) : 0,
      mod: ach.cMod >= 0 ? clean(r[ach.cMod]) : '' });
  }
  const smtInv = new Set(regs.filter(x => x.fase === 'SMT').map(x => x.placa + '|' + x.inv));
  const ehPar = (placa, base) => smtInv.has(placa + '|' + base + 'B') && smtInv.has(placa + '|' + base + 'T');
  regs.forEach(x => {
    x.invG = x.inv; x.lado = '';
    const m = x.inv.match(/^(.+)([BT])$/);
    if (m && x.placa && ehPar(x.placa, m[1])) { x.invG = m[1]; if (x.fase === 'SMT') x.lado = m[2]; }
  });
  const links = {}, usadas = new Set();
  let paIgnoradas = 0, nTB = 0, nDiv = 0;
  const preps = regs.filter(x => x.fase === 'PREP');
  for (let i = regs.length - 1; i >= 0; i--) if (regs[i].fase === 'PREP') regs.splice(i, 1);
  const ligar = (s, ims, conf, motivo, div) => {
    ims.forEach(x => usadas.add(x.op)); (div || []).forEach(x => usadas.add(x.op));
    links[s.op] = { im: ims.map(x => x.op), placa: s.placaTxt || (ims[0] && ims[0].placaTxt) || '', conf, motivo,
      qS: s.qtd, qI: ims.reduce((t, x) => t + x.qtd, 0), lS: s.linha, lI: ims.map(x => x.linha).join(', '),
      mod: s.mod, inv: !!s.inv, lado: s.lado || '' };
    if (div && div.length) links[s.op].div = div.map(x => x.op);
  };
  const smtInvTp = new Set(regs.filter(x => x.fase === 'SMT').map(x => x.inv + '|' + x.tipo + '|' + x.placa));
  const divididasDe = s => regs.filter(x => x.fase === 'IM' && !usadas.has(x.op) && x.rank === 1 && x.placa === s.placa && x.tipo === s.tipo &&
    x.inv.length === s.inv.length + 1 && x.inv.startsWith(s.inv) && /[A-Z]$/.test(x.inv) && !smtInvTp.has(x.inv + '|' + x.tipo + '|' + x.placa));
  const prepKit = s => preps.find(x => !usadas.has(x.op) && x.inv === s.inv && x.tipo === s.tipo && x.placa === s.placa && x.qtd && x.qtd === s.qtd);
  const fq = v => Number(v || 0).toLocaleString('pt-BR');
  const melhores = lista => { if (!lista.length) return lista; const m = Math.min(...lista.map(x => x.rank));
    const f = lista.filter(x => x.rank === m); paIgnoradas += lista.length - f.length; return f.slice().sort((a, b) => a.ln - b.ln); };
  const parear = (smts, ims, onde, base) => {
    if (smts.length === 1) {
      const s = smts[0];
      if (ims.length === 1) { ligar(s, ims, base, 'Única OP de SMT e única OP de IM ' + onde + '.'); return; }
      const soma = ims.reduce((t, x) => t + x.qtd, 0), lista = ims.map(x => x.op + ' (' + fq(x.qtd) + ')').join(' + ');
      if (!ims.some(x => x.qtd === s.qtd)) {
        const kit = prepKit(s);
        if (kit) { nDiv++; ligar(s, [kit], 'SEGURO', 'IM dividida em ' + ims.length + ' OPs: ' + lista + ' = ' + fq(soma) + '. OP do kit de ' + fq(s.qtd) + ' na IM: ' + kit.op + ' (mesma Qtde).', ims); return; }
        if (soma === s.qtd) { nDiv++; ligar(s, ims, 'SEGURO', 'IM dividida em ' + ims.length + ' OPs que somam a Qtde do kit: ' + lista + ' = ' + fq(soma) + '.'); return; }
      }
      const mesmaQ = ims.filter(x => x.qtd && x.qtd === s.qtd);
      if (mesmaQ.length === 1) { ligar(s, mesmaQ, 'PROVAVEL', '1 OP de SMT e ' + ims.length + ' OPs de IM ' + onde + ' — escolhida a de mesma Qtde (' + fq(s.qtd) + ').'); return; }
      ligar(s, ims, 'VERIFICAR', '1 OP de SMT e ' + ims.length + ' OPs de IM ' + onde + ' — lote dividido na IM? (todas somadas)');
      return;
    }
    if (smts.length === 2 && ims.length === 1 && ims[0].qtd && smts.every(s => s.qtd === ims[0].qtd)) {
      smts.forEach((s, i) => { if (!s.lado) s.lado = String(i + 1); ligar(s, ims, 'PROVAVEL', '2 OPs de SMT (' + smts.map(x => x.linha).join(' e ') + ') com a mesma Qtde da única OP de IM ' + onde + ' — provável TOP e BOTTOM.'); });
      return;
    }
    const livres = ims.slice();
    smts.forEach(s => {
      if (!livres.length) return;
      let k = livres.findIndex(x => x.qtd && x.qtd === s.qtd && x.ln > s.ln);
      if (k < 0) k = livres.findIndex(x => x.qtd && x.qtd === s.qtd);
      let conf = 'PROVAVEL', mot = 'Mesma placa em ' + smts.length + ' OPs de SMT ' + onde + ' — casada pela quantidade (' + fq(s.qtd) + ').';
      if (k < 0) {
        k = livres.findIndex(x => x.ln > s.ln); if (k < 0) k = 0;
        conf = smts.length === ims.length ? 'PROVAVEL' : 'VERIFICAR';
        mot = 'Mesma placa em ' + smts.length + ' OPs de SMT e ' + ims.length + ' de IM ' + onde + ' — casada pela ordem da planilha.';
      }
      ligar(s, [livres.splice(k, 1)[0]], conf, mot);
    });
  };
  const casar = (smts, imsAll, onde, base) => {
    smts = smts.slice().sort((a, b) => a.ln - b.ln);
    const ims = melhores(imsAll.filter(x => !usadas.has(x.op)));
    if (!smts.length || !ims.length) return;
    const lB = smts.filter(x => x.lado === 'B'), lT = smts.filter(x => x.lado === 'T');
    if (lB.length && lT.length) {
      nTB++;
      const resto = smts.filter(x => !x.lado);
      [lB, lT, resto].forEach(l => { if (l.length) parear(l, ims.slice(), onde + ' (TOP e BOTTOM em OPs de SMT separadas)', base); });
      return;
    }
    if (smts.length === 1) {
      const extra = divididasDe(smts[0]).filter(x => !ims.includes(x));
      parear(smts, ims.concat(extra).sort((a, b) => a.ln - b.ln), onde, base); return;
    }
    parear(smts, ims, onde, base);
  };
  const agrupar = (lista, chave) => { const m = new Map(); lista.forEach(x => { const k = chave(x); if (k === null) return;
    if (!m.has(k)) m.set(k, { smt: [], im: [] }); m.get(k)[x.fase === 'SMT' ? 'smt' : 'im'].push(x); }); return m; };
  // 1ª passada: Invoice/CEF + tipo + Cód.Placa Limpa
  agrupar(regs, x => x.placa ? (x.invG ? x.invG + '|' : '') + x.tipo + '|' + x.placa : null)
    .forEach(g => casar(g.smt, g.im, 'com este código de placa' + (regs.some(x => x.inv) ? ' na mesma Invoice/CEF' : ''), 'SEGURO'));
  // 2ª passada: mesma Invoice/CEF + coluna Placa
  const sobraSmt = regs.filter(x => x.fase === 'SMT' && !links[x.op]);
  if (sobraSmt.length) {
    const sobraIm = regs.filter(x => x.fase === 'IM' && !usadas.has(x.op));
    agrupar([...sobraSmt, ...sobraIm], x => (x.invG && x.tipo) ? x.invG + '|T:' + x.tipo : null)
      .forEach(g => casar(g.smt, g.im, 'pela mesma Invoice/CEF + Placa (Cód.Placa Limpa vazio ou diferente)', 'PROVAVEL'));
  }
  // 3ª passada: só pelo código da placa (outra Invoice)
  const imPorPlaca = {};
  regs.filter(x => x.fase === 'IM' && x.placa).forEach(x => (imPorPlaca[x.placa] = imPorPlaca[x.placa] || []).push(x));
  regs.filter(x => x.fase === 'SMT' && !links[x.op] && x.placa).forEach(s => {
    const c = melhores((imPorPlaca[s.placa] || []).filter(x => !usadas.has(x.op))).sort((a, b) => Math.abs(a.ln - s.ln) - Math.abs(b.ln - s.ln))[0];
    if (c) ligar(s, [c], 'VERIFICAR', 'Achada só pelo código da placa (Invoice/CEF diferente) — linha mais próxima na planilha.');
  });
  regs.filter(x => x.fase === 'SMT' && !links[x.op]).forEach(s => ligar(s, [], 'SEM', 'Nenhuma OP de IM com este código de placa' + (s.inv ? ' nem com a mesma Invoice/CEF + Placa' : '') + '.'));
  // conflito: a mesma OP de IM ligada a mais de uma OP de SMT (TOP+BOTTOM não conta)
  const cont = {}; Object.values(links).forEach(l => l.im.forEach(o => { const k = o + '|' + (l.lado || '-'); cont[k] = (cont[k] || 0) + 1; }));
  Object.values(links).forEach(l => { if (!l.lado) l.im.forEach(o => { ['B', 'T'].forEach(ld => { if (cont[o + '|' + ld]) cont[o + '|-'] = (cont[o + '|-'] || 0) + cont[o + '|' + ld]; }); }); });
  let conflitos = 0;
  const emConf = (l, o) => cont[o + '|' + (l.lado || '-')] > 1;
  Object.values(links).forEach(l => { if (l.im.some(o => emConf(l, o))) { conflitos++; l.conf = 'VERIFICAR'; l.motivo = 'A OP de IM ' + l.im.filter(o => emConf(l, o)).join(', ') + ' está ligada a mais de uma OP de SMT.'; } });
  const imSemSmt = regs.filter(x => x.fase === 'IM' && !usadas.has(x.op) && x.rank === 1).length;
  return { links, regs, alias, diag: { lidas, semPlaca, semNada, outras, conflitos, imSemSmt, paIgnoradas, nTB, nDiv,
    nAlias: Object.keys(alias).length,
    nSmt: regs.filter(x => x.fase === 'SMT').length, nIm: regs.filter(x => x.fase === 'IM').length,
    temInv: ach.cInv >= 0, temQtd: ach.cQtd >= 0, temTipo: ach.cTipo >= 0, sheet: ach.sheet } };
}

/* vínculo de uma OP de SMT (considera OP cancelada → OP nova) */
function vinculoDe(opSmt) {
  const V = dbData.vinculo; if (!V || !V.links) return null;
  if (V.links[opSmt]) return V.links[opSmt];
  const nova = (V.alias || {})[opSmt];
  if (nova && V.links[nova]) return Object.assign({}, V.links[nova], { motivo: 'OP cancelada no Controle — substituída pela ' + nova + '. ' + (V.links[nova].motivo || '') });
  return null;
}

/* O Controle de OP passa a mandar no cruzamento SMT × IM.
   Ordem de prioridade: escolha manual  >  Controle de OP  >  chaves do plano (N1..N5) */
const _recalcOrig = recalcularCruzamento;
recalcularCruzamento = function (avisar) {
  const res = _recalcOrig(false);
  const imSet = new Set((dbData.opsIM || []).map(o => o.numero));
  (dbData.ops || []).forEach(o => {
    const L = vinculoDe(o.numero); if (!L || !L.im || !L.im.length) return;
    const cur = res[o.numero] || {};
    if (cur.manual && cur.opIM) return;
    const todas = [...L.im, ...(L.div || [])];
    const noPlano = todas.filter(x => imSet.has(x));
    const tag = 'Controle de OP · ' + CONF_TXT[L.conf];
    let opIM = noPlano[0] || null, status = 'OK', cands = noPlano;
    if (L.conf === 'VERIFICAR' && noPlano.length > 1) {
      if (cur.opIM && noPlano.includes(cur.opIM)) opIM = cur.opIM;
      else { opIM = null; status = 'AMBIGUO'; }
    }
    if (!opIM && status === 'OK') status = 'SEM';
    res[o.numero] = { opIM, candidatas: cands, status, nivel: L.conf === 'SEGURO' ? 'N1' : 'CTRL', ctrl: true, match: tag, conf: L.conf, motivo: L.motivo, manual: false, imCtrl: todas };
  });
  dbData.cruzamentos = res;
  if (avisar) { salvarBanco(); renderMES(); if (typeof renderAging === 'function') renderAging(); }
  return res;
};
/* "Sem Planejamento" quando a OP de IM existe no Controle, mas ainda não está no plano IM */
const _porqueOrig = _porqueNaoCasou;
_porqueNaoCasou = function (o) {
  const c = (dbData.cruzamentos || {})[o.numero];
  if (c && c.ctrl && c.imCtrl && c.imCtrl.length) return 'Controle de OP liga na IM ' + c.imCtrl.join(', ') + ', que ainda não está no plano IM';
  return _porqueOrig(o);
};

let _vincPrevia = null;
function lerControleOP(file) {
  if (!file) return;
  _modal('⇄ Vínculo SMT → IM — Controle de OP', '<div class="p-10 text-center text-sm font-bold text-gray-500">Lendo ' + esc(file.name) + '...</div>');
  const rd = new FileReader();
  rd.onload = e => setTimeout(() => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', dense: true });
      const ach = detectarControle(wb);
      if (!ach) { _modal('⇄ Vínculo SMT → IM — Controle de OP', '<div class="p-4 bg-red-50 border border-red-200 rounded text-sm font-bold text-red-700">Não achei as colunas <b>OP</b>, <b>Fase</b> e <b>Cód.Placa Limpa</b> na mesma linha de cabeçalho em nenhuma aba. Confira se é a planilha de Controle de OP.</div>'); return; }
      _previaVinculo(ach, file.name);
    } catch (err) { _modal('Erro', '<div class="p-4 text-red-700 font-bold">Não consegui ler: ' + esc(err.message) + '</div>'); }
  }, 30);
  rd.readAsArrayBuffer(file);
}
function _previaVinculo(ach, nome) {
  const { links, diag, alias } = montarVinculos(ach);
  const util = {};
  Object.entries(links).forEach(([op, l]) => { util[op] = { im: l.im, placa: l.placa, conf: l.conf, motivo: l.motivo, qS: l.qS, qI: l.qI, lS: l.lS, lI: l.lI, mod: l.mod, lado: l.lado, div: l.div }; });
  const aliasUtil = {};
  Object.entries(alias).forEach(([velha, nova]) => { if (util[nova] || Object.values(util).some(l => l.im.includes(nova))) aliasUtil[velha] = nova; });
  _vincPrevia = { arquivo: nome, links: util, alias: aliasUtil };
  const cnt = c => Object.values(links).filter(l => l.conf === c).length;
  const L = op => links[op] || (alias[op] && links[alias[op]]) || null;
  const noPlano = (dbData.ops || []).map(o => ({ op: o.numero, l: L(o.numero) }));
  const lig = noPlano.filter(x => x.l && x.l.im.length).length;
  const fN = v => v ? Number(v).toLocaleString('pt-BR') : '—';
  const linha = (op, l) => `<tr class="border-b border-gray-100"><td class="p-2 font-mono font-bold">${esc(op)}</td><td class="p-2 text-xs">${esc(l ? l.placa : '—')}</td>
    <td class="p-2 font-mono font-bold text-aoc">${esc(l && l.im.length ? l.im.join(', ') : '—')}</td><td class="p-2 text-xs">${esc(l ? l.lS : '')}</td><td class="p-2 text-xs">${esc(l ? l.lI : '')}</td>
    <td class="p-2 text-right">${fN(l && l.qS)}</td><td class="p-2 text-right">${fN(l && l.qI)}</td>
    <td class="p-2"><span class="text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap ${CONF_CLS[l ? l.conf : 'SEMCTRL']}">${l ? CONF_TXT[l.conf] : 'FORA DO CONTROLE'}</span></td>
    <td class="p-2 text-[11px] text-gray-600">${esc(l ? l.motivo : 'OP de SMT do plano não está no Controle de OP.')}</td></tr>`;
  const cab = `<div class="overflow-auto max-h-80 border rounded"><table class="w-full text-xs"><thead class="bg-gray-100 sticky top-0"><tr class="text-left text-[10px] uppercase text-gray-500">
    <th class="p-2">OP-SMT</th><th class="p-2">Cód. placa</th><th class="p-2">OP-IM</th><th class="p-2">Linha SMT</th><th class="p-2">Linha IM</th><th class="p-2 text-right">Qtd SMT</th><th class="p-2 text-right">Qtd IM</th><th class="p-2">Confiança</th><th class="p-2">Motivo</th></tr></thead><tbody>`;
  const ver = Object.entries(links).filter(([, l]) => l.conf !== 'SEGURO');
  const kpi = (k, v, c) => `<div class="bg-gray-50 border rounded p-2"><div class="text-[10px] font-bold uppercase text-gray-500">${k}</div><div class="text-lg font-black ${c || 'text-sidebar'}">${v}</div></div>`;
  const ok = b => b ? '✔' : '⚠';
  let h = `<div class="text-xs text-gray-600 mb-3">Parte da <b>OP de SMT</b> (Fase = SMT), lê o <b>Cód.Placa Limpa</b> e procura a <b>OP de IM</b> com o mesmo código dentro da mesma <b>Invoice/CEF</b>. TOP/BOTTOM separados, IM dividida, OP cancelada e linha PA são tratados. Cada vínculo recebe um grau de confiança.</div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
      ${kpi('Aba lida', esc(diag.sheet))}${kpi('Linhas com OP', diag.lidas)}${kpi('OPs SMT / IM', diag.nSmt + ' / ' + diag.nIm)}${kpi('Plano SMT ligado', lig + ' de ' + noPlano.length, 'text-tpv')}
      ${kpi('Seguros', cnt('SEGURO'), 'text-green-700')}${kpi('Prováveis', cnt('PROVAVEL'), 'text-yellow-600')}${kpi('Verificar', cnt('VERIFICAR'), 'text-orange-600')}${kpi('Sem OP de IM', cnt('SEM'), 'text-[#c81e1e]')}
    </div>
    <div class="text-[11px] text-gray-600 bg-blue-50 border border-blue-100 rounded p-2 mb-3 leading-relaxed">
      ${ok(diag.temInv)} Coluna Invoice/CEF ${diag.temInv ? 'encontrada — placa procurada dentro da mesma Invoice (mais seguro).' : 'não encontrada — repetições de lote viram PROVÁVEL / VERIFICAR.'}<br>
      ${ok(diag.temQtd)} Coluna Qtde ${diag.temQtd ? 'encontrada — usada para desempatar lotes.' : 'não encontrada — lotes casados pela ordem.'}<br>
      ${ok(diag.temTipo)} Coluna Placa ${diag.temTipo ? 'encontrada' : 'não encontrada'} · ${diag.semPlaca} linha(s) sem Cód.Placa Limpa<br>
      Ignoradas: ${diag.outras} de outras fases/PREP · ${diag.paIgnoradas} PA · ${diag.nAlias} OP(s) cancelada(s) mapeada(s) · ${diag.nTB} TOP/BOTTOM · ${diag.nDiv} IM dividida · ${diag.conflitos} conflito(s) · ${diag.imSemSmt} OP(s) de IM sem SMT
    </div>`;
  if (!(dbData.ops || []).length) h += '<div class="p-2 mb-3 bg-yellow-50 border border-yellow-200 rounded text-xs font-bold text-yellow-800">O plano SMT ainda não foi importado — o vínculo fica salvo e entra assim que o plano chegar.</div>';
  h += `<details open class="mb-3"><summary class="cursor-pointer text-sm font-black text-sidebar mb-2">OPs do plano SMT (${noPlano.length}) — como vão ficar</summary>${noPlano.length ? cab + noPlano.map(x => linha(x.op, x.l)).join('') + '</tbody></table></div>' : '<div class="text-xs text-gray-400 p-2">Plano SMT vazio.</div>'}</details>`;
  h += `<details class="mb-3"><summary class="cursor-pointer text-sm font-black text-orange-700 mb-2">Pontos para verificar no arquivo todo (${ver.length})</summary>${ver.length ? cab + ver.slice(0, 1500).map(([op, l]) => linha(op, l)).join('') + '</tbody></table></div>' : '<div class="text-xs text-gray-400 p-2">Nenhum — todos são seguros.</div>'}</details>`;
  h += `<div class="flex justify-end gap-2 pt-2 border-t"><button onclick="BP.fecharModal()" class="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
    <button onclick="BP.aplicarVinculo()" ${Object.keys(util).length ? '' : 'disabled'} class="px-4 py-2 text-sm font-bold bg-tpv text-white rounded shadow hover:bg-[#003d5e] disabled:opacity-50">Aplicar vínculo</button></div>`;
  _modal('⇄ Vínculo SMT → IM — Controle de OP', h, true);
}
async function aplicarVinculo() {
  if (!_vincPrevia) return;
  const p = _vincPrevia; _vincPrevia = null;
  _fecharModal();
  // o Controle é acumulado (o ano todo) → a importação nova SUBSTITUI a anterior
  dbData.vinculo = { arquivo: p.arquivo, links: p.links, alias: p.alias || {}, por: usuarioLogado ? (usuarioLogado.nome || usuarioLogado.usuario) : '—', em: new Date().toLocaleString('pt-BR'), ts: Date.now() };
  recalcularCruzamento(false);
  await salvarBanco();
  registrarLog('IMPORTAR_CONTROLE_OP', p.arquivo + ' · ' + Object.keys(p.links).length + ' OPs de SMT ligadas');
  renderMES(); _infoVinculo();
  msgTopo('Vínculo SMT → IM aplicado (' + Object.keys(p.links).length + ' OPs de SMT).');
}
function _infoVinculo() {
  const el = $('bp-vinc-info'); if (!el) return;
  const V = dbData.vinculo;
  el.textContent = (V && V.arquivo) ? 'Última: ' + V.arquivo + ' · ' + (V.em || '') + ' · ' + (V.por || '') + ' · ' + Object.keys(V.links || {}).length + ' OPs de SMT ligadas' : 'Nenhuma importação ainda';
}
function _montarCardControle() {
  const grade = $('plano-dropzone'); if (!grade || $('bp-ctrl-card')) return;
  const box = grade.parentNode;
  const card = document.createElement('div');
  card.id = 'bp-ctrl-card';
  card.className = 'mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-white flex flex-col md:flex-row items-center gap-4 hover:border-green-600 transition-all cursor-pointer';
  card.innerHTML = `<div class="flex items-center gap-3 flex-1"><span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-green-700 text-white">SMT → IM</span>
      <i data-lucide="git-merge" class="w-8 h-8 text-green-700"></i>
      <div><p class="text-sm font-bold text-sidebar">Arraste aqui o Controle de OP (.xlsb / .xlsx) — vínculo seguro SMT → IM</p>
      <p class="text-xs text-gray-500">Mesma regra do Consulta de Plano: Cód.Placa Limpa + Invoice/CEF, com grau de confiança. Manda no cruzamento (só a escolha manual vence).</p>
      <p id="bp-vinc-info" class="text-[11px] font-bold text-green-700 mt-1"></p></div></div>
      <input type="file" id="bp-ctrl-file" accept=".xlsx,.xls,.xlsb,.xlsm" class="hidden">`;
  box.parentNode.insertBefore(card, box);
  const fi = card.querySelector('#bp-ctrl-file');
  card.addEventListener('click', e => { if (e.target !== fi) fi.click(); });
  fi.addEventListener('change', e => { if (e.target.files[0]) lerControleOP(e.target.files[0]); e.target.value = ''; });
  card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('border-green-600', 'bg-green-50'); });
  card.addEventListener('dragleave', () => card.classList.remove('border-green-600', 'bg-green-50'));
  card.addEventListener('drop', e => { e.preventDefault(); card.classList.remove('border-green-600', 'bg-green-50'); if (e.dataTransfer.files[0]) lerControleOP(e.dataTransfer.files[0]); });
  _infoVinculo(); icones();
}

/* ─────────────────────────── modal / aviso ─────────────────────────── */
function _modal(titulo, html, largo) {
  let m = $('bp-modal');
  if (!m) {
    m = document.createElement('div'); m.id = 'bp-modal';
    m.className = 'fixed inset-0 z-[9000] bg-black/50 flex items-center justify-center p-4';
    m.addEventListener('click', e => { if (e.target === m) _fecharModal(); });
    document.body.appendChild(m);
  }
  m.classList.remove('hidden');
  m.innerHTML = `<div class="bg-white rounded-xl shadow-2xl w-full ${largo ? 'max-w-6xl' : 'max-w-2xl'} max-h-[92vh] flex flex-col">
    <div class="flex items-center px-5 py-3 border-b bg-sidebar rounded-t-xl"><h3 class="text-sm font-black text-white uppercase tracking-wide flex-1">${titulo}</h3>
    <button onclick="BP.fecharModal()" class="text-white/70 hover:text-white text-xl leading-none">&times;</button></div>
    <div class="p-5 overflow-auto">${html}</div></div>`;
  icones();
}
function _fecharModal() { const m = $('bp-modal'); if (m) { m.classList.add('hidden'); m.innerHTML = ''; } }
function msgTopo(txt, erro) {
  const d = document.createElement('div');
  d.className = 'fixed top-4 right-4 z-[9500] px-4 py-3 rounded-lg shadow-xl text-sm font-bold ' + (erro ? 'bg-[#c81e1e] text-white' : 'bg-green-600 text-white');
  d.textContent = txt; document.body.appendChild(d);
  setTimeout(() => d.remove(), 4000);
}

/* ═════════════════ [4] SALA DO BUFFER — ESTACIONAMENTO FIFO ═════════════
   A sala é uma GRADE igual ao desenho: RUA 01..11 (colunas) × POSIÇÃO
   01..06 (linhas). A Posição 05 é o CORREDOR azul (entrada pela porta,
   ao lado do PC do operador). Cada vaga = 1 PALETE com até 12 magazines
   (6 embaixo + 6 em cima) de UMA OP.
   FILA FIFO: em cada rua, quem está colado no corredor é a FRENTE (sai
   primeiro). Posições 04→01 formam uma fila; a Posição 06 é vaga de
   frente direta para o corredor. Quem está na frente precisa ir para a
   IM antes (ou no mesmo dia) de quem está atrás.                        */
/* v3: Rua 11 Pos 01–03 = RETRABALHO (não recebem palete) · Rua 11 = última
   opção (ruaUltima) · placasMag = placas por magazine (só para desenhar o 3D) */
const RETRAB_PADRAO = { 'R11-P01': 'retrabalho', 'R11-P02': 'retrabalho', 'R11-P03': 'retrabalho' };
const SALA_PADRAO = () => ({
  versao: 3, atualizadoEm: Date.now(),
  ruas: 11, posicoes: 6, corredor: 5, corredorAte: 10, cap: 12,
  celLarg: 1.45, celProf: 1.3, corrProf: 2.2, ruaUltima: 11, placasMag: 50,
  celulas: Object.assign({ 'R01-P06': 'pc', 'R02-P06': 'vazio', 'R06-P06': 'vazio', 'R07-P06': 'vazio' }, RETRAB_PADRAO)
});
const idVaga = (r, p) => 'R' + p2(r) + '-P' + p2(p);
function tipoCelula(S, r, p) {
  const o = (S.celulas || {})[idVaga(r, p)];
  if (o) return o;
  if (p === S.corredor && r <= (S.corredorAte || S.ruas)) return 'corredor';
  return 'vaga';
}

function _garantirSala() {
  const S = dbData.sala;
  if (S && S.versao === 2) {          // layout antigo: mantém o que o Key User editou e só acrescenta o novo
    S.celulas = S.celulas || {};
    Object.keys(RETRAB_PADRAO).forEach(k => { if (!S.celulas[k]) S.celulas[k] = RETRAB_PADRAO[k]; });
    if (S.ruaUltima == null) S.ruaUltima = 11;
    if (S.placasMag == null) S.placasMag = 50;
    S.versao = 3; S.atualizadoEm = Date.now();
  } else if (!S || S.versao !== 3) dbData.sala = SALA_PADRAO();
  if (!dbData.vagas || typeof dbData.vagas !== 'object' || Array.isArray(dbData.vagas)) dbData.vagas = {};
}
const _garantirOrig = _garantirEstrutura;
_garantirEstrutura = function () { _garantirOrig(); _garantirSala(); };

/* mescla: o sistema original faz "remoto vence" para chaves novas — aqui
   cada LPN da sala vence pela edição mais recente (nada se perde entre PCs) */
const _mesclarOrig = _mesclarBanco;
_mesclarBanco = function (remoto) {
  const local = dbData;
  const out = _mesclarOrig(remoto);
  const vR = remoto.vagas || {}, vL = local.vagas || {}, vO = {};
  new Set([...Object.keys(vR), ...Object.keys(vL)]).forEach(k => {
    const a = vR[k], b = vL[k];
    vO[k] = !a ? b : !b ? a : ((Number(b.em) || 0) > (Number(a.em) || 0) ? b : a);
  });
  out.vagas = vO;
  const sR = remoto.sala, sL = local.sala;
  out.sala = (sL && (!sR || (Number(sL.atualizadoEm) || 0) > (Number(sR.atualizadoEm) || 0))) ? sL : (sR || sL);
  const iR = remoto.vinculo, iL = local.vinculo;
  out.vinculo = (iL && (!iR || (Number(iL.ts) || 0) > (Number(iR.ts) || 0))) ? iL : (iR || iL);
  return out;
};

/* geometria da sala: posição X de cada rua e Z de cada linha (Posição 06 no fundo) */
function gradeSala(S) {
  S = S || dbData.sala;
  const xs = {}, zs = {}, prof = {};
  for (let r = 1; r <= S.ruas; r++) xs[r] = (r - 1) * S.celLarg + S.celLarg / 2;
  let z = 0;
  for (let p = S.posicoes; p >= 1; p--) { const h = p === S.corredor ? S.corrProf : S.celProf; zs[p] = z + h / 2; prof[p] = h; z += h; }
  return { xs, zs, prof, largura: S.ruas * S.celLarg, comprimento: z };
}

/* todas as vagas com a fila (lane) e a ordem dentro dela (1 = frente) */
function vagasDaSala() {
  _garantirSala();
  const S = dbData.sala, G = gradeSala(S), out = [];
  for (let r = 1; r <= S.ruas; r++) {
    // filas: acima do corredor (frente = mais perto do corredor), abaixo idem, e a linha do corredor sozinha
    const acima = [], abaixo = [];
    for (let p = 1; p <= S.posicoes; p++) {
      const tc = tipoCelula(S, r, p);
      // RETRABALHO: vaga reservada, fila própria de 1 vaga (só recebe palete por escolha manual)
      if (tc === 'retrabalho') { out.push({ p, lane: 'R' + p2(r) + '-X' + p2(p), ordem: 1, face: p < S.corredor ? Math.PI : 0, r, retrab: true }); continue; }
      if (tc !== 'vaga') continue;
      if (p > S.corredor) acima.push(p); else if (p < S.corredor) abaixo.push(p);
      else out.push({ p, lane: 'R' + p2(r) + '-C', ordem: 1, face: -Math.PI / 2, r });
    }
    // corta a fila onde há célula que não é vaga (não dá para passar por ela)
    const filas = (lista, crescente, lado) => {
      lista.sort((a, b) => crescente ? a - b : b - a);
      let n = 0, ant = null;
      lista.forEach(p => { if (ant !== null && Math.abs(p - ant) > 1) n++; ant = p;
        out.push({ p, lane: 'R' + p2(r) + lado + n, ordem: 0, face: lado === 'S' ? 0 : Math.PI, r }); });
    };
    filas(acima, true, 'S'); filas(abaixo, false, 'I');
  }
  const ordemNaFila = {};
  return out.map(v => {
    ordemNaFila[v.lane] = (ordemNaFila[v.lane] || 0) + 1;
    return { id: idVaga(v.r, v.p), r: v.r, pos: v.p, rua: 'Rua ' + p2(v.r), lane: v.lane, ordem: v.ordem || ordemNaFila[v.lane],
      cap: Math.max(1, Number(S.cap) || 12), x: G.xs[v.r], z: G.zs[v.p], prof: G.prof[v.p], face: v.face, retrab: !!v.retrab };
  });
}
const nomeVaga = id => { const m = String(id || '').match(/^R(\d+)-P(\d+)$/); return m ? 'Rua ' + m[1] + ' · Posição ' + m[2] : id; };

/* o que está DENTRO do buffer agora (entradas > saídas, por LPN) */
function bufferAgora() {
  const por = {};
  _leiturasComTs().forEach(l => {
    const k = l.lpn; if (!k) return;
    const x = por[k] || (por[k] = { lpn: k, ent: 0, sai: 0, op: '', qtd: 0, ts: 0 });
    if (_tipoLeitura(l) === 'entrada') { x.ent++; if (l._ts >= x.ts) { x.ts = l._ts; x.op = l.op; x.qtd = Number(l.qtd) || 0; } }
    else x.sai++;
  });
  return Object.values(por).filter(x => x.ent > x.sai).map(x => Object.assign(x, infoOP(x.op)));
}
function infoOP(op) {
  const smt = (dbData.ops || []).find(o => o.numero === op) || {};
  const im = (typeof imDaOpSMT === 'function') ? imDaOpSMT(op) : null;
  const dIM = im ? _dataPlanoObj(im.data) : null;
  return { modelo: smt.modelo || (im && im.modelo) || '', linhaSMT: smt.linha || '', opIM: im ? im.numero : '', linhaIM: im ? (im.linha || '') : '',
    dataIM: dIM ? dIM.getTime() : null, dataIMtxt: im ? (im.data || '') : '' };
}
const chaveIM = it => it.dataIM == null ? 9e15 : it.dataIM;   // sem plano IM = vai por último

/* mapa da ocupação atual: vaga → itens e itens sem vaga */
function ocupacao() {
  const vagas = vagasDaSala(), porId = {}, mapa = {};
  vagas.forEach(v => { porId[v.id] = v; mapa[v.id] = []; });
  const semVaga = [];
  const agora = Date.now();
  bufferAgora().forEach(it => {
    it.dias = it.ts ? Math.floor((agora - it.ts) / DIA) : 0;
    const reg = dbData.vagas[it.lpn];
    if (reg && reg.vaga && porId[reg.vaga]) { it.vaga = reg.vaga; mapa[reg.vaga].push(it); }
    else semVaga.push(it);
  });
  return { vagas, porId, mapa, semVaga };
}

/* ── melhor vaga para um PALETE (o "melhor cenário" do estacionamento) ──
   1 vaga = 1 palete. A fila de cada rua é abastecida do FUNDO para a
   FRENTE (ergonomia: ninguém passa por cima de palete e a vaga do fundo
   não fica esquecida). Só conta como vaga boa a mais funda que dá para
   alcançar pelo corredor sem mexer em ninguém.
   1) na frente de outro palete da mesma OP (mesma fila, sem quebrar FIFO)
   2) fila que já tem paletes, sem quebrar FIFO, com data de IM parecida
      com a de quem fica atrás; mesmo modelo ganha ponto
   3) fila vazia → vai para o FUNDO (IM hoje/amanhã prefere vaga de 1 só,
      de frente para o corredor, para não travar uma fila inteira)
   4) só se não tiver jeito: vaga que quebra o FIFO (avisa)
   · Rua de última opção (Rua 11): só quando o resto estiver cheio
   · Empate: a rua mais perto da porta (menos caminhada)
   · Vagas de RETRABALHO são reservadas: nunca são sugeridas; o operador
     só guarda lá por escolha manual (quando ela está vazia no momento).
     Quando o palete sai, a vaga volta a ser retrabalho                  */
function _porFila(vagas) {
  const m = {};
  vagas.forEach(v => (m[v.lane] = m[v.lane] || []).push(v));
  Object.values(m).forEach(l => l.sort((a, b) => a.ordem - b.ordem));
  return Object.values(m);
}
const _hoje0 = () => { const h = new Date(); h.setHours(0, 0, 0, 0); return h.getTime(); };
/* nota de TODAS as vagas livres (menor = melhor). Serve para a sugestão
   automática e para a escolha manual (mostra o porquê de cada vaga). */
function avaliarVagas(item, oc, ignorarLpn) {
  oc = oc || ocupacao();
  const S = dbData.sala, k = chaveIM(item), out = [];
  const ddIM = item.dataIM == null ? null : Math.round((item.dataIM - _hoje0()) / DIA);
  const urgente = ddIM != null && ddIM <= 1;
  const ultima = Number(S.ruaUltima) || 0;
  _porFila(oc.vagas).forEach(lista => {
    const itens = lista.map(v => (oc.mapa[v.id] || []).filter(x => x.lpn !== ignorarLpn));
    if (lista[0].retrab) {
      if (!itens[0].length) out.push({ vaga: lista[0].id, v: lista[0], nota: 4000, retrab: true, bloqueada: false, quebra: 0, ruim: true,
        motivo: '🛠 Vaga de RETRABALHO (reservada). Só guarde aqui se ela estiver vazia agora — quando o palete sair, volta a ser retrabalho.' });
      return;
    }
    const frente = itens.findIndex(a => a.length > 0);            // 1º palete a partir do corredor
    const alvo = frente < 0 ? lista.length - 1 : frente - 1;      // vaga livre mais funda alcançável
    const modeloNaFila = itens.some(a => a.some(x => x.modelo && x.modelo === item.modelo));
    lista.forEach((v, i) => {
      if (itens[i].length) return;                                // ocupada
      const tv = travaDe(v.id);
      if (tv && tv.tipo === 'bloq') return;                       // bloqueada (manutenção): nunca entra
      let nota, motivo, bloqueada = false, quebra = 0;
      if (frente >= 0 && i > frente) {
        bloqueada = true; nota = 3000 + i;
        motivo = '⚠ Atrás de outro palete — precisa tirar o palete da frente para chegar aqui.';
      } else {
        const gap = Math.max(alvo - i, 0);                         // vagas que ficariam vazias atrás
        for (let j = i + 1; j < itens.length; j++) itens[j].forEach(x => { if (chaveIM(x) < k) quebra++; });
        const txtGap = gap ? ' · deixa ' + gap + ' vaga(s) vazia(s) atrás' : '';
        if (quebra) {
          nota = 500 + quebra * 20 + gap * 8;
          motivo = '⚠ Quebra o FIFO: fica na frente de ' + quebra + ' palete(s) que vão para a IM antes.' + txtGap;
        } else if (frente >= 0 && itens[frente].some(x => x.op === item.op)) {
          nota = 1 + gap * 8;
          motivo = 'Na frente de outro palete da mesma OP ' + item.op + ' — mesma fila FIFO.' + txtGap;
        } else if (frente >= 0) {
          const viz = Math.min(...itens[frente].map(chaveIM));
          const difDias = Math.min(Math.abs(k - viz) / DIA, 30);
          nota = 10 + difDias + gap * 8 - (modeloNaFila ? 3 : 0);
          motivo = 'Fila da ' + v.rua + ': ' + (item.dataIM == null && viz === chaveIM({}) ? 'paletes sem plano de IM juntos'
                   : 'vai para a IM ' + (difDias < 1 ? 'no mesmo dia' : 'antes') + ' de quem fica atrás') + (modeloNaFila ? ' · mesmo modelo' : '') + '.' + txtGap;
        } else {
          const so1 = lista.length === 1;
          nota = 45 + gap * 8 + (so1 ? (urgente ? -6 : 3) : (urgente ? 2 : 0));
          motivo = so1 ? 'Vaga de frente para o corredor' + (urgente ? ' — o palete sai logo (IM ' + (ddIM < 0 ? 'atrasada' : ddIM === 0 ? 'hoje' : 'amanhã') + ').' : '.')
                       : (gap ? v.rua + ' livre, mas fora do fundo da fila.' + txtGap : v.rua + ' livre — palete no FUNDO da fila (os próximos vêm para a frente).');
        }
        nota += (v.r - 1) * 0.15;                                   // perto da porta = menos caminhada
      }
      if (ultima && v.r === ultima) { nota += 2000; motivo += ' · Rua ' + p2(ultima) + ' é a última opção.'; }
      if (tv && tv.tipo === 'reserva') {                          // reservada: só para a OP dela
        if (tv.op === item.op) { nota = -100 + i * 0.01; motivo = '📌 Vaga reservada para a OP ' + tv.op + '.'; }
        else { out.push({ vaga: v.id, v, nota: 3500, motivo: '📌 Reservada para a OP ' + tv.op + ' — só guarde aqui com autorização.', bloqueada, quebra, ruim: true, reservada: true }); return; }
      }
      out.push({ vaga: v.id, v, nota, motivo, bloqueada, quebra, ruim: bloqueada || quebra > 0 });
    });
  });
  return out.sort((a, b) => a.nota - b.nota);
}
function sugerirVaga(item, oc, ignorarLpn) {
  return avaliarVagas(item, oc, ignorarLpn).find(x => !x.bloqueada && !x.retrab && !x.reservada) || null;   // null = sala cheia (retrabalho nunca é sugerido)
}

/* quebras de FIFO: palete que sai DEPOIS parado na frente de quem sai ANTES */
function bloqueios(oc) {
  oc = oc || ocupacao();
  const out = [];
  _porFila(oc.vagas).forEach(lista => {
    let minAtras = Infinity;
    for (let i = lista.length - 1; i >= 0; i--) {
      const its = oc.mapa[lista[i].id] || [];
      its.forEach(x => { if (chaveIM(x) > minAtras) out.push(x); });
      its.forEach(x => { minAtras = Math.min(minAtras, chaveIM(x)); });
    }
  });
  return out;
}

/* ordem de retirada para a IM: data IM, depois quem está na frente, depois FIFO de entrada */
function ordemRetirada(oc) {
  oc = oc || ocupacao();
  const todos = [];
  Object.entries(oc.mapa).forEach(([id, its]) => its.forEach(x => todos.push(Object.assign({}, x, { posN: oc.porId[id].ordem }))));
  oc.semVaga.forEach(x => todos.push(Object.assign({}, x, { posN: 99 })));
  return todos.sort((a, b) => chaveIM(a) - chaveIM(b) || a.posN - b.posN || a.ts - b.ts);
}

/* a mesma ordem, agrupada por palete (o operador tira o palete inteiro) */
function paletesRetirada(oc) {
  const out = [], vistos = {};
  ordemRetirada(oc).forEach(x => { const k = x.vaga || ('LPN:' + x.lpn);
    if (vistos[k]) { vistos[k].n++; vistos[k].q += Number(x.qtd) || 0; return; } vistos[k] = Object.assign({}, x, { n: 1, q: Number(x.qtd) || 0 }); out.push(vistos[k]); });
  return out;
}
async function gravarVaga(lpn, vaga, op, auto) {
  _registrarUso(lpn, vaga, op, auto);
  dbData.vagas[lpn] = { vaga: vaga || null, op: op || '', em: Date.now(), por: usuarioLogado ? usuarioLogado.usuario : '—', auto: !!auto };
}
/* limpa registros de LPN que já saíram há mais de 30 dias (arquivo leve) */
function _enxugarVagas() {
  const dentro = new Set(bufferAgora().map(x => x.lpn)), lim = Date.now() - 30 * DIA;
  Object.entries(dbData.vagas).forEach(([k, v]) => { if (!dentro.has(k) && (Number(v.em) || 0) < lim) delete dbData.vagas[k]; });
}

/* ENTRADA → reserva a melhor vaga e abre a sala 3D mostrando ONDE guardar
   o palete (o operador pode escolher outra vaga) · SAÍDA → libera a vaga */
let _ultimoAviso = null;
const _finalizarOrig = finalizarLeitura;
finalizarLeitura = async function () {
  const lido = Object.assign({}, leituraBuffer), modo = modoLeitura;
  await _finalizarOrig();
  let abrir = false;
  try {
    if (modo === 'entrada') {
      const oc = ocupacao();
      const it = oc.semVaga.find(x => x.lpn === lido.lpn) || Object.assign({ lpn: lido.lpn, op: lido.op, qtd: lido.qtd }, infoOP(lido.op));
      const reg = dbData.vagas[lido.lpn];
      if (!(reg && reg.vaga && oc.porId[reg.vaga])) {
        const s = sugerirVaga(it, oc);
        if (s) { _motivoUso = s.motivo; await gravarVaga(lido.lpn, s.vaga, lido.op, true); _ultimoAviso = { tipo: 'entrada', lpn: lido.lpn, op: lido.op, vaga: s.vaga, motivo: s.motivo, ruim: s.ruim }; }
        else _ultimoAviso = { tipo: 'cheia', lpn: lido.lpn, op: lido.op };
        await salvarBanco();
      } else _ultimoAviso = { tipo: 'entrada', lpn: lido.lpn, op: lido.op, vaga: reg.vaga, motivo: 'Vaga já reservada para este palete.', ruim: false };
      abrir = _ultimoAviso.tipo === 'entrada';
    } else {
      const reg = dbData.vagas[lido.lpn];
      const aindaDentro = bufferAgora().some(x => x.lpn === lido.lpn);
      if (!aindaDentro) {
        _ultimoAviso = { tipo: 'saida', lpn: lido.lpn, op: lido.op, vaga: reg && reg.vaga };
        await gravarVaga(lido.lpn, null, lido.op, false);
        await salvarBanco();
      }
    }
  } catch (e) { console.warn('Vaga:', e); }
  renderPainelVaga();
  sala3d.atualizar();
  if (abrir) abrirGuardar(lido.lpn, true);
};

function _painelVagaEl() {
  let p = $('bp-vaga-painel');
  if (!p) {
    const card = document.querySelector('#aba-LEITURA .estacao-card'); if (!card) return null;
    p = document.createElement('div'); p.id = 'bp-vaga-painel'; p.className = 'mb-6';
    card.parentNode.insertBefore(p, card.nextSibling);
  }
  return p;
}
const fQ = v => Number(v || 0).toLocaleString('pt-BR');
function renderPainelVaga() {
  const p = _painelVagaEl(); if (!p) return;
  const a = _ultimoAviso, oc = ocupacao();
  let h = '';
  if (a && a.tipo === 'entrada') {
    h += `<div class="rounded-xl border-2 ${a.ruim ? 'border-orange-500 bg-orange-50' : 'border-green-600 bg-green-50'} p-4 flex flex-col md:flex-row items-center gap-4 shadow-sm">
      <div class="text-center md:text-left"><div class="text-[11px] font-black uppercase tracking-widest ${a.ruim ? 'text-orange-700' : 'text-green-700'}">Guardar o palete na vaga</div>
      <div class="text-5xl font-black text-sidebar font-mono leading-none my-1">${esc(a.vaga)}</div>
      <div class="text-sm font-black text-sidebar">${esc(nomeVaga(a.vaga))}</div>
      <div class="text-xs font-bold text-gray-600">LPN ${esc(a.lpn)} · OP ${esc(a.op)}</div></div>
      <div class="flex-1 text-sm text-gray-700">${esc(a.motivo)}</div>
      <div class="flex gap-2"><button onclick="BP.trocarVaga('${esc(a.lpn)}')" class="px-3 py-2 text-xs font-bold bg-sidebar text-white rounded flex items-center gap-1"><i data-lucide="box" class="w-4 h-4"></i> Ver na sala 3D / trocar vaga</button></div></div>`;
  } else if (a && a.tipo === 'saida') {
    h += `<div class="rounded-xl border-2 border-blue-500 bg-blue-50 p-4 flex items-center gap-4 shadow-sm"><div><div class="text-[11px] font-black uppercase tracking-widest text-blue-700">Palete retirado da vaga</div>
      <div class="text-4xl font-black text-sidebar font-mono leading-none my-1">${esc(a.vaga || 'sem vaga')}</div><div class="text-xs font-bold text-gray-600">LPN ${esc(a.lpn)} · OP ${esc(a.op)} — vaga liberada</div></div></div>`;
  } else if (a && a.tipo === 'cheia') {
    h += `<div class="rounded-xl border-2 border-[#c81e1e] bg-red-50 p-4 text-sm font-bold text-[#c81e1e]">SALA CHEIA — não há vaga livre para o palete ${esc(a.lpn)}. Libere vagas ou aumente a sala em Sala do Buffer 3D › Layout.</div>`;
  }
  if (modoLeitura === 'saida') {
    const ord = paletesRetirada(oc).slice(0, 6);
    h += `<div class="mt-3 bg-white rounded-xl border border-gray-200 p-4"><div class="text-xs font-black uppercase text-sidebar mb-2">Próximos a sair (FIFO pela data da IM)</div>
      ${ord.length ? '<div class="grid grid-cols-1 md:grid-cols-3 gap-2">' + ord.map((x, i) => `<div class="flex items-center gap-2 border rounded p-2 ${i === 0 ? 'border-tpv bg-blue-50' : ''}">
        <span class="font-mono font-black text-lg text-sidebar w-24 whitespace-nowrap">${esc(x.vaga || '—')}</span><div class="text-[11px] leading-tight"><b>OP ${esc(x.op)}</b> · ${esc(x.modelo || '')}<br>
        <span class="text-gray-500">IM ${esc(x.linhaIM || '?')} · ${esc(x.dataIMtxt || 'sem plano')} · ${fQ(x.q)} placas</span></div></div>`).join('') + '</div>' : '<div class="text-xs text-gray-400">Buffer vazio.</div>'}</div>`;
  }
  p.innerHTML = h; icones();
}

/* ── tela "GUARDAR O PALETE": sala 3D com a vaga indicada + escolha manual ──
   Abre sozinha depois da leitura de entrada. Clique numa vaga livre (no 3D
   ou na lista) para trocar. Enter / Esc / bipar a próxima etiqueta = fecha. */
let _guardar = null;
function trocarVaga(lpn) { abrirGuardar(lpn, false); }
function abrirGuardar(lpn, novo) {
  const it = bufferAgora().find(x => x.lpn === lpn); if (!it) return;
  const reg = dbData.vagas[lpn];
  _guardar = { lpn, op: it.op, vaga: (reg && reg.vaga) || null, novo: !!novo, sugestao: novo ? ((reg && reg.vaga) || null) : ((sugerirVaga(it, null, lpn) || {}).vaga || null) };
  let g = $('bp-guardar');
  if (!g) {
    g = document.createElement('div'); g.id = 'bp-guardar';
    g.className = 'fixed inset-0 z-[8800] bg-[#060b16] text-white flex flex-col';
    g.innerHTML = `<div class="flex items-center gap-4 px-6 py-3 border-b border-white/10">
        <i data-lucide="package-check" class="w-7 h-7 text-green-400"></i>
        <div><div class="text-xl font-black tracking-wide">GUARDAR O PALETE</div><div class="text-[11px] text-white/50 font-bold uppercase tracking-widest">Sala do buffer · clique numa vaga livre para escolher outra</div></div>
        <button onclick="BP.fecharGuardar()" class="ml-auto text-white/50 hover:text-white text-3xl leading-none" title="Fechar (Enter / Esc)">&times;</button></div>
      <div class="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] min-h-0">
        <div class="relative min-h-[320px]"><div id="bp-g-3d" class="absolute inset-0"></div>
          <div class="bp-tip hidden absolute pointer-events-none bg-white/95 text-gray-800 rounded-lg shadow-xl p-3 text-xs max-w-xs z-10"></div>
          <div class="absolute left-4 bottom-4 text-xs font-bold bg-black/60 rounded-lg px-3 py-2 flex items-center gap-2"><span class="inline-block w-3 h-3 rounded-full bg-green-400"></span> Vaga indicada · arraste para girar · roda do mouse = zoom</div></div>
        <div id="bp-g-info" class="border-l border-white/10 p-5 overflow-auto"></div></div>`;
    document.body.appendChild(g);
    document.addEventListener('keydown', _teclaGuardar, true);
  }
  _noTopoTelaCheia(g);
  g.classList.remove('hidden');
  const inp = $('barra-input'); if (inp) inp.blur();
  renderGuardar();
  sala3d.montarEm($('bp-g-3d'), 'escolha', { lpn, vaga: _guardar.vaga, aoEscolher: escolherNoGuardar });
  icones();
}
/* em tela cheia o navegador só mostra o que está DENTRO do elemento em
   tela cheia: a tela Guardar vai para dentro dele e volta ao body depois */
function _noTopoTelaCheia(g) {
  const fs = document.fullscreenElement;
  const alvo = fs && fs !== document.documentElement && !fs.contains(g) ? fs : (fs ? null : document.body);
  if (alvo && g.parentNode !== alvo) alvo.appendChild(g);
}
document.addEventListener('fullscreenchange', () => { const g = $('bp-guardar'); if (g) _noTopoTelaCheia(g); });
const guardarAberto = () => !!$('bp-guardar') && !$('bp-guardar').classList.contains('hidden');
/* mini aviso dentro da tela Guardar (no lugar do confirm do navegador).
   Enter = confirmar · Esc = cancelar. Devolve true/false. */
let _avisoG = null;
function _avisoGuardar(cor, titulo, html, btnOk) {
  if (_avisoG) _avisoG.fim(false);
  const g = $('bp-guardar'); if (!g) return Promise.resolve(true);
  const c = cor === 'roxo' ? { b: 'border-purple-400', t: 'text-purple-300', btn: 'bg-purple-600 hover:bg-purple-500', ic: 'wrench' }
                           : { b: 'border-orange-400', t: 'text-orange-300', btn: 'bg-orange-600 hover:bg-orange-500', ic: 'alert-triangle' };
  const d = document.createElement('div');
  d.className = 'absolute inset-0 z-20 flex items-start justify-center pt-24 bg-black/40';
  d.innerHTML = `<div class="w-[440px] max-w-[92vw] rounded-xl border-2 ${c.b} bg-[#0b1220] shadow-2xl p-5">
      <div class="flex items-center gap-2 text-sm font-black uppercase tracking-widest ${c.t} mb-2"><i data-lucide="${c.ic}" class="w-5 h-5"></i> ${esc(titulo)}</div>
      <div class="text-sm text-white/90 leading-relaxed mb-4">${html}</div>
      <div class="flex justify-end gap-2 whitespace-nowrap">
        <button data-r="0" class="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold">Cancelar (Esc)</button>
        <button data-r="1" class="px-4 py-2 rounded-lg ${c.btn} text-sm font-black">${esc(btnOk)} (Enter)</button></div></div>`;
  g.appendChild(d); icones();
  return new Promise(res => {
    _avisoG = { fim: r => { d.remove(); _avisoG = null; res(r); } };
    d.addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (b) _avisoG.fim(b.dataset.r === '1'); else if (e.target === d) _avisoG.fim(false); });
  });
}
function _teclaGuardar(e) {
  if (!guardarAberto()) return;
  if (_avisoG) {   // aviso aberto: Enter confirma, Esc cancela, o resto é ignorado
    if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _avisoG.fim(e.key === 'Enter'); }
    return;
  }
  if ($('bp-modal') && !$('bp-modal').classList.contains('hidden')) return;
  if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharGuardar(); return; }
  // o operador já bipou a próxima etiqueta: fecha e manda o que foi digitado para a barra
  if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && (!document.activeElement || document.activeElement === document.body)) {
    e.preventDefault(); fecharGuardar();
    const inp = $('barra-input'); if (inp) { inp.focus(); inp.value += e.key; }
  }
}
function renderGuardar() {
  const el = $('bp-g-info'); if (!el || !_guardar) return;
  const it = bufferAgora().find(x => x.lpn === _guardar.lpn); if (!it) { fecharGuardar(); return; }
  const oc = ocupacao(), lista = avaliarVagas(it, oc, it.lpn);
  const atual = lista.find(x => x.vaga === _guardar.vaga);
  const ruim = atual && atual.ruim;
  const melhores = lista.filter(x => !x.bloqueada && !x.retrab && !x.reservada && x.vaga !== _guardar.vaga).slice(0, 5);
  const porRua = {};
  lista.forEach(x => (porRua[x.v.rua] = porRua[x.v.rua] || []).push(x));
  const btnVaga = x => `<button onclick="BP.escolherVaga('${x.vaga}')" title="${esc(x.motivo)}" class="px-2 py-1 text-xs font-mono font-bold rounded border ${x.vaga === _guardar.vaga ? 'bg-green-500 text-white border-green-300' : x.retrab || x.reservada ? 'bg-purple-500/20 text-purple-200 border-purple-400/40' : x.bloqueada ? 'bg-white/5 text-white/40 border-white/10' : x.ruim ? 'bg-orange-500/20 text-orange-200 border-orange-400/40' : 'bg-white/10 hover:bg-white/20 border-white/20'}">P${p2(x.v.pos)}</button>`;
  el.innerHTML = `
    <div class="rounded-xl ${ruim ? 'bg-orange-500/15 border-orange-400' : 'bg-green-500/15 border-green-400'} border-2 p-4 mb-4">
      <div class="text-[11px] font-black uppercase tracking-widest ${ruim ? 'text-orange-300' : 'text-green-300'}">${_guardar.vaga && _guardar.vaga === _guardar.sugestao ? 'Vaga sugerida' : _guardar.vaga ? 'Vaga escolhida' : 'Sem vaga'}</div>
      <div class="text-6xl font-black font-mono leading-none my-2">${esc(_guardar.vaga || '—')}</div>
      <div class="text-base font-black">${esc(_guardar.vaga ? nomeVaga(_guardar.vaga) : 'Escolha uma vaga livre')}</div>
      <div class="text-sm text-white/80 mt-2">${esc(atual ? atual.motivo : '')}</div>
    </div>
    <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
      <div><div class="text-[10px] uppercase font-black text-white/50">OP SMT</div><div class="font-black font-mono">${esc(it.op)}</div></div>
      <div><div class="text-[10px] uppercase font-black text-white/50">Quantidade</div><div class="font-black">${fQ(it.qtd)} placas</div></div>
      <div class="col-span-2"><div class="text-[10px] uppercase font-black text-white/50">Modelo</div><div class="font-black truncate">${esc(it.modelo || '—')}</div></div>
      <div><div class="text-[10px] uppercase font-black text-white/50">OP IM</div><div class="font-black font-mono text-sky-300">${esc(it.opIM || '—')}</div></div>
      <div><div class="text-[10px] uppercase font-black text-white/50">Data IM</div><div class="font-black">${esc(it.dataIMtxt || 'sem plano')}</div></div>
      <div class="col-span-2"><div class="text-[10px] uppercase font-black text-white/50">Linha IM</div><div class="font-black truncate">${esc(it.linhaIM || '—')}</div></div>
      <div class="col-span-2 text-[11px] text-white/50 font-mono">LPN ${esc(it.lpn)}</div>
    </div>
    <button onclick="BP.fecharGuardar()" class="w-full py-4 rounded-xl bg-green-600 hover:bg-green-500 text-lg font-black shadow-lg mb-2">${_guardar.vaga ? '✔ OK — palete guardado em ' + esc(_guardar.vaga) : 'Fechar'}</button>
    ${_guardar.sugestao && _guardar.vaga !== _guardar.sugestao ? `<button onclick="BP.escolherVaga('${_guardar.sugestao}')" class="w-full py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm font-bold mb-2">Usar a sugerida (${esc(_guardar.sugestao)})</button>` : ''}
    <div class="text-[10px] text-white/40 text-center mb-4">Enter / Esc fecha · bipar a próxima etiqueta também fecha</div>
    ${melhores.length ? `<div class="text-xs font-black uppercase tracking-widest text-sky-300 mb-2">Outras boas vagas</div>
      <div class="space-y-1 mb-4">${melhores.map(x => `<button onclick="BP.escolherVaga('${x.vaga}')" class="w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 bg-white/5 hover:bg-white/15 border border-white/10">
        <span class="font-mono font-black text-lg w-24 shrink-0 ${x.ruim ? 'text-orange-300' : ''}">${x.vaga}</span><span class="text-[11px] text-white/70 leading-tight">${esc(x.motivo)}</span></button>`).join('')}</div>` : ''}
    <details><summary class="cursor-pointer text-xs font-black uppercase tracking-widest text-white/60 mb-2">Todas as vagas livres (${lista.length})</summary>
      ${Object.entries(porRua).map(([rua, xs]) => `<div class="mb-1 flex items-center gap-2"><div class="text-[10px] font-black uppercase text-white/50 w-14 shrink-0">${esc(rua)}</div><div class="flex flex-wrap gap-1">${xs.sort((a, b) => b.v.pos - a.v.pos).map(btnVaga).join('')}</div></div>`).join('') || '<div class="text-sm text-red-300 font-bold">Nenhuma vaga livre.</div>'}
      <div class="text-[10px] text-white/40 mt-2">Laranja = quebra o FIFO · apagada = atrás de outro palete · lilás = retrabalho (reservada)</div></details>`;
}
async function escolherNoGuardar(id) {
  if (!_guardar) return;
  const it = bufferAgora().find(x => x.lpn === _guardar.lpn); if (!it) return;
  const ev = avaliarVagas(it, ocupacao(), it.lpn).find(x => x.vaga === id);
  if (!ev) { const tv = travaDe(id); msgTopo(nomeVaga(id) + (tv && tv.tipo === 'bloq' ? ' está BLOQUEADA (manutenção).' : ' não está livre.'), true); return; }
  if (ev.reservada && !(await _avisoGuardar('roxo', 'Vaga reservada', nomeVaga(id) + ' está <b>RESERVADA</b> para a OP <b>' + esc(travaDe(id).op) + '</b>.<br>Só guarde aqui com autorização.', 'Guardar aqui mesmo assim'))) return;
  if (ev.retrab && !(await _avisoGuardar('roxo', 'Vaga de retrabalho', nomeVaga(id) + ' é uma vaga de <b>RETRABALHO</b> (reservada).<br>Só guarde aqui se ela estiver <b>VAZIA</b> agora.<br>Quando o palete sair, ela volta a ser retrabalho.', 'Guardar aqui'))) return;
  if (ev.bloqueada && !(await _avisoGuardar('laranja', 'Vaga atrás de outro palete', nomeVaga(id) + ' fica <b>ATRÁS</b> de outro palete.<br>Só escolha se você vai tirar o palete da frente.', 'Guardar aqui mesmo assim'))) return;
  _guardar.vaga = id;
  _motivoUso = 'escolha manual: ' + String(ev.motivo || '').replace(/^[^A-Za-zÀ-ú]+/, '');
  sala3d.escolha({ lpn: _guardar.lpn, vaga: id, aoEscolher: escolherNoGuardar });
  await moverPara(_guardar.lpn, id);
  renderGuardar();
}
function fecharGuardar() {
  if (_avisoG) _avisoG.fim(false);
  const g = $('bp-guardar'); if (g) g.classList.add('hidden');
  if (!_guardar) return;
  _guardar = null;
  sala3d.escolha(null);
  _remontar3D();
  renderPainelVaga();
  const inp = $('barra-input'); if (inp && $('aba-LEITURA') && $('aba-LEITURA').classList.contains('active')) setTimeout(() => inp.focus(), 50);
}
/* devolve o motor 3D para quem estava usando (TV, aba da sala) */
function _remontar3D() {
  if (guardarAberto()) return;
  if (tela3DAberta()) sala3d.montarEm($('bp-3dfull-c'), 'livre');
  else if (tvAberta()) sala3d.montarEm($('bp-tv-3d'), 'tv');
  else if ($('aba-SALA') && $('aba-SALA').classList.contains('active')) sala3d.montarEm($('bp-3d'));
}
/* o que tem num palete (clique no 3D ou no mapa) */
function verVaga(id) {
  const oc = ocupacao(), v = oc.porId[id]; if (!v) return;
  const its = oc.mapa[id] || [];
  if (!its.length) { _modal(nomeVaga(id), v.retrab ? '<div class="p-4 text-purple-700 font-bold">🛠 Vaga de retrabalho (reservada). Só recebe palete por escolha manual na tela "Guardar o palete".</div>' : _htmlTravaVaga(id)); icones(); return; }
  _modal(nomeVaga(id) + ' · ' + fQ(its.reduce((s, x) => s + (x.qtd || 0), 0)) + ' placas', `<div class="text-sm mb-3"><b>OP ${esc(its[0].op)}</b> · ${esc(its[0].modelo || '—')} · IM ${esc(its[0].opIM || '—')} ${esc(its[0].linhaIM || '')} · ${esc(its[0].dataIMtxt || 'sem plano')}</div>
    <table class="w-full text-xs"><thead><tr class="text-left text-[10px] uppercase text-gray-500 border-b"><th class="p-2">LPN do palete</th><th class="p-2">Qtd</th><th class="p-2">Entrada</th><th class="p-2">Dias</th><th></th></tr></thead><tbody>` +
    its.map(x => `<tr class="border-b"><td class="p-2 font-mono">${esc(x.lpn)}</td><td class="p-2">${x.qtd}</td><td class="p-2">${x.ts ? new Date(x.ts).toLocaleString('pt-BR') : ''}</td><td class="p-2">${x.dias}</td>
      <td class="p-2 whitespace-nowrap"><button onclick="BP.fecharModal();BP.trocarVaga('${esc(x.lpn)}')" class="px-2 py-1 bg-gray-100 rounded font-bold">Mover</button>
        <button onclick="BP.linhaTempo('${esc(x.lpn)}')" class="px-2 py-1 bg-sidebar text-white rounded font-bold">Histórico</button></td></tr>`).join('') + '</tbody></table>');
}
async function moverPara(lpn, vaga) {
  const it = bufferAgora().find(x => x.lpn === lpn);
  await gravarVaga(lpn, vaga, it ? it.op : '', false);
  registrarLog('VAGA_MOVER', 'LPN ' + lpn + ' → vaga ' + vaga);
  await salvarBanco();
  if (_ultimoAviso && _ultimoAviso.lpn === lpn && _ultimoAviso.tipo === 'entrada') { _ultimoAviso.vaga = vaga; _ultimoAviso.motivo = 'Vaga escolhida manualmente.'; _ultimoAviso.ruim = false; }
  _fecharModal(); renderPainelVaga(); renderSalaTab(); sala3d.atualizar(true);
}
async function alocarSemVaga() {
  let n = 0;
  const lista = ocupacao().semVaga.sort((a, b) => chaveIM(a) - chaveIM(b) || a.ts - b.ts);
  for (const it of lista) {
    const s = sugerirVaga(it, ocupacao());
    if (!s) break;
    await gravarVaga(it.lpn, s.vaga, it.op, true); n++;
  }
  if (n) { await salvarBanco(); registrarLog('VAGA_ALOCAR', n + ' palete(s) alocados automaticamente'); }
  msgTopo(n ? n + ' palete(s) alocados.' : 'Nada para alocar (ou sala cheia).', !n);
  renderSalaTab(); sala3d.atualizar(true);
}
/* sugestão de reorganização: tira quem está bloqueando a fila */
function verReorganizacao() {
  const oc = ocupacao(), bl = bloqueios(oc);
  if (!bl.length) { _modal('Reorganização', '<div class="p-4 text-green-700 font-bold">Sala organizada: nenhuma quebra de FIFO. 👌</div>'); return; }
  const linhas = bl.map(x => { const s = sugerirVaga(x, oc, x.lpn); return { x, s }; });
  _modal('Reorganização — melhor cenário', `<div class="text-xs text-gray-600 mb-3">Estes paletes vão para a IM <b>depois</b> de quem está atrás deles na mesma rua. Movendo, a retirada fica livre.</div>
    <table class="w-full text-xs"><thead><tr class="text-left text-[10px] uppercase text-gray-500 border-b"><th class="p-2">LPN</th><th class="p-2">OP / Modelo</th><th class="p-2">Data IM</th><th class="p-2">Está em</th><th class="p-2">Mover para</th><th></th></tr></thead><tbody>` +
    linhas.map(({ x, s }) => `<tr class="border-b"><td class="p-2 font-mono">${esc(x.lpn)}</td><td class="p-2"><b>${esc(x.op)}</b> ${esc(x.modelo || '')}</td><td class="p-2">${esc(x.dataIMtxt || 'sem plano')}</td>
      <td class="p-2 font-mono font-bold text-[#c81e1e]">${esc(x.vaga)}</td><td class="p-2 font-mono font-bold text-green-700">${s ? esc(s.vaga) : '—'}</td>
      <td class="p-2">${s && !s.ruim ? `<button onclick="BP.moverPara('${esc(x.lpn)}','${s.vaga}')" class="px-2 py-1 bg-tpv text-white rounded font-bold">Mover</button>` : ''}</td></tr>`).join('') + '</tbody></table>', true);
}

/* layout da sala (só Key User): a grade igual ao desenho do Excel.
   Clique na célula para trocar: VAGA → VAZIO → PC → CORREDOR → VAGA   */
const TIPOS_CEL = ['vaga', 'vazio', 'pc', 'corredor', 'retrabalho'];
const COR_CEL = { vaga: 'background:#b7e1a1', vazio: 'background:#fff', pc: 'background:#ffeb00', corredor: 'background:#a9c8ea', retrabalho: 'background:#e9d5ff' };
function editarLayout(rascunho) {
  if (!isKeyUser()) { msgTopo('Só o Key User altera o layout da sala.', true); return; }
  const S = rascunho || JSON.parse(JSON.stringify(dbData.sala));
  S.celulas = S.celulas || {};
  window.__bpLay = S;
  const num = (k, rot, st) => `<label class="flex flex-col text-[10px] font-bold uppercase text-gray-500">${rot}<input type="number" step="${st || 1}" value="${S[k]}" onchange="__bpLay.${k}=Number(this.value);BP.reabrirLayout()" class="border rounded px-2 py-1 w-24 text-sm text-sidebar"></label>`;
  let grade = '<table class="border-collapse mx-auto text-[11px]"><tbody>';
  for (let p = S.posicoes; p >= 1; p--) {
    grade += `<tr><td class="pr-2 text-right font-bold text-gray-600 whitespace-nowrap">Posição ${p2(p)}</td>`;
    for (let r = 1; r <= S.ruas; r++) {
      const t = tipoCelula(S, r, p);
      grade += `<td onclick="BP.ciclarCelula(${r},${p})" title="${idVaga(r, p)} · ${t}" style="${COR_CEL[t]};width:58px;height:40px;border:1px dotted #555;cursor:pointer;text-align:center;font-weight:800">${t === 'pc' ? '🖥' : t === 'vaga' ? '▦' : t === 'retrabalho' ? '🛠' : ''}</td>`;
    }
    grade += '</tr>';
  }
  grade += '<tr><td></td>' + Array.from({ length: S.ruas }, (_, i) => `<td class="text-center pt-1 font-bold text-gray-600">Rua ${p2(i + 1)}</td>`).join('') + '</tr></tbody></table>';
  const h = `<div class="text-xs text-gray-600 mb-3">A grade é a sala vista de cima, igual ao desenho. <b>Verde</b> = vaga de palete · <b>Azul</b> = corredor · <b>Amarelo</b> = PC do operador · <b>Lilás</b> = retrabalho (reservada: só recebe palete por escolha manual) · <b>Branco</b> = sem vaga.
      A porta fica à esquerda do corredor. Clique numa célula para trocar o tipo.</div>
    <div class="flex flex-wrap gap-3 mb-4">${num('ruas', 'Ruas')}${num('posicoes', 'Posições')}${num('corredor', 'Linha do corredor')}${num('corredorAte', 'Corredor até a rua')}${num('ruaUltima', 'Rua de última opção (0 = nenhuma)')}${num('placasMag', 'Placas por magazine (3D)')}${num('celLarg', 'Largura vaga (m)', 0.05)}${num('celProf', 'Profund. vaga (m)', 0.05)}${num('corrProf', 'Largura corredor (m)', 0.1)}</div>
    <div class="overflow-auto mb-4 p-3 bg-gray-50 rounded border">${grade}</div>
    <div class="flex justify-end gap-2 border-t pt-3"><button onclick="BP.editarLayout(BP.salaPadrao())" class="px-4 py-2 text-sm font-bold text-gray-500 mr-auto">Voltar ao padrão do desenho</button>
    <button onclick="BP.fecharModal()" class="px-4 py-2 text-sm font-bold text-gray-600">Cancelar</button>
    <button onclick="BP.salvarLayout()" class="px-4 py-2 text-sm font-bold bg-tpv text-white rounded">Salvar layout</button></div>`;
  _modal('Layout da sala do buffer', h, true);
}
function ciclarCelula(r, p) {
  const S = window.__bpLay; if (!S) return;
  const id = idVaga(r, p), atual = tipoCelula(S, r, p);
  const novo = TIPOS_CEL[(TIPOS_CEL.indexOf(atual) + 1) % TIPOS_CEL.length];
  delete S.celulas[id];
  if (tipoCelula(S, r, p) !== novo) S.celulas[id] = novo;     // só guarda o que foge do padrão
  editarLayout(S);
}
async function salvarLayout() {
  const S = window.__bpLay; if (!S) return;
  S.ruas = Math.max(1, Math.min(40, Math.round(S.ruas) || 1));
  S.posicoes = Math.max(1, Math.min(30, Math.round(S.posicoes) || 1));
  S.cap = Math.max(1, Math.round(S.cap) || 12);
  S.ruaUltima = Math.max(0, Math.round(S.ruaUltima) || 0);
  S.placasMag = Math.max(1, Math.round(S.placasMag) || 50);
  ['celLarg', 'celProf', 'corrProf'].forEach(k => { S[k] = Math.max(0.5, Number(S[k]) || 1.3); });
  S.versao = 3; S.atualizadoEm = Date.now();
  dbData.sala = S;
  const sv = ocupacao().semVaga.length;
  await salvarBanco();
  registrarLog('SALA_LAYOUT', S.ruas + ' ruas × ' + S.posicoes + ' posições · corredor na ' + S.corredor);
  _fecharModal(); renderSalaTab(); sala3d.reconstruir();
  if (sv) msgTopo(sv + ' magazine(s) ficaram sem vaga — use "Alocar sem vaga".', true);
}

/* ═════════════════════ [5] ABA SALA 3D + MODO TV ═════════════════════ */
function _montarAbaSala() {
  if ($('aba-SALA')) return;
  const navDash = $('nav-DASH');
  if (navDash) {
    const b = document.createElement('button');
    b.id = 'nav-SALA'; b.className = 'nav-item w-full flex items-center px-6 py-3.5 text-sm text-left outline-none';
    b.setAttribute('onclick', "mudarAba('SALA')");
    b.innerHTML = '<i data-lucide="box" class="w-5 h-5 mr-3 opacity-80"></i> Sala do Buffer 3D';
    navDash.parentNode.insertBefore(b, navDash.nextSibling);
  }
  const main = document.querySelector('#main-app main'); if (!main) return;
  const d = document.createElement('div');
  d.id = 'aba-SALA'; d.className = 'tab-content w-full mx-auto max-w-[1500px]';
  const bt = 'bg-white border border-gray-300 text-xs font-bold py-2 px-3 rounded shadow-sm hover:bg-gray-50';
  d.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
      <h2 class="text-2xl font-bold text-sidebar flex items-center"><i data-lucide="box" class="mr-2 text-tpv"></i> Sala do Buffer — estacionamento FIFO</h2>
      <div class="flex flex-wrap gap-2">
        <select id="bp-cor" onchange="BP.sala3d.atualizar(true);BP.renderSala()" class="border rounded text-xs font-bold px-2 py-2 bg-white">
          <option value="im">Cor: dia da IM</option><option value="aging">Cor: tempo no buffer</option><option value="horas">Cor: envelhecimento (horas)</option><option value="modelo">Cor: modelo</option></select>
        <div class="flex items-center border rounded bg-white shadow-sm"><i data-lucide="search" class="w-3.5 h-3.5 ml-2 text-gray-400"></i>
          <input id="bp-busca" placeholder="Buscar OP ou LPN + Enter" onkeydown="if(event.key==='Enter')BP.buscarPalete(this.value);if(event.key==='Escape'){this.value='';BP.buscarPalete('')}" class="text-xs font-bold px-2 py-2 w-48 outline-none rounded">
          <button onclick="document.getElementById('bp-busca').value='';BP.buscarPalete('')" title="Limpar busca" class="px-2 text-gray-400 hover:text-gray-700">&times;</button></div>
        <button id="bp-busca-hist" onclick="BP.linhaTempo(this.dataset.lpn)" class="hidden bg-sidebar text-white text-xs font-bold py-2 px-3 rounded shadow flex items-center gap-1"><i data-lucide="history" class="w-3.5 h-3.5"></i> Ver histórico</button>
        <button onclick="BP.abrir3DTela()" class="${bt} flex items-center gap-1"><i data-lucide="maximize" class="w-3.5 h-3.5"></i> Vista 3D (tela cheia)</button>
        <button onclick="BP.sala3d.vista('topo')" class="${bt}">Vista de cima</button>
        <button onclick="BP.alocarSemVaga()" class="${bt}">Alocar sem vaga</button>
        <button onclick="BP.verReorganizacao()" class="${bt}">Melhor cenário</button>
        <button onclick="BP.editarLayout()" class="${bt}">Layout</button>
        <button onclick="BP.tv()" class="bg-sidebar text-white text-xs font-bold py-2 px-4 rounded shadow flex items-center gap-2"><i data-lucide="tv" class="w-4 h-4"></i> Modo TV</button>
      </div></div>
    <div id="bp-alerta-h"></div>
    <div id="bp-kpis" class="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4"></div>
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4">
      <div class="space-y-4 min-w-0">
        <div class="relative bg-[#0b1220] rounded-xl overflow-hidden shadow" style="height:640px">
          <div id="bp-3d" class="absolute inset-0"></div>
          <div id="bp-tip" class="bp-tip hidden absolute pointer-events-none bg-white/95 rounded-lg shadow-xl p-3 text-xs max-w-xs z-10"></div>
          <div id="bp-legenda" class="absolute left-3 bottom-3 text-[11px] text-white/90 flex flex-wrap gap-3 bg-black/50 rounded px-3 py-2"></div>
        </div>
        <div class="bg-white rounded-xl border p-4"><div class="text-xs font-black uppercase text-sidebar mb-2">Mapa da sala (vista de cima)</div><div id="bp-mapa" class="overflow-auto"></div></div>
      </div>
      <div class="space-y-4 min-w-0">
        <div class="bg-white rounded-xl border p-4"><div class="text-xs font-black uppercase text-sidebar mb-2">Próximos a sair</div><div id="bp-prox"></div></div>
        <div class="bg-white rounded-xl border p-4"><div class="text-xs font-black uppercase text-[#c81e1e] mb-2">Quebras de FIFO</div><div id="bp-bloq"></div></div>
        <div class="bg-white rounded-xl border p-4"><div class="text-xs font-black uppercase text-gray-500 mb-2">Sem vaga</div><div id="bp-semvaga"></div></div>
      </div></div>`;
  main.appendChild(d);
  icones();
}

/* cor de status de um palete (mesma regra no 3D, no mapa e na TV) */
const CORES_IM = [['#ef4444', 'IM atrasada'], ['#f97316', 'IM hoje'], ['#eab308', 'IM amanhã'], ['#38bdf8', 'IM futura'], ['#94a3b8', 'Sem plano IM']];
const CORES_AG = [['#22c55e', '< ' + AGING_DIAS_ATENCAO + ' dias'], ['#eab308', AGING_DIAS_ATENCAO + '–' + (AGING_DIAS_CRITICO - 1) + ' dias'], ['#ef4444', '≥ ' + AGING_DIAS_CRITICO + ' dias']];
const modoCor = () => ($('bp-cor') && $('bp-cor').value) || 'im';
function corHex(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return 'hsl(' + (h % 360) + ',65%,55%)'; }
function corPalete(its) {
  const m = modoCor();
  if (m === 'modelo') return corHex(its[0].modelo || its[0].op);
  if (m === 'horas') return corHoras(Math.max(...its.map(horasPalete)));
  if (m === 'aging') { const d = Math.max(...its.map(x => x.dias || 0)); return d >= AGING_DIAS_CRITICO ? CORES_AG[2][0] : d >= AGING_DIAS_ATENCAO ? CORES_AG[1][0] : CORES_AG[0][0]; }
  const h = new Date(); h.setHours(0, 0, 0, 0);
  const k = Math.min(...its.map(x => x.dataIM == null ? Infinity : x.dataIM));
  if (!isFinite(k)) return CORES_IM[4][0];
  const dd = Math.round((k - h.getTime()) / DIA);
  return dd < 0 ? CORES_IM[0][0] : dd === 0 ? CORES_IM[1][0] : dd === 1 ? CORES_IM[2][0] : CORES_IM[3][0];
}
function legendaHTML() {
  const m = modoCor(), l = m === 'aging' ? CORES_AG : m === 'im' ? CORES_IM : null;
  if (m === 'horas') return `<span class="flex items-center gap-1">0 h <span style="background:linear-gradient(90deg,${corHoras(0)},${corHoras(alertaH() / 2)},${corHoras(alertaH())})" class="inline-block w-24 h-3 rounded-sm"></span> ${alertaH()} h ou mais</span>` +
    '<span class="flex items-center gap-1"><span style="background:#22d3ee" class="inline-block w-3 h-3 rounded-full"></span>Próximo a sair</span>';
  return (l ? l.map(([c, t]) => `<span class="flex items-center gap-1"><span style="background:${c}" class="inline-block w-3 h-3 rounded-sm"></span>${t}</span>`).join('') : '<span>Cada modelo tem uma cor</span>') +
    '<span class="flex items-center gap-1"><span style="background:#22d3ee" class="inline-block w-3 h-3 rounded-full"></span>Próximo a sair</span>';
}

/* mapa 2D igual ao desenho do Excel */
function renderMapa2D(el, oc) {
  if (!el) return;
  const S = dbData.sala, prox = new Set(ordemRetirada(oc).slice(0, 3).map(x => x.vaga));
  let h = '<table class="border-collapse mx-auto text-[10px]"><tbody>';
  for (let p = S.posicoes; p >= 1; p--) {
    h += `<tr><td class="pr-2 text-right font-bold text-gray-500 whitespace-nowrap">Posição ${p2(p)}</td>`;
    for (let r = 1; r <= S.ruas; r++) {
      const t = tipoCelula(S, r, p), id = idVaga(r, p);
      if (t === 'corredor') { h += `<td style="background:#a9c8ea;border:1px dotted #8aa;height:46px;min-width:64px;text-align:center;color:#2c5a80;font-weight:900">${r === 1 ? '◀ PORTA' : ''}</td>`; continue; }
      if (t === 'pc') { h += '<td style="background:#ffeb00;border:1px dotted #888;text-align:center;font-size:20px">🖥</td>'; continue; }
      if (t === 'vazio') { h += '<td style="background:#fff;border:1px dotted #ccc"></td>'; continue; }
      if (t === 'retrabalho' && !(oc.mapa[id] || []).length) { h += '<td title="Reservada para placas em retrabalho" style="background:#e9d5ff;border:1px dotted #a78bfa;height:46px;min-width:64px;text-align:center;color:#6b21a8;font-weight:900;font-size:9px">🛠 RETRAB.</td>'; continue; }
      const its = oc.mapa[id] || [];
      const tv = !its.length && t !== 'retrabalho' && travaDe(id);
      if (tv) { h += tv.tipo === 'bloq' ? `<td onclick="BP.verVaga('${id}')" title="Bloqueada: ${esc(tv.motivo || 'manutenção')}" style="background:repeating-linear-gradient(45deg,#cbd5e1 0 6px,#e2e8f0 6px 12px);border:1px dotted #64748b;height:46px;min-width:64px;text-align:center;color:#334155;font-weight:900;font-size:9px;cursor:pointer">⛔ BLOQ.</td>`
        : `<td onclick="BP.verVaga('${id}')" title="Reservada para a OP ${esc(tv.op)}" style="background:#ddd6fe;border:2px solid #7c3aed;height:46px;min-width:64px;text-align:center;color:#5b21b6;font-weight:900;font-size:9px;cursor:pointer">📌 RESERV.<br>${esc(tv.op)}</td>`; continue; }
      if (!its.length) { h += `<td onclick="BP.verVaga('${id}')" style="background:#dff2d4;border:1px dotted #8b8;height:46px;min-width:64px;text-align:center;color:#7a9;cursor:pointer">livre</td>`; continue; }
      const c = corPalete(its);
      h += `<td onclick="BP.verVaga('${id}')" title="${esc(nomeVaga(id))}" style="background:${c};border:${prox.has(id) ? '3px solid #0891b2' : '1px dotted #555'};height:46px;min-width:64px;text-align:center;color:#fff;cursor:pointer;line-height:1.15;text-shadow:0 1px 2px #0007">
        <div style="font-weight:900;font-size:11px">${esc(its[0].op)}</div><div style="opacity:.9">${esc(String(its[0].modelo || '').slice(0, 10))}</div><div style="font-weight:900">${fQ(its.reduce((s, x) => s + (x.qtd || 0), 0))} pl.</div></td>`;
    }
    h += '</tr>';
  }
  h += '<tr><td></td>' + Array.from({ length: S.ruas }, (_, i) => `<td class="text-center pt-1 font-bold text-gray-500">Rua ${p2(i + 1)}</td>`).join('') + '</tr></tbody></table>';
  el.innerHTML = h;
}
const _mudarAbaOrig = mudarAba;
mudarAba = function (abaId) {
  _mudarAbaOrig(abaId);
  if (abaId === 'SALA') { renderSalaTab(); sala3d.montarEm($('bp-3d')); }
  if (abaId === 'MES') { _montarCardControle(); _infoVinculo(); _statusBackup(); }
  if (abaId === 'LEITURA') renderPainelVaga();
};
const _setModoOrig = setModoLeitura;
setModoLeitura = function (m) { _setModoOrig(m); _ultimoAviso = null; renderPainelVaga(); };

const _renderTudoOrig = renderTudo;
renderTudo = function (auto) {
  _renderTudoOrig(auto);
  if ($('aba-SALA') && $('aba-SALA').classList.contains('active')) renderSalaTab();
  if ($('aba-LEITURA') && $('aba-LEITURA').classList.contains('active') && modoLeitura === 'saida') renderPainelVaga();
  if (tvAberta()) renderTV();
  sala3d.atualizar();
};

function _kpisSala(oc) {
  const normais = oc.vagas.filter(v => !v.retrab && !(travaDe(v.id) && travaDe(v.id).tipo === 'bloq' && !(oc.mapa[v.id] || []).length));   // retrabalho e vaga bloqueada não contam como vaga
  const tot = normais.length;
  const ocup = normais.filter(v => (oc.mapa[v.id] || []).length).length;
  const mags = Object.values(oc.mapa).reduce((t, a) => t + a.length, 0) + oc.semVaga.length;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const todos = [...Object.values(oc.mapa).flat(), ...oc.semVaga];
  const atras = todos.filter(x => x.dataIM != null && x.dataIM < hoje.getTime()).length;
  const hojeIM = todos.filter(x => x.dataIM != null && x.dataIM === hoje.getTime()).length;
  const crit = todos.filter(x => x.dias >= AGING_DIAS_CRITICO).length;
  return { tot, ocup, livres: tot - ocup, mags, atras, hojeIM, crit, pct: tot ? Math.round(ocup * 100 / tot) : 0, semVaga: oc.semVaga.length };
}
function renderSalaTab() {
  if (!$('bp-kpis')) return;
  const oc = ocupacao(), k = _kpisSala(oc), bl = bloqueios(oc);
  const card = (t, v, c, s) => `<div class="bg-white rounded-xl border p-3"><div class="text-[10px] font-black uppercase text-gray-500">${t}</div><div class="text-2xl font-black ${c}">${v}</div>${s ? `<div class="text-[10px] text-gray-400 font-bold">${s}</div>` : ''}</div>`;
  $('bp-kpis').innerHTML = card('Ocupação', k.pct + '%', k.pct > 90 ? 'text-[#c81e1e]' : 'text-sidebar', k.ocup + ' de ' + k.tot + ' vagas') + card('Vagas livres', k.livres, 'text-green-700') +
    card('Paletes no buffer', k.mags, 'text-tpv') + card('IM hoje', k.hojeIM, 'text-orange-600') + card('IM atrasada', k.atras, 'text-[#c81e1e]') + card('Aging crítico', k.crit, 'text-[#c81e1e]', '≥ ' + AGING_DIAS_CRITICO + ' dias');
  _renderAlertaHoras(oc);
  const ord = paletesRetirada(oc).slice(0, 8);
  $('bp-prox').innerHTML = ord.length ? ord.map(x => `<div class="flex items-center gap-2 py-1 border-b last:border-0 text-xs"><span class="font-mono font-black w-16 whitespace-nowrap text-sidebar">${esc(x.vaga || '—')}</span>
    <span class="flex-1 min-w-0 break-words"><b>${esc(x.op)}</b> ${esc(x.modelo || '')} <span class="text-gray-400">· ${fQ(x.q)} pl.</span></span><span class="text-gray-500 shrink-0">${esc(x.dataIMtxt || 's/ plano')}</span></div>`).join('') : '<div class="text-xs text-gray-400">Buffer vazio.</div>';
  $('bp-bloq').innerHTML = bl.length ? bl.slice(0, 8).map(x => `<div class="text-xs py-1 border-b last:border-0"><span class="font-mono font-black text-[#c81e1e]">${esc(x.vaga)}</span> OP ${esc(x.op)} — IM ${esc(x.dataIMtxt || 's/ plano')}</div>`).join('') + (bl.length > 8 ? `<div class="text-[10px] text-gray-400">+${bl.length - 8}</div>` : '') : '<div class="text-xs text-green-700 font-bold">Nenhuma — fila FIFO perfeita.</div>';
  renderMapa2D($('bp-mapa'), oc);
  $('bp-semvaga').innerHTML = oc.semVaga.length ? oc.semVaga.slice(0, 10).map(x => `<div class="flex items-center gap-2 text-xs py-1 border-b last:border-0"><span class="flex-1 font-mono">${esc(x.lpn)}</span><b>${esc(x.op)}</b>
    <button onclick="BP.trocarVaga('${esc(x.lpn)}')" class="px-2 py-0.5 bg-gray-100 rounded font-bold">Vaga</button></div>`).join('') : '<div class="text-xs text-gray-400">Todos os paletes têm vaga.</div>';
}

/* ── modo TV: tela cheia, câmera fixa na vista padrão (pode mexer com o
   mouse; 5 s depois volta sozinha para a mesma vista) e atualiza sozinho ── */
const tvAberta = () => !!$('bp-tv') && !$('bp-tv').classList.contains('hidden');
function abrirTV() {
  let t = $('bp-tv');
  if (!t) {
    t = document.createElement('div'); t.id = 'bp-tv';
    t.className = 'fixed inset-0 z-[8000] bg-[#060b16] text-white flex flex-col';
    t.innerHTML = `<div class="flex items-center gap-6 px-8 py-4 border-b border-white/10">
        <div><div class="text-2xl font-black tracking-wide">SALA DO BUFFER · SMT → IM</div><div class="text-xs text-white/50 font-bold uppercase tracking-widest">Tempo real · FIFO</div></div>
        <div id="bp-tv-kpis" class="flex-1 grid grid-cols-6 gap-3"></div>
        <div class="text-right"><div id="bp-tv-hora" class="text-3xl font-black font-mono"></div><div id="bp-tv-data" class="text-xs text-white/50 font-bold"></div></div>
        <button onclick="BP.fecharTV()" class="text-white/40 hover:text-white text-2xl">&times;</button></div>
      <div class="flex-1 grid grid-cols-[1fr_420px] min-h-0 relative">
        <div id="bp-tv-pag" class="hidden absolute inset-0 z-20 bg-[#060b16] p-8 overflow-hidden"></div>
        <div id="bp-tv-dots" class="absolute right-6 bottom-4 z-30 flex gap-2"></div>
        <div class="relative"><div id="bp-tv-3d" class="absolute inset-0"></div><div id="bp-tv-leg" class="absolute left-6 bottom-6 text-sm flex gap-4 bg-black/60 rounded-lg px-4 py-2"></div></div>
        <div class="border-l border-white/10 p-5 overflow-hidden flex flex-col gap-5">
          <div><div class="text-sm font-black uppercase tracking-widest text-sky-300 mb-2">Próximos a sair</div><div id="bp-tv-prox"></div></div>
          <div><div class="text-sm font-black uppercase tracking-widest text-red-400 mb-2">Atenção</div><div id="bp-tv-alert"></div></div>
        </div></div>`;
    document.body.appendChild(t);
  }
  t.classList.remove('hidden');
  try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {}
  sala3d.montarEm($('bp-tv-3d'), 'tv');
  _tvPag = 0;
  renderTV();
  clearInterval(abrirTV._pag);
  abrirTV._pag = setInterval(() => { if (!tvAberta()) return clearInterval(abrirTV._pag); _tvPag = (_tvPag + 1) % TV_PAGINAS.length; renderTV(); }, TV_TROCA_MS);
  clearInterval(abrirTV._rel);
  abrirTV._rel = setInterval(() => { if (!tvAberta()) return clearInterval(abrirTV._rel); const d = new Date(); $('bp-tv-hora').textContent = d.toLocaleTimeString('pt-BR'); $('bp-tv-data').textContent = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }); }, 1000);
}
function fecharTV() {
  const t = $('bp-tv'); if (t) t.classList.add('hidden');
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  // tira o #tv da URL (sem recarregar) para o F5 não voltar sozinho para o Modo TV
  if (/^#tv\b/i.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  _remontar3D();
}
function renderTV() {
  if (!$('bp-tv-kpis')) return;
  const oc = ocupacao(), k = _kpisSala(oc), bl = bloqueios(oc);
  const c = (t, v, cor) => `<div class="bg-white/5 rounded-lg px-3 py-2"><div class="text-[10px] font-black uppercase text-white/50 tracking-widest">${t}</div><div class="text-3xl font-black ${cor}">${v}</div></div>`;
  $('bp-tv-kpis').innerHTML = c('Ocupação', k.pct + '%', k.pct > 90 ? 'text-red-400' : 'text-white') + c('Livres', k.livres, 'text-green-400') + c('Paletes', k.mags, 'text-sky-300') +
    c('IM hoje', k.hojeIM, 'text-orange-300') + c('IM atrasada', k.atras, 'text-red-400') + c('Aging crítico', k.crit, 'text-red-400');
  $('bp-tv-prox').innerHTML = paletesRetirada(oc).slice(0, 7).map((x, i) => `<div class="flex items-center gap-3 py-2 border-b border-white/10 ${i === 0 ? 'text-sky-200' : ''}">
    <span class="font-mono font-black text-2xl w-32 whitespace-nowrap">${esc(x.vaga || '—')}</span><div class="flex-1 min-w-0 leading-tight"><div class="font-black">OP ${esc(x.op)}</div><div class="text-xs text-white/60 truncate">${esc(String(x.modelo || '').slice(0, 22))} · ${fQ(x.q)} placas</div></div>
    <div class="text-right text-xs w-28 shrink-0"><div class="font-bold truncate">${esc(x.linhaIM || '—')}</div><div class="text-white/50">${esc(x.dataIMtxt || 's/ plano')}</div></div></div>`).join('') || '<div class="text-white/40">Buffer vazio</div>';
  const al = [];
  if (bl.length) al.push(bl.length + ' palete(s) bloqueando a fila FIFO');
  if (k.atras) al.push(k.atras + ' palete(s) com IM atrasada');
  if (k.crit) al.push(k.crit + ' palete(s) há ' + AGING_DIAS_CRITICO + '+ dias no buffer');
  const velhos = paletesVelhos(oc).length;
  if (velhos) al.push(velhos + ' palete(s) parado(s) há mais de ' + alertaH() + ' h');
  if (k.semVaga) al.push(k.semVaga + ' palete(s) sem vaga');
  if (k.pct > 90) al.push('Sala acima de 90%');
  _renderPaginasTV(oc, k, al);
  $('bp-tv-alert').innerHTML = al.length ? al.map(t => `<div class="py-2 text-lg font-bold text-red-300 border-b border-white/10">● ${esc(t)}</div>`).join('') : '<div class="text-lg font-bold text-green-400">Tudo em ordem ✓</div>';
}

/* ── motor 3D (three.js, carregado só quando precisa) ──────────────────
   Sala igual ao desenho: piso de granilite com fita amarela, corredor
   azul, abertura da porta à esquerda do corredor (sem porta, só o vão),
   janelas abertas (3 no fundo, 1 na parede da porta, nenhuma na parede
   paralela à porta), PC do operador de costas para a parede da porta,
   TV do lado de fora à esquerda da porta. Cada vaga tem "Pxx / Rxx" no chão.
   Cada vaga ocupada = palete de madeira + magazines (rack condutivo)
   empilhados 6 embaixo + 6 em cima, com a etiqueta do kit na frente.
   Vagas de RETRABALHO: palete com 2 magazines e 2 bandejas de placas.
   Modos: 'normal' (aba da sala) · 'tv' (câmera fixa, volta em 5 s) ·
          'escolha' (indica a vaga e deixa clicar em outra) ·
          'livre' (tela cheia, anda pela sala com mouse e teclado)      */
const sala3d = (function () {
  let ok3d = null, renderer, scene, camera, controls, alvoEl, ro, modo = 'normal', vistaAtual = '3d';
  let gEst = null, gDin = null, sigEst = '', sigDin = '', picks = [], grupos = {}, pulsos = [], foco = null, descartar = [];
  let ultimaInteracao = 0, interagindo = false, voo = null, escolhaSt = null, hlMesh = null, setas = [], destaque = null;
  const teclas = {};
  const T = {}, M = {}, G = {};
  const MW = 0.38, MD = 0.46, MH = 0.56, PAL_H = 0.144;
  const JAN = { w: 1.3, h: 0.8, y0: 1.1 };          // janela: um pouco maior que a TV (1,12 × 0,66)
  const carregar = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  async function garantirThree() {
    if (ok3d) return ok3d;
    ok3d = (async () => {
      if (!window.THREE) await carregar('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js');
      if (!THREE.OrbitControls) await carregar('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
      return true;
    })();
    ok3d.catch(() => { ok3d = null; });
    return ok3d;
  }
  function cTex(w, h, draw, rep) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const std = (o) => new THREE.MeshStandardMaterial(o);
  function recursos() {
    if (T.ok) return; T.ok = true;
    T.piso = cTex(512, 512, (g, w, h) => {
      g.fillStyle = '#e4e6e1'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6000; i++) { const v = 140 + Math.random() * 90 | 0; g.fillStyle = `rgba(${v},${v},${v + 6},${Math.random() * .4})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.strokeStyle = '#c3c7c0'; g.lineWidth = 3;
      for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * w / 2, 0); g.lineTo(i * w / 2, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 2); g.lineTo(w, i * h / 2); g.stroke(); }
    }, true);
    T.parede = cTex(512, 256, (g, w, h) => {
      g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#cfc7b2'; g.lineWidth = 3;
      for (let x = 0; x <= w; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      g.fillStyle = '#d4ccb6'; g.fillRect(0, h * 0.58, w, 4);
    }, true);
    T.lado = cTex(256, 256, (g, w, h) => {
      g.fillStyle = '#b9c0c7'; g.fillRect(0, 0, w, h); g.fillStyle = '#15181b'; g.fillRect(16, 12, w - 32, h - 24);
      g.fillStyle = '#30363c'; for (let y = 18; y < h - 16; y += 7) g.fillRect(18, y, w - 36, 2);
      g.fillStyle = '#eab308'; g.fillRect(3, 8, 12, 26); g.fillRect(3, h - 34, 12, 26);
    });
    T.frente = cTex(256, 256, (g, w, h) => {
      g.fillStyle = '#b9c0c7'; g.fillRect(0, 0, w, h); g.fillStyle = '#0c0f11'; g.fillRect(16, 16, w - 32, h - 32);
      for (let y = 22; y < h - 20; y += 6) { g.fillStyle = y % 12 ? '#1d7a45' : '#26914f'; g.fillRect(20, y, w - 40, 3); }
      g.fillStyle = '#9aa3ab'; g.fillRect(w / 2 - 7, 16, 14, h - 32);
      g.fillStyle = '#eab308'; g.fillRect(4, 10, 12, 26); g.fillRect(w - 16, 10, 12, 26);
    });
    T.topo = cTex(256, 256, (g, w, h) => {
      g.fillStyle = '#c4cacf'; g.fillRect(0, 0, w, h); g.strokeStyle = '#99a0a7'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#16191c'; g.fillRect(48, 92, 72, 64); g.fillRect(136, 92, 72, 64);
      g.fillStyle = '#878e95'; [[22, 22], [w - 22, 22], [22, h - 22], [w - 22, h - 22]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); });
    });
    T.madeira = cTex(256, 64, (g, w, h) => {
      g.fillStyle = '#cf9558'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 46; i++) { g.strokeStyle = `rgba(115,65,25,${Math.random() * .35})`; g.lineWidth = 1 + Math.random() * 2; const y = Math.random() * h;
        g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * .3, y + Math.random() * 6 - 3, w * .6, y + Math.random() * 6 - 3, w, y); g.stroke(); }
    });
    T.listra = cTex(128, 128, (g, w, h) => {
      g.fillStyle = '#facc15'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 18;
      for (let i = -h; i < w + h; i += 44) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); }
    }, true);
    T.saida = cTex(256, 96, (g, w, h) => {
      g.fillStyle = '#15803d'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = 'bold 54px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SAÍDA ➜', w / 2, h / 2 + 3);
    });
    T.monitor = cTex(256, 160, (g, w, h) => {
      g.fillStyle = '#0b2540'; g.fillRect(0, 0, w, h); g.fillStyle = '#005f8f'; g.fillRect(0, 0, w, 24); g.fillStyle = '#e2e8f0'; g.font = 'bold 15px Arial'; g.fillText('BUFFER CONTROL · Leitura', 10, 17);
      g.fillStyle = '#16a34a'; g.fillRect(14, 40, w - 28, 42); g.fillStyle = '#fff'; g.font = 'bold 26px Arial'; g.fillText('VAGA R03-P04', 30, 70);
      g.fillStyle = '#334155'; for (let y = 96; y < h - 10; y += 16) g.fillRect(14, y, w - 28 - (y % 32), 8);
    });
    T.placa = cTex(128, 96, (g, w, h) => {            // placa SMD vista de cima (bandeja de retrabalho)
      g.fillStyle = '#166534'; g.fillRect(0, 0, w, h); g.fillStyle = '#15803d'; g.fillRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#111827'; [[18, 18, 26, 20], [60, 14, 18, 18], [86, 50, 26, 26], [22, 56, 34, 16]].forEach(r => g.fillRect(...r));
      g.fillStyle = '#d4af37'; for (let x = 10; x < w - 8; x += 9) g.fillRect(x, h - 10, 4, 6);
    });
    const mStd = (map, o) => std(Object.assign({ map, metalness: 0.35, roughness: 0.5 }, o || {}));
    M.mag = [mStd(T.lado), mStd(T.lado), mStd(T.topo), std({ color: '#5b6168' }), mStd(T.frente), mStd(T.lado)];
    M.madeira = std({ map: T.madeira, roughness: 0.92 });
    M.madeiraEsc = std({ map: T.madeira, color: '#b07a44', roughness: 0.95 });
    M.fita = new THREE.MeshBasicMaterial({ color: '#facc15' });
    M.fitaRet = new THREE.MeshBasicMaterial({ color: '#a855f7' });
    M.metal = std({ color: '#475569', metalness: 0.6, roughness: 0.4 });
    M.alu = std({ color: '#d6dbe0', metalness: 0.55, roughness: 0.35 });
    M.preto = std({ color: '#111827', roughness: 0.6 });
    M.bandeja = std({ color: '#1f2937', roughness: 0.7 });
    M.placa = std({ map: T.placa, roughness: 0.5 });
    G.mag = new THREE.BoxGeometry(MW, MH, MD);
    G.tabua = new THREE.BoxGeometry(1.2, 0.022, 0.11);
    G.bloco = new THREE.BoxGeometry(0.12, 0.078, 0.12);
    G.etiqueta = new THREE.PlaneGeometry(0.3, 0.22);
    G.anel = new THREE.RingGeometry(0.62, 0.74, 48);
  }
  function malha(geo, mat, x, y, z, sombra) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (sombra !== false) { m.castShadow = true; m.receiveShadow = true; } return m; }
  function textoChao(txt, larg, cor, tam) {
    const t = cTex(512, 128, (g, w, h) => { g.fillStyle = cor || 'rgba(15,23,42,.75)';
      let f = tam || 78; do { g.font = 'bold ' + f + 'px Arial'; f -= 2; } while (f > 16 && g.measureText(txt).width > w - 24);   // não deixa o texto cortar
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(larg, larg / 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; return m;
  }
  function rotulo(l1, l2, l3, cor, escala, fixo) {
    const t = cTex(320, 170, (g, w, h) => {
      g.fillStyle = 'rgba(8,14,28,.92)'; g.beginPath(); (g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, 22) : g.rect(4, 4, w - 8, h - 8)); g.fill();
      g.fillStyle = cor; g.fillRect(4, 4, 18, h - 8);
      g.textAlign = 'center'; g.fillStyle = '#fff';
      let tam = 52; do { g.font = 'bold ' + tam + 'px Arial'; tam -= 2; } while (tam > 24 && g.measureText(String(l1)).width > w - 44);
      g.fillText(l1, w / 2 + 8, 62);
      g.fillStyle = '#cbd5e1'; g.font = 'bold 30px Arial'; g.fillText(String(l2 || '').slice(0, 16), w / 2 + 8, 104);
      g.fillStyle = cor; g.font = 'bold 32px Arial'; g.fillText(l3 || '', w / 2 + 8, 146);
    });
    if (!fixo) descartar.push(t);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    const e = escala || 1; sp.scale.set(1.15 * e, 0.61 * e, 1); sp.renderOrder = 20;
    return sp;
  }
  function etiquetaKit(its, id) {
    const q = its.reduce((s, x) => s + (Number(x.qtd) || 0), 0);
    const t = cTex(300, 220, (g, w, h) => {
      g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, w, h); g.strokeStyle = '#222'; g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
      g.fillStyle = '#222'; g.font = 'bold 20px Arial'; g.textAlign = 'center'; g.fillText('IDENTIFICAÇÃO DE KIT', w / 2, 34);
      g.font = 'bold 58px Arial'; g.fillText(its[0].op, w / 2, 100);
      g.font = 'bold 24px Arial'; g.fillText(String(its[0].modelo || '').slice(0, 18), w / 2, 140);
      g.font = 'bold 26px Arial'; g.fillText(id + ' · ' + q + ' pl.', w / 2, 190);
    });
    descartar.push(t);
    return new THREE.MeshBasicMaterial({ map: t });
  }
  function novoPalete() {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) g.add(malha(G.tabua, M.madeira, 0, PAL_H - 0.011, -0.44 + i * 0.1467));
    for (const z of [-0.44, 0, 0.44]) { g.add(malha(G.tabua, M.madeiraEsc, 0, 0.011, z)); for (const x of [-0.54, 0, 0.54]) g.add(malha(G.bloco, M.madeiraEsc, x, 0.061, z)); }
    return g;
  }
  /* posição de cada magazine no palete: 6 embaixo (3 × 2) e 6 em cima */
  function slotMagazine(i) {
    const camada = Math.floor(i / 6), j = i % 6, fila = Math.floor(j / 3), col = j % 3;
    return [(col - 1) * 0.4, PAL_H + MH / 2 + camada * (MH + 0.012), fila === 0 ? 0.245 : -0.245];
  }
  /* quantos magazines desenhar: placas do palete ÷ placas por magazine (1 a 12) */
  function nMagazines(its) {
    const q = its.reduce((s, x) => s + (Number(x.qtd) || 0), 0), pm = Math.max(1, Number(dbData.sala.placasMag) || 50);
    return Math.max(1, Math.min(12, Math.ceil(q / pm) || 1));
  }
  /* bandeja ESD de carregar placa, com algumas placas dentro */
  function bandeja(nPlacas) {
    const g = new THREE.Group();
    g.add(malha(new THREE.BoxGeometry(0.44, 0.012, 0.34), M.bandeja, 0, 0.006, 0));
    [[0, 0.03, 0.165, 0.44, 0.048, 0.012], [0, 0.03, -0.165, 0.44, 0.048, 0.012], [0.214, 0.03, 0, 0.012, 0.048, 0.34], [-0.214, 0.03, 0, 0.012, 0.048, 0.34]]
      .forEach(([x, y, z, l, a, p]) => g.add(malha(new THREE.BoxGeometry(l, a, p), M.bandeja, x, y, z)));
    const gp = new THREE.BoxGeometry(0.18, 0.01, 0.13);
    [[-0.1, -0.075], [0.1, -0.075], [-0.1, 0.075], [0.1, 0.075]].slice(0, nPlacas).forEach(([x, z], i) => g.add(malha(gp, M.placa, x, 0.018 + (i % 2) * 0.004, z)));
    return g;
  }

  function iniciar() {
    recursos();
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b1220');
    camera = new THREE.PerspectiveCamera(42, 1, 0.05, 400);
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.addEventListener('start', () => { interagindo = true; ultimaInteracao = Date.now(); voo = null; });
    controls.addEventListener('end', () => { interagindo = false; ultimaInteracao = Date.now(); });
    M.amb = new THREE.AmbientLight('#ffffff', 0.25); scene.add(M.amb);
    M.hemi = new THREE.HemisphereLight('#f8fafc', '#64748b', 0.6); scene.add(M.hemi);
    const sol = new THREE.DirectionalLight('#fffaf0', 0.85); sol.position.set(-6, 22, 14); sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048); sol.shadow.bias = -0.0005;
    Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    scene.add(sol); scene.add(sol.target); M.sol = sol;
    const rc = new THREE.Raycaster(), mouse = new THREE.Vector2();
    const raio = e => { const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); rc.setFromCamera(mouse, camera); };
    const acha = e => { raio(e); const h = rc.intersectObjects(picks, false)[0]; return h ? h.object.userData : null; };
    const el = renderer.domElement;
    el.addEventListener('mousemove', e => { const d = acha(e); tip(e, d); destacar(d); });
    el.addEventListener('mouseleave', () => { tip(null); destacar(null); });
    let pd = null;   // clique só conta se o mouse não arrastou (arrastar = girar a câmera)
    el.addEventListener('pointerdown', e => { pd = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('click', e => {
      if (pd && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 6) return;
      const d = acha(e); if (!d || !d.id) return;
      if (modo === 'escolha' && escolhaSt && escolhaSt.aoEscolher) escolhaSt.aoEscolher(d.id);
      else if (modo !== 'tv') BP.verVaga(d.id);
    });
    // navegação livre: duplo clique centraliza a câmera no ponto do chão
    el.addEventListener('dblclick', e => {
      if (modo !== 'livre') return;
      raio(e); const p = new THREE.Vector3();
      if (!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return;
      const off = camera.position.clone().sub(controls.target);
      voo = { t: 0, p0: camera.position.clone(), p1: p.clone().add(off), a0: controls.target.clone(), a1: p };
    });
    // navegação livre: a roda do mouse "anda para a frente" quando chega perto do centro (sem trava)
    el.addEventListener('wheel', e => {
      if (modo !== 'livre' || e.deltaY >= 0) return;
      const dist = camera.position.distanceTo(controls.target);
      if (dist > 1.2) return;
      const dir = controls.target.clone().sub(camera.position).normalize().multiplyScalar(0.6);
      camera.position.add(dir); controls.target.add(dir);
      if (controls.target.y < 0) controls.target.y = 0;
    }, { passive: true });
    window.addEventListener('keydown', e => { if (modo === 'livre' && alvoEl && alvoEl.clientWidth) teclas[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', e => { teclas[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => Object.keys(teclas).forEach(k => { teclas[k] = false; }));
    ro = new ResizeObserver(() => ajustar());
    let t0 = performance.now();
    const vF = new THREE.Vector3(), vR = new THREE.Vector3(), vM = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    (function loop() {
      requestAnimationFrame(loop);
      if (!alvoEl || !alvoEl.isConnected || !alvoEl.clientWidth) return;
      const agora = performance.now(), dt = Math.min(0.1, (agora - t0) / 1000); t0 = agora;
      if (voo) {   // transição suave de câmera
        voo.t = Math.min(1, voo.t + dt / 1.2); const k = voo.t < .5 ? 2 * voo.t * voo.t : 1 - Math.pow(-2 * voo.t + 2, 2) / 2;
        camera.position.lerpVectors(voo.p0, voo.p1, k); controls.target.lerpVectors(voo.a0, voo.a1, k);
        if (voo.t >= 1) voo = null;
      }
      // TV: fica sempre na vista padrão. Mexeu com o mouse? 5 s depois volta sozinha.
      if (modo === 'tv' && !voo && !interagindo && Date.now() - ultimaInteracao > 5000) {
        const b = posicoesVista('3d');
        if (camera.position.distanceTo(b.p) > 0.05 || controls.target.distanceTo(b.a) > 0.05) { vistaAtual = '3d'; voo = { t: 0, p0: camera.position.clone(), p1: b.p, a0: controls.target.clone(), a1: b.a }; }
      }
      // navegação livre pelo teclado: W A S D / setas = andar · Q / E = descer / subir · Shift = rápido
      if (modo === 'livre') {
        vM.set(0, 0, 0);
        camera.getWorldDirection(vF); vF.y = 0; if (vF.lengthSq() < 1e-6) vF.set(0, 0, -1); vF.normalize();
        vR.crossVectors(vF, UP).normalize();
        if (teclas.w || teclas.arrowup) vM.add(vF); if (teclas.s || teclas.arrowdown) vM.sub(vF);
        if (teclas.d || teclas.arrowright) vM.add(vR); if (teclas.a || teclas.arrowleft) vM.sub(vR);
        if (teclas.e || teclas.pageup) vM.y += 1; if (teclas.q || teclas.pagedown) vM.y -= 1;
        if (vM.lengthSq()) {
          voo = null;
          vM.normalize().multiplyScalar((teclas.shift ? 9 : 3.5) * dt);
          if (controls.target.y + vM.y < 0) vM.y = -controls.target.y;
          camera.position.add(vM); controls.target.add(vM);
          if (camera.position.y < 0.15) camera.position.y = 0.15;
        }
      }
      const s = 1 + 0.18 * Math.sin(agora / 260);
      pulsos.forEach(p => { p.scale.set(s, s, 1); p.material.opacity = 0.55 + 0.35 * Math.sin(agora / 260); });
      setas.forEach(a => { a.position.y = a.userData.y0 + 0.18 * Math.abs(Math.sin(agora / 300)); });
      if (foco && foco.grupo) {
        foco.t += dt;
        foco.grupo.position.y = Math.abs(Math.sin(foco.t * 4)) * 0.25 * Math.max(0, 1 - foco.t / 8);
        if (foco.feixe) foco.feixe.material.opacity = 0.35 * Math.max(0, 1 - foco.t / 10);
        if (foco.t > 10) { foco.grupo.position.y = 0; if (foco.feixe) gDin.remove(foco.feixe); foco = null; }
      }
      controls.update(); renderer.render(scene, camera);
    })();
  }
  /* trava da câmera por modo: a tela cheia (livre) solta tudo */
  function configurarControles() {
    if (modo === 'livre') {
      Object.assign(controls, { minDistance: 0.3, maxDistance: 90, maxPolarAngle: Math.PI / 2 - 0.02, enablePan: true, screenSpacePanning: false, panSpeed: 1.2, rotateSpeed: 0.4, zoomSpeed: 1.1 });
    } else {
      Object.assign(controls, { minDistance: 3, maxDistance: 60, maxPolarAngle: Math.PI / 2.08, enablePan: true, screenSpacePanning: true, panSpeed: 1, rotateSpeed: 0.5, zoomSpeed: 1 });
    }
  }
  function tip(e, d) {
    const t = alvoEl && alvoEl.parentNode ? alvoEl.parentNode.querySelector('.bp-tip') : null; if (!t) return;
    if (!e || !d || modo === 'tv' || !alvoEl.contains(renderer.domElement)) { t.classList.add('hidden'); return; }
    const r = alvoEl.getBoundingClientRect();
    t.style.left = Math.min(e.clientX - r.left + 14, r.width - 270) + 'px'; t.style.top = Math.min(e.clientY - r.top + 14, r.height - 140) + 'px';
    const its = d.itens || [];
    t.innerHTML = `<div class="font-black text-sidebar text-sm mb-1">${esc(nomeVaga(d.id))}</div>` +
      (its.length ? `<div><b>OP ${esc(its[0].op)}</b> · ${esc(its[0].modelo || '—')}</div><div>IM: ${esc(its[0].opIM || '—')} · ${esc(its[0].linhaIM || '—')} · ${esc(its[0].dataIMtxt || 'sem plano')}</div>
        <div>${fQ(its.reduce((s, x) => s + (x.qtd || 0), 0))} placas · ${Math.max(...its.map(x => x.dias || 0))} dia(s) no buffer</div>
        <div class="mt-1 text-[10px] text-gray-500">${modo === 'escolha' ? 'Vaga ocupada' : 'Clique para ver o palete'}</div>`
        : d.retrab ? `<div class="text-purple-700 font-bold">RETRABALHO (reservada)${modo === 'escolha' ? ' — se estiver vazia agora, clique para guardar aqui' : ''}</div>`
        : `<div class="text-green-700 font-bold">LIVRE${modo === 'escolha' ? ' — clique para guardar aqui' : ''}</div>`);
    t.classList.remove('hidden');
  }
  /* na escolha de vaga: realça a vaga livre embaixo do mouse */
  function destacar(d) {
    if (!hlMesh) return;
    const v = d && d.id && !(d.itens || []).length && modo === 'escolha' ? ocupacao().porId[d.id] : null;
    hlMesh.visible = !!v && !(escolhaSt && escolhaSt.vaga === d.id);
    if (v) hlMesh.position.set(v.x, 0.011, v.z);
    renderer.domElement.style.cursor = (modo === 'escolha' && v) ? 'pointer' : '';
  }
  function ajustar() {
    if (!renderer || !alvoEl) return;
    const w = alvoEl.clientWidth, h = alvoEl.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function limpar(g) {
    if (!g) return; scene.remove(g);
    g.traverse(o => { if (o.geometry && !Object.values(G).includes(o.geometry)) o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      ms.forEach(m => { if (!Object.values(M).includes(m) && !M.mag.includes(m)) m.dispose(); }); });
  }
  function caixa(l, a, p, mat, x, y, z) { return malha(new THREE.BoxGeometry(l, a, p), mat, x, y, z); }
  /* parede ao longo do X local (centro em 0) com vãos de verdade (porta / janelas) */
  function paredeComVaos(L, H, esp, vaos) {
    const g = new THREE.Group();
    const seg = (l, h, x, y) => {
      if (l <= 0.01 || h <= 0.01) return;
      const tx = T.parede.clone(); tx.needsUpdate = true; tx.repeat.set(l / 2.6, h / H);
      g.add(caixa(l, h, esp, std({ map: tx, roughness: 0.9, side: THREE.DoubleSide }), x, y, 0));
    };
    let cur = -L / 2;
    vaos.slice().sort((a, b) => a.u - b.u).forEach(v => {
      const a = v.u - v.w / 2, b = v.u + v.w / 2;
      seg(a - cur, H, (cur + a) / 2, H / 2);
      seg(v.w, v.y0, v.u, v.y0 / 2);
      const top = v.y0 + v.h; seg(v.w, H - top, v.u, top + (H - top) / 2);
      cur = b;
    });
    seg(L / 2 - cur, H, (cur + L / 2) / 2, H / 2);
    return g;
  }

  /* ── sala fixa: piso, fita, corredor, paredes com vãos, PC, pilares, retrabalho ── */
  function construirSala() {
    limpar(gEst); gEst = new THREE.Group(); scene.add(gEst);
    const S = dbData.sala, GR = gradeSala(S), W = GR.largura, D = GR.comprimento;
    // parede da porta (x0) 25% mais perto das vagas (antes -1,7)
    const x0 = -1.275, x1 = W + 0.7, z0 = -0.6, z1 = D + 1.9, CX = (x0 + x1) / 2, CZ = (z0 + z1) / 2;
    const zc = GR.zs[S.corredor], hc = GR.prof[S.corredor];
    const tp = T.piso.clone(); tp.needsUpdate = true; tp.repeat.set((x1 - x0) / 1.2, (z1 - z0) / 1.2);
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), std({ map: tp, roughness: 0.75, metalness: 0.05 }));
    piso.rotation.x = -Math.PI / 2; piso.position.set(CX, 0, CZ); piso.receiveShadow = true; gEst.add(piso);
    // lado de fora da porta
    const fora = new THREE.Mesh(new THREE.PlaneGeometry(3.2, hc + 2.4), std({ color: '#9ca3af', roughness: 0.9 }));
    fora.rotation.x = -Math.PI / 2; fora.position.set(x0 - 1.6, -0.005, zc); fora.receiveShadow = true; gEst.add(fora);
    // corredor azul
    const xcFim = (S.corredorAte || S.ruas) * S.celLarg;
    const corr = new THREE.Mesh(new THREE.PlaneGeometry(xcFim - x0, hc - 0.1), std({ color: '#93bde6', roughness: 0.6 }));
    corr.rotation.x = -Math.PI / 2; corr.position.set((x0 + xcFim) / 2, 0.004, zc); corr.receiveShadow = true; gEst.add(corr);
    const tc = textoChao('◀ CORREDOR · SAÍDA', 6, 'rgba(255,255,255,.95)', 50); tc.position.set((x0 + xcFim) / 2, 0.008, zc); gEst.add(tc);
    // fita em volta de cada vaga (amarela) e das vagas de retrabalho (lilás)
    const fitas = (tipo, mat) => {
      const pos = [], idx = [], fita = 0.05;
      const quad = (ax, az, bx, bz) => { const n = pos.length / 3; pos.push(ax, 0.006, az, bx, 0.006, az, bx, 0.006, bz, ax, 0.006, bz); idx.push(n, n + 2, n + 1, n, n + 3, n + 2); };
      for (let r = 1; r <= S.ruas; r++) for (let p = 1; p <= S.posicoes; p++) {
        if (tipoCelula(S, r, p) !== tipo) continue;
        const cx = GR.xs[r], cz = GR.zs[p], hw = S.celLarg / 2 - 0.05, hd = GR.prof[p] / 2 - 0.05;
        quad(cx - hw, cz - hd, cx + hw, cz - hd + fita); quad(cx - hw, cz + hd - fita, cx + hw, cz + hd);
        quad(cx - hw, cz - hd, cx - hw + fita, cz + hd); quad(cx + hw - fita, cz - hd, cx + hw, cz + hd);
      }
      if (!pos.length) return;
      const gf = new THREE.BufferGeometry(); gf.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gf.setIndex(idx);
      gEst.add(new THREE.Mesh(gf, mat));
    };
    fitas('vaga', M.fita); fitas('retrabalho', M.fitaRet);
    // nomes no chão: RUA xx embaixo, POS xx à esquerda
    for (let r = 1; r <= S.ruas; r++) { const t = textoChao('RUA ' + p2(r), 1.35); t.position.set(GR.xs[r], 0.008, D + 0.45); gEst.add(t); }
    for (let p = 1; p <= S.posicoes; p++) { if (p === S.corredor) continue; const t = textoChao('POS ' + p2(p), 1.1); t.position.set(x0 / 2, 0.008, GR.zs[p]); gEst.add(t); }
    // identificação dentro de cada vaga: P xx em cima, R xx embaixo (pequeno, no centro)
    for (let r = 1; r <= S.ruas; r++) for (let p = 1; p <= S.posicoes; p++) {
      const tipo = tipoCelula(S, r, p); if (tipo !== 'vaga' && tipo !== 'retrabalho') continue;
      const tx = cTex(128, 128, (g, w, h) => { g.fillStyle = tipo === 'retrabalho' ? 'rgba(107,33,168,.7)' : 'rgba(15,23,42,.55)'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('P' + p2(p), w / 2, h / 2 - 24); g.fillText('R' + p2(r), w / 2, h / 2 + 26); });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(GR.xs[r], 0.008, GR.zs[p]); gEst.add(m);
    }
    // paredes (frente cortada para enxergar): vão da porta à esquerda do corredor (sem porta).
    // Janelas = vãos abertos (iguais à porta, sem vidro): 3 na parede do fundo (centralizadas),
    // 1 na parede da porta (a mais longe da porta) e nenhuma na parede paralela à porta
    const H = 2.7, ESP = 0.14, pa = zc - 0.95, pb = zc + 0.95;
    const uZ = z => CZ - z;                                                   // paredes laterais: X local = -Z do mundo
    const jan = u => ({ u, w: JAN.w, y0: JAN.y0, h: JAN.h });
    const LF = x1 - x0;
    const fundo = paredeComVaos(LF, H, ESP, [jan(-LF / 4), jan(0), jan(LF / 4)]); fundo.position.set(CX, 0, z0); gEst.add(fundo);
    const dir = paredeComVaos(z1 - z0, H, ESP, []);
    dir.position.set(x1, 0, CZ); dir.rotation.y = Math.PI / 2; gEst.add(dir);
    const esq = paredeComVaos(z1 - z0, H, ESP, [{ u: uZ(zc), w: pb - pa, y0: 0, h: 2.15 }, jan(uZ(pb + 2 * (z1 - pb) / 3))]);
    esq.position.set(x0, 0, CZ); esq.rotation.y = Math.PI / 2; gEst.add(esq);
    const tw = T.parede.clone(); tw.needsUpdate = true; tw.repeat.set((x1 - x0) / 2.6, 0.05);
    gEst.add(caixa(x1 - x0, 0.12, ESP, std({ map: tw, roughness: 0.9 }), CX, 0.06, z1));   // rodapé da frente
    // placa SAÍDA em cima do vão da porta
    const placa = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.28), new THREE.MeshBasicMaterial({ map: T.saida }));
    placa.position.set(x0 + 0.09, 2.45, zc); placa.rotation.y = Math.PI / 2; gEst.add(placa);
    // pilares listrados (iguais aos da sala)
    const mPil = std({ map: T.listra, roughness: 0.7 }), mBege = std({ color: '#e7dcc0', roughness: 0.8 });
    [[x0 + 0.35, z0 + 0.35], [x1 - 0.35, z0 + 0.35]].forEach(([x, z]) => { gEst.add(caixa(0.3, 1.1, 0.3, mPil, x, 0.55, z)); gEst.add(caixa(0.3, H - 1.1, 0.3, mBege, x, 1.1 + (H - 1.1) / 2, z)); });
    for (let r = 1; r <= S.ruas; r++) for (let p = 1; p <= S.posicoes; p++) {
      const tipo = tipoCelula(S, r, p);
      // PC do operador: de costas para a parede da porta (tela virada para dentro da sala)
      if (tipo === 'pc') {
        const g = new THREE.Group(); g.position.set(GR.xs[r], 0, GR.zs[p]); g.rotation.y = Math.PI / 2; gEst.add(g);
        const mesa = std({ color: '#d1d5db', roughness: 0.5 });
        g.add(caixa(1.15, 0.04, 0.62, mesa, 0, 0.76, -0.1));
        [[-0.52, -0.36], [0.52, -0.36], [-0.52, 0.16], [0.52, 0.16]].forEach(([x, z]) => g.add(caixa(0.04, 0.74, 0.04, M.metal, x, 0.37, z)));
        g.add(caixa(0.56, 0.34, 0.03, M.preto, 0, 1.0, -0.28)); g.add(caixa(0.05, 0.16, 0.05, M.preto, 0, 0.85, -0.3));
        const tela = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.3), new THREE.MeshBasicMaterial({ map: T.monitor })); tela.position.set(0, 1.0, -0.263); g.add(tela);
        g.add(caixa(0.2, 0.42, 0.42, M.preto, 0.42, 0.97, -0.12));
        g.add(caixa(0.36, 0.02, 0.12, M.preto, -0.05, 0.79, 0.05));                            // teclado
        g.add(caixa(0.48, 0.07, 0.46, std({ color: '#1e3a8a' }), 0, 0.48, 0.42)); g.add(caixa(0.46, 0.5, 0.06, std({ color: '#1e3a8a' }), 0, 0.78, 0.66));
        g.add(caixa(0.05, 0.45, 0.05, M.metal, 0, 0.22, 0.42));
        const sp = rotulo('PC', 'Operador', 'leitura', '#facc15', 0.75, true); sp.position.set(0, 1.75, 0); g.add(sp);
      }
    }
    // TV do lado de fora: à esquerda da porta (para quem olha de fora)
    M.tvX = x0 - ESP / 2; M.tvZ = Math.max(z0 + 0.75, pa - 0.85);
    enquadrarBase();
  }

  /* ── o que muda em tempo real: paletes, rótulos, TV, vaga indicada ── */
  function construirPaletes() {
    limpar(gDin); descartar.forEach(t => t.dispose()); descartar = [];
    gDin = new THREE.Group(); scene.add(gDin); picks = []; grupos = {}; pulsos = []; setas = [];
    const oc = ocupacao(), S = dbData.sala;
    const esconder = escolhaSt && escolhaSt.lpn;                 // na escolha, o palete novo aparece só como "guardar aqui"
    const prox = []; ordemRetirada(oc).forEach(x => { if (x.vaga && x.lpn !== esconder && !prox.includes(x.vaga) && prox.length < 3) prox.push(x.vaga); });
    const pickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    oc.vagas.forEach(v => {
      const its = (oc.mapa[v.id] || []).filter(x => x.lpn !== esconder);
      const ud = { id: v.id, cap: v.cap, itens: its, retrab: v.retrab };
      const alvo = new THREE.Mesh(new THREE.BoxGeometry(S.celLarg - 0.1, 0.05, v.prof - 0.1), pickMat);
      alvo.position.set(v.x, 0.03, v.z); alvo.userData = ud; gDin.add(alvo); picks.push(alvo);
      // RETRABALHO vazio (sem palete do buffer): palete com 2 magazines e 2 bandejas com placas.
      // Quando um palete do buffer ocupa a vaga, ele some; quando o palete sai, volta a aparecer.
      if (v.retrab && !its.length) {
        if (escolhaSt && escolhaSt.vaga === v.id) return;           // escolhida agora para guardar: fica vazia
        const base = new THREE.Group(); base.position.set(v.x, 0, v.z); gDin.add(base);
        const g = new THREE.Group(); g.rotation.y = v.face; base.add(g);
        g.add(novoPalete());
        [0, 1].forEach(i => { const [x, y, z] = slotMagazine(i); const m = malha(G.mag, M.mag, x, y, z); m.userData = ud; picks.push(m); g.add(m); });
        const b1 = bandeja(4); b1.position.set(-0.2, PAL_H, -0.27); g.add(b1);
        const b2 = bandeja(3); b2.position.set(0.25, PAL_H, -0.24); b2.rotation.y = 0.12; g.add(b2);
        const sp = rotulo('RETRABALHO', 'placas em', v.id, '#a855f7', 0.6); sp.position.set(0, 1.25, 0); base.add(sp);
        return;
      }
      const tv = !its.length && !v.retrab && travaDe(v.id);
      if (tv && !(escolhaSt && escolhaSt.vaga === v.id)) {
        const base = new THREE.Group(); base.position.set(v.x, 0, v.z); gDin.add(base);
        const tx = tv.tipo === 'bloq' ? cTex(128, 128, (g, w, h) => { g.fillStyle = '#94a3b8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#475569'; g.lineWidth = 14; for (let k = -w; k < w * 2; k += 36) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + h, h); g.stroke(); } }) : null;
        if (tx) descartar.push(tx);
        const chao = new THREE.Mesh(new THREE.PlaneGeometry(S.celLarg - 0.14, v.prof - 0.14), new THREE.MeshBasicMaterial(tx ? { map: tx, transparent: true, opacity: 0.85, depthWrite: false } : { color: '#7c3aed', transparent: true, opacity: 0.45, depthWrite: false }));
        chao.rotation.x = -Math.PI / 2; chao.position.y = 0.008; base.add(chao);
        const sp = tv.tipo === 'bloq' ? rotulo('BLOQUEADA', String(tv.motivo || 'manutenção').slice(0, 22), v.id, '#64748b', 0.7) : rotulo('RESERVADA', 'OP ' + tv.op, v.id, '#7c3aed', 0.7);
        sp.position.set(0, 0.9, 0); base.add(sp);
        return;
      }
      if (!its.length) return;
      const cor = corPalete(its);
      const base = new THREE.Group(); base.position.set(v.x, 0, v.z); gDin.add(base);
      const g = new THREE.Group(); g.rotation.y = v.face; base.add(g); grupos[v.id] = base;
      const brilho = new THREE.Mesh(new THREE.PlaneGeometry(1.32, 1.12), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.55, depthWrite: false }));
      brilho.rotation.x = -Math.PI / 2; brilho.position.y = 0.007; g.add(brilho);
      g.add(novoPalete());
      const n = nMagazines(its);
      for (let i = 0; i < n; i++) {
        const [x, y, z] = slotMagazine(i);
        const m = malha(G.mag, M.mag, x, y, z); m.userData = ud; picks.push(m); g.add(m);
      }
      const et = new THREE.Mesh(G.etiqueta, etiquetaKit(its, v.id)); et.position.set(0, PAL_H + MH * 0.55, 0.245 + MD / 2 + 0.004); g.add(et);
      const topo = PAL_H + (n > 6 ? 2 : 1) * (MH + 0.012);
      const q = its.reduce((s, x) => s + (Number(x.qtd) || 0), 0);
      const sp = rotulo(its[0].op, its[0].modelo, q + ' pl  ·  ' + (its[0].dataIMtxt ? its[0].dataIMtxt.slice(0, 5) : 's/ IM'), cor, modo === 'tv' ? 0.95 : 0.8);
      sp.position.set(0, topo + 0.55, 0); base.add(sp);
      if (prox.includes(v.id)) {
        const a = new THREE.Mesh(G.anel, new THREE.MeshBasicMaterial({ color: '#22d3ee', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        a.rotation.x = -Math.PI / 2; a.position.y = 0.012; base.add(a); pulsos.push(a);
      }
    });
    // escolha de vaga: realce do mouse + a vaga indicada (verde, piscando, com seta)
    hlMesh = null;
    if (modo === 'escolha') {
      hlMesh = new THREE.Mesh(new THREE.PlaneGeometry(S.celLarg - 0.12, S.celProf - 0.12), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.4, depthWrite: false }));
      hlMesh.rotation.x = -Math.PI / 2; hlMesh.visible = false; gDin.add(hlMesh);
      const v = escolhaSt && escolhaSt.vaga && oc.porId[escolhaSt.vaga];
      if (v) {
        const it = (oc.mapa[v.id] || []).find(x => x.lpn === escolhaSt.lpn) || {};
        const base = new THREE.Group(); base.position.set(v.x, 0, v.z); gDin.add(base);
        const chao = new THREE.Mesh(new THREE.PlaneGeometry(S.celLarg - 0.12, v.prof - 0.12), new THREE.MeshBasicMaterial({ color: '#22c55e', transparent: true, opacity: 0.6, depthWrite: false }));
        chao.rotation.x = -Math.PI / 2; chao.position.y = 0.009; base.add(chao);
        const a = new THREE.Mesh(G.anel, new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        a.rotation.x = -Math.PI / 2; a.position.y = 0.014; base.add(a); pulsos.push(a);
        const f = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 3.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
        f.position.y = 1.6; base.add(f);
        const seta = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#4ade80' }));
        seta.rotation.x = Math.PI; seta.userData.y0 = 2.2; seta.position.y = 2.2; base.add(seta); setas.push(seta);
        const sp = rotulo('GUARDAR AQUI', v.id, it.op ? 'OP ' + it.op : '', '#22c55e', 1.05); sp.position.set(0, 3.15, 0); base.add(sp);
        // foco de luz na vaga indicada (o resto da sala fica um pouco mais escuro)
        const luz = new THREE.SpotLight('#ffffff', 0.7, 0, 0.32, 0.5, 1); luz.position.set(v.x, 6, v.z);
        luz.target.position.set(v.x, 0, v.z); gDin.add(luz); gDin.add(luz.target);
      }
    }
    // busca rápida: o palete achado fica igual à vaga indicada no "Guardar o palete" (seta, feixe, foco de luz)
    const vD = modo !== 'escolha' && modo !== 'tv' && destaque && oc.porId[destaque];
    if (vD) {
      const its = oc.mapa[vD.id] || [];
      const base = new THREE.Group(); base.position.set(vD.x, 0, vD.z); gDin.add(base);
      const a = new THREE.Mesh(G.anel, new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      a.rotation.x = -Math.PI / 2; a.position.y = 0.014; base.add(a); pulsos.push(a);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 3.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
      f.position.y = 1.6; base.add(f);
      const seta = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 24), new THREE.MeshBasicMaterial({ color: '#4ade80' }));
      seta.rotation.x = Math.PI; seta.userData.y0 = 3.0; seta.position.y = 3.0; base.add(seta); setas.push(seta);
      const sp = rotulo('PALETE AQUI', vD.id, its[0] ? 'OP ' + its[0].op : '', '#22c55e', 1.05); sp.position.set(0, 3.9, 0); base.add(sp);
      const luz = new THREE.SpotLight('#ffffff', 0.7, 0, 0.32, 0.5, 1); luz.position.set(vD.x, 6, vD.z);
      luz.target.position.set(vD.x, 0, vD.z); gDin.add(luz); gDin.add(luz.target);
    }
    // escolha de vaga / busca: sala um pouco mais escura em volta da vaga indicada; nos outros modos, luz normal
    const escuro = (modo === 'escolha' && escolhaSt && escolhaSt.vaga && oc.porId[escolhaSt.vaga]) || vD ? 0.5 : 1;
    M.amb.intensity = 0.25 * escuro; M.hemi.intensity = 0.6 * escuro; M.sol.intensity = 0.85 * escuro;
    // TV do lado de fora mostrando a sala
    const k = _kpisSala(oc);
    const tt = cTex(320, 180, (g, w, h) => {
      g.fillStyle = '#060b16'; g.fillRect(0, 0, w, h); g.fillStyle = '#38bdf8'; g.font = 'bold 20px Arial'; g.fillText('SALA DO BUFFER · AO VIVO', 14, 30);
      g.fillStyle = '#fff'; g.font = 'bold 64px Arial'; g.fillText(k.pct + '%', 14, 104); g.font = 'bold 20px Arial'; g.fillStyle = '#94a3b8'; g.fillText('ocupação', 16, 130);
      g.fillStyle = '#4ade80'; g.fillText(k.livres + ' livres', 180, 80); g.fillStyle = '#7dd3fc'; g.fillText(k.mags + ' paletes', 180, 110); g.fillStyle = '#f87171'; g.fillText(k.atras + ' IM atrasada', 180, 140);
      g.fillStyle = '#ef4444'; g.beginPath(); g.arc(w - 22, 24, 7, 0, 7); g.fill();
    });
    descartar.push(tt);
    const tv = new THREE.Group(); tv.position.set(M.tvX - 0.04, 1.75, M.tvZ); tv.rotation.y = -Math.PI / 2; gDin.add(tv);
    tv.add(caixa(1.12, 0.66, 0.06, M.preto, 0, 0, 0));
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.585), new THREE.MeshBasicMaterial({ map: tt })); tela.position.z = 0.032; tv.add(tela);
    if (foco) { foco.grupo = grupos[foco.id] || null; if (foco.grupo) feixeEm(foco.id); }
  }
  function feixeEm(id) {
    const v = ocupacao().porId[id]; if (!v) return;
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 5, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#4ade80', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    f.position.set(v.x, 2.5, v.z); gDin.add(f); foco.feixe = f;
  }

  /* vista padrão '3d' = a mesma da TV (distância e ângulo fixos) */
  function posicoesVista(v) {
    const GR = gradeSala(dbData.sala), W = GR.largura, D = GR.comprimento, c = new THREE.Vector3(W / 2 - 0.5, 0, D / 2);
    if (v === 'topo') return { p: new THREE.Vector3(c.x, Math.max(W, D) * 1.15 + 4, c.z + 0.01), a: c };
    return { p: new THREE.Vector3(c.x - 0.6, Math.max(W, D) * 0.7, D + Math.max(W, D) * 0.66), a: new THREE.Vector3(c.x, 0, c.z - 0.4) };
  }
  function enquadrarBase() { const b = posicoesVista(vistaAtual); camera.position.copy(b.p); controls.target.copy(b.a); controls.update();
    const GR = gradeSala(dbData.sala); M.sol.target.position.set(GR.largura / 2, 0, GR.comprimento / 2); M.sol.position.set(GR.largura / 2 - 7, 22, GR.comprimento / 2 + 12); }
  const assinaturaDin = () => { const oc = ocupacao(); return JSON.stringify([modoCor(), modo, escolhaSt ? escolhaSt.lpn + '|' + escolhaSt.vaga : '', destaque, modoCor() === 'horas' ? Math.floor(Date.now() / 600000) : 0, ordemRetirada(oc).slice(0, 3).map(x => x.vaga), _kpisSala(oc).pct,
    Object.entries(oc.mapa).filter(([, a]) => a.length).map(([k, a]) => k + ':' + a.map(x => x.lpn + '|' + x.qtd + '|' + x.dataIM + '|' + x.dias + '|' + x.modelo).join(','))]); };

  return {
    /* modo: 'normal' | 'tv' | 'escolha' | 'livre' · opts (escolha): { lpn, vaga, aoEscolher } */
    async montarEm(el, m, opts) {
      if (!el) return;
      try { await garantirThree(); } catch (e) { el.innerHTML = '<div class="p-6 text-white/80 text-sm font-bold">Não consegui carregar o motor 3D (sem internet?). O mapa da sala e a lista de vagas continuam funcionando.</div>'; return; }
      if (!renderer) iniciar();
      alvoEl = el; modo = m === true ? 'tv' : (m || 'normal');
      escolhaSt = modo === 'escolha' ? (opts || null) : null;
      configurarControles();
      if (renderer.domElement.parentNode !== el) el.appendChild(renderer.domElement);
      renderer.domElement.style.cursor = '';
      ro.disconnect(); ro.observe(el); ajustar();
      const se = JSON.stringify(dbData.sala);
      if (se !== sigEst) { sigEst = se; construirSala(); }
      sigDin = assinaturaDin(); construirPaletes();
      vistaAtual = '3d'; voo = null; enquadrarBase(); ultimaInteracao = 0; interagindo = false;
      ['bp-legenda', 'bp-tv-leg', 'bp-3dfull-leg'].forEach(id => { if ($(id)) $(id).innerHTML = legendaHTML(); });
    },
    atualizar(forcar) {
      if (!renderer || !alvoEl || !alvoEl.isConnected) return;
      const se = JSON.stringify(dbData.sala);
      if (se !== sigEst) { sigEst = se; construirSala(); forcar = true; }
      const s = assinaturaDin(); if (!forcar && s === sigDin) return;
      sigDin = s; construirPaletes();
      ['bp-legenda', 'bp-tv-leg', 'bp-3dfull-leg'].forEach(id => { if ($(id)) $(id).innerHTML = legendaHTML(); });
    },
    reconstruir() { if (renderer && alvoEl) { sigEst = ''; this.atualizar(true); } },
    vista(v) {
      if (!renderer) return;
      vistaAtual = v; const b = posicoesVista(v);
      voo = { t: 0, p0: camera.position.clone(), p1: b.p, a0: controls.target.clone(), a1: b.a };
      ultimaInteracao = Date.now();
    },
    focar(id) {
      foco = { id, t: 0, grupo: grupos[id] || null };
      if (foco.grupo) feixeEm(id); else foco = null;
    },
    /* busca rápida: realça a vaga (null = tira o realce) e leva a câmera até ela */
    destacar(id) {
      destaque = id || null;
      if (!renderer) return;
      this.atualizar(true);
      const v = id && ocupacao().porId[id]; if (!v) return;
      const alvo = new THREE.Vector3(v.x, 0.6, v.z);
      voo = { t: 0, p0: camera.position.clone(), p1: new THREE.Vector3(v.x - 1.2, 5.2, v.z + 5.6), a0: controls.target.clone(), a1: alvo };
      ultimaInteracao = Date.now();
    },
    destacada: () => destaque,
    /* troca a vaga indicada sem remontar (null = sai da escolha) */
    escolha(st) { escolhaSt = st || null; if (renderer && modo === 'escolha') this.atualizar(true); }
  };
})();
function verNaSala(vaga) { mudarAba('SALA'); setTimeout(() => sala3d.focar(vaga), 900); }

/* ── "Vista 3D" em tela cheia: navegação livre pela sala ── */
const tela3DAberta = () => !!$('bp-3dfull') && !$('bp-3dfull').classList.contains('hidden');
function abrir3DTela() {
  let f = $('bp-3dfull');
  if (!f) {
    f = document.createElement('div'); f.id = 'bp-3dfull';
    f.className = 'fixed inset-0 z-[8700] bg-[#0b1220] text-white';
    const bt = 'px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold';
    f.innerHTML = `<div id="bp-3dfull-c" class="absolute inset-0"></div>
      <div class="bp-tip hidden absolute pointer-events-none bg-white/95 text-gray-800 rounded-lg shadow-xl p-3 text-xs max-w-xs z-10"></div>
      <div class="absolute top-0 inset-x-0 flex items-center gap-3 px-5 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <i data-lucide="box" class="w-6 h-6 text-sky-300"></i><div class="text-lg font-black tracking-wide">SALA DO BUFFER · VISTA 3D LIVRE</div>
        <div class="ml-auto flex gap-2"><button onclick="BP.sala3d.vista('3d')" class="${bt}">Centralizar</button><button onclick="BP.sala3d.vista('topo')" class="${bt}">Vista de cima</button>
        <button onclick="BP.fechar3DTela()" class="px-3 py-2 rounded-lg bg-[#c81e1e] hover:bg-red-600 text-xs font-black">✕ Fechar (Esc)</button></div></div>
      <div class="absolute left-4 bottom-4 text-[11px] leading-relaxed bg-black/60 rounded-lg px-4 py-3 max-w-md">
        <b class="text-sky-300">Como navegar</b><br>Arrastar = girar · Botão direito (ou Ctrl + arrastar) = mover · Roda = zoom (passa do ponto, sem trava)<br>
        <b>W A S D</b> ou setas = andar · <b>Q / E</b> = descer / subir · <b>Shift</b> = rápido · Duplo clique no chão = girar em volta dali</div>
      <div id="bp-3dfull-leg" class="absolute right-4 bottom-4 text-[11px] flex flex-wrap gap-3 bg-black/60 rounded-lg px-3 py-2"></div>`;
    document.body.appendChild(f);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && tela3DAberta() && !guardarAberto() && !($('bp-modal') && !$('bp-modal').classList.contains('hidden'))) fechar3DTela(); });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && tela3DAberta() && f._pediTela) fechar3DTela(); });
    icones();
  }
  f.classList.remove('hidden');
  f._pediTela = false;
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
    f._pediTela = true;
    try { document.documentElement.requestFullscreen().catch(() => { f._pediTela = false; }); } catch (e) { f._pediTela = false; }
  }
  sala3d.montarEm($('bp-3dfull-c'), 'livre');
}
function fechar3DTela() {
  const f = $('bp-3dfull'); if (!f || f.classList.contains('hidden')) return;
  f.classList.add('hidden');
  if (f._pediTela && document.fullscreenElement) { f._pediTela = false; try { document.exitFullscreen().catch(() => {}); } catch (e) {} }
  _remontar3D();
}

/* ═════════════════ [6] BACKUP A CADA 3 HORAS · LIMPA +14 DIAS ═════════════
   backup\json\AAAA-MM\banco_AAAA-MM-DD_HHh.json        (serve para restaurar)
   backup\excel\AAAA-MM\Backup_BufferControl_AAAA-MM-DD_HHh.xlsx
   Janelas: 00h 03h 06h 09h 12h 15h 18h 21h. Qualquer PC aberto grava a
   janela atual se ela ainda não existir. Apaga os de mais de 14 dias.   */
const BACKUP_HORAS = 3, BACKUP_DIAS = 14;
const RX_BKP = /^(?:banco|Backup_BufferControl)_(\d{4})-(\d{2})-(\d{2})_(\d{2})h\.(?:json|xlsx)$/;
let _bkpRodando = false, _bkpUltimo = null;
function _janela(d) { d = d || new Date(); const h = Math.floor(d.getHours() / BACKUP_HORAS) * BACKUP_HORAS;
  const mes = d.getFullYear() + '-' + p2(d.getMonth() + 1); return { mes, nome: mes + '-' + p2(d.getDate()) + '_' + p2(h) + 'h' }; }
async function _pasta(caminho, criar) { let h = MMT.pasta; for (const n of caminho) h = await h.getDirectoryHandle(n, { create: !!criar }); return h; }
async function _existe(dir, nome) { try { await dir.getFileHandle(nome); return true; } catch (e) { return false; } }
async function _gravar(dir, nome, dados) { const fh = await dir.getFileHandle(nome, { create: true }); const w = await fh.createWritable(); await w.write(dados); await w.close(); }

function _excelBackup() {
  const wb = XLSX.utils.book_new();
  const add = (nome, linhas, vazio) => {
    const ws = linhas.length ? XLSX.utils.json_to_sheet(linhas) : XLSX.utils.aoa_to_sheet([[vazio || 'Sem registros']]);
    if (linhas.length) ws['!cols'] = Object.keys(linhas[0]).map(k => ({ wch: Math.min(40, Math.max(10, k.length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, nome);
  };
  const oc = ocupacao(), k = _kpisSala(oc);
  add('Resumo', [
    { Campo: 'Gerado em', Valor: new Date().toLocaleString('pt-BR') },
    { Campo: 'Gerado por', Valor: usuarioLogado ? usuarioLogado.usuario : '—' },
    { Campo: 'Magazines no buffer', Valor: k.mags }, { Campo: 'Vagas ocupadas', Valor: k.ocup + ' de ' + k.tot },
    { Campo: 'OPs plano SMT', Valor: (dbData.ops || []).length }, { Campo: 'OPs plano IM', Valor: (dbData.opsIM || []).length },
    { Campo: 'Controle de OP', Valor: dbData.vinculo ? (dbData.vinculo.arquivo + ' · ' + dbData.vinculo.em) : '—' },
    { Campo: 'Leituras (total)', Valor: (dbData.leituras || []).length }]);
  add('Buffer agora', [...Object.values(oc.mapa).flat(), ...oc.semVaga].map(x => ({ 'Vaga': x.vaga || 'SEM VAGA', 'LPN': x.lpn, 'OP SMT': x.op, 'Modelo': x.modelo, 'Qtd': x.qtd,
    'Entrada': x.ts ? new Date(x.ts).toLocaleString('pt-BR') : '', 'Dias': x.dias, 'OP IM': x.opIM, 'Linha IM': x.linhaIM, 'Data IM': x.dataIMtxt })));
  add('Leituras', (dbData.leituras || []).map(l => { const o = (dbData.ops || []).find(x => x.numero === l.op) || {};
    return { 'Tipo': (l.tipo || 'entrada') === 'saida' ? 'Saída p/ IM' : 'Entrada', 'OP': l.op, 'Modelo': o.modelo || '', 'LPN': l.lpn, 'Qtd': l.qtd, 'Guardião': l.guardiao || '', 'Hora': l.hora || '' }; }));
  add('Plano SMT', (dbData.ops || []).map(o => { const c = (dbData.cruzamentos || {})[o.numero] || {};
    return { 'OP': o.numero, 'Linha': o.linha || '', 'Data': o.data || '', 'Modelo': o.modelo || '', 'Chassi': o.chassi || '', 'Qtd': o.total, 'Invoice': o.invoice || '', 'PN': o.partNumber || '', 'OP IM': c.opIM || '', 'Casado por': c.match || '' }; }));
  add('Plano IM', (dbData.opsIM || []).map(o => ({ 'OP': o.numero, 'Linha': o.linha || '', 'Data': o.data || '', 'Modelo': o.modelo || '', 'Qtd': o.total, 'Invoice': o.invoice || '', 'PN': o.partNumber || '' })));
  add('Vínculo SMT-IM', Object.entries((dbData.vinculo || {}).links || {}).filter(([op]) => (dbData.ops || []).some(o => o.numero === op))
    .map(([op, l]) => ({ 'OP SMT': op, 'OP IM': (l.im || []).join(', '), 'Placa': l.placa, 'Confiança': CONF_TXT[l.conf] || l.conf, 'Motivo': l.motivo })), 'Sem Controle de OP / sem OP do plano');
  add('Log', (dbData.logs || []).slice(-3000).map(l => ({ 'Quando': l.hora, 'Usuário': l.usuario, 'Ação': l.acao, 'Detalhe': l.detalhe })));
  return wb;
}
async function backupAgora(forcar) {
  if (_bkpRodando || typeof MMT === 'undefined' || !MMT.pasta || !dbData) return;
  _bkpRodando = true;
  try {
    const j = _janela();
    const dJ = await _pasta(['backup', 'json', j.mes], true), dX = await _pasta(['backup', 'excel', j.mes], true);
    const nJ = 'banco_' + j.nome + '.json', nX = 'Backup_BufferControl_' + j.nome + '.xlsx';
    if (forcar || !(await _existe(dJ, nJ))) await _gravar(dJ, nJ, JSON.stringify(dbData));
    if (forcar || !(await _existe(dX, nX))) await _gravar(dX, nX, new Blob([XLSX.write(_excelBackup(), { bookType: 'xlsx', type: 'array' })]));
    _bkpUltimo = j.nome;
    await limparBackups();
  } catch (e) { console.warn('Backup automático falhou:', e); }
  _bkpRodando = false;
  _statusBackup();
}
async function limparBackups() {
  const limite = Date.now() - BACKUP_DIAS * DIA;
  for (const tipo of ['json', 'excel']) {
    let raizB; try { raizB = await _pasta(['backup', tipo], false); } catch (e) { continue; }
    for await (const [nomeMes, hMes] of raizB.entries()) {
      if (hMes.kind !== 'directory' || !/^\d{4}-\d{2}$/.test(nomeMes)) continue;
      let sobrou = 0;
      for await (const [nome] of hMes.entries()) {
        const m = nome.match(RX_BKP);
        if (!m) { sobrou++; continue; }                         // arquivo que não é do backup: não mexe
        const quando = new Date(+m[1], +m[2] - 1, +m[3], +m[4]).getTime();
        if (quando < limite) { try { await hMes.removeEntry(nome); } catch (e) { sobrou++; } } else sobrou++;
      }
      if (!sobrou) { try { await raizB.removeEntry(nomeMes, { recursive: true }); } catch (e) { /* outro PC */ } }
    }
  }
}
function _statusBackup() {
  const c = $('bp-ctrl-card'); if (!c) return;
  let s = $('bp-bkp');
  if (!s) { s = document.createElement('div'); s.id = 'bp-bkp'; s.className = 'mb-4 -mt-2 flex items-center gap-3 text-[11px] font-bold text-gray-500'; c.parentNode.insertBefore(s, c.nextSibling); }
  s.innerHTML = `<i data-lucide="archive" class="w-4 h-4"></i> Backup automático a cada ${BACKUP_HORAS} h (JSON + Excel) em backup\\json e backup\\excel · guarda ${BACKUP_DIAS} dias · ${_bkpUltimo ? 'janela atual: ' + _bkpUltimo : 'aguardando'}
    <button onclick="BP.backupAgora(true)" class="ml-2 px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sidebar">Gerar agora</button>`;
  icones();
}

/* ═════════════════ [7] ACESSOS E LOGINS (só Key User) ═════════════════
   O login e a senha continuam sendo os da Plataforma MMT (Admin na
   Plataforma = Key User). Aqui o Key User define, por perfil e por
   pessoa, quais abas cada um vê, bloqueia logins e acompanha o log.
     dbData.acessos = { perfis: { 'Guardião': [abas], 'Operador': [abas] },
                        perfilNovo, atualizadoEm }
     usuário: abas (lista própria; sem ela vale a do perfil), bloqueado,
              removido (excluído da lista; volta se cadastrar de novo)     */
const ABAS = [['LEITURA', 'Leitura de Palete'], ['RELATORIO', 'Relatório de Leituras'], ['AGING', 'Buffer × Plano IM'],
  ['DASH', 'Dashboards'], ['SALA', 'Sala do Buffer 3D'], ['MES', 'Plano de Produção']];
const nomeAba = id => (ABAS.find(a => a[0] === id) || [id, id === 'PERM' ? 'Acessos e Logins' : id === 'ESTRAT' ? 'Estratégia' : id])[1];
const PERFIS_EDIT = ['Guardião', 'Operador'];
const PERFIS_PADRAO = () => ({ 'Guardião': ABAS.map(a => a[0]), 'Operador': ['LEITURA', 'SALA'] });
if (!PERFIS.includes('Operador')) PERFIS.push('Operador');      // senão o original troca "Operador" por "Guardião"

function acessos() {
  if (!dbData.acessos || typeof dbData.acessos !== 'object') dbData.acessos = { perfis: PERFIS_PADRAO(), perfilNovo: 'Operador', atualizadoEm: 0 };
  const A = dbData.acessos, P = PERFIS_PADRAO();
  A.perfis = A.perfis || {};
  PERFIS_EDIT.forEach(p => { if (!Array.isArray(A.perfis[p])) A.perfis[p] = P[p]; });
  if (!PERFIS_EDIT.includes(A.perfilNovo)) A.perfilNovo = 'Operador';
  return A;
}
/* mescla entre PCs: a configuração de acessos vence pela edição mais recente */
const _mesclarAcessosOrig = _mesclarBanco;
_mesclarBanco = function (remoto) {
  const local = dbData, out = _mesclarAcessosOrig(remoto);
  const aR = remoto.acessos, aL = local.acessos;
  out.acessos = (aL && (!aR || (Number(aL.atualizadoEm) || 0) > (Number(aR.atualizadoEm) || 0))) ? aL : (aR || aL);
  return out;
};
const ehKey = () => !!usuarioLogado && usuarioLogado.perfil === 'Key User';
const regDe = mat => (dbData.usuarios || []).find(x => String(x.usuario) === String(mat));
/* abas liberadas para um usuário (registro mais novo do banco, que muda na sincronização) */
function abasDe(u) {
  if (!u && !usuarioLogado) return [];
  if (!u && ehKey()) return ABAS.map(a => a[0]).concat('PERM', 'ESTRAT');
  u = u || regDe(usuarioLogado.usuario) || usuarioLogado;
  if (u.perfil === 'Key User') return ABAS.map(a => a[0]).concat('PERM', 'ESTRAT');
  if (u.bloqueado) return [];
  return Array.isArray(u.abas) ? u.abas.filter(a => ABAS.some(x => x[0] === a)) : (acessos().perfis[u.perfil] || acessos().perfis['Guardião']);   // perfil antigo (ex.: Alimentador) = Guardião
}
const pode = aba => abasDe().includes(aba);
const bloqueado = () => !!usuarioLogado && !ehKey() && !!(regDe(usuarioLogado.usuario) || usuarioLogado).bloqueado;

/* menu: esconde o que a pessoa não pode ver (e o título do grupo que ficou vazio) */
function _aplicarMenu() {
  if (!usuarioLogado) return;
  const lib = new Set(abasDe());
  ABAS.concat([['PERM'], ['ESTRAT']]).forEach(([id]) => { const n = $('nav-' + id); if (n) n.style.display = lib.has(id) ? '' : 'none'; });
  const nav = document.querySelector('aside nav'); if (!nav) return;
  let tit = null, algum = false;
  const fechar = () => { if (tit) tit.style.display = algum ? '' : 'none'; };
  [...nav.children].forEach(el => {
    if (el.tagName === 'DIV' && el.classList.contains('uppercase')) { fechar(); tit = el; algum = false; }
    else if (el.classList.contains('nav-item') && el.style.display !== 'none' && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none') algum = true;
  });
  fechar();
}
const _permUIOrig = _aplicarPermissoesUI;
_aplicarPermissoesUI = function () { _permUIOrig(); _aplicarMenu(); };

let _iniciado = false;
const _mudarAbaPerm = mudarAba;
mudarAba = function (abaId) {
  if (usuarioLogado && !pode(abaId)) {
    if (bloqueado()) { _telaBloqueio(true); return; }
    const prim = abasDe()[0];
    if (_iniciado) { msgTopo('Você não tem acesso à aba "' + nomeAba(abaId) + '". Fale com o Key User.', true); registrarLog('ACESSO_NEGADO', 'Tentou abrir a aba ' + nomeAba(abaId)); }
    if (!prim) { _telaBloqueio(true, 'Nenhuma aba liberada para o seu login.'); return; }
    if (abaId === prim) return;
    abaId = prim;
  }
  _mudarAbaPerm(abaId);
  if (abaId === 'PERM') renderPerm();
  if (abaId === 'ESTRAT') renderEstrat();
};
function _telaBloqueio(on, txt) {
  let b = $('bp-bloqueio');
  if (!on) { if (b) b.remove(); return; }
  if (!b) {
    b = document.createElement('div'); b.id = 'bp-bloqueio';
    b.className = 'fixed inset-0 z-[9900] bg-sidebar text-white flex flex-col items-center justify-center gap-4 text-center p-6';
    document.body.appendChild(b);
  }
  b.innerHTML = `<i data-lucide="shield-x" class="w-16 h-16 text-[#e3000f]"></i><div class="text-2xl font-black">ACESSO BLOQUEADO</div>
    <div class="text-sm text-white/70 max-w-md">${esc(txt || 'Seu login está bloqueado no Buffer Control.')}<br>Fale com o Key User do MMT para liberar.</div>
    <div class="text-xs font-mono text-white/40">${esc(usuarioLogado ? usuarioLogado.usuario : '')}</div>`;
  icones();
}
/* confere de novo a cada sincronização (o Key User pode mudar o acesso de quem está usando) */
function _conferirAcesso() {
  if (!usuarioLogado || !_iniciado) return;
  if (bloqueado() || !abasDe().length) { _telaBloqueio(true, bloqueado() ? '' : 'Nenhuma aba liberada para o seu login.'); return; }
  _telaBloqueio(false);
  _aplicarMenu();
  const ativa = document.querySelector('.tab-content.active');
  const id = ativa ? ativa.id.replace('aba-', '') : '';
  if (id && !pode(id)) mudarAba(abasDe()[0]);
}

const _renderTudoPerm = renderTudo;
renderTudo = function (auto) { _renderTudoPerm(auto); _conferirAcesso(); };

/* login pela Plataforma: quem entra pela 1ª vez recebe o "perfil de quem entra
   pela 1ª vez" (padrão Operador) — os logins que já existiam não mudam      */
let _usuariosAntes = null;
const _concluirOrig = _concluirConexao;
_concluirConexao = async function (fh) {
  const r = await _concluirOrig(fh);
  _usuariosAntes = new Set((dbData.usuarios || []).filter(u => !u.removido).map(u => String(u.usuario)));
  return r;
};
const _reconOrig = _tentarReconexaoAutomatica;
_tentarReconexaoAutomatica = async function () {
  await _reconOrig();
  const u = usuarioLogado; if (!u) return;
  if (u.perfil !== 'Key User' && _usuariosAntes && !_usuariosAntes.has(String(u.usuario))) {
    u.perfil = acessos().perfilNovo; delete u.abas; u.bloqueado = false; u.removido = false; u.atualizadoEm = Date.now();
    $('label-usuario-logado').textContent = u.usuario + ' • ' + u.perfil;
    await salvarBanco();
  }
  if (bloqueado()) registrarLog('ACESSO_BLOQUEADO', 'Login bloqueado tentou entrar');
};

/* ── a aba ── */
function _montarAbaPerm() {
  if ($('aba-PERM')) return;
  const ref = $('nav-ACESSOS');
  if (ref) {
    const b = document.createElement('button');
    b.id = 'nav-PERM'; b.className = 'nav-item w-full flex items-center px-6 py-3.5 text-sm text-left outline-none';
    b.setAttribute('onclick', "mudarAba('PERM')");
    b.innerHTML = '<i data-lucide="shield-check" class="w-5 h-5 mr-3 opacity-80"></i> Acessos e Logins';
    ref.parentNode.insertBefore(b, ref.nextSibling);
  }
  const main = document.querySelector('#main-app main'); if (!main) return;
  const d = document.createElement('div');
  d.id = 'aba-PERM'; d.className = 'tab-content w-full mx-auto max-w-7xl';
  main.appendChild(d);
}
const _cardP = (titulo, icone, corpo, extra) => `<div class="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
  <div class="px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap"><i data-lucide="${icone}" class="w-4 h-4 text-tpv"></i><h3 class="text-sm font-bold text-sidebar uppercase tracking-wider">${titulo}</h3>${extra || ''}</div>${corpo}</div>`;
function _ultimoAcesso() {
  const m = {};
  (dbData.logs || []).forEach(l => { if (l.acao === 'LOGIN') m[l.usuario] = l.hora; });
  return m;
}
let _permBusca = '', _logFiltro = { usuario: '', acao: '', de: '', ate: '', txt: '' };
function renderPerm() {
  const d = $('aba-PERM'); if (!d) return;
  if (!ehKey()) { d.innerHTML = '<div class="p-6 text-sm font-bold text-[#c81e1e]">Só o Key User acessa esta aba.</div>'; return; }
  const A = acessos(), ult = _ultimoAcesso();
  const users = (dbData.usuarios || []).filter(u => !u.fixo && !u.removido)
    .filter(u => !_permBusca || (u.usuario + ' ' + (u.nome || '') + ' ' + u.perfil).toLowerCase().includes(_permBusca.toLowerCase()))
    .sort((a, b) => (a.perfil === 'Key User') - (b.perfil === 'Key User') || String(a.nome || a.usuario).localeCompare(String(b.nome || b.usuario)));
  const chk = (on, dis, js) => `<input type="checkbox" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} onchange="${js}" class="w-4 h-4 accent-[#005b9f] cursor-pointer">`;
  // perfis
  const linhaPerfil = p => `<tr class="border-b border-gray-100"><td class="p-3 font-black text-sidebar whitespace-nowrap">${p}${p === 'Key User' ? ' <span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-blue-100 text-tpv">ADMIN DA PLATAFORMA</span>' : ''}</td>` +
    ABAS.map(([id]) => `<td class="p-3 text-center">${p === 'Key User' ? chk(true, true, '') : chk(A.perfis[p].includes(id), false, `BP.perfilAba('${p}','${id}',this.checked)`)}</td>`).join('') +
    `<td class="p-3 text-center">${chk(p === 'Key User', true, '')}</td></tr>`;
  const cab = '<th class="p-3 text-left">Perfil</th>' + ABAS.map(([, n]) => `<th class="p-3 text-center">${n}</th>`).join('') + '<th class="p-3 text-center">Acessos e Logins</th>';
  let h = `<div class="flex justify-between items-center mb-6 flex-wrap gap-2">
      <h2 class="text-2xl font-bold text-sidebar flex items-center"><i data-lucide="shield-check" class="mr-2 text-tpv"></i> Acessos e Logins</h2>
      <span class="text-sm font-medium text-gray-500">Login e senha são os da Plataforma MMT · aqui você define o que cada pessoa vê</span></div>`;
  h += _cardP('Perfis — abas liberadas', 'layers', `<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-gray-500 text-[10px] uppercase"><tr>${cab}</tr></thead><tbody>
      ${linhaPerfil('Key User')}${PERFIS_EDIT.map(linhaPerfil).join('')}</tbody></table></div>
      <div class="px-5 py-3 border-t border-gray-100 flex flex-wrap items-center gap-3 text-xs">
        <label class="font-bold text-gray-600">Quem entra pela 1ª vez (matrícula nova na Plataforma) recebe o perfil:</label>
        <select onchange="BP.perfilNovo(this.value)" class="border border-gray-300 rounded py-1.5 px-2 text-xs font-bold bg-white">${PERFIS_EDIT.map(p => `<option ${A.perfilNovo === p ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <span class="text-gray-400">Key User = quem é Admin na Plataforma (sempre vê tudo).</span></div>`);
  h += _cardP('Cadastrar login', 'user-plus', `<div class="p-5 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
      <div><label class="block text-xs font-bold text-gray-500 mb-1 uppercase">Matrícula (a mesma da Plataforma)</label><input id="perm-mat" class="w-full border border-gray-300 rounded py-2 px-3 text-sm font-mono outline-none focus:border-tpv" placeholder="Ex: 123456"></div>
      <div><label class="block text-xs font-bold text-gray-500 mb-1 uppercase">Nome</label><input id="perm-nome" class="w-full border border-gray-300 rounded py-2 px-3 text-sm outline-none focus:border-tpv" placeholder="Ex: João da Silva"></div>
      <div><label class="block text-xs font-bold text-gray-500 mb-1 uppercase">Perfil</label><select id="perm-perfil" class="w-full border border-gray-300 rounded py-2 px-3 text-sm bg-white">${PERFIS_EDIT.map(p => `<option ${p === 'Operador' ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <button onclick="BP.cadastrarLogin()" class="bg-tpv hover:bg-[#003d5e] text-white text-sm font-bold py-2 rounded shadow flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Cadastrar</button></div>
      <p class="px-5 pb-4 text-[11px] text-gray-500">A pessoa entra pela Plataforma MMT com essa matrícula e já cai com as abas do perfil. <b>Senha e reset de senha ficam na Plataforma</b> (Admin › Usuários).</p>`);
  const chipAbas = u => { const ab = abasDe(Object.assign({}, u, { bloqueado: false })); return u.perfil === 'Key User' ? '<span class="text-[10px] font-bold text-tpv">todas</span>' :
    (ab.length ? ab.map(a => `<span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 mr-1 mb-1">${esc(nomeAba(a))}</span>`).join('') : '<span class="text-[10px] font-bold text-[#c81e1e]">nenhuma</span>') +
    (Array.isArray(u.abas) ? '<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">PERSONALIZADO</span>' : ''); };
  const linhaU = u => {
    const key = u.perfil === 'Key User', eu = usuarioLogado && String(u.usuario) === String(usuarioLogado.usuario), m = esc(u.usuario);
    return `<tr class="border-b border-gray-100 ${u.bloqueado ? 'bg-red-50' : ''}">
      <td class="p-3 font-mono font-bold text-sidebar whitespace-nowrap">${m}${eu ? ' <span class="text-[9px] text-gray-400">(você)</span>' : ''}</td>
      <td class="p-3">${esc(u.nome || '—')}</td>
      <td class="p-3">${key ? '<span class="text-xs font-black text-tpv">Key User</span>' : `<select onchange="BP.perfilUsuario('${m}',this.value)" class="border border-gray-300 rounded py-1 px-2 text-xs font-bold bg-white">${PERFIS_EDIT.map(p => `<option ${u.perfil === p ? 'selected' : ''}>${p}</option>`).join('')}</select>`}</td>
      <td class="p-3 max-w-xs">${chipAbas(u)}</td>
      <td class="p-3 text-center">${u.bloqueado ? '<span class="text-[10px] font-black px-2 py-1 rounded-full bg-red-100 text-[#c81e1e]">BLOQUEADO</span>' : '<span class="text-[10px] font-black px-2 py-1 rounded-full bg-green-100 text-green-700">ATIVO</span>'}</td>
      <td class="p-3 text-xs text-gray-500 whitespace-nowrap">${esc(ult[u.usuario] || '—')}</td>
      <td class="p-3 text-center whitespace-nowrap">${key ? '<span class="text-[10px] text-gray-400">gerenciado na Plataforma</span>' : `
        <button onclick="BP.abasUsuario('${m}')" class="text-xs font-bold px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 mr-1" title="Escolher as abas desta pessoa">Abas</button>
        <button onclick="BP.bloquearLogin('${m}')" class="text-xs font-bold px-2 py-1 rounded ${u.bloqueado ? 'bg-green-600 text-white' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'} mr-1">${u.bloqueado ? 'Desbloquear' : 'Bloquear'}</button>
        <button onclick="BP.removerLogin('${m}')" class="text-gray-300 hover:text-aoc align-middle" title="Excluir login"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`}</td></tr>`;
  };
  h += _cardP('Logins (' + users.length + ')', 'users', `<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-gray-50 text-gray-500 text-[10px] uppercase"><tr>
      <th class="p-3 text-left">Matrícula</th><th class="p-3 text-left">Nome</th><th class="p-3 text-left">Perfil</th><th class="p-3 text-left">Abas liberadas</th><th class="p-3">Status</th><th class="p-3 text-left">Último acesso</th><th class="p-3">Ações</th></tr></thead>
      <tbody>${users.map(linhaU).join('') || '<tr><td colspan="7" class="p-6 text-center text-xs text-gray-400">Nenhum login.</td></tr>'}</tbody></table></div>`,
    `<input oninput="BP.buscaPerm(this.value)" value="${esc(_permBusca)}" placeholder="Buscar matrícula / nome..." class="ml-auto border border-gray-300 rounded py-1.5 px-3 text-xs outline-none focus:border-tpv">`);
  h += `<div id="perm-log"></div>`;
  d.innerHTML = h;
  renderPermLog();
  icones();
}
function _logsFiltrados() {
  const F = _logFiltro, de = F.de ? new Date(F.de + 'T00:00:00').getTime() : null, ate = F.ate ? new Date(F.ate + 'T23:59:59').getTime() : null;
  return (dbData.logs || []).slice().reverse().filter(l => {
    if (F.usuario && String(l.usuario) !== F.usuario) return false;
    if (F.acao && l.acao !== F.acao) return false;
    const t = l.ts ? new Date(l.ts).getTime() : null;
    if (de && t && t < de) return false; if (ate && t && t > ate) return false;
    if (F.txt && !(l.usuario + ' ' + l.acao + ' ' + (l.detalhe || '')).toLowerCase().includes(F.txt.toLowerCase())) return false;
    return true;
  });
}
function renderPermLog() {
  const el = $('perm-log'); if (!el) return;
  const logs = dbData.logs || [], F = _logFiltro;
  const usuarios = [...new Set(logs.map(l => String(l.usuario)))].sort(), acoes = [...new Set(logs.map(l => l.acao))].sort();
  const lst = _logsFiltrados();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const loginsHoje = logs.filter(l => l.acao === 'LOGIN' && l.ts && new Date(l.ts) >= hoje).length;
  const sete = Date.now() - 7 * DIA, ativos7 = new Set(logs.filter(l => l.acao === 'LOGIN' && l.ts && new Date(l.ts).getTime() >= sete).map(l => l.usuario)).size;
  const negados = logs.filter(l => (l.acao === 'ACESSO_NEGADO' || l.acao === 'ACESSO_BLOQUEADO') && l.ts && new Date(l.ts).getTime() >= sete).length;
  const sel = (k, opts, rot) => `<select onchange="BP.filtroLog('${k}',this.value)" class="border border-gray-300 rounded py-1.5 px-2 text-xs bg-white"><option value="">${rot}</option>${opts.map(o => `<option ${F[k] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const cor = a => a === 'LOGIN' || a === 'LOGOUT' ? 'bg-blue-100 text-tpv' : /NEGADO|BLOQUE|EXCLUIR|REMOVER/.test(a) ? 'bg-red-100 text-aoc' : /ACESSOS|LOGIN|PERFIL/.test(a) ? 'bg-yellow-100 text-yellow-700' : a.startsWith('LEITURA') ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600';
  const kpi = (t, v, c) => `<div class="bg-gray-50 border rounded-lg p-3"><div class="text-[10px] font-black uppercase text-gray-500">${t}</div><div class="text-2xl font-black ${c}">${v}</div></div>`;
  el.innerHTML = _cardP('Log de acessos e ações', 'history', `
    <div class="p-5 grid grid-cols-2 md:grid-cols-4 gap-3">${kpi('Entradas hoje', loginsHoje, 'text-tpv')}${kpi('Pessoas nos últimos 7 dias', ativos7, 'text-sidebar')}${kpi('Acessos negados (7 dias)', negados, negados ? 'text-[#c81e1e]' : 'text-green-700')}${kpi('Registros no log', logs.length, 'text-gray-700')}</div>
    <div class="px-5 pb-3 flex flex-wrap gap-2 items-center">${sel('usuario', usuarios, 'Todos os usuários')}${sel('acao', acoes, 'Todas as ações')}
      <label class="text-[10px] font-bold text-gray-500 uppercase">de</label><input type="date" value="${F.de}" onchange="BP.filtroLog('de',this.value)" class="border border-gray-300 rounded py-1 px-2 text-xs">
      <label class="text-[10px] font-bold text-gray-500 uppercase">até</label><input type="date" value="${F.ate}" onchange="BP.filtroLog('ate',this.value)" class="border border-gray-300 rounded py-1 px-2 text-xs">
      <input value="${esc(F.txt)}" onchange="BP.filtroLog('txt',this.value)" placeholder="Texto..." class="border border-gray-300 rounded py-1.5 px-3 text-xs">
      <button onclick="BP.filtroLog()" class="text-xs font-bold text-gray-500 hover:text-sidebar px-2">Limpar filtros</button>
      <span class="ml-auto text-xs font-bold text-gray-400">${lst.length} registro(s)</span>
      <button onclick="BP.exportarLogPerm()" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-1.5 px-3 rounded shadow flex items-center gap-2"><i data-lucide="download" class="w-3.5 h-3.5"></i> Exportar</button></div>
    <div class="overflow-x-auto max-h-[55vh] overflow-y-auto border-t border-gray-100"><table class="w-full text-left text-sm"><thead class="bg-gray-50 text-gray-500 text-[10px] uppercase sticky top-0"><tr><th class="p-3">Data / hora</th><th class="p-3">Usuário</th><th class="p-3">Ação</th><th class="p-3">Detalhe</th></tr></thead><tbody>
      ${lst.slice(0, 800).map(l => `<tr class="border-b border-gray-100"><td class="p-3 text-xs font-mono text-gray-500 whitespace-nowrap">${esc(l.hora || '')}</td><td class="p-3 font-mono font-bold text-sidebar">${esc(l.usuario || '—')}</td>
        <td class="p-3"><span class="text-[10px] font-black px-2 py-1 rounded-full ${cor(l.acao || '')}">${esc(l.acao || '—')}</span></td><td class="p-3 text-xs text-gray-600">${esc(l.detalhe || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="p-6 text-center text-xs text-gray-400">Nenhum registro.</td></tr>'}
      ${lst.length > 800 ? `<tr><td colspan="4" class="p-3 text-center text-[11px] text-gray-400">Mostrando 800 de ${lst.length} — use os filtros ou exporte.</td></tr>` : ''}</tbody></table></div>`);
  icones();
}
/* ações */
async function _salvarAcessos(acao, det) { acessos().atualizadoEm = Date.now(); await salvarBanco(); registrarLog(acao, det); renderPerm(); _aplicarMenu(); }
async function _salvarUsuario(u, acao, det) { u.atualizadoEm = Date.now(); await salvarBanco(); registrarLog(acao, det); renderPerm(); _aplicarMenu(); }
const _soKey = () => { if (ehKey()) return true; msgTopo('Só o Key User altera acessos.', true); return false; };
async function perfilAba(perfil, aba, on) {
  if (!_soKey()) return;
  const A = acessos(), l = A.perfis[perfil] || (A.perfis[perfil] = []);
  A.perfis[perfil] = on ? [...new Set([...l, aba])] : l.filter(x => x !== aba);
  await _salvarAcessos('ACESSOS_PERFIL', 'Perfil ' + perfil + ': ' + (on ? 'liberou' : 'tirou') + ' a aba ' + nomeAba(aba));
}
async function perfilNovo(p) { if (!_soKey() || !PERFIS_EDIT.includes(p)) return; acessos().perfilNovo = p; await _salvarAcessos('ACESSOS_PERFIL', 'Quem entra pela 1ª vez agora recebe o perfil ' + p); }
async function cadastrarLogin() {
  if (!_soKey()) return;
  const mat = ($('perm-mat').value || '').trim(), nome = ($('perm-nome').value || '').trim(), perfil = $('perm-perfil').value;
  if (!mat) { msgTopo('Informe a matrícula.', true); return; }
  if (!nome) { msgTopo('Informe o nome.', true); return; }
  if (!PERFIS_EDIT.includes(perfil)) return;
  let u = regDe(mat);
  if (u && !u.removido) { msgTopo('A matrícula ' + mat + ' já está cadastrada.', true); return; }
  if (!u) { u = { usuario: mat, fixo: false, primeiroAcesso: false }; dbData.usuarios.push(u); }
  Object.assign(u, { nome, perfil, bloqueado: false, removido: false, criadoPor: usuarioLogado.usuario });
  delete u.abas;
  await _salvarUsuario(u, 'CRIAR_LOGIN', 'Cadastrou ' + mat + ' (' + nome + ') — perfil ' + perfil);
  msgTopo('Login ' + mat + ' cadastrado. A senha é a da Plataforma MMT.');
}
async function perfilUsuario(mat, p) {
  if (!_soKey()) return; const u = regDe(mat); if (!u || u.perfil === 'Key User' || !PERFIS_EDIT.includes(p)) return;
  const antes = u.perfil; u.perfil = p;
  await _salvarUsuario(u, 'ACESSOS_USUARIO', mat + ': perfil ' + antes + ' → ' + p);
}
async function bloquearLogin(mat) {
  if (!_soKey()) return; const u = regDe(mat); if (!u || u.perfil === 'Key User') return;
  if (!u.bloqueado && !confirm('Bloquear o login ' + mat + ' (' + (u.nome || '') + ')?\nA pessoa não consegue mais usar o Buffer Control.')) return;
  u.bloqueado = !u.bloqueado;
  await _salvarUsuario(u, u.bloqueado ? 'BLOQUEAR_LOGIN' : 'DESBLOQUEAR_LOGIN', (u.bloqueado ? 'Bloqueou ' : 'Desbloqueou ') + mat);
}
async function removerLogin(mat) {
  if (!_soKey()) return; const u = regDe(mat); if (!u || u.perfil === 'Key User') return;
  if (!confirm('Excluir o login ' + mat + ' (' + (u.nome || '') + ') da lista?\nSe a pessoa entrar de novo pela Plataforma, volta com o perfil de quem entra pela 1ª vez.')) return;
  u.removido = true; u.bloqueado = false; delete u.abas;
  await _salvarUsuario(u, 'EXCLUIR_LOGIN', 'Excluiu o login ' + mat + ' (' + (u.nome || '') + ')');
}
function abasUsuario(mat) {
  if (!_soKey()) return; const u = regDe(mat); if (!u) return;
  const atuais = abasDe(u), proprio = Array.isArray(u.abas);
  _modal('Abas de ' + esc(mat) + ' · ' + esc(u.nome || ''), `<div class="text-xs text-gray-600 mb-3">Marque as abas que esta pessoa pode ver. Hoje ${proprio ? 'ela tem uma lista <b>personalizada</b>' : 'vale o padrão do perfil <b>' + esc(u.perfil) + '</b>'}.</div>
    <div class="grid grid-cols-2 gap-2 mb-4">${ABAS.map(([id, n]) => `<label class="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm font-bold text-sidebar"><input type="checkbox" class="bp-aba-u w-4 h-4 accent-[#005b9f]" value="${id}" ${atuais.includes(id) ? 'checked' : ''}> ${n}</label>`).join('')}</div>
    <div class="flex justify-between gap-2 border-t pt-3"><button onclick="BP.salvarAbasUsuario('${esc(mat)}',true)" class="px-3 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded">Usar o padrão do perfil ${esc(u.perfil)}</button>
      <div class="flex gap-2"><button onclick="BP.fecharModal()" class="px-4 py-2 text-sm font-bold text-gray-600">Cancelar</button><button onclick="BP.salvarAbasUsuario('${esc(mat)}')" class="px-4 py-2 text-sm font-bold bg-tpv text-white rounded">Salvar</button></div></div>`);
}
async function salvarAbasUsuario(mat, padrao) {
  if (!_soKey()) return; const u = regDe(mat); if (!u) return;
  if (padrao) delete u.abas; else u.abas = [...document.querySelectorAll('.bp-aba-u:checked')].map(i => i.value);
  _fecharModal();
  await _salvarUsuario(u, 'ACESSOS_USUARIO', mat + ': ' + (padrao ? 'voltou ao padrão do perfil ' + u.perfil : 'abas = ' + (u.abas.map(nomeAba).join(', ') || 'nenhuma')));
}
function exportarLogPerm() {
  const linhas = _logsFiltrados().map(l => ({ 'Data/Hora': l.hora || '', 'Usuário': l.usuario || '', 'Ação': l.acao || '', 'Detalhe': l.detalhe || '' }));
  const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ 'Data/Hora': '', 'Usuário': '', 'Ação': '', 'Detalhe': '' }]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Log de acessos');
  XLSX.writeFile(wb, 'log_acessos_buffer_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

/* ═════════════════════════ INICIALIZAÇÃO ═════════════════════════ */
window.BP = { fecharModal: _fecharModal, aplicarVinculo, trocarVaga, moverPara, alocarSemVaga, verReorganizacao, editarLayout,
  reabrirLayout: () => editarLayout(window.__bpLay), ciclarCelula, salaPadrao: SALA_PADRAO, verVaga, renderSala: () => renderSalaTab(),
  salvarLayout, tv: abrirTV, fecharTV, verNaSala, backupAgora, sala3d, sugerirVaga, avaliarVagas, ocupacao, opDaEtiqueta,
  fecharGuardar, escolherVaga: id => escolherNoGuardar(id), abrir3DTela, fechar3DTela,
  perfilAba, perfilNovo, cadastrarLogin, perfilUsuario, bloquearLogin, removerLogin, abasUsuario, salvarAbasUsuario, exportarLogPerm,
  buscaPerm: v => { _permBusca = v; renderPerm(); const i = document.querySelector('#aba-PERM input[placeholder^="Buscar"]'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } },
  filtroLog: (k, v) => { if (!k) _logFiltro = { usuario: '', acao: '', de: '', ate: '', txt: '' }; else _logFiltro[k] = v || ''; renderPermLog(); } };

/* ═════════════════ [7] v8.3 — ALERTA DE HORAS · TV EM PÁGINAS · BUSCA · ESTRATÉGIA ═════════════
   · Alerta de envelhecimento: palete parado há mais de X horas (sala.alertaHoras,
     padrão 24 h, o Key User muda na aba Estratégia). Cor "envelhecimento (horas)"
     vai do verde ao vermelho aos poucos.
   · Modo TV troca sozinho a cada 20 s: sala 3D → indicadores → próximos a sair.
   · Busca rápida na aba da sala: OP ou LPN + Enter leva a câmera até o palete.
   · Aba Estratégia (só Key User): mapa de calor de uso, relatório do turno e
     previsão de lotação.
   · Histórico de uso das vagas: dbData.usoVagas (append-only por id, igual às
     leituras; vai para sistema/outros.json). Guarda 120 dias.                  */
const ALERTA_H_PADRAO = 24;
const alertaH = () => Math.max(1, Number(dbData.sala && dbData.sala.alertaHoras) || ALERTA_H_PADRAO);
const horasPalete = it => it.ts ? Math.max(0, (Date.now() - it.ts) / 3600000) : 0;
/* verde (0 h) → amarelo (metade) → vermelho (X h ou mais), sem degraus */
function corHoras(h) { const t = Math.min(1, Math.max(0, h / alertaH())); return 'hsl(' + Math.round(140 * (1 - t)) + ',75%,' + Math.round(45 + 5 * (1 - t)) + '%)'; }
const fH = h => h < 48 ? Math.floor(h) + ' h' : Math.floor(h / 24) + ' d ' + Math.floor(h % 24) + ' h';
/* paletes (1 por vaga) parados há mais de X horas, do mais velho para o mais novo */
function paletesVelhos(oc) {
  oc = oc || ocupacao();
  const lim = alertaH();
  return [...Object.values(oc.mapa).flat(), ...oc.semVaga].map(x => Object.assign({}, x, { h: horasPalete(x) }))
    .filter(x => x.h >= lim).sort((a, b) => b.h - a.h);
}
function _renderAlertaHoras(oc) {
  const el = $('bp-alerta-h'); if (!el) return;
  const v = paletesVelhos(oc);
  el.innerHTML = v.length ? `<div class="mb-4 rounded-xl border-2 border-[#c81e1e] bg-red-50 p-3 flex flex-wrap items-center gap-3">
      <i data-lucide="alarm-clock" class="w-5 h-5 text-[#c81e1e]"></i>
      <div class="text-sm font-black text-[#c81e1e]">${v.length} palete(s) parado(s) há mais de ${alertaH()} h</div>
      <div class="flex flex-wrap gap-2">${v.slice(0, 8).map(x => `<button onclick="BP.buscarPalete('${esc(x.lpn)}')" class="text-xs font-bold bg-white border border-red-300 rounded px-2 py-1 hover:bg-red-100"><span class="font-mono">${esc(x.vaga || 'sem vaga')}</span> · OP ${esc(x.op)} · ${fH(x.h)}</button>`).join('')}${v.length > 8 ? `<span class="text-xs text-gray-500 self-center">+${v.length - 8}</span>` : ''}</div></div>` : '';
  icones();
}
/* aviso no canto da tela quando um palete passa do limite (uma vez por palete) */
const _avisados = new Set();
function _conferirVelhos() {
  if (!usuarioLogado || !_iniciado || bloqueado() || guardarAberto()) return;
  const novos = paletesVelhos().filter(x => !_avisados.has(x.lpn));
  if (!novos.length) return;
  const primeira = !_conferirVelhos._ok; _conferirVelhos._ok = true;
  novos.forEach(x => _avisados.add(x.lpn));
  if (primeira) return;                       // ao abrir o sistema não avisa os que já estavam velhos (o aviso fica na sala)
  msgTopo('⏰ ' + (novos.length === 1 ? 'Palete ' + (novos[0].vaga || novos[0].lpn) + ' (OP ' + novos[0].op + ')' : novos.length + ' paletes') + ' parado(s) há mais de ' + alertaH() + ' h no buffer.', true);
}

/* ── Modo TV em páginas: troca sozinho a cada 20 s ── */
const TV_PAGINAS = ['Sala 3D', 'Indicadores', 'Próximos a sair'];
const TV_TROCA_MS = 20000;
let _tvPag = 0;
function _renderPaginasTV(oc, k, al) {
  const pag = $('bp-tv-pag'), dots = $('bp-tv-dots'); if (!pag) return;
  dots.innerHTML = TV_PAGINAS.map((t, i) => `<span class="px-3 py-1 rounded-full text-xs font-black ${i === _tvPag ? 'bg-sky-400 text-[#060b16]' : 'bg-white/10 text-white/50'}">${t}</span>`).join('');
  if (_tvPag === 0) { pag.classList.add('hidden'); return; }
  pag.classList.remove('hidden');
  if (_tvPag === 1) {
    const c = (t, v, cor, sub) => `<div class="bg-white/5 rounded-2xl p-6 flex flex-col justify-center"><div class="text-lg font-black uppercase tracking-widest text-white/50">${t}</div><div class="text-8xl font-black ${cor} leading-none my-2">${v}</div>${sub ? `<div class="text-xl font-bold text-white/50">${sub}</div>` : ''}</div>`;
    pag.innerHTML = `<div class="h-full flex flex-col gap-6"><div class="grid grid-cols-3 gap-6 flex-1">
        ${c('Ocupação', k.pct + '%', k.pct > 90 ? 'text-red-400' : 'text-white', k.ocup + ' de ' + k.tot + ' vagas')}${c('Vagas livres', k.livres, 'text-green-400')}${c('Paletes no buffer', k.mags, 'text-sky-300')}
        ${c('IM hoje', k.hojeIM, 'text-orange-300')}${c('IM atrasada', k.atras, 'text-red-400')}${c('Parados > ' + alertaH() + ' h', paletesVelhos(oc).length, 'text-red-400')}</div>
      <div class="bg-white/5 rounded-2xl px-6 py-4">${al.length ? al.map(t => `<div class="text-2xl font-bold text-red-300 py-1">● ${esc(t)}</div>`).join('') : '<div class="text-2xl font-bold text-green-400">Tudo em ordem ✓</div>'}</div></div>`;
  } else {
    const ord = paletesRetirada(oc).slice(0, 10);
    pag.innerHTML = `<div class="text-3xl font-black uppercase tracking-widest text-sky-300 mb-4">Próximos a sair · FIFO pela data da IM</div>
      ${ord.length ? '<div class="grid grid-cols-2 gap-x-8">' + ord.map((x, i) => `<div class="flex items-center gap-5 py-3 border-b border-white/10 ${i === 0 ? 'text-sky-200' : ''}">
        <span class="text-3xl font-black text-white/30 w-10">${i + 1}</span><span class="font-mono font-black text-5xl w-56 whitespace-nowrap">${esc(x.vaga || '—')}</span>
        <div class="flex-1 min-w-0"><div class="text-2xl font-black">OP ${esc(x.op)}</div><div class="text-lg text-white/60 truncate">${esc(x.modelo || '')} · ${fQ(x.q)} placas</div></div>
        <div class="text-right"><div class="text-xl font-bold">${esc(x.linhaIM || '—')}</div><div class="text-lg text-white/50">${esc(x.dataIMtxt || 's/ plano')}</div></div></div>`).join('') + '</div>'
        : '<div class="text-3xl text-white/40">Buffer vazio</div>'}`;
  }
}

/* ── busca rápida: OP ou LPN → câmera vai até o palete ── */
function buscarPalete(txt) {
  txt = String(txt || '').trim().toUpperCase();
  const bh = $('bp-busca-hist'); if (bh) bh.classList.add('hidden');
  if (!txt) { sala3d.destacar(null); return; }
  if ($('aba-SALA') && !$('aba-SALA').classList.contains('active')) mudarAba('SALA');
  const oc = ocupacao(), todos = [...Object.values(oc.mapa).flat(), ...oc.semVaga];
  const op = /^\d{7}/.test(txt) ? txt.slice(0, 7) : null;
  let achados = todos.filter(x => String(x.lpn).toUpperCase() === txt);
  if (!achados.length && op) achados = todos.filter(x => x.op === op);
  if (!achados.length && txt.length >= 4) achados = todos.filter(x => String(x.lpn).toUpperCase().includes(txt));
  if (!achados.length) { sala3d.destacar(null); msgTopo('Nenhum palete com "' + txt + '" dentro do buffer.', true); return; }
  achados.sort((a, b) => chaveIM(a) - chaveIM(b) || a.ts - b.ts);
  const x = achados[0];
  if ($('bp-busca') && !$('bp-busca').value) $('bp-busca').value = txt;
  if (bh) { bh.dataset.lpn = x.lpn; bh.classList.remove('hidden'); bh.title = 'Linha do tempo do LPN ' + x.lpn; }
  if (!x.vaga) { sala3d.destacar(null); msgTopo('LPN ' + x.lpn + ' (OP ' + x.op + ') está no buffer, mas SEM VAGA. Use "Alocar sem vaga".', true); return; }
  setTimeout(() => sala3d.destacar(x.vaga), $('bp-3d') && $('bp-3d').firstChild ? 0 : 900);
  const outras = [...new Set(achados.slice(1).map(a => a.vaga).filter(Boolean))];
  msgTopo('Palete em ' + x.vaga + ' · OP ' + x.op + (outras.length ? ' · a OP também está em: ' + outras.slice(0, 5).join(', ') : ''));
}

/* ── histórico de uso das vagas (para o mapa de calor) ── */
const USO_DIAS = 120;
let _motivoUso = '';
function _registrarUso(lpn, vaga, op, auto) {
  const motivo = _motivoUso; _motivoUso = '';
  if (!Array.isArray(dbData.usoVagas)) dbData.usoVagas = [];
  const ant = dbData.vagas[lpn] && dbData.vagas[lpn].vaga;
  if ((vaga || null) === (ant || null)) return;
  dbData.usoVagas.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), lpn, op: op || '', vaga: vaga || null, de: ant || null, ts: Date.now(),
    auto: !!auto, motivo: motivo || '', por: usuarioLogado ? usuarioLogado.usuario : '' });
  const lim = Date.now() - USO_DIAS * DIA;
  if (dbData.usoVagas.length && dbData.usoVagas[0].ts < lim) dbData.usoVagas = dbData.usoVagas.filter(u => u.ts >= lim);
}
/* mescla entre PCs: append-only por id (ninguém perde o histórico do outro PC) */
const _mesclarUsoOrig = _mesclarBanco;
_mesclarBanco = function (remoto) {
  const local = dbData, out = _mesclarUsoOrig(remoto), m = {};
  (remoto.usoVagas || []).forEach(u => { m[u.id] = u; });
  (local.usoVagas || []).forEach(u => { if (!m[u.id]) m[u.id] = u; });
  out.usoVagas = Object.values(m).sort((a, b) => a.ts - b.ts);
  return out;
};
/* uso de cada vaga no período: nº de paletes guardados e horas ocupadas.
   Paletes que já estavam na vaga antes do histórico existir contam a partir da entrada. */
function usoPorVaga(dias) {
  const fim = Date.now(), ini = fim - dias * DIA, r = {};
  const add = (vaga, a, b, conta) => {
    if (!vaga) return; const x = r[vaga] || (r[vaga] = { paletes: 0, horas: 0 });
    const s = Math.max(a, ini), e = Math.min(b, fim);
    if (e > s) x.horas += (e - s) / 3600000;
    if (conta && a >= ini) x.paletes++;
  };
  const porLpn = {};
  (dbData.usoVagas || []).forEach(u => (porLpn[u.lpn] = porLpn[u.lpn] || []).push(u));
  Object.values(porLpn).forEach(l => {
    l.sort((a, b) => a.ts - b.ts);
    l.forEach((u, i) => { const prox = l[i + 1]; if (u.vaga) add(u.vaga, u.ts, prox ? prox.ts : fim, !u.de); });
  });
  // paletes que estão na sala e não têm histórico ainda
  const dentro = bufferAgora();
  dentro.forEach(it => { if (porLpn[it.lpn]) return; const reg = dbData.vagas[it.lpn]; if (reg && reg.vaga) add(reg.vaga, it.ts || reg.em || fim, fim, true); });
  return r;
}

/* ── turnos (para o relatório) — sala.turnos, editável na aba Estratégia ── */
const TURNOS_PADRAO = [{ nome: '1º turno', ini: '06:00', fim: '14:00' }, { nome: '2º turno', ini: '14:00', fim: '22:00' }, { nome: '3º turno', ini: '22:00', fim: '06:00' }];
const turnos = () => (Array.isArray(dbData.sala && dbData.sala.turnos) && dbData.sala.turnos.length ? dbData.sala.turnos : TURNOS_PADRAO);
function janelaTurno(t, dia) {          // dia = 'AAAA-MM-DD' (data em que o turno começa)
  const [a, m, d] = dia.split('-').map(Number), hm = s => s.split(':').map(Number);
  const [h1, m1] = hm(t.ini), [h2, m2] = hm(t.fim);
  const ini = new Date(a, m - 1, d, h1, m1).getTime();
  let fim = new Date(a, m - 1, d, h2, m2).getTime(); if (fim <= ini) fim += DIA;
  return { ini, fim };
}
function turnoAtual() {
  const agora = Date.now(), hoje = new Date(), iso = dt => dt.getFullYear() + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate());
  const ontem = new Date(agora - DIA);
  for (const dia of [iso(hoje), iso(ontem)]) for (let i = 0; i < turnos().length; i++) { const j = janelaTurno(turnos()[i], dia); if (agora >= j.ini && agora < j.fim) return { i, dia }; }
  return { i: 0, dia: iso(hoje) };
}
/* números do turno: entradas, saídas, quebras de FIFO e tempo médio no buffer */
function relatorioTurno(ini, fim) {
  const ls = _leiturasComTs().filter(l => l.lpn).sort((a, b) => a._ts - b._ts);
  const ent = [], sai = [], dentro = {}, quebras = [], tempos = [];
  ls.forEach(l => {
    const t = _tipoLeitura(l);
    if (t === 'entrada') {
      if (l._ts >= ini && l._ts < fim) ent.push(l);
      dentro[l.lpn] = { op: l.op, ts: l._ts };
      return;
    }
    const d = dentro[l.lpn];
    if (l._ts >= ini && l._ts < fim) {
      sai.push(l);
      if (d) tempos.push((l._ts - d.ts) / 3600000);
      // quebra de FIFO na saída: saiu antes de outro palete que ia para a IM num dia anterior
      const k = chaveIM(infoOP(l.op));
      const antes = Object.entries(dentro).filter(([lpn, x]) => lpn !== l.lpn && chaveIM(infoOP(x.op)) + DIA <= k);
      if (antes.length) quebras.push({ lpn: l.lpn, op: l.op, ts: l._ts, n: antes.length });
    }
    delete dentro[l.lpn];
  });
  const porHora = {};
  for (let t = ini; t < fim; t += 3600000) porHora[new Date(t).getHours()] = { e: 0, s: 0 };
  ent.forEach(l => { const h = new Date(l._ts).getHours(); if (porHora[h]) porHora[h].e++; });
  sai.forEach(l => { const h = new Date(l._ts).getHours(); if (porHora[h]) porHora[h].s++; });
  const soma = a => a.reduce((s, l) => s + (Number(l.qtd) || 0), 0);
  return { ent, sai, quebras, tempos, porHora, placasE: soma(ent), placasS: soma(sai),
    medio: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null, bloqueiosAgora: bloqueios().length };
}

/* ── previsão de lotação: paletes de hoje + o que o SMT ainda vai mandar − o que a IM vai puxar ── */
const PREV_DIAS = 14;
function previsaoLotacao() {
  const oc = ocupacao(), k = _kpisSala(oc), cap = k.tot, hoje = _hoje0();
  const dia = t => Math.max(0, Math.floor((t - hoje) / DIA));           // atrasado conta para hoje
  // tamanho médio do palete (placas) nos últimos 30 dias de entrada
  const ult = _leiturasComTs().filter(l => _tipoLeitura(l) === 'entrada' && l._ts > Date.now() - 30 * DIA && Number(l.qtd) > 0);
  const medioPal = ult.length ? ult.reduce((s, l) => s + Number(l.qtd), 0) / ult.length : (Number(dbData.sala.placasMag) || 50) * 6;
  const entra = Array(PREV_DIAS).fill(0), sai = Array(PREV_DIAS).fill(0), semIM = { n: 0 };
  // o que já está dentro sai no dia da IM
  [...Object.values(oc.mapa).flat(), ...oc.semVaga].forEach(x => { if (x.dataIM != null) { const d = dia(x.dataIM); if (d < PREV_DIAS) sai[d]++; } });
  // o que o SMT ainda vai mandar (plano SMT com data), sai no dia da IM daquela OP
  const detalhe = [];
  (dbData.ops || []).forEach(o => {
    const dSMT = _dataPlanoObj(o.data); if (!dSMT) return;
    const falta = (Number(o.total) || 0) - recebidoDaOP(o.numero, 'entrada');
    if (falta <= 0) return;
    const d = dia(dSMT.getTime()); if (d >= PREV_DIAS) return;
    const n = Math.max(1, Math.ceil(falta / medioPal));
    entra[d] += n;
    const im = infoOP(o.numero);
    if (im.dataIM != null) { const di = Math.max(d, dia(im.dataIM)); if (di < PREV_DIAS) sai[di] += n; } else semIM.n += n;
    detalhe.push({ op: o.numero, modelo: o.modelo || '', dia: d, n, im: im.dataIMtxt || '' });
  });
  const ocup = []; let atual = k.ocup + oc.semVaga.length;
  for (let d = 0; d < PREV_DIAS; d++) { atual = Math.max(0, atual + entra[d] - sai[d]); ocup.push(atual); }
  const lota = ocup.findIndex(v => v >= cap), alerta = ocup.findIndex(v => v >= cap * 0.9);
  return { cap, ocup, entra, sai, lota, alerta, medioPal, semIM: semIM.n, detalhe, hoje, agora: k.ocup + oc.semVaga.length };
}

/* ── a aba Estratégia (só Key User) ── */
function _montarAbaEstrat() {
  if ($('aba-ESTRAT')) return;
  const ref = $('nav-PERM') || $('nav-ACESSOS');
  if (ref) {
    const b = document.createElement('button');
    b.id = 'nav-ESTRAT'; b.className = 'nav-item w-full flex items-center px-6 py-3.5 text-sm text-left outline-none';
    b.setAttribute('onclick', "mudarAba('ESTRAT')");
    b.innerHTML = '<i data-lucide="target" class="w-5 h-5 mr-3 opacity-80"></i> Estratégia';
    ref.parentNode.insertBefore(b, ref.nextSibling);
  }
  const main = document.querySelector('#main-app main'); if (!main) return;
  const d = document.createElement('div');
  d.id = 'aba-ESTRAT'; d.className = 'tab-content w-full mx-auto max-w-[1500px]';
  main.appendChild(d);
}
let _est = { dias: 30, medida: 'horas', turno: null, dia: null, semanas: 4 };
const _graf = {};
function _grafico(id, cfg) {
  if (_graf[id]) { try { _graf[id].destroy(); } catch (e) {} }
  const c = $(id); if (!c || typeof Chart === 'undefined') return;
  _graf[id] = new Chart(c, cfg);
}
const fD = t => { const d = new Date(t); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1); };
function renderEstrat() {
  const d = $('aba-ESTRAT'); if (!d) return;
  if (!ehKey()) { d.innerHTML = '<div class="p-6 text-sm font-bold text-[#c81e1e]">Só o Key User acessa esta aba.</div>'; return; }
  if (!_est.dia) { const t = turnoAtual(); _est.turno = t.i; _est.dia = t.dia; }
  const S = dbData.sala, inp = 'border rounded px-2 py-1.5 text-xs font-bold bg-white';
  d.innerHTML = `
    <div class="flex flex-wrap justify-between items-center gap-3 mb-4">
      <h2 class="text-2xl font-bold text-sidebar flex items-center"><i data-lucide="target" class="mr-2 text-tpv"></i> Estratégia do Buffer</h2>
      <div class="flex items-center gap-2 text-xs font-bold text-gray-600">Alerta de palete parado após
        <input type="number" min="1" max="720" value="${alertaH()}" onchange="BP.salvarAlertaHoras(this.value)" class="${inp} w-20"> horas</div></div>
    ${_cardP('Previsão de lotação · próximos ' + PREV_DIAS + ' dias', 'trending-up', '<div id="bp-est-prev" class="p-5"></div>')}
    ${_cardP('Ocupação ao longo dos dias', 'line-chart', '<div id="bp-est-ocup" class="p-5"></div>', `<div class="ml-auto flex items-center gap-2">
        <select onchange="BP.estOcup('semanas',this.value)" class="${inp}">${[4, 8, 12].map(n => `<option value="${n}" ${n === _est.semanas ? 'selected' : ''}>Últimas ${n} semanas</option>`).join('')}</select>
        <span class="text-xs font-bold text-gray-500">Meta</span><input type="number" min="1" max="100" value="${metaOcup()}" onchange="BP.salvarMeta(this.value)" class="${inp} w-16"><span class="text-xs font-bold text-gray-500">%</span></div>`)}
    ${_cardP('Relatório do turno', 'clipboard-check', '<div id="bp-est-turno" class="p-5"></div>', `<div class="ml-auto flex flex-wrap items-center gap-2">
        <select onchange="BP.estTurno(this.value)" class="${inp}">${turnos().map((t, i) => `<option value="${i}" ${i === _est.turno ? 'selected' : ''}>${esc(t.nome)} (${t.ini}–${t.fim})</option>`).join('')}</select>
        <input type="date" value="${_est.dia}" onchange="BP.estDia(this.value)" class="${inp}">
        <button onclick="BP.editarTurnos()" class="${inp} hover:bg-gray-50">Horários</button>
        <button onclick="BP.imprimirTurno()" class="bg-sidebar text-white text-xs font-bold py-1.5 px-3 rounded flex items-center gap-1"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Imprimir</button>
        <button onclick="BP.gerarPdfAgora()" class="bg-tpv text-white text-xs font-bold py-1.5 px-3 rounded flex items-center gap-1"><i data-lucide="file-down" class="w-3.5 h-3.5"></i> Gerar PDF</button>
        <button onclick="BP.alternarPdfAuto()" title="Gera o PDF sozinho no fim de cada turno e salva em Relatórios\\AAAA-MM (precisa de um PC com o sistema aberto)" class="text-xs font-black py-1.5 px-3 rounded border ${S.relAuto ? 'bg-green-600 text-white border-green-700' : 'bg-white text-gray-600 border-gray-300'}">⚙ Automático: ${S.relAuto ? 'LIGADO' : 'DESLIGADO'}</button></div>`)}
    ${_cardP('Mapa de calor de uso das vagas', 'flame', '<div id="bp-est-calor" class="p-5"></div>', `<div class="ml-auto flex items-center gap-2">
        <select onchange="BP.estCalor('dias',this.value)" class="${inp}">${[7, 30, 90].map(n => `<option value="${n}" ${n === _est.dias ? 'selected' : ''}>Últimos ${n} dias</option>`).join('')}</select>
        <select onchange="BP.estCalor('medida',this.value)" class="${inp}"><option value="horas" ${_est.medida === 'horas' ? 'selected' : ''}>Horas ocupada</option><option value="paletes" ${_est.medida === 'paletes' ? 'selected' : ''}>Nº de paletes</option></select></div>`)}`;
  _renderPrevisao(); _renderOcupacao(); _renderTurno(); _renderCalor();
  icones();
}
function _renderPrevisao() {
  const el = $('bp-est-prev'); if (!el) return;
  const P = previsaoLotacao(), dia = i => fD(P.hoje + i * DIA);
  const msg = P.lota >= 0 ? `<div class="rounded-lg bg-red-50 border-2 border-[#c81e1e] p-3 text-sm font-black text-[#c81e1e]">⚠ O buffer deve LOTAR em ${dia(P.lota)} (${P.lota === 0 ? 'hoje' : 'daqui a ' + P.lota + ' dia(s)'}) — previsão de ${P.ocup[P.lota]} paletes para ${P.cap} vagas.</div>`
    : P.alerta >= 0 ? `<div class="rounded-lg bg-orange-50 border-2 border-orange-400 p-3 text-sm font-black text-orange-700">Atenção: acima de 90% em ${dia(P.alerta)} (${P.ocup[P.alerta]} de ${P.cap} vagas).</div>`
    : `<div class="rounded-lg bg-green-50 border-2 border-green-600 p-3 text-sm font-black text-green-700">Sem risco de lotar nos próximos ${PREV_DIAS} dias (pico de ${Math.max(...P.ocup)} de ${P.cap} vagas).</div>`;
  el.innerHTML = `${msg}
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 mt-4"><div class="min-w-0" style="height:280px"><canvas id="bp-g-prev"></canvas></div>
    <div class="text-xs text-gray-600 space-y-1 min-w-0">
      <div><b>Hoje no buffer:</b> ${P.agora} palete(s) · <b>${P.cap}</b> vagas</div>
      <div><b>Palete médio:</b> ${fQ(Math.round(P.medioPal))} placas (entradas dos últimos 30 dias)</div>
      <div><b>Vão entrar:</b> ${P.entra.reduce((a, b) => a + b, 0)} palete(s) (plano SMT com data, saldo que falta)</div>
      ${P.semIM ? `<div class="text-orange-700 font-bold">${P.semIM} palete(s) previsto(s) sem plano de IM — ficam no buffer até ter plano.</div>` : ''}
      <div class="text-gray-400 pt-1">Estimativa: OP atrasada conta como hoje; o palete sai no dia da IM da OP; sem plano de IM não sai.</div></div></div>`;
  _grafico('bp-g-prev', { data: { labels: P.ocup.map((_, i) => dia(i)), datasets: [
      { type: 'bar', label: 'Paletes previstos', data: P.ocup, backgroundColor: P.ocup.map(v => v >= P.cap ? '#ef4444' : v >= P.cap * 0.9 ? '#f97316' : '#005b9f'), borderRadius: 4, order: 2 },
      { type: 'line', label: 'Vagas da sala', data: P.ocup.map(() => P.cap), borderColor: '#c81e1e', borderDash: [6, 4], pointRadius: 0, borderWidth: 2, order: 1 },
      { type: 'line', label: 'Entram', data: P.entra, borderColor: '#22c55e', backgroundColor: '#22c55e', tension: .3, borderWidth: 2, pointRadius: 2, order: 0 },
      { type: 'line', label: 'Saem (IM)', data: P.sai, borderColor: '#eab308', backgroundColor: '#eab308', tension: .3, borderWidth: 2, pointRadius: 2, order: 0 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { y: { beginAtZero: true } } } });
}
function _janelaEst() { return janelaTurno(turnos()[_est.turno] || turnos()[0], _est.dia); }
function _renderTurno() {
  const el = $('bp-est-turno'); if (!el) return;
  const j = _janelaEst(), R = relatorioTurno(j.ini, j.fim), t = turnos()[_est.turno] || turnos()[0];
  const kp = (rot, v, cor, sub) => `<div class="bg-gray-50 rounded-xl border p-3"><div class="text-[10px] font-black uppercase text-gray-500">${rot}</div><div class="text-2xl font-black ${cor}">${v}</div>${sub ? `<div class="text-[10px] text-gray-400 font-bold">${sub}</div>` : ''}</div>`;
  el.innerHTML = `<div class="text-xs font-bold text-gray-500 mb-3">${esc(t.nome)} · ${new Date(j.ini).toLocaleString('pt-BR')} até ${new Date(j.fim).toLocaleString('pt-BR')}${j.fim > Date.now() ? ' <span class="text-orange-600">(turno em andamento)</span>' : ''}</div>
    <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
      ${kp('Entradas', R.ent.length, 'text-tpv', fQ(R.placasE) + ' placas')}${kp('Saídas', R.sai.length, 'text-green-700', fQ(R.placasS) + ' placas')}
      ${kp('Quebras de FIFO na saída', R.quebras.length, R.quebras.length ? 'text-[#c81e1e]' : 'text-green-700', 'saiu antes de quem ia para a IM primeiro')}
      ${kp('Tempo médio no buffer', R.medio == null ? '—' : fH(R.medio), 'text-sidebar', R.tempos.length + ' palete(s) que saíram')}
      ${kp('Quebras de FIFO na sala agora', R.bloqueiosAgora, R.bloqueiosAgora ? 'text-[#c81e1e]' : 'text-green-700')}</div>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div class="min-w-0" style="height:240px"><canvas id="bp-g-hora"></canvas></div><div class="min-w-0" style="height:240px"><canvas id="bp-g-tempo"></canvas></div></div>
    ${R.quebras.length ? `<div class="mt-3 text-xs"><b class="text-[#c81e1e]">Saídas fora da ordem:</b> ${R.quebras.slice(0, 12).map(q => `<span class="inline-block bg-red-50 border border-red-200 rounded px-2 py-0.5 m-0.5 font-mono">${esc(q.lpn)} · OP ${esc(q.op)} · ${new Date(q.ts).toLocaleTimeString('pt-BR').slice(0, 5)} (${q.n} na frente)</span>`).join('')}</div>` : ''}`;
  const hs = Object.keys(R.porHora).map(Number).sort((a, b) => ((a - new Date(j.ini).getHours() + 24) % 24) - ((b - new Date(j.ini).getHours() + 24) % 24));
  _grafico('bp-g-hora', { type: 'bar', data: { labels: hs.map(h => p2(h) + 'h'), datasets: [
      { label: 'Entradas', data: hs.map(h => R.porHora[h].e), backgroundColor: '#005b9f', borderRadius: 3 },
      { label: 'Saídas', data: hs.map(h => R.porHora[h].s), backgroundColor: '#22c55e', borderRadius: 3 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { title: { display: true, text: 'Paletes por hora' }, legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  const faixas = [['< 4 h', 0, 4], ['4–8 h', 4, 8], ['8–24 h', 8, 24], ['1–2 d', 24, 48], ['2–5 d', 48, 120], ['> 5 d', 120, 1e9]];
  _grafico('bp-g-tempo', { type: 'bar', data: { labels: faixas.map(f => f[0]), datasets: [{ label: 'Paletes', data: faixas.map(f => R.tempos.filter(x => x >= f[1] && x < f[2]).length), backgroundColor: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#991b1b'], borderRadius: 3 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { title: { display: true, text: 'Tempo no buffer de quem saiu no turno' }, legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
}
function _renderCalor() {
  const el = $('bp-est-calor'); if (!el) return;
  const S = dbData.sala, oc = ocupacao(), U = usoPorVaga(_est.dias), med = _est.medida;
  const val = id => U[id] ? (med === 'horas' ? U[id].horas : U[id].paletes) : 0;
  const ids = oc.vagas.map(v => v.id), max = Math.max(1, ...ids.map(val));
  const cor = v => { if (!v) return '#f1f5f9'; const t = v / max; return 'hsl(' + Math.round(50 - 50 * t) + ',90%,' + Math.round(88 - 40 * t) + '%)'; };
  const fmt = v => med === 'horas' ? (v >= 24 ? Math.round(v / 24) + ' d' : Math.round(v) + ' h') : String(v);
  let h = '<table class="text-[11px] border-separate" style="border-spacing:3px"><tbody>';
  for (let p = S.posicoes; p >= 1; p--) {
    h += `<tr><td class="pr-2 font-bold text-gray-500 whitespace-nowrap">POS ${p2(p)}</td>`;
    for (let r = 1; r <= S.ruas; r++) {
      const id = idVaga(r, p), v = oc.porId[id];
      if (!v) { h += `<td style="height:40px;min-width:58px;background:${tipoCelula(S, r, p) === 'corredor' ? '#dbeafe' : '#fff'};border:1px dotted #ddd"></td>`; continue; }
      const x = val(id);
      h += `<td title="${esc(nomeVaga(id))} · ${U[id] ? fQ(U[id].paletes) + ' palete(s) · ' + Math.round(U[id].horas) + ' h ocupada' : 'sem uso'}" style="height:40px;min-width:58px;text-align:center;background:${cor(x)};border:1px solid ${v.retrab ? '#a855f7' : '#e2e8f0'};line-height:1.1">
        <div class="font-mono font-black text-gray-800">${id.replace('-', ' ')}</div><div class="font-bold text-gray-700">${x ? fmt(x) : '—'}</div></td>`;
    }
    h += '</tr>';
  }
  h += '<tr><td></td>' + Array.from({ length: S.ruas }, (_, i) => `<td class="text-center pt-1 font-bold text-gray-500">Rua ${p2(i + 1)}</td>`).join('') + '</tr></tbody></table>';
  // total por rua
  const ruas = Array.from({ length: S.ruas }, (_, i) => { const vs = oc.vagas.filter(v => v.r === i + 1 && !v.retrab); return { r: i + 1, tot: vs.reduce((s, v) => s + val(v.id), 0), n: vs.length }; });
  const semHist = !(dbData.usoVagas || []).length;
  el.innerHTML = `${semHist ? '<div class="mb-3 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">O histórico de uso começou a ser gravado agora (v8.3). Por enquanto o mapa mostra só os paletes que estão na sala; ele fica completo com o passar dos dias.</div>' : ''}
    <div class="overflow-x-auto">${h}</div>
    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 mt-4"><div class="min-w-0" style="height:220px"><canvas id="bp-g-ruas"></canvas></div>
    <div class="text-xs text-gray-600 space-y-1">${_dicasCalor(ruas, med)}</div></div>`;
  _grafico('bp-g-ruas', { type: 'bar', data: { labels: ruas.map(x => 'Rua ' + p2(x.r)), datasets: [{ label: med === 'horas' ? 'Horas ocupada (média por vaga)' : 'Paletes (média por vaga)', data: ruas.map(x => x.n ? +(x.tot / x.n).toFixed(1) : 0), backgroundColor: ruas.map(x => { const m = Math.max(1, ...ruas.map(y => y.n ? y.tot / y.n : 0)); return cor((x.n ? x.tot / x.n : 0) / m * max); }), borderColor: '#94a3b8', borderWidth: 1, borderRadius: 3 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { title: { display: true, text: 'Uso médio por rua' }, legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
}
function _dicasCalor(ruas, med) {
  const m = ruas.filter(x => x.n).map(x => ({ r: x.r, v: x.tot / x.n }));
  if (!m.some(x => x.v)) return '<div class="text-gray-400">Sem uso no período.</div>';
  const ord = m.slice().sort((a, b) => b.v - a.v), mais = ord.slice(0, 3), menos = ord.slice(-3).reverse();
  return `<div><b class="text-[#c81e1e]">Mais usadas:</b> ${mais.map(x => 'Rua ' + p2(x.r)).join(', ')}</div>
    <div><b class="text-tpv">Menos usadas:</b> ${menos.map(x => 'Rua ' + p2(x.r)).join(', ')}</div>
    <div class="text-gray-400 pt-1">Ruas pouco usadas podem virar área de retrabalho/estoque; ruas muito usadas perto da porta são boas para paletes que saem rápido.</div>`;
}
async function salvarAlertaHoras(v) {
  const n = Math.round(Number(v));
  if (!(n >= 1 && n <= 720)) { msgTopo('Digite de 1 a 720 horas.', true); return; }
  dbData.sala.alertaHoras = n; dbData.sala.atualizadoEm = Date.now();
  registrarLog('ALERTA_HORAS', 'Alerta de palete parado: ' + n + ' h');
  await salvarBanco(); _avisados.clear(); _conferirVelhos._ok = false; _conferirVelhos();
  msgTopo('Alerta ajustado para ' + n + ' horas.'); renderEstrat(); sala3d.atualizar(true);
}
function editarTurnos() {
  const txt = prompt('Horários dos turnos (um por linha: nome;início;fim)\nEx.: 1º turno;06:00;14:00', turnos().map(t => t.nome + ';' + t.ini + ';' + t.fim).join('\n'));
  if (txt == null) return;
  const novos = txt.split(/\n|\|/).map(l => l.split(';').map(x => x.trim())).filter(a => a[0] && /^\d{1,2}:\d{2}$/.test(a[1] || '') && /^\d{1,2}:\d{2}$/.test(a[2] || ''))
    .map(([nome, ini, fim]) => ({ nome, ini: ini.padStart(5, '0'), fim: fim.padStart(5, '0') }));
  if (!novos.length) { msgTopo('Formato inválido. Use: nome;06:00;14:00', true); return; }
  dbData.sala.turnos = novos; dbData.sala.atualizadoEm = Date.now();
  registrarLog('TURNOS', novos.map(t => t.nome + ' ' + t.ini + '-' + t.fim).join(' | '));
  salvarBanco(); _est.turno = 0; renderEstrat();
}
/* abre uma janela só com o relatório do turno (texto + gráficos) para imprimir ou salvar em PDF */
function imprimirTurno() {
  const box = $('bp-est-turno'); if (!box) return;
  const c = box.cloneNode(true);
  ['bp-g-hora', 'bp-g-tempo'].forEach(id => { const o = $(id), n = c.querySelector('#' + id); if (o && n) { const img = document.createElement('img'); img.src = o.toDataURL('image/png'); img.style.width = '100%'; n.replaceWith(img); } });
  const w = window.open('', '_blank'); if (!w) { msgTopo('O navegador bloqueou a janela de impressão.', true); return; }
  const css = [...document.querySelectorAll('style')].map(s => s.outerHTML).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Relatório do turno · Buffer Control</title>${css}<style>body{font-family:Arial,sans-serif;padding:20px;color:#021326}</style></head>
    <body><h2 style="font-size:20px;font-weight:900;margin-bottom:6px">Buffer Control · Relatório do turno</h2><div style="font-size:11px;color:#666;margin-bottom:12px">Gerado em ${new Date().toLocaleString('pt-BR')} por ${esc(usuarioLogado ? usuarioLogado.usuario : '')}</div>${c.innerHTML}</body></html>`);
  w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400);
}
const _renderTudoV83 = renderTudo;
renderTudo = function (auto) {
  _renderTudoV83(auto);
  try { _conferirVelhos(); } catch (e) { console.warn('Alerta de horas:', e); }
};
Object.assign(window.BP, { buscarPalete, salvarAlertaHoras, editarTurnos, imprimirTurno, renderEstrat,
  estTurno: i => { _est.turno = Number(i) || 0; _renderTurno(); },
  estDia: v => { if (v) { _est.dia = v; _renderTurno(); } },
  estCalor: (k, v) => { _est[k] = k === 'dias' ? Number(v) : v; _renderCalor(); } });

/* ═════════════════ [8] v8.4 — BLOQUEAR/RESERVAR VAGA · LINHA DO TEMPO DO LPN · OCUPAÇÃO NOS DIAS ═════════════
   · sala.travas = { 'R03-P02': { tipo: 'bloq' | 'reserva', op, motivo, por, em } } (só Key User).
     Bloqueada: nunca é sugerida nem aceita na tela Guardar e sai das KPIs de vagas.
     Reservada: só é sugerida para a OP dela; outra OP só com confirmação.
     Vai junto com o layout (sala), que mescla entre PCs pelo atualizadoEm.
   · Linha do tempo do LPN: leituras + histórico de vagas (usoVagas) + quebra de FIFO na saída.
   · Ocupação ao longo dos dias: refeita a partir das leituras (uma "foto" por hora), então
     já mostra o passado sem precisar esperar juntar dados.                              */
function travaDe(id) { const t = dbData.sala && dbData.sala.travas; return (t && t[id]) || null; }
function _htmlTravaVaga(id) {
  const tv = travaDe(id), bt = 'px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1';
  const est = tv ? (tv.tipo === 'bloq'
    ? `<div class="p-3 rounded-lg mb-3 font-bold text-slate-700" style="background:repeating-linear-gradient(45deg,#e2e8f0 0 8px,#f1f5f9 8px 16px)">⛔ Vaga BLOQUEADA · ${esc(tv.motivo || 'manutenção')}<div class="text-[11px] font-normal text-gray-500">por ${esc(tv.por || '—')} em ${tv.em ? new Date(tv.em).toLocaleString('pt-BR') : '—'}</div></div>`
    : `<div class="p-3 rounded-lg mb-3 font-bold text-purple-800 bg-purple-100 border border-purple-300">📌 Vaga RESERVADA para a OP ${esc(tv.op)}${tv.motivo ? ' · ' + esc(tv.motivo) : ''}<div class="text-[11px] font-normal text-gray-500">por ${esc(tv.por || '—')} em ${tv.em ? new Date(tv.em).toLocaleString('pt-BR') : '—'}</div></div>`)
    : '<div class="p-3 rounded-lg mb-3 text-green-700 font-bold bg-green-50">Vaga livre.</div>';
  if (!ehKey()) return est + '<div class="text-xs text-gray-500">Só o Key User pode bloquear ou reservar vagas.</div>';
  return est + `<div class="flex flex-wrap gap-2">
    ${!tv || tv.tipo !== 'bloq' ? `<button onclick="BP.travarVaga('${id}','bloq')" class="${bt} bg-slate-600 text-white"><i data-lucide="ban" class="w-4 h-4"></i> Bloquear (manutenção)</button>` : ''}
    ${!tv || tv.tipo !== 'reserva' ? `<button onclick="BP.travarVaga('${id}','reserva')" class="${bt} bg-purple-600 text-white"><i data-lucide="bookmark" class="w-4 h-4"></i> Reservar para OP…</button>` : ''}
    ${tv ? `<button onclick="BP.travarVaga('${id}',null)" class="${bt} bg-green-600 text-white"><i data-lucide="unlock" class="w-4 h-4"></i> Liberar a vaga</button>` : ''}</div>`;
}
async function travarVaga(id, tipo) {
  if (!ehKey()) { msgTopo('Só o Key User pode bloquear ou reservar vagas.', true); return; }
  if (tipo && (ocupacao().mapa[id] || []).length) { msgTopo(nomeVaga(id) + ' está ocupada. Tire o palete antes.', true); return; }
  const S = dbData.sala; S.travas = S.travas || {};
  let reg = null;
  if (tipo === 'bloq') {
    const m = prompt('Motivo do bloqueio de ' + id + ' (ex.: manutenção do piso):', 'manutenção'); if (m == null) return;
    reg = { tipo, motivo: m.trim() || 'manutenção' };
  } else if (tipo === 'reserva') {
    const t = prompt('Reservar ' + id + ' para qual OP? (7 dígitos)', ''); if (t == null) return;
    const op = (String(t).match(/\d{7}/) || [])[0];
    if (!op) { msgTopo('OP inválida: use os 7 dígitos.', true); return; }
    if (!(dbData.ops || []).some(o => o.numero === op) && !confirm('A OP ' + op + ' não está no Plano SMT. Reservar mesmo assim?')) return;
    reg = { tipo, op, motivo: '' };
  }
  if (reg) S.travas[id] = Object.assign(reg, { por: usuarioLogado ? usuarioLogado.usuario : '', em: Date.now() });
  else delete S.travas[id];
  S.atualizadoEm = Date.now();
  registrarLog(reg ? (tipo === 'bloq' ? 'VAGA_BLOQUEAR' : 'VAGA_RESERVAR') : 'VAGA_LIBERAR', id + (reg ? ' · ' + (reg.op ? 'OP ' + reg.op : reg.motivo) : ''));
  await salvarBanco();
  msgTopo(reg ? (tipo === 'bloq' ? id + ' bloqueada.' : id + ' reservada para a OP ' + reg.op + '.') : id + ' liberada.');
  _fecharModal(); renderSalaTab(); sala3d.atualizar(true);
}

/* ── linha do tempo de um LPN (rastreio do palete) ── */
const _nomeDe = mat => { const u = regDe(mat); return u && u.nome ? u.nome.split(' ')[0] : (mat || '—'); };
function eventosLPN(lpn) {
  const ev = [];
  _leiturasComTs().filter(l => l.lpn === lpn).forEach(l => {
    const ent = _tipoLeitura(l) === 'entrada';
    ev.push({ ts: l._ts, ic: ent ? '🟢' : '🟡', tipo: ent ? 'ENTRADA' : 'SAÍDA para a IM', cor: ent ? '#16a34a' : '#ca8a04',
      txt: 'OP ' + l.op + ' · ' + fQ(l.qtd) + ' placas · ' + _nomeDe(l.guardiao), saida: !ent, op: l.op });
  });
  (dbData.usoVagas || []).filter(u => u.lpn === lpn).forEach(u => {
    if (!u.vaga) { ev.push({ ts: u.ts, ic: '⬜', tipo: 'VAGA LIBERADA', cor: '#64748b', txt: u.de || '' }); return; }
    if (!u.de) ev.push({ ts: u.ts, ic: '📦', tipo: 'GUARDADO em ' + u.vaga, cor: '#005b9f', txt: (u.auto ? 'vaga sugerida' : 'escolha manual') + (u.motivo ? ' · ' + u.motivo : '') + (u.por ? ' · ' + _nomeDe(u.por) : '') });
    else ev.push({ ts: u.ts, ic: '🔁', tipo: 'TROCOU de ' + u.de + ' para ' + u.vaga, cor: '#7c3aed', txt: (u.motivo ? 'motivo: ' + u.motivo : 'troca manual') + (u.por ? ' · ' + _nomeDe(u.por) : '') });
  });
  // sem histórico de vaga (paletes de antes da v8.3): mostra a vaga atual
  const reg = dbData.vagas[lpn];
  if (reg && reg.vaga && !(dbData.usoVagas || []).some(u => u.lpn === lpn)) ev.push({ ts: reg.em || 0, ic: '📦', tipo: 'NA VAGA ' + reg.vaga, cor: '#005b9f', txt: reg.auto ? 'vaga sugerida' : 'vaga escolhida', ant: true });
  // saída fora do FIFO
  const qs = relatorioTurno(0, Date.now() + DIA).quebras.filter(q => q.lpn === lpn);
  ev.forEach(e => { if (!e.saida) return; const q = qs.find(x => Math.abs(x.ts - e.ts) < 1000); e.fifo = q ? 'fora do FIFO (' + q.n + ' na frente)' : 'dentro do FIFO'; e.fifoRuim = !!q; });
  // a vaga liberada vem colada com a saída: não repete
  return ev.sort((a, b) => a.ts - b.ts || (a.saida ? -1 : 1)).filter((e, i, a) => !(e.tipo === 'VAGA LIBERADA' && a.some(x => x.saida && Math.abs(x.ts - e.ts) < 120000)));
}
function _htmlLinhaTempo(lpn) {
  const ev = eventosLPN(lpn), dentro = bufferAgora().find(x => x.lpn === lpn);
  const dh = t => { const d = new Date(t); return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const topo = dentro ? `<div class="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm"><b>No buffer agora</b> · ${esc((dbData.vagas[lpn] || {}).vaga || 'sem vaga')} · há ${fH(horasPalete(dentro))} · IM ${esc(dentro.dataIMtxt || 'sem plano')}</div>`
    : '<div class="mb-4 p-3 rounded-lg bg-gray-50 border text-sm text-gray-600">Fora do buffer.</div>';
  if (!ev.length) return topo + '<div class="text-sm text-gray-400">Nenhum registro para este LPN.</div>';
  return topo + '<ol class="relative border-l-2 border-gray-200 ml-3">' + ev.map(e => `<li class="mb-4 ml-5">
      <span class="absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full bg-white text-sm">${e.ic}</span>
      <div class="text-sm"><span class="font-mono text-gray-500">${e.ts ? dh(e.ts) : '—'}</span> · <b style="color:${e.cor}">${esc(e.tipo)}</b>${e.fifo ? ` · <b class="${e.fifoRuim ? 'text-[#c81e1e]' : 'text-green-700'}">${esc(e.fifo)}</b>` : ''}</div>
      <div class="text-xs text-gray-600">${esc(e.txt)}${e.ant ? ' <span class="text-gray-400">(registro de antes do histórico)</span>' : ''}</div></li>`).join('') + '</ol>';
}
function linhaTempo(lpn) {
  if (!lpn) return;
  _modal('Linha do tempo · LPN ' + esc(lpn), _htmlLinhaTempo(lpn) + `<div class="flex justify-end mt-2"><button onclick="BP.imprimirLinhaTempo('${esc(lpn)}')" class="bg-sidebar text-white text-xs font-bold py-2 px-4 rounded flex items-center gap-1"><i data-lucide="printer" class="w-3.5 h-3.5"></i> Imprimir</button></div>`);
  icones();
}
function _imprimir(titulo, corpo) {
  const w = window.open('', '_blank'); if (!w) { msgTopo('O navegador bloqueou a janela de impressão.', true); return; }
  const css = [...document.querySelectorAll('style')].map(s => s.outerHTML).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)} · Buffer Control</title>${css}<style>body{font-family:Arial,sans-serif;padding:20px;color:#021326}</style></head>
    <body><h2 style="font-size:20px;font-weight:900;margin-bottom:6px">Buffer Control · ${esc(titulo)}</h2><div style="font-size:11px;color:#666;margin-bottom:12px">Gerado em ${new Date().toLocaleString('pt-BR')} por ${esc(usuarioLogado ? usuarioLogado.usuario : '')}</div>${corpo}</body></html>`);
  w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 400);
}
const imprimirLinhaTempo = lpn => _imprimir('Linha do tempo do LPN ' + lpn, _htmlLinhaTempo(lpn));
/* Relatório de Leituras: na janela de LPNs da OP, clicar no LPN abre a linha do tempo */
const _abrirLPNsOrig = abrirModalLPNs;
abrirModalLPNs = function (numero) {
  _abrirLPNsOrig(numero);
  document.querySelectorAll('#modal-lpns-tbody tr').forEach(tr => {
    const td = tr.children[1]; if (!td || !td.classList.contains('font-mono')) return;
    const lpn = td.textContent.trim();
    td.classList.add('cursor-pointer', 'underline', 'decoration-dotted', 'hover:text-tpv'); td.title = 'Ver a linha do tempo deste LPN';
    td.onclick = () => linhaTempo(lpn);
  });
};

/* ── ocupação ao longo dos dias (Estratégia) ── */
const metaOcup = () => Math.min(100, Math.max(1, Number(dbData.sala && dbData.sala.metaOcup) || 80));
function serieOcupacao(semanas) {
  const fim = Date.now(), ini = _hoje0() - (semanas * 7 - 1) * DIA;
  const ls = _leiturasComTs().filter(l => l.lpn && l._ts).sort((a, b) => a._ts - b._ts);
  const cont = {}; let dentro = 0, i = 0;
  const aplica = l => { const c = cont[l.lpn] || 0, n = c + (_tipoLeitura(l) === 'entrada' ? 1 : -1); if (c <= 0 && n > 0) dentro++; if (c > 0 && n <= 0) dentro--; cont[l.lpn] = n; };
  const dias = [];
  for (let d = ini; d <= fim; d += DIA) {
    const amostras = [];
    for (let h = d; h < d + DIA && h <= fim; h += 3600000) { while (i < ls.length && ls[i]._ts <= h) aplica(ls[i++]); amostras.push(dentro); }
    dias.push({ d, media: amostras.reduce((a, b) => a + b, 0) / amostras.length, max: Math.max(...amostras) });
  }
  // tempo médio no buffer de quem saiu no período
  const ent = {}, tempos = [];
  ls.forEach(l => { if (_tipoLeitura(l) === 'entrada') ent[l.lpn] = l._ts; else if (ent[l.lpn] != null) { if (l._ts >= ini) tempos.push((l._ts - ent[l.lpn]) / 3600000); delete ent[l.lpn]; } });
  return { dias, medio: tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null, nSaidas: tempos.length };
}
function _renderOcupacao() {
  const el = $('bp-est-ocup'); if (!el) return;
  const cap = _kpisSala(ocupacao()).tot || 1, meta = metaOcup(), S = serieOcupacao(_est.semanas);
  const pct = v => Math.round(v * 1000 / cap) / 10;
  const med = S.dias.reduce((a, x) => a + x.media, 0) / (S.dias.length || 1);
  const top = S.dias.reduce((a, x) => (x.max > a.max ? x : a), { max: -1, d: 0 });
  const acima = S.dias.filter(x => pct(x.media) > meta).length;
  const kp = (rot, v, cor, sub) => `<div class="bg-gray-50 rounded-xl border p-3"><div class="text-[10px] font-black uppercase text-gray-500">${rot}</div><div class="text-2xl font-black ${cor}">${v}</div>${sub ? `<div class="text-[10px] text-gray-400 font-bold">${sub}</div>` : ''}</div>`;
  el.innerHTML = `<div class="min-w-0" style="height:260px"><canvas id="bp-g-ocup"></canvas></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
      ${kp('Ocupação média', pct(med) + '%', pct(med) > meta ? 'text-[#c81e1e]' : 'text-sidebar', acima + ' dia(s) acima da meta de ' + meta + '%')}
      ${kp('Dia mais cheio', top.max >= 0 ? fD(top.d) : '—', 'text-orange-600', top.max >= 0 ? pct(top.max) + '% no pico (' + top.max + ' paletes)' : '')}
      ${kp('Tempo médio no buffer', S.medio == null ? '—' : fH(S.medio), 'text-tpv', S.nSaidas + ' palete(s) que saíram no período')}</div>
    <div class="text-[11px] text-gray-400 mt-2">Calculado pelas leituras de entrada e saída (uma foto por hora), sobre as ${cap} vagas de hoje.</div>`;
  _grafico('bp-g-ocup', { type: 'line', data: { labels: S.dias.map(x => fD(x.d)), datasets: [
      { label: 'Ocupação média do dia (%)', data: S.dias.map(x => pct(x.media)), borderColor: '#005b9f', backgroundColor: 'rgba(0,91,159,.12)', fill: true, tension: .3, pointRadius: 2, borderWidth: 2 },
      { label: 'Pico do dia (%)', data: S.dias.map(x => pct(x.max)), borderColor: '#f97316', tension: .3, pointRadius: 0, borderWidth: 1.5 },
      { label: 'Meta (' + meta + '%)', data: S.dias.map(() => meta), borderColor: '#c81e1e', borderDash: [6, 4], pointRadius: 0, borderWidth: 2 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { y: { beginAtZero: true, suggestedMax: 100, ticks: { callback: v => v + '%' } } } } });
}
async function salvarMeta(v) {
  const n = Math.round(Number(v)); if (!(n >= 1 && n <= 100)) { msgTopo('Meta de 1 a 100%.', true); return; }
  dbData.sala.metaOcup = n; dbData.sala.atualizadoEm = Date.now();
  registrarLog('META_OCUPACAO', 'Meta de ocupação: ' + n + '%'); await salvarBanco(); _renderOcupacao();
}
Object.assign(window.BP, { travarVaga, linhaTempo, imprimirLinhaTempo, salvarMeta,
  estOcup: (k, v) => { _est[k] = Number(v); _renderOcupacao(); } });

/* ═════════════════ [9] v8.4 — PDF DO TURNO AUTOMÁTICO · LEITURA PELO CELULAR ═════════════
   · sala.relAuto = true: quando um turno acaba, o 1º PC com o sistema aberto gera o PDF
     (jsPDF via CDN) e grava em Relatórios\AAAA-MM\DD-MM_<turno>.pdf, dentro da pasta do
     sistema. Se o arquivo já existe (outro PC gerou), pula. Só gera turnos que acabaram
     nas últimas 20 h. Precisa de algum PC aberto na hora (ex.: o PC da TV).
   · #celular (ou ?celular) na URL: tela só de leitura para celular — ENTRADA/SAÍDA, um
     campo grande, a vaga em letras gigantes. Usa a MESMA barra de leitura do sistema
     (mesmas validações); não carrega a sala 3D.                                          */
const PASTA_REL = 'Relatórios';
const nomePdfTurno = (t, ini) => { const d = new Date(ini); return p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '_' + String(t.nome).replace(/[\s\\/:*?"<>|]+/g, '') + '.pdf'; };
const mesPdf = ini => { const d = new Date(ini); return d.getFullYear() + '-' + p2(d.getMonth() + 1); };
function _cfgGraficosTurno(R, j) {
  const hs = Object.keys(R.porHora).map(Number).sort((a, b) => ((a - new Date(j.ini).getHours() + 24) % 24) - ((b - new Date(j.ini).getHours() + 24) % 24));
  const faixas = [['< 4 h', 0, 4], ['4–8 h', 4, 8], ['8–24 h', 8, 24], ['1–2 d', 24, 48], ['2–5 d', 48, 120], ['> 5 d', 120, 1e9]];
  return [{ type: 'bar', data: { labels: hs.map(h => p2(h) + 'h'), datasets: [
      { label: 'Entradas', data: hs.map(h => R.porHora[h].e), backgroundColor: '#005b9f', borderRadius: 3 },
      { label: 'Saídas', data: hs.map(h => R.porHora[h].s), backgroundColor: '#22c55e', borderRadius: 3 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { title: { display: true, text: 'Paletes por hora' }, legend: { position: 'bottom', labels: { boxWidth: 12 } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } },
  { type: 'bar', data: { labels: faixas.map(f => f[0]), datasets: [{ label: 'Paletes', data: faixas.map(f => R.tempos.filter(x => x >= f[1] && x < f[2]).length), backgroundColor: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#991b1b'], borderRadius: 3 }] },
    options: { maintainAspectRatio: false, animation: false, plugins: { title: { display: true, text: 'Tempo no buffer de quem saiu no turno' }, legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }];
}
/* gráfico desenhado fora da tela → imagem PNG */
function _graficoPNG(cfg, w, h) {
  const box = document.createElement('div'); box.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px`;
  const c = document.createElement('canvas'); c.width = w; c.height = h; box.appendChild(c); document.body.appendChild(box);
  const fundo = { id: 'fundoBranco', beforeDraw: g => { const x = g.ctx; x.save(); x.fillStyle = '#fff'; x.fillRect(0, 0, g.width, g.height); x.restore(); } };
  cfg = Object.assign({}, cfg, { plugins: [fundo], options: Object.assign({}, cfg.options, { responsive: false, animation: false, devicePixelRatio: 1.5 }) });
  const ch = new Chart(c, cfg); const url = ch.toBase64Image('image/jpeg', 0.85); ch.destroy(); box.remove(); return url;
}
let _jspdfOk = null;
function _garantirJsPDF() {
  if (window.jspdf) return Promise.resolve();
  return _jspdfOk || (_jspdfOk = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload = res; s.onerror = () => { _jspdfOk = null; rej(new Error('sem jsPDF')); }; document.head.appendChild(s); }));
}
async function pdfTurno(i, dia) {
  await _garantirJsPDF();
  const t = turnos()[i], j = janelaTurno(t, dia), R = relatorioTurno(j.ini, j.fim);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true }), W = 210;
  doc.setFillColor(2, 19, 38); doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('Buffer Control · Relatório do turno', 12, 10);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(t.nome + '  ·  ' + new Date(j.ini).toLocaleString('pt-BR') + ' até ' + new Date(j.fim).toLocaleString('pt-BR'), 12, 17);
  doc.setTextColor(2, 19, 38);
  const kps = [['Entradas', R.ent.length + '', fQ(R.placasE) + ' placas'], ['Saídas', R.sai.length + '', fQ(R.placasS) + ' placas'],
    ['Quebras de FIFO na saída', R.quebras.length + '', ''], ['Tempo médio no buffer', R.medio == null ? '—' : fH(R.medio), R.tempos.length + ' palete(s)'], ['Quebras na sala (agora)', R.bloqueiosAgora + '', '']];
  kps.forEach((k, n) => { const x = 12 + n * 37.5; doc.setDrawColor(220); doc.roundedRect(x, 28, 35, 22, 2, 2);
    doc.setFontSize(6.5); doc.setTextColor(110); doc.text(k[0].toUpperCase(), x + 2, 33, { maxWidth: 31 });
    doc.setFontSize(15); doc.setTextColor(2, 19, 38); doc.setFont('helvetica', 'bold'); doc.text(k[1], x + 2, 43); doc.setFont('helvetica', 'normal');
    doc.setFontSize(7); doc.setTextColor(140); doc.text(k[2], x + 2, 48); });
  const [g1, g2] = _cfgGraficosTurno(R, j);
  doc.addImage(_graficoPNG(g1, 900, 340), 'JPEG', 12, 56, 186, 70);
  doc.addImage(_graficoPNG(g2, 900, 340), 'JPEG', 12, 130, 186, 70);
  doc.setTextColor(2, 19, 38); doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.text('Saídas fora da ordem (FIFO)', 12, 210);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  let y = 216;
  if (!R.quebras.length) doc.text('Nenhuma.', 12, y);
  R.quebras.slice(0, 22).forEach(q => { doc.text(new Date(q.ts).toLocaleTimeString('pt-BR').slice(0, 5) + '   LPN ' + q.lpn + '   OP ' + q.op + '   (' + q.n + ' palete(s) na frente)', 12, y); y += 4.5; });
  doc.setFontSize(7); doc.setTextColor(150); doc.text('Gerado em ' + new Date().toLocaleString('pt-BR') + ' · Buffer Control · Plataforma MMT', 12, 290);
  return { blob: doc.output('blob'), nome: nomePdfTurno(t, j.ini), mes: mesPdf(j.ini), j };
}
async function _gravarPdf(P) {
  const d = await _pasta([PASTA_REL, P.mes], true);
  const w = await (await d.getFileHandle(P.nome, { create: true })).createWritable(); await w.write(P.blob); await w.close();
}
async function _pdfExiste(mes, nome) { try { const d = await _pasta([PASTA_REL, mes], false); await d.getFileHandle(nome); return true; } catch (e) { return false; } }
/* botão "Gerar PDF agora" (turno escolhido na tela): grava na pasta e também baixa */
async function gerarPdfAgora() {
  try {
    msgTopo('Gerando o PDF do turno...');
    const P = await pdfTurno(_est.turno || 0, _est.dia);
    let salvo = false;
    if (typeof MMT !== 'undefined' && MMT.pasta) { try { await _gravarPdf(P); salvo = true; } catch (e) { console.warn('PDF na pasta:', e); } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(P.blob); a.download = P.nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    registrarLog('RELATORIO_TURNO', 'PDF ' + P.nome + (salvo ? ' salvo em ' + PASTA_REL + '\\' + P.mes : ' (só download)'));
    msgTopo(salvo ? 'PDF salvo em ' + PASTA_REL + '\\' + P.mes + '\\' + P.nome : 'PDF baixado: ' + P.nome);
  } catch (e) { msgTopo('Não consegui gerar o PDF (sem internet para carregar o gerador?).', true); }
}
/* rotina automática: confere a cada minuto se algum turno acabou e ainda não tem PDF */
let _pdfRodando = false;
async function _rotinaPdf() {
  if (_pdfRodando || !dbData || !dbData.sala || !dbData.sala.relAuto || typeof MMT === 'undefined' || !MMT.pasta) return;
  _pdfRodando = true;
  try {
    const agora = Date.now(), iso = dt => dt.getFullYear() + '-' + p2(dt.getMonth() + 1) + '-' + p2(dt.getDate());
    for (const dia of [iso(new Date(agora - DIA)), iso(new Date(agora))]) for (let i = 0; i < turnos().length; i++) {
      const t = turnos()[i], j = janelaTurno(t, dia);
      if (j.fim > agora || agora - j.fim > 20 * 3600000) continue;
      if (j.fim < (Number(dbData.sala.relAutoDesde) || 0)) continue;          // só turnos que acabaram depois de ligar
      const nome = nomePdfTurno(t, j.ini), mes = mesPdf(j.ini);
      if (await _pdfExiste(mes, nome)) continue;
      const P = await pdfTurno(i, dia);
      if (await _pdfExiste(mes, nome)) continue;                              // outro PC gravou enquanto gerava
      await _gravarPdf(P);
      registrarLog('RELATORIO_TURNO_AUTO', 'PDF ' + nome + ' salvo em ' + PASTA_REL + '\\' + mes);
    }
  } catch (e) { console.warn('PDF automático do turno:', e); }
  finally { _pdfRodando = false; }
}
async function alternarPdfAuto() {
  if (!ehKey()) { msgTopo('Só o Key User muda o relatório automático.', true); return; }
  const S = dbData.sala; S.relAuto = !S.relAuto; if (S.relAuto) S.relAutoDesde = Date.now(); S.atualizadoEm = Date.now();
  registrarLog('RELATORIO_AUTO', S.relAuto ? 'Ligado' : 'Desligado'); await salvarBanco();
  msgTopo(S.relAuto ? 'Relatório automático LIGADO: o PDF sai sozinho no fim de cada turno (precisa de um PC com o sistema aberto).' : 'Relatório automático DESLIGADO.');
  renderEstrat();
}

/* ── leitura pelo celular ── */
const modoCelular = () => /[#&?]celular\b/i.test(location.hash + location.search);
function _montarCelular() {
  if ($('bp-cel')) return;
  document.body.classList.add('bp-celular');
  const st = document.createElement('style');
  st.textContent = 'body.bp-celular aside, body.bp-celular #kiosk-exit, body.bp-celular main{display:none!important} body.bp-celular{overflow:hidden}';
  document.head.appendChild(st);
  const c = document.createElement('div'); c.id = 'bp-cel';
  c.className = 'fixed inset-0 z-[9600] bg-[#060b16] text-white flex flex-col';
  c.innerHTML = `<div class="flex items-center gap-2 px-4 py-3 border-b border-white/10"><i data-lucide="scan-line" class="w-6 h-6 text-sky-300"></i>
      <div class="font-black tracking-wide">BUFFER · LEITURA</div><div id="bp-cel-user" class="ml-auto text-xs text-white/50 font-bold"></div></div>
    <div class="grid grid-cols-2 gap-3 p-4">
      <button id="bp-cel-ent" onclick="BP.celModo('entrada')" class="py-6 rounded-2xl text-2xl font-black">ENTRADA</button>
      <button id="bp-cel-sai" onclick="BP.celModo('saida')" class="py-6 rounded-2xl text-2xl font-black">SAÍDA</button></div>
    <div class="px-4"><div id="bp-cel-passo" class="text-lg font-black text-sky-200 mb-2"></div>
      <input id="bp-cel-in" autocomplete="off" autocapitalize="characters" enterkeyhint="go" class="w-full rounded-2xl px-4 py-5 text-3xl font-mono font-black text-[#021326] outline-none">
      <button onclick="BP.celEnviar()" class="mt-3 w-full py-4 rounded-2xl bg-sky-500 text-[#021326] text-xl font-black">OK</button>
      <div id="bp-cel-msg" class="mt-3 text-base font-bold min-h-[1.5rem]"></div></div>
    <div id="bp-cel-vaga" class="flex-1 flex flex-col items-center justify-center text-center px-4"></div>`;
  document.body.appendChild(c);
  const inp = $('bp-cel-in');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); celEnviar(); } });
  // o sistema às vezes devolve o foco para a barra original (escondida): traz de volta para o celular
  document.addEventListener('focusin', e => { if (modoCelular() && e.target && e.target.id === 'barra-input') setTimeout(() => inp.focus(), 0); });
  $('bp-cel-user').textContent = usuarioLogado ? usuarioLogado.usuario : '';
  _celUI(); icones();
}
function celModo(m) { setModoLeitura(m); $('bp-cel-vaga').innerHTML = ''; _celUI(); $('bp-cel-in').focus(); }
function _celUI() {
  if (!$('bp-cel')) return;
  const ent = modoLeitura === 'entrada';
  $('bp-cel-ent').className = 'py-6 rounded-2xl text-2xl font-black ' + (ent ? 'bg-[#7fb3e0] text-[#021326]' : 'bg-white/10 text-white/50');
  $('bp-cel-sai').className = 'py-6 rounded-2xl text-2xl font-black ' + (!ent ? 'bg-[#e0b64a] text-[#021326]' : 'bg-white/10 text-white/50');
  const pi = $('passo-indicador'); $('bp-cel-passo').textContent = pi ? pi.textContent.replace(/^Passo/, 'Passo') : '';
  const inp = $('bp-cel-in'), bi = $('barra-input');
  inp.inputMode = passoAtual === 3 ? 'numeric' : 'text';
  inp.placeholder = passoAtual === 1 ? 'OP' : passoAtual === 2 ? 'LPN' : 'Quantidade';
  inp.value = bi ? bi.value : '';
  const m = $('leitura-msg');
  $('bp-cel-msg').innerHTML = m && !m.classList.contains('hidden') && m.textContent.trim() ? `<span class="${/✅/.test(m.textContent) ? 'text-green-400' : 'text-red-400'}">${esc(m.textContent)}</span>` : '';
}
async function celEnviar() {
  const inp = $('bp-cel-in'), v = inp.value.trim(); if (!v) return;
  $('barra-input').value = v;
  try { await avancarPasso(); } catch (e) { console.warn(e); }
  setTimeout(() => { _celUI(); inp.focus(); }, 350);
}
/* depois da leitura: no celular mostra a vaga em letras gigantes (no lugar da tela Guardar) */
function _celVaga() {
  const a = _ultimoAviso, el = $('bp-cel-vaga'); if (!el || !a) return;
  el.innerHTML = a.tipo === 'entrada' ? `<div class="text-sm font-black uppercase tracking-widest text-green-400">Guardar o palete em</div><div class="font-mono font-black leading-none my-2 whitespace-nowrap" style="font-size:17vw">${esc(a.vaga)}</div><div class="text-lg font-bold">${esc(nomeVaga(a.vaga))}</div><div class="text-sm text-white/50 mt-1">LPN ${esc(a.lpn)} · OP ${esc(a.op)}</div>`
    : a.tipo === 'saida' ? `<div class="text-sm font-black uppercase tracking-widest text-yellow-300">Retirar o palete de</div><div class="font-mono font-black leading-none my-2 whitespace-nowrap" style="font-size:17vw">${esc(a.vaga || 'sem vaga')}</div><div class="text-sm text-white/50">LPN ${esc(a.lpn)} · OP ${esc(a.op)} — vaga liberada</div>`
    : `<div class="text-2xl font-black text-red-400">SALA CHEIA — chame o líder.</div>`;
}
const _abrirGuardarCel = abrirGuardar;
abrirGuardar = function (lpn, novo) { if (modoCelular()) { _celVaga(); return; } return _abrirGuardarCel(lpn, novo); };
const _renderPainelCel = renderPainelVaga;
renderPainelVaga = function () { _renderPainelCel(); if (modoCelular() && $('bp-cel')) { _celVaga(); setTimeout(_celUI, 50); } };

Object.assign(window.BP, { gerarPdfAgora, alternarPdfAuto, celModo, celEnviar });

/* a aba Assinatura do Alimentador não é mais usada (os registros antigos continuam no Relatório) */
function _tirarAssinatura() { ['nav-ASSINATURA', 'aba-ASSINATURA'].forEach(id => { const e = $(id); if (e) e.remove(); }); }
/* "Leitura de Palete": ao clicar no menu abre em TELA CHEIA para o operador */
function _ajustarLeitura() {
  const nav = $('nav-LEITURA');
  if (nav && !nav.dataset.bp) {
    nav.dataset.bp = 1;
    nav.innerHTML = '<i data-lucide="scan-line" class="w-5 h-5 mr-3 opacity-80"></i> Leitura de Palete';
    nav.addEventListener('click', () => { if (pode('LEITURA')) entrarKiosk(); });
  }
  const h2 = document.querySelector('#aba-LEITURA h2');
  if (h2 && !h2.dataset.bp) { h2.dataset.bp = 1; h2.innerHTML = '<i data-lucide="scan-line" class="mr-2 text-tpv"></i> Leitura de Palete'; }
  icones();
}
/* aba "Buffer × Plano IM": usa a largura toda da tela, sem barra de rolagem
   na horizontal (as colunas quebram linha) e com rolagem vertical que vai
   até o fim da tela (cabeçalho da tabela fica fixo) */
function _ajustarAging() {
  const aba = $('aba-AGING'); if (!aba || aba.dataset.bp) return;
  aba.dataset.bp = 1;
  aba.classList.remove('max-w-7xl');
  const box = aba.querySelector('.overflow-x-auto');
  if (box) { box.classList.remove('overflow-x-auto', 'max-h-[65vh]'); box.classList.add('bp-ag-rolagem'); }
  const st = document.createElement('style');
  st.textContent = `#aba-AGING .bp-ag-rolagem{overflow-x:hidden;overflow-y:auto;max-height:calc(100vh - 250px);min-height:260px}
    #aba-AGING table{white-space:normal;width:100%}
    #aba-AGING thead{z-index:10}
    #aba-AGING th,#aba-AGING td{padding:.6rem .55rem;vertical-align:middle}
    #aba-AGING td.font-mono{white-space:nowrap}
    #aba-AGING tbody td:nth-child(2){white-space:normal;word-break:break-all;min-width:9rem}
    #aba-AGING td span.rounded-full{display:inline-block;white-space:nowrap}
    #aba-AGING td span.rounded-full.text-white{white-space:normal}`;
  document.head.appendChild(st);
}
function _iniciar() {
  _garantirSala();
  _tirarAssinatura();
  _ajustarAging();
  _ajustarLeitura();
  _montarAbaSala();
  _montarAbaPerm();
  _montarAbaEstrat();
  _montarCardControle();
  _enxugarVagas();
  _iniciado = true;
  _aplicarMenu();
  renderPainelVaga();
  if (bloqueado()) _telaBloqueio(true);
  else {
    const ativa = document.querySelector('.tab-content.active');
    if (!ativa || !pode(ativa.id.replace('aba-', ''))) mudarAba(abasDe()[0] || 'LEITURA');
    // celular: tela só de leitura (sem menu nem sala 3D)
    if (modoCelular()) { if (pode('LEITURA')) { mudarAba('LEITURA'); _montarCelular(); } else _telaBloqueio(true, 'Seu login não tem acesso à Leitura de Palete.'); }
    // Operador: já abre a leitura em tela cheia (o navegador só deixa entrar em tela cheia depois de um clique)
    else if (usuarioLogado.perfil === 'Operador' && pode('LEITURA')) {
      mudarAba('LEITURA'); document.body.classList.add('kiosk');
      const tela = () => { document.removeEventListener('pointerdown', tela, true); if (document.body.classList.contains('kiosk') && !document.fullscreenElement) { try { document.documentElement.requestFullscreen().catch(() => {}); } catch (e) {} } };
      document.addEventListener('pointerdown', tela, true);
    }
  }
  icones();
  setTimeout(() => backupAgora(false), 15000);
  setInterval(() => backupAgora(false), 10 * 60000);     // confere a janela de 3 h a cada 10 min
  setTimeout(_rotinaPdf, 20000); setInterval(_rotinaPdf, 60000);   // PDF automático do turno (se ligado)
  if (/[#&?]tv\b/i.test(location.hash + location.search)) setTimeout(() => { mudarAba('SALA'); abrirTV(); }, 800);
}
/* espera o sistema terminar de abrir (dbData carregado pela Plataforma) */
(function esperar() {
  if (typeof usuarioLogado !== 'undefined' && usuarioLogado && dbData && Array.isArray(dbData.leituras)) _iniciar();
  else setTimeout(esperar, 400);
})();
})();
