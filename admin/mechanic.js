/**
 * Fleet Mechanic Dashboard
 * Tabs: Mileage | Faults | Maintenance
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STORAGE_PUBLIC = `${SUPABASE_URL}/storage/v1/object/public/vehicle-images/`;

// ── Helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

// Fleet week: Mon–Sun, week 1 = first week with a Monday in the year.
function getFleetWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // back to Monday
  const jan4 = new Date(d.getFullYear(), 0, 4);
  jan4.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const week = Math.round((d - jan4) / 604800000) + 1;
  return { week, year: d.getFullYear(), monday: d };
}

function severityClass(s) {
  if (!s) return 'normal';
  return s.toLowerCase(); // critical | high | normal | low
}

// ── Tab switching ──────────────────────────────────────────────────────────

const tabBtns  = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === target));
    tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${target}`));
  });
});

// ══════════════════════════════════════════════════════════════════════════
// MILEAGE TAB
// ══════════════════════════════════════════════════════════════════════════

async function loadMileage() {
  const summaryEl      = document.getElementById('mileage-summary');
  const weekBadgeEl    = document.getElementById('mileage-week-badge');
  const pendingListEl  = document.getElementById('mileage-pending-list');
  const doneListEl     = document.getElementById('mileage-done-list');
  const pendingCountEl = document.getElementById('mileage-pending-count');
  const doneCountEl    = document.getElementById('mileage-done-count');

  const { week, year, monday } = getFleetWeek();
  weekBadgeEl.textContent = `Week ${week} / ${year}`;

  // Sunday = monday + 6 days
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const [vehiclesRes, mileageRes] = await Promise.all([
    supabase.from('vehicles').select('id, plate, name').eq('active', true).order('plate'),
    supabase.from('mileage_submissions')
      .select('vehicle_id, mileage, submitted_at')
      .gte('submitted_at', monday.toISOString())
      .lte('submitted_at', sunday.toISOString())
  ]);

  if (vehiclesRes.error) {
    summaryEl.textContent = 'Error loading vehicles.';
    return;
  }

  const vehicles    = vehiclesRes.data;
  const submissions = mileageRes.data || [];

  // Latest submission per vehicle this week
  const subMap = {};
  submissions.forEach(s => {
    if (!subMap[s.vehicle_id] || s.submitted_at > subMap[s.vehicle_id].submitted_at) {
      subMap[s.vehicle_id] = s;
    }
  });

  const pending = vehicles.filter(v => !subMap[v.id]);
  const done    = vehicles.filter(v =>  subMap[v.id]);

  pendingCountEl.textContent = pending.length;
  doneCountEl.textContent    = done.length;

  if (pending.length === 0) {
    summaryEl.innerHTML = `<span class="all-done-banner">✓ All ${vehicles.length} vehicles collected for week ${week}.</span>`;
  } else {
    summaryEl.textContent = `${done.length} of ${vehicles.length} vehicles collected so far this week.`;
  }

  // Pending list
  if (pending.length === 0) {
    pendingListEl.innerHTML = '<p class="collection-empty">All vehicles collected.</p>';
  } else {
    pendingListEl.innerHTML = pending.map(v => `
      <div class="mech-mileage-row">
        <span class="cr-plate">${v.plate}</span>
        <span class="cr-name">${v.name}</span>
        <span class="cr-mileage" style="color:var(--text-muted)">Awaiting submission</span>
      </div>
    `).join('');
  }

  // Done list (collapsed by default)
  doneListEl.innerHTML = done.map(v => {
    const sub = subMap[v.id];
    return `
      <div class="mech-mileage-row mech-mileage-row--done">
        <span class="cr-plate">${v.plate}</span>
        <span class="cr-name">${v.name}</span>
        <span class="cr-mileage done-mileage">${sub.mileage.toLocaleString('en-GB')} mi</span>
        <span class="cr-time">${fmtDateTime(sub.submitted_at)}</span>
      </div>
    `;
  }).join('');

  if (done.length === 0) {
    doneListEl.innerHTML = '<p class="collection-empty">None collected yet.</p>';
  }
}

// Collapse/expand done section
document.getElementById('mileage-done-toggle').addEventListener('click', () => {
  const list    = document.getElementById('mileage-done-list');
  const chevron = document.getElementById('mileage-done-chevron');
  const hidden  = list.classList.toggle('hidden');
  chevron.textContent = hidden ? '›' : '‹';
  chevron.style.transform = hidden ? '' : 'rotate(90deg)';
});

// ══════════════════════════════════════════════════════════════════════════
// FAULTS TAB
// ══════════════════════════════════════════════════════════════════════════

let allFaults = []; // cached for filter
let vehicleMap = {}; // id → { plate, name }

async function loadFaults() {
  const listEl   = document.getElementById('faults-list');
  const badgeEl  = document.getElementById('faults-badge');
  const filterEl = document.getElementById('fault-status-filter');

  listEl.innerHTML = '<div class="loading-state">Loading…</div>';

  // Load vehicles for plate/name lookup
  const vRes = await supabase.from('vehicles').select('id, plate, name').eq('active', true);
  if (!vRes.error) {
    vRes.data.forEach(v => { vehicleMap[v.id] = v; });
  }

  const { data, error } = await supabase
    .from('faults')
    .select('id, vehicle_id, fault_type, severity, description, status, reported_at, driver_name, is_known_issue, photo_url, mechanic_notes, damage_location, resolved_at')
    .neq('status', 'resolved')
    .order('reported_at', { ascending: false });

  if (error) {
    listEl.innerHTML = '<p class="empty-state">Error loading faults.</p>';
    return;
  }

  allFaults = data;

  // Badge: count of open/in-progress
  const openCount = allFaults.filter(f => f.status !== 'resolved').length;
  badgeEl.textContent = openCount;
  badgeEl.classList.toggle('hidden', openCount === 0);

  renderFaults(filterEl.value);
}

function renderFaults(statusFilter) {
  const listEl = document.getElementById('faults-list');

  let faults = allFaults;
  if (statusFilter === 'open')        faults = faults.filter(f => f.status === 'open');
  if (statusFilter === 'in_progress') faults = faults.filter(f => f.status === 'in_progress');

  if (faults.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No faults found.</p>';
    return;
  }

  listEl.innerHTML = faults.map(f => {
    const v      = vehicleMap[f.vehicle_id] || {};
    const sev    = severityClass(f.severity);
    const kiIcon = f.is_known_issue ? '⚑' : '⚐';
    const kiActive = f.is_known_issue ? 'active' : '';
    const typeLabel = (f.fault_type || 'fault').replace(/_/g, ' ');
    return `
      <div class="mech-fault-row mech-fault-row--${sev}" data-id="${f.id}">
        <span class="mf-plate">${v.plate || f.vehicle_id}</span>
        <span class="mf-type">${typeLabel}</span>
        <span class="mf-desc">${f.description || '—'}</span>
        <span class="mf-date">${fmtDate(f.reported_at)}</span>
        <button class="mf-ki-icon ${kiActive}" data-id="${f.id}" data-ki="${f.is_known_issue}" title="Flag as known issue">⚑</button>
      </div>
    `;
  }).join('');

  // Row click → open modal
  listEl.querySelectorAll('.mech-fault-row').forEach(row => {
    row.addEventListener('click', e => {
      // Don't open modal if they clicked the KI toggle button
      if (e.target.closest('.mf-ki-icon')) return;
      const fault = allFaults.find(f => f.id === row.dataset.id);
      if (fault) openFaultModal(fault);
    });
  });

  // Known-issue toggle (in-row, without opening modal)
  listEl.querySelectorAll('.mf-ki-icon').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id      = btn.dataset.id;
      const current = btn.dataset.ki === 'true';
      const newVal  = !current;
      btn.dataset.ki = newVal;
      btn.classList.toggle('active', newVal);
      // Update cache
      const fault = allFaults.find(f => f.id === id);
      if (fault) fault.is_known_issue = newVal;
      // Persist via RPC
      await supabase.rpc('set_fault_known_issue', { fault_id: id, flag: newVal });
    });
  });
}

// Status filter change
document.getElementById('fault-status-filter').addEventListener('change', e => {
  renderFaults(e.target.value);
});

// ── Fault detail modal ─────────────────────────────────────────────────────

let activeFaultId = null;

async function openFaultModal(fault) {
  activeFaultId = fault.id;
  const v = vehicleMap[fault.vehicle_id] || {};

  document.getElementById('modal-plate').textContent        = v.plate || fault.vehicle_id;
  document.getElementById('modal-vehicle-name').textContent = v.name  || '';

  const body = document.getElementById('fault-detail-body');
  body.innerHTML = '<div class="loading-state">Loading…</div>';
  document.getElementById('fault-modal-overlay').classList.remove('hidden');

  // Fetch signed URL for photo if present
  let photoHTML = '';
  if (fault.photo_url) {
    const { data: signed } = await supabase.storage
      .from('fault-photos')
      .createSignedUrl(fault.photo_url, 60 * 60); // 1 hour
    if (signed?.signedUrl) {
      photoHTML = `<div class="mfd-row">
        <span class="mfd-label">Photo</span>
        <img class="mfd-photo" src="${signed.signedUrl}" alt="Fault photo" />
      </div>`;
    }
  }

  const damageText = fault.damage_location
    ? (typeof fault.damage_location === 'string'
        ? fault.damage_location
        : (fault.damage_location.label || JSON.stringify(fault.damage_location)))
    : null;

  const typeLabel = (fault.fault_type || 'fault').replace(/_/g, ' ');
  const sev       = severityClass(fault.severity);

  body.innerHTML = `
    ${photoHTML}

    <div class="mfd-row">
      <span class="mfd-label">Fault type</span>
      <span class="mfd-value" style="text-transform:capitalize">${typeLabel}
        <span class="severity-badge severity-badge--${sev}" style="margin-left:0.5rem">${fault.severity || 'normal'}</span>
      </span>
    </div>

    <div class="mfd-row">
      <span class="mfd-label">Description</span>
      <span class="mfd-value">${fault.description || '—'}</span>
    </div>

    ${damageText ? `
    <div class="mfd-row">
      <span class="mfd-label">Damage location</span>
      <span class="mfd-value">${damageText}</span>
    </div>` : ''}

    <div class="mfd-row">
      <span class="mfd-label">Reported by</span>
      <span class="mfd-value">${fault.driver_name || 'Unknown driver'} — ${fmtDateTime(fault.reported_at)}</span>
    </div>

    <div class="mfd-row">
      <span class="mfd-label">Status</span>
      <select class="mfd-status-select" id="modal-status-select">
        <option value="open"        ${fault.status === 'open'        ? 'selected' : ''}>Open</option>
        <option value="in_progress" ${fault.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
        <option value="resolved"    ${fault.status === 'resolved'    ? 'selected' : ''}>Resolved</option>
      </select>
    </div>

    <div class="mfd-row">
      <span class="mfd-label">Mechanic notes</span>
      <textarea class="mfd-notes-input" id="modal-notes" placeholder="Add notes…">${fault.mechanic_notes || ''}</textarea>
    </div>

    <div class="mfd-known-issue-row">
      <div class="mfd-ki-label">
        Flag as known issue
        <small>Drivers will see this fault on the vehicle's Known Issues screen</small>
      </div>
      <label class="mfd-toggle">
        <input type="checkbox" id="modal-ki-toggle" ${fault.is_known_issue ? 'checked' : ''} />
        <span class="mfd-toggle-track"></span>
      </label>
    </div>

    <button class="btn-primary mfd-save-btn" id="modal-save-btn">Save Changes</button>
  `;

  document.getElementById('modal-save-btn').addEventListener('click', () => saveFaultChanges(fault));
}

async function saveFaultChanges(fault) {
  const saveBtn  = document.getElementById('modal-save-btn');
  const status   = document.getElementById('modal-status-select').value;
  const notes    = document.getElementById('modal-notes').value.trim();
  const kiFlag   = document.getElementById('modal-ki-toggle').checked;

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  const updates = {
    status,
    mechanic_notes: notes || null,
    is_known_issue: kiFlag,
  };

  // Set resolved_at if being marked resolved
  if (status === 'resolved' && fault.status !== 'resolved') {
    updates.resolved_at = new Date().toISOString();
  } else if (status !== 'resolved') {
    updates.resolved_at = null;
  }

  const { error } = await supabase
    .from('faults')
    .update(updates)
    .eq('id', fault.id);

  if (error) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
    alert('Error saving changes. Please try again.');
    return;
  }

  // Update local cache
  Object.assign(fault, updates);

  saveBtn.textContent = '✓ Saved';
  setTimeout(() => {
    closeFaultModal();
    renderFaults(document.getElementById('fault-status-filter').value);
    // Refresh badge
    const openCount = allFaults.filter(f => f.status !== 'resolved').length;
    const badgeEl = document.getElementById('faults-badge');
    badgeEl.textContent = openCount;
    badgeEl.classList.toggle('hidden', openCount === 0);
  }, 700);
}

function closeFaultModal() {
  document.getElementById('fault-modal-overlay').classList.add('hidden');
  activeFaultId = null;
}

document.getElementById('fault-modal-close').addEventListener('click', closeFaultModal);
document.getElementById('fault-modal-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeFaultModal();
});

// ══════════════════════════════════════════════════════════════════════════
// MAINTENANCE TAB
// ══════════════════════════════════════════════════════════════════════════

async function loadMaintenance() {
  const overdueListEl  = document.getElementById('overdue-list');
  const overdueCountEl = document.getElementById('overdue-count');
  const alertsListEl   = document.getElementById('alerts-list');
  const alertsCountEl  = document.getElementById('alerts-count');

  // Load all data in parallel
  const [vehiclesRes, rulesRes, logsRes] = await Promise.all([
    supabase.from('vehicles').select('id, plate, name').eq('active', true),
    supabase.from('task_rules').select('*').eq('enabled', true),
    supabase.from('maintenance_log')
      .select('id, vehicle_id, record_type, submitted_at, alert_sent, data')
      .order('submitted_at', { ascending: false })
  ]);

  const vehicles = vehiclesRes.data || [];
  const rules    = rulesRes.data    || [];
  const logs     = logsRes.data     || [];

  // Build vehicleMap if not already done
  vehicles.forEach(v => { vehicleMap[v.id] = v; });

  // ── Overdue checks ──────────────────────────────────────────────────────
  // For each vehicle × enabled rule, find the most recent log entry of that
  // record_type and check if days since last check >= interval_days.

  const today = new Date();
  const overdueRows = [];

  vehicles.forEach(vehicle => {
    rules.forEach(rule => {
      // Most recent log for this vehicle + record_type
      const last = logs.find(l => l.vehicle_id === vehicle.id && l.record_type === rule.record_type);

      if (!last) {
        // Never done — overdue from day 1
        overdueRows.push({ vehicle, rule, daysSince: null, neverDone: true });
        return;
      }

      const lastDate = new Date(last.submitted_at);
      const daysSince = Math.floor((today - lastDate) / 86400000);
      if (daysSince >= rule.interval_days) {
        overdueRows.push({ vehicle, rule, daysSince, neverDone: false });
      }
    });
  });

  overdueCountEl.textContent = overdueRows.length;

  if (overdueRows.length === 0) {
    overdueListEl.innerHTML = '<p class="empty-state">All checks are up to date.</p>';
  } else {
    // Sort: never-done first, then by most overdue
    overdueRows.sort((a, b) => {
      if (a.neverDone && !b.neverDone) return -1;
      if (!a.neverDone && b.neverDone) return 1;
      return (b.daysSince || 0) - (a.daysSince || 0);
    });

    overdueListEl.innerHTML = overdueRows.map(({ vehicle, rule, daysSince, neverDone }) => {
      const daysText  = neverDone ? 'Never done' : `${daysSince}d overdue`;
      const urgentCls = (neverDone || daysSince > rule.interval_days * 1.5) ? 'mech-overdue-row--urgent' : '';
      const typeLabel = rule.record_type.replace(/_/g, ' ');
      return `
        <div class="mech-overdue-row ${urgentCls}">
          <span class="mor-plate">${vehicle.plate}</span>
          <span class="mor-name">${vehicle.name}</span>
          <span class="mor-type">${typeLabel}</span>
          <span class="mor-days">${daysText}</span>
        </div>
      `;
    }).join('');
  }

  // ── Threshold alerts ────────────────────────────────────────────────────
  // maintenance_log rows where alert_sent = true, most recent 50

  const alerts = logs.filter(l => l.alert_sent === true).slice(0, 50);
  alertsCountEl.textContent = alerts.length;

  if (alerts.length === 0) {
    alertsListEl.innerHTML = '<p class="empty-state">No threshold alerts recorded.</p>';
  } else {
    alertsListEl.innerHTML = alerts.map(log => {
      const v         = vehicleMap[log.vehicle_id] || {};
      const typeLabel = (log.record_type || '').replace(/_/g, ' ');

      // Summarise the data JSONB into a readable string
      let detail = '';
      if (log.data && typeof log.data === 'object') {
        detail = Object.entries(log.data)
          .filter(([k]) => !['mileage','submitted_by','notes'].includes(k))
          .map(([k, v]) => `${k.replace(/_/g,' ')}: ${v}`)
          .join(' · ');
      }

      return `
        <div class="mech-alert-row">
          <span class="mar-plate">${v.plate || log.vehicle_id}</span>
          <span class="mar-type">${typeLabel}</span>
          <span class="mar-detail">${detail || '—'}</span>
          <span class="mar-date">${fmtDate(log.submitted_at)}</span>
        </div>
      `;
    }).join('');
  }
}

// ══════════════════════════════════════════════════════════════════════════
// INIT — load all three tabs in parallel
// ══════════════════════════════════════════════════════════════════════════

loadMileage();
loadFaults();
loadMaintenance();
