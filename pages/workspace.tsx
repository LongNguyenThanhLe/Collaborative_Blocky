import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import BlocklyWorkspace from '../components/BlocklyWorkspace';
import styles from '../styles/Workspace.module.css';
import { FaPuzzlePiece, FaSignOutAlt, FaUser, FaUsers, FaPlus, FaCog } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';

export default function Workspace() {
  const { user, loading, signOutUser } = useAuth();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [roomId, setRoomId] = useState('default-room');
  const [roomName, setRoomName] = useState('');
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const [connectionStatus, setConnectionStatus] = useState('Not connected');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // This runs only on client-side
    setIsClient(true);

    // Check if room is specified in URL
    const { room } = router.query;
    if (room && typeof room === 'string') {
      setRoomId(room);
      setRoomName(room.replace(/-/g, ' '));
    }

    // Redirect to login if not authenticated
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router, router.query]);

  const handleRoomChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomName.trim()) {
      const newRoomId = roomName.trim().toLowerCase().replace(/\s+/g, '-');
      router.push(`/workspace?room=${newRoomId}`, undefined, { shallow: true });
      setRoomId(newRoomId);
      setShowRoomModal(false);
    }
  };

  const handleConnectionStatusChange = (status: string, connected?: boolean) => {
    setConnectionStatus(status);
    if (connected !== undefined) {
      setIsConnected(connected);
    }
  };

  const handleUserCountChange = (count: number) => {
    setUserCount(count);
  };

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
        <div className={styles.leftHeader}>
          <div className={styles.logo}>
            <FaPuzzlePiece className={styles.logoIcon} />
            <span>BlocklyCollab</span>
          </div>
          
          <div className={styles.roomInfo}>
            <span className={styles.roomLabel}>Room:</span>
            <span className={styles.roomName}>{roomName || roomId.replace(/-/g, ' ')}</span>
            <button 
              className={styles.changeRoomButton} 
              onClick={() => setShowRoomModal(true)}
              aria-label="Change room"
            >
              <FaCog />
            </button>
          </div>
        </div>
        
        <div className={styles.rightHeader}>
          <div className={styles.collaborationStatus}>
            <div className={`${styles.statusIndicator} ${isConnected ? styles.connected : styles.disconnected}`} />
            <span className={styles.statusText}>{connectionStatus}</span>
            <div className={styles.userCountBadge}>
              <FaUsers className={styles.userCountIcon} />
              <span>{userCount}</span>
            </div>
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
        </div>
      </header>

      <main className={styles.mainContent}>
        {isClient && (
          <BlocklyWorkspace 
            roomId={roomId}
            userId={user.uid}
            userEmail={user.email || 'anonymous'}
            onConnectionStatusChange={handleConnectionStatusChange}
            onUserCountChange={handleUserCountChange}
          />
        )}
      </main>

      {/* Room Change Modal */}
      {showRoomModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>Join or Create Room</h2>
            <form onSubmit={handleRoomChange}>
              <div className={styles.formGroup}>
                <label htmlFor="roomName">Room Name</label>
                <input
                  id="roomName"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Enter room name"
                  required
                />
              </div>
              <div className={styles.modalActions}>
                <button 
                  type="button" 
                  className={styles.cancelButton}
                  onClick={() => setShowRoomModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className={styles.submitButton}
                >
                  <FaPlus /> Join Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
