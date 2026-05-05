/**
 * Fleet Checks — garage assistant maintenance check forms
 * Screens: picker → vehicle list → form → confirmation
 *          OR: vehicle (from landing) → checks due → form → confirmation
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/vehicle-images`;

// ── Check type definitions ─────────────────────────────────────────────────
const CHECK_TYPES = {
  engine_check: {
    label: 'Engine Check',
    icon: '🔧',
    intervalDays: 14,
    desc: 'Oil, coolant & brake fluid levels',
  },
  tyre_check: {
    label: 'Tyre Check',
    icon: '⚙️',
    intervalDays: 28,
    desc: 'Tread depth (all four corners) & pressure',
  },
  adblue_check: {
    label: 'AdBlue Check',
    icon: '💧',
    intervalDays: 14,
    desc: 'Remaining range & tank space',
  },
  light_check: {
    label: 'Light Check',
    icon: '💡',
    intervalDays: 30,
    desc: 'Head, tail, indicator, brake & reverse lights',
  },
  clean: {
    label: 'Deep Clean',
    icon: '🧹',
    intervalDays: null, // no interval — log only
    desc: 'Interior, windows, dashboard, boot & exterior',
  },
};

// ── State ──────────────────────────────────────────────────────────────────
let vehicles      = [];       // all vehicles from DB
let taskRules     = [];       // all task_rules rows
let thresholds    = {};       // alert_thresholds keyed by metric
let lastLogs      = {};       // keyed by `${vehicleId}:${recordType}` → latest maintenance_log row
let formState     = {};       // current form values
let formContext   = {};       // { vehicle, checkType, returnScreen }

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initNavigation();
  routeFromParams();
});

// ── Data loading ───────────────────────────────────────────────────────────
async function loadData() {
  const [vRes, rRes, tRes, lRes] = await Promise.all([
    supabase.from('vehicles').select('*').order('id'),
    supabase.from('task_rules').select('*'),
    supabase.from('alert_thresholds').select('*'),
    supabase.from('maintenance_log')
      .select('vehicle_id, record_type, data, mileage_at_check, submitted_at')
      .order('submitted_at', { ascending: false }),
  ]);

  vehicles   = (vRes.data  ?? []).map(v => ({
    ...v,
    resolvedUrl: v.image_url
      ? `${STORAGE_BASE}/${encodeURIComponent(v.image_url)}`
      : null,
  }));

  taskRules  = rRes.data ?? [];

  // Thresholds keyed by metric name
  thresholds = {};
  for (const t of (tRes.data ?? [])) {
    thresholds[t.metric] = t;
  }

  // Keep only the most recent log per vehicle+type
  lastLogs = {};
  for (const row of (lRes.data ?? [])) {
    const key = `${row.vehicle_id}:${row.record_type}`;
    if (!lastLogs[key]) lastLogs[key] = row;
  }
}

// ── Routing ────────────────────────────────────────────────────────────────
function routeFromParams() {
  const params = new URLSearchParams(window.location.search);
  const type    = params.get('type');
  const vehicle = params.get('vehicle');

  if (vehicle) {
    showVehicleChecks(vehicle);
  } else if (type && CHECK_TYPES[type]) {
    showVehicleList(type);
  } else {
    showPicker();
  }
}

// ── Screen switching ───────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.check-screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  const target = document.getElementById(id);
  target.classList.remove('hidden');
  target.classList.add('active');
}

// ── SCREEN: Picker ─────────────────────────────────────────────────────────
function showPicker() {
  showScreen('screen-picker');
  renderPickerCards();
}

function renderPickerCards() {
  const grid = document.getElementById('check-type-grid');

  grid.innerHTML = Object.entries(CHECK_TYPES).map(([type, meta]) => {
    // Count overdue for this type across applicable vehicles
    const overdueCount = countOverdue(type);
    const dueLabel = overdueCount > 0
      ? `<span class="check-type-due-count">${overdueCount} overdue</span>`
      : `<span class="check-type-due-count none">All up to date</span>`;

    return `
      <div class="check-type-card" data-type="${type}">
        <div class="check-type-icon">${meta.icon}</div>
        <div class="check-type-name">${meta.label}</div>
        <div class="check-type-meta">${meta.desc}</div>
        ${meta.intervalDays ? `<div class="check-type-meta">Every ${meta.intervalDays} days</div>` : ''}
        ${dueLabel}
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.check-type-card').forEach(card => {
    card.addEventListener('click', () => showVehicleList(card.dataset.type));
  });
}

// ── SCREEN: Vehicle list for a check type ─────────────────────────────────
function showVehicleList(checkType) {
  formContext.returnScreen = 'list';
  formContext.activeCheckType = checkType;
  showScreen('screen-vehicle-list');

  const meta = CHECK_TYPES[checkType];
  document.getElementById('vehicle-list-title').textContent = meta.label;

  // Get applicable vehicles for this check type (from task_rules)
  const applicableIds = new Set(
    taskRules
      .filter(r => r.record_type === checkType && r.enabled)
      .map(r => String(r.vehicle_id))
  );

  const applicable = vehicles.filter(v => applicableIds.has(String(v.id)));

  // Sort by most overdue first
  const sorted = applicable.map(v => ({
    v,
    daysInfo: getDaysInfo(v.id, checkType),
  })).sort((a, b) => {
    // overdue (negative = days ago since due) sorts first, most overdue first
    const aVal = a.daysInfo.daysUntilDue ?? 999;
    const bVal = b.daysInfo.daysUntilDue ?? 999;
    return aVal - bVal;
  });

  const overdue   = sorted.filter(x => x.daysInfo.isOverdue);
  const upToDate  = sorted.filter(x => !x.daysInfo.isOverdue);

  document.getElementById('overdue-count').textContent  = overdue.length;
  document.getElementById('uptodate-count').textContent = upToDate.length;

  renderVehicleCheckList('overdue-list',  overdue,  checkType, true);
  renderVehicleCheckList('uptodate-list', upToDate, checkType, false);
}

function renderVehicleCheckList(containerId, items, checkType, isOverdue) {
  const el = document.getElementById(containerId);
  if (items.length === 0) {
    el.innerHTML = `<p class="collection-empty">${isOverdue ? 'None overdue.' : 'None up to date yet.'}</p>`;
    return;
  }
  el.innerHTML = items.map(({ v, daysInfo }) => `
    <div class="check-vehicle-row ${isOverdue ? 'check-vehicle-row--overdue' : 'check-vehicle-row--uptodate'}"
         data-vehicle-id="${v.id}" data-check-type="${checkType}">
      <span class="cvr-plate">${v.plate}</span>
      <span class="cvr-name">${v.name}</span>
      <span class="cvr-due ${isOverdue ? 'cvr-due--overdue' : 'cvr-due--ok'}">${daysInfo.label}</span>
      <button class="btn-enter" data-vehicle-id="${v.id}" data-check-type="${checkType}">Start</button>
    </div>
  `).join('');

  el.querySelectorAll('.btn-enter').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openForm(btn.dataset.vehicleId, btn.dataset.checkType, 'list');
    });
  });
  el.querySelectorAll('.check-vehicle-row').forEach(row => {
    row.addEventListener('click', () =>
      openForm(row.dataset.vehicleId, row.dataset.checkType, 'list')
    );
  });
}

// ── SCREEN: Vehicle checks (route 2 — vehicle first) ──────────────────────
function showVehicleChecks(vehicleId) {
  formContext.returnScreen = 'vehicle';
  formContext.activeVehicleId = vehicleId;
  showScreen('screen-vehicle-checks');

  const v = vehicles.find(x => String(x.id) === String(vehicleId));
  if (!v) {
    document.getElementById('vehicle-check-header').innerHTML =
      '<p class="empty-state">Vehicle not found.</p>';
    return;
  }

  // Header
  document.getElementById('vehicle-check-header').innerHTML = `
    ${v.resolvedUrl
      ? `<img class="vehicle-check-photo" src="${v.resolvedUrl}" alt="${v.name}" />`
      : `<div class="vehicle-check-photo-placeholder">🚐</div>`
    }
    <div>
      <div class="vehicle-check-plate">${v.plate}</div>
      <div class="vehicle-check-name">${v.name}</div>
    </div>
  `;

  // Which check types apply to this vehicle?
  const applicableTypes = taskRules
    .filter(r => String(r.vehicle_id) === String(vehicleId) && r.enabled)
    .map(r => r.record_type);

  const list = document.getElementById('vehicle-checks-list');

  if (applicableTypes.length === 0) {
    list.innerHTML = '<p class="empty-state">No checks configured for this vehicle.</p>';
    return;
  }

  // Sort: overdue first
  const sorted = applicableTypes
    .filter(t => CHECK_TYPES[t])
    .map(t => ({ type: t, meta: CHECK_TYPES[t], daysInfo: getDaysInfo(vehicleId, t) }))
    .sort((a, b) => (a.daysInfo.daysUntilDue ?? 999) - (b.daysInfo.daysUntilDue ?? 999));

  list.innerHTML = sorted.map(({ type, meta, daysInfo }) => `
    <div class="check-type-row ${daysInfo.isOverdue ? 'check-type-row--overdue' : ''}"
         data-vehicle-id="${vehicleId}" data-check-type="${type}">
      <span class="ctr-icon">${meta.icon}</span>
      <span class="ctr-name">${meta.label}</span>
      <span class="ctr-due ${daysInfo.isOverdue ? 'ctr-due--overdue' : 'ctr-due--ok'}">${daysInfo.label}</span>
      <span class="ctr-action"><button class="btn-enter" data-vehicle-id="${vehicleId}" data-check-type="${type}">Start</button></span>
    </div>
  `).join('');

  list.querySelectorAll('.btn-enter').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      openForm(btn.dataset.vehicleId, btn.dataset.checkType, 'vehicle');
    });
  });
  list.querySelectorAll('.check-type-row').forEach(row => {
    row.addEventListener('click', () =>
      openForm(row.dataset.vehicleId, row.dataset.checkType, 'vehicle')
    );
  });
}

// ── SCREEN: Check entry form ───────────────────────────────────────────────
function openForm(vehicleId, checkType, returnScreen) {
  const v = vehicles.find(x => String(x.id) === String(vehicleId));
  if (!v) return;

  formContext = { vehicle: v, checkType, returnScreen };
  formState   = {};

  const meta = CHECK_TYPES[checkType];

  // Vehicle banner
  const photoEl = document.getElementById('form-vehicle-photo');
  if (v.resolvedUrl) {
    photoEl.src = v.resolvedUrl;
    photoEl.alt = v.name;
    photoEl.classList.remove('placeholder');
    photoEl.style.display = 'block';
  } else {
    photoEl.style.display = 'none';
    // show placeholder text via CSS if no photo
    photoEl.classList.add('placeholder');
  }
  document.getElementById('form-vehicle-plate').textContent     = v.plate;
  document.getElementById('form-vehicle-name').textContent      = v.name;
  document.getElementById('form-check-type-label').textContent  = meta.label;

  // Previous reading
  renderPrevReading(vehicleId, checkType);

  // Clear mileage
  document.getElementById('form-mileage').value = '';

  // Dynamic fields
  document.getElementById('form-fields').innerHTML = '';
  renderFormFields(checkType);

  // Reset submit button
  const submitBtn = document.getElementById('form-submit-btn');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit Check';

  showScreen('screen-form');
}

function renderPrevReading(vehicleId, checkType) {
  const el  = document.getElementById('form-prev-reading');
  const key = `${vehicleId}:${checkType}`;
  const log = lastLogs[key];

  if (!log) {
    el.innerHTML = `
      <div class="form-prev-reading-label">Previous reading</div>
      <div class="form-prev-none">No previous check recorded</div>
    `;
    return;
  }

  const ago  = daysSince(log.submitted_at);
  const date = formatDate(log.submitted_at);
  const d    = log.data ?? {};

  let valuesHtml = '';

  if (checkType === 'engine_check') {
    valuesHtml = [
      { name: 'Oil',         val: `${d.oil_level ?? '—'}/10`         },
      { name: 'Coolant',     val: `${d.coolant_level ?? '—'}/10`     },
      { name: 'Brake fluid', val: `${d.brake_fluid_level ?? '—'}/10` },
    ].map(x => `
      <div class="form-prev-value-item">
        <span class="form-prev-value-name">${x.name}</span>
        <span class="form-prev-value-val">${x.val}</span>
      </div>
    `).join('');
  } else if (checkType === 'tyre_check') {
    valuesHtml = [
      { name: 'FL', val: d.depth_fl != null ? `${d.depth_fl}mm` : '—' },
      { name: 'FR', val: d.depth_fr != null ? `${d.depth_fr}mm` : '—' },
      { name: 'RL', val: d.depth_rl != null ? `${d.depth_rl}mm` : '—' },
      { name: 'RR', val: d.depth_rr != null ? `${d.depth_rr}mm` : '—' },
      { name: 'Pressure', val: d.pressure_ok === true ? 'OK' : d.pressure_ok === false ? 'Low' : '—' },
    ].map(x => `
      <div class="form-prev-value-item">
        <span class="form-prev-value-name">${x.name}</span>
        <span class="form-prev-value-val">${x.val}</span>
      </div>
    `).join('');
  } else if (checkType === 'adblue_check') {
    valuesHtml = [
      { name: 'Range',      val: d.range_miles != null ? `${d.range_miles.toLocaleString()} mi` : '—' },
      { name: 'Tank space', val: d.tank_space_litres != null ? `${d.tank_space_litres}L` : '—' },
    ].map(x => `
      <div class="form-prev-value-item">
        <span class="form-prev-value-name">${x.name}</span>
        <span class="form-prev-value-val">${x.val}</span>
      </div>
    `).join('');
  } else if (checkType === 'light_check') {
    const lights = ['headlights', 'tail_lights', 'indicators', 'brake_lights', 'reverse_lights'];
    valuesHtml = lights.map(l => `
      <div class="form-prev-value-item">
        <span class="form-prev-value-name">${lightLabel(l)}</span>
        <span class="form-prev-value-val">${d[l] === true ? 'Pass' : d[l] === false ? 'Fail' : '—'}</span>
      </div>
    `).join('');
  } else if (checkType === 'clean') {
    const items = cleanItems();
    valuesHtml = items.map(item => `
      <div class="form-prev-value-item">
        <span class="form-prev-value-name">${item.label}</span>
        <span class="form-prev-value-val">${d[item.key] ? '✓' : '—'}</span>
      </div>
    `).join('');
  }

  el.innerHTML = `
    <div class="form-prev-reading-label">Last check — ${ago === 0 ? 'today' : `${ago} day${ago !== 1 ? 's' : ''} ago`} (${date})</div>
    <div class="form-prev-reading-values">${valuesHtml}</div>
  `;
}

// ── Dynamic form field renderers ───────────────────────────────────────────
function renderFormFields(checkType) {
  const container = document.getElementById('form-fields');

  if (checkType === 'engine_check') {
    renderFluidFields(container, [
      { key: 'oil_level',          label: 'Oil level',          alertMetric: 'oil_level_min'          },
      { key: 'coolant_level',      label: 'Coolant level',      alertMetric: 'coolant_level_min'      },
      { key: 'brake_fluid_level',  label: 'Brake fluid level',  alertMetric: 'brake_fluid_min'        },
    ]);

  } else if (checkType === 'tyre_check') {
    const min = thresholds['tyre_depth_min']?.threshold_value ?? 1.6;
    container.innerHTML = `
      <div class="form-field">
        <label class="form-label">Tread depth (mm)</label>
        <div class="tyre-grid">
          ${['fl','fr','rl','rr'].map(pos => `
            <div class="tyre-field">
              <label>${tyreLabel(pos)}</label>
              <input type="number" class="tyre-input" id="tyre-${pos}"
                     inputmode="decimal" step="0.1" min="0" max="20"
                     placeholder="0.0" data-pos="${pos}" />
            </div>
          `).join('')}
        </div>
        <div class="tyre-pressure-row">
          <span class="tyre-pressure-label">Tyre pressure</span>
          <div class="toggle-pill" id="pressure-toggle">
            <button class="toggle-pill-btn active" data-val="true">OK</button>
            <button class="toggle-pill-btn" data-val="false">Low</button>
          </div>
        </div>
      </div>
    `;
    formState.pressure_ok = true;

    // Warn on input if below threshold
    container.querySelectorAll('.tyre-input').forEach(input => {
      input.addEventListener('input', () => {
        const val = parseFloat(input.value);
        input.classList.toggle('warn', !isNaN(val) && val < min);
        formState[`depth_${input.dataset.pos}`] = isNaN(val) ? null : val;
      });
    });

    container.querySelectorAll('#pressure-toggle .toggle-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('#pressure-toggle .toggle-pill-btn')
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        formState.pressure_ok = btn.dataset.val === 'true';
      });
    });

  } else if (checkType === 'adblue_check') {
    const warnMiles = thresholds['adblue_range_warning']?.threshold_value ?? 1500;
    container.innerHTML = `
      <div class="form-field adblue-field">
        <label class="form-label">Remaining range (miles)</label>
        <input type="number" class="adblue-input" id="adblue-range"
               inputmode="numeric" placeholder="0" min="0" />
      </div>
      <div class="form-field adblue-field">
        <label class="form-label">Tank space (litres) <span style="color:var(--text-muted);font-size:0.75em;text-transform:none;letter-spacing:0">— leave blank if not shown</span></label>
        <input type="number" class="adblue-input" id="adblue-space"
               inputmode="decimal" step="0.1" placeholder="—" min="0" />
      </div>
    `;
    container.querySelector('#adblue-range').addEventListener('input', e => {
      const val = parseInt(e.target.value, 10);
      e.target.classList.toggle('warn', !isNaN(val) && val <= warnMiles);
      formState.range_miles = isNaN(val) ? null : val;
    });
    container.querySelector('#adblue-space').addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      formState.tank_space_litres = isNaN(val) ? null : val;
    });

  } else if (checkType === 'light_check') {
    const lights = ['headlights', 'tail_lights', 'indicators', 'brake_lights', 'reverse_lights'];
    // Default all to pass
    lights.forEach(l => { formState[l] = true; });

    container.innerHTML = `
      <div class="form-field">
        <label class="form-label">Light checks</label>
        <div class="light-list">
          ${lights.map(l => `
            <div class="light-item">
              <span class="light-item-label">${lightLabel(l)}</span>
              <div class="toggle-pill" id="light-toggle-${l}">
                <button class="toggle-pill-btn active" data-light="${l}" data-val="true">Pass</button>
                <button class="toggle-pill-btn" data-light="${l}" data-val="false">Fail</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    container.querySelectorAll('.toggle-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const light = btn.dataset.light;
        container.querySelectorAll(`#light-toggle-${light} .toggle-pill-btn`)
          .forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        formState[light] = btn.dataset.val === 'true';
      });
    });

  } else if (checkType === 'clean') {
    const items = cleanItems();
    items.forEach(i => { formState[i.key] = false; });

    container.innerHTML = `
      <div class="form-field">
        <label class="form-label">Clean checklist</label>
        <div class="clean-list">
          ${items.map(item => `
            <div class="clean-item" data-key="${item.key}">
              <div class="clean-checkbox"></div>
              <span class="clean-item-label">${item.label}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    container.querySelectorAll('.clean-item').forEach(el => {
      el.addEventListener('click', () => {
        el.classList.toggle('checked');
        formState[el.dataset.key] = el.classList.contains('checked');
        el.querySelector('.clean-checkbox').textContent =
          el.classList.contains('checked') ? '✓' : '';
      });
    });
  }
}

function renderFluidFields(container, fields) {
  container.innerHTML = fields.map(({ key, label, alertMetric }) => {
    const min = thresholds[alertMetric]?.threshold_value ?? 3;
    return `
      <div class="fluid-field">
        <label class="fluid-label">${label} <span style="color:var(--text-muted);font-size:0.7em">(0 = empty · 10 = full)</span></label>
        <div class="fluid-buttons" data-field="${key}" data-min="${min}">
          ${Array.from({ length: 11 }, (_, i) => `
            <button class="fluid-btn" data-value="${i}">${i}</button>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.fluid-buttons').forEach(group => {
    const fieldKey = group.dataset.field;
    const min      = parseFloat(group.dataset.min);
    formState[fieldKey] = null;

    group.querySelectorAll('.fluid-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        group.querySelectorAll('.fluid-btn').forEach(b => {
          b.classList.remove('selected', 'warning');
        });
        const val = parseInt(btn.dataset.value, 10);
        btn.classList.add('selected');
        if (val <= min) btn.classList.add('warning');
        formState[fieldKey] = val;
      });
    });
  });
}

// ── Form submission ────────────────────────────────────────────────────────
document.getElementById('form-submit-btn').addEventListener('click', submitForm);

async function submitForm() {
  const { vehicle, checkType } = formContext;
  const mileageEl = document.getElementById('form-mileage');
  const mileage   = parseInt(mileageEl.value, 10);

  if (!mileageEl.value || isNaN(mileage) || mileage < 0) {
    mileageEl.focus();
    mileageEl.style.borderColor = 'var(--danger)';
    setTimeout(() => mileageEl.style.borderColor = '', 2000);
    return;
  }

  // Validate required fields per check type
  const validationError = validateForm(checkType);
  if (validationError) {
    alert(validationError);
    return;
  }

  const submitBtn = document.getElementById('form-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving…';

  // Build data JSONB
  const data = buildDataPayload(checkType);

  // Check thresholds — determine alert flags
  const { alerts, sendEmail } = evaluateThresholds(checkType, data);

  const { error } = await supabase.from('maintenance_log').insert([{
    vehicle_id:       vehicle.id,
    record_type:      checkType,
    data,
    mileage_at_check: mileage,
    submitted_by:     'garage',
    alert_sent:       false, // edge function will set this to true after firing
  }]);

  if (error) {
    console.error('Failed to save check:', error);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Check';
    alert('Failed to save. Please try again.');
    return;
  }

  // Update lastLogs cache so "previous reading" is correct if they come back
  const key = `${vehicle.id}:${checkType}`;
  lastLogs[key] = { vehicle_id: vehicle.id, record_type: checkType, data, mileage_at_check: mileage, submitted_at: new Date().toISOString() };

  showConfirmation(vehicle, checkType, alerts);
}

function validateForm(checkType) {
  if (checkType === 'engine_check') {
    if (formState.oil_level         === null || formState.oil_level         === undefined) return 'Please enter the oil level.';
    if (formState.coolant_level     === null || formState.coolant_level     === undefined) return 'Please enter the coolant level.';
    if (formState.brake_fluid_level === null || formState.brake_fluid_level === undefined) return 'Please enter the brake fluid level.';
  }
  if (checkType === 'tyre_check') {
    for (const pos of ['fl','fr','rl','rr']) {
      if (formState[`depth_${pos}`] === null || formState[`depth_${pos}`] === undefined) return `Please enter the ${tyreLabel(pos)} tyre depth.`;
    }
  }
  if (checkType === 'adblue_check') {
    if (formState.range_miles === null || formState.range_miles === undefined) return 'Please enter the AdBlue range in miles.';
  }
  return null;
}

function buildDataPayload(checkType) {
  if (checkType === 'engine_check') {
    return {
      oil_level:          formState.oil_level,
      coolant_level:      formState.coolant_level,
      brake_fluid_level:  formState.brake_fluid_level,
    };
  }
  if (checkType === 'tyre_check') {
    return {
      depth_fl:    formState.depth_fl,
      depth_fr:    formState.depth_fr,
      depth_rl:    formState.depth_rl,
      depth_rr:    formState.depth_rr,
      pressure_ok: formState.pressure_ok,
    };
  }
  if (checkType === 'adblue_check') {
    return {
      range_miles:        formState.range_miles,
      tank_space_litres:  formState.tank_space_litres ?? null,
    };
  }
  if (checkType === 'light_check') {
    return {
      headlights:    formState.headlights,
      tail_lights:   formState.tail_lights,
      indicators:    formState.indicators,
      brake_lights:  formState.brake_lights,
      reverse_lights: formState.reverse_lights,
    };
  }
  if (checkType === 'clean') {
    const payload = {};
    cleanItems().forEach(i => { payload[i.key] = formState[i.key] ?? false; });
    return payload;
  }
  return {};
}

function evaluateThresholds(checkType, data) {
  const alerts = [];
  let sendEmail = false;

  if (checkType === 'engine_check') {
    checkFluidThreshold(alerts, 'oil_level_min',     data.oil_level,         'Oil level');
    checkFluidThreshold(alerts, 'coolant_level_min', data.coolant_level,     'Coolant level');
    checkFluidThreshold(alerts, 'brake_fluid_min',   data.brake_fluid_level, 'Brake fluid level');
  }
  if (checkType === 'tyre_check') {
    const min = thresholds['tyre_depth_min']?.threshold_value ?? 1.6;
    const email = thresholds['tyre_depth_min']?.sends_email ?? true;
    for (const pos of ['fl','fr','rl','rr']) {
      const val = data[`depth_${pos}`];
      if (val !== null && val < min) {
        alerts.push({ metric: 'tyre_depth_min', label: `${tyreLabel(pos)} tyre depth`, value: `${val}mm`, threshold: `${min}mm`, sends_email: email });
        if (email) sendEmail = true;
      }
    }
  }
  if (checkType === 'adblue_check') {
    const critical = thresholds['adblue_range_critical']?.threshold_value ?? 1000;
    const critEmail = thresholds['adblue_range_critical']?.sends_email ?? true;
    const warn    = thresholds['adblue_range_warning']?.threshold_value  ?? 1500;
    const miles   = data.range_miles;
    if (miles !== null && miles <= critical) {
      alerts.push({ metric: 'adblue_range_critical', label: 'AdBlue range', value: `${miles.toLocaleString()} mi`, threshold: `${critical.toLocaleString()} mi`, sends_email: critEmail });
      if (critEmail) sendEmail = true;
    } else if (miles !== null && miles <= warn) {
      alerts.push({ metric: 'adblue_range_warning', label: 'AdBlue range (warning)', value: `${miles.toLocaleString()} mi`, threshold: `${warn.toLocaleString()} mi`, sends_email: false });
    }
  }

  alerts.forEach(a => { if (a.sends_email) sendEmail = true; });
  return { alerts, sendEmail };
}

function checkFluidThreshold(alerts, metricKey, value, label) {
  const t = thresholds[metricKey];
  if (!t || value === null || value === undefined) return;
  if (value <= t.threshold_value) {
    alerts.push({ metric: metricKey, label, value: `${value}/10`, threshold: `${t.threshold_value}/10`, sends_email: t.sends_email });
  }
}

// ── SCREEN: Confirmation ───────────────────────────────────────────────────
function showConfirmation(vehicle, checkType, alerts) {
  const meta = CHECK_TYPES[checkType];

  document.getElementById('confirm-title').textContent    = 'Check Recorded';
  document.getElementById('confirm-subtitle').textContent =
    `${meta.label} for ${vehicle.name} (${vehicle.plate}) has been saved.`;

  const alertsEl = document.getElementById('confirm-alerts');
  if (alerts.length > 0) {
    alertsEl.innerHTML = alerts.map(a => `
      <div class="confirm-alert-item">
        <strong>⚠ ${a.label} below threshold</strong>
        ${a.value} — threshold is ${a.threshold}
        ${a.sends_email ? '<br><em>An alert email will be sent.</em>' : ''}
      </div>
    `).join('');
  } else {
    alertsEl.innerHTML = '';
  }

  showScreen('screen-confirm');
}

// Confirmation buttons
document.getElementById('confirm-next-btn').addEventListener('click', () => {
  const { returnScreen, activeCheckType, activeVehicleId } = formContext;
  if (returnScreen === 'vehicle') {
    showVehicleChecks(activeVehicleId ?? formContext.vehicle?.id);
  } else {
    showVehicleList(activeCheckType ?? formContext.checkType);
  }
});
document.getElementById('confirm-menu-btn').addEventListener('click', showPicker);

// ── Navigation (back buttons) ──────────────────────────────────────────────
function initNavigation() {
  document.getElementById('back-to-picker').addEventListener('click', showPicker);
  document.getElementById('back-from-vehicle').addEventListener('click', () => {
    window.location.href = './index.html';
  });
  document.getElementById('back-from-form').addEventListener('click', () => {
    const { returnScreen, activeCheckType, activeVehicleId } = formContext;
    if (returnScreen === 'vehicle') {
      showVehicleChecks(activeVehicleId ?? formContext.vehicle?.id);
    } else {
      showVehicleList(activeCheckType ?? formContext.checkType);
    }
  });
}

// ── Due date helpers ───────────────────────────────────────────────────────
function getDaysInfo(vehicleId, checkType) {
  const meta = CHECK_TYPES[checkType];
  if (!meta.intervalDays) {
    // clean — no interval, always show last done date
    const log = lastLogs[`${vehicleId}:${checkType}`];
    return {
      isOverdue:    false,
      daysUntilDue: 999,
      label:        log ? `Last done ${daysSince(log.submitted_at)}d ago` : 'Never done',
    };
  }

  const log = lastLogs[`${vehicleId}:${checkType}`];
  if (!log) {
    return { isOverdue: true, daysUntilDue: -999, label: 'Never checked' };
  }

  const daysSinceLast = daysSince(log.submitted_at);
  const daysUntilDue  = meta.intervalDays - daysSinceLast;

  if (daysUntilDue <= 0) {
    const overdueDays = Math.abs(daysUntilDue);
    return {
      isOverdue:    true,
      daysUntilDue,
      label: overdueDays === 0 ? 'Due today' : `${overdueDays}d overdue`,
    };
  }

  return {
    isOverdue:    false,
    daysUntilDue,
    label: `Due in ${daysUntilDue}d`,
  };
}

function countOverdue(checkType) {
  const applicableIds = taskRules
    .filter(r => r.record_type === checkType && r.enabled)
    .map(r => String(r.vehicle_id));
  return applicableIds.filter(id => getDaysInfo(id, checkType).isOverdue).length;
}

// ── Utility helpers ────────────────────────────────────────────────────────
function daysSince(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / 86400000);
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

function tyreLabel(pos) {
  const map = { fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right' };
  return map[pos] ?? pos;
}

function lightLabel(key) {
  const map = {
    headlights:    'Headlights',
    tail_lights:   'Tail lights',
    indicators:    'Indicators',
    brake_lights:  'Brake lights',
    reverse_lights:'Reverse lights',
  };
  return map[key] ?? key;
}

function cleanItems() {
  return [
    { key: 'interior_vacuumed',  label: 'Interior vacuumed'  },
    { key: 'windows_cleaned',    label: 'Windows cleaned'    },
    { key: 'dashboard_wiped',    label: 'Dashboard wiped'    },
    { key: 'boot_cleared',       label: 'Boot cleared'       },
    { key: 'exterior_washed',    label: 'Exterior washed'    },
  ];
}
