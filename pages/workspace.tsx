import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BlocklyWorkspace from '../components/BlocklyWorkspace';
import styles from '../styles/Workspace.module.css';
import { FaPuzzlePiece, FaSignOutAlt, FaUser } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';

export default function Workspace() {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // This runs only on client-side
    setIsClient(true);

    // Redirect to login if not authenticated
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Early return while checking authentication and during server-side rendering
  if (loading || !isClient) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner} />
        <p>Loading workspace...</p>
      </div>
    );
  }

  // If not authenticated after checking, don't render the content
  if (!user) {
    return null;
  }

  return (
    <div className={styles.container}>
      <Head>
        <title>Workspace | BlocklyCollab</title>
        <meta name="description" content="Collaborative block programming workspace" />
      </Head>

      <header className={styles.header}>
        <div className={styles.logo}>
          <FaPuzzlePiece className={styles.logoIcon} />
          <span>BlocklyCollab</span>
        </div>
        
        <div className={styles.userInfo}>
          <div className={styles.userProfile}>
            <FaUser className={styles.userIcon} />
            <span>{user.email || 'User'}</span>
          </div>
          
          <button 
            className={styles.signOutButton} 
            onClick={signOutUser}
            aria-label="Sign out"
          >
            <FaSignOutAlt /> Sign Out
          </button>
        </div>
      </header>

      <main className={styles.mainContent}>
        {isClient && (
          <BlocklyWorkspace 
            userId={user.uid}
            userEmail={user.email || 'anonymous'}
          />
        )}
      </main>
    </div>
  );
}
