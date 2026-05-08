// ============================================================
// Driver Component - QR Code Vehicle Access
// ============================================================
import { getVehicle, getLatestMileage, addMileage, getKnownIssues } from '../../services/supabase.js';

// DOM elements for driver view
let driverElements = {};

// ============================================================
// Initialize driver view
// ============================================================
export function initDriverView() {
    console.log('Initializing driver view');
    
    // Get vehicle ID from URL
    const params = new URLSearchParams(window.location.search);
    const vehicleId = params.get('vehicle');
    
    if (!vehicleId) {
        showDriverError('No vehicle ID found in QR code URL.');
        return;
    }
    
    loadDriverView(vehicleId);
}

async function loadDriverView(vehicleId) {
    try {
        // Show loading state
        showDriverLoading();
        
        // Load vehicle data
        const vehicle = await getVehicle(vehicleId);
        if (!vehicle) {
            showDriverError('Vehicle not found. Please contact garage.');
            return;
        }
        
        // Load latest mileage
        const latestMileage = await getLatestMileage(vehicleId);
        
        // Load known issues
        const knownIssues = await getKnownIssues();
        
        // Populate vehicle info
        populateVehicleInfo(vehicle, latestMileage);
        
        // Show known issues if any
        if (knownIssues && knownIssues.length > 0) {
            showKnownIssues(knownIssues);
        }
        
        // Show main app screen
        showDriverApp();
        
    } catch (error) {
        console.error('Error loading driver view:', error);
        showDriverError('Failed to load vehicle data. Please try again.');
    }
}

function showDriverLoading() {
    const driverView = document.getElementById('driver-view');
    driverView.innerHTML = `
        <div class="screen active" id="driver-loading">
            <div class="loader-ring"></div>
            <p class="loader-text">Loading vehicle…</p>
        </div>
    `;
}

function showDriverError(message) {
    const driverView = document.getElementById('driver-view');
    driverView.innerHTML = `
        <div class="screen" id="driver-error">
            <div class="error-icon">⚠️</div>
            <h2>Error</h2>
            <p>${message}</p>
            <button class="back-btn" onclick="window.location.reload()">Try Again</button>
        </div>
    `;
}

function showDriverApp() {
    const driverView = document.getElementById('driver-view');
    driverView.innerHTML = `
        <!-- Vehicle Info Card -->
        <div class="card">
            <div class="vehicle-photo">
                <img id="vehicle-photo" src="${driverElements.currentVehicle?.image_url || ''}" alt="Vehicle">
                <div class="photo-overlay"></div>
                <div class="vehicle-badge">
                    <span class="vehicle-id">${driverElements.currentVehicle?.id || ''}</span>
                    <span class="vehicle-name">${driverElements.currentVehicle?.name || ''}</span>
                </div>
            </div>
        </div>

        <!-- Mileage Entry -->
        <div class="card">
            <div class="prev-mileage-row">
                <span class="label">Last recorded mileage</span>
                <span class="prev-value">${driverElements.latestMileage?.mileage || '—'}</span>
            </div>

            <div class="input-block">
                <label class="label" for="mileage-input">Enter current mileage</label>
                <div class="input-wrap">
                    <input
                        type="number"
                        id="mileage-input"
                        inputmode="numeric"
                        pattern="[0-9]*"
                        placeholder="0"
                        min="0"
                        autocomplete="off"
                    />
                    <span class="unit">mi</span>
                </div>
                <p class="validation-msg" id="validation-msg"></p>
            </div>

            <button class="confirm-btn" onclick="confirmMileage()">
                <span id="btn-label">Confirm Mileage</span>
            </button>
        </div>

        <!-- Known Issues -->
        <div id="known-issues-section" style="display: none;">
            <div class="card">
                <h3>Known Issues (No need to report)</h3>
                <div id="known-issues-list"></div>
            </div>
        </div>

        <!-- Success Screen (initially hidden) -->
        <div id="success-screen" class="screen" style="display: none;">
            <div class="success-icon">
                <svg viewBox="0 0 52 52" fill="none">
                    <circle cx="26" cy="26" r="25" stroke="currentColor" stroke-width="2"/>
                    <path d="M14 26l8 8 16-16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <h2>Mileage Logged</h2>
            <p id="success-message">Thank you. Your entry has been recorded.</p>
            <div class="success-detail" id="success-detail"></div>
            <button class="back-btn-plain" onclick="backToMenu()">← Back to menu</button>
        </div>
    `;
    
    // Setup event listeners
    setupDriverEventListeners();
}

function populateVehicleInfo(vehicle, latestMileage) {
    driverElements.currentVehicle = vehicle;
    driverElements.latestMileage = latestMileage;
    
    // Update vehicle photo
    const photoEl = document.getElementById('vehicle-photo');
    if (photoEl && vehicle.image_url) {
        photoEl.src = vehicle.image_url;
    }
    
    // Update vehicle badge
    const vehicleIdEl = document.querySelector('.vehicle-id');
    const vehicleNameEl = document.querySelector('.vehicle-name');
    if (vehicleIdEl) vehicleIdEl.textContent = vehicle.id;
    if (vehicleNameEl) vehicleNameEl.textContent = vehicle.name;
    
    // Update previous mileage
    const prevMileageEl = document.getElementById('prev-mileage');
    if (prevMileageEl && latestMileage) {
        prevMileageEl.textContent = latestMileage.mileage.toLocaleString();
    }
}

function showKnownIssues(knownIssues) {
    const issuesSection = document.getElementById('known-issues-section');
    const issuesList = document.getElementById('known-issues-list');
    
    if (!issuesSection || !issuesList) return;
    
    issuesSection.style.display = 'block';
    issuesList.innerHTML = knownIssues.map(issue => `
        <div class="known-issue">
            <h4>${issue.title}</h4>
            <p>${issue.description}</p>
            <small>Reported: ${new Date(issue.created_at).toLocaleDateString()}</small>
        </div>
    `).join('');
}

function setupDriverEventListeners() {
    const mileageInput = document.getElementById('mileage-input');
    if (mileageInput) {
        mileageInput.addEventListener('input', validateMileageInput);
        mileageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                confirmMileage();
            }
        });
    }
}

function validateMileageInput() {
    const input = document.getElementById('mileage-input');
    const validationMsg = document.getElementById('validation-msg');
    
    if (!input || !validationMsg) return;
    
    const mileage = parseInt(input.value);
    const prevMileage = driverElements.latestMileage?.mileage || 0;
    
    if (isNaN(mileage) || mileage < 0) {
        validationMsg.textContent = 'Please enter a valid mileage';
        return false;
    }
    
    if (mileage < prevMileage) {
        validationMsg.textContent = `Mileage cannot be less than last recorded (${prevMileage.toLocaleString()} mi)`;
        return false;
    }
    
    validationMsg.textContent = '';
    return true;
}

async function confirmMileage() {
    if (!validateMileageInput()) return;
    
    const mileageInput = document.getElementById('mileage-input');
    const mileage = parseInt(mileageInput.value);
    
    try {
        const result = await addMileage({
            vehicle_id: driverElements.currentVehicle.id,
            mileage: mileage,
            created_at: new Date().toISOString()
        });
        
        showSuccessScreen(mileage);
        
    } catch (error) {
        console.error('Error adding mileage:', error);
        const validationMsg = document.getElementById('validation-msg');
        if (validationMsg) {
            validationMsg.textContent = 'Failed to save mileage. Please try again.';
        }
    }
}

function showSuccessScreen(mileage) {
    const appScreen = document.querySelector('.card:last-of-type');
    const successScreen = document.getElementById('success-screen');
    
    if (appScreen) appScreen.style.display = 'none';
    if (successScreen) successScreen.style.display = 'block';
    
    // Update success message
    const successMsg = document.getElementById('success-message');
    const successDetail = document.getElementById('success-detail');
    
    if (successMsg) {
        successMsg.textContent = 'Mileage logged successfully!';
    }
    
    if (successDetail) {
        const prevMileage = driverElements.latestMileage?.mileage || 0;
        const difference = mileage - prevMileage;
        successDetail.textContent = `Recorded ${mileage.toLocaleString()} mi (${difference > 0 ? '+' + difference.toLocaleString() : '0'} mi since last entry)`;
    }
}

function backToMenu() {
    // Go back to garage view
    window.location.href = '/garage';
}

// Export for router
window.driverComponent = {
    init: initDriverView
};
