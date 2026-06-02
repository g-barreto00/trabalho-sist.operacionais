/* ═══════════════════════════════════════════════════════════════
   Simulador de Escalonamento — frontend/script.js
   ═══════════════════════════════════════════════════════════════ */

const API = 'http://localhost:5001';

const PROCESS_COLORS = [
  '#002366','#b22738','#6c5e06','#1b6b4a',
  '#435b9f','#8b4513','#2d6a8c','#6b2d5e',
  '#3d6b3d','#7a4a00','#1a4d6b','#5c3a1e',
];
const OVERHEAD_COLOR  = '#ba1a1a';
const IDLE_COLOR      = '#c5c6d2';
const DEADLINE_COLOR  = '#bdab51';
const MISS_COLOR      = '#8b0000';   // exec block when deadline missed

// ─── State ───────────────────────────────────────────────────────
let processes = [];
let pidCounter = 1;
let currentResults = null;   // single result
let allResults    = null;    // compare-all result
let activeAlg     = null;    // active tab in compare mode

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

  // Bind change events
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
}

// ─── Example generator ────────────────────────────────────────────
function generateExample() {
  processes = [
    { pid:'P1', chegada:0,  execucao:5, deadline:null, prioridade:2, num_paginas:3 },
    { pid:'P2', chegada:1,  execucao:3, deadline:null, prioridade:1, num_paginas:2 },
    { pid:'P3', chegada:2,  execucao:8, deadline:null, prioridade:3, num_paginas:5 },
    { pid:'P4', chegada:3,  execucao:2, deadline:null, prioridade:2, num_paginas:1 },
    { pid:'P5', chegada:4,  execucao:4, deadline:null, prioridade:1, num_paginas:4 },
  ];
  pidCounter = 6;
  renderProcTable();
  toast('Exemplo carregado!', 'success');
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

// ─── Display single result ────────────────────────────────────────
function showSingleResult(data) {
  compareTabs.classList.add('hidden');
  compareSection.classList.add('hidden');
  algLabel.textContent = data.label || data.algorithm;
  emptyState.classList.add('hidden');
  resultsSection.classList.remove('hidden');

  drawGantt(data.gantt, data.processes);
  renderMetrics(data.metrics);
  renderResultTable(data.processes);
}

// ─── Display compare results ──────────────────────────────────────
function showCompareResults(results) {
  emptyState.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  compareSection.classList.remove('hidden');

  // Build tabs
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
    drawGantt(d.gantt, d.processes);
    renderMetrics(d.metrics);
    renderResultTable(d.processes);
  }

  renderCompareTable(results);
}

function switchTab(alg, results) {
  compareTabs.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.alg === alg));
  activeAlg = alg;
  const d = results[alg];
  algLabel.textContent = d.label || alg;
  drawGantt(d.gantt, d.processes);
  renderMetrics(d.metrics);
  renderResultTable(d.processes);
}

// ─── Gantt chart ──────────────────────────────────────────────────
function drawGantt(gantt, procResults) {
  if (!gantt || gantt.length === 0) return;

  const ctx = ganttCanvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const MARGIN_L  = 14;
  const MARGIN_R  = 16;
  const MARGIN_TOP = 20;
  const BLOCK_H   = 56;
  const TICK_H    = 16;
  const LABEL_H   = 14;
  const TOTAL_H   = MARGIN_TOP + BLOCK_H + TICK_H + LABEL_H + 12;

  const maxTime = Math.max(...gantt.map(e => e.end), 1);
  const containerW = ganttCanvas.parentElement.clientWidth || 900;
  const availW  = containerW - MARGIN_L - MARGIN_R;
  const PPU     = Math.max(30, Math.min(80, availW / maxTime));  // pixels per time unit
  const totalW  = maxTime * PPU + MARGIN_L + MARGIN_R;

  ganttCanvas.style.width  = totalW + 'px';
  ganttCanvas.style.height = TOTAL_H + 'px';
  ganttCanvas.width  = totalW * dpr;
  ganttCanvas.height = TOTAL_H * dpr;
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, totalW, TOTAL_H);

  // Grid lines
  ctx.strokeStyle = '#c5c6d2';
  ctx.lineWidth = 0.5;
  for (let t = 0; t <= maxTime; t++) {
    const x = MARGIN_L + t * PPU;
    ctx.beginPath();
    ctx.moveTo(x, MARGIN_TOP);
    ctx.lineTo(x, MARGIN_TOP + BLOCK_H);
    ctx.stroke();
  }

  // Draw events
  gantt.forEach(ev => {
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
      const missed = pr && pr.deadline_met === false;
      // If deadline missed and this block is after deadline → show in miss color
      const afterDL = missed && pr.deadline !== null && ev.start >= pr.deadline;
      color = afterDL ? MISS_COLOR : pidColor(ev.pid);
    }

    // Block fill
    ctx.fillStyle = color;
    roundRect(ctx, x + 1, y + 1, w - 2, BLOCK_H - 2, 5);
    ctx.fill();

    // Label inside block
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

  // Deadline lines
  const drawn = new Set();
  Object.values(procResults).forEach(pr => {
    if (pr.deadline !== null && !drawn.has(pr.deadline)) {
      drawn.add(pr.deadline);
      const x = MARGIN_L + pr.deadline * PPU;
      ctx.save();
      ctx.strokeStyle = DEADLINE_COLOR;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(x, MARGIN_TOP - 6);
      ctx.lineTo(x, MARGIN_TOP + BLOCK_H + 4);
      ctx.stroke();
      ctx.setLineDash([]);
      // Small triangle marker
      ctx.fillStyle = DEADLINE_COLOR;
      ctx.beginPath();
      ctx.moveTo(x - 5, MARGIN_TOP - 6);
      ctx.lineTo(x + 5, MARGIN_TOP - 6);
      ctx.lineTo(x, MARGIN_TOP - 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });

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
  // Always draw last tick
  if (maxTime % step !== 0) {
    const x = MARGIN_L + maxTime * PPU;
    ctx.fillStyle = '#444650';
    ctx.fillRect(x - 0.5, MARGIN_TOP + BLOCK_H, 1, 5);
    ctx.fillStyle = '#757682';
    ctx.fillText(maxTime, x, MARGIN_TOP + BLOCK_H + 6);
  }

  // Legend
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

  // Process colors
  processes.forEach((p, i) => {
    const color = PROCESS_COLORS[i % PROCESS_COLORS.length];
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-dot" style="background:${color}"></span>${p.pid}`;
    ganttLegend.appendChild(item);
  });

  // Fixed items
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
  { key: 'avg_wait',           label: 'Espera Média',         unit: 'ut',  decimals: 2 },
  { key: 'avg_turnaround',     label: 'Turnaround Médio',     unit: 'ut',  decimals: 2 },
  { key: 'throughput',         label: 'Throughput',           unit: 'p/ut',decimals: 4 },
  { key: 'cpu_idle_percent',   label: 'CPU Ociosa',           unit: '%',   decimals: 2 },
  { key: 'num_preemptions',    label: 'Preempções',           unit: '',    decimals: 0 },
  { key: 'num_context_switches', label: 'Trocas de Contexto', unit: '',    decimals: 0 },
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
function renderResultTable(procResults) {
  resultBody.innerHTML = '';
  Object.values(procResults).forEach((r, i) => {
    const color = PROCESS_COLORS[i % PROCESS_COLORS.length];
    const dlBadge = r.deadline_met === true  ? `<span class="badge-ok">✔ OK</span>`
                  : r.deadline_met === false ? `<span class="badge-fail">✘ Perdido</span>`
                  : `<span class="badge-none">—</span>`;
    const starts = r.start_times?.join(', ') || '—';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="pid-badge" style="background:${color}">${r.pid.slice(0,3)}</span> ${r.pid}</td>
      <td>${r.arrival}</td>
      <td>${r.burst}</td>
      <td>${r.deadline ?? '—'}</td>
      <td>${r.priority}</td>
      <td style="font-size:.78rem">${starts}</td>
      <td>${r.end_time ?? '—'}</td>
      <td>${fmt(r.wait_time, 0)}</td>
      <td>${fmt(r.turnaround, 0)}</td>
      <td>${dlBadge}</td>`;
    resultBody.appendChild(tr);
  });
}

// ─── Compare table ────────────────────────────────────────────────
function renderCompareTable(results) {
  compareBody.innerHTML = '';
  const algKeys = Object.keys(results);

  // Find best (min) for each metric
  const best = {};
  ['avg_wait','avg_turnaround','cpu_idle_percent','num_preemptions','num_context_switches'].forEach(k => {
    const vals = algKeys.filter(a => !results[a].error).map(a => results[a].metrics[k]);
    best[k] = Math.min(...vals);
  });
  const tpVals = algKeys.filter(a => !results[a].error).map(a => results[a].metrics.throughput);
  best['throughput'] = Math.max(...tpVals);

  algKeys.forEach(alg => {
    const d = results[alg];
    const tr = document.createElement('tr');
    if (d.error) {
      tr.innerHTML = `<td>${d.label || alg}</td><td colspan="6" style="color:var(--danger);font-size:.8rem">${d.error}</td>`;
    } else {
      const m = d.metrics;
      const isBest = k => {
        if (k === 'throughput') return m[k] === best[k];
        return m[k] === best[k];
      };
      const cell = (k, dec=2) => {
        const v = fmt(m[k], dec);
        return isBest(k) ? `<td style="color:var(--accent2);font-weight:700">${v} ★</td>` : `<td>${v}</td>`;
      };
      tr.innerHTML = `<td>${d.label || alg}</td>
        ${cell('avg_wait',2)}${cell('avg_turnaround',2)}
        ${cell('throughput',4)}${cell('cpu_idle_percent',2)}
        ${cell('num_preemptions',0)}${cell('num_context_switches',0)}`;
    }
    compareBody.appendChild(tr);
  });
}

// ─── Export ───────────────────────────────────────────────────────
function exportResults() {
  const data = allResults || currentResults;
  if (!data) { toast('Nenhum resultado para exportar.', 'error'); return; }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `resultado_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
  a.click();
}

// ─── Event listeners ──────────────────────────────────────────────
document.getElementById('btnAddProc').onclick   = addProc;
document.getElementById('btnClearProcs').onclick = clearProcs;
document.getElementById('btnExample').onclick   = generateExample;
document.getElementById('btnExport').onclick    = exportResults;

document.getElementById('btnRun').onclick = () => {
  const alg = document.getElementById('selectAlg').value;
  simulate(alg);
};

document.getElementById('btnCompare').onclick = () => simulate('todos');

// Redraw Gantt on resize
window.addEventListener('resize', () => {
  if (currentResults) drawGantt(currentResults.gantt, currentResults.processes);
  else if (allResults && activeAlg) drawGantt(allResults[activeAlg].gantt, allResults[activeAlg].processes);
});

// ─── Init ─────────────────────────────────────────────────────────
(async function init() {
  generateExample();          // start with 5 example processes
  await fetchCasos();         // load test cases from backend
})();
