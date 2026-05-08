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
        // Initialize the current route's component
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
    }

    showView(role) {
        // Hide all views
        document.querySelectorAll('.role-view').forEach(view => {
            view.style.display = 'none';
        });
        
        // Show selected view
        const targetView = document.getElementById(`${role}-view`);
        if (targetView) {
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
            this.showView(this.getCurrentRoute());
        });
    }

    navigateTo(route) {
        window.history.pushState({}, '', route);
        this.showView(this.getCurrentRoute());
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
