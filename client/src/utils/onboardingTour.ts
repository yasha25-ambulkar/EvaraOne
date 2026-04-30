import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { tourNavigate } from './tourNavigate';

// Keep driver instance outside so it survives page transitions
let driverObj: Driver | null = null;

const waitForElement = (selector: string, timeout = 4000): Promise<boolean> => {
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

const navigateTo = async (path: string, waitFor: string) => {
    // Only navigate if not already on that page
    if (!window.location.pathname.startsWith(path)) {
        tourNavigate(path);
    }
    await waitForElement(waitFor);
};

export const startOnboardingTour = () => {
    // Destroy any existing instance first
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
            {
                element: 'nav',
                popover: {
                    title: '👋 Welcome to EvaraOne!',
                    description: 'This is your main navigation bar. From here you can access all sections of your dashboard.',
                    side: 'bottom' as const
                }
            },
            {
                element: '[data-tour="map"]',
                popover: {
                    title: '🗺️ Live Map',
                    description: 'Click here to open the live map and see all your IoT devices in real time.',
                    side: 'bottom' as const,
                    onNextClick: async () => {
                        await navigateTo('/map', '[data-tour="map-legend"]');
                        driverObj?.moveNext();
                    }
                }
            },
            {
                element: '[data-tour="map-legend"]',
                popover: {
                    title: '📍 Device Map Index',
                    description: 'This legend shows all your device locations. Each pin on the map is a live IoT device — green means online, red means offline.',
                    side: 'right' as const,
                    onNextClick: async () => {
                        await navigateTo('/dashboard', '[data-tour="kpi-cards"]');
                        driverObj?.moveNext();
                    }
                }
            },
            {
                element: '[data-tour="dashboard"]',
                popover: {
                    title: '📊 Dashboard',
                    description: 'Click here to go to your personal dashboard with live data from all devices.',
                    side: 'bottom' as const,
                    onNextClick: async () => {
                        await navigateTo('/dashboard', '[data-tour="kpi-cards"]');
                        driverObj?.moveNext();
                    }
                }
            },
            {
                element: '[data-tour="kpi-cards"]',
                popover: {
                    title: '📈 KPI Cards',
                    description: 'These cards show your key metrics — tank level, flow rate, TDS and more — all updating in real time.',
                    side: 'top' as const,
                    onNextClick: async () => {
                        await navigateTo('/nodes', '[data-tour="nodes-grid"]');
                        driverObj?.moveNext();
                    }
                }
            },
            {
                element: '[data-tour="nodes"]',
                popover: {
                    title: '🔧 All Nodes',
                    description: 'Click here to view and manage all your IoT sensor nodes.',
                    side: 'bottom' as const,
                    onNextClick: async () => {
                        await navigateTo('/nodes', '[data-tour="nodes-grid"]');
                        driverObj?.moveNext();
                    }
                }
            },
            {
                element: '[data-tour="nodes-grid"]',
                popover: {
                    title: '📡 Your Devices',
                    description: 'Each card represents one of your IoT devices — status, location and live readings at a glance.',
                    side: 'top' as const,
                    onNextClick: async () => {
                        tourNavigate('/evaratank/EV-TNK-003');
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        driverObj?.moveNext();
                    }
                }
            },
            {
                element: '[data-tour="analytics-content"]',
                popover: {
                    title: '📈 Device Analytics',
                    description: 'Detailed charts and trends for each device — tank levels, flow rates, TDS and more over time.',
                    side: 'top' as const
                }
            },
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
