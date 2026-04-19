import axios, {
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { io } from 'socket.io-client';
import { auth } from "../lib/firebase";

const VITE_API_URL = import.meta.env.VITE_API_URL || "/api/v1";
const SOCKET_URL = import.meta.env.VITE_WS_URL || (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/v1', '') : '');

export const socket = io(SOCKET_URL, {
  auth: async (cb) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      cb({ token });
    } else {
      cb({});
    }
  }
});

// Create Axios Instance
const api = axios.create({
  baseURL: VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000, // 15 seconds global timeout for telemetry stability
});

// Helper to wait for Firebase Auth initialization
const waitForAuth = (): Promise<void> => {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged(() => {
      unsubscribe();
      resolve();
    });
  });
};

// Request Interceptor: Inject Firebase Auth Token
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  try {
    // If auth is not yet initialized, wait for it
    if (!auth.currentUser) {
      // Give Firebase a moment to resolve the user state
      await waitForAuth();
    }

    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error("[API Interceptor] Failed to get session:", error);
  }
  return config;
});

// Response Interceptor: Auto-unwrap StandardResponse & Handle Errors
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Standard Response Unwrapping (Envelope Pattern)
    const data = response.data;
    if (
      data &&
      typeof data === "object" &&
      ("status" in data || "success" in data) &&
      "data" in data
    ) {
      return {
        ...response,
        data: data.data,
        meta: data.meta,
      };
    }
    return response;
  },
  (error: AxiosError) => {
    const status = error.response?.status;
    const message = (error.response?.data as any)?.error || error.message;
    console.error(`[API Error] ${status || 'Network'}: ${message}`, {
        url: error.config?.url,
        method: error.config?.method
    });
    return Promise.reject(error);
  },
);

export default api;
