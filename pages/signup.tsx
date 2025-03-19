import Head from 'next/head';
import Link from 'next/link';
import { SignUp } from '@clerk/nextjs';
import styles from '../styles/Auth.module.css';
import { FaPuzzlePiece } from 'react-icons/fa';
import { useEffect, useState } from 'react';

export default function Signup() {
  const [isClient, setIsClient] = useState(false);
  
  // Ensure component only renders on client-side
  useEffect(() => {
    setIsClient(true);
  }, []);
  
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

        <div className={styles.clerkContainer}>
          {isClient && (
            <SignUp 
              routing="path" 
              path="/signup" 
              signInUrl="/login"
              afterSignUpUrl="/workspace"
              appearance={{
                elements: {
                  formButtonPrimary: styles.authButton,
                  footerActionLink: styles.authLink
                }
              }}
            />
          )}
          
          {!isClient && (
            <div className={styles.loadingAuth}>
              Loading sign up form...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
