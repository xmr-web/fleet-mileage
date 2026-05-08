// ============================================================
// Fleet Mechanic Component - Dashboard and Reports
// ============================================================
import { getAllVehicles, getMileage, getAllFaultReports, getAlerts, createAlert } from '../../services/supabase.js';

// DOM elements for mechanic view
let mechanicElements = {};

// ============================================================
// Load mechanic HTML content
// ============================================================
async function loadMechanicHTML() {
    try {
        const response = await fetch('./components/mechanic/mechanic.html');
        const html = await response.text();
        const container = document.getElementById('mechanic-container');
        if (container) {
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading mechanic HTML:', error);
        showMechanicError('Failed to load mechanic dashboard');
    }
}

// ============================================================
// Initialize mechanic view
// ============================================================
export async function initMechanicView() {
    console.log('Initializing mechanic view');
    
    await loadMechanicHTML();
    setupMechanicTabs();
    loadMechanicDashboard();
}

function setupMechanicTabs() {
    // Tab switching functionality
    document.querySelectorAll('[data-mechanic-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = tab.getAttribute('data-mechanic-tab');
            showMechanicTab(tabName);
        });
    });
}

function showMechanicTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.mechanic-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-mechanic-tab="${tabName}"]`).classList.add('active');
    
    // Show/hide tab content
    document.querySelectorAll('.mechanic-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    document.getElementById(`${tabName}-content`).style.display = 'block';
}

async function loadMechanicDashboard() {
    try {
        showMechanicLoading();
        
        // Load dashboard data
        const [vehicles, recentMileage, faultReports, alerts] = await Promise.all([
            getAllVehicles(),
            getRecentMileageEntries(),
            getAllFaultReports(),
            getAlerts()
        ]);
        
        populateMechanicDashboard(vehicles, recentMileage, faultReports, alerts);
        
    } catch (error) {
        console.error('Error loading mechanic dashboard:', error);
        showMechanicError('Failed to load dashboard data');
    }
}

function populateMechanicDashboard(vehicles, recentMileage, faultReports, alerts) {
    // Show overview stats
    updateMechanicStats(vehicles, faultReports, alerts);
    
    // Show recent mileage entries
    displayRecentMileage(recentMileage);
    
    // Show fault reports
    displayFaultReports(faultReports);
    
    // Show alerts
    displayAlerts(alerts);
}

function updateMechanicStats(vehicles, faultReports, alerts) {
    const totalVehicles = vehicles.length;
    const activeFaults = faultReports.filter(f => !f.resolved).length;
    const criticalAlerts = alerts.filter(a => a.priority === 'critical').length;
    
    const statsContainer = document.getElementById('mechanic-stats');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>${totalVehicles}</h3>
                    <p>Total Vehicles</p>
                </div>
                <div class="stat-card ${criticalAlerts > 0 ? 'critical' : ''}">
                    <h3>${criticalAlerts}</h3>
                    <p>Critical Alerts</p>
                </div>
                <div class="stat-card ${activeFaults > 0 ? 'warning' : ''}">
                    <h3>${activeFaults}</h3>
                    <p>Active Faults</p>
                </div>
                <div class="stat-card">
                    <h3>${vehicles.filter(v => v.needs_service).length}</h3>
                    <p>Service Due</p>
                </div>
            </div>
        `;
    }
}

function displayRecentMileage(mileageEntries) {
    const container = document.getElementById('recent-mileage');
    if (!container) return;
    
    if (mileageEntries.length === 0) {
        container.innerHTML = '<p class="no-data">No recent mileage entries</p>';
        return;
    }
    
    container.innerHTML = `
        <h3>Recent Mileage Entries</h3>
        <div class="mileage-list">
            ${mileageEntries.slice(0, 10).map(entry => `
                <div class="mileage-item">
                    <div class="mileage-vehicle">${entry.vehicle_name}</div>
                    <div class="mileage-details">
                        <span class="mileage-value">${entry.mileage.toLocaleString()} mi</span>
                        <span class="mileage-date">${new Date(entry.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayFaultReports(faultReports) {
    const container = document.getElementById('fault-reports');
    if (!container) return;
    
    if (faultReports.length === 0) {
        container.innerHTML = '<p class="no-data">No fault reports</p>';
        return;
    }
    
    container.innerHTML = `
        <h3>Fault Reports</h3>
        <div class="fault-list">
            ${faultReports.slice(0, 10).map(report => `
                <div class="fault-item ${report.priority === 'critical' ? 'critical' : ''}">
                    <div class="fault-header">
                        <span class="fault-vehicle">${report.vehicle_name}</span>
                        <span class="fault-priority ${report.priority}">${report.priority.toUpperCase()}</span>
                        <span class="fault-date">${new Date(report.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="fault-description">${report.description}</div>
                    <div class="fault-actions">
                        <button class="btn btn-sm" onclick="markFaultResolved(${report.id})">Mark Resolved</button>
                        <button class="btn btn-sm btn-secondary" onclick="viewFaultDetails(${report.id})">Details</button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function displayAlerts(alerts) {
    const container = document.getElementById('alerts');
    if (!container) return;
    
    if (alerts.length === 0) {
        container.innerHTML = '<p class="no-data">No alerts</p>';
        return;
    }
    
    container.innerHTML = `
        <h3>System Alerts</h3>
        <div class="alerts-list">
            ${alerts.map(alert => `
                <div class="alert-item ${alert.priority}">
                    <div class="alert-header">
                        <span class="alert-type">${alert.type}</span>
                        <span class="alert-priority">${alert.priority.toUpperCase()}</span>
                        <span class="alert-time">${new Date(alert.created_at).toLocaleString()}</span>
                    </div>
                    <div class="alert-message">${alert.message}</div>
                    ${alert.vehicle_id ? `<div class="alert-vehicle">Vehicle: ${alert.vehicle_id}</div>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

async function getRecentMileageEntries() {
    // This would need to be implemented in supabase.js
    // For now, return empty array
    return [];
}

async function markFaultResolved(faultId) {
    try {
        // Update fault report as resolved
        // This would need to be implemented in supabase.js
        console.log(`Marking fault ${faultId} as resolved`);
        
        // Refresh fault reports
        const faultReports = await getAllFaultReports();
        displayFaultReports(faultReports);
        
    } catch (error) {
        console.error('Error marking fault resolved:', error);
        alert('Failed to mark fault as resolved');
    }
}

function viewFaultDetails(faultId) {
    // Show detailed fault information
    console.log(`Viewing details for fault ${faultId}`);
    // This could open a modal with full details
}

function showMechanicLoading() {
    const container = document.getElementById('mechanic-container');
    if (container) {
        container.innerHTML = '<div class="loading">Loading dashboard...</div>';
    }
}

function showMechanicError(message) {
    const container = document.getElementById('mechanic-container');
    if (container) {
        container.innerHTML = `<div class="error">${message}</div>`;
    }
}

// Export for router
window.mechanicComponent = {
    init: initMechanicView
};
