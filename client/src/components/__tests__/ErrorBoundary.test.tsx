import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from '../ui/ErrorBoundary';
import api from '../../services/api';

vi.mock('../../services/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

function ThrowError() {
  throw new Error('Boom');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } } as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the default fallback and reports the error to the backend', async () => {
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(await screen.findByText('Component Error')).toBeInTheDocument();
    expect(screen.getByText('Boom')).toBeInTheDocument();

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/frontend-errors',
        expect.objectContaining({
          error_message: 'Boom',
          url: window.location.href,
          user_agent: navigator.userAgent,
        }),
      );
    });
  });

  it('renders a custom fallback when one is provided', async () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowError />
      </ErrorBoundary>,
    );

    expect(await screen.findByText('Custom fallback')).toBeInTheDocument();
  });
});
