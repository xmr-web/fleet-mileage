/**
 * Fleet Admin Dashboard
 * Tabs: Vehicles | Mileage | QR Codes
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
import qrcode from 'qrcode-generator';

const BASE_URL = 'https://fleet-mileage.pages.dev';

// ── State ──────────────────────────────────────────────────────────────────
let vehicles = [];
let pendingDeleteId = null;
let pendingVehicles = [];
let doneVehicles = [];
let outVehicles = [];    // vehicles marked "out" for this collection session
let entryVehicle = null; // vehicle currently open in the entry modal

// ── sessionStorage key for "out" vehicles ─────────────────────────────────
// Keyed by fleet week + year so it automatically clears when the week changes.
function outStorageKey() {
  const { week, year } = getFleetWeek();
  return `fleet_out_${year}_w${week}`;
}

function loadOutFromSession() {
  try {
    const raw = sessionStorage.getItem(outStorageKey());
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveOutToSession(ids) {
  try {
    sessionStorage.setItem(outStorageKey(), JSON.stringify(ids));
  } catch { /* ignore */ }
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initVehicleForm();
  initModals();
  initEntryModal();
  initDoneToggle();
  initOutToggle();
  initCloseWeekBtn();
  loadAll();
});

// ── Tabs ───────────────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ── Load All Data ──────────────────────────────────────────────────────────
async function loadAll() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('id');

  if (error) {
    console.error('Error loading vehicles:', error);
    return;
  }

  const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/vehicle-images`;
  vehicles = data.map(v => ({
    ...v,
    resolvedUrl: v.image_url ? `${STORAGE_BASE}/${encodeURIComponent(v.image_url)}` : null
  }));

  renderVehicleGrid();
  await loadCollectionData();
  renderQRGrid();
}

// ── Vehicle Grid ───────────────────────────────────────────────────────────
function renderVehicleGrid() {
  const grid = document.getElementById('vehicle-grid');

  if (vehicles.length === 0) {
    grid.innerHTML = '<p class="empty-state">No vehicles yet. Add one above.</p>';
    return;
  }

  grid.innerHTML = vehicles.map(v => `
    <div class="vehicle-card" data-id="${v.id}">
      ${v.resolvedUrl
        ? `<img class="vehicle-card-photo" src="${v.resolvedUrl}" alt="${v.name}" />`
        : `<div class="vehicle-card-photo placeholder">&#x1F697;</div>`
      }
      <div class="vehicle-card-body">
        <div class="vehicle-card-id">${v.plate}</div>
        <div class="vehicle-card-name">${v.name}</div>
        <div class="vehicle-card-mileage">Current mileage: <strong>${v.current_mileage?.toLocaleString() ?? '&#x2014;'}</strong></div>
        <div class="vehicle-card-actions">
          <button class="btn-icon danger" data-action="delete" data-id="${v.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
  });
}

// ── Fleet week helpers ─────────────────────────────────────────────────────
// Offset by -1 day: Monday morning still counts as the previous fleet week,
// matching the Friday–Monday collection window.
function getFleetWeek() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoWeek(d);
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { week, year: date.getUTCFullYear() };
}

// Even fleet-weeks = all 32 vehicles; odd = 28 (fortnightly vehicles skipped)
function isFullWeek(weekNum) {
  return weekNum % 2 === 0;
}

// ── Mileage collection UI ──────────────────────────────────────────────────
async function loadCollectionData() {
  const { week, year } = getFleetWeek();
  const fullWeek = isFullWeek(week);
  const expectedCount = fullWeek ? 32 : 28;

  // Week badge
  document.getElementById('week-badge').textContent = `Week ${week}`;

  // Date range: Friday of fleet week to Monday of next week
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const monday = new Date(startOfWeek1);
  monday.setUTCDate(startOfWeek1.getUTCDate() + (week - 1) * 7);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);

  const fmtShort = d => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  document.getElementById('collection-summary').textContent =
    `${expectedCount} vehicles expected \u00b7 ${fmtShort(friday)}\u2013${fmtShort(nextMonday)}`;

  // Fetch all submissions from Friday of this fleet week onwards
  const { data: submissions } = await supabase
    .from('mileage_log')
    .select('vehicle_id, mileage, submitted_at, driver_name')
    .gte('submitted_at', friday.toISOString())
    .order('submitted_at', { ascending: false });

  const doneIds = new Set();
  const doneByVehicle = {};
  if (submissions) {
    for (const row of submissions) {
      const { week: rowWeek, year: rowYear } = isoWeek(
        new Date(new Date(row.submitted_at).getTime() - 86400000)
      );
      if (rowWeek === week && rowYear === year) {
        doneIds.add(row.vehicle_id);
        if (!doneByVehicle[row.vehicle_id]) doneByVehicle[row.vehicle_id] = row;
      }
    }
  }

  // Restore "out" vehicle IDs from sessionStorage (persists across page refresh
  // within the same fleet week, but a vehicle that's actually been submitted
  // takes priority — remove it from outIds if it somehow got submitted anyway).
  const savedOutIds = loadOutFromSession();
  const outIds = new Set(savedOutIds.filter(id => !doneIds.has(id)));

  // Split into pending / done / out, filtering fortnightly vehicles on odd weeks
  const applicable = vehicles.filter(v =>
    v.collection_frequency === 'weekly' || fullWeek
  );

  pendingVehicles = applicable.filter(v => !doneIds.has(v.id) && !outIds.has(v.id));
  doneVehicles    = applicable
    .filter(v => doneIds.has(v.id))
    .map(v => ({ ...v, _submission: doneByVehicle[v.id] }));
  outVehicles     = applicable.filter(v => outIds.has(v.id));

  renderPendingList();
  renderDoneList();
  renderOutList();
  updateCounts();
}

function updateCounts() {
  document.getElementById('pending-count').textContent = pendingVehicles.length;
  document.getElementById('done-count').textContent    = doneVehicles.length;
  document.getElementById('out-count').textContent     = outVehicles.length;

  const closeBtn = document.getElementById('close-week-btn');

  if (pendingVehicles.length === 0 && (doneVehicles.length + outVehicles.length) > 0) {
    const { week } = getFleetWeek();
    const outNote = outVehicles.length > 0
      ? ` (${outVehicles.length} vehicle${outVehicles.length > 1 ? 's' : ''} out)`
      : '';
    document.getElementById('collection-summary').innerHTML =
      `<span class="all-done-banner">&#x2713; Week ${week} complete &mdash; all vehicles accounted for${outNote}</span>`;
    // Show Close Week button only when there are out vehicles — if all are done
    // the webhook fires automatically on the last insert, no button needed.
    if (outVehicles.length > 0) {
      closeBtn.classList.remove('hidden');
    } else {
      closeBtn.classList.add('hidden');
    }
  } else {
    closeBtn.classList.add('hidden');
  }
}

function renderPendingList() {
  const list = document.getElementById('pending-list');
  if (pendingVehicles.length === 0) {
    list.innerHTML = '<p class="collection-empty">All done for this week.</p>';
    return;
  }
  list.innerHTML = pendingVehicles.map(v => `
    <div class="collection-row" data-id="${v.id}">
      <span class="cr-plate">${v.plate}</span>
      <span class="cr-name">${v.name}</span>
      <span class="cr-mileage">${v.current_mileage?.toLocaleString('en-GB') ?? '&#x2014;'} mi</span>
      <button class="btn-enter" data-action="enter" data-id="${v.id}">Enter</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-action="enter"]').forEach(btn => {
    btn.addEventListener('click', () => openEntryModal(btn.dataset.id));
  });
}

function renderDoneList() {
  const list = document.getElementById('done-list');
  if (doneVehicles.length === 0) {
    list.innerHTML = '<p class="collection-empty">None yet.</p>';
    return;
  }
  list.innerHTML = doneVehicles.map(v => {
    const sub = v._submission;
    const milesRecorded = sub?.mileage?.toLocaleString('en-GB') ?? '&#x2014;';
    const time = sub?.submitted_at ? formatTime(sub.submitted_at) : '&#x2014;';
    return `
      <div class="collection-row collection-row--done" data-id="${v.id}">
        <span class="cr-plate">${v.plate}</span>
        <span class="cr-name">${v.name}</span>
        <span class="cr-mileage done-mileage">${milesRecorded} mi</span>
        <span class="cr-time">${time}</span>
        <button class="btn-icon" data-action="history" data-id="${v.id}" data-name="${v.name}" data-plate="${v.plate}">History</button>
      </div>
    `;
  }).join('');

  list.querySelectorAll('[data-action="history"]').forEach(btn => {
    btn.addEventListener('click', () =>
      openHistoryModal(btn.dataset.id, btn.dataset.name, btn.dataset.plate)
    );
  });
}

function renderOutList() {
  const list = document.getElementById('out-list');

  // Show/hide the whole out section depending on whether there are any out vehicles
  const section = document.getElementById('out-section');
  if (outVehicles.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  list.innerHTML = outVehicles.map(v => `
    <div class="collection-row collection-row--out" data-id="${v.id}">
      <span class="cr-plate">${v.plate}</span>
      <span class="cr-name">${v.name}</span>
      <span class="cr-out-label">Vehicle out</span>
      <button class="btn-icon" data-action="undo-out" data-id="${v.id}">&#8635; Move back</button>
    </div>
  `).join('');

  list.querySelectorAll('[data-action="undo-out"]').forEach(btn => {
    btn.addEventListener('click', () => undoOut(btn.dataset.id));
  });
}

// Move a vehicle back from "out" to "pending"
function undoOut(vehicleId) {
  const savedOutIds = loadOutFromSession();
  const updated = savedOutIds.filter(id => id !== vehicleId);
  saveOutToSession(updated);
  // Reload lists from current state (no Supabase fetch needed — just re-split)
  rebuildLists();
}

// Re-split pending / done / out without hitting Supabase again
function rebuildLists() {
  const savedOutIds = new Set(loadOutFromSession());
  const doneIds = new Set(doneVehicles.map(v => v.id));

  // applicable = same set currently in pending + done + out
  const applicable = [...pendingVehicles, ...doneVehicles, ...outVehicles];

  pendingVehicles = applicable.filter(v => !doneIds.has(v.id) && !savedOutIds.has(v.id));
  outVehicles     = applicable.filter(v => savedOutIds.has(v.id));
  // doneVehicles unchanged

  renderPendingList();
  renderDoneList();
  renderOutList();
  updateCounts();
}

function initDoneToggle() {
  document.getElementById('done-toggle').addEventListener('click', () => {
    const list    = document.getElementById('done-list');
    const chevron = document.getElementById('done-chevron');
    const hidden  = list.classList.toggle('hidden');
    chevron.style.transform = hidden ? '' : 'rotate(90deg)';
  });
}

function initOutToggle() {
  document.getElementById('out-toggle').addEventListener('click', () => {
    const list    = document.getElementById('out-list');
    const chevron = document.getElementById('out-chevron');
    const hidden  = list.classList.toggle('hidden');
    chevron.style.transform = hidden ? '' : 'rotate(90deg)';
  });
}

// ── Entry modal ────────────────────────────────────────────────────────────
function openEntryModal(vehicleId) {
  entryVehicle = vehicles.find(v => v.id === vehicleId);
  if (!entryVehicle) return;

  document.getElementById('entry-plate').textContent = entryVehicle.plate;
  document.getElementById('entry-name').textContent  = entryVehicle.name;
  document.getElementById('entry-prev-mileage').textContent =
    (entryVehicle.current_mileage ?? 0).toLocaleString('en-GB') + ' mi';

  const input = document.getElementById('entry-mileage-input');
  input.value = '';
  input.classList.remove('entry-input--error');
  document.getElementById('entry-validation').textContent = '';
  document.getElementById('entry-confirm-btn').disabled = false;
  document.getElementById('entry-confirm-btn').textContent = 'Confirm Mileage';

  document.getElementById('mileage-entry-modal').classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
}

function initEntryModal() {
  const modal      = document.getElementById('mileage-entry-modal');
  const input      = document.getElementById('entry-mileage-input');
  const validEl    = document.getElementById('entry-validation');
  const confirmBtn = document.getElementById('entry-confirm-btn');
  const outBtn     = document.getElementById('entry-out-btn');

  document.getElementById('mileage-entry-close').addEventListener('click', () => {
    modal.classList.add('hidden');
    entryVehicle = null;
  });
  modal.addEventListener('click', e => {
    if (e.target === modal) { modal.classList.add('hidden'); entryVehicle = null; }
  });

  // "Vehicle Out" button — remove from pending, add to out list
  outBtn.addEventListener('click', () => {
    if (!entryVehicle) return;
    const savedOutIds = loadOutFromSession();
    if (!savedOutIds.includes(entryVehicle.id)) {
      savedOutIds.push(entryVehicle.id);
      saveOutToSession(savedOutIds);
    }
    modal.classList.add('hidden');
    entryVehicle = null;
    rebuildLists();

    // Auto-expand out list so the garage assistant can see the entry landed
    const outList = document.getElementById('out-list');
    if (outList.classList.contains('hidden')) {
      outList.classList.remove('hidden');
      document.getElementById('out-chevron').style.transform = 'rotate(90deg)';
    }
  });

  input.addEventListener('input', () => {
    const val  = parseInt(input.value, 10);
    const prev = entryVehicle?.current_mileage ?? 0;
    if (input.value === '') {
      validEl.textContent = '';
      input.classList.remove('entry-input--error');
      return;
    }
    if (isNaN(val) || val < 0) { showEntryError('Please enter a valid mileage.'); return; }
    if (val < prev) {
      showEntryError(`Cannot be less than last reading (${prev.toLocaleString('en-GB')} mi).`);
      return;
    }
    validEl.textContent = '';
    input.classList.remove('entry-input--error');
  });

  confirmBtn.addEventListener('click', async () => {
    if (!entryVehicle) return;
    const val  = parseInt(input.value, 10);
    const prev = entryVehicle.current_mileage ?? 0;

    if (!input.value || isNaN(val)) {
      showEntryError('Please enter a mileage reading.');
      input.focus();
      return;
    }
    if (val < prev) {
      showEntryError(`Cannot be less than last reading (${prev.toLocaleString('en-GB')} mi).`);
      return;
    }

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving\u2026';

    const { error: logError } = await supabase
      .from('mileage_log')
      .insert([{ vehicle_id: entryVehicle.id, mileage: val, driver_name: 'Garage' }]);

    if (logError) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Mileage';
      showEntryError('Failed to save. Please try again.');
      console.error(logError);
      return;
    }

    await supabase
      .from('vehicles')
      .update({ current_mileage: val })
      .eq('id', entryVehicle.id);

    // Update local state so done list shows correct mileage without a full reload
    const idx = vehicles.findIndex(v => v.id === entryVehicle.id);
    if (idx !== -1) vehicles[idx].current_mileage = val;

    modal.classList.add('hidden');
    entryVehicle = null;

    // Refresh collection lists
    await loadCollectionData();

    // Auto-expand done list so the garage assistant can see the entry landed
    const doneList = document.getElementById('done-list');
    if (doneList.classList.contains('hidden')) {
      doneList.classList.remove('hidden');
      document.getElementById('done-chevron').style.transform = 'rotate(90deg)';
    }
  });

  function showEntryError(msg) {
    validEl.textContent = msg;
    input.classList.add('entry-input--error');
  }
}

// ── QR Grid ────────────────────────────────────────────────────────────────
function renderQRGrid() {
  const grid = document.getElementById('qr-grid');

  if (vehicles.length === 0) {
    grid.innerHTML = '<p class="empty-state">No vehicles to generate codes for.</p>';
    return;
  }

  grid.innerHTML = vehicles.map(v => `
    <div class="qr-card" id="qr-card-${v.id}">
      <canvas id="qr-canvas-${v.id}"></canvas>
      <div class="qr-card-id">${v.plate || v.id}</div>
    </div>
  `).join('');

  vehicles.forEach(v => {
    const url = `${BASE_URL}/?vehicle=${v.id}`;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();

    const canvas = document.getElementById(`qr-canvas-${v.id}`);
    const ctx = canvas.getContext('2d');
    const modules = qr.getModuleCount();
    const cellSize = 5;
    const margin = 10;
    const size = modules * cellSize + margin * 2;

    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000000';

    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(
            margin + col * cellSize,
            margin + row * cellSize,
            cellSize,
            cellSize
          );
        }
      }
    }
  });
}

// ── Add Vehicle Form ───────────────────────────────────────────────────────
function initVehicleForm() {
  const showBtn    = document.getElementById('show-add-form');
  const cancelBtn  = document.getElementById('cancel-add');
  const wrapper    = document.getElementById('add-form-wrapper');
  const form       = document.getElementById('add-vehicle-form');
  const photoInput = document.getElementById('vehicle-photo');
  const preview    = document.getElementById('file-preview');
  const statusEl   = document.getElementById('form-status');

  showBtn.addEventListener('click', () => {
    wrapper.classList.remove('hidden');
    showBtn.classList.add('hidden');
  });

  cancelBtn.addEventListener('click', () => {
    wrapper.classList.add('hidden');
    showBtn.classList.remove('hidden');
    form.reset();
    preview.classList.add('hidden');
    statusEl.classList.add('hidden');
  });

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      preview.src = e.target.result;
      preview.classList.remove('hidden');
      document.querySelector('.file-drop-label').textContent = file.name;
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-vehicle');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving\u2026';
    setStatus('', '');

    const id      = document.getElementById('vehicle-id').value.trim().toUpperCase();
    const name    = document.getElementById('vehicle-name').value.trim();
    const mileage = parseInt(document.getElementById('vehicle-mileage').value, 10);
    const file    = photoInput.files[0];

    if (vehicles.find(v => v.id === id)) {
      setStatus(`Vehicle ID "${id}" already exists.`, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Vehicle';
      return;
    }

    try {
      let photoPath = null;

      if (file) {
        const ext = file.name.split('.').pop();
        const filename = `${id}.${ext}`;
        const { error: uploadError } = await supabase
          .storage
          .from('vehicle-images')
          .upload(filename, file, { upsert: true });
        if (uploadError) throw uploadError;
        photoPath = filename;
      }

      const { error: insertError } = await supabase
        .from('vehicles')
        .insert({ id, name, image_url: photoPath, current_mileage: mileage });
      if (insertError) throw insertError;

      setStatus('Vehicle saved!', 'success');
      form.reset();
      preview.classList.add('hidden');
      document.querySelector('.file-drop-label').textContent = 'Click or drag a photo here';

      setTimeout(() => {
        wrapper.classList.add('hidden');
        showBtn.classList.remove('hidden');
        statusEl.classList.add('hidden');
      }, 1200);

      await loadAll();

    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Vehicle';
    }
  });

  function setStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = `form-status ${type}`;
    if (msg) statusEl.classList.remove('hidden');
  }
}

// ── History Modal ──────────────────────────────────────────────────────────
async function openHistoryModal(vehicleId, vehicleName, vehiclePlate) {
  const modal = document.getElementById('history-modal');
  const title = document.getElementById('modal-title');
  const body  = document.getElementById('modal-body');

  title.textContent = `${vehicleName} (${vehiclePlate}) \u2014 Mileage History`;
  body.innerHTML = '<div class="loading-state">Loading\u2026</div>';
  modal.classList.remove('hidden');

  const { data, error } = await supabase
    .from('mileage_log')
    .select('mileage, submitted_at, driver_name')
    .eq('vehicle_id', vehicleId)
    .order('submitted_at', { ascending: false });

  if (error || !data?.length) {
    body.innerHTML = '<p class="empty-state">No mileage history found.</p>';
    return;
  }

  body.innerHTML = `
    <table class="history-table">
      <thead>
        <tr>
          <th>Mileage</th>
          <th>Submitted</th>
          <th>By</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(row => `
          <tr>
            <td>${row.mileage?.toLocaleString()} mi</td>
            <td>${formatDate(row.submitted_at)}</td>
            <td>${row.driver_name ?? '\u2014'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ── Delete Modal ───────────────────────────────────────────────────────────
function openDeleteModal(vehicleId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);
  pendingDeleteId = vehicleId;
  document.getElementById('delete-confirm-text').textContent =
    `Delete "${vehicle?.name}" (${vehicle?.plate || vehicleId})? This will permanently remove the vehicle and all its mileage history.`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function initModals() {
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('history-modal').classList.add('hidden');
  });
  document.getElementById('history-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  document.getElementById('delete-modal-close').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('hidden');
  });
  document.getElementById('delete-cancel').addEventListener('click', () => {
    document.getElementById('delete-modal').classList.add('hidden');
  });
  document.getElementById('delete-confirm').addEventListener('click', async () => {
    if (!pendingDeleteId) return;
    await deleteVehicle(pendingDeleteId);
    document.getElementById('delete-modal').classList.add('hidden');
  });
}

async function deleteVehicle(vehicleId) {
  const vehicle = vehicles.find(v => v.id === vehicleId);

  if (vehicle?.image_url) {
    await supabase.storage.from('vehicle-images').remove([vehicle.image_url]);
  }
  await supabase.from('mileage_log').delete().eq('vehicle_id', vehicleId);

  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
  if (error) { console.error('Delete failed:', error); return; }

  await loadAll();
}

// ── Close Week button ─────────────────────────────────────────────────────
// Appears only when pending = 0 AND there are out vehicles.
// Writes the out vehicles to mileage_collection_skips, then calls the edge
// function directly so it can send the completion email.
function initCloseWeekBtn() {
  const btn = document.getElementById('close-week-btn');
  btn.addEventListener('click', async () => {
    if (outVehicles.length === 0) return;

    btn.disabled = true;
    btn.textContent = 'Closing week\u2026';

    const { week, year } = getFleetWeek();

    // Insert one skip row per out vehicle (ignore duplicates — unique constraint)
    const skipRows = outVehicles.map(v => ({
      fleet_week: week,
      fleet_year: year,
      vehicle_id: v.id,
      reason: 'out',
    }));

    const { error: skipErr } = await supabase
      .from('mileage_collection_skips')
      .upsert(skipRows, { onConflict: 'fleet_week,fleet_year,vehicle_id' });

    if (skipErr) {
      console.error('Failed to record skips:', skipErr);
      btn.disabled = false;
      btn.textContent = 'Close Week & Send Email';
      alert('Failed to record out vehicles. Please try again.');
      return;
    }

    // Call the edge function directly — it will find the skips and fire the email
    const SUPABASE_URL_VAL = supabase.supabaseUrl;
    const res = await fetch(
      `${SUPABASE_URL_VAL}/functions/v1/send-mileage-complete-email`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fleet_week: week, fleet_year: year }),
      }
    );

    const result = await res.json();
    console.log('Close week result:', result);

    if (result.success) {
      btn.textContent = '\u2713 Email sent';
      btn.classList.add('btn-close-week--sent');
    } else if (result.skipped) {
      btn.textContent = '\u2713 Already sent';
      btn.classList.add('btn-close-week--sent');
    } else {
      btn.disabled = false;
      btn.textContent = 'Close Week & Send Email';
      alert(`Error sending email: ${result.error ?? 'Unknown error'}`);
    }
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '\u2014';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}

function formatTime(iso) {
  if (!iso) return '\u2014';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}
