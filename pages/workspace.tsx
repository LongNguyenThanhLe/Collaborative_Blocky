import { useState, useEffect, useRef } from 'react';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { FaHome, FaUsers, FaShare, FaCircle, FaArrowLeft, FaSave } from 'react-icons/fa';
import BlocklyWorkspace from '../components/BlocklyWorkspace';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { initCollaboration, getRoomUsers, addRoomToUserHistory, getCachedRoomData } from '../lib/collab';
import { getProject, updateProjectContent, Project } from '../lib/projects';
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
  const [blocklyInstance, setBlocklyInstance] = useState<any>(null);
  const [projectData, setProjectData] = useState<Project | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const shareInputRef = useRef<HTMLInputElement>(null);
  const statusMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  
  // Extract room ID and project ID from query parameters
  const roomId = typeof router.query.roomId === 'string' ? router.query.roomId : '';
  const projectId = typeof router.query.projectId === 'string' ? router.query.projectId : '';
  
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
      
      // Load project data if projectId is provided
      if (projectId) {
        try {
          const project = await getProject(projectId);
          if (!project) {
            setErrorMessage('Project not found.');
            setLoading(false);
            return;
          }
          
          setProjectData(project);
          
          // If project has a roomId, use that for collaboration
          if (project.roomId) {
            try {
              // Fetch room data
              getRoomUsers(project.roomId)
                .then(users => {
                  setActiveUsers(users);
                })
                .catch(error => console.error('Error getting room users:', error));
              
              // Get room info for display
              fetchRoomData(project.roomId);
            } catch (error) {
              console.error('Error fetching room data for project:', error);
            }
          }
          
          setLoading(false);
        } catch (error) {
          console.error('Error loading project:', error);
          setErrorMessage('Failed to load the project. Please try again later.');
          setLoading(false);
        }
      }
      // Initialize workspace if room ID is available but no project ID
      else if (roomId) {
        try {
          // Fetch room data
          getRoomUsers(roomId)
            .then(users => {
              setActiveUsers(users);
            })
            .catch(error => console.error('Error getting room users:', error));
          
          // Get room info for display
          fetchRoomData(roomId);
          
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
  }, [router, roomId, projectId]);
  
  // Fetch room data
  const fetchRoomData = async (id = roomId) => {
    try {
      if (!id) return;
      
      // Get room data from Firebase (using a function from collab.ts)
      const data = await getCachedRoomData(id);
      setRoomData(data);
      
      // Update active users
      const users = await getRoomUsers(id);
      setActiveUsers(users);
    } catch (error) {
      console.error('Error fetching room data:', error);
    }
  };
  
  // Periodically update active users
  useEffect(() => {
    const activeRoomId = projectData?.roomId || roomId;
    if (!activeRoomId) return;
    
    const interval = setInterval(() => {
      fetchRoomData(activeRoomId);
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, [roomId, projectData]);
  
  // Handle connection status changes
  const handleConnectionStatusChange = (connected: boolean) => {
    setConnectionStatus(connected);
  };
  
  // Handle Blockly instance being initialized
  const handleBlocklyInit = (instance: any) => {
    setBlocklyInstance(instance);
  };
  
  // Save project content
  const saveProject = async () => {
    if (!projectData || !blocklyInstance) return;
    
    try {
      setIsSaving(true);
      
      // Get XML from Blockly
      const xml = blocklyInstance.workspaceToXml();
      
      // Save to Firebase
      await updateProjectContent(projectData.id, xml);
      
      // Update UI
      setLastSaved(new Date());
      showTemporaryMessage('Project saved successfully!');
    } catch (error) {
      console.error('Error saving project:', error);
      showTemporaryMessage('Failed to save project. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Generate user avatar initials and color
  const getUserAvatar = (name: string, email: string) => {
    const initials = name ? name.substring(0, 2).toUpperCase() : 
                   email ? email.substring(0, 2).toUpperCase() : '??';
    return initials;
  };
  
  // Return to dashboard
  const goToDashboard = () => {
    router.push('/projects');
  };
  
  // Format time for last saved indicator
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    
    const now = new Date();
    const diff = now.getTime() - lastSaved.getTime();
    
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    
    return lastSaved.toLocaleDateString();
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
          Return to Projects
        </button>
      </div>
    );
  }
  
  // Show placeholder if no room or project is selected
  if (!roomId && !projectId) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h1>Blockly Workspace</h1>
          </div>
          <div className={styles.headerRight}>
            <button onClick={goToDashboard} className={styles.dashboardButton}>
              Projects
            </button>
          </div>
        </div>
        <div className={styles.main}>
          <div className={styles.placeholderWorkspace}>
            No room or project selected. Please go to the projects page to create or open a project.
          </div>
        </div>
      </div>
    );
  }
  
  // Determine the active title (project name or room name)
  const activeTitle = projectData ? projectData.name : (roomData?.name || 'Untitled Room');
  
  // Determine the active room ID for collaboration
  const activeRoomId = projectData?.roomId || roomId;
  
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button onClick={goToDashboard} className={styles.backButton}>
            <FaArrowLeft />
          </button>
          <h2 className={styles.roomTitle}>
            {activeTitle}
          </h2>
          <div className={connectionStatus ? styles.connectedStatus : styles.disconnectedStatus}>
            <div className={connectionStatus ? styles.statusDot : styles.statusDotDisconnected}></div>
            {connectionStatus ? 'Connected' : 'Disconnected'}
          </div>
          
          {statusMessage && (
            <div className={styles.statusMessage}>
              {statusMessage}
            </div>
          )}
        </div>
        
        <div className={styles.headerRight}>
          {projectData && (
            <button
              className={styles.saveButton}
              onClick={saveProject}
              disabled={isSaving}
            >
              <FaSave /> {isSaving ? 'Saving...' : 'Save'}
            </button>
          )}
          
          {lastSaved && (
            <div className={styles.lastSaved}>
              Last saved: {formatLastSaved()}
            </div>
          )}
          
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
            <FaHome /> Projects
          </button>
        </div>
      </div>
      
      <div className={styles.main}>
        <BlocklyWorkspace
          roomId={activeRoomId}
          userId={user?.uid}
          userName={user?.displayName || user?.email?.split('@')[0] || 'Anonymous'}
          userEmail={user?.email || ''}
          onConnectionStatusChange={handleConnectionStatusChange}
          initialXml={projectData?.blocklyXml}
          onBlocklyInit={handleBlocklyInit}
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
                  value={typeof window !== 'undefined' ? 
                    projectId ? 
                      `${window.location.origin}/workspace?projectId=${projectId}` : 
                      `${window.location.origin}/workspace?roomId=${roomId}` 
                    : ''
                  }
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
              <h3>Share this ID:</h3>
              <div className={styles.inputGroup}>
                <input
                  className={styles.modalInput}
                  type="text"
                  value={projectId || roomId}
                  readOnly
                />
                <button
                  className={styles.modalButton}
                  onClick={() => {
                    navigator.clipboard.writeText(projectId || roomId);
                    showTemporaryMessage('ID copied to clipboard!');
                    setShowShareModal(false);
                  }}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Workspace;
