import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { auth, isFirebaseEnabled } from "../lib/firebase";
import api from "../services/api";

export type UserRole = "superadmin" | "community_admin" | "customer";
export type UserPlan = "free" | "pro" | "enterprise";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  plan: UserPlan;
  community_id?: string;
  customer_id?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  role: UserRole | null;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; user?: User; error?: string }>;
  signup: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const firebaseReady = isFirebaseEnabled && !!auth;
const VALID_ROLES: UserRole[] = ["superadmin", "community_admin", "customer"];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { status?: number } }).response;
    return response?.status;
  }
  return undefined;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const userRef = useRef<User | null>(null);
  const loginCompleteRef = useRef(false); // blocks onAuthStateChanged from racing login()

  // Keep ref in sync with state
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Extract user metadata from API response
  const extractUser = useCallback(
    (apiResponse: Record<string, unknown>): User => {
      // Trust the backend API response completely - it has verified the role
      return {
        id: String(apiResponse.id || ""),
        email: String(apiResponse.email || ""),
        displayName: String(apiResponse.displayName || "User"),
        role: apiResponse.role as UserRole,
        plan: (apiResponse.plan as UserPlan) || "pro",
        community_id:
          typeof apiResponse.community_id === "string"
            ? apiResponse.community_id
            : undefined,
        customer_id:
          typeof apiResponse.customer_id === "string"
            ? apiResponse.customer_id
            : String(apiResponse.id || ""),
      };
    },
    [],
  );

  /**
   * Fetch user profile from backend API
   * Backend has permissions to read from Firestore and determine correct role
   */
  const fetchProfile = useCallback(
    async (firebaseUser: FirebaseUser) => {
      try {
        console.log(
          "[AuthContext] Starting profile fetch for:",
          firebaseUser.email,
        );

        // Get ID token from Firebase Auth
        const idToken = await firebaseUser.getIdToken();

        // Call backend API to get profile with verified role using axios instance
        try {
          const res = await api.get("/auth/me", {
            headers: { Authorization: `Bearer ${idToken}` },
          });
          const data = res.data ?? res;
          if (data && data.success && data.user) {
            const profile = data.user;
            // Guard: never accept a response without a valid role
            if (!profile?.role || !VALID_ROLES.includes(profile.role)) {
              console.error(
                "[AuthContext] Invalid role received:",
                profile?.role,
              );
              setUser(null);
              return;
            }
            console.log(
              `[AuthContext] ✅ Profile fetched - role: ${profile.role}`,
            );
            setUser(extractUser(profile));
          } else {
            console.error("[AuthContext] Invalid response from backend:", data);
            setUser(null);
          }
        } catch (err: unknown) {
          const status = getErrorStatus(err);
          if (status === 503) {
            // Server temporarily down — keep existing session, don't wipe user
            console.warn(
              "[AuthContext] Auth service 503 — keeping existing session",
            );
            return;
          }
          if (status === 401) {
            // Genuinely unauthorized — clear session
            console.error("[AuthContext] 401 Unauthorized — clearing session");
            setUser(null);
            return;
          }
          console.error(
            "[AuthContext] Failed to fetch profile:",
            status,
            getErrorMessage(err),
          );
          // Don't wipe user on unknown errors — preserve existing session
        }
      } catch (err) {
        console.error("[AuthContext] Error fetching profile:", err);
        // Don't wipe user on token fetch failure — preserve existing session
      } finally {
        setLoading(false);
      }
    },
    [extractUser],
  );

  useEffect(() => {
    if (!firebaseReady || !auth) {
      console.warn(
        "[AuthContext] Firebase is disabled in local dev; auth features are unavailable.",
      );
      setUser(null);
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          // Skip if login() already handled this — prevents double-fetch race
          if (loginCompleteRef.current) {
            console.log(
              "[AuthContext] Login already handled, skipping onAuthStateChanged fetch",
            );
            setLoading(false);
            return;
          }
          // Skip redundant fetch if we already have this user loaded
          if (userRef.current && userRef.current.id === firebaseUser.uid) {
            console.log(
              "[AuthContext] User already loaded, skipping redundant profile fetch",
            );
            setLoading(false);
            return;
          }
          await fetchProfile(firebaseUser);
        } else {
          loginCompleteRef.current = false; // reset on logout
          setUser(null);
          setLoading(false);
        }
      },
    );

    return () => unsubscribe();
  }, [firebaseReady, auth, fetchProfile]);

  const login = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ success: boolean; user?: User; error?: string }> => {
      setLoading(true);
      try {
        if (!firebaseReady || !auth) {
          setLoading(false);
          return {
            success: false,
            error: "Firebase auth is not configured in this environment.",
          };
        }

        // Step 1: Firebase authentication
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );

        if (!credential.user) {
          setLoading(false);
          return { success: false, error: "Login failed" };
        }

        // Step 2: Get a fresh ID token for backend verification
        const idToken = await credential.user.getIdToken(true);

        // Step 3: Verify token with backend and get profile.
        // Retried up to 3 times with backoff to handle transient network hiccups.
        console.log("[AuthContext] Verifying token with backend...");
        try {
          const res = await api.post(
            "/auth/verify-token",
            { idToken },
            { timeout: 40000 },
          );
          const data = res.data ?? res;
          if (data && data.success && data.user) {
            const finalUser = extractUser(data.user);
            // Guard: validate role before accepting
            if (!finalUser?.role || !VALID_ROLES.includes(finalUser.role)) {
              console.error(
                "[AuthContext] Invalid role from verify-token:",
                finalUser?.role,
              );
              setLoading(false);
              return {
                success: false,
                error: "Server returned invalid user role",
              };
            }
            console.log(
              `[AuthContext] ✅ Login successful - role: ${finalUser.role}`,
            );
            setUser(finalUser);
            loginCompleteRef.current = true; // blocks onAuthStateChanged race
            setLoading(false);
            return { success: true, user: finalUser };
          }
          console.error("[AuthContext] Invalid response from backend:", data);
          setLoading(false);
          return { success: false, error: "Invalid response from server" };
        } catch (err: unknown) {
          console.error(
            "[AuthContext] Backend unreachable or verification failed:",
            getErrorStatus(err),
            getErrorMessage(err),
          );
          setLoading(false);
          return {
            success: false,
            error: "Cannot reach server. Please check your connection.",
          };
        }
      } catch (err: unknown) {
        console.error("[AuthContext] Login error:", err);
        setLoading(false);
        return {
          success: false,
          error: getErrorMessage(err) || "Login failed",
        };
      }
    },
    [extractUser],
  );

  const signup = useCallback(
    async (
      email: string,
      password: string,
      displayName: string,
    ): Promise<{ success: boolean; error?: string }> => {
      setLoading(true);
      try {
        if (!firebaseReady || !auth) {
          setLoading(false);
          return {
            success: false,
            error: "Firebase signup is not configured in this environment.",
          };
        }

        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );

        if (credential.user) {
          // Set display name in Firebase Auth
          await updateProfile(credential.user, { displayName });

          await api.post("/auth/profile", {
            displayName,
          });

          await fetchProfile(credential.user);
          setLoading(false);
          return { success: true };
        }

        setLoading(false);
        return { success: false, error: "Signup failed" };
      } catch (err: unknown) {
        setLoading(false);
        return {
          success: false,
          error: getErrorMessage(err) || "Signup failed",
        };
      }
    },
    [fetchProfile],
  );

  const logout = useCallback(async (): Promise<void> => {
    loginCompleteRef.current = false; // allow onAuthStateChanged to process logout
    if (!auth) {
      setUser(null);
      return;
    }

    await signOut(auth);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        role: user?.role || null,
        setUser,
        login,
        signup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined)
    throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
