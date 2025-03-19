import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import styles from '../styles/Auth.module.css';
import { FaPuzzlePiece } from 'react-icons/fa';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // This is where Clerk authentication would be implemented
      // For now, we'll just simulate a login
      console.log('Logging in with:', email);
      
      // Redirect to the workspace after "login"
      setTimeout(() => {
        router.push('/workspace');
      }, 1500);
    } catch (err) {
      setError('Invalid email or password');
      setLoading(false);
    }
  };

  return (
    <div className={styles.authContainer}>
      <Head>
        <title>Login | BlocklyCollab</title>
        <meta name="description" content="Login to BlocklyCollab - Collaborative programming for autistic youth" />
      </Head>

      <div className={styles.authFormContainer}>
        <div className={styles.authHeader}>
          <Link href="/" className={styles.logoLink}>
            <div className={styles.logo}>
              <FaPuzzlePiece className={styles.logoIcon} />
              <span>BlocklyCollab</span>
            </div>
          </Link>
          <h1 className={styles.authTitle}>Log in to your account</h1>
          <p className={styles.authSubtitle}>
            Welcome back! Please enter your credentials to access your workspace.
          </p>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.authForm}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.formLabel}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.formInput}
              placeholder="Enter your email"
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.formLabel}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.formInput}
              placeholder="Enter your password"
              required
            />
          </div>

          <div className={styles.forgotPassword}>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>

          <button 
            type="submit" 
            className={styles.authButton}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

        <div className={styles.authFooter}>
          <p>
            Don't have an account?{' '}
            <Link href="/signup" className={styles.authLink}>
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
