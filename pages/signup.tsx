import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "../styles/Auth.module.css";
import { FaPuzzlePiece, FaGoogle } from "react-icons/fa";
import { useState, useEffect } from "react";
import {
  signUp,
  signInWithGoogle,
  auth,
  updateUserProfile,
} from "../lib/firebase";
import { getFirestore, doc, setDoc, Timestamp } from "firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (user && !authLoading) {
      router.push("/dashboard");
    }
  }, [user, authLoading, router]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!email || !password) {
      setError("Email and password are required");
      setLoading(false);
      return;
    }

    if (!name) {
      setError("Name is required");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      setLoading(false);
      return;
    }

    const result = await signUp(email, password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      // Update user profile with name and school
      await updateUserProfile({
        displayName: name,
        photoURL: null,
      });

      // Store school info in Firestore
      try {
        const user = auth.currentUser;
        if (user) {
          const db = getFirestore();
          const userRef = doc(db, "users", user.uid);
          await setDoc(
            userRef,
            {
              name,
              school,
              email: user.email,
              createdAt: Timestamp.now(),
            },
            { merge: true }
          );
        }
      } catch (err) {
        console.error("Error storing additional user data:", err);
      }

      // Redirect to dashboard on successful signup
      router.push("/dashboard");
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");

    try {
      const { signInWithGoogle } = await import("../lib/firebase");
      const result = await signInWithGoogle();

      if (result.user) {
        // Popup method succeeded - user will be set by AuthContext
        console.log("Google sign-up successful");
        // AuthContext will handle the redirect to dashboard
      }
      // Note: The redirect will happen automatically via AuthContext
    } catch (error: any) {
      setError(error.message || "Google sign-in failed");
      setLoading(false);
    }
  };

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className={styles.authContainer}>
        <div className={styles.authFormContainer}>
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <div style={{ marginBottom: "1rem" }}>Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.authContainer}>
      <Head>
        <title>Sign Up | BlocklyCollab</title>
        <meta
          name="description"
          content="Join BlocklyCollab - Collaborative programming for autistic youth"
        />
      </Head>

      <div className={styles.authFormContainer}>
        <div className={styles.authHeader}>
          <Link href="/" className={styles.logoLink}>
            <div className={styles.logo}>
              <FaPuzzlePiece className={styles.logoIcon} />
              <span>BlocklyCollab</span>
            </div>
          </Link>
          <h1 className={styles.authTitle}>Create your account</h1>
          <p className={styles.authSubtitle}>
            Start your journey with collaborative programming designed for
            everyone.
          </p>
        </div>

        <div className={styles.authForm}>
          {error && <div className={styles.errorMessage}>{error}</div>}

          <form onSubmit={handleSignUp}>
            <div className={styles.formGroup}>
              <label htmlFor="name">Name</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="school">School/Organization (Optional)</label>
              <input
                id="school"
                type="text"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="Enter your school or organization"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Choose a password (6+ characters)"
                minLength={6}
                required
              />
            </div>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={loading || authLoading}
            >
              {loading ? "Creating Account..." : "Sign Up"}
            </button>
          </form>

          <div className={styles.divider}>
            <span>Or</span>
          </div>

          <button
            onClick={handleGoogleSignIn}
            className={styles.googleButton}
            disabled={loading || authLoading}
          >
            <FaGoogle className={styles.googleIcon} />
            Continue with Google
          </button>

          <div className={styles.authFooter}>
            Already have an account? <Link href="/login">Sign In</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
