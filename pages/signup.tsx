import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import styles from '../styles/Auth.module.css';
import { FaPuzzlePiece } from 'react-icons/fa';

export default function Signup() {
  const router = useRouter();
  const [name, setName] = useState('');
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
      // For now, we'll just simulate a signup
      console.log('Signing up with:', { name, email });
      
      // Redirect to the workspace after "signup"
      setTimeout(() => {
        router.push('/workspace');
      }, 1500);
    } catch (err) {
      setError('There was an error creating your account');
      setLoading(false);
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
            Join BlocklyCollab to start your coding journey in a supportive environment.
          </p>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.authForm}>
          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.formLabel}>
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.formInput}
              placeholder="Enter your full name"
              required
            />
          </div>

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
              placeholder="Create a password"
              required
            />
          </div>

          <button 
            type="submit" 
            className={styles.authButton}
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className={styles.authFooter}>
          <p>
            Already have an account?{' '}
            <Link href="/login" className={styles.authLink}>
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
