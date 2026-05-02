import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

// ─── Retry helper ────────────────────────────────────────────────────────────
// Retries an async fn up to `maxAttempts` times with exponential backoff.
// Only retries on network / 5xx errors; stops immediately on 4xx auth errors.
async function retryWithBackoff<T>(
  fn: () => Promise<{ response: Response; data: T }>,
  maxAttempts = 3,
  baseDelayMs = 600,
): Promise<{ response: Response; data: T }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      // Don't retry on genuine 4xx auth errors — only on 5xx / network issues
      if (result.response.status < 500) return result;
      lastError = new Error(`Server error ${result.response.status}`);
    } catch (err) {
      lastError = err; // network failure
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
    }
  }
  throw lastError;
}
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

export type UserRole = "superadmin" | "community_admin" | "customer";
export type UserPlan = "free" | "pro" | "enterprise";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  plan: UserPlan;
  community_id?: string;
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Extract user metadata from API response
  const extractUser = useCallback(
    (apiResponse: any): User => {
      // Trust the backend API response completely - it has verified the role
      return {
        id: apiResponse.id,
        email: apiResponse.email || "",
        displayName: apiResponse.displayName || "User",
        role: apiResponse.role as UserRole,
        plan: (apiResponse.plan as UserPlan) || "pro",
        community_id: apiResponse.community_id,
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
        console.log("[AuthContext] Starting profile fetch for:", firebaseUser.email);
        
        // Get ID token
        const idToken = await firebaseUser.getIdToken();
        
        // Call backend API to get profile with verified role
        const response = await fetch("/api/v1/auth/me", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error("[AuthContext] Failed to fetch profile:", response.status, response.statusText);
          setUser(null);
          setLoading(false);
          return;
        }

        const data = await response.json();
        
        if (data.success && data.user) {
          console.log(`[AuthContext] ✅ Profile fetched - role: ${data.user.role}`);
          setUser(extractUser(data.user));
        } else {
          console.error("[AuthContext] Invalid response from backend:", data);
          setUser(null);
        }
      } catch (err) {
        console.error("[AuthContext] Error fetching profile:", err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    },
    [extractUser],
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          await fetchProfile(firebaseUser);
        } else {
          setUser(null);
          setLoading(false);
        }
      },
    );

    return () => unsubscribe();
  }, [fetchProfile]);

  const login = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ success: boolean; user?: User; error?: string }> => {
      setLoading(true);
      try {
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

        // Step 2: Get a FRESH ID token (forceRefresh=true avoids sending a
        //         cached token that the backend might not have indexed yet)
        const idToken = await credential.user.getIdToken(true);

        // Step 3: Verify token with backend and get profile.
        // Retried up to 3 times with backoff to handle transient network hiccups.
        console.log("[AuthContext] Verifying token with backend...");
        let response: Response;
        let data: any;
        try {
          const result = await retryWithBackoff(async () => {
            const res = await fetch("/api/v1/auth/verify-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ idToken }),
            });
            const json = await res.json();
            return { response: res, data: json };
          });
          response = result.response;
          data = result.data;
        } catch (fetchErr: any) {
          console.error("[AuthContext] Backend unreachable after retries:", fetchErr);
          setLoading(false);
          return { success: false, error: "Cannot reach server. Please check your connection." };
        }

        if (!response.ok) {
          console.error("[AuthContext] Token verification failed:", response.status, data);
          setLoading(false);
          return { success: false, error: data?.error ?? "Token verification failed" };
        }

        if (data.success && data.user) {
          const finalUser = extractUser(data.user);
          console.log(`[AuthContext] ✅ Login successful - role: ${finalUser.role}`);
          setUser(finalUser);
          setLoading(false);
          return { success: true, user: finalUser };
        }

        console.error("[AuthContext] Invalid response from backend:", data);
        setLoading(false);
        return { success: false, error: "Invalid response from server" };
      } catch (err: any) {
        console.error("[AuthContext] Login error:", err);
        setLoading(false);
        return {
          success: false,
          error: err.message || "Login failed",
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
      try {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );

        if (credential.user) {
          // Set display name in Firebase Auth
          await updateProfile(credential.user, { displayName });

          // Create profile in Firestore
          const profile = {
            uid: credential.user.uid,
            firebase_uid: credential.user.uid,
            email: credential.user.email,
            full_name: displayName,
            role: "customer",
            plan: "pro",
            created_at: new Date().toISOString(),
          };

          await setDoc(doc(db, "customers", credential.user.uid), profile);

          await fetchProfile(credential.user);
          return { success: true };
        }

        return { success: false, error: "Signup failed" };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || "Signup failed",
        };
      }
    },
    [fetchProfile],
  );

  const logout = useCallback(async (): Promise<void> => {
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
