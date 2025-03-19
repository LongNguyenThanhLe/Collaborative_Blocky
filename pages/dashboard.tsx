import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { FaPlus, FaPuzzlePiece, FaUsers, FaExternalLinkAlt, FaUserCircle } from 'react-icons/fa';
import { MdDashboard } from 'react-icons/md';
import styles from '../styles/Dashboard.module.css';
import { getUserRooms, createNewRoom } from '../lib/collab';

// Project card type
interface ProjectCard {
  id: string;
  name: string;
  lastAccessed: Date;
  userCount: number;
  users?: { email: string; name: string }[];
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showNewRoomModal, setShowNewRoomModal] = useState(false);
  const [showJoinRoomModal, setShowJoinRoomModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Check authentication and load user data
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          // Load user's rooms from Firebase
          const userRooms = await getUserRooms(currentUser.uid);
          // Format rooms as project cards
          const formattedProjects = userRooms.map((room: any) => ({
            id: room.roomId,
            name: room.roomName || room.roomId,
            lastAccessed: room.lastAccessed ? new Date(room.lastAccessed.seconds * 1000) : new Date(),
            userCount: room.userCount || 0,
            users: room.users || []
          }));
          
          setProjects(formattedProjects);
        } catch (error) {
          console.error("Error loading projects:", error);
          setErrorMessage("Failed to load your projects");
        }
      } else {
        // Redirect to login if not authenticated
        router.push('/login');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [router]);

  // Create a new room
  const handleCreateRoom = async () => {
    if (!newRoomName || !user) return;
    
    try {
      setErrorMessage('');
      const roomId = await createNewRoom(newRoomName, user.uid);
      setShowNewRoomModal(false);
      router.push(`/workspace?room=${roomId}`);
    } catch (error) {
      console.error("Error creating room:", error);
      setErrorMessage("Failed to create new room");
    }
  };

  // Join an existing room
  const handleJoinRoom = () => {
    if (!joinRoomId) return;
    
    router.push(`/workspace?room=${joinRoomId}`);
    setShowJoinRoomModal(false);
  };

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loader}></div>
        <p>Loading your projects...</p>
      </div>
    );
  }

  return (
    <div className={styles.dashboardContainer}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.logo}>
          <FaPuzzlePiece />
          <h2>Blockly</h2>
        </div>
        
        <div className={styles.navItems}>
          <Link href="/dashboard">
            <div className={`${styles.navItem} ${styles.active}`}>
              <MdDashboard />
              <span>Dashboard</span>
            </div>
          </Link>
        </div>
        
        <div className={styles.userProfile}>
          {user?.photoURL ? (
            <Image 
              src={user.photoURL} 
              alt="Profile" 
              width={40} 
              height={40} 
              className={styles.userAvatar} 
            />
          ) : (
            <FaUserCircle size={40} />
          )}
          <div>
            <h3>{user?.displayName || user?.email?.split('@')[0] || 'User'}</h3>
            <p>{user?.email}</p>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className={styles.content}>
        <header className={styles.header}>
          <h1>Your Projects</h1>
          <div className={styles.actions}>
            <button 
              className={styles.newButton} 
              onClick={() => setShowJoinRoomModal(true)}
            >
              Join Room
            </button>
            <button 
              className={styles.newButton} 
              onClick={() => setShowNewRoomModal(true)}
            >
              <FaPlus /> New Project
            </button>
          </div>
        </header>
        
        {errorMessage && (
          <div className={styles.errorMessage}>
            {errorMessage}
          </div>
        )}
        
        <div className={styles.projectGrid}>
          {projects.length > 0 ? (
            projects.map(project => (
              <div key={project.id} className={styles.projectCard}>
                <Link href={`/workspace?room=${project.id}`}>
                  <div className={styles.projectContent}>
                    <h3>{project.name}</h3>
                    <div className={styles.projectMeta}>
                      <span>Last accessed: {formatDate(project.lastAccessed)}</span>
                      <div className={styles.userCount}>
                        <FaUsers /> {project.userCount}
                      </div>
                    </div>
                    <div className={styles.projectFooter}>
                      <div className={styles.userAvatars}>
                        {project.users && project.users.slice(0, 3).map((user, index) => (
                          <div key={index} className={styles.userAvatar} title={user.email}>
                            {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                        ))}
                        {project.users && project.users.length > 3 && (
                          <div className={styles.userAvatar}>+{project.users.length - 3}</div>
                        )}
                      </div>
                      <div className={styles.openLink}>
                        <FaExternalLinkAlt />
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            ))
          ) : (
            <div className={styles.emptyState}>
              <p>You don't have any projects yet.</p>
              <button 
                className={styles.emptyStateButton}
                onClick={() => setShowNewRoomModal(true)}
              >
                <FaPlus /> Create your first project
              </button>
            </div>
          )}
        </div>
      </div>
      
      {/* Create new room modal */}
      {showNewRoomModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>Create New Project</h2>
            <input
              type="text"
              placeholder="Project Name"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className={styles.modalInput}
            />
            <div className={styles.modalButtons}>
              <button 
                className={styles.cancelButton}
                onClick={() => setShowNewRoomModal(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.createButton}
                onClick={handleCreateRoom}
                disabled={!newRoomName}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Join room modal */}
      {showJoinRoomModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2>Join Existing Project</h2>
            <input
              type="text"
              placeholder="Room ID"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              className={styles.modalInput}
            />
            <div className={styles.modalButtons}>
              <button 
                className={styles.cancelButton}
                onClick={() => setShowJoinRoomModal(false)}
              >
                Cancel
              </button>
              <button 
                className={styles.createButton}
                onClick={handleJoinRoom}
                disabled={!joinRoomId}
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
