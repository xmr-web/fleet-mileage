/**
 * Fleet Admin Dashboard
 * Tabs: Vehicles | Mileage | QR Codes
 *
 * Depends on:
 *   - your existing supabaseClient.js  (exports `supabase`)
 *   - qrcode-generator npm package (installed separately)
 *
 * Supabase tables used:
 *   vehicles  (id, name, photo_url, current_mileage)
 *   mileage_log (vehicle_id, mileage, submitted_at)
 *
 * Storage:
 *   bucket: vehicle-images (private — uses signed URLs)
 */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../supabase.config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
import qrcode from 'qrcode-generator';

const BASE_URL = 'https://weekly-mileage.netlify.app';

// ── State ──────────────────────────────────────────────────────────────────
let vehicles = [];
let pendingDeleteId = null;

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Check for an active session — redirect to login if not authenticated
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.replace('/admin/login.html');
    return;
  }

  // Show the logged-in user's email in the header
  const userEmailEl = document.getElementById('user-email');
  if (userEmailEl) userEmailEl.textContent = session.user.email;

  // Logout button
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.replace('/admin/login.html');
  });

  initTabs();
  initVehicleForm();
  initModals();
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

  // Construct public URLs directly (bucket is public, no expiry)
  const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/vehicle-images`;
  vehicles = data.map(v => ({
    ...v,
    resolvedUrl: v.image_url ? `${STORAGE_BASE}/${encodeURIComponent(v.image_url)}` : null
  }));
 console.log('Vehicles loaded:', vehicles);  // ← add here
  renderVehicleGrid();
  renderMileageList();
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
        : `<div class="vehicle-card-photo placeholder">🚗</div>`
      }
      <div class="vehicle-card-body">
        <div class="vehicle-card-id">${v.id}</div>
        <div class="vehicle-card-name">${v.name}</div>
        <div class="vehicle-card-mileage">Current mileage: <strong>${v.current_mileage?.toLocaleString() ?? '—'}</strong></div>
        <div class="vehicle-card-actions">
          <button class="btn-icon danger" data-action="delete" data-id="${v.id}">Delete</button>
        </div>
      </div>
    </div>
  `).join('');

  // Delete buttons
  grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
  });
}

// ── Mileage List ───────────────────────────────────────────────────────────
function renderMileageList() {
  const list = document.getElementById('mileage-list');

  if (vehicles.length === 0) {
    list.innerHTML = '<p class="empty-state">No vehicles found.</p>';
    return;
  }

  list.innerHTML = `
    <div class="mileage-list-header">
      <span>ID</span>
      <span>Name</span>
      <span style="text-align:right">Current Mileage</span>
      <span></span>
    </div>
    ${vehicles.map(v => `
      <div class="mileage-row">
        <span class="mileage-row-id">${v.id}</span>
        <span class="mileage-row-name">${v.name}</span>
        <span class="mileage-row-miles">${v.current_mileage?.toLocaleString() ?? '—'} <span>mi</span></span>
        <span class="mileage-row-action">
          <button class="btn-icon" data-action="history" data-id="${v.id}" data-name="${v.name}">View history</button>
        </span>
      </div>
    `).join('')}
  `;

  list.querySelectorAll('[data-action="history"]').forEach(btn => {
    btn.addEventListener('click', () => openHistoryModal(btn.dataset.id, btn.dataset.name));
  });
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
      <div class="qr-card-id">${v.id}</div>
      <div class="qr-card-name">${v.name}</div>
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

  // Photo preview
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
    submitBtn.textContent = 'Saving…';
    setStatus('', '');

    const id      = document.getElementById('vehicle-id').value.trim().toUpperCase();
    const name    = document.getElementById('vehicle-name').value.trim();
    const mileage = parseInt(document.getElementById('vehicle-mileage').value, 10);
    const file    = photoInput.files[0];

    // Validate ID not already taken
    if (vehicles.find(v => v.id === id)) {
      setStatus(`Vehicle ID "${id}" already exists.`, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Vehicle';
      return;
    }

    try {
      let photoPath = null;

      // 1. Upload photo if provided
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

      // 2. Insert vehicle row
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
async function openHistoryModal(vehicleId, vehicleName) {
  const modal   = document.getElementById('history-modal');
  const title   = document.getElementById('modal-title');
  const body    = document.getElementById('modal-body');

  title.textContent = `${vehicleName} (${vehicleId}) — Mileage History`;
  body.innerHTML = '<div class="loading-state">Loading…</div>';
  modal.classList.remove('hidden');

  const { data, error } = await supabase
    .from('mileage_log')
    .select('mileage, submitted_at')
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
        </tr>
      </thead>
      <tbody>
        ${data.map(row => `
          <tr>
            <td>${row.mileage?.toLocaleString()} mi</td>
            <td>${formatDate(row.submitted_at)}</td>
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
    `Delete "${vehicle?.name}" (${vehicleId})? This will permanently remove the vehicle and all its mileage history.`;
  document.getElementById('delete-modal').classList.remove('hidden');
}

function initModals() {
  // History modal close
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('history-modal').classList.add('hidden');
  });
  document.getElementById('history-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.add('hidden');
  });

  // Delete modal
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

  // Delete photo from storage if it exists
  if (vehicle?.image_url) {
    await supabase.storage.from('vehicle-images').remove([vehicle.image_url]);
  }

  // Delete mileage log entries
  await supabase.from('mileage_log').delete().eq('vehicle_id', vehicleId);

  // Delete vehicle row
  const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId);
  if (error) { console.error('Delete failed:', error); return; }

  await loadAll();
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(iso));
}
