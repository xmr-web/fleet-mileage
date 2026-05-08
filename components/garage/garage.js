// ============================================================
// Garage Assistant Component - Vehicle Management
// ============================================================
import { getAllVehicles, getMileage, addMileage, getAlerts, createAlert } from '../../services/supabase.js';
import qrcode from 'qrcode-generator';

// DOM elements for garage view
let garageElements = {};

// ============================================================
// Initialize garage view
// ============================================================
export function initGarageView() {
    console.log('Initializing garage view');
    
    // Initialize garage functionality
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
        
        const vehicles = await getAllVehicles();
        const outVehicles = getOutFromSession();
        
        // Filter vehicles based on toggle states
        const doneToggle = document.getElementById('done-toggle');
        const outToggle = document.getElementById('out-toggle');
        
        let filteredVehicles = vehicles;
        
        if (outToggle?.checked) {
            filteredVehicles = vehicles.filter(v => outVehicles.includes(v.id));
        } else if (doneToggle?.checked) {
            filteredVehicles = vehicles.filter(v => !outVehicles.includes(v.id));
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
                            <button class="btn btn-sm" onclick="openEntryModal('${vehicle.id}')">Enter Mileage</button>
                            <button class="btn btn-sm btn-secondary" onclick="toggleVehicleOut('${vehicle.id}')">
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
    const vehicleData = vehicles.find(v => v.id === vehicleId);
    
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
    // This would need to be implemented in supabase.js
    // For now, we'll just reload the page
    console.log(`Updated vehicle ${vehicleId} mileage to ${mileage}`);
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
    init: initGarageView
};
