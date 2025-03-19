import { useState, useEffect, useRef } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { FaHome, FaUsers, FaShare, FaCircle, FaArrowLeft } from 'react-icons/fa';
import BlocklyWorkspace from '../components/BlocklyWorkspace';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { initCollaboration, getRoomUsers, addRoomToUserHistory, getCachedRoomData } from '../lib/collab';
import styles from '../styles/Workspace.module.css';

const Workspace: NextPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const shareInputRef = useRef<HTMLInputElement>(null);
  const statusMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  // Extract room ID from query parameters
  const roomId = typeof router.query.roomId === 'string' ? router.query.roomId : '';
  
  // Function to show a temporary status message
  const showTemporaryMessage = (message: string, duration = 3000) => {
    setStatusMessage(message);
    
    if (statusMessageTimeoutRef.current) {
      clearTimeout(statusMessageTimeoutRef.current);
    }
    
    statusMessageTimeoutRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, duration);
  };
  
  // Handle share link copying
  const copyShareLink = () => {
    if (shareInputRef.current) {
      shareInputRef.current.select();
      document.execCommand('copy');
      showTemporaryMessage('Share link copied to clipboard!');
      setShowShareModal(false);
    }
  };
  
  // Handle authentication and setup
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      if (!authUser) {
        // Redirect to login if not authenticated
        router.push('/login');
        return;
      }
      
      setUser(authUser);
      
      // Initialize workspace if room ID is available
      if (roomId) {
        try {
          // Fetch room data
          getRoomUsers(roomId)
            .then(users => {
              setActiveUsers(users);
            })
            .catch(error => console.error('Error getting room users:', error));
          
          // Get room info for display
          fetchRoomData();
          
          setLoading(false);
        } catch (error) {
          console.error('Error setting up workspace:', error);
          setErrorMessage('Failed to load the workspace. Please try again later.');
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });
    
    return () => unsubscribe();
  }, [router, roomId]);
  
  // Fetch room data
  const fetchRoomData = async () => {
    try {
      if (!roomId) return;
      
      // Get room data from Firebase (using a function from collab.ts)
      const data = await getCachedRoomData(roomId);
      setRoomData(data);
      
      // Update active users
      const users = await getRoomUsers(roomId);
      setActiveUsers(users);
    } catch (error) {
      console.error('Error fetching room data:', error);
    }
  };
  
  // Periodically update active users
  useEffect(() => {
    if (!roomId) return;
    
    const interval = setInterval(() => {
      fetchRoomData();
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, [roomId]);
  
  // Handle connection status changes
  const handleConnectionStatusChange = (connected: boolean) => {
    setConnectionStatus(connected);
  };
  
  // Generate user avatar initials and color
  const getUserAvatar = (name: string, email: string) => {
    const initials = name ? name.substring(0, 2).toUpperCase() : 
                   email ? email.substring(0, 2).toUpperCase() : '??';
    return initials;
  };
  
  // Return to dashboard
  const goToDashboard = () => {
    router.push('/dashboard');
  };
  
  // Show loading state
  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p>Loading workspace...</p>
      </div>
    );
  }
  
  // Show error message if there was a problem
  if (errorMessage) {
    return (
      <div className={styles.loadingContainer}>
        <p className={styles.errorMessage}>{errorMessage}</p>
        <button onClick={goToDashboard} className={styles.dashboardButton}>
          Return to Dashboard
        </button>
      </div>
    );
  }
  
  // Show placeholder if no room is selected
  if (!roomId) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1>Blockly Workspace</h1>
          </div>
          <div className={styles.headerRight}>
            <button onClick={goToDashboard} className={styles.dashboardButton}>
              Dashboard
            </button>
          </div>
        </div>
        <div className={styles.main}>
          <div className={styles.placeholderWorkspace}>
            No room selected. Please go to the dashboard to create or join a room.
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button onClick={goToDashboard} className={styles.backButton}>
            <FaArrowLeft />
          </button>
          <h2 className={styles.roomTitle}>
            {roomData?.name || 'Untitled Room'}
          </h2>
          <div className={connectionStatus ? styles.connectedStatus : styles.disconnectedStatus}>
            <div className={connectionStatus ? styles.statusDot : styles.statusDotDisconnected}></div>
            {connectionStatus ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        
        <div className={styles.headerRight}>
          <div className={styles.userInfo}>
            <div className={styles.usersCount}>
              <FaUsers />
              <span>{activeUsers.length || 1}</span>
            </div>
            <div className={styles.userAvatars}>
              {activeUsers.slice(0, 5).map((activeUser, index) => (
                <div 
                  key={activeUser.id} 
                  className={styles.userAvatar}
                  style={{ zIndex: 10 - index }}
                >
                  {getUserAvatar(activeUser.name, activeUser.email)}
                </div>
              ))}
              {activeUsers.length > 5 && (
                <div className={styles.userAvatar} style={{ zIndex: 5 }}>
                  +{activeUsers.length - 5}
                </div>
              )}
            </div>
          </div>
          
          <button
            className={styles.shareButton}
            onClick={() => setShowShareModal(true)}
          >
            <FaShare /> Share
          </button>
          
          <button
            onClick={goToDashboard}
            className={styles.dashboardButton}
          >
            <FaHome /> Dashboard
          </button>
        </div>
      </div>
      
      <div className={styles.main}>
        <BlocklyWorkspace
          roomId={roomId}
          userId={user?.uid}
          userName={user?.displayName || user?.email?.split('@')[0] || 'Anonymous'}
          userEmail={user?.email || ''}
          onConnectionStatusChange={handleConnectionStatusChange}
        />
      </div>
      
      {/* Share Modal */}
      {showShareModal && (
        <div className={styles.modalOverlay} onClick={() => setShowShareModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2>Share this workspace</h2>
            <div className={styles.modalSection}>
              <h3>Copy the link below:</h3>
              <div className={styles.inputGroup}>
                <input
                  ref={shareInputRef}
                  className={styles.modalInput}
                  type="text"
                  value={typeof window !== 'undefined' ? `${window.location.origin}/workspace?roomId=${roomId}` : ''}
                  readOnly
                />
                <button
                  className={styles.modalButton}
                  onClick={copyShareLink}
                >
                  Copy
                </button>
              </div>
            </div>
            <div className={styles.divider}>OR</div>
            <div className={styles.modalSection}>
              <h3>Share this Room ID:</h3>
              <div className={styles.inputGroup}>
                <input
                  className={styles.modalInput}
                  type="text"
                  value={roomId}
                  readOnly
                />
                <button
                  className={styles.modalButton}
                  onClick={() => {
                    navigator.clipboard.writeText(roomId);
                    showTemporaryMessage('Room ID copied to clipboard!');
                    setShowShareModal(false);
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.cancelButton}
                onClick={() => setShowShareModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Status message */}
      {statusMessage && (
        <div className={styles.statusMessage}>
          {statusMessage}
        </div>
      )}
    </div>
  );
};

export default Workspace;
