import React, { useState } from 'react';
import styles from '@styles/NavigationBar.module.css';

interface Scene {
  id: string;
  name: string;
  isActive: boolean;
}

interface NavigationBarProps {
  initialScenes?: Scene[];
}

const NavigationBar: React.FC<NavigationBarProps> = ({ initialScenes }) => {
  const [scenes, setScenes] = useState<Scene[]>(initialScenes || [
    { id: 'scene-1', name: 'Scene 1', isActive: true },
    { id: 'scene-2', name: 'Scene 2', isActive: false },
  ]);
  const [projectName, setProjectName] = useState<string>('Untitled Project');
  const [isEditingProjectName, setIsEditingProjectName] = useState<boolean>(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState<boolean>(false);
  const [tempProjectName, setTempProjectName] = useState<string>(projectName);

  // Select a scene
  const handleSceneSelect = (sceneId: string) => {
    setScenes(prevScenes => 
      prevScenes.map(scene => ({
        ...scene,
        isActive: scene.id === sceneId
      }))
    );
  };

  // Add a new scene
  const handleAddScene = () => {
    const newSceneId = `scene-${scenes.length + 1}`;
    const newScene: Scene = {
      id: newSceneId,
      name: `Scene ${scenes.length + 1}`,
      isActive: false
    };
    
    setScenes(prevScenes => {
      // First, make all scenes inactive
      const updatedScenes = prevScenes.map(scene => ({
        ...scene,
        isActive: false
      }));
      
      // Then add the new scene and make it active
      return [...updatedScenes, { ...newScene, isActive: true }];
    });
  };

  // Remove a scene
  const handleRemoveScene = (sceneId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering scene selection
    
    if (scenes.length <= 1) {
      // Don't allow removing the last scene
      return;
    }
    
    setScenes(prevScenes => {
      const filteredScenes = prevScenes.filter(scene => scene.id !== sceneId);
      
      // If we just removed the active scene, make the first scene active
      if (prevScenes.find(scene => scene.id === sceneId)?.isActive) {
        filteredScenes[0].isActive = true;
      }
      
      return filteredScenes;
    });
  };

  // Start renaming a scene
  const handleRenameScene = (sceneId: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent triggering scene selection
    
    setScenes(prevScenes => 
      prevScenes.map(scene => ({
        ...scene,
        isEditing: scene.id === sceneId
      }))
    );
  };

  // Edit a scene name
  const handleSceneNameChange = (sceneId: string, newName: string) => {
    setScenes(prevScenes => 
      prevScenes.map(scene => 
        scene.id === sceneId
          ? { ...scene, name: newName }
          : scene
      )
    );
  };

  // Handle scene drag start
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, sceneId: string) => {
    e.dataTransfer.setData('text/plain', sceneId);
  };

  // Handle scene drag over
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Handle scene drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetSceneId: string) => {
    e.preventDefault();
    const draggedSceneId = e.dataTransfer.getData('text/plain');
    
    if (draggedSceneId === targetSceneId) {
      return;
    }
    
    setScenes(prevScenes => {
      const draggedScene = prevScenes.find(scene => scene.id === draggedSceneId);
      const targetScene = prevScenes.find(scene => scene.id === targetSceneId);
      
      if (!draggedScene || !targetScene) {
        return prevScenes;
      }
      
      // Get the indexes of both scenes
      const draggedIndex = prevScenes.findIndex(scene => scene.id === draggedSceneId);
      const targetIndex = prevScenes.findIndex(scene => scene.id === targetSceneId);
      
      // Create a new array with the dragged scene moved to the target position
      const newScenes = [...prevScenes];
      newScenes.splice(draggedIndex, 1);
      newScenes.splice(targetIndex, 0, draggedScene);
      
      return newScenes;
    });
  };

  // Handle project name edit
  const handleProjectNameClick = () => {
    setIsEditingProjectName(true);
    setTempProjectName(projectName);
  };

  // Save project name
  const handleProjectNameSave = () => {
    setProjectName(tempProjectName || 'Untitled Project');
    setIsEditingProjectName(false);
  };

  // Handle project name key press
  const handleProjectNameKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleProjectNameSave();
    } else if (e.key === 'Escape') {
      setIsEditingProjectName(false);
      setTempProjectName(projectName);
    }
  };

  // Toggle account menu
  const handleAccountMenuToggle = () => {
    setIsAccountMenuOpen(!isAccountMenuOpen);
  };

  return (
    <div className={styles.navigationBar}>
      <div className={styles.leftSection}>
        <div className={styles.logo}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="8" height="8" rx="1" fill="#4D97FF" />
            <rect x="13" y="3" width="8" height="8" rx="1" fill="#9966FF" />
            <rect x="3" y="13" width="8" height="8" rx="1" fill="#E64980" />
            <rect x="13" y="13" width="8" height="8" rx="1" fill="#27AE60" />
          </svg>
          <span className={styles.logoText}>Collab Blocks</span>
        </div>

        {/* Project Name */}
        <div className={styles.projectNameContainer}>
          {isEditingProjectName ? (
            <input
              type="text"
              className={styles.projectNameInput}
              value={tempProjectName}
              onChange={(e) => setTempProjectName(e.target.value)}
              onBlur={handleProjectNameSave}
              onKeyDown={handleProjectNameKeyPress}
              autoFocus
            />
          ) : (
            <div className={styles.projectName} onClick={handleProjectNameClick}>
              {projectName}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" fill="currentColor" />
              </svg>
            </div>
          )}
        </div>
      </div>

      <div className={styles.sceneTabs}>
        {scenes.map((scene) => (
          <div
            key={scene.id}
            className={`${styles.sceneTab} ${scene.isActive ? styles.activeTab : ''}`}
            onClick={() => handleSceneSelect(scene.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, scene.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, scene.id)}
          >
            <span>{scene.name}</span>
            <button
              className={styles.closeTab}
              onClick={(e) => handleRemoveScene(scene.id, e)}
              title="Remove Scene"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor" />
              </svg>
            </button>
          </div>
        ))}
        <button className={styles.addSceneButton} onClick={handleAddScene} title="Add Scene">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className={styles.rightSection}>
        <button className={styles.helpButton} title="Help">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM13 19H11V17H13V19ZM15.07 11.25L14.17 12.17C13.45 12.9 13 13.5 13 15H11V14.5C11 13.4 11.45 12.4 12.17 11.67L13.41 10.41C13.78 10.05 14 9.55 14 9C14 7.9 13.1 7 12 7C10.9 7 10 7.9 10 9H8C8 6.79 9.79 5 12 5C14.21 5 16 6.79 16 9C16 9.88 15.64 10.68 15.07 11.25Z" fill="currentColor" />
          </svg>
        </button>
        <div className={styles.accountSection}>
          <div className={styles.accountButton} onClick={handleAccountMenuToggle}>
            <div className={styles.userAvatar}>
              <span>US</span>
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${styles.dropdownArrow} ${isAccountMenuOpen ? styles.rotated : ''}`}>
              <path d="M7 10L12 15L17 10H7Z" fill="currentColor" />
            </svg>
          </div>
          {isAccountMenuOpen && (
            <div className={styles.accountMenu}>
              <div className={styles.menuItem}>Profile</div>
              <div className={styles.menuItem}>Settings</div>
              <div className={styles.menuDivider}></div>
              <div className={styles.menuItem}>Log Out</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;
