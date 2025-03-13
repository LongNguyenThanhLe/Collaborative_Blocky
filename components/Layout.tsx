import React, { useState } from 'react';
import styles from '../styles/Layout.module.css';
import NavigationBar from '../components/NavigationBar';
import PropertiesPanel from '../components/PropertiesPanel';
import CollaborationBar from '../components/CollaborationBar';
import BlocklyWorkspace from '../components/BlocklyWorkspace';

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className={styles.container}>
      <NavigationBar />
      
      <div className={styles.mainContent}>
        {/* Middle Panel - Blockly Workspace with built-in toolbox */}
        <div className={styles.middlePanel}>
          <BlocklyWorkspace />
        </div>
        
        {/* Right Panel - Preview & Properties */}
        <div className={styles.rightPanel}>
          <PropertiesPanel />
        </div>
      </div>
      
      <CollaborationBar />
      {children}
    </div>
  );
};

export default Layout;
