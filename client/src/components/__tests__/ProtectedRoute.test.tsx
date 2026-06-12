import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProtectedRoute from '../ui/ProtectedRoute';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

const mockUseAuth = vi.mocked(useAuth);

function renderProtectedRoute({
  authValue,
  allowedRoles,
}: {
  authValue: ReturnType<typeof useAuth>;
  allowedRoles?: Array<'superadmin' | 'community_admin' | 'customer'>;
}) {
  mockUseAuth.mockReturnValue(authValue);

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/secret']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
          <Route element={<ProtectedRoute allowedRoles={allowedRoles} />}>
            <Route path="/secret" element={<div>Secret Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { invalidateSpy };
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading state while auth is resolving', () => {
    renderProtectedRoute({
      authValue: {
        user: null,
        loading: true,
        isAuthenticated: false,
        role: null,
        setUser: vi.fn(),
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
      },
    });

    expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    expect(screen.queryByText('Secret Page')).not.toBeInTheDocument();
  });

  it('redirects unauthenticated users to login', async () => {
    renderProtectedRoute({
      authValue: {
        user: null,
        loading: false,
        isAuthenticated: false,
        role: null,
        setUser: vi.fn(),
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
      },
    });

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('renders the route for allowed users and invalidates cached dashboard queries', async () => {
    const { invalidateSpy } = renderProtectedRoute({
      allowedRoles: ['superadmin'],
      authValue: {
        user: {
          id: 'u_1',
          email: 'admin@example.com',
          displayName: 'Admin User',
          role: 'superadmin',
          plan: 'enterprise',
        },
        loading: false,
        isAuthenticated: true,
        role: 'superadmin',
        setUser: vi.fn(),
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
      },
    });

    expect(await screen.findByText('Secret Page')).toBeInTheDocument();

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['nodes'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard_stats'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['active_alerts'] });
    });
  });

  it('redirects authenticated users without the required role to dashboard', async () => {
    renderProtectedRoute({
      allowedRoles: ['superadmin'],
      authValue: {
        user: {
          id: 'u_2',
          email: 'customer@example.com',
          displayName: 'Customer User',
          role: 'customer',
          plan: 'pro',
        },
        loading: false,
        isAuthenticated: true,
        role: 'customer',
        setUser: vi.fn(),
        login: vi.fn(),
        signup: vi.fn(),
        logout: vi.fn(),
      },
    });

    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
  });
});
