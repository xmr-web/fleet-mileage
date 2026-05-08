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
        console.log(`initializeComponents called for route: ${this.currentRoute}`);
        
        // Small delay to ensure components are loaded
        setTimeout(() => {
            console.log('Checking component availability...');
            console.log('Available components:', {
                driver: !!window.driverComponent,
                garage: !!window.garageComponent,
                mechanic: !!window.mechanicComponent,
                manager: !!window.managerComponent
            });
            
            // Initialize the current route's component
            switch (this.currentRoute) {
                case 'driver':
                    if (window.driverComponent) {
                        console.log('Initializing driver component');
                        window.driverComponent.init();
                    } else {
                        console.log('Driver component not found');
                    }
                    break;
                case 'garage':
                    if (window.garageComponent) {
                        console.log('Initializing garage component');
                        window.garageComponent.init();
                    } else {
                        console.log('Garage component not found');
                    }
                    break;
                case 'mechanic':
                    if (window.mechanicComponent) {
                        console.log('Initializing mechanic component');
                        window.mechanicComponent.init();
                    } else {
                        console.log('Mechanic component not found');
                    }
                    break;
                case 'manager':
                    if (window.managerComponent) {
                        console.log('Initializing manager component');
                        window.managerComponent.init();
                    } else {
                        console.log('Manager component not found');
                    }
                    break;
            }
        }, 100);
    }

    showView(role) {
        console.log(`showView called with role: ${role}`);
        
        // Hide all views
        document.querySelectorAll('.role-view').forEach(view => {
            console.log(`Hiding view: ${view.id}`);
            view.style.display = 'none';
        });
        
        // Show selected view
        const targetView = document.getElementById(`${role}-view`);
        console.log(`Target view found: ${!!targetView}`);
        if (targetView) {
            console.log(`Showing view: ${targetView.id}`);
            targetView.style.display = 'block';
        }
        
        // Update navigation
        this.updateNavigation(role);
    }

    setupNavigation() {
        // Add click handlers for navigation
        document.querySelectorAll('[data-route]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const route = link.getAttribute('data-route');
                this.navigateTo(route);
            });
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            const newRole = this.getCurrentRoute();
            this.showView(newRole);
            this.initializeComponents();
        });
    }

    navigateTo(route) {
        window.history.pushState({}, '', route);
        const newRole = this.getCurrentRoute();
        this.showView(newRole);
        this.initializeComponents();
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
