// ============================================================
// Simple routing system for role-based views
// ============================================================
export class Router {
    constructor() {
        this.routes = {
            '/': 'driver',
            '/driver': 'driver',
            '/garage': 'garage',
            '/mechanic': 'mechanic',
            '/manager': 'manager'
        };
        this.currentRoute = this.getCurrentRoute();
        this.init();
    }

    getCurrentRoute() {
        const path = window.location.pathname;
        
        // Handle root with vehicle parameter
        if (path === '/' || path === '/index.html') {
            const urlParams = new URLSearchParams(window.location.search);
            const vehicleId = urlParams.get('vehicle');
            return vehicleId ? 'driver' : 'garage';
        }
        
        // Handle direct routes
        for (const [route, role] of Object.entries(this.routes)) {
            if (path === route || path.startsWith(route + '/')) {
                return role;
            }
        }
        
        // Default to garage
        return 'garage';
    }

    init() {
        this.showView(this.currentRoute);
        this.setupNavigation();
        this.initializeComponents();
    }

    initializeComponents() {
        // Small delay to ensure components are loaded
        setTimeout(() => {
            // Initialize current route's component
            switch (this.currentRoute) {
                case 'driver':
                    if (window.driverComponent) {
                        window.driverComponent.init();
                    }
                    break;
                case 'garage':
                    if (window.garageComponent) {
                        window.garageComponent.init();
                    }
                    break;
                case 'mechanic':
                    if (window.mechanicComponent) {
                        window.mechanicComponent.init();
                    }
                    break;
                case 'manager':
                    if (window.managerComponent) {
                        window.managerComponent.init();
                    }
                    break;
            }
        }, 100);
    }

    showView(role) {
        console.log('=== SHOW VIEW START ===');
        console.log(`Showing view for role: ${role}`);
        
        // Hide all views
        const allViews = document.querySelectorAll('.role-view');
        console.log(`Found ${allViews.length} role-view elements`);
        
        allViews.forEach(view => {
            console.log(`Hiding view: ${view.id} (currently: ${view.style.display})`);
            view.style.display = 'none';
        });
        
        // Show selected view
        const targetView = document.getElementById(`${role}-view`);
        console.log(`Target view found: ${!!targetView}`);
        if (targetView) {
            console.log(`Showing view: ${targetView.id}`);
            targetView.style.display = 'block';
            console.log(`View ${targetView.id} is now: ${targetView.style.display}`);
        } else {
            console.error(`View not found: ${role}-view`);
        }
        
        // Update navigation
        console.log('Updating navigation...');
        this.updateNavigation(role);
        console.log('=== SHOW VIEW END ===');
    }

    setupNavigation() {
        console.log('=== SETUP NAVIGATION START ===');
        // Add click handlers for navigation
        const navButtons = document.querySelectorAll('[data-route]');
        console.log(`Found ${navButtons.length} navigation buttons`);
        
        navButtons.forEach((link, index) => {
            const route = link.getAttribute('data-route');
            const text = link.textContent;
            console.log(`Button ${index}: "${text}" -> route="${route}"`);
            console.log(`Button element:`, link);
            
            link.addEventListener('click', (e) => {
                console.log('=== BUTTON CLICKED ===');
                console.log(`Button clicked: ${text}`);
                console.log(`Route: ${route}`);
                console.log(`Event:`, e);
                console.log(`Current URL before: ${window.location.pathname}`);
                
                e.preventDefault();
                e.stopPropagation();
                
                console.log('Calling navigateTo...');
                this.navigateTo(route);
                
                console.log(`Current URL after: ${window.location.pathname}`);
                console.log('=== BUTTON CLICK END ===');
            });
        });
        console.log('=== SETUP NAVIGATION END ===');
    }

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            const newRole = this.getCurrentRoute();
            this.showView(newRole);
            this.initializeComponents();
        });
    }

    navigateTo(route) {
        console.log('=== NAVIGATE TO START ===');
        console.log(`Navigating to route: ${route}`);
        console.log(`Current URL before pushState: ${window.location.pathname}`);
        
        window.history.pushState({}, '', route);
        console.log(`URL after pushState: ${window.location.pathname}`);
        
        const newRole = this.getCurrentRoute();
        console.log(`Determined role: ${newRole}`);
        
        console.log('Calling showView...');
        this.showView(newRole);
        
        console.log('Calling initializeComponents...');
        this.initializeComponents();
        
        console.log(`Final URL: ${window.location.pathname}`);
        console.log('=== NAVIGATE TO END ===');
    }

    updateNavigation(activeRole) {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        
        const activeLink = document.querySelector(`[data-route="${activeRole}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }
}

export const router = new Router();
