import { useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import styles from '../styles/Workspace.module.css';
import BlocklyWorkspace from '../components/BlocklyWorkspace';
import { useAuth } from '../contexts/AuthContext';
import { logOut } from '../lib/firebase';
import { FaSignOutAlt, FaUser } from 'react-icons/fa';

export default function Workspace() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);
  
  const handleSignOut = async () => {
    await logOut();
    router.push('/');
  };
  
  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading workspace...</p>
      </div>
    );
  }
  
  // Only render workspace if user is authenticated
  if (!user) {
    return null; // Will redirect to login via the useEffect
  }
  
  return (
    <div className={styles.workspaceContainer}>
      <Head>
        <title>BlocklyCollab Workspace</title>
        <meta name="description" content="BlocklyCollab programming workspace - Build and collaborate on code" />
      </Head>

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>BlocklyCollab</h1>
          <span className={styles.divider}>|</span>
          <span className={styles.projectName}>My Project</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.userInfo}>
            <FaUser className={styles.userIcon} />
            <span className={styles.userEmail}>{user.email}</span>
          </div>
          <button onClick={handleSignOut} className={styles.signOutButton}>
            <FaSignOutAlt /> Sign Out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <BlocklyWorkspace />
      </main>
    </div>
  );
}
