import React, { useState } from 'react';
import styles from '@styles/CollaborationBar.module.css';

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
}

const CollaborationBar: React.FC<CollaborationBarProps> = ({ initialCollaborators }) => {
  // Initialize with some example collaborators if none provided
  const [collaborators, setCollaborators] = useState<CollaboratorProps[]>(initialCollaborators || [
    { id: 'user-1', name: 'You', initials: 'YO', color: '#4D97FF', isOnline: true, currentScene: 'Scene 1', isCurrentUser: true },
    { id: 'user-2', name: 'Alex Smith', initials: 'AS', color: '#E64980', isOnline: true, currentScene: 'Scene 1' },
    { id: 'user-3', name: 'Jamie Lee', initials: 'JL', color: '#27AE60', isOnline: true, currentScene: 'Scene 2' },
    { id: 'user-4', name: 'Robin Davis', initials: 'RD', color: '#F39C12', isOnline: false, currentScene: 'Scene 1' },
  ]);

  // Get only online collaborators
  const onlineCollaborators = collaborators.filter(c => c.isOnline);
  
  // Get offline collaborators
  const offlineCollaborators = collaborators.filter(c => !c.isOnline);

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
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 13.01 17.75 13.97 17.3 14.8L18.76 16.26C19.54 15.03 20 13.57 20 12C20 7.58 16.42 4 12 4ZM12 18C8.69 18 6 15.31 6 12C6 10.99 6.25 10.03 6.7 9.2L5.24 7.74C4.46 8.97 4 10.43 4 12C4 16.42 7.58 20 12 20V23L16 19L12 15V18Z" fill="#4CAF50"/>
          </svg>
          <span className={styles.syncText}>All changes saved</span>
        </div>
        
        <div className={styles.collaboratorsCounter}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 11C17.66 11 18.99 9.66 18.99 8C18.99 6.34 17.66 5 16 5C14.34 5 13 6.34 13 8C13 9.66 14.34 11 16 11ZM8 11C9.66 11 10.99 9.66 10.99 8C10.99 6.34 9.66 5 8 5C6.34 5 5 6.34 5 8C5 9.66 6.34 11 8 11ZM8 13C5.67 13 1 14.17 1 16.5V19H15V16.5C15 14.17 10.33 13 8 13ZM16 13C15.71 13 15.38 13.02 15.03 13.05C16.19 13.89 17 15.02 17 16.5V19H23V16.5C23 14.17 18.33 13 16 13Z" fill="currentColor"/>
          </svg>
          <span className={styles.collaboratorsCount}>{onlineCollaborators.length} online</span>
        </div>
        
        <button className={styles.inviteButton}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
          </svg>
          <span>Invite</span>
        </button>
      </div>
    </div>
  );
};

export default CollaborationBar;
