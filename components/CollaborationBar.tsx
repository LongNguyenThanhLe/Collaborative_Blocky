import React, { useState, useEffect } from 'react';
import styles from '../styles/CollaborationBar.module.css';
import { useRouter } from 'next/router';

interface CollaboratorProps {
  id: string;
  name: string;
  initials: string;
  color: string;
  isOnline: boolean;
  currentScene: string;
  isCurrentUser?: boolean;
}

interface CollaborationBarProps {
  initialCollaborators?: CollaboratorProps[];
  connectionStatus?: string;
  userCount?: number;
  onRoomChange?: (roomId: string) => void;
  currentRoomId?: string;
  isConnecting?: boolean;
}

const CollaborationBar: React.FC<CollaborationBarProps> = ({ 
  initialCollaborators, 
  connectionStatus = 'Connected',
  userCount = 1,
  onRoomChange,
  currentRoomId = 'default-room',
  isConnecting = false
}) => {
  const router = useRouter();
  // Initialize with some example collaborators if none provided
  const [collaborators, setCollaborators] = useState<CollaboratorProps[]>(initialCollaborators || [
    { id: 'user-1', name: 'You', initials: 'YO', color: '#4D97FF', isOnline: true, currentScene: 'Scene 1', isCurrentUser: true },
  ]);
  const [roomId, setRoomId] = useState<string>(currentRoomId);
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Handle room parameter from URL
  useEffect(() => {
    if (router.query.room) {
      const roomFromUrl = Array.isArray(router.query.room) 
        ? router.query.room[0] 
        : router.query.room;
      
      setRoomId(roomFromUrl);
      if (onRoomChange) {
        setIsLoading(true);
        onRoomChange(roomFromUrl);
      }
    }
  }, [router.query.room, onRoomChange]);

  // Update local roomId state when currentRoomId prop changes
  useEffect(() => {
    if (currentRoomId && currentRoomId !== roomId) {
      setRoomId(currentRoomId);
    }
    // Set loading state based on isConnecting prop
    setIsLoading(isConnecting);
  }, [currentRoomId, isConnecting]);

  // Get only online collaborators
  const onlineCollaborators = collaborators.filter(c => c.isOnline);
  
  // Get offline collaborators
  const offlineCollaborators = collaborators.filter(c => !c.isOnline);

  // Handle joining a room
  const handleJoinRoom = () => {
    if (roomId && roomId.trim() !== '') {
      // Update URL with room parameter
      router.push({
        pathname: router.pathname,
        query: { ...router.query, room: roomId }
      }, undefined, { shallow: true });
      
      // Notify parent component
      if (onRoomChange) {
        setIsLoading(true);
        onRoomChange(roomId);
      }
      
      setIsJoining(false);
    }
  };

  // Handle room input change
  const handleRoomIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRoomId(e.target.value);
  };

  // Generate shareable room link
  const getRoomLink = () => {
    if (typeof window !== 'undefined') {
      const baseUrl = window.location.origin;
      return `${baseUrl}?room=${encodeURIComponent(currentRoomId)}`;
    }
    return '';
  };

  // Copy room link to clipboard
  const copyRoomLink = () => {
    const link = getRoomLink();
    navigator.clipboard.writeText(link)
      .then(() => {
        alert('Room link copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  // Get connection status icon based on status
  const getConnectionStatusIcon = () => {
    if (connectionStatus.includes('Connected')) {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 13.01 17.75 13.97 17.3 14.8L18.76 16.26C19.54 15.03 20 13.57 20 12C20 7.58 16.42 4 12 4ZM12 18C8.69 18 6 15.31 6 12C6 10.99 6.25 10.03 6.7 9.2L5.24 7.74C4.46 8.97 4 10.43 4 12C4 16.42 7.58 20 12 20V23L16 19L12 15V18Z" fill="#4CAF50"/>
        </svg>
      );
    } else if (connectionStatus.includes('Connecting') || isConnecting) {
      return (
        <div className={styles.spinnerIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 13.01 17.75 13.97 17.3 14.8L18.76 16.26C19.54 15.03 20 13.57 20 12C20 7.58 16.42 4 12 4Z" fill="#F39C12"/>
          </svg>
        </div>
      );
    } else {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 13.01 17.75 13.97 17.3 14.8L18.76 16.26C19.54 15.03 20 13.57 20 12C20 7.58 16.42 4 12 4Z" fill="#E74C3C"/>
        </svg>
      );
    }
  };

  return (
    <div className={styles.collaborationBar}>
      <div className={styles.collaboratorsSection}>
        <div className={styles.onlineCollaborators}>
          {onlineCollaborators.map((collaborator) => (
            <div 
              key={collaborator.id} 
              className={`${styles.collaboratorAvatar} ${collaborator.isCurrentUser ? styles.currentUser : ''}`}
              style={{ backgroundColor: collaborator.color }}
              title={`${collaborator.name} (${collaborator.currentScene})`}
            >
              <span>{collaborator.initials}</span>
              <div className={styles.onlineIndicator}></div>
              
              {/* Scene indicator - small tag showing what scene they're on */}
              <div className={styles.sceneIndicator}>
                {collaborator.currentScene}
              </div>
            </div>
          ))}
          
          {offlineCollaborators.length > 0 && (
            <div className={styles.offlineGroup}>
              <div className={styles.offlineAvatar}>
                <span>+{offlineCollaborators.length}</span>
                <div className={styles.offlineIndicator}></div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className={styles.syncStatus}>
        <div className={styles.syncIndicator}>
          {getConnectionStatusIcon()}
          <span className={styles.syncText}>
            {connectionStatus}
            {isLoading && !connectionStatus.endsWith('...') && <span className={styles.loadingDots}>...</span>}
          </span>
        </div>
        
        <div className={styles.collaboratorsCounter}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 11C17.66 11 18.99 9.66 18.99 8C18.99 6.34 17.66 5 16 5C14.34 5 13 6.34 13 8C13 9.66 14.34 11 16 11ZM8 11C9.66 11 10.99 9.66 10.99 8C10.99 6.34 9.66 5 8 5C6.34 5 5 6.34 5 8C5 9.66 6.34 11 8 11ZM8 13C5.67 13 1 14.17 1 16.5V19H15V16.5C15 14.17 10.33 13 8 13ZM16 13C15.71 13 15.38 13.02 15.03 13.05C16.19 13.89 17 15.02 17 16.5V19H23V16.5C23 14.17 18.33 13 16 13Z" fill="currentColor"/>
          </svg>
          <span className={styles.collaboratorsCount}>{userCount} online</span>
        </div>
        
        {isJoining ? (
          <div className={styles.joinRoomContainer}>
            <input
              type="text"
              value={roomId}
              onChange={handleRoomIdChange}
              placeholder="Enter room ID"
              className={styles.roomInput}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
            />
            <button 
              className={styles.joinButton} 
              onClick={handleJoinRoom}
              disabled={isConnecting}
            >
              Join
            </button>
            <button 
              className={styles.cancelButton}
              onClick={() => setIsJoining(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className={styles.currentRoomDisplay}>
              <span className={styles.roomLabel}>Room: </span>
              <span className={styles.roomCode}>{currentRoomId}</span>
              <button 
                onClick={copyRoomLink} 
                className={styles.copyButton}
                title="Copy room link"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z" fill="currentColor"/>
                </svg>
              </button>
            </div>
            <button 
              className={styles.inviteButton} 
              onClick={() => setIsJoining(true)}
              title="Join or create a room"
              disabled={isConnecting}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
              </svg>
              <span>Join Room</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default CollaborationBar;
