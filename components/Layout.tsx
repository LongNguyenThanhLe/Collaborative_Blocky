import React, { useState, useEffect } from 'react';
import styles from '../styles/Layout.module.css';
import NavigationBar from '../components/NavigationBar';
import PropertiesPanel from '../components/PropertiesPanel';
import CollaborationBar from '../components/CollaborationBar';
import BlocklyWorkspace from '../components/BlocklyWorkspace';
import { useRouter } from 'next/router';

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const router = useRouter();
  const [roomId, setRoomId] = useState<string>('default-room');
  const [connectionStatus, setConnectionStatus] = useState<string>('Initializing...');
  const [userCount, setUserCount] = useState<number>(1);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [connectionRetries, setConnectionRetries] = useState<number>(0);

  // Get room ID from URL query parameters
  useEffect(() => {
    if (router.query.room) {
      const roomFromUrl = Array.isArray(router.query.room) ? router.query.room[0] : router.query.room;
      setRoomId(roomFromUrl);
      setIsConnecting(true);
      setConnectionStatus('Connecting to collaboration server...');
    }
  }, [router.query.room]);

  // Handle room change from CollaborationBar
  const handleRoomChange = (newRoomId: string) => {
    setRoomId(newRoomId);
    setConnectionStatus('Switching rooms...');
    setIsConnecting(true);
    setConnectionRetries(0);
    
    // Update URL with new room ID without full page reload
    router.push(`/?room=${newRoomId}`, undefined, { shallow: true });
  };

  // Update connection status
  const handleConnectionStatus = (connected: boolean) => {
    // Update connection status based on connected state
    setConnectionStatus(connected ? 'Connected to collaboration server' : 'Disconnected from server');
    
    if (!connected) {
      // If connection failed, increment retry counter
      setConnectionRetries(prev => prev + 1);
      if (connectionRetries < 3) {
        // Try again after a delay
        setTimeout(() => {
          setConnectionStatus(`Retrying connection (attempt ${connectionRetries + 1})...`);
        }, 2000);
      } else {
        setIsConnecting(false);
      }
    } else {
      // Reset retry counter on successful connection
      setConnectionRetries(0);
      setIsConnecting(false);
    }
  };

  // Update user count
  const handleUserCountChange = (count: number) => {
    setUserCount(count);
  };

  // Generate display status with loading indicators
  const getDisplayStatus = () => {
    if (isConnecting) {
      // Add animated dots to show activity
      const dots = '.'.repeat((Date.now() / 500) % 4);
      return connectionStatus.endsWith('...') 
        ? connectionStatus.slice(0, -3) + dots
        : `${connectionStatus}${dots}`;
    }
    
    if (connectionStatus.includes('Failed') || connectionStatus.includes('Error')) {
      return `Connection issue: ${connectionStatus}. Working in local mode.`;
    }
    
    return connectionStatus;
  };

  return (
    <div className={styles.container}>
      <NavigationBar />
      
      <div className={styles.mainContent}>
        {/* Middle Panel - Blockly Workspace with built-in toolbox */}
        <div className={styles.middlePanel}>
          <BlocklyWorkspace 
            roomId={roomId} 
            onConnectionStatusChange={handleConnectionStatus}
            onUserCountChange={handleUserCountChange}
          />
        </div>
        
        {/* Right Panel - Preview & Properties */}
        <div className={styles.rightPanel}>
          <PropertiesPanel />
        </div>
      </div>
      
      <CollaborationBar 
        connectionStatus={getDisplayStatus()}
        userCount={userCount}
        onRoomChange={handleRoomChange}
        currentRoomId={roomId}
        isConnecting={isConnecting}
      />
      {children}
    </div>
  );
};

export default Layout;
