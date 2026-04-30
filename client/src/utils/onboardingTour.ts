import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { tourNavigate } from './tourNavigate';

let driverObj: Driver | null = null;

const waitForElement = (selector: string, timeout = 5000): Promise<boolean> => {
    return new Promise((resolve) => {
        const interval = setInterval(() => {
            if (document.querySelector(selector)) {
                clearInterval(interval);
                resolve(true);
            }
        }, 100);
        setTimeout(() => {
            clearInterval(interval);
            resolve(false);
        }, timeout);
    });
};

export const startOnboardingTour = () => {
    if (driverObj) {
        driverObj.destroy();
        driverObj = null;
    }

    driverObj = driver({
        animate: true,
        overlayOpacity: 0.75,
        stagePadding: 10,
        allowClose: true,
        showProgress: true,
        doneBtnText: "🎉 Let's Go!",
        nextBtnText: 'Next →',
        prevBtnText: '← Back',
        onDestroyed: () => {
            localStorage.setItem('evara_tour_done', 'true');
            driverObj = null;
        },
        steps: [
            // STEP 1 — Navbar
            {
                element: 'nav',
                popover: {
                    title: '👋 Welcome to EvaraOne!',
                    description: 'This is your main navigation bar. From here you can access all sections of your dashboard.',
                    side: 'bottom' as const
                }
            },
            // STEP 2 — Map nav link → navigate to /map
            {
                element: '[data-tour="map"]',
                popover: {
                    title: '🗺️ Live Map',
                    description: 'Click here to open the live map and see all your IoT devices in real time.',
                    side: 'bottom' as const,
                    onNextClick: async () => {
                        tourNavigate('/map');
                        await waitForElement('[data-tour="map-legend"]', 3000);
                        driverObj?.moveNext();
                    }
                }
            },
            // STEP 3 — Map legend
            {
                element: '[data-tour="map-legend"]',
                popover: {
                    title: '📍 Device Map Index',
                    description: 'This legend shows all your device locations. Each pin on the map is a live IoT device — green means online, red means offline.',
                    side: 'right' as const,
                    onNextClick: async () => {
                        tourNavigate('/dashboard');
                        await waitForElement('[data-tour="kpi-cards"]', 4000);
                        driverObj?.moveNext();
                    }
                }
            },
            // STEP 4 — Dashboard nav link (already on dashboard)
            {
                element: '[data-tour="dashboard"]',
                popover: {
                    title: '📊 Dashboard',
                    description: 'This is your personal dashboard with live data from all devices.',
                    side: 'bottom' as const
                }
            },
            // STEP 5 — KPI Cards
            {
                element: '[data-tour="kpi-cards"]',
                popover: {
                    title: '📈 KPI Cards',
                    description: 'These cards give you a quick overview — total devices, water consumption today, active alerts, and overall system health at a glance.',
                    side: 'bottom' as const,
                    onNextClick: async () => {
                        tourNavigate('/nodes');
                        await waitForElement('[data-tour="nodes-grid"]', 4000);
                        driverObj?.moveNext();
                    }
                }
            },
            // STEP 6 — All Nodes nav link (already on nodes)
            {
                element: '[data-tour="nodes"]',
                popover: {
                    title: '🔧 All Nodes',
                    description: 'Click here to view and manage all your IoT sensor nodes.',
                    side: 'bottom' as const
                }
            },
            // STEP 7 — Nodes grid
            {
                element: '[data-tour="nodes-grid"]',
                popover: {
                    title: '📡 Your Devices',
                    description: 'Each card represents one of your IoT devices — status, location and live readings at a glance.',
                    side: 'top' as const,
                    onNextClick: async () => {
                        tourNavigate('/evaratank/EV-TNK-003');
                        await waitForElement('[data-tour="analytics-content"]', 5000);
                        driverObj?.moveNext();
                    }
                }
            },
            // STEP 8 — Analytics page
            {
                element: '[data-tour="analytics-content"]',
                popover: {
                    title: '📈 Device Analytics',
                    description: 'Detailed charts and trends for each device — tank levels, flow rates, TDS and more over time.',
                    side: 'top' as const
                }
            },
            // STEP 9 — Help button
            {
                element: '[data-tour="help-button"]',
                popover: {
                    title: '❓ Need Help?',
                    description: 'Click this button anytime to restart this tour and get a full walkthrough again!',
                    side: 'left' as const
                }
            }
        ]
    });

    driverObj.drive();
};
