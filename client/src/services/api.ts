import axios, {
  type AxiosResponse,
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";
import { io } from "socket.io-client";
import { auth } from "../lib/firebase";

// API Configuration
// Use environment variable if provided, otherwise fallback to the current origin in production
// or localhost in development. This prevents "not showing data" errors after deployment.
const VITE_API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? `${window.location.origin}/api/v1`
    : "http://localhost:3000/api/v1");

const API_BASE_URL = VITE_API_URL.split("/api/v1")[0];
const SOCKET_URL = API_BASE_URL;

console.log("[API Config] Base URL:", API_BASE_URL);
console.log("[API Config] API URL:", VITE_API_URL);

export const socket = io(SOCKET_URL, {
  auth: async (cb) => {
    const user = auth?.currentUser;
    if (!user) {
      cb({});
      return;
    }

    try {
      const token = await user.getIdToken();
      cb({ token });
    } catch {
      cb({});
    }
  },
});

// Create Axios Instance
const api = axios.create({
  baseURL: VITE_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000, // 30 seconds global timeout (auth cold-start can be slow)
});

// Request Interceptor: Inject Firebase Auth token when a user is signed in.
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  try {
    const firebaseUser = auth?.currentUser;
    if (firebaseUser) {
      const token = await firebaseUser.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    }

    console.warn(
      "[API Interceptor] No authenticated Firebase user — request may be unauthorized",
    );
  } catch (error) {
    console.error("[API Interceptor] Failed to get token:", error);
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
    const errorData = error.response?.data as
      | { error?: { message?: string } | string }
      | undefined;
    const message =
      (typeof errorData?.error === "object"
        ? errorData.error?.message
        : errorData?.error) || error.message;

    console.error(
      `[API Error] ${status || "Network"}: ${typeof message === "object" ? JSON.stringify(message) : message}`,
      {
        url: error.config?.url,
        method: error.config?.method,
      },
    );

    if (status === 401) {
      console.error(
        "[API Error] 🔐 AUTHENTICATION FAILED - Check if user is logged in and token is valid",
      );
      console.error(
        "[API Error] Authorization header present:",
        Boolean(error.config?.headers?.Authorization),
      );
    }

    return Promise.reject(error);
  },
);

export default api;
