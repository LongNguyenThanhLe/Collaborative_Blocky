import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { User, getRedirectResult } from "firebase/auth";
import {
  auth,
  logOut,
  signInWithGoogle,
  testFirebaseConfig,
} from "../lib/firebase";
import { useRouter } from "next/router";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOutUser: () => Promise<void>;
  googleSignIn: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOutUser: async () => {},
  googleSignIn: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let redirectHandled = false;

    // Test Firebase configuration
    console.log("=== AuthContext Initialization ===");
    testFirebaseConfig();

    // Check for redirect result first
    const checkRedirectResult = async () => {
      try {
        console.log("Checking for Google redirect result...");
        const result = await getRedirectResult(auth);
        console.log("Redirect result:", result);

        if (result?.user && !redirectHandled) {
          console.log(
            "Google sign-in successful via redirect:",
            result.user.email
          );
          console.log("User object:", result.user);
          redirectHandled = true;
          setUser(result.user);
          setLoading(false);

          // Navigate to dashboard after successful Google sign-in
          // Only redirect if not already on dashboard or workspace
          const currentPath = router.pathname;
          console.log("Current path:", currentPath);
          if (
            currentPath === "/login" ||
            currentPath === "/signup" ||
            currentPath === "/"
          ) {
            console.log("Redirecting to dashboard after Google sign-in");
            router.push("/dashboard");
          }
        } else if (result === null) {
          console.log(
            "No redirect result found (user likely navigated here normally)"
          );
        }
      } catch (error: any) {
        console.error("Error processing redirect result:", error);
        console.error("Error code:", error.code);
        console.error("Error message:", error.message);
        setLoading(false);
      }
    };

    // Check redirect result on mount
    checkRedirectResult();

    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChanged((authUser) => {
      console.log("Auth state changed:", authUser?.email || "null");
      console.log("Full auth user object:", authUser);

      if (authUser) {
        setUser(authUser);

        // Only redirect if we're on auth pages and haven't already handled a redirect
        if (!redirectHandled) {
          const currentPath = router.pathname;
          console.log("User authenticated, current path:", currentPath);
          if (currentPath === "/login" || currentPath === "/signup") {
            console.log("Redirecting to dashboard after auth state change");
            router.push("/dashboard");
          }
        }
      } else {
        setUser(null);
      }

      // Always set loading to false after auth state is determined
      if (!redirectHandled) {
        setLoading(false);
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [router]);

  const signOutUser = async () => {
    try {
      setLoading(true);
      await logOut();
      setUser(null);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setLoading(false);
    }
  };

  const googleSignIn = async () => {
    try {
      setLoading(true);
      console.log("Starting Google sign-in...");
      console.log("Current URL:", window.location.href);

      const result = await signInWithGoogle();
      console.log("Sign-in function result:", result);

      // Handle both popup and redirect results
      if (result.user) {
        // Popup method succeeded
        console.log("Google sign-in successful (popup method)");
        setUser(result.user);
        router.push("/dashboard");
      } else {
        // Redirect method was used - the result will be handled by getRedirectResult in useEffect
        console.log("Google sign-in initiated (redirect method)");
        console.log("Waiting for redirect to Google...");
      }
    } catch (error) {
      console.error("Error signing in with Google:", error);
      setLoading(false);
    }
  };

  const value = {
    user,
    loading,
    signOutUser,
    googleSignIn,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
