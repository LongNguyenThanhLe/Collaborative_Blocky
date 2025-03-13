import React, { useState } from 'react';
import styles from '@styles/PropertiesPanel.module.css';

interface SpriteProps {
  id: string;
  name: string;
  image: string;
  position: { x: number, y: number };
  rotation: number;
  visible: boolean;
}

interface BackdropProps {
  id: string;
  name: string;
  image: string;
}

const PropertiesPanel: React.FC = () => {
  const [selectedSprite, setSelectedSprite] = useState<string | null>(null);
  const [activeBackdrop, setActiveBackdrop] = useState<string>('backdrop-1');
  const [sprites, setSprites] = useState<SpriteProps[]>([
    { id: 'blue-ship', name: 'Blue Ship', image: '/images/blue-ship.svg', position: { x: 150, y: 100 }, rotation: 90, visible: true },
    { id: 'pink-ship', name: 'Pink Ship', image: '/images/pink-ship.svg', position: { x: 200, y: 150 }, rotation: 90, visible: true },
    { id: 'purple-ship', name: 'Purple Ship', image: '/images/purple-ship.svg', position: { x: 250, y: 200 }, rotation: 90, visible: true }
  ]);
  
  // Backdrop library entries
  const backdropLibrary: BackdropProps[] = [
    { id: 'backdrop-1', name: 'Space', image: '/images/backdrop-1.svg' },
    { id: 'backdrop-2', name: 'Galaxy', image: '/images/backdrop-2.svg' }
  ];

  // Handle sprite selection
  const handleSpriteSelect = (spriteId: string) => {
    setSelectedSprite(spriteId);
  };

  // Handle sprite property change
  const handleSpritePropertyChange = (property: keyof SpriteProps, value: any) => {
    if (!selectedSprite) return;
    
    setSprites(prevSprites => 
      prevSprites.map(sprite => 
        sprite.id === selectedSprite
          ? { ...sprite, [property]: value }
          : sprite
      )
    );
  };

  // Handle sprite position change
  const handlePositionChange = (axis: 'x' | 'y', value: string) => {
    if (!selectedSprite) return;
    
    const numValue = parseInt(value);
    if (isNaN(numValue)) return;
    
    setSprites(prevSprites => 
      prevSprites.map(sprite => 
        sprite.id === selectedSprite
          ? { 
              ...sprite, 
              position: { 
                ...sprite.position, 
                [axis]: numValue 
              } 
            }
          : sprite
      )
    );
  };

  // Handle sprite rotation change
  const handleRotationChange = (value: number) => {
    if (!selectedSprite) return;
    
    setSprites(prevSprites => 
      prevSprites.map(sprite => 
        sprite.id === selectedSprite
          ? { ...sprite, rotation: value }
          : sprite
      )
    );
  };

  // Handle sprite visibility toggle
  const handleVisibilityToggle = () => {
    if (!selectedSprite) return;
    
    setSprites(prevSprites => 
      prevSprites.map(sprite => 
        sprite.id === selectedSprite
          ? { ...sprite, visible: !sprite.visible }
          : sprite
      )
    );
  };

  // Handle backdrop selection
  const handleBackdropSelect = (backdropId: string) => {
    setActiveBackdrop(backdropId);
  };

  // Add a new sprite
  const handleAddSprite = () => {
    const newSprite: SpriteProps = {
      id: `sprite-${Date.now()}`,
      name: `Sprite ${sprites.length + 1}`,
      image: '/images/blue-ship.svg',
      position: { x: 100, y: 100 },
      rotation: 90,
      visible: true
    };
    
    setSprites(prevSprites => [...prevSprites, newSprite]);
    setSelectedSprite(newSprite.id);
  };

  // Remove a sprite
  const handleRemoveSprite = () => {
    if (!selectedSprite) return;
    
    setSprites(prevSprites => prevSprites.filter(sprite => sprite.id !== selectedSprite));
    setSelectedSprite(null);
  };

  // Get the selected sprite
  const getSelectedSprite = () => {
    return sprites.find(sprite => sprite.id === selectedSprite) || null;
  };

  return (
    <div className={styles.propertiesPanel}>
      {/* Preview Area */}
      <div className={styles.previewArea}>
        <div className={styles.canvasContainer}>
          {/* Background */}
          <div className={styles.previewBackground}>
            <img 
              src={backdropLibrary.find(backdrop => backdrop.id === activeBackdrop)?.image || backdropLibrary[0].image} 
              alt="Background" 
              className={styles.backdropImage}
            />
          </div>
          
          {/* Sprites */}
          {sprites.map(sprite => (
            sprite.visible && (
              <div 
                key={sprite.id}
                className={`${styles.previewSprite} ${selectedSprite === sprite.id ? styles.selectedSprite : ''}`}
                style={{
                  left: `${sprite.position.x}px`,
                  top: `${sprite.position.y}px`,
                  transform: `rotate(${sprite.rotation}deg)`,
                }}
                onClick={() => handleSpriteSelect(sprite.id)}
              >
                <img src={sprite.image} alt={sprite.name} />
              </div>
            )
          ))}
        </div>
      </div>
      
      {/* Sprite Library */}
      <div className={styles.spriteLibrary}>
        <div className={styles.sectionHeader}>
          <h3>Sprite Library</h3>
          <button className={styles.addButton} onClick={handleAddSprite}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
            </svg>
            <span>Add Sprite</span>
          </button>
        </div>
        
        {/* Sprite Properties - only show when a sprite is selected */}
        {selectedSprite && (
          <div className={styles.spriteProperties}>
            <div className={styles.propertyRow}>
              <label>Sprite Name</label>
              <div className={styles.inputWithIcons}>
                <input 
                  type="text" 
                  value={getSelectedSprite()?.name || ''}
                  onChange={(e) => handleSpritePropertyChange('name', e.target.value)}
                  className={styles.nameInput} 
                />
                <div className={styles.iconButtons}>
                  <button 
                    className={styles.iconButton} 
                    onClick={handleVisibilityToggle}
                    title={getSelectedSprite()?.visible ? "Hide Sprite" : "Show Sprite"}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z" fill={getSelectedSprite()?.visible ? "currentColor" : "#ccc"}/>
                    </svg>
                  </button>
                  <button 
                    className={styles.iconButton}
                    onClick={handleRemoveSprite}
                    title="Delete Sprite"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            {/* Position Inputs */}
            <div className={styles.positionInputs}>
              <div className={styles.positionInput}>
                <label>x</label>
                <input 
                  type="text" 
                  value={getSelectedSprite()?.position.x || 0} 
                  onChange={(e) => handlePositionChange('x', e.target.value)}
                  className={styles.coordInput} 
                />
              </div>
              <div className={styles.positionInput}>
                <label>y</label>
                <input 
                  type="text" 
                  value={getSelectedSprite()?.position.y || 0} 
                  onChange={(e) => handlePositionChange('y', e.target.value)}
                  className={styles.coordInput} 
                />
              </div>
            </div>
            
            {/* Rotation Inputs */}
            <div className={styles.rotationInputs}>
              <div className={styles.rotationInput}>
                <button 
                  className={styles.directionButton}
                  onClick={() => handleRotationChange(90)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L4.5 20.29L5.21 21L19.5 12L5.21 3L4.5 3.71L12 22L12 2Z" fill="currentColor"/>
                  </svg>
                  <span>90°</span>
                </button>
              </div>
              <div className={styles.rotationInput}>
                <button 
                  className={styles.directionButton}
                  onClick={() => handleRotationChange(-90)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2L19.5 20.29L18.79 21L4.5 12L18.79 3L19.5 3.71L12 22L12 2Z" fill="currentColor"/>
                  </svg>
                  <span>-90°</span>
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Sprite Gallery */}
        <div className={styles.spriteGallery}>
          {sprites.map(sprite => (
            <div 
              key={sprite.id} 
              className={`${styles.spriteCard} ${selectedSprite === sprite.id ? styles.selectedCard : ''}`}
              onClick={() => handleSpriteSelect(sprite.id)}
            >
              <img src={sprite.image} alt={sprite.name} className={styles.spriteImage} />
              <span className={styles.spriteName}>{sprite.name}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Backdrop Library */}
      <div className={styles.backdropLibrary}>
        <div className={styles.sectionHeader}>
          <h3>Backdrop</h3>
          <button className={styles.addButton}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
            </svg>
            <span>Add Backdrop</span>
          </button>
        </div>
        
        {/* Backdrop Gallery */}
        <div className={styles.backdropGallery}>
          {backdropLibrary.map(backdrop => (
            <div 
              key={backdrop.id} 
              className={`${styles.backdropCard} ${activeBackdrop === backdrop.id ? styles.selectedCard : ''}`}
              onClick={() => handleBackdropSelect(backdrop.id)}
            >
              <img src={backdrop.image} alt={backdrop.name} className={styles.backdropImage} />
              <span className={styles.backdropName}>{backdrop.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PropertiesPanel;
