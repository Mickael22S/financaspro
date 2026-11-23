const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// Os dados ficam no Supabase (tabelas receitas, gastos, dividas e metas), separados por conta
// pelas regras RLS do banco. Aqui só mantemos uma cópia em memória para desenhar a tela.
let state = { receitas: [], dividas: [], gastos: [], metas: [] };

let calAno = new Date().getFullYear();
let calMes = new Date().getMonth();
let calDiaSel = null;
let calDrillAberto  = null;
let dashDrillAberto = null;

function hojeISO() { const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
let _busy = false;
// Executa uma ação de gravação sem deixar clicar duas vezes e mostra o erro, se houver.
async function run(fn) {
  if (_busy) return;
  _busy = true;
  try { await fn(); }
  catch (e) { notify((e && e.userMessage) || 'Algo deu errado. Tente novamente.'); }
  finally { _busy = false; }
}
function fmt(v) { return 'R$ ' + Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtDate(d) { if(!d) return '—'; const[y,m,day]=d.split('-'); return `${day}/${m}/${y}`; }
function pad(n) { return String(n).padStart(2,'0'); }
function notify(msg) {
  const n = document.getElementById('notif');
  document.getElementById('notif-msg').textContent = msg;
  n.classList.add('show');
  setTimeout(() => n.classList.remove('show'), 2800);
}

// ---- TEMA / CONFIGURAÇÕES ----
const _mqEscuro = window.matchMedia('(prefers-color-scheme: dark)');
function temaAtual() { try { return localStorage.getItem('fp_tema') || 'auto'; } catch(e) { return 'auto'; } }
function aplicaTema(t) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('fp_tema', t); } catch(e) {}
  const escuro = t === 'dark' || (t === 'auto' && _mqEscuro.matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', escuro ? '#000000' : '#f5f8fe');
}
_mqEscuro.addEventListener && _mqEscuro.addEventListener('change', () => aplicaTema(temaAtual()));
aplicaTema(temaAtual());

// ---- NAVEGAÇÃO ----

/* ===== METAS ===== */
let metaCapaBlob=null, metaCapaUrl='';
function esc(t){ return String(t==null?'':t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function metaCapaSel(inp) {
  const pv=document.getElementById('meta-capa-prev');
  const f=inp.files[0]; if(!f) { metaCapaBlob=null; pv.style.display='none'; return; }
  const rd=new FileReader();
  rd.onload=()=>{ const im=new Image(); im.onload=()=>{
    const k=Math.min(1,900/Math.max(im.width,im.height)), c=document.createElement('canvas');
    c.width=Math.round(im.width*k); c.height=Math.round(im.height*k);
    c.getContext('2d').drawImage(im,0,0,c.width,c.height);
    c.toBlob(b=>{
      if(!b) { notify('Não foi possível usar essa imagem.'); return; }
      metaCapaBlob=b;
      if(metaCapaUrl) URL.revokeObjectURL(metaCapaUrl);
      metaCapaUrl=URL.createObjectURL(b);
      pv.style.backgroundImage=`url('${metaCapaUrl}')`; pv.style.display='block';
    },'image/jpeg',.78);
  }; im.onerror=()=>notify('Não foi possível usar essa imagem.'); im.src=rd.result; };
  rd.readAsDataURL(f);
}
function capacidadeMensal() {
  const media=(arr)=>{ const ms=new Set(arr.map(x=>(x.data||'').slice(0,7)).filter(Boolean)); return ms.size? arr.reduce((t,x)=>t+(+x.valor||0),0)/ms.size : 0; };
  if (!state.receitas.length) return null;
  const hoje=new Date(), mesAtual=`${hoje.getFullYear()}-${pad(hoje.getMonth()+1)}`;
  const parcelas=state.dividas.filter(d=>(d.venc||'').startsWith(mesAtual)).reduce((t,d)=>t+(+d.valorParcela||0),0);
  return media(state.receitas)-media(state.gastos)-parcelas;
}
function planoMeta(m) {
  const fim=new Date(m.inicio+'T12:00:00'); fim.setMonth(fim.getMonth()+m.meses);
  const restante=Math.max(m.alvo-(m.guardado||0),0);
  const mesesRest=Math.max(1,Math.ceil((fim-new Date())/(30.44*864e5)));
  const mes=restante/mesesRest, cap=capacidadeMensal();
  const p={fim,restante,mesesRest,mes,semana:mes/4.345,dia:mes/30.44,cor:'blue',nivel:'',dica:''};
  if (restante<=0) { p.cor='green'; p.nivel='Meta atingida'; p.dica='Parabéns! Você já juntou o valor desejado.'; return p; }
  if (cap===null) { p.nivel='Sem dados'; p.dica='Cadastre suas receitas e gastos para eu checar se essa meta cabe no seu orçamento.'; return p; }
  const pct=cap>0? mes/cap : Infinity;
  const estender=cap>0? Math.ceil(restante/(cap*0.7)) : 0;
  if (pct<=0.5) { p.cor='green'; p.nivel='Tranquilo'; p.dica=`Cabe com folga: guarde ${fmt(mes)} por mês (${Math.round(pct*100)}% da sua sobra média de ${fmt(cap)}). Automatize a transferência no dia do pagamento.`; }
  else if (pct<=1) { p.cor='amber'; p.nivel='Apertado'; p.dica=`Usa ${Math.round(pct*100)}% da sua sobra média (${fmt(cap)}). Para ficar mais folgado, estenda para ${estender} meses ou corte ${fmt(mes-cap*0.7)} por mês dos gastos.`; }
  else if (cap>0) { p.cor='red'; p.nivel='Difícil no prazo'; p.dica=`Sua sobra média é ${fmt(cap)}/mês, menos que os ${fmt(mes)} necessários. Guardando 70% da sobra, a meta sai em ${estender} meses — ou aumente a renda em ${fmt(mes-cap)}/mês.`; }
  else { p.cor='red'; p.nivel='Difícil no prazo'; p.dica=`Hoje não sobra dinheiro no mês. Reduza gastos ou aumente a renda em pelo menos ${fmt(mes-cap)} por mês para essa meta caber.`; }
  return p;
}
function atualizaPreviewMeta() {
  const alvo=parseFloat(document.getElementById('meta-alvo').value), meses=parseInt(document.getElementById('meta-meses').value);
  const g=parseFloat(document.getElementById('meta-guardado').value)||0, pv=document.getElementById('meta-preview');
  if (alvo>0 && meses>0) {
    const t=planoMeta({alvo,meses,guardado:g,inicio:hojeISO()});
    pv.style.display='block';
    document.getElementById('meta-preview-text').innerHTML=`Guardando <span>${fmt(t.mes)}/mês</span> (${fmt(t.semana)}/semana) você chega lá. <span>${t.nivel}</span>.`;
  } else pv.style.display='none';
}
function abrirMetaForm() { document.getElementById('meta-overlay').classList.add('open'); setTimeout(()=>document.getElementById('meta-obj').focus(),50); }
function fecharMetaForm() { document.getElementById('meta-overlay').classList.remove('open'); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') fecharMetaForm(); });
function addMeta() {
  const titulo=document.getElementById('meta-obj').value.trim();
  const alvo=parseFloat(document.getElementById('meta-alvo').value);
  const meses=parseInt(document.getElementById('meta-meses').value);
  const guardado=parseFloat(document.getElementById('meta-guardado').value)||0;
  if (!titulo||isNaN(alvo)||alvo<=0||!(meses>0)) { notify('Preencha objetivo, quantia e prazo!'); return; }
  run(async()=>{
    const m=await Data.addMeta({titulo,alvo,meses,guardado,inicio:hojeISO()}, metaCapaBlob);
    state.metas.push(m);
    ['meta-obj','meta-alvo','meta-meses','meta-guardado','meta-capa'].forEach(i=>document.getElementById(i).value='');
    metaCapaBlob=null; document.getElementById('meta-capa-prev').style.display='none'; document.getElementById('meta-preview').style.display='none';
    fecharMetaForm(); renderMetas(); notify(m.capaFalhou?'Meta criada, mas a foto não pôde ser enviada.':'Meta criada!');
  });
}
function depositarMeta(id) {
  const inp=document.getElementById('dep-'+id), v=parseFloat(inp.value);
  if (isNaN(v)||v<=0) { notify('Informe o valor guardado!'); return; }
  const m=state.metas.find(x=>x.id===id); if(!m) return;
  run(async()=>{
    const novo=Math.round(((m.guardado||0)+v)*100)/100;
    await Data.setGuardado(id,novo);
    m.guardado=novo; renderMetas(); notify(`+${fmt(v)} em "${m.titulo}"`);
  });
}
function deleteMeta(id) {
  const m=state.metas.find(x=>x.id===id); if(!m) return;
  run(async()=>{ await Data.removeMeta(m); state.metas=state.metas.filter(x=>x.id!==id); renderMetas(); });
}
function renderMetas() {
  const el=document.getElementById('metas-list');
  const bar=document.querySelector('#page-metas .meta-bar'); if(bar) bar.classList.toggle('tem', state.metas.length>0);
  if (!state.metas.length) { el.innerHTML='<div class="meta-empty"><img src="assets/pasta-vazia-v5.svg" alt="" width="480" height="360"><h2>Nada por aqui ainda.</h2><p>Você ainda não adicionou nenhuma meta.</p><button class="btn" type="button" onclick="abrirMetaForm()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>Adicionar nova meta</button></div>'; return; }
  el.innerHTML=state.metas.map(m=>{
    const t=planoMeta(m), pct=Math.min(100,Math.round((m.guardado||0)/m.alvo*100));
    return `<div class="card meta-card">
      <div class="meta-cover" style="${m.capa?`background-image:url('${m.capa}')`:''}"><span class="badge ${t.cor}"><span class="badge-dot"></span>${t.nivel}</span></div>
      <div class="meta-body">
        <div class="meta-top"><div class="card-title">${esc(m.titulo)}</div><button class="delete-btn" aria-label="Remover meta" onclick="deleteMeta('${m.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button></div>
        <div class="meta-sub">${fmt(m.guardado||0)} de ${fmt(m.alvo)} · até ${fmtDate(t.fim.toISOString().slice(0,10))}</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--accent)"></div></div>
        ${t.restante>0?`<div class="meta-nums"><div><b>${fmt(t.mes)}</b>por mês</div><div><b>${fmt(t.semana)}</b>por semana</div><div><b>${fmt(t.dia)}</b>por dia</div></div>`:''}
        <div class="parcela-info">${t.dica}</div>
        <div class="meta-dep"><input type="number" id="dep-${m.id}" placeholder="Guardei (R$)" step="0.01" min="0" inputmode="decimal"><button class="btn" onclick="depositarMeta('${m.id}')">Guardar</button></div>
      </div></div>`;
  }).join('');
}

function showPage(id) {
  fecharMetaForm();
  if (typeof abreAvisos==='function') abreAvisos(false);
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  document.querySelectorAll('[data-page]').forEach(n => n.classList.toggle('active', n.dataset.page === id));
  const titles = {dashboard:'Dashboard',receitas:'Receitas',dividas:'Dívidas',gastos:'Gastos',calendario:'Calendário do mês',metas:'Metas'};
  const subs = {
    dashboard:'O panorama completo das suas finanças.',
    receitas:'Tudo o que entra, em um só lugar.',
    dividas:'Parcelas, bancos e vencimentos.',
    gastos:'Para onde o seu dinheiro está indo.',
    calendario:'Mês a mês, dia a dia.',
    metas:'Seus sonhos, com plano e prazo.'
  };
  document.getElementById('page-title').textContent = titles[id];
  document.getElementById('page-sub').textContent = subs[id];
  window.scrollTo(0,0);
  if (id==='dashboard')  renderDashboard();
  if (id==='receitas')   renderReceitas();
  if (id==='dividas')    renderDividas();
  if (id==='gastos')     renderGastos();
  if (id==='calendario') renderCalendario();
  if (id==='metas')      renderMetas();
}
// Acessibilidade: ativar itens do menu pelo teclado
document.querySelectorAll('.nav-item, .tab').forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
});

// Rótulos das colunas (usados nas listas em formato de cartão no celular)
function aplicaRotulos() {
  document.querySelectorAll('table').forEach(t => {
    const hs = [...t.querySelectorAll('thead th')].map(h => h.textContent.trim());
    t.querySelectorAll('tbody tr').forEach(tr => {
      if (tr.children.length === 1) { tr.classList.add('grp'); return; }
      [...tr.children].forEach((td,i) => td.setAttribute('data-label', hs[i] || ''));
    });
  });
}
let _rotQueued = false;
new MutationObserver(() => {
  if (_rotQueued) return;
  _rotQueued = true;
  requestAnimationFrame(() => { _rotQueued = false; aplicaRotulos(); });
}).observe(document.body, {childList:true, subtree:true});

// ---- CORES ----
const catColors = {
  salario:'green',freelance:'blue',investimento:'purple',bonus:'amber',outro:'amber',
  moradia:'blue',alimentacao:'amber',transporte:'purple',saude:'green',lazer:'red',educacao:'blue',vestuario:'amber',
};
const bankColors = {
  'Nubank':         {bg:'#6b21a8',text:'#f3e8ff',label:'NU'},
  'Itaú':           {bg:'#1e3a8a',text:'#dbeafe',label:'IU'},
  'Bradesco':       {bg:'#b91c1c',text:'#fee2e2',label:'BD'},
  'Santander':      {bg:'#dc2626',text:'#fee2e2',label:'SN'},
  'Banco do Brasil':{bg:'#854d0e',text:'#fef9c3',label:'BB'},
  'Caixa':          {bg:'#1e40af',text:'#dbeafe',label:'CX'},
  'C6 Bank':        {bg:'#2a2a2a',text:'#e5e5e5',label:'C6'},
  'Inter':          {bg:'#7c2d12',text:'#ffedd5',label:'IN'},
  'XP':             {bg:'#14532d',text:'#dcfce7',label:'XP'},
  'Sicredi':        {bg:'#166534',text:'#dcfce7',label:'SC'},
  'Outro':          {bg:'#374151',text:'#e5e7eb',label:'OT'},
};

// ---- DASHBOARD DRILLS (dados globais) ----
function toggleDashDrill(tipo) {
  document.querySelectorAll('[id^="drill-dash-"]').forEach(p => p.classList.remove('open'));
  if (dashDrillAberto === tipo) { dashDrillAberto = null; return; }
  dashDrillAberto = tipo;
  renderDashDrill(tipo);
  const el = document.getElementById('drill-dash-'+tipo);
  el.classList.add('open');
  setTimeout(() => el.scrollIntoView({behavior:'smooth',block:'nearest'}), 50);
}
function closeDashDrill() {
  document.querySelectorAll('[id^="drill-dash-"]').forEach(p => p.classList.remove('open'));
  dashDrillAberto = null;
}
function renderDashDrill(tipo) {
  const abertas = state.dividas.filter(d => d.status !== 'quitada');
  if (tipo === 'receitas') {
    const el = document.getElementById('drill-dash-receitas-content');
    if (!state.receitas.length) { el.innerHTML = '<div class="empty">Nenhuma receita.</div>'; return; }
    const s = [...state.receitas].sort((a,b) => (b.data||'').localeCompare(a.data||''));
    el.innerHTML = `<table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th></tr></thead><tbody>
      ${s.map(r=>`<tr><td>${esc(r.desc)}</td><td><span class="badge ${catColors[r.cat]||'green'}"><span class="badge-dot"></span>${r.cat}</span></td>
      <td style="color:var(--muted)">${fmtDate(r.data)}</td><td style="color:var(--green);font-weight:600">${fmt(r.valor)}</td></tr>`).join('')}
    </tbody></table>`;
  }
  if (tipo === 'dividas') {
    const el = document.getElementById('drill-dash-dividas-content');
    if (!abertas.length) { el.innerHTML = '<div class="empty">Nenhuma parcela em aberto.</div>'; return; }
    const s = [...abertas].sort((a,b) => (a.venc||'').localeCompare(b.venc||''));
    const sb = {'em-dia':'green','atrasada':'red'};
    el.innerHTML = `<table><thead><tr><th>Descrição</th><th>Banco</th><th>Parcela</th><th>Vencimento</th><th>Status</th><th>Valor</th></tr></thead><tbody>
      ${s.map(d=>`<tr><td>${esc(d.desc)}</td><td>${esc(d.banco)}</td><td style="color:var(--muted)">${d.numParcela}/${d.totalParcelas}</td>
      <td style="color:var(--muted)">${fmtDate(d.venc)}</td>
      <td><span class="badge ${sb[d.status]||'amber'}"><span class="badge-dot"></span>${d.status}</span></td>
      <td style="color:var(--red);font-weight:600">${fmt(d.valorParcela)}</td></tr>`).join('')}
    </tbody></table>`;
  }
  if (tipo === 'gastos') {
    const el = document.getElementById('drill-dash-gastos-content');
    if (!state.gastos.length) { el.innerHTML = '<div class="empty">Nenhum gasto.</div>'; return; }
    const s = [...state.gastos].sort((a,b) => (b.data||'').localeCompare(a.data||''));
    el.innerHTML = `<table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th></tr></thead><tbody>
      ${s.map(g=>`<tr><td>${esc(g.desc)}</td><td><span class="badge ${catColors[g.cat]||'amber'}"><span class="badge-dot"></span>${g.cat}</span></td>
      <td style="color:var(--muted)">${fmtDate(g.data)}</td><td style="color:var(--amber);font-weight:600">${fmt(g.valor)}</td></tr>`).join('')}
    </tbody></table>`;
  }
  if (tipo === 'saldo') {
    const tR = state.receitas.reduce((s,r)=>s+r.valor,0);
    const tG = state.gastos.reduce((s,g)=>s+g.valor,0);
    const tD = abertas.reduce((s,d)=>s+d.valorParcela,0);
    const sl = tR - tG - tD;
    document.getElementById('drill-dash-saldo-content').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px">
        <div class="stat-box">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Receitas</div>
          <div style="font-size:18px;font-weight:600;color:var(--green)">${fmt(tR)}</div>
        </div>
        <div class="stat-box">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Gastos</div>
          <div style="font-size:18px;font-weight:600;color:var(--amber)">${fmt(tG)}</div>
        </div>
        <div class="stat-box">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Parcelas abertas</div>
          <div style="font-size:18px;font-weight:600;color:var(--red)">${fmt(tD)}</div>
        </div>
      </div>
      <div class="stat-box" style="font-size:14px;color:var(--muted);line-height:1.9">
        Saldo = receitas (<b style="color:var(--green)">${fmt(tR)}</b>) − gastos (<b style="color:var(--amber)">${fmt(tG)}</b>) − parcelas (<b style="color:var(--red)">${fmt(tD)}</b>) = <b style="color:${sl>=0?'var(--green)':'var(--red)'}">${fmt(sl)}</b>
      </div>`;
  }
}

// ---- CALENDÁRIO DRILLS ----
function calMesPrefix() { return `${calAno}-${pad(calMes+1)}-`; }
function toggleCalDrill(tipo) {
  document.querySelectorAll('[id^="drill-cal-"]').forEach(p => p.classList.remove('open'));
  if (calDrillAberto === tipo) { calDrillAberto = null; return; }
  calDrillAberto = tipo;
  renderCalDrill(tipo);
  const el = document.getElementById('drill-cal-'+tipo);
  el.classList.add('open');
  setTimeout(() => el.scrollIntoView({behavior:'smooth',block:'nearest'}), 50);
}
function closeCalDrill() {
  document.querySelectorAll('[id^="drill-cal-"]').forEach(p => p.classList.remove('open'));
  calDrillAberto = null;
}
function renderCalDrill(tipo) {
  const mp = calMesPrefix();
  const recMes = state.receitas.filter(r => r.data && r.data.startsWith(mp));
  const gasMes = state.gastos.filter(g => g.data && g.data.startsWith(mp));
  const divMes = state.dividas.filter(d => d.venc && d.venc.startsWith(mp) && d.status !== 'quitada');

  if (tipo === 'receitas') {
    const el = document.getElementById('drill-cal-receitas-content');
    if (!recMes.length) { el.innerHTML = '<div class="empty">Nenhuma receita neste mês.</div>'; return; }
    el.innerHTML = `<table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th></tr></thead><tbody>
      ${recMes.map(r=>`<tr><td>${esc(r.desc)}</td><td><span class="badge ${catColors[r.cat]||'green'}"><span class="badge-dot"></span>${r.cat}</span></td>
      <td style="color:var(--muted)">${fmtDate(r.data)}</td><td style="color:var(--green);font-weight:600">${fmt(r.valor)}</td></tr>`).join('')}
    </tbody></table>`;
  }
  if (tipo === 'pagar') {
    const el = document.getElementById('drill-cal-pagar-content');
    const todos = [
      ...gasMes.map(g=>({desc:g.desc,tipo:'Gasto',det:g.cat||'—',valor:g.valor,data:g.data,cor:'amber'})),
      ...divMes.map(d=>({desc:`${d.desc} (${d.numParcela}/${d.totalParcelas})`,tipo:'Parcela',det:d.banco,valor:d.valorParcela,data:d.venc,cor:'red'})),
    ].sort((a,b)=>(a.data||'').localeCompare(b.data||''));
    if (!todos.length) { el.innerHTML = '<div class="empty">Nenhum pagamento neste mês.</div>'; return; }
    el.innerHTML = `<table><thead><tr><th>Descrição</th><th>Tipo</th><th>Detalhe</th><th>Data</th><th>Valor</th></tr></thead><tbody>
      ${todos.map(x=>`<tr><td>${esc(x.desc)}</td><td><span class="badge ${x.cor}"><span class="badge-dot"></span>${x.tipo}</span></td>
      <td style="color:var(--muted);font-size:14px">${esc(x.det)}</td><td style="color:var(--muted)">${fmtDate(x.data)}</td>
      <td style="color:var(--${x.cor});font-weight:600">${fmt(x.valor)}</td></tr>`).join('')}
    </tbody></table>`;
  }
  if (tipo === 'saldo') {
    const tR = recMes.reduce((s,r)=>s+r.valor,0);
    const tG = gasMes.reduce((s,g)=>s+g.valor,0);
    const tD = divMes.reduce((s,d)=>s+d.valorParcela,0);
    const sl = tR - tG - tD;
    document.getElementById('drill-cal-saldo-content').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:14px">
        <div class="stat-box">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Receitas</div>
          <div style="font-size:18px;font-weight:600;color:var(--green)">${fmt(tR)}</div>
        </div>
        <div class="stat-box">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Parcelas</div>
          <div style="font-size:18px;font-weight:600;color:var(--red)">${fmt(tD)}</div>
        </div>
        <div class="stat-box">
          <div style="font-size:12px;color:var(--muted);margin-bottom:6px">Gastos</div>
          <div style="font-size:18px;font-weight:600;color:var(--amber)">${fmt(tG)}</div>
        </div>
      </div>
      <div class="stat-box" style="font-size:14px;color:var(--muted);line-height:1.9">
        Saldo = receitas (<b style="color:var(--green)">${fmt(tR)}</b>) − parcelas (<b style="color:var(--red)">${fmt(tD)}</b>) − gastos (<b style="color:var(--amber)">${fmt(tG)}</b>) = <b style="color:${sl>=0?'var(--green)':'var(--red)'}">${fmt(sl)}</b>
      </div>`;
  }
}

// ---- PREVIEW DÍVIDA ----
function atualizaPreviewDivida() {
  const valor    = parseFloat(document.getElementById('div-valor').value);
  const parcelas = parseInt(document.getElementById('div-parcelas').value);
  const venc     = document.getElementById('div-venc').value;
  const preview  = document.getElementById('div-preview');
  if (valor > 0 && parcelas > 0 && venc) {
    const d = new Date(venc+'T12:00:00');
    const fim = new Date(d.getFullYear(), d.getMonth()+parcelas-1, d.getDate());
    preview.style.display = 'block';
    document.getElementById('div-preview-text').innerHTML =
      `Total <span>${fmt(valor)}</span> ÷ <span>${parcelas} parcelas</span> = <span>${fmt(valor/parcelas)}</span> por parcela.<br>
       De ${MESES[d.getMonth()]}/${d.getFullYear()} até ${MESES[fim.getMonth()]}/${fim.getFullYear()}.`;
  } else { preview.style.display = 'none'; }
}

// ---- CRUD ----
function addReceita() {
  const desc=document.getElementById('rec-desc').value.trim();
  const valor=parseFloat(document.getElementById('rec-valor').value);
  const cat=document.getElementById('rec-cat').value;
  const data=document.getElementById('rec-data').value;
  if (!desc||isNaN(valor)||valor<=0) { notify('Preencha descrição e valor!'); return; }
  if (!data) { notify('Informe a data!'); return; }
  run(async()=>{
    state.receitas.push(await Data.addReceita({desc,valor,cat,data}));
    renderReceitas(); renderDashboard();
    document.getElementById('rec-desc').value=''; document.getElementById('rec-valor').value='';
    notify('Receita adicionada! + '+fmt(valor));
  });
}

function addDivida() {
  const desc=document.getElementById('div-desc').value.trim();
  const valorTotal=parseFloat(document.getElementById('div-valor').value);
  const banco=document.getElementById('div-banco').value;
  const parcelas=parseInt(document.getElementById('div-parcelas').value)||1;
  const vencBase=document.getElementById('div-venc').value;
  const status=document.getElementById('div-status').value;
  if (!desc||isNaN(valorTotal)||valorTotal<=0) { notify('Preencha descrição e valor total!'); return; }
  if (!vencBase) { notify('Informe a data de vencimento!'); return; }
  const totalCent=Math.round(valorTotal*100), baseCent=Math.floor(totalCent/parcelas), sobra=totalCent-baseCent*parcelas;
  const baseDate=new Date(vencBase+'T12:00:00');
  const lista=[];
  for (let i=0;i<parcelas;i++) {
    // dia 31 em mês curto cai no último dia do mês (e não pula para o mês seguinte)
    const ultimo=new Date(baseDate.getFullYear(),baseDate.getMonth()+i+1,0).getDate();
    const vd=new Date(baseDate.getFullYear(),baseDate.getMonth()+i,Math.min(baseDate.getDate(),ultimo));
    lista.push({
      numParcela:i+1, totalParcelas:parcelas, desc, valorParcela:(baseCent+(i<sobra?1:0))/100, valorTotal, banco,
      venc:`${vd.getFullYear()}-${pad(vd.getMonth()+1)}-${pad(vd.getDate())}`,
      status: i===0 ? status : 'em-dia',
    });
  }
  run(async()=>{
    const novas=await Data.addDividas(lista);
    state.dividas.push(...novas);
    renderDividas(); renderDashboard();
    document.getElementById('div-desc').value=''; document.getElementById('div-valor').value='';
    document.getElementById('div-parcelas').value=''; document.getElementById('div-preview').style.display='none';
    notify(`${fmt(valorTotal)} em ${parcelas}x de ${fmt(valorTotal/parcelas)} — ${banco}`);
  });
}

function addGasto() {
  const desc=document.getElementById('gas-desc').value.trim();
  const valor=parseFloat(document.getElementById('gas-valor').value);
  const cat=document.getElementById('gas-cat').value;
  const data=document.getElementById('gas-data').value;
  if (!desc||isNaN(valor)||valor<=0) { notify('Preencha descrição e valor!'); return; }
  if (!data) { notify('Informe a data!'); return; }
  run(async()=>{
    state.gastos.push(await Data.addGasto({desc,valor,cat,data}));
    renderGastos(); renderDashboard();
    document.getElementById('gas-desc').value=''; document.getElementById('gas-valor').value='';
    notify('Gasto adicionado: '+fmt(valor));
  });
}

function deleteItem(type,id) {
  run(async()=>{
    await Data.remove(type,id);
    state[type]=state[type].filter(x=>x.id!==id);
    if(type==='receitas') renderReceitas();
    if(type==='dividas')  renderDividas();
    if(type==='gastos')   renderGastos();
    renderDashboard();
    notify('Item removido.');
  });
}

function deleteGrupoDivida(grupoId) {
  const n=state.dividas.filter(d=>d.grupoId===grupoId).length;
  run(async()=>{
    await Data.removeGrupoDivida(grupoId);
    state.dividas=state.dividas.filter(d=>d.grupoId!==grupoId);
    renderDividas(); renderDashboard();
    notify(`${n} parcela(s) removidas.`);
  });
}

function marcarPaga(id) {
  const d=state.dividas.find(x=>x.id===id);
  if(!d) return;
  run(async()=>{
    await Data.quitarParcela(id);
    d.status='quitada';
    renderDividas(); renderDashboard();
    notify('Parcela marcada como paga!');
  });
}

// ---- RENDERS ----
function renderReceitas() {
  const el=document.getElementById('receitas-table');
  const total=state.receitas.reduce((s,r)=>s+r.valor,0);
  document.getElementById('rec-total-badge').textContent=state.receitas.length?'Total: '+fmt(total):'';
  if (!state.receitas.length) { el.innerHTML='<div class="empty">Nenhuma receita registrada.</div>'; return; }
  const s=[...state.receitas].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  el.innerHTML=`<table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th></th></tr></thead><tbody>
    ${s.map(r=>`<tr><td>${esc(r.desc)}</td><td><span class="badge ${catColors[r.cat]||'green'}"><span class="badge-dot"></span>${r.cat}</span></td>
    <td style="color:var(--muted)">${fmtDate(r.data)}</td>
    <td style="color:var(--green);font-weight:600">${fmt(r.valor)}</td>
    <td><button class="delete-btn" aria-label="Remover" onclick="deleteItem('receitas','${r.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button></td></tr>`).join('')}
  </tbody></table>`;
}

function renderDividas() {
  const el=document.getElementById('dividas-table');
  const abertas=state.dividas.filter(d=>d.status!=='quitada');
  document.getElementById('div-total-badge').textContent=abertas.length
    ?`${abertas.length} em aberto: ${fmt(abertas.reduce((s,d)=>s+d.valorParcela,0))}`:'';
  if (!state.dividas.length) { el.innerHTML='<div class="empty">Nenhuma dívida registrada.</div>'; return; }
  const grupos={};
  state.dividas.forEach(d=>{ if(!grupos[d.grupoId]) grupos[d.grupoId]=[]; grupos[d.grupoId].push(d); });
  const sb={'em-dia':'green','atrasada':'red','quitada':'blue'};
  let rows='';
  Object.values(grupos).forEach(parcs=>{
    parcs.sort((a,b)=>a.numParcela-b.numParcela);
    const g=parcs[0];
    const pagas=parcs.filter(p=>p.status==='quitada').length;
    rows+=`<tr style="background:var(--inset)"><td colspan="5" style="padding:12px 14px;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
        <div style="min-width:0"><span style="font-size:15px;font-weight:600">${esc(g.desc)}</span>
        <span style="font-size:13px;color:var(--muted);margin-left:8px">${esc(g.banco)} · ${parcs.length}x de ${fmt(g.valorParcela)}</span></div>
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <span style="font-size:13px;color:var(--muted)">${pagas}/${parcs.length} pagas</span>
          <button class="delete-btn txt" aria-label="Excluir dívida" onclick="deleteGrupoDivida('${g.grupoId}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>Excluir</button>
        </div>
      </div></td></tr>`;
    parcs.forEach(d=>{
      const acao=d.status!=='quitada'
        ?`<button class="btn-pagar" onclick="marcarPaga('${d.id}')">✓ Pago</button>`
        :`<span style="font-size:12px;color:var(--blue)">quitada</span>`;
      rows+=`<tr><td style="padding-left:14px;color:var(--muted);font-size:14px">${d.numParcela}/${d.totalParcelas}</td>
        <td style="color:var(--muted)">${fmtDate(d.venc)}</td>
        <td><span class="badge ${sb[d.status]}"><span class="badge-dot"></span>${d.status}</span></td>
        <td style="color:${d.status==='quitada'?'var(--muted)':'var(--red)'};font-weight:600">${fmt(d.valorParcela)}</td>
        <td>${acao}</td></tr>`;
    });
  });
  el.innerHTML=`<table><thead><tr><th style="padding-left:14px">Parcela</th><th>Vencimento</th><th>Status</th><th>Valor</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderGastos() {
  const el=document.getElementById('gastos-table');
  const total=state.gastos.reduce((s,g)=>s+g.valor,0);
  document.getElementById('gas-total-badge').textContent=state.gastos.length?'Total: '+fmt(total):'';
  if (!state.gastos.length) { el.innerHTML='<div class="empty">Nenhum gasto registrado.</div>'; return; }
  const s=[...state.gastos].sort((a,b)=>(b.data||'').localeCompare(a.data||''));
  el.innerHTML=`<table><thead><tr><th>Descrição</th><th>Categoria</th><th>Data</th><th>Valor</th><th></th></tr></thead><tbody>
    ${s.map(g=>`<tr><td>${esc(g.desc)}</td><td><span class="badge ${catColors[g.cat]||'amber'}"><span class="badge-dot"></span>${g.cat}</span></td>
    <td style="color:var(--muted)">${fmtDate(g.data)}</td>
    <td style="color:var(--amber);font-weight:600">${fmt(g.valor)}</td>
    <td><button class="delete-btn" aria-label="Remover" onclick="deleteItem('gastos','${g.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg></button></td></tr>`).join('')}
  </tbody></table>`;
}

// Dashboard — panorama GLOBAL (sem filtro de mês)
function renderDashboard() {
  const abertas=state.dividas.filter(d=>d.status!=='quitada');
  const tR=state.receitas.reduce((s,r)=>s+r.valor,0);
  const tG=state.gastos.reduce((s,g)=>s+g.valor,0);
  const tD=abertas.reduce((s,d)=>s+d.valorParcela,0);
  const saldo=tR-tG-tD;

  document.getElementById('dash-receitas').textContent=fmt(tR);
  document.getElementById('dash-receitas-sub').textContent=state.receitas.length+' lançamentos';
  document.getElementById('dash-dividas').textContent=fmt(tD);
  document.getElementById('dash-dividas-sub').textContent=abertas.length+' parcelas em aberto';
  document.getElementById('dash-gastos').textContent=fmt(tG);
  document.getElementById('dash-gastos-sub').textContent=state.gastos.length+' gastos registrados';
  document.getElementById('dash-saldo').textContent=fmt(saldo);
  document.getElementById('dash-saldo-sub').textContent=saldo>=0?'saldo positivo':'saldo negativo';

  const divPct=tR>0?Math.min(100,Math.round((tD/tR)*100)):0;
  const gasPct=tR>0?Math.min(100,Math.round((tG/tR)*100)):0;
  document.getElementById('comprometimento-pct').textContent=divPct+'%';
  document.getElementById('comprometimento-bar').style.cssText=`width:${divPct}%;background:${divPct>70?'var(--red)':divPct>40?'var(--amber)':'var(--green)'}`;
  document.getElementById('gastos-pct').textContent=gasPct+'%';
  document.getElementById('gastos-bar').style.cssText=`width:${gasPct}%;background:${gasPct>80?'var(--red)':gasPct>60?'var(--amber)':'var(--green)'}`;

  let msg='';
  if(tR===0) msg='Adicione suas receitas para ver a análise de saúde financeira.';
  else if(divPct>70) msg='⚠️ Suas parcelas comprometem mais de 70% das receitas. Priorize quitá-las.';
  else if(gasPct>80) msg='⚠️ Seus gastos estão elevados em relação às receitas. Revise despesas.';
  else if(saldo>0&&divPct<30) msg='✓ Situação saudável! Saldo positivo e dívidas controladas.';
  else msg='Situação moderada. Continue acompanhando seus gastos e dívidas.';
  document.getElementById('saude-msg').textContent=msg;

  const all=[
    ...state.receitas.map(r=>({criadoEm:r.criadoEm,desc:r.desc,valor:r.valor,tipo:'receita'})),
    ...state.dividas.map(d=>({criadoEm:d.criadoEm,desc:`${d.desc} (${d.numParcela}/${d.totalParcelas})`,valor:d.valorParcela,tipo:'divida'})),
    ...state.gastos.map(g=>({criadoEm:g.criadoEm,desc:g.desc,valor:g.valor,tipo:'gasto'})),
  ].sort((a,b)=>(b.criadoEm||'').localeCompare(a.criadoEm||'')).slice(0,7);
  const lEl=document.getElementById('dash-lancamentos-list');
  if(!all.length){lEl.innerHTML='<div class="empty">Nenhum lançamento ainda.</div>';}
  else{
    const cols={receita:'green',divida:'red',gasto:'amber'};
    const labs={receita:'Receita',divida:'Dívida',gasto:'Gasto'};
    lEl.innerHTML=`<table><thead><tr><th>Descrição</th><th>Tipo</th><th>Valor</th></tr></thead><tbody>
      ${all.map(x=>`<tr>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.desc)}</td>
        <td><span class="badge ${cols[x.tipo]}"><span class="badge-dot"></span>${labs[x.tipo]}</span></td>
        <td style="font-weight:600;color:var(--${cols[x.tipo]});white-space:nowrap">${fmt(x.valor)}</td>
      </tr>`).join('')}
    </tbody></table>`;
  }

  const byBank={};
  abertas.forEach(d=>{
    if(!byBank[d.banco]) byBank[d.banco]={total:0,atrasada:false};
    byBank[d.banco].total+=d.valorParcela;
    if(d.status==='atrasada') byBank[d.banco].atrasada=true;
  });
  const banks=Object.entries(byBank).sort((a,b)=>b[1].total-a[1].total);
  const bEl=document.getElementById('dash-banks-list');
  if(!banks.length){bEl.innerHTML='<div class="empty">Nenhuma dívida registrada.</div>';}
  else{
    bEl.innerHTML=banks.map(([banco,info])=>{
      const bc=bankColors[banco]||bankColors['Outro'];
      return `<div class="bank-item">
        <div class="bank-left">
          <div class="bank-icon" style="background:${bc.bg};color:${bc.text}">${bc.label}</div>
          <div><div class="bank-name">${esc(banco)}</div><div class="bank-detail">${info.atrasada?'⚠ parcela atrasada':'Em dia'}</div></div>
        </div>
        <div class="bank-value" style="color:${info.atrasada?'var(--red)':'var(--muted)'}">${fmt(info.total)}</div>
      </div>`;
    }).join('');
  }
  renderChart();
  renderNotificacoes();
  if(dashDrillAberto) renderDashDrill(dashDrillAberto);
}

function renderChart() {
  const now=new Date();
  const months=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    months.push({year:d.getFullYear(),month:d.getMonth(),label:ABREV[d.getMonth()]});
  }
  const vals=months.map(m=>
    state.receitas.filter(r=>{
      if(!r.data) return false;
      const d=new Date(r.data+'T12:00:00');
      return d.getFullYear()===m.year&&d.getMonth()===m.month;
    }).reduce((s,r)=>s+r.valor,0)
  );
  const max=Math.max(...vals,1);
  document.getElementById('chart-bars').innerHTML=months.map((m,i)=>{
    const h=Math.round((vals[i]/max)*100);
    const lbl=vals[i]>=1000?'R$'+(vals[i]/1000).toFixed(1).replace(/\.0$/,'')+'k':vals[i]>0?'R$'+Math.round(vals[i]):'';
    return `<div class="chart-bar-wrap">
      <div style="font-size:10px;color:var(--muted);margin-bottom:3px;text-align:center">${lbl}</div>
      <div class="chart-bar" style="height:${Math.max(h,vals[i]>0?6:2)}%;background:var(--green);opacity:${i===5?1:0.35}"></div>
      <div class="chart-bar-label">${m.label}</div>
    </div>`;
  }).join('');
}

// ---- CALENDÁRIO ----
function calMudaMes(delta) {
  calMes+=delta;
  if(calMes>11){calMes=0;calAno++;}
  if(calMes<0) {calMes=11;calAno--;}
  calDiaSel=null; calDrillAberto=null;
  document.querySelectorAll('[id^="drill-cal-"]').forEach(p=>p.classList.remove('open'));
  renderCalendario();
}

function getEventosDia(dia) {
  const key=`${calAno}-${pad(calMes+1)}-${pad(dia)}`;
  return {
    receitas: state.receitas.filter(r=>r.data===key),
    gastos:   state.gastos.filter(g=>g.data===key),
    dividas:  state.dividas.filter(d=>d.venc===key),
  };
}

function renderCalendario() {
  const mp=calMesPrefix();
  document.getElementById('cal-titulo').textContent=`${MESES[calMes]} ${calAno}`;
  document.getElementById('cal-mes-label').textContent=`${MESES[calMes]} ${calAno}`;

  const hoje=new Date();
  const totalDias=new Date(calAno,calMes+1,0).getDate();
  const primDia=new Date(calAno,calMes,1).getDay();
  let html='';
  for(let i=0;i<primDia;i++) html+=`<div class="cal-day vazio"></div>`;
  for(let d=1;d<=totalDias;d++){
    const ev=getEventosDia(d);
    const isHoje=hoje.getDate()===d&&hoje.getMonth()===calMes&&hoje.getFullYear()===calAno;
    const isSel=calDiaSel===d;
    let pips='';
    if(ev.receitas.length) pips+=`<div class="cal-pip receita"></div>`;
    if(ev.dividas.filter(x=>x.status!=='quitada').length) pips+=`<div class="cal-pip pagar"></div>`;
    if(ev.gastos.length) pips+=`<div class="cal-pip gasto"></div>`;
    html+=`<div class="cal-day${isHoje?' hoje':''}${isSel?' selected':''}" onclick="calSelecionaDia(${d})">
      <div class="cal-day-num">${d}</div>${pips}</div>`;
  }
  document.getElementById('cal-grid').innerHTML=html;

  const recMes=state.receitas.filter(r=>r.data&&r.data.startsWith(mp));
  const gasMes=state.gastos.filter(g=>g.data&&g.data.startsWith(mp));
  const divMes=state.dividas.filter(d=>d.venc&&d.venc.startsWith(mp)&&d.status!=='quitada');
  const tR=recMes.reduce((s,r)=>s+r.valor,0);
  const tG=gasMes.reduce((s,g)=>s+g.valor,0);
  const tD=divMes.reduce((s,d)=>s+d.valorParcela,0);
  const tPag=tG+tD;
  const saldo=tR-tPag;

  document.getElementById('cal-total-receitas').textContent=fmt(tR);
  document.getElementById('cal-sub-receitas').textContent=recMes.length+' lançamento(s)';
  document.getElementById('cal-total-pagar').textContent=fmt(tPag);
  document.getElementById('cal-sub-pagar').textContent=`${divMes.length} parcela(s) + ${gasMes.length} gasto(s)`;
  document.getElementById('cal-saldo').textContent=fmt(saldo);
  document.getElementById('cal-sub-saldo').textContent=saldo>=0?'saldo positivo':'saldo negativo';

  if(calDiaSel) calSelecionaDia(calDiaSel);
  if(calDrillAberto) renderCalDrill(calDrillAberto);

  const proximos=state.dividas
    .filter(d=>d.venc&&d.status!=='quitada')
    .map(d=>({...d,_d:new Date(d.venc+'T00:00:00')}))
    .filter(d=>{ const h=new Date(); h.setHours(0,0,0,0); return d._d>=h; })
    .sort((a,b)=>a._d-b._d).slice(0,5);
  const pEl=document.getElementById('cal-proximos');
  if(!proximos.length) pEl.innerHTML='<div class="empty" style="padding:10px 0">Nenhum vencimento próximo.</div>';
  else pEl.innerHTML=proximos.map(d=>{
    const dia=d.venc.split('-')[2];
    const mes=ABREV[parseInt(d.venc.split('-')[1])-1];
    return `<div class="venc-item">
      <div class="venc-dia">${dia}</div>
      <div class="venc-info"><div class="venc-nome">${esc(d.desc)} (${d.numParcela}/${d.totalParcelas})</div>
      <div class="venc-banco">${esc(d.banco)} · ${mes}</div></div>
      <div class="venc-valor">${fmt(d.valorParcela)}</div>
    </div>`;
  }).join('');

  const todos=[
    ...recMes.map(r=>({desc:r.desc,tipo:'receita',det:r.cat||'—',valor:r.valor,data:r.data})),
    ...gasMes.map(g=>({desc:g.desc,tipo:'gasto',det:g.cat||'—',valor:g.valor,data:g.data})),
    ...divMes.map(d=>({desc:`${d.desc} (${d.numParcela}/${d.totalParcelas})`,tipo:'divida',det:d.banco,valor:d.valorParcela,data:d.venc})),
  ].sort((a,b)=>(a.data||'').localeCompare(b.data||''));
  const lEl=document.getElementById('cal-lista-mes');
  if(!todos.length){lEl.innerHTML='<div class="empty">Nenhum lançamento neste mês.</div>';return;}
  const cores={receita:'green',gasto:'amber',divida:'red'};
  const labs={receita:'Receita',gasto:'Gasto',divida:'Parcela'};
  lEl.innerHTML=`<table><thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Detalhe</th><th>Valor</th></tr></thead><tbody>
    ${todos.map(x=>`<tr>
      <td style="color:var(--muted);white-space:nowrap">${fmtDate(x.data)}</td>
      <td style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.desc)}</td>
      <td><span class="badge ${cores[x.tipo]}"><span class="badge-dot"></span>${labs[x.tipo]}</span></td>
      <td style="color:var(--muted);font-size:14px">${esc(x.det)}</td>
      <td style="font-weight:600;color:var(--${cores[x.tipo]});white-space:nowrap">${fmt(x.valor)}</td>
    </tr>`).join('')}
  </tbody></table>`;
}

function calSelecionaDia(dia) {
  calDiaSel=dia;
  document.querySelectorAll('.cal-day:not(.vazio)').forEach((el,i)=>el.classList.toggle('selected',i===dia-1));
  document.getElementById('cal-dia-titulo').textContent=`${pad(dia)}/${pad(calMes+1)}/${calAno}`;
  const ev=getEventosDia(dia);
  const todos=[
    ...ev.receitas.map(r=>({desc:r.desc,tipo:'receita',extra:'',valor:r.valor})),
    ...ev.gastos.map(g=>({desc:g.desc,tipo:'gasto',extra:g.cat||'',valor:g.valor})),
    ...ev.dividas.map(d=>({desc:`${d.desc} (${d.numParcela}/${d.totalParcelas})`,tipo:'divida',extra:d.banco+' · '+d.status,valor:d.valorParcela})),
  ];
  const dEl=document.getElementById('cal-dia-detalhe');
  if(!todos.length){dEl.innerHTML='<div class="empty" style="padding:14px 0">Nenhum lançamento.</div>';return;}
  const cores={receita:'green',gasto:'amber',divida:'red'};
  const labs={receita:'Receita',gasto:'Gasto',divida:'Parcela'};
  dEl.innerHTML=todos.map(x=>`<div class="cal-evento-item">
    <div style="min-width:0;flex:1">
      <div style="font-size:14px;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.desc)}</div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <span class="badge ${cores[x.tipo]}" style="font-size:11px"><span class="badge-dot"></span>${labs[x.tipo]}</span>
        ${x.extra?`<span style="font-size:12px;color:var(--muted)">${esc(x.extra)}</span>`:''}
      </div>
    </div>
    <div style="font-weight:600;color:var(--${cores[x.tipo]});white-space:nowrap;margin-left:8px">${fmt(x.valor)}</div>
  </div>`).join('');
}

// ---- AVISOS DE VENCIMENTO (sino no topo) ----
function diasAte(iso) {
  const [y,m,d]=iso.split('-').map(Number);
  const h=new Date(); h.setHours(0,0,0,0);
  return Math.round((new Date(y,m-1,d)-h)/864e5);
}
function listaAvisos() {
  return state.dividas
    .filter(d=>d.venc && d.status!=='quitada')
    .map(d=>({d,dias:diasAte(d.venc)}))
    .filter(x=>x.dias<=7 || x.d.status==='atrasada')
    .sort((a,b)=>a.dias-b.dias || a.d.numParcela-b.d.numParcela);
}
function textoQuando(x) {
  const n=x.dias;
  if (n<0) return `Venceu há ${-n} dia${-n>1?'s':''}`;
  if (n===0) return 'Vence hoje';
  if (n===1) return 'Vence amanhã';
  return `Vence em ${n} dias`;
}
function renderNotificacoes() {
  const pop=document.getElementById('notif-pop'), bell=document.getElementById('bell');
  if (!pop||!bell) return;
  const av=listaAvisos();
  const n=av.length;
  bell.classList.toggle('has-alert', n>0);
  document.getElementById('bell-count').textContent=n>9?'9+':String(n);
  bell.setAttribute('aria-label', n? `Avisos de vencimento: ${n} pendente${n>1?'s':''}` : 'Avisos de vencimento: nenhum');
  const cab=`<div class="np-head"><b>Avisos</b><span>${n? n+' pendente'+(n>1?'s':'') : 'tudo em dia'}</span></div>`;
  if (!n) {
    pop.innerHTML=cab+`<div class="np-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><div>Nenhuma parcela vencendo nos próximos 7 dias.</div></div>`;
    return;
  }
  pop.innerHTML=cab+av.map(x=>{
    const d=x.d, cls=x.dias<0||d.status==='atrasada'?'late':(x.dias===0?'today':'');
    return `<button type="button" class="np-item ${cls}" onclick="irParaDividas()">
      <span class="np-dia">${d.venc.split('-')[2]}</span>
      <span class="np-info"><div class="np-nome">${esc(d.desc)} (${d.numParcela}/${d.totalParcelas})</div><div class="np-quando">${textoQuando(x)} · ${esc(d.banco)}</div></span>
      <span class="np-valor">${fmt(d.valorParcela)}</span></button>`;
  }).join('');
}
function abreAvisos(abrir) {
  const pop=document.getElementById('notif-pop'), bell=document.getElementById('bell');
  const quer = abrir===undefined ? !pop.classList.contains('open') : abrir;
  pop.classList.toggle('open', quer);
  bell.setAttribute('aria-expanded', quer?'true':'false');
}
function irParaDividas() { abreAvisos(false); showPage('dividas'); }
document.getElementById('bell').addEventListener('click', e=>{ e.stopPropagation(); renderNotificacoes(); abreAvisos(); });
document.addEventListener('click', e=>{ if(!e.target.closest('.notif-wrap')) abreAvisos(false); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape') abreAvisos(false); });
window.addEventListener('focus', renderNotificacoes);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) renderNotificacoes(); });
document.querySelectorAll('.logo-mark').forEach(el=>el.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); showPage('calendario'); } }));

// ---- INIT ----
function renderTudo() {
  renderDashboard(); renderReceitas(); renderDividas(); renderGastos(); renderMetas(); renderCalendario(); aplicaRotulos();
}
document.querySelectorAll('input[type="date"]').forEach(el=>{ el.value=hojeISO(); });
document.getElementById('cal-mes-label').textContent=`${MESES[calMes]} ${calAno}`;
showPage('calendario');
Data.loadAll().then(d=>{
  state=d;
  renderTudo();
}).catch(e=>{
  notify((e&&e.userMessage)||'Não foi possível carregar seus dados.');
});
