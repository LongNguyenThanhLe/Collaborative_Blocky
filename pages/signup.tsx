import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/Auth.module.css';
import { FaPuzzlePiece, FaGoogle } from 'react-icons/fa';
import { useState } from 'react';
import { signUp, signInWithGoogle } from '../lib/firebase';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (!email || !password) {
      setError('Email and password are required');
      setLoading(false);
      return;
    }
    
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }
    
    const result = await signUp(email, password);
    
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      // Redirect to workspace on successful signup
      router.push('/workspace');
    }
  };
  
  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    
    const result = await signInWithGoogle();
    
    if (result.error) {
      setError(result.error);
      setLoading(false);
    } else {
      // Redirect to workspace on successful signup
      router.push('/workspace');
    }
  };
  
  return (
    <div className={styles.authContainer}>
      <Head>
        <title>Sign Up | BlocklyCollab</title>
        <meta name="description" content="Sign up for BlocklyCollab - Collaborative programming for autistic youth" />
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
            Join BlocklyCollab to start building with blocks today.
          </p>
        </div>

        <div className={styles.authForm}>
          {error && <div className={styles.errorMessage}>{error}</div>}
          
          <form onSubmit={handleSignUp}>
            <div className={styles.formGroup}>
              <label htmlFor="email" className={styles.formLabel}>Email</label>
              <input
                id="email"
                type="email"
                className={styles.formInput}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            
            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.formLabel}>Password</label>
              <input
                id="password"
                type="password"
                className={styles.formInput}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password (min. 6 characters)"
                required
                minLength={6}
              />
            </div>
            
            <button 
              type="submit" 
              className={styles.authButton}
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
          
          <div className={styles.divider}>
            <span>or</span>
          </div>
          
          <button 
            onClick={handleGoogleSignIn} 
            className={styles.googleButton}
            disabled={loading}
          >
            <FaGoogle className={styles.googleIcon} />
            Sign up with Google
          </button>
          
          <div className={styles.authFooter}>
            Already have an account?{' '}
            <Link href="/login" className={styles.authLink}>
              Log in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
