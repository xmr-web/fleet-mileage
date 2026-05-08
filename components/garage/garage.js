// ============================================================
// Garage Assistant Component - Vehicle Management
// ============================================================
import { getAllVehicles, getMileage, addMileage, getAlerts, createAlert, updateVehicle } from '../../services/supabase.js';
import qrcode from 'qrcode-generator/dist/qrcode.mjs';

// DOM elements for garage view
let garageElements = {};
let currentVehicles = [];

// ============================================================
// Load garage HTML content
// ============================================================
async function loadGarageHTML() {
    try {
        const response = await fetch('./components/garage/garage.html');
        const html = await response.text();
        const container = document.getElementById('garage-container');
        if (container) {
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading garage HTML:', error);
        const container = document.getElementById('garage-container');
        if (container) {
            container.innerHTML = '<div class="error">Failed to load garage dashboard</div>';
        }
    }
}

// ============================================================
// Initialize garage view
// ============================================================
export async function initGarageView() {
    console.log('Initializing garage view');
    
    await loadGarageHTML();
    setupGarageTabs();
    setupGarageModals();
    setupGarageEventListeners();
    loadAllVehicles();
}

function setupGarageTabs() {
    // Tab switching functionality
    document.querySelectorAll('[data-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = tab.getAttribute('data-tab');
            showGarageTab(tabName);
        });
    });
}

function showGarageTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Show/hide tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`${tabName}-content`).style.display = 'block';
}

function setupGarageModals() {
    // Modal close handlers
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            closeGarageModals();
        }
    });
    
    // Close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', closeGarageModals);
    });
}

function setupGarageEventListeners() {
    // Vehicle entry modal
    const entryModal = document.getElementById('entry-modal');
    if (entryModal) {
        entryModal.addEventListener('click', (e) => {
            if (e.target === entryModal) {
                closeGarageModals();
            }
        });
    }
    
    // Done/Out toggle
    document.getElementById('done-toggle')?.addEventListener('change', loadAllVehicles);
    document.getElementById('out-toggle')?.addEventListener('change', loadAllVehicles);
}

async function loadAllVehicles() {
    try {
        showGarageLoading();
        
        currentVehicles = await getAllVehicles();
        const outVehicles = getOutFromSession();
        
        // Filter vehicles based on toggle states
        const doneToggle = document.getElementById('done-toggle');
        const outToggle = document.getElementById('out-toggle');
        
        let filteredVehicles = currentVehicles;
        
        if (outToggle?.checked) {
            filteredVehicles = currentVehicles.filter(v => outVehicles.includes(v.id));
        } else if (doneToggle?.checked) {
            filteredVehicles = currentVehicles.filter(v => !outVehicles.includes(v.id));
        }
        
        displayVehicles(filteredVehicles);
        
    } catch (error) {
        console.error('Error loading vehicles:', error);
        showGarageError('Failed to load vehicles');
    }
}

async function displayVehicles(vehicles) {
    const container = document.getElementById('garage-container');
    if (!container) return;
    
    // Load garage HTML content
    try {
        const response = await fetch('./components/garage/garage.html');
        const html = await response.text();
        container.innerHTML = html;
        
        // Initialize garage functionality after HTML is loaded
        setupGarageTabs();
        setupGarageModals();
        setupGarageEventListeners();
        
        // Display vehicles
        const vehiclesGrid = document.getElementById('vehicles-grid');
        if (vehiclesGrid) {
            if (vehicles.length === 0) {
                vehiclesGrid.innerHTML = `
                    <div class="empty-state">
                        <h3>No vehicles found</h3>
                        <p>Add your first vehicle to get started.</p>
                    </div>
                `;
                return;
            }
            
            const outVehicles = getOutFromSession();
            vehiclesGrid.innerHTML = vehicles.map(vehicle => `
                <div class="vehicle-card ${outVehicles.includes(vehicle.id) ? 'out' : ''}" data-vehicle-id="${vehicle.id}">
                    <div class="vehicle-photo">
                        <img src="${vehicle.image_url || ''}" alt="${vehicle.name}">
                        <div class="photo-overlay"></div>
                        <div class="vehicle-badge">
                            <span class="vehicle-id">${vehicle.id}</span>
                            <span class="vehicle-name">${vehicle.name}</span>
                        </div>
                    </div>
                    <div class="vehicle-info">
                        <h3>${vehicle.name}</h3>
                        <div class="vehicle-stats">
                            <div class="stat">
                                <span class="label">Last Mileage:</span>
                                <span class="value">${vehicle.last_mileage?.toLocaleString() || '—'}</span>
                            </div>
                        </div>
                        <div class="vehicle-actions">
                            <button class="btn btn-sm" onclick="window.garageComponent.openEntryModal('${vehicle.id}')">Enter Mileage</button>
                            <button class="btn btn-sm btn-secondary" onclick="window.garageComponent.toggleVehicleOut('${vehicle.id}')">
                                ${outVehicles.includes(vehicle.id) ? 'Mark In' : 'Mark Out'}
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('Error loading garage HTML:', error);
        container.innerHTML = '<div class="error">Failed to load garage interface</div>';
    }
}

function openEntryModal(vehicleId) {
    const modal = document.getElementById('entry-modal');
    const vehicleData = currentVehicles.find(v => v.id === vehicleId);
    
    if (!modal || !vehicleData) return;
    
    // Populate modal with vehicle data
    document.getElementById('modal-vehicle-name').textContent = vehicleData.name;
    document.getElementById('modal-vehicle-id').textContent = vehicleData.id;
    document.getElementById('modal-last-mileage').textContent = vehicleData.last_mileage?.toLocaleString() || '—';
    document.getElementById('modal-mileage-input').value = '';
    
    modal.style.display = 'flex';
    garageElements.entryVehicle = vehicleData;
}

async function submitMileageEntry() {
    const mileageInput = document.getElementById('modal-mileage-input');
    const mileage = parseInt(mileageInput.value);
    
    if (!mileage || isNaN(mileage)) {
        alert('Please enter a valid mileage');
        return;
    }
    
    if (mileage <= (garageElements.entryVehicle?.last_mileage || 0)) {
        alert('Mileage must be greater than last recorded mileage');
        return;
    }
    
    try {
        await addMileage({
            vehicle_id: garageElements.entryVehicle.id,
            mileage: mileage,
            created_at: new Date().toISOString()
        });
        
        // Update vehicle's last mileage
        await updateVehicleLastMileage(garageElements.entryVehicle.id, mileage);
        
        closeGarageModals();
        loadAllVehicles();
        
    } catch (error) {
        console.error('Error submitting mileage:', error);
        alert('Failed to save mileage. Please try again.');
    }
}

function toggleVehicleOut(vehicleId) {
    const outVehicles = getOutFromSession();
    
    if (outVehicles.includes(vehicleId)) {
        // Mark as IN
        const updatedOutVehicles = outVehicles.filter(id => id !== vehicleId);
        saveOutToSession(updatedOutVehicles);
    } else {
        // Mark as OUT
        saveOutToSession([...outVehicles, vehicleId]);
    }
    
    loadAllVehicles();
}

function getOutFromSession() {
    try {
        const raw = sessionStorage.getItem('fleet_out');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveOutToSession(ids) {
    try {
        sessionStorage.setItem('fleet_out', JSON.stringify(ids));
    } catch { /* ignore */ }
}

function closeGarageModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
    });
}

function showGarageLoading() {
    const vehiclesGrid = document.getElementById('vehicles-grid');
    if (vehiclesGrid) {
        vehiclesGrid.innerHTML = '<div class="loading">Loading vehicles...</div>';
    }
}

function showGarageError(message) {
    const vehiclesGrid = document.getElementById('vehicles-grid');
    if (vehiclesGrid) {
        vehiclesGrid.innerHTML = `<div class="error">${message}</div>`;
    }
}

async function updateVehicleLastMileage(vehicleId, mileage) {
    try {
        await updateVehicle(vehicleId, { last_mileage: mileage });
        console.log(`Updated vehicle ${vehicleId} mileage to ${mileage}`);
    } catch (error) {
        console.error('Error updating vehicle mileage:', error);
        throw error;
    }
}

// QR Code generation
function generateQRCode(vehicleId) {
    const qrUrl = `${window.location.origin}/?vehicle=${vehicleId}`;
    const qrData = qrcode(0, 'M');
    qrData.addData(qrUrl);
    qrData.make();
    
    return qrData.createDataURL(4);
}

function downloadQRCode(vehicleId, vehicleName) {
    const qrDataUrl = generateQRCode(vehicleId);
    const link = document.createElement('a');
    link.download = `QR_${vehicleId}_${vehicleName.replace(/\s+/g, '_')}.png`;
    link.href = qrDataUrl;
    link.click();
}

// Export for router
window.garageComponent = {
    init: initGarageView,
    openEntryModal,
    toggleVehicleOut
};
