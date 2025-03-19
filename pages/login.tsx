import Head from 'next/head';
import Link from 'next/link';
import { SignIn } from '@clerk/nextjs';
import styles from '../styles/Auth.module.css';
import { FaPuzzlePiece } from 'react-icons/fa';

export default function Login() {
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

        <div className={styles.clerkContainer}>
          <SignIn 
            routing="path" 
            path="/login" 
            signUpUrl="/signup"
            afterSignInUrl="/workspace"
          />
        </div>
      </div>
    </div>
  );
}
