import { Component, type ErrorInfo, type ReactNode } from "react";
import api from "../../services/api";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });

    // Log error to backend for monitoring
    this.logErrorToBackend(error, errorInfo);
  }

  private async logErrorToBackend(error: Error, errorInfo: ErrorInfo) {
    try {
      await api.post("/frontend-errors", {
        error_message: error.message,
        stack_trace: errorInfo.componentStack || error.stack,
        url: window.location.href,
        user_agent: navigator.userAgent,
      });
    } catch (logError) {
      console.error(
        "[ErrorBoundary] Failed to log error to backend:",
        logError,
      );
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // If we are in a small container (not full screen)
      return (
        <div className="p-6 bg-red-50/50 border border-red-100 rounded-xl text-center space-y-2">
          <div className="text-red-500 font-bold text-xs uppercase tracking-widest">
            Component Error
          </div>
          <p className="text-[10px] text-slate-500 line-clamp-2">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-[10px] font-bold text-blue-600 underline"
          >
            Reset Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
