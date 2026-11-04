#!/usr/bin/env python3
"""Gera a versão da Edie que roda dentro do claude.ai (claude-ai/edie.html).

Ela é montada a partir dos mesmos arquivos do app (index.html, styles.css,
app.js), com estas trocas:
  - o "cérebro" usa o plano do Claude de quem está usando (capacidade
    `sample` da página), em vez de uma chave de API;
  - agenda, tarefas, conversa e preferências ficam salvas na conta da
    pessoa no claude.ai (capacidade `db`, área privada de cada usuário);
  - o que a página não consegue fazer lá dentro sai da tela: conexão com o
    Instagram e com o Google Agenda, backup em arquivo e chave de API.

Uso:  python3 tools/build_claude_page.py
"""
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / "index.html").read_text()
css = (ROOT / "styles.css").read_text()
js = (ROOT / "app.js").read_text()


def replace(src, old, new, count=1):
    n = src.count(old)
    if n != count:
        raise SystemExit(f"esperava {count} ocorrência(s), achei {n}: {old[:80]!r}")
    return src.replace(old, new)


def cut(src, start, end, new):
    """Troca tudo de `start` (inclusive) até `end` (exclusive) por `new`."""
    a = src.index(start)
    b = src.index(end, a)
    return src[:a] + new + src[b:]


# ---------------------------------------------------------------- JavaScript

STORAGE = r"""  // ---------- Armazenamento ----------
  // Dentro do claude.ai os dados ficam na conta da pessoa (área privada,
  // data/users/<id>). Uma cópia local deixa a abertura instantânea.
  const KEY = 'edie:v1';
  const defaults = () => ({
    name: '',
    events: [],
    tasks: [],
    ig: { token: '', cache: null, followerHistory: {} },
    ai: { tier: 'quick' },
    voice: { name: '', rate: 1.05, pitch: 1, on: true, handsFree: false },
    chat: [],
  });
  const SAVED = ['name', 'events', 'tasks', 'ai', 'voice'];
  let state = defaults();
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  let store = null, dirty = false, saving = false, saveTimer = null;
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
    if (!store) return;
    dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 700);
  };
  async function flush() {
    if (saving || !dirty || !store) return;
    saving = true; dirty = false;
    try {
      const main = {}; SAVED.forEach((k) => { main[k] = state[k]; });
      main.updatedAt = Date.now();
      await store.main.set(JSON.parse(JSON.stringify(main)));
      await store.chat.set({ chat: state.chat.slice(-60) });
    } catch (e) {
      if (e && e.code === 'quota_exceeded') toast('Seu espaço de dados está cheio. Apague tarefas antigas.');
      else dirty = true;
    } finally {
      saving = false;
      if (dirty) saveTimer = setTimeout(flush, 2000);
    }
  }
  function storeNote(text) { const el = $('#storeNote'); if (el) el.textContent = text; }
  async function connectStore() {
    const use = window.claude && window.claude.use ? (n) => window.claude.use(n).catch(() => null) : async () => null;
    const [db, user] = await Promise.all([use('db'), use('user')]);
    const id = user ? await user.id().catch(() => null) : null;
    if (!db || !id) { storeNote('Seus dados estão salvos só neste navegador. Entre na sua conta do claude.ai para salvar na nuvem.'); return; }
    const base = 'data/users/' + id;
    store = { main: db.doc(base + '/edie'), chat: db.doc(base + '/chat') };
    const hadLocal = state.tasks.length || state.events.length;
    let first = true;
    const slow = setTimeout(() => storeNote('Ainda não consegui falar com a nuvem. O que você fizer agora fica guardado e sobe quando a conexão voltar.'), 10000);
    store.main.onSnapshot((snap) => {
      if (snap.metadata.hasPendingWrites || dirty || saving) return;
      if (!snap.metadata.fromCache) { clearTimeout(slow); storeNote('Salvo na sua conta do claude.ai. Abre igual no celular e no computador.'); }
      if (snap.exists) {
        const d = snap.data();
        SAVED.forEach((k) => { if (d[k] !== undefined) state[k] = JSON.parse(JSON.stringify(d[k])); });
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
        applyPrefs(); render();
      } else if (first && hadLocal && !snap.metadata.fromCache) {
        save();
      }
      if (!snap.metadata.fromCache) first = false;
    }, () => { clearTimeout(slow); storeNote('Não consegui acessar a nuvem agora. Seus dados continuam neste navegador.'); });
    store.chat.get().then((c) => {
      if (c.exists && !state.chat.length) { state.chat = (c.data().chat || []).slice(); if (currentView === 'conversa') renderChat(); }
    }).catch(() => {});
  }

"""
js = cut(js, "  // ---------- Armazenamento ----------", "  // ---------- Navegação ----------", STORAGE)

METRICOOL = r"""  // Instagram de verdade pelo conector Metricool da conta do claude.ai
  const MC = 'Metricool Social Media Management';
  const MC_CACHE = 'edie:ig-metricool';
  const EVO = ['IGEV01', 'IGEV02', 'IGEV05', 'IGEV06', 'IGEV37', 'IGEV38', 'IGEV42', 'IGEV43', 'IGEV44'];
  const POSTS = ['IGPO02', 'IGPO03', 'IGPO06', 'IGPO07', 'IGPO13', 'IGPO08', 'IGPO14', 'IGPO12', 'IGPO28'];
  const REELS = ['IGRE02', 'IGRE03', 'IGRE06', 'IGRE10', 'IGRE07', 'IGRE11', 'IGRE09', 'IGRE23'];
  let igReal = null, igStatus = '', mcBrand = null, mcp = null;
  try { igReal = JSON.parse(localStorage.getItem(MC_CACHE) || 'null'); } catch {}
  const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
  const tzOffset = () => { const m = -new Date().getTimezoneOffset(); return `${m >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`; };
  const isoDay = (d, end) => `${ymd(d)}T${end ? '23:59:59' : '00:00:00'}${tzOffset()}`;
  const stamp = (s) => { s = String(s || ''); return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` + (s.length >= 12 ? `T${s.slice(8, 10)}:${s.slice(10, 12)}:00` : 'T12:00:00') : ''; };
  const MC_ERR = {
    server_not_connected: 'O Metricool não está conectado. Conecte em claude.ai → Configurações → Conectores.',
    needs_reauth: 'A conexão com o Metricool expirou. Reconecte em claude.ai → Configurações → Conectores.',
    not_in_manifest: 'Você não permitiu que a Edie use o Metricool. Toque em Atualizar para permitir.',
    approval_required: 'A Edie precisa da sua permissão para usar o Metricool. Toque em Atualizar.',
    selection_required: 'Você tem mais de um Metricool conectado. Escolha qual usar no aviso do claude.ai.',
    blocked_by_policy: 'Sua organização bloqueou o uso do Metricool aqui.',
    server_unavailable: 'O Metricool não respondeu agora. Mostrando os últimos dados que eu tinha.',
  };
  async function mcCall(tool, input, fresh) {
    const r = await mcp.callTool(MC, tool, input, { cache: fresh ? { staleTime: 0, gcTime: 86400000, refresh: true } : { staleTime: 15 * 60000, gcTime: 86400000 } });
    let p = r.payload;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch {} }
    return p;
  }
  async function mcBrandInfo(fresh) {
    if (mcBrand && !fresh) return mcBrand;
    const p = await mcCall('getBrandSettings', {}, fresh);
    const brands = (p && p.data) || [];
    const b = brands.find((x) => x.networksData && x.networksData.instagramData) || brands[0];
    if (!b) throw { code: 'no_brand' };
    mcBrand = { id: String(b.id), username: (b.networksData && b.networksData.instagramData) || '', tz: b.timezone };
    return mcBrand;
  }
  async function mcRows(metrics, fromDays, fresh, from, to) {
    const b = await mcBrandInfo();
    const p = await mcCall('getAnalyticsDataByMetrics', {
      brandId: b.id, metrics,
      from: from || isoDay(addDays(new Date(), -fromDays)), to: to || isoDay(new Date(), true),
    }, fresh);
    return (p && p.rows) || [];
  }
  async function fetchMetricool(fresh) {
    const b = await mcBrandInfo(fresh);
    const [evo, posts, reels] = await Promise.all([
      mcRows(EVO, 59, fresh),
      mcRows(POSTS, 59, fresh).catch(() => []),
      mcRows(REELS, 59, fresh).catch(() => []),
    ]);
    const days = evo.map((r) => ({
      date: stamp(r[r.length - 1]).slice(0, 10), followers: num(r[0]), following: num(r[1]), views: num(r[2]), reach: num(r[3]),
      content: num(r[4]), interactions: num(r[5]) ?? 0, engaged: num(r[6]), gained: num(r[7]), lost: num(r[8]),
    })).filter((d) => d.date).sort((a, b2) => a.date.localeCompare(b2.date));
    const last = [...days].reverse().find((d) => d.followers != null) || {};
    const media = [
      ...posts.map((r) => ({ timestamp: stamp(r[0]), caption: r[1], permalink: r[2], media_type: String(r[3] || '').includes('CAROUSEL') ? 'CAROUSEL_ALBUM' : 'IMAGE', like_count: num(r[4]) ?? 0, comments_count: num(r[5]) ?? 0, reach: num(r[6]), interactions: num(r[7]), views: num(r[8]) })),
      ...reels.map((r) => ({ timestamp: stamp(r[0]), caption: r[1], permalink: r[2], media_type: 'VIDEO', like_count: num(r[3]) ?? 0, comments_count: num(r[4]) ?? 0, reach: num(r[5]), interactions: num(r[6]), views: num(r[7]) })),
    ].filter((m) => m.permalink).sort((a, b2) => (b2.timestamp || '').localeCompare(a.timestamp || ''));
    const content30 = days.slice(-30).reduce((s, d) => s + (d.content || 0), 0);
    igReal = {
      demo: false, sourceLabel: 'Conectado pelo Metricool', fetchedAt: Date.now(),
      profile: { username: b.username, name: 'Instagram via Metricool', followers_count: last.followers ?? null, follows_count: last.following ?? null, media_count: content30 },
      mediaLabel: 'posts em 30 dias', days, media,
    };
    try { localStorage.setItem(MC_CACHE, JSON.stringify(igReal)); } catch {}
    return igReal;
  }
  function igData() { return igReal || demoIg(); }
  let igBusy = false;
  async function refreshIg(fresh = false) {
    if (igBusy) return;
    if (!mcp) {
      mcp = window.claude && window.claude.use ? await window.claude.use('mcp').catch(() => null) : null;
      if (!mcp) { igStatus = 'Dados de exemplo: esta página não consegue usar conectores aqui.'; render(); return; }
    }
    igBusy = true; igStatus = igReal ? '' : 'Buscando seus dados no Metricool…';
    if (currentView === 'instagram') $('#igSource').textContent = 'Atualizando pelo Metricool…';
    try {
      await fetchMetricool(fresh);
      igStatus = '';
      if (fresh) toast('Instagram atualizado');
    } catch (e) {
      const code = e && e.code;
      igStatus = code === 'no_brand' ? 'Não achei nenhuma marca no seu Metricool.'
        : code === 'tool_error' ? 'O Metricool respondeu com erro: ' + (e.message || '').slice(0, 140)
        : MC_ERR[code] || 'Não consegui falar com o Metricool agora. Toque em Atualizar para tentar de novo.';
      if (['server_not_connected', 'needs_reauth', 'not_in_manifest', 'blocked_by_policy'].includes(code)) {
        igReal = null; try { localStorage.removeItem(MC_CACHE); } catch {}
      }
      if (igReal) toast(igStatus);
    } finally { igBusy = false; render(); }
  }
  // Para a conversa: totais de qualquer período pedido
  async function igPeriod_(from, to) {
    const rows = await mcRows(EVO, 0, false, `${from}T00:00:00${tzOffset()}`, `${to}T23:59:59${tzOffset()}`);
    const days = rows.map((r) => ({ date: stamp(r[r.length - 1]).slice(0, 10), followers: num(r[0]), views: num(r[2]), reach: num(r[3]), content: num(r[4]), interactions: num(r[5]), engaged: num(r[6]), gained: num(r[7]), lost: num(r[8]) }))
      .sort((a, b2) => a.date.localeCompare(b2.date));
    const sum = (k) => days.reduce((s, d) => s + (d[k] || 0), 0);
    const f = days.filter((d) => d.followers != null);
    return { periodo: { de: from, ate: to }, dias_com_dados: days.length, seguidores_inicio: f[0]?.followers ?? null, seguidores_fim: f[f.length - 1]?.followers ?? null,
      alcance_somado_por_dia: sum('reach'), visualizacoes: sum('views'), interacoes: sum('interactions'), contas_engajadas: sum('engaged'),
      conteudos_publicados: sum('content'), seguidores_ganhos: sum('gained'), seguidores_perdidos: sum('lost') };
  }

"""

# Instagram: só dados de exemplo (a página não acessa sites externos)
js = cut(js, "  const IG_API", "  // Dados de exemplo determinísticos", "  let igPeriod = 7;\n\n")
js = cut(js, "  async function igGet(", "  function sumLast(", METRICOOL)
js = replace(js, """'Dados de exemplo · <button class="link" data-goto="config">Conectar minha conta</button>'""",
             """(igStatus || 'Dados de exemplo enquanto o Metricool não responde.')""")
js = replace(js, "  $('#igRefresh').onclick = () => state.ig.token ? refreshIg(true) : toast('Conecte sua conta em Configurações para dados reais');\n",
             "  $('#igRefresh').onclick = () => refreshIg(true);\n")

# Conversa: cérebro = plano do Claude da pessoa
js = replace(js, """    $('#brainInfo').innerHTML = state.ai.key ? `Inteligência: <b>Claude ${state.ai.model === 'claude-haiku-5-5' ? 'Haiku' : 'Opus'}</b> · conversa completa ✓` : 'Inteligência: <b>básica</b> (só dia, tarefas, agenda e Instagram)';
    $('#openAi').style.display = state.ai.key ? 'none' : '';
    if (!SR) $('#orbSub').textContent = 'Reconhecimento de voz indisponível neste navegador — escreva abaixo.';""",
"""    $('#brainInfo').innerHTML = sampleFn && !samplingOff
      ? `Inteligência: <b>Claude</b> pelo seu plano · ${TIER_NAMES[state.ai.tier] || TIER_NAMES.quick}`
      : 'Inteligência: <b>básica</b> (só dia, tarefas, agenda e Instagram)';
    if (!micOk) $('#orbSub').textContent = 'Escreva sua mensagem abaixo. A Edie responde com voz.';""")
js = replace(js, """    if (state.ai.key && window.Anthropic) {
      thinking = true; setOrb('thinking');
      try { reply = await claudeBrain(text); }
      catch (err) { reply = aiErrorText(err); addMsg('edie', reply); speak(reply); }
      finally { thinking = false; if (!speakingCount) setOrb('idle'); }
    } else {""", """    if (sampleFn && !samplingOff) {
      thinking = true; setOrb('thinking');
      try { reply = await sampleBrain(text); }
      finally { thinking = false; if (!speakingCount) setOrb('idle'); }
    } else {""")
js = replace(js, "    if ($('#optHands').checked && SR && currentView === 'conversa')", "    if ($('#optHands').checked && SR && micOk && currentView === 'conversa')")

SAMPLE_BRAIN = r"""  // O plano do Claude de quem usa a página responde (capacidade `sample`)
  let sampleFn = null, samplingOff = false, sampleCtl = null;
  const TIER_NAMES = { quick: 'respostas rápidas', default: 'equilibrada', complex: 'mais inteligente (mais lenta)', inherit: 'mesmo modelo do seu chat' };
  if (window.claude && window.claude.use) {
    window.claude.use('sample').then((s) => {
      sampleFn = s; render();
      if (s) s.limits().then((l) => {
        const opt = $('#cfgTier option[value="inherit"]');
        if (opt) opt.hidden = !(l && l.modelTiers && l.modelTiers.includes('inherit'));
      }).catch(() => {});
    }).catch(() => {});
  }
  let turns = []; // conversa em texto que a página guarda (Claude não guarda nada entre chamadas)

  const sampleTools = [...TOOLS, {
    name: 'consultar_instagram',
    description: 'Busca no Metricool os números do Instagram do usuário num período (alcance, visualizações, interações, seguidores ganhos e perdidos, conteúdos publicados). Use quando a pergunta for sobre um período que não está no contexto.',
    input_schema: { type: 'object', properties: { de: { type: 'string', description: 'AAAA-MM-DD' }, ate: { type: 'string', description: 'AAAA-MM-DD' } }, required: ['de', 'ate'] },
  }].map((t) => t.name === 'consultar_instagram' ? ({
    name: t.name, description: t.description, inputSchema: t.input_schema,
    async execute(input) {
      const de = String(input.de || ''), ate = String(input.ate || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) throw new Error('use datas AAAA-MM-DD');
      if (!mcp) throw new Error('Metricool não disponível nesta página');
      try { return await igPeriod_(de, ate); }
      catch (e) { throw new Error((e && (MC_ERR[e.code] || e.message)) || 'falha no Metricool'); }
    },
  }) : ({
    name: t.name,
    description: t.description,
    inputSchema: t.input_schema,
    execute(input) {
      const out = runTool(t.name, input); // erros viram "Error: ..." para o Claude
      addMsg('action', '⚡ ' + out.action);
      if (currentBubble) currentBubble.toEnd();
      return out;
    },
  }));

  let currentBubble = null;
  async function sampleBrain(text) {
    const rules = SYSTEM + '\n\nVocê está numa conversa por texto e voz dentro de um app pessoal. Responda só com o que a Edie diria.';
    const input = [{ role: 'user', content: rules }, ...turns, { role: 'user', content: contextBlock() + '\n\n' + text }];
    const bubble = addMsg('edie', 'Pensando…');
    currentBubble = bubble;
    bubble.el.classList.add('typing');
    let pendingSpeech = '', got = false;
    const flushSpeech = (all) => {
      const re = all ? /[\s\S]+/ : /[\s\S]*?[.!?…:](?=\s)/;
      let m;
      while ((m = pendingSpeech.match(re)) && m[0].trim()) { speak(m[0]); pendingSpeech = pendingSpeech.slice(m[0].length); if (all) break; }
    };
    sampleCtl = new AbortController();
    const tier = state.ai.tier || 'quick';
    const opts = {
      cache: false,
      signal: sampleCtl.signal,
      modelTier: tier,
      onText: ({ text: whole, delta }) => {
        got = true; thinking = false;
        bubble.set(whole);
        pendingSpeech += delta; flushSpeech(false);
      },
    };
    if (tier !== 'quick') opts.effort = 'low';
    try {
      const lim = await sampleFn.limits().catch(() => null);
      if (lim && lim.tools) opts.tools = sampleTools;
      const { text: answer } = await sampleFn(input, opts);
      bubble.el.classList.remove('typing');
      bubble.set(answer); save();
      flushSpeech(true);
      turns.push({ role: 'user', content: text }, { role: 'assistant', content: answer });
      if (turns.length > 16) turns = turns.slice(-16);
      return answer;
    } catch (e) {
      bubble.el.classList.remove('typing');
      const code = e && e.code;
      if (['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed', 'tools_unavailable'].includes(code)) samplingOff = true;
      const msg = {
        cancelled: 'Ok, parei.',
        not_granted: 'Sem permissão para usar o Claude, eu fico no modo básico. Se mudar de ideia, recarregue a página e toque em Permitir.',
        sampling_disabled: 'O Claude não está disponível nesta conta. Vou seguir no modo básico.',
        rate_limited: 'Você chegou no limite de uso do seu plano por agora. Tenta de novo daqui a pouco.',
        session_expired: 'Sua sessão do claude.ai expirou. Entre de novo para eu voltar a pensar.',
        refused: 'Sobre isso eu não posso ajudar. Quer tentar de outro jeito?',
        prompt_too_large: 'A conversa ficou grande demais. Vou começar uma nova.',
      }[code] || 'Tive um problema de conexão. Tenta de novo?';
      if (code === 'prompt_too_large') turns = [];
      const keep = code !== 'refused' && e && e.text ? e.text + '\n\n' : '';
      bubble.set(keep + msg); save();
      if (!got || code !== 'cancelled') speak(msg);
      if (samplingOff) render();
      return msg;
    } finally { sampleCtl = null; currentBubble = null; }
  }

"""
js = cut(js, "  // Histórico da conversa com a IA", "  // ---------- Ligações da interface ----------", SAMPLE_BRAIN)

# Microfone: dentro do claude.ai o navegador costuma bloquear. Se bloquear, some o botão.
js = replace(js, "  let rec = null, listening = false, thinking = false;",
             "  let rec = null, listening = false, thinking = false, micOk = !!SR;")
js = replace(js, """    rec.onerror = (e) => {
      const msg = {""", """    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { micOff(); return; }
      const msg = {""")
js = replace(js, "  function listen(fromBar = false) {\n    if (!SR) {", """  function micOff() {
    micOk = false;
    $$('.mic').forEach((m) => { m.hidden = true; });
    toast('O microfone não funciona dentro do claude.ai. Escreva sua mensagem que a Edie responde com voz.');
    $('#orbSub').textContent = 'Escreva sua mensagem abaixo. A Edie responde com voz.';
    $('#orbStatus').textContent = 'Toque para escrever';
  }
  function listen(fromBar = false) {
    if (!micOk) { go('conversa'); $('#chatInput').focus(); return; }
    if (!SR) {""")
js = replace(js, "    try { rec.start(); } catch { listening = false; setOrb('idle'); }",
             "    try { rec.start(); } catch { listening = false; setOrb('idle'); micOff(); }")
js = replace(js, "    if (e.key === 'Escape') { if (document.activeElement === $('#commandInput')) $('#commandInput').blur(); stopSpeaking(); }",
             "    if (e.key === 'Escape') { if (document.activeElement === $('#commandInput')) $('#commandInput').blur(); stopSpeaking(); if (sampleCtl) sampleCtl.abort(); }")

# Configurações
CONFIG = r"""  // ---------- Configurações ----------
  function applyPrefs() {
    $('#cfgName').value = state.name;
    $('#cfgRate').value = state.voice.rate;
    $('#cfgPitch').value = state.voice.pitch;
    $('#cfgTier').value = state.ai.tier || 'quick';
    $('#optVoice').checked = state.voice.on !== false;
    $('#optHands').checked = !!state.voice.handsFree;
    if (ptVoices.length && state.voice.name) $('#cfgVoice').value = state.voice.name;
  }
  applyPrefs();
  $('#cfgTier').addEventListener('change', () => { state.ai.tier = $('#cfgTier').value; save(); render(); toast('Pronto: ' + TIER_NAMES[state.ai.tier]); });
  const readVoiceForm = () => { state.voice.name = $('#cfgVoice').value; state.voice.rate = +$('#cfgRate').value; state.voice.pitch = +$('#cfgPitch').value; };
  $('#voiceForm').addEventListener('submit', (e) => { e.preventDefault(); readVoiceForm(); save(); toast('Voz salva'); });
  $('#voiceTest').onclick = () => { readVoiceForm(); stopSpeaking(); speak(`Oi${state.name ? ', ' + state.name : ''}! Eu sou a Edie. É assim que eu vou falar com você.`, true); };
  $('#profileForm').addEventListener('submit', (e) => {
    e.preventDefault(); state.name = $('#cfgName').value.trim(); save(); render(); toast('Salvo!');
  });

"""
js = cut(js, "  // ---------- Configurações ----------", "  // Importar .ics", CONFIG)
js = cut(js, "  // Backup", "  // ---------- Render geral ----------", "")
js = replace(js, "  refreshIg();\n", "  connectStore();\n  setTimeout(() => refreshIg(), 400);\n")
js = replace(js, "    return state.ai.key\n      ? 'Não consegui entender. Pode repetir de outro jeito?'\n      : ", "    return ")
js = replace(js, """'No modo básico eu só entendo pedidos sobre seu dia, tarefas, agenda e Instagram. Pra eu conversar sobre qualquer assunto, toque em "Ativar conversa completa".'""",
             """'No modo básico eu só entendo pedidos sobre seu dia, tarefas, agenda e Instagram. Para conversar sobre qualquer assunto, permita que a Edie use o Claude quando o claude.ai perguntar.'""")

for gone in ("window.Anthropic", "state.ai.key", "confirm(", "IG_API"):
    if gone in js:
        raise SystemExit(f"sobrou referência a {gone!r} no JS")

# ---------------------------------------------------------------- HTML

body = html[html.index("<body>") + len("<body>"):html.index("  <script src=")]
body, n = re.subn(r"  <!-- Ativar conversa completa -->.*?</dialog>\s*", "", body, flags=re.S)
if n != 1:
    raise SystemExit("não achei a janela da chave de API no index.html")
body = replace(body, """            <button class="btn blue" id="openAi" style="width:100%">✦ Ativar conversa completa</button>\n""", "")
body = replace(body, "<kbd>Ctrl</kbd>+<kbd>Espaço</kbd> falar com a Edie", "<kbd>Esc</kbd> interromper a Edie")

CONFIG_HTML = """      <section class="view" id="view-config">
        <div class="view-head"><h1>Configurações</h1></div>
        <div class="grid grid-2">
          <form class="card form" id="profileForm">
            <h2>Você</h2>
            <label>Como a Edie deve te chamar?<input id="cfgName" placeholder="Seu nome" /></label>
            <button class="btn primary">Salvar</button>
          </form>
          <div class="card form">
            <h2>Inteligência da Edie</h2>
            <p class="muted small">Aqui dentro do claude.ai a Edie pensa usando o seu próprio plano do Claude. Não precisa de chave e não tem custo extra; o uso conta nos limites do seu plano.</p>
            <label>Jeito de pensar
              <select id="cfgTier">
                <option value="quick">Rápida (recomendado)</option>
                <option value="default">Equilibrada (pensa mais)</option>
                <option value="complex">Mais inteligente (mais lenta)</option>
                <option value="inherit" hidden>Mesmo modelo do meu chat</option>
              </select>
            </label>
          </div>
          <form class="card form" id="voiceForm">
            <h2>Voz da Edie</h2>
            <label>Voz<select id="cfgVoice"></select></label>
            <div class="row">
              <label>Velocidade<input type="range" id="cfgRate" min="0.7" max="1.5" step="0.05" /></label>
              <label>Tom<input type="range" id="cfgPitch" min="0.6" max="1.6" step="0.05" /></label>
            </div>
            <p class="muted small">As vozes vêm do seu aparelho. No Chrome, "Google português do Brasil" costuma ser a mais natural.</p>
            <div class="row">
              <button class="btn primary">Salvar</button>
              <button class="btn ghost" type="button" id="voiceTest">▶ Testar voz</button>
            </div>
          </form>
          <div class="card form">
            <h2>Importar sua agenda</h2>
            <p class="muted small">No Google Agenda, vá em Configurações → Importar e exportar → Exportar. Descompacte e escolha o arquivo <code>.ics</code> aqui.</p>
            <label class="file">Escolher arquivo .ics<input type="file" id="icsFile" accept=".ics,text/calendar" /></label>
          </div>
          <div class="card form">
            <h2>Seus dados</h2>
            <p class="muted small" id="storeNote">Conectando à sua conta…</p>
            <p class="muted small">Ficam numa área privada sua: nem quem tiver o link desta página vê suas tarefas e compromissos.</p>
          </div>
          <div class="card form">
            <h2>Instagram</h2>
            <p class="muted small">Os números do seu Instagram vêm do Metricool conectado à sua conta do claude.ai. Na primeira vez, o claude.ai pergunta se a Edie pode usar o Metricool: toque em Permitir.</p>
            <p class="muted small">As fotos dos posts não aparecem aqui dentro (o claude.ai bloqueia imagens de outros sites), mas cada post abre no Instagram.</p>
          </div>
        </div>
      </section>
"""
a = body.index('      <section class="view" id="view-config">')
b = body.index("</section>", a) + len("</section>\n")
body = body[:a] + CONFIG_HTML + body[b:]

# ---------------------------------------------------------------- CSS

css = replace(css, ".main { padding: 18px 28px 40px; min-width: 0; }",
              ".main { padding-block: 18px 40px; padding-left: max(28px, env(safe-area-inset-left, 0px)); padding-right: max(28px, env(safe-area-inset-right, 0px)); min-width: 0; }")
css = replace(css, "  .main { padding: 14px 16px 40px; }",
              "  .main { padding-block: 14px 40px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }")
css = replace(css, "  .sidebar { position: fixed; left: 0; top: 0; z-index: 40; width: 250px; transform: translateX(-100%); transition: transform .2s; }",
              "  .sidebar { position: fixed; left: 0; top: 0; z-index: 40; width: 250px; transform: translateX(-100%); transition: transform .2s; padding-top: calc(20px + env(safe-area-inset-top, 0px)); padding-left: calc(14px + env(safe-area-inset-left, 0px)); }")
css += """
html, body { background: var(--bg); color: var(--text); }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
"""

page = f"""<title>e.d.i.e</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
{css}
</style>
{body}
<script>
{js}
</script>
"""
out = ROOT / "claude-ai" / "edie.html"
out.parent.mkdir(exist_ok=True)
out.write_text(page)
print(f"ok: {out.relative_to(ROOT)} ({len(page) // 1024} KB)")
