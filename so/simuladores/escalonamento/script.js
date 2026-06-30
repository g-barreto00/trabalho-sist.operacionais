/* ═══════════════════════════════════════════════════════════════
   Simulador de Escalonamento — frontend/script.js
   ═══════════════════════════════════════════════════════════════ */

const API = 'http://localhost:5001';

const PROCESS_COLORS = [
  '#002366','#b22738','#6c5e06','#1b6b4a',
  '#435b9f','#8b4513','#2d6a8c','#6b2d5e',
  '#3d6b3d','#7a4a00','#1a4d6b','#5c3a1e',
];
const OVERHEAD_COLOR  = '#d97706'; // âmbar — custo de troca, não é erro
const IDLE_COLOR      = '#c5c6d2'; // cinza — CPU ociosa, neutro
const DEADLINE_COLOR  = '#bdab51'; // ouro — marcador de deadline
const MISS_COLOR      = '#dc2626'; // vermelho — deadline violado, condição de erro

// ─── State ───────────────────────────────────────────────────────
let processes = [];
let pidCounter = 1;
let currentResults = null;
let allResults    = null;
let activeAlg     = null;

// Step-by-step state
let simGantt        = [];
let simProcs        = {};
let simStep         = 0;
let simMaxStep      = 0;
let simStepMode     = false;
let simShowDeadlines = false;
let simScoreLog     = [];

// Algoritmos que usam deadline como critério de escalonamento
const DEADLINE_ALGORITHMS = new Set(['edf']);

// ─── DOM refs ────────────────────────────────────────────────────
const procBody       = document.getElementById('procBody');
const procCount      = document.getElementById('procCount');
const resultsSection = document.getElementById('resultsSection');
const emptyState     = document.getElementById('emptyState');
const ganttCanvas    = document.getElementById('ganttCanvas');
const ganttLegend    = document.getElementById('ganttLegend');
const metricsGrid    = document.getElementById('metricsGrid');
const resultBody     = document.getElementById('resultBody');
const algLabel       = document.getElementById('algLabel');
const compareSection = document.getElementById('compareSection');
const compareBody    = document.getElementById('compareBody');
const compareTabs    = document.getElementById('compareTabs');
const loadingOverlay = document.getElementById('loadingOverlay');
const stepControls   = document.getElementById('stepControls');
const stepLabel      = document.getElementById('stepLabel');
const metricsDiv     = document.getElementById('metricsDiv');
const resultTableDiv = document.getElementById('resultTableDiv');
const apsScoreLog    = document.getElementById('apsScoreLog');
const apsScoreBody   = document.getElementById('apsScoreBody');

// ─── APS Score Log ───────────────────────────────────────────────
function renderScoreLog(scoreLog) {
  apsScoreBody.innerHTML = '';
  scoreLog.forEach((decision, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'aps-decision';
    wrap.dataset.idx = idx;
    wrap.style.cssText = 'margin-bottom:10px;opacity:0.25;transition:opacity .25s';

    const header = document.createElement('div');
    header.style.cssText = 'font-size:.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px';
    header.textContent = `t = ${decision.time}`;
    wrap.appendChild(header);

    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:.74rem';
    table.innerHTML = `
      <thead>
        <tr style="color:var(--text-muted);border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:2px 6px;font-weight:600">Processo</th>
          <th style="text-align:center;padding:2px 6px;font-weight:600">Urgência ×0.5</th>
          <th style="text-align:center;padding:2px 6px;font-weight:600">Prioridade ×0.3</th>
          <th style="text-align:center;padding:2px 6px;font-weight:600">Aging ×0.2</th>
          <th style="text-align:center;padding:2px 6px;font-weight:600">Score</th>
        </tr>
      </thead>`;
    const tbody = document.createElement('tbody');
    decision.scores.forEach(s => {
      const chosen = s.pid === decision.chosen;
      const tr = document.createElement('tr');
      tr.style.cssText = chosen
        ? 'background:var(--primary)/8%;font-weight:600'
        : 'color:var(--text-muted)';
      const star = chosen ? '★ ' : '　';
      const scoreBar = (v, weight) => {
        const contrib = (v * weight).toFixed(2);
        return `<span style="font-family:monospace">${v.toFixed(2)}</span><span style="color:var(--text-muted);font-size:.68rem"> (+${contrib})</span>`;
      };
      tr.innerHTML = `
        <td style="padding:3px 6px">${star}${s.pid}</td>
        <td style="text-align:center;padding:3px 6px">${scoreBar(s.urgency,  0.5)}</td>
        <td style="text-align:center;padding:3px 6px">${scoreBar(s.priority, 0.3)}</td>
        <td style="text-align:center;padding:3px 6px">${scoreBar(s.aging,    0.2)}</td>
        <td style="text-align:center;padding:3px 6px;font-weight:700;color:var(--primary)">${s.total.toFixed(2)}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    apsScoreBody.appendChild(wrap);
  });
}

function updateScoreLogStep(currentTime) {
  document.querySelectorAll('.aps-decision').forEach(el => {
    const decisionTime = simScoreLog[+el.dataset.idx]?.time ?? Infinity;
    el.style.opacity = decisionTime <= currentTime ? '1' : '0.2';
  });
}

// ─── Utility ─────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function setLoading(on) {
  loadingOverlay.classList.toggle('hidden', !on);
}

function pidColor(pid) {
  const idx = processes.findIndex(p => p.pid === pid);
  return PROCESS_COLORS[(idx < 0 ? 0 : idx) % PROCESS_COLORS.length];
}

function fmt(v, d = 2) {
  if (v === null || v === undefined) return '—';
  return typeof v === 'number' ? v.toFixed(d) : v;
}

// ─── Process table ────────────────────────────────────────────────
function renderProcTable() {
  procBody.innerHTML = '';
  procCount.textContent = `(${processes.length})`;

  processes.forEach((p, i) => {
    const color = PROCESS_COLORS[i % PROCESS_COLORS.length];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="pid-badge" style="background:${color}">${p.pid.slice(0,3)}</span>
        <input value="${p.pid}" data-field="pid" data-idx="${i}"
               style="width:60px;margin-left:6px" />
      </td>
      <td><input type="number" value="${p.chegada}"   data-field="chegada"   data-idx="${i}" min="0"  style="width:68px"/></td>
      <td><input type="number" value="${p.execucao}"  data-field="execucao"  data-idx="${i}" min="1"  style="width:68px"/></td>
      <td><input type="number" value="${p.deadline ?? ''}" data-field="deadline" data-idx="${i}" min="1" placeholder="—" style="width:78px"/></td>
      <td><input type="number" value="${p.prioridade}" data-field="prioridade" data-idx="${i}" min="1" max="10" style="width:68px"/></td>
      <td><input type="number" value="${p.num_paginas ?? 0}" data-field="num_paginas" data-idx="${i}" min="0" style="width:68px"/></td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="removeProc(${i})">✕</button>
      </td>`;
    procBody.appendChild(tr);
  });

  procBody.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('change', e => {
      const idx = +e.target.dataset.idx;
      const field = e.target.dataset.field;
      const val = e.target.value.trim();
      if (field === 'pid') {
        processes[idx][field] = val || `P${idx + 1}`;
      } else if (field === 'deadline') {
        processes[idx][field] = val === '' ? null : +val;
      } else {
        processes[idx][field] = isNaN(+val) ? 1 : +val;
      }
      renderProcTable();
    });
  });
}

function addProc() {
  processes.push({
    pid: `P${pidCounter++}`,
    chegada: 0,
    execucao: 4,
    deadline: null,
    prioridade: 1,
    num_paginas: 0,
  });
  renderProcTable();
}

function removeProc(i) {
  processes.splice(i, 1);
  renderProcTable();
}

function clearProcs() {
  if (!confirm('Limpar todos os processos?')) return;
  processes = [];
  pidCounter = 1;
  renderProcTable();
  hideResults();
}

function hideResults() {
  resultsSection.classList.add('hidden');
  emptyState.classList.remove('hidden');
  stepControls.style.display = 'none';
  metricsDiv.style.display = 'none';
  resultTableDiv.style.display = 'none';
  simStepMode = false;
}

// ─── Load caso from backend ───────────────────────────────────────
async function loadCaso(dados) {
  processes = dados.processos.map(p => ({
    pid: p.pid,
    chegada: p.chegada,
    execucao: p.execucao,
    deadline: p.deadline ?? null,
    prioridade: p.prioridade ?? 1,
    num_paginas: p.num_paginas ?? 0,
  }));
  pidCounter = processes.length + 1;
  document.getElementById('cfgQuantum').value  = dados.quantum   ?? 2;
  document.getElementById('cfgOverhead').value = dados.sobrecarga ?? 1;
  renderProcTable();
  toast(`Caso carregado: ${dados.descricao}`, 'success');
}

async function fetchCasos() {
  try {
    const r = await fetch(`${API}/casos`);
    const list = await r.json();
    const el = document.getElementById('casosList');
    el.innerHTML = '';
    list.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-ghost btn-sm btn-full';
      btn.style.textAlign = 'left';
      btn.textContent = c.nome.replace('.json','').replace(/_/g,' ');
      btn.onclick = () => loadCaso(c.dados);
      el.appendChild(btn);
    });
  } catch {
    document.getElementById('casosList').innerHTML =
      '<span style="font-size:.75rem;color:var(--text-muted)">Backend offline — casos não disponíveis.</span>';
  }
}

// ─── Validate inputs ──────────────────────────────────────────────
function buildPayload(algorithm) {
  if (processes.length === 0) { toast('Adicione pelo menos um processo.', 'error'); return null; }
  for (const p of processes) {
    if (!p.pid) { toast('ID inválido.', 'error'); return null; }
    if (p.execucao < 1) { toast(`${p.pid}: tempo de execução deve ser ≥ 1.`, 'error'); return null; }
    if (p.chegada < 0)  { toast(`${p.pid}: chegada deve ser ≥ 0.`, 'error'); return null; }
  }
  return {
    algoritmo: algorithm,
    quantum:   +document.getElementById('cfgQuantum').value,
    sobrecarga: +document.getElementById('cfgOverhead').value,
    processos: processes,
  };
}

// ─── Simulate ─────────────────────────────────────────────────────
async function simulate(algorithm) {
  const payload = buildPayload(algorithm);
  if (!payload) return;

  setLoading(true);
  try {
    const r = await fetch(`${API}/simular`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    setLoading(false);

    if (data.error) { toast(data.error, 'error'); return; }

    if (data.tipo === 'todos') {
      allResults = data.resultados;
      currentResults = null;
      showCompareResults(data.resultados);
    } else {
      currentResults = data;
      allResults = null;
      showSingleResult(data);
    }
  } catch (err) {
    setLoading(false);
    toast('Erro ao conectar ao backend. Certifique-se que o servidor está rodando na porta 5000.', 'error');
    console.error(err);
  }
}

// ─── Display single result (step-by-step mode) ────────────────────
function showSingleResult(data) {
  compareTabs.classList.add('hidden');
  compareSection.classList.add('hidden');
  algLabel.textContent = data.label || data.algorithm;
  emptyState.classList.add('hidden');
  resultsSection.classList.remove('hidden');

  const showDeadlines = DEADLINE_ALGORITHMS.has(data.algorithm);

  // Pre-render metrics and table but keep hidden until revealed
  renderMetrics(data.metrics);
  renderResultTable(data.processes, showDeadlines);
  renderGanttLegend(data.processes);

  // Initialize step mode
  simGantt         = data.gantt || [];
  simProcs         = data.processes;
  simStep          = 0;
  simMaxStep       = simGantt.length;
  simStepMode      = true;
  simShowDeadlines = showDeadlines;
  simScoreLog      = data.score_log || [];

  metricsDiv.style.display     = 'none';
  resultTableDiv.style.display = 'none';
  stepControls.style.display   = 'flex';

  // APS score log
  if (data.algorithm === 'autoral' && simScoreLog.length > 0) {
    apsScoreLog.style.display = 'block';
    renderScoreLog(simScoreLog);
    updateScoreLogStep(-1);
  } else {
    apsScoreLog.style.display = 'none';
  }

  updateStepUI();
}

// ─── Step navigation ──────────────────────────────────────────────
function updateStepUI() {
  const btnPrev    = document.getElementById('btnPrevStep');
  const btnNext    = document.getElementById('btnNextStep');
  const btnAll     = document.getElementById('btnShowAll');
  const isComplete = simStep >= simMaxStep;

  btnPrev.disabled = simStep === 0;

  if (simStep === 0) {
    stepLabel.textContent = 'Pressione Próximo para iniciar';
  } else {
    const execSteps = simGantt.slice(0, simStep).filter(e => e.type === 'execution').length;
    stepLabel.textContent = `Etapa ${simStep} de ${simMaxStep}`;
  }

  if (isComplete) {
    btnNext.textContent  = '✓ Concluído';
    btnNext.disabled     = true;
    btnAll.style.display = 'none';
    metricsDiv.style.display     = 'block';
    resultTableDiv.style.display = 'block';
  } else {
    btnNext.textContent  = 'Próximo →';
    btnNext.disabled     = false;
    btnAll.style.display = '';
    metricsDiv.style.display     = 'none';
    resultTableDiv.style.display = 'none';
  }

  drawGantt(simGantt, simProcs, simStep, simShowDeadlines);

  if (simScoreLog.length > 0) {
    const currentTime = simStep > 0 ? simGantt[simStep - 1].start : -1;
    updateScoreLogStep(currentTime);
  }
}

function prevStep() {
  if (simStep > 0) {
    simStep--;
    updateStepUI();
  }
}

function nextStep() {
  if (simStep < simMaxStep) {
    simStep++;
    updateStepUI();
  }
}

function showAllSteps() {
  simStep = simMaxStep;
  updateStepUI();
}

// ─── Display compare results (immediate, no step mode) ────────────
function showCompareResults(results) {
  emptyState.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  compareSection.classList.remove('hidden');
  stepControls.style.display   = 'none';
  metricsDiv.style.display     = 'block';
  resultTableDiv.style.display = 'block';
  simStepMode = false;

  compareTabs.classList.remove('hidden');
  compareTabs.innerHTML = '';
  const algNames = Object.keys(results).filter(k => !results[k].error);
  algNames.forEach((alg, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (i === 0 ? ' active' : '');
    btn.textContent = results[alg].label || alg;
    btn.dataset.alg = alg;
    btn.onclick = () => switchTab(alg, results);
    compareTabs.appendChild(btn);
  });

  if (algNames.length > 0) {
    activeAlg = algNames[0];
    const d = results[activeAlg];
    algLabel.textContent = d.label || activeAlg;
    const showDL = DEADLINE_ALGORITHMS.has(activeAlg);
    drawGantt(d.gantt, d.processes, undefined, showDL);
    renderMetrics(d.metrics);
    renderResultTable(d.processes, showDL);
  }

  renderCompareTable(results);
}

function switchTab(alg, results) {
  compareTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.alg === alg));
  activeAlg = alg;
  const d = results[alg];
  algLabel.textContent = d.label || alg;
  const showDL = DEADLINE_ALGORITHMS.has(alg);
  drawGantt(d.gantt, d.processes, undefined, showDL);
  renderMetrics(d.metrics);
  renderResultTable(d.processes, showDL);
}

// ─── Gantt chart ──────────────────────────────────────────────────
// maxStep: how many events to draw (undefined = draw all)
// showDeadlines: whether to draw deadline markers and miss coloring (only for EDF)
function drawGantt(gantt, procResults, maxStep, showDeadlines = true) {
  if (!gantt || gantt.length === 0) return;

  const visibleGantt = (maxStep !== undefined) ? gantt.slice(0, maxStep) : gantt;
  const fullGantt    = gantt;

  const ctx  = ganttCanvas.getContext('2d');
  const dpr  = window.devicePixelRatio || 1;

  const MARGIN_L   = 14;
  const MARGIN_R   = 40;   // extra right margin for arrow
  const MARGIN_TOP = 20;
  const BLOCK_H    = 56;
  const TICK_H     = 16;
  const LABEL_H    = 14;
  const TOTAL_H    = MARGIN_TOP + BLOCK_H + TICK_H + LABEL_H + 12;

  const maxTime    = Math.max(...fullGantt.map(e => e.end), 1);
  const containerW = ganttCanvas.parentElement.clientWidth || 900;
  const availW     = containerW - MARGIN_L - MARGIN_R;
  const PPU        = Math.max(30, Math.min(80, availW / maxTime));
  const totalW     = maxTime * PPU + MARGIN_L + MARGIN_R;

  ganttCanvas.style.width  = totalW + 'px';
  ganttCanvas.style.height = TOTAL_H + 'px';
  ganttCanvas.width  = totalW * dpr;
  ganttCanvas.height = TOTAL_H * dpr;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, TOTAL_H);

  // Grid lines (full timeline, dimmed for future)
  for (let t = 0; t <= maxTime; t++) {
    const x = MARGIN_L + t * PPU;
    ctx.strokeStyle = '#c5c6d2';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, MARGIN_TOP);
    ctx.lineTo(x, MARGIN_TOP + BLOCK_H);
    ctx.stroke();
  }

  // Future events (ghost, very faded) — drawn first as background
  if (maxStep !== undefined && maxStep < fullGantt.length) {
    fullGantt.slice(maxStep).forEach(ev => {
      const x = MARGIN_L + ev.start * PPU;
      const w = (ev.end - ev.start) * PPU;
      ctx.fillStyle = 'rgba(197,198,210,0.18)';
      roundRect(ctx, x + 1, MARGIN_TOP + 1, w - 2, BLOCK_H - 2, 5);
      ctx.fill();
    });
  }

  // Draw visible events
  visibleGantt.forEach(ev => {
    const x = MARGIN_L + ev.start * PPU;
    const w = (ev.end - ev.start) * PPU;
    const y = MARGIN_TOP;

    let color;
    if (ev.type === 'overhead') {
      color = OVERHEAD_COLOR;
    } else if (ev.type === 'idle') {
      color = IDLE_COLOR;
    } else {
      const pr = procResults[ev.pid];
      const missed  = showDeadlines && pr && pr.deadline_met === false;
      const afterDL = missed && pr.deadline !== null && ev.start >= pr.deadline;
      color = afterDL ? MISS_COLOR : pidColor(ev.pid);
    }

    ctx.fillStyle = color;
    roundRect(ctx, x + 1, y + 1, w - 2, BLOCK_H - 2, 5);
    ctx.fill();

    if (w > 22) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.min(13, w * 0.35)}px Work Sans, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = ev.type === 'overhead' ? 'SO'
                  : ev.type === 'idle'     ? '—'
                  : ev.pid;
      ctx.fillText(label, x + w / 2, y + BLOCK_H / 2, w - 6);
    }
  });

  // Arrow indicator at the current position (step mode, not yet complete)
  if (maxStep !== undefined && maxStep > 0 && maxStep < fullGantt.length) {
    const lastVisible = visibleGantt[visibleGantt.length - 1];
    const arrowX = MARGIN_L + lastVisible.end * PPU;
    const arrowMid = MARGIN_TOP + BLOCK_H / 2;

    ctx.save();
    ctx.fillStyle = '#435b9f';
    ctx.strokeStyle = '#435b9f';
    ctx.lineWidth = 2;

    // Arrow shaft
    ctx.beginPath();
    ctx.moveTo(arrowX + 2, arrowMid);
    ctx.lineTo(arrowX + 14, arrowMid);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(arrowX + 14, arrowMid - 6);
    ctx.lineTo(arrowX + 22, arrowMid);
    ctx.lineTo(arrowX + 14, arrowMid + 6);
    ctx.closePath();
    ctx.fill();

    // Pulsing dot on the shaft start
    ctx.beginPath();
    ctx.arc(arrowX + 2, arrowMid, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Deadline lines (só para algoritmos baseados em deadline)
  if (showDeadlines) {
    const byDeadline = {};
    Object.values(procResults).forEach(pr => {
      if (pr.deadline !== null) {
        if (!byDeadline[pr.deadline]) byDeadline[pr.deadline] = [];
        byDeadline[pr.deadline].push(pr.pid);
      }
    });

    Object.entries(byDeadline).forEach(([dl, pids]) => {
      const x = MARGIN_L + Number(dl) * PPU;
      ctx.save();
      ctx.strokeStyle = DEADLINE_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, MARGIN_TOP - 6);
      ctx.lineTo(x, MARGIN_TOP + BLOCK_H + 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = DEADLINE_COLOR;
      ctx.beginPath();
      ctx.moveTo(x - 5, MARGIN_TOP - 6);
      ctx.lineTo(x + 5, MARGIN_TOP - 6);
      ctx.lineTo(x, MARGIN_TOP - 1);
      ctx.closePath();
      ctx.fill();
      ctx.font = 'bold 9px Work Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(pids.join(', '), x, MARGIN_TOP - 9);
      ctx.restore();
    });
  }

  // Time axis
  ctx.fillStyle = '#757682';
  ctx.font = '10px Work Sans, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.round(maxTime / 20));
  for (let t = 0; t <= maxTime; t += step) {
    const x = MARGIN_L + t * PPU;
    ctx.fillStyle = '#444650';
    ctx.fillRect(x - 0.5, MARGIN_TOP + BLOCK_H, 1, 5);
    ctx.fillStyle = '#757682';
    ctx.fillText(t, x, MARGIN_TOP + BLOCK_H + 6);
  }
  if (maxTime % step !== 0) {
    const x = MARGIN_L + maxTime * PPU;
    ctx.fillStyle = '#444650';
    ctx.fillRect(x - 0.5, MARGIN_TOP + BLOCK_H, 1, 5);
    ctx.fillStyle = '#757682';
    ctx.fillText(maxTime, x, MARGIN_TOP + BLOCK_H + 6);
  }

  renderGanttLegend(procResults);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function renderGanttLegend(procResults) {
  ganttLegend.innerHTML = '';

  processes.forEach((p, i) => {
    const color = PROCESS_COLORS[i % PROCESS_COLORS.length];
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${p.pid}`;
    ganttLegend.appendChild(item);
  });

  [
    ['Sobrecarga (SO)', OVERHEAD_COLOR],
    ['Ocioso', IDLE_COLOR],
    ['Deadline perdido', MISS_COLOR],
    ['Deadline ▾', DEADLINE_COLOR],
  ].forEach(([label, color]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${label}`;
    ganttLegend.appendChild(item);
  });
}

// ─── Metrics ──────────────────────────────────────────────────────
const METRIC_DEFS = [
  { key: 'avg_wait',             label: 'Espera Média',         unit: 'ut',   decimals: 2 },
  { key: 'avg_turnaround',       label: 'Turnaround Médio',     unit: 'ut',   decimals: 2 },
  { key: 'throughput',           label: 'Throughput',           unit: 'p/ut', decimals: 4 },
  { key: 'cpu_idle_percent',     label: 'CPU Ociosa',           unit: '%',    decimals: 2 },
  { key: 'num_preemptions',      label: 'Preempções',           unit: '',     decimals: 0 },
  { key: 'num_context_switches', label: 'Trocas de Contexto',   unit: '',     decimals: 0 },
];

function renderMetrics(metrics) {
  metricsGrid.innerHTML = '';
  METRIC_DEFS.forEach(def => {
    const v = metrics[def.key];
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `
      <div class="metric-value">${fmt(v, def.decimals)}<span style="font-size:.7rem;font-weight:400;color:var(--text-muted)"> ${def.unit}</span></div>
      <div class="metric-label">${def.label}</div>`;
    metricsGrid.appendChild(card);
  });
}

// ─── Result table ─────────────────────────────────────────────────
function renderResultTable(procResults, showDeadlines = true) {
  resultBody.innerHTML = '';

  // Mostra/oculta colunas de deadline no cabeçalho
  const resultTable = document.getElementById('resultTable');
  resultTable.querySelectorAll('.col-deadline').forEach(el => {
    el.style.display = showDeadlines ? '' : 'none';
  });

  Object.values(procResults).forEach((r, i) => {
    const color = PROCESS_COLORS[i % PROCESS_COLORS.length];
    const dlBadge = !showDeadlines
      ? `<span class="badge-none">—</span>`
      : r.deadline_met === true  ? `<span class="badge-ok">✔ OK</span>`
      : r.deadline_met === false ? `<span class="badge-fail">✘ Perdido</span>`
      : `<span class="badge-none">—</span>`;

    const starts = r.start_times?.join(', ') || '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pid-badge" style="background:${color}">${r.pid.slice(0,3)}</span> ${r.pid}</td>
      <td>${r.arrival}</td>
      <td>${r.burst}</td>
      <td class="col-deadline" style="display:${showDeadlines ? '' : 'none'}">${r.deadline ?? '—'}</td>
      <td>${r.priority}</td>
      <td style="font-size:.78rem">${starts}</td>
      <td>${r.end_time ?? '—'}</td>
      <td>${fmt(r.wait_time, 0)}</td>
      <td>${fmt(r.turnaround, 0)}</td>
      <td class="col-deadline" style="display:${showDeadlines ? '' : 'none'}">${dlBadge}</td>`;
    resultBody.appendChild(tr);
  });
}

// ─── Compare table ────────────────────────────────────────────────
function renderCompareTable(results) {
  compareBody.innerHTML = '';
  const algKeys = Object.keys(results);

  // Best = menor valor (exceto preemptions: menor também é melhor)
  const best = {};
  ['avg_wait', 'avg_turnaround', 'num_preemptions'].forEach(k => {
    const vals = algKeys.filter(a => !results[a].error).map(a => results[a].metrics[k]);
    best[k] = Math.min(...vals);
  });

  algKeys.forEach(alg => {
    const d = results[alg];
    const tr = document.createElement('tr');
    if (d.error) {
      tr.innerHTML = `<td>${d.label || alg}</td><td colspan="3" style="color:var(--danger);font-size:.8rem">${d.error}</td>`;
    } else {
      const m = d.metrics;
      const cell = (k, dec = 2) => {
        const v = fmt(m[k], dec);
        return m[k] === best[k]
          ? `<td style="color:var(--accent2);font-weight:700">${v} ★</td>`
          : `<td>${v}</td>`;
      };
      tr.innerHTML = `<td>${d.label || alg}</td>
        ${cell('avg_wait', 2)}${cell('avg_turnaround', 2)}${cell('num_preemptions', 0)}`;
    }
    compareBody.appendChild(tr);
  });
}

// ─── Event listeners ──────────────────────────────────────────────
document.getElementById('btnAddProc').onclick    = addProc;
document.getElementById('btnClearProcs').onclick  = clearProcs;

document.getElementById('btnRun').onclick = () => {
  const alg = document.getElementById('selectAlg').value;
  simulate(alg);
};

document.getElementById('btnCompare').onclick = () => simulate('todos');

window.addEventListener('resize', () => {
  if (simStepMode && simGantt.length) {
    drawGantt(simGantt, simProcs, simStep, simShowDeadlines);
  } else if (currentResults) {
    drawGantt(currentResults.gantt, currentResults.processes, undefined,
              DEADLINE_ALGORITHMS.has(currentResults.algorithm));
  } else if (allResults && activeAlg) {
    drawGantt(allResults[activeAlg].gantt, allResults[activeAlg].processes, undefined,
              DEADLINE_ALGORITHMS.has(activeAlg));
  }
});

// ─── Init ─────────────────────────────────────────────────────────
(async function init() {
  await fetchCasos();
})();
