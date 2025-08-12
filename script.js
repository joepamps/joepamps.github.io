document.addEventListener('DOMContentLoaded', () => {
  Chart.defaults.color = '#a0a0a0';

  const GOOGLE_SHEET_API_URL = 'https://script.google.com/macros/s/AKfycbzElQAjDOLgQhQ5KUhhbVa5qaY4m5d5iwrVNaPWxe1ulC-0zytjnYns1RYKxf5vwYdc/exec';
  const API = `${GOOGLE_SHEET_API_URL}?t=${Date.now()}`;

  let calorieChart, budgetChart, calorieHistoryChart, budgetHistoryChart;

  const el = {
    caloriePercentText: document.getElementById('calorie-percent-text'),
    budgetPercentText: document.getElementById('budget-percent-text'),
    currentDate: document.getElementById('current-date'),
    calorieGoal: document.getElementById('calorie-goal'),
    caloriesConsumed: document.getElementById('calories-consumed'),
    caloriesRemaining: document.getElementById('calories-remaining'),
    budgetGoal: document.getElementById('budget-goal'),
    budgetSpent: document.getElementById('budget-spent'),
    budgetRemaining: document.getElementById('budget-remaining'),
    proteinProgress: document.getElementById('protein-progress'),
    proteinValue: document.getElementById('protein-value'),
    carbsProgress: document.getElementById('carbs-progress'),
    carbsValue: document.getElementById('carbs-value'),
    fatProgress: document.getElementById('fat-progress'),
    fatValue: document.getElementById('fat-value'),
    sugarProgress: document.getElementById('sugar-progress'),
    sugarValue: document.getElementById('sugar-value'),
    fiberProgress: document.getElementById('fiber-progress'),
    fiberValue: document.getElementById('fiber-value'),
    proteinOver: document.getElementById('protein-over'),
    carbsOver: document.getElementById('carbs-over'),
    fatOver: document.getElementById('fat-over'),
    sugarOver: document.getElementById('sugar-over'),
    fiberOver: document.getElementById('fiber-over'),
  };

  // POST to Apps Script as text/plain to avoid CORS preflight
  async function postJsonToSheets(payload, token) {
    const url = `${GOOGLE_SHEET_API_URL}?token=${encodeURIComponent(token || '')}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload)
    });
    // Apps Script usually allows cross-origin GET/POST. If the browser blocks reading the body due to CORS,
    // we still rely on refreshing the dashboard below. We try to parse JSON when allowed.
    let data = null;
    try { data = await resp.json(); } catch (_) {}
    if (!resp.ok || (data && data.ok === false)) {
      const msg = data && (data.message || data.error) ? (data.message || data.error) : `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    return data || { ok: true };
  }

  function wireJsonForm() {
    const form = document.getElementById('json-form');
    if (!form) return;
    const ta = document.getElementById('json-input');
    const tokenEl = document.getElementById('api-token');
    const btn = document.getElementById('submit-json');
    const status = document.getElementById('submit-status');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const raw = (ta.value || '').trim();
      if (!raw) { status.textContent = 'Provide JSON.'; return; }

      let payload;
      try { payload = JSON.parse(raw); }
      catch { status.textContent = 'Invalid JSON.'; return; }

      status.textContent = 'Uploading…';
      btn.disabled = true;
      try {
        await postJsonToSheets(payload, tokenEl.value || '');
        status.textContent = 'Saved.';
        ta.value = '';
        await refreshDashboard();
      } catch (err) {
        status.textContent = `Error: ${err.message}`;
      } finally {
        btn.disabled = false;
        setTimeout(() => { if (status.textContent === 'Saved.') status.textContent = ''; }, 2000);
      }
    });
  }

  // --- HELPER FUNCTIONS ---

  const toNum = (v) => {
    if (v === '' || v == null) return 0;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    let s = String(v).trim()
      .replace(/\u00A0/g, '')
      .replace(/\u2212/g, '-')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/,/g, '')
      .replace(/[A-Za-z₱$€¥£%]/g, '');
    const paren = /^\((.*)\)$/.test(s);
    if (paren) s = s.slice(1, -1);
    const n = parseFloat(s.replace(/[^0-9.+-]/g, ''));
    return Number.isFinite(n) ? (paren ? -n : n) : 0;
  };

  function createChartGradient(ctx, colors) {
    if (!ctx) return colors[0];
    const h = ctx.canvas && ctx.canvas.height ? ctx.canvas.height : 200;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    const n = colors.length - 1;
    colors.forEach((c, i) => g.addColorStop(n ? i / n : 0, c));
    return g;
  }

  // Draw an on-top overage arc starting at 12 o'clock, clockwise
  const overlayArc = {
    id: 'overlayArc',
    afterDatasetsDraw(chart, args, opts) {
      const pct = chart.$overPct || 0;
      if (pct <= 0) return;

      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data || !meta.data.length) return;
      const arc = meta.data[0];
      const { x, y, outerRadius, innerRadius } = arc;

      const start = chart.options.rotation ?? -0.5 * Math.PI;
      const end   = start + (pct / 100) * 2 * Math.PI;

      const ctx = chart.ctx;
      const thick = outerRadius - innerRadius;
      const rMid  = innerRadius + thick / 2;
      const bw = (opts && Number(opts.borderWidth)) || 4;
      const borderColor =
        (opts && opts.borderColor) ||
        getComputedStyle(document.documentElement).getPropertyValue('--card-color').trim() ||
        '#1e1e1e';

      // gradient for the red overlay
      const g = (function(){
        const gg = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height || 200);
        const arr = (opts && opts.colors) || ['#ff8a80', '#ff5252'];
        const n = arr.length - 1;
        arr.forEach((c,i)=>gg.addColorStop(n ? i/n : 0, c));
        return gg;
      })();

      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // draw border halo first
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = thick + 2 * bw;
      ctx.beginPath();
      ctx.arc(x, y, rMid, start, end);
      ctx.stroke();

      // draw colored overlay on top
      ctx.strokeStyle = g;
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.arc(x, y, rMid, start, end);
      ctx.stroke();

      ctx.restore();
    }
  };
  Chart.register(overlayArc);

  // --- UI UPDATE FUNCTIONS ---

  function updateTodaySummary(data) {
    el.currentDate.innerText = data.dateToday || 'Loading...';
    el.calorieGoal.innerText = toNum(data.baseGoalKcal).toLocaleString();
    el.caloriesConsumed.innerText = toNum(data.consumedKcal).toLocaleString();
    el.caloriesRemaining.innerText = toNum(data.remainingKcal).toLocaleString();
    el.budgetGoal.innerText = toNum(data.todayBudget).toFixed(2);
    el.budgetSpent.innerText = toNum(data.spentToday).toFixed(2);
    el.budgetRemaining.innerText = toNum(data.budgetRemaining).toFixed(2);
  }

  function updateNutrientBars(data) {
    const updateBar = (progressEl, overEl, valueEl, consumed, goal) => {
      const c = toNum(consumed);
      const g = Math.max(1, toNum(goal));
      const basePercent = Math.min((c / g) * 100, 100);
      const overPercent = Math.min(Math.max(((c - g) / g) * 100, 0), 100);
      progressEl.style.width = `${basePercent}%`;
      overEl.style.width = `${overPercent}%`;
      valueEl.innerText = `${Math.round(c)}g / ${Math.round(g)}g`;
    };
    updateBar(el.proteinProgress, el.proteinOver, el.proteinValue, data.consumedProtein, data.goalProtein);
    updateBar(el.carbsProgress,   el.carbsOver,   el.carbsValue,   data.consumedCarbs,   data.goalCarbs);
    updateBar(el.fatProgress,     el.fatOver,     el.fatValue,     data.consumedFat,     data.goalFat);
    updateBar(el.sugarProgress,   el.sugarOver,   el.sugarValue,   data.consumedSugar,   data.goalSugar);
    updateBar(el.fiberProgress,   el.fiberOver,   el.fiberValue,   data.consumedFiber,   data.goalFiber);
  }

  // --- FAB + modal wiring (robust) ---
  function wireFabModal() {
    const fab = document.getElementById('fab-open');
    const modal = document.getElementById('entry-modal');
    if (!fab || !modal) return;

    const backdrop = modal.querySelector('.m3-backdrop');
    const closeBtn = document.getElementById('modal-close');
    const cancelBtn = document.getElementById('modal-cancel');
    const jsonInput = document.getElementById('json-input');

    const open = () => {
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      setTimeout(() => jsonInput && jsonInput.focus(), 50);
    };
    const close = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
    };

    fab.addEventListener('click', open);
    backdrop && backdrop.addEventListener('click', close);
    closeBtn && closeBtn.addEventListener('click', close);
    cancelBtn && cancelBtn.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    const status = document.getElementById('submit-status');
    const form = document.getElementById('json-form');
    if (form && status) {
      const obs = new MutationObserver(() => {
        if (status.textContent.trim() === 'Saved.') { close(); obs.disconnect(); }
      });
      form.addEventListener('submit', () =>
        obs.observe(status, { childList: true, characterData: true, subtree: true })
      );
    }
  }

  // --- CHART RENDERING FUNCTIONS ---

  function configureDonutChart(chartInstance, canvasId, textElement, consumedRaw, goalRaw, normalColors, overColors) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const consumed = toNum(consumedRaw);
    const goal = Math.max(1, toNum(goalRaw));

    // base ring
    const baseBG = [createChartGradient(ctx, normalColors), '#3a3a3a'];
    const options = {
      rotation: -0.5 * Math.PI,
      cutout: '75%',
      responsive: true,
      layout: { padding: 3 },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        overlayArc: {
          colors: overColors, // change this array for red gradient
          borderWidth: 4,
          borderColor:
            getComputedStyle(document.documentElement)
              .getPropertyValue('--donut-overflow-border-color')
              .trim()
        }
      }
    };


    let data, overPct = 0;

    if (consumed <= goal) {
      const remaining = Math.max(0, goal - consumed);
      data = [consumed, remaining];
      textElement.textContent = `${100 - Math.round((consumed/goal)*100)}%`;
      textElement.classList.remove('over-budget');
    } else {
      const over = consumed - goal;
      overPct = Math.min((over/goal) * 100, 100);
      data = [goal, 0]; // draw full base ring
      textElement.textContent = `+${Math.round((over/goal)*100)}%`;
      textElement.classList.add('over-budget');
    }

    if (!chartInstance) {
      chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{ data, backgroundColor: baseBG, borderColor: 'var(--card-color)', borderWidth: 4, borderRadius: 5 }] },
        options
      });
    } else {
      chartInstance.data.datasets[0].data = data;
      chartInstance.data.datasets[0].backgroundColor = baseBG;
      chartInstance.options = options;
    }

    chartInstance.$overPct = overPct; // tell plugin how much to draw
    chartInstance.update();
    return chartInstance;
  }

  function createOrUpdateHistoryChart(chartInstance, canvasId, labels, dataPoints, colors) {
  const ctx = document.getElementById(canvasId).getContext('2d');

  const minV = Math.min(...dataPoints, 0);
  const maxV = Math.max(...dataPoints, 0);
  const range = Math.max(1, maxV - minV);
  const pad = Math.ceil(range * 0.15);

  const chartData = {
    labels,
    datasets: [{
      data: dataPoints,
      borderColor: createChartGradient(ctx, colors.border),
      backgroundColor: colors.background,
      tension: 0.4,
      fill: true,
      borderWidth: 3,
      pointBackgroundColor: 'white',
      pointBorderColor: createChartGradient(ctx, colors.border)
    }]
  };

  const yOpts = {
    suggestedMin: minV - pad,
    suggestedMax: maxV + pad,
    grace: '5%',
    grid: {
      color: v => v.tick.value === 0
        ? getComputedStyle(document.documentElement).getPropertyValue('--grid-color-zero').trim() || '#ffffff'
        : getComputedStyle(document.documentElement).getPropertyValue('--grid-color-default').trim() || '#444',
      lineWidth: v => v.tick.value === 0 ? 2 : 1
    },
    ticks: { callback: v => (v > 0 ? '+' : '') + v }
  };

  if (chartInstance) {
    chartInstance.data = chartData;
    chartInstance.options.scales.y = yOpts;
    chartInstance.update();
  } else {
    chartInstance = new Chart(ctx, {
      type: 'line',
      data: chartData,
      options: { responsive: true, scales: { y: yOpts, x: { grid: { color: 'transparent' } } }, plugins: { legend: { display: false } } }
    });
  }
  return chartInstance;
}


  function renderOrUpdateCharts(data) {
    const donutCalorieColors = ['#bb86fc', '#03dac6'];
    const donutBudgetColors  = ['#f797e8', '#f5db69'];
    const overageColors      = ['#ff8a80', '#ff5252'];
    const historyCalorieColors = { border: ['#bb86fc', '#03dac6'], background: 'rgba(3,218,198,0.1)' };
    const historyBudgetColors  = { border: ['#f797e8', '#f5db69'], background: 'rgba(245,219,105,0.1)' };

    calorieChart = configureDonutChart(calorieChart, 'calorie-chart', el.caloriePercentText, data.consumedKcal, data.baseGoalKcal, donutCalorieColors, overageColors);
    budgetChart = configureDonutChart(budgetChart, 'budget-chart', el.budgetPercentText, data.spentToday, data.todayBudget, donutBudgetColors, overageColors);

    const calDiffs = (data.calorieHistoryValues || []).map(toNum);
    const spendDiffs = (data.spendHistoryValues || []).map(toNum);

    calorieHistoryChart = createOrUpdateHistoryChart(calorieHistoryChart, 'calorie-history-chart', data.calorieHistoryLabels || [], calDiffs, historyCalorieColors);
    budgetHistoryChart  = createOrUpdateHistoryChart(budgetHistoryChart,  'budget-history-chart',  data.spendHistoryLabels  || [], spendDiffs,  historyBudgetColors);

  }

  // --- MAIN APP LOGIC ---

  async function refreshDashboard() {
    try {
      const resp = await fetch(API, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.error) throw new Error(`Backend Error: ${data.message}`);
      updateTodaySummary(data);
      updateNutrientBars(data);
      renderOrUpdateCharts(data);
    } catch (err) {
      console.error('Failed to refresh dashboard:', err);
      document.body.innerHTML = `<div style="text-align:center;padding:50px;color:#ff8a80;"><h1>Error Loading Data</h1><p>Could not connect to the Google Sheet backend.</p><p><i>Error: ${err.message}</i></p></div>`;
    }
  }

  // --- START THE APP ---
  refreshDashboard();
  wireJsonForm();
  wireFabModal(); // Now this call will work correctly!
});