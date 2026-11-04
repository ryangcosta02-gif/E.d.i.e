/* e.d.i.e — assistente pessoal
 * App 100% no navegador: dados ficam no localStorage.
 * Módulos: Hoje · Agenda · Tarefas · Instagram · Configurações · Barra de comando
 */
(() => {
  'use strict';

  // ---------- Utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const today = () => ymd(new Date());
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = (n) => n == null || isNaN(n) ? '—' : new Intl.NumberFormat('pt-BR', { notation: n >= 100000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(n);
  const fmtDate = (s, opts = { weekday: 'short', day: '2-digit', month: 'short' }) => parseYmd(s).toLocaleDateString('pt-BR', opts);
  const WEEKDAYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Armazenamento ----------
  const KEY = 'edie:v1';
  const defaults = () => ({
    name: '',
    events: [],
    tasks: [],
    ig: { token: '', cache: null, followerHistory: {} },
    gcal: { id: '', key: '' },
  });
  let state;
  try { state = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch { state = defaults(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { toast('Não foi possível salvar: ' + e.message); } };

  // Primeira vez: alguns exemplos para a tela não ficar vazia
  if (!localStorage.getItem(KEY)) {
    const t = today(), am = ymd(addDays(new Date(), 1));
    state.events.push(
      { id: uid(), title: 'Planejar conteúdo da semana', date: t, start: '09:00', end: '10:00', place: '', notes: '' },
      { id: uid(), title: 'Reunião com cliente', date: am, start: '15:00', end: '16:00', place: 'Google Meet', notes: '' },
    );
    state.tasks.push(
      { id: uid(), title: 'Responder DMs do Instagram', date: t, prio: 3, tag: 'Instagram', done: false, created: Date.now() },
      { id: uid(), title: 'Gravar reels', date: t, prio: 2, tag: 'Instagram', done: false, created: Date.now() },
      { id: uid(), title: 'Pagar contas do mês', date: am, prio: 2, tag: 'Pessoal', done: false, created: Date.now() },
    );
    save();
  }

  // ---------- Navegação ----------
  let currentView = 'hoje';
  function go(view) {
    currentView = view;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    $('#sidebar').classList.remove('open');
    location.hash = view;
    render();
  }
  $$('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  document.addEventListener('click', (e) => { const g = e.target.closest('[data-goto]'); if (g) go(g.dataset.goto); });
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  // ---------- Hoje ----------
  function greeting() {
    const h = new Date().getHours();
    const g = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    return state.name ? `${g}, ${state.name}` : g;
  }
  const eventsOn = (date) => state.events.filter((e) => e.date === date).sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const pendingTasks = () => state.tasks.filter((t) => !t.done);
  const tasksForToday = () => pendingTasks().filter((t) => !t.date || t.date <= today()).sort(taskSort);
  function taskSort(a, b) {
    return (a.done - b.done) || ((a.date || '9999') .localeCompare(b.date || '9999')) || (b.prio - a.prio) || (a.created - b.created);
  }
  const timeRange = (e) => e.start ? (e.end ? `${e.start}–${e.end}` : e.start) : 'Dia todo';

  function renderHoje() {
    const t = today();
    const evs = eventsOn(t);
    const tks = tasksForToday();
    const late = tks.filter((x) => x.date && x.date < t).length;
    $('#greeting').textContent = greeting() + ' 👋';
    const parts = [];
    parts.push(evs.length ? `${evs.length} compromisso${evs.length > 1 ? 's' : ''} hoje` : 'nenhum compromisso hoje');
    parts.push(tks.length ? `${tks.length} tarefa${tks.length > 1 ? 's' : ''} pra fazer` : 'nenhuma tarefa pendente');
    if (late) parts.push(`${late} atrasada${late > 1 ? 's' : ''}`);
    const next = evs.find((e) => e.start && e.start >= nowHM());
    $('#summaryLine').textContent = 'Você tem ' + parts.join(', ') + '.' + (next ? ` Próximo: ${next.title} às ${next.start}.` : '');

    $('#statEventos').textContent = evs.length;
    $('#statTarefas').textContent = pendingTasks().length;

    $('#hojeEventos').innerHTML = evs.length ? evs.map(eventItem).join('') : '<li class="empty">Agenda livre hoje ✨</li>';
    $('#hojeTarefas').innerHTML = tks.length ? tks.slice(0, 8).map(taskItem).join('') : '<li class="empty">Tudo feito por hoje 🎉</li>';

    const ig = igData();
    if (ig) {
      $('#statSeguidores').textContent = fmtNum(ig.profile.followers_count);
      const d = deltaFollowers(ig.days, 7);
      $('#statSeguidoresDelta').innerHTML = d != null ? `<span class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${fmtNum(Math.abs(d))}</span> <span class="muted">em 7 dias</span>` : '';
      $('#hojeInsta').innerHTML = kpis(ig, 7).map(kpiHtml).join('');
    }
  }
  const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  function eventItem(e) {
    const isNow = e.date === today() && e.start && e.start <= nowHM() && (e.end || e.start) >= nowHM();
    return `<li class="clickable ${isNow ? 'now' : ''}" data-ev="${e.id}">
      <span class="time">${timeRange(e)}</span>
      <span class="grow"><div class="title">${esc(e.title)}</div>${e.place ? `<div class="sub">${esc(e.place)}</div>` : ''}</span>
      ${e.source ? `<span class="tag src">${e.source === 'google' ? 'Google' : 'Importado'}</span>` : ''}
    </li>`;
  }
  function taskItem(t) {
    const late = !t.done && t.date && t.date < today();
    const when = t.date ? (t.date === today() ? 'Hoje' : fmtDate(t.date)) : '';
    return `<li class="${t.done ? 'done' : ''}" data-task="${t.id}">
      <button class="check ${t.done ? 'on' : ''}" data-toggle="${t.id}" aria-label="Concluir">${t.done ? '✓' : ''}</button>
      <span class="prio prio-${t.prio}" title="Prioridade"></span>
      <span class="grow"><div class="title">${esc(t.title)}</div>${when ? `<div class="sub ${late ? 'late' : ''}">${late ? 'Atrasada · ' : ''}${when}</div>` : ''}</span>
      ${t.tag ? `<span class="tag">${esc(t.tag)}</span>` : ''}
      <button class="icon-btn" data-deltask="${t.id}" aria-label="Excluir">✕</button>
    </li>`;
  }

  document.addEventListener('click', (e) => {
    const tog = e.target.closest('[data-toggle]');
    if (tog) {
      const t = state.tasks.find((x) => x.id === tog.dataset.toggle);
      if (t) { t.done = !t.done; t.doneAt = t.done ? Date.now() : null; save(); render(); if (t.done) toast('Feito! ✓'); }
      return;
    }
    const del = e.target.closest('[data-deltask]');
    if (del) {
      state.tasks = state.tasks.filter((x) => x.id !== del.dataset.deltask);
      save(); render(); toast('Tarefa removida');
      return;
    }
    const ev = e.target.closest('[data-ev]');
    if (ev) openEvent(state.events.find((x) => x.id === ev.dataset.ev));
  });

  // ---------- Agenda ----------
  let calMonth = new Date(); calMonth.setDate(1);
  let selDay = today();

  function renderAgenda() {
    $('#monthLabel').textContent = calMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(' de ', ' ');
    const start = addDays(calMonth, -calMonth.getDay());
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = addDays(start, i);
      const s = ymd(d);
      const evs = eventsOn(s);
      const tks = state.tasks.filter((t) => t.date === s && !t.done);
      const items = [...evs.map((e) => `<div class="cal-ev">${e.start ? e.start + ' ' : ''}${esc(e.title)}</div>`), ...tks.map((t) => `<div class="cal-ev task">☐ ${esc(t.title)}</div>`)];
      const cls = ['cal-day', d.getMonth() !== calMonth.getMonth() && 'out', s === today() && 'today', s === selDay && 'sel', items.length && 'has'].filter(Boolean).join(' ');
      cells.push(`<button class="${cls}" data-day="${s}"><span class="n">${d.getDate()}</span>${items.slice(0, 3).join('')}${items.length > 3 ? `<span class="cal-more">+${items.length - 3}</span>` : ''}</button>`);
      if (i === 34 && addDays(start, 35).getMonth() !== calMonth.getMonth()) break;
    }
    $('#calGrid').innerHTML = cells.join('');
    $('#dayTitle').textContent = fmtDate(selDay, { weekday: 'long', day: 'numeric', month: 'long' });
    const evs = eventsOn(selDay);
    const tks = state.tasks.filter((t) => t.date === selDay).sort(taskSort);
    $('#dayEvents').innerHTML = (evs.length || tks.length)
      ? evs.map(eventItem).join('') + tks.map(taskItem).join('')
      : `<li class="empty">Nada marcado. <button class="link" id="quickAdd">Adicionar compromisso</button></li>`;
  }
  $('#calGrid').addEventListener('click', (e) => {
    const d = e.target.closest('[data-day]');
    if (!d) return;
    if (selDay === d.dataset.day) openEvent(null, selDay);
    selDay = d.dataset.day; renderAgenda();
  });
  $('#dayEvents').addEventListener('click', (e) => { if (e.target.id === 'quickAdd') openEvent(null, selDay); });
  $('#prevMonth').onclick = () => { calMonth.setMonth(calMonth.getMonth() - 1); renderAgenda(); };
  $('#nextMonth').onclick = () => { calMonth.setMonth(calMonth.getMonth() + 1); renderAgenda(); };
  $('#todayBtn').onclick = () => { calMonth = new Date(); calMonth.setDate(1); selDay = today(); renderAgenda(); };
  $('#addEventBtn').onclick = () => openEvent(null, selDay);

  let editing = null;
  function openEvent(ev, date) {
    editing = ev || null;
    $('#eventDialogTitle').textContent = ev ? 'Editar compromisso' : 'Novo compromisso';
    $('#evTitle').value = ev?.title || '';
    $('#evDate').value = ev?.date || date || today();
    $('#evStart').value = ev?.start || '';
    $('#evEnd').value = ev?.end || '';
    $('#evPlace').value = ev?.place || '';
    $('#evNotes').value = ev?.notes || '';
    $('#evDelete').style.display = ev ? '' : 'none';
    $('#eventDialog').showModal();
    $('#evTitle').focus();
  }
  $('#eventDialog').addEventListener('close', () => {
    if ($('#eventDialog').returnValue !== 'save') return;
    const data = {
      title: $('#evTitle').value.trim(), date: $('#evDate').value, start: $('#evStart').value,
      end: $('#evEnd').value, place: $('#evPlace').value.trim(), notes: $('#evNotes').value.trim(),
    };
    if (!data.title || !data.date) return;
    if (editing) Object.assign(editing, data);
    else state.events.push({ id: uid(), ...data });
    save(); selDay = data.date; render(); toast('Compromisso salvo');
  });
  $('#evDelete').onclick = () => {
    if (!editing) return;
    state.events = state.events.filter((x) => x !== editing);
    save(); $('#eventDialog').close(); render(); toast('Compromisso excluído');
  };

  // ---------- Tarefas ----------
  let taskFilter = 'hoje';
  $('#taskFilter').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    taskFilter = b.dataset.f;
    $$('#taskFilter button').forEach((x) => x.classList.toggle('active', x === b));
    renderTarefas();
  });
  function renderTarefas() {
    const t = today();
    const f = {
      hoje: (x) => !x.done && (!x.date || x.date <= t),
      pendentes: (x) => !x.done,
      atrasadas: (x) => !x.done && x.date && x.date < t,
      feitas: (x) => x.done,
    }[taskFilter];
    let list = state.tasks.filter(f).sort(taskSort);
    if (taskFilter === 'feitas') list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    const empty = { hoje: 'Nada pendente pra hoje 🎉', pendentes: 'Nenhuma tarefa pendente', atrasadas: 'Nada atrasado 👏', feitas: 'Nenhuma tarefa concluída ainda' }[taskFilter];
    $('#taskList').innerHTML = list.length ? list.map(taskItem).join('') : `<li class="empty">${empty}</li>`;
    const tags = [...new Set(state.tasks.map((x) => x.tag).filter(Boolean))];
    $('#tagList').innerHTML = tags.map((x) => `<option value="${esc(x)}">`).join('');
  }
  $('#taskDate').value = today();
  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#taskTitle').value.trim(); if (!title) return;
    addTask({ title, date: $('#taskDate').value, prio: +$('#taskPrio').value, tag: $('#taskTag').value.trim() });
    $('#taskTitle').value = ''; $('#taskTitle').focus();
  });
  function addTask({ title, date = '', prio = 2, tag = '' }) {
    state.tasks.push({ id: uid(), title, date, prio, tag, done: false, created: Date.now() });
    save(); render();
  }

  // ---------- Instagram ----------
  const IG_API = 'https://graph.instagram.com/v21.0';
  let igPeriod = 7;
  let igLoading = false;

  // Dados de exemplo determinísticos (mudam por dia, mas são estáveis no mesmo dia)
  function demoIg() {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const days = [];
    let followers = 12480;
    for (let i = 29; i >= 0; i--) {
      const date = ymd(addDays(new Date(), -i));
      const reach = Math.round(1800 + rnd() * 2600 + (i % 7 === 2 ? 3000 : 0));
      followers += Math.round(rnd() * 40 - 6);
      days.push({ date, reach, views: Math.round(reach * (1.6 + rnd())), engaged: Math.round(reach * (0.05 + rnd() * 0.05)), interactions: Math.round(reach * (0.07 + rnd() * 0.06)), followers });
    }
    const caps = ['Bastidores do projeto novo ✨', '3 dicas que mudaram minha rotina', 'Reels: um dia comigo', 'Carrossel: antes e depois', 'Respondendo perguntas de vocês', 'Novidade chegando…', 'Tutorial rápido', 'Resultado do mês 📈', 'Trend da semana'];
    const types = ['VIDEO', 'CAROUSEL_ALBUM', 'IMAGE'];
    const media = caps.map((c, i) => ({
      id: 'demo' + i, caption: c, media_type: types[i % 3], permalink: '#',
      timestamp: addDays(new Date(), -i * 3).toISOString(),
      like_count: Math.round(200 + rnd() * 1400), comments_count: Math.round(10 + rnd() * 120),
    }));
    return {
      demo: true, fetchedAt: Date.now(),
      profile: { username: 'seu.perfil', name: 'Seu Perfil', followers_count: followers, follows_count: 512, media_count: 348 },
      days, media,
    };
  }

  async function igGet(path, params = {}) {
    const url = new URL(IG_API + path);
    Object.entries({ ...params, access_token: state.ig.token }).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url);
    const j = await r.json();
    if (j.error) throw new Error(j.error.message);
    return j;
  }

  async function fetchIg() {
    const profile = await igGet('/me', { fields: 'user_id,username,name,profile_picture_url,followers_count,follows_count,media_count' });
    const until = Math.floor(Date.now() / 1000);
    const since = until - 29 * 86400;
    const days = {};
    const day = (d) => (days[d] ||= { date: d });

    // Série diária de alcance (até 30 dias por chamada)
    try {
      const r = await igGet('/me/insights', { metric: 'reach', period: 'day', since, until });
      (r.data?.[0]?.values || []).forEach((v) => { day(ymd(new Date(v.end_time)) ).reach = v.value; });
    } catch (e) { console.warn('reach', e); }

    // Totais por dia (views, contas engajadas, interações) — uma chamada por dia é pesado; pegamos totais por janela
    const totals = {};
    for (const span of [7, 30]) {
      try {
        const s = until - span * 86400;
        const r = await igGet('/me/insights', { metric: 'views,accounts_engaged,total_interactions', period: 'day', metric_type: 'total_value', since: s, until });
        totals[span] = Object.fromEntries((r.data || []).map((m) => [m.name, m.total_value?.value ?? null]));
      } catch (e) { console.warn('totals', span, e); }
    }

    let media = [];
    try {
      const r = await igGet('/me/media', { fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count', limit: 24 });
      media = r.data || [];
    } catch (e) { console.warn('media', e); }

    // Histórico de seguidores: guardamos uma foto por dia
    state.ig.followerHistory[today()] = profile.followers_count;
    const hist = state.ig.followerHistory;
    Object.keys(hist).sort().slice(0, -120).forEach((k) => delete hist[k]);
    Object.entries(hist).forEach(([d, v]) => { day(d).followers = v; });

    const data = { demo: false, fetchedAt: Date.now(), profile, days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)), media, totals };
    state.ig.cache = data; save();
    return data;
  }

  function igData() {
    if (!state.ig.token) return demoIg();
    return state.ig.cache || null;
  }

  async function refreshIg(force = false) {
    if (!state.ig.token || igLoading) return;
    const c = state.ig.cache;
    if (!force && c && Date.now() - c.fetchedAt < 3600e3) return;
    igLoading = true; $('#igSource').textContent = 'Atualizando…';
    try { await fetchIg(); toast('Instagram atualizado'); }
    catch (e) { toast('Erro no Instagram: ' + e.message); }
    finally { igLoading = false; render(); }
  }

  function sumLast(days, key, n) {
    const slice = days.slice(-n).map((d) => d[key]).filter((v) => v != null);
    return slice.length ? slice.reduce((a, b) => a + b, 0) : null;
  }
  function deltaFollowers(days, n) {
    const f = days.filter((d) => d.followers != null);
    if (f.length < 2) return null;
    const cutoff = ymd(addDays(new Date(), -n));
    const base = f.find((d) => d.date >= cutoff) || f[0];
    return f[f.length - 1].followers - base.followers;
  }
  function kpis(ig, n) {
    const t = ig.totals?.[n] || {};
    const reach = sumLast(ig.days, 'reach', n);
    const views = t.views ?? sumLast(ig.days, 'views', n);
    const inter = t.total_interactions ?? sumLast(ig.days, 'interactions', n);
    const engaged = t.accounts_engaged ?? sumLast(ig.days, 'engaged', n);
    const rate = reach && inter != null ? (inter / reach) * 100 : null;
    const prevReach = ig.demo ? sumLast(ig.days.slice(0, -n), 'reach', n) : null;
    return [
      { label: 'Alcance', value: reach, prev: prevReach },
      { label: 'Visualizações', value: views },
      { label: 'Interações', value: inter, sub: engaged != null ? `${fmtNum(engaged)} contas engajadas` : '' },
      { label: 'Taxa de engajamento', value: rate, fmt: (v) => v.toFixed(1).replace('.', ',') + '%' },
    ];
  }
  function kpiHtml(k) {
    let delta = '';
    if (k.prev && k.value != null) {
      const p = ((k.value - k.prev) / k.prev) * 100;
      delta = `<div class="stat-delta"><span class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(0)}%</span> <span class="muted">vs período anterior</span></div>`;
    } else if (k.sub) delta = `<div class="stat-delta muted">${k.sub}</div>`;
    const v = k.value == null ? '—' : k.fmt ? k.fmt(k.value) : fmtNum(k.value);
    return `<div class="kpi"><div class="stat-label">${k.label}</div><div class="stat-value">${v}</div>${delta}</div>`;
  }

  function renderInstagram() {
    const ig = igData();
    if (!ig) {
      $('#igSource').textContent = 'Carregando dados da sua conta…';
      $('#igProfile').innerHTML = '<span class="muted">Buscando…</span>';
      ['#igKpis', '#igChartReach', '#igChartFollowers', '#igPosts'].forEach((s) => ($(s).innerHTML = ''));
      refreshIg(true);
      return;
    }
    $('#igSource').innerHTML = ig.demo
      ? 'Dados de exemplo · <button class="link" data-goto="config">Conectar minha conta</button>'
      : `Conta conectada · atualizado ${new Date(ig.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const p = ig.profile;
    const initial = (p.username || '?')[0].toUpperCase();
    $('#igProfile').innerHTML = `
      <div class="avatar">${p.profile_picture_url ? `<img src="${esc(p.profile_picture_url)}" alt="">` : `<div>${initial}</div>`}</div>
      <div><div style="font-weight:700;font-size:1.1rem">@${esc(p.username)}</div><div class="muted">${esc(p.name || '')}</div></div>
      <div class="nums">
        <div><b>${fmtNum(p.media_count)}</b><span class="muted small">posts</span></div>
        <div><b>${fmtNum(p.followers_count)}</b><span class="muted small">seguidores</span></div>
        <div><b>${fmtNum(p.follows_count)}</b><span class="muted small">seguindo</span></div>
      </div>`;
    $('#igKpis').innerHTML = kpis(ig, igPeriod).map(kpiHtml).join('');

    const days = ig.days.slice(-igPeriod);
    $('#igChartReach').innerHTML = barChart(days.map((d) => ({ x: d.date, y: d.reach ?? 0 })));
    const fdays = ig.days.filter((d) => d.followers != null).slice(-igPeriod);
    $('#igChartFollowers').innerHTML = fdays.length >= 2
      ? lineChart(fdays.map((d) => ({ x: d.date, y: d.followers })))
      : '<p class="muted small">O histórico de seguidores começa a ser montado a partir de hoje — volte nos próximos dias para ver a evolução.</p>';

    const posts = [...ig.media].sort((a, b) => ((b.like_count || 0) + (b.comments_count || 0)) - ((a.like_count || 0) + (a.comments_count || 0)));
    const icon = { VIDEO: '▶', CAROUSEL_ALBUM: '❐', IMAGE: '◻' };
    $('#igPosts').innerHTML = posts.length ? posts.map((m) => {
      const img = m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url;
      return `<a class="post" href="${esc(m.permalink)}" target="_blank" rel="noopener">
        <div class="thumb" style="${img ? `background-image:url('${esc(img)}')` : ''}">${img ? '' : icon[m.media_type] || '◻'}</div>
        <div class="meta">
          <div class="cap">${esc(m.caption || '(sem legenda)')}</div>
          <div class="eng"><span>♥ ${fmtNum(m.like_count)}</span><span>💬 ${fmtNum(m.comments_count)}</span></div>
          <div class="muted">${new Date(m.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</div>
        </div></a>`;
    }).join('') : '<p class="muted">Nenhum post encontrado.</p>';
  }
  $('#igPeriod').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    igPeriod = +b.dataset.d;
    $$('#igPeriod button').forEach((x) => x.classList.toggle('active', x === b));
    renderInstagram();
  });
  $('#igRefresh').onclick = () => state.ig.token ? refreshIg(true) : toast('Conecte sua conta em Configurações para dados reais');

  // ---------- Gráficos (SVG simples) ----------
  const W = 600, H = 220, PL = 44, PB = 26, PT = 10;
  function scale(points) {
    const ys = points.map((p) => p.y);
    let min = Math.min(...ys), max = Math.max(...ys);
    return { min, max };
  }
  function axes(min, max, points, step) {
    const lines = [];
    for (let i = 0; i <= 3; i++) {
      const v = min + ((max - min) * i) / 3;
      const y = H - PB - ((H - PB - PT) * i) / 3;
      lines.push(`<line class="grid-line" x1="${PL}" x2="${W}" y1="${y}" y2="${y}"/><text class="axis" x="${PL - 6}" y="${y + 4}" text-anchor="end">${fmtNum(Math.round(v))}</text>`);
    }
    const every = Math.ceil(points.length / 8);
    points.forEach((p, i) => {
      if (i % every) return;
      const x = PL + step * i + (step / 2);
      lines.push(`<text class="axis" x="${x}" y="${H - 6}" text-anchor="middle">${fmtDate(p.x, { day: '2-digit', month: '2-digit' })}</text>`);
    });
    return lines.join('');
  }
  function barChart(points) {
    if (!points.length) return '<p class="muted small">Sem dados.</p>';
    const max = Math.max(...points.map((p) => p.y), 1);
    const step = (W - PL) / points.length;
    const bw = Math.max(4, step * 0.65);
    const bars = points.map((p, i) => {
      const h = ((H - PB - PT) * p.y) / max;
      return `<rect class="bar" rx="4" x="${PL + step * i + (step - bw) / 2}" y="${H - PB - h}" width="${bw}" height="${h}"><title>${fmtDate(p.x)}: ${fmtNum(p.y)}</title></rect>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${axes(0, max, points, step)}${bars}</svg>`;
  }
  function lineChart(points) {
    let { min, max } = scale(points);
    const padv = Math.max(1, (max - min) * 0.15); min -= padv; max += padv;
    const step = (W - PL) / points.length;
    const xy = points.map((p, i) => [PL + step * i + step / 2, H - PB - ((H - PB - PT) * (p.y - min)) / (max - min)]);
    const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    const area = `${d}L${xy[xy.length - 1][0]},${H - PB}L${xy[0][0]},${H - PB}Z`;
    const dots = xy.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="3" fill="var(--accent-2)"><title>${fmtDate(points[i].x)}: ${fmtNum(points[i].y)}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${axes(min, max, points, step)}<path class="area" d="${area}"/><path class="line" d="${d}"/>${dots}</svg>`;
  }

  // ---------- Barra de comando (linguagem natural simples) ----------
  function parseDate(text) {
    const t = norm(text);
    const base = new Date();
    let m;
    if (/\bdepois de amanha\b/.test(t)) return { date: ymd(addDays(base, 2)), re: /depois de amanh[ãa]/i };
    if (/\bamanha\b/.test(t)) return { date: ymd(addDays(base, 1)), re: /amanh[ãa]/i };
    if (/\bhoje\b/.test(t)) return { date: ymd(base), re: /hoje/i };
    if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
      let y = m[3] ? +m[3] : base.getFullYear(); if (y < 100) y += 2000;
      const d = new Date(y, +m[2] - 1, +m[1]);
      if (!m[3] && ymd(d) < ymd(base)) d.setFullYear(y + 1);
      return { date: ymd(d), re: new RegExp(`(no dia |dia )?${m[0].replace(/\//g, '\\/')}`, 'i') };
    }
    for (let i = 0; i < 7; i++) {
      const w = WEEKDAYS[i];
      const r = new RegExp(`\\b(na |no |nesta |neste |proxima |proximo )?${w}(-feira)?\\b`);
      if (r.test(t)) {
        let diff = (i - base.getDay() + 7) % 7; if (diff === 0) diff = 7;
        const accent = w.replace('terca', 'ter[çc]a').replace('sabado', 's[áa]bado');
        return { date: ymd(addDays(base, diff)), re: new RegExp(`(na |no |nesta |neste |pr[óo]xima |pr[óo]ximo )?${accent}(-feira)?`, 'i') };
      }
    }
    return null;
  }
  function parseTime(text) {
    const m = text.match(/(?:^|\s)(?:[àa]s?\s+)?(\d{1,2})(?:[:h](\d{2})?|\s*horas?)(?=\s|$|[,.])/i);
    if (!m) return null;
    const h = +m[1]; if (h > 23) return null;
    return { time: `${pad(h)}:${m[2] || '00'}`, re: m[0] };
  }
  const clean = (s) => s.replace(/\s{2,}/g, ' ').replace(/^[\s,:-]+|[\s,:-]+$/g, '');

  function runCommand(raw) {
    let text = raw.trim(); if (!text) return;
    const n = norm(text);
    const navMap = { agenda: 'agenda', calendario: 'agenda', instagram: 'instagram', insta: 'instagram', metricas: 'instagram', tarefas: 'tarefas', hoje: 'hoje', inicio: 'hoje', configuracoes: 'config', config: 'config' };
    const navWord = n.replace(/^(abrir|abre|ver|mostrar|mostra|ir para|ir pra)\s+/, '');
    if (navMap[navWord]) { go(navMap[navWord]); return; }
    if (/^(o que (eu )?tenho|como (esta|ta) (meu|o) dia|resumo)/.test(n)) { go('hoje'); toast($('#summaryLine').textContent); return; }

    const isEvent = /^(evento|compromisso|reuniao|marcar|marca|agendar|agenda)\b/.test(n);
    const isTask = /^(tarefa|lembrar de|lembrar|lembre-me de|preciso|fazer|todo)\b/.test(n);
    text = text.replace(/^(evento|compromisso|marcar|marca|agendar|tarefa|lembre-me de|lembrar de|lembrar|preciso|fazer|todo)\s*:?\s*/i, '');

    const d = parseDate(text); if (d) text = text.replace(d.re, ' ');
    const tm = parseTime(text);

    if (isEvent || (tm && !isTask)) {
      if (tm) text = text.replace(tm.re, ' ');
      const title = clean(text) || 'Compromisso';
      const date = d?.date || today();
      const ev = { id: uid(), title: title[0].toUpperCase() + title.slice(1), date, start: tm?.time || '', end: tm ? `${pad(Math.min(23, +tm.time.slice(0, 2) + 1))}:${tm.time.slice(3)}` : '', place: '', notes: '' };
      state.events.push(ev); save(); render();
      toast(`📅 "${ev.title}" — ${fmtDate(date)}${ev.start ? ' às ' + ev.start : ''}`);
      return;
    }
    let prio = 2;
    if (/\b(urgente|importante)\b/i.test(text)) { prio = 3; text = text.replace(/\b(urgente|importante)\b/gi, ' '); }
    const title = clean(text);
    if (!title) return;
    addTask({ title: title[0].toUpperCase() + title.slice(1), date: d?.date || today(), prio });
    toast(`✓ Tarefa adicionada${d ? ' para ' + fmtDate(d.date) : ' para hoje'}`);
  }
  $('#commandForm').addEventListener('submit', (e) => {
    e.preventDefault();
    runCommand($('#commandInput').value);
    $('#commandInput').value = '';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#commandInput').focus(); }
    if (e.key === 'Escape' && document.activeElement === $('#commandInput')) $('#commandInput').blur();
  });

  // ---------- Configurações ----------
  $('#cfgName').value = state.name;
  $('#cfgIgToken').value = state.ig.token;
  $('#cfgGcalId').value = state.gcal.id;
  $('#cfgGcalKey').value = state.gcal.key;

  $('#profileForm').addEventListener('submit', (e) => {
    e.preventDefault(); state.name = $('#cfgName').value.trim(); save(); render(); toast('Salvo!');
  });
  $('#igForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.ig.token = $('#cfgIgToken').value.trim(); state.ig.cache = null; save();
    if (!state.ig.token) return toast('Cole o token de acesso');
    go('instagram');
  });
  $('#igDisconnect').onclick = () => { state.ig.token = ''; state.ig.cache = null; $('#cfgIgToken').value = ''; save(); render(); toast('Usando dados de exemplo'); };

  // Google Agenda (agenda pública + chave de API)
  $('#gcalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    state.gcal = { id: $('#cfgGcalId').value.trim(), key: $('#cfgGcalKey').value.trim() }; save();
    if (!state.gcal.id || !state.gcal.key) return toast('Informe o ID da agenda e a chave de API');
    try {
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(state.gcal.id)}/events`);
      Object.entries({ key: state.gcal.key, singleEvents: 'true', orderBy: 'startTime', maxResults: '500',
        timeMin: addDays(new Date(), -60).toISOString(), timeMax: addDays(new Date(), 180).toISOString() })
        .forEach(([k, v]) => url.searchParams.set(k, v));
      const r = await fetch(url); const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      const evs = (j.items || []).filter((x) => x.status !== 'cancelled').map((x) => {
        const s = x.start.dateTime ? new Date(x.start.dateTime) : parseYmd(x.start.date);
        const en = x.end?.dateTime ? new Date(x.end.dateTime) : null;
        return { id: 'g_' + x.id, source: 'google', title: x.summary || '(sem título)', date: ymd(s),
          start: x.start.dateTime ? `${pad(s.getHours())}:${pad(s.getMinutes())}` : '',
          end: en ? `${pad(en.getHours())}:${pad(en.getMinutes())}` : '', place: x.location || x.hangoutLink || '', notes: x.description || '' };
      });
      state.events = state.events.filter((x) => x.source !== 'google').concat(evs);
      save(); render(); toast(`${evs.length} eventos sincronizados do Google`);
    } catch (err) { toast('Erro no Google Agenda: ' + err.message); }
  });
  $('#gcalClear').onclick = () => {
    const before = state.events.length;
    state.events = state.events.filter((x) => !x.source);
    save(); render(); toast(`${before - state.events.length} eventos importados removidos`);
  };

  // Importar .ics
  $('#icsFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const evs = parseIcs(await f.text());
    const ids = new Set(state.events.map((x) => x.id));
    const novos = evs.filter((x) => !ids.has(x.id));
    state.events.push(...novos); save(); render();
    toast(`${novos.length} eventos importados`);
    e.target.value = '';
  });
  function parseIcs(txt) {
    const lines = txt.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
    const out = []; let cur = null;
    const unesc = (s) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    const parseDt = (v) => {
      const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
      if (!m) return null;
      if (!m[4]) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: '' };
      const d = m[7] ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])) : new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]);
      return { date: ymd(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
    };
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') cur = {};
      else if (line === 'END:VEVENT' && cur) {
        const s = cur.DTSTART && parseDt(cur.DTSTART);
        if (s) {
          const en = cur.DTEND && parseDt(cur.DTEND);
          out.push({ id: 'ics_' + (cur.UID || uid()) + '_' + s.date, source: 'ics', title: unesc(cur.SUMMARY || '(sem título)'), date: s.date, start: s.time, end: en?.time || '', place: unesc(cur.LOCATION || ''), notes: unesc(cur.DESCRIPTION || '') });
        }
        cur = null;
      } else if (cur) {
        const i = line.indexOf(':'); if (i < 0) continue;
        const key = line.slice(0, i).split(';')[0];
        cur[key] = line.slice(i + 1);
      }
    }
    return out;
  }

  // Backup
  $('#exportBtn').onclick = () => {
    const copy = JSON.parse(JSON.stringify(state)); copy.ig.token = ''; copy.gcal.key = '';
    const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `edie-backup-${today()}.json` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  $('#importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const keep = { token: state.ig.token, key: state.gcal.key };
      state = Object.assign(defaults(), data);
      state.ig.token ||= keep.token; state.gcal.key ||= keep.key;
      save(); render(); toast('Backup restaurado');
    } catch { toast('Arquivo inválido'); }
    e.target.value = '';
  });
  $('#resetBtn').onclick = () => {
    if (!confirm('Apagar todos os dados da Edie neste navegador?')) return;
    localStorage.removeItem(KEY); location.reload();
  };

  // ---------- Render geral ----------
  function render() {
    $('#todayChip').textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    ({ hoje: renderHoje, agenda: renderAgenda, tarefas: renderTarefas, instagram: renderInstagram, config: () => {} }[currentView] || renderHoje)();
  }

  const initial = location.hash.slice(1);
  go(['hoje', 'agenda', 'tarefas', 'instagram', 'config'].includes(initial) ? initial : 'hoje');
  refreshIg();
  // Atualiza "agora" e saudação a cada minuto
  setInterval(() => { if (currentView === 'hoje') renderHoje(); }, 60000);
})();
