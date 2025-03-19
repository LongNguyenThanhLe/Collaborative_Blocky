import React, { useEffect, useRef, useState } from 'react';
import styles from '../styles/BlocklyWorkspace.module.css';
import { BlocklyOptions } from 'blockly';
import { initCollaboration, setupBlocklySync, setupCursorTracking } from '../lib/collab';

interface BlocklyWorkspaceProps {
  roomId?: string;
  onConnectionStatusChange?: (status: string, connected?: boolean) => void;
  onUserCountChange?: (count: number) => void;
}

const BlocklyWorkspace: React.FC<BlocklyWorkspaceProps> = ({ 
  roomId = 'default-room',
  onConnectionStatusChange,
  onUserCountChange
}) => {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [showCode, setShowCode] = useState<boolean>(true);
  const [collaborationStatus, setCollaborationStatus] = useState<string>('Initializing collaboration...');
  const [userCount, setUserCount] = useState<number>(1);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Update parent component with connection status
  useEffect(() => {
    if (onConnectionStatusChange) {
      onConnectionStatusChange(collaborationStatus, isConnected);
    }
  }, [collaborationStatus, isConnected, onConnectionStatusChange]);

  // Update parent component with user count
  useEffect(() => {
    if (onUserCountChange) {
      onUserCountChange(userCount);
    }
  }, [userCount, onUserCountChange]);

  useEffect(() => {
    let blocklyInstance: any = null;
    let collaborationCleanup: (() => void) | null = null;
    
    // Only run on client-side
    if (typeof window === 'undefined' || !blocklyDiv.current) return;
    
    // Dynamically import Blockly
    const initBlockly = async () => {
      try {
        // Import Blockly and necessary components
        const Blockly = await import('blockly');
        const BlocklyJS = await import('blockly/javascript');
        
        // Explicitly import Blockly XML utilities - use correct path
        // The Xml utility is part of the main Blockly namespace, not a separate module
        const BlocklyXml = Blockly.Xml;
        
        // Make sure we have all the blocks we need
        await import('blockly/blocks');

        // Apply custom category styling after load
        const applyCustomStyles = () => {
          // Find all category rows and add data attributes for CSS targeting
          const categoryRows = document.querySelectorAll('.blocklyTreeRow');
          categoryRows.forEach(row => {
            const label = row.querySelector('.blocklyTreeLabel');
            if (label) {
              const category = label.textContent?.toLowerCase().trim();
              if (category) {
                (row as HTMLElement).dataset.category = category;
                
                // Add icon before the category label
                const iconExists = row.querySelector('.category-icon');
                if (!iconExists) {
                  const iconImg = document.createElement('img');
                  iconImg.src = `/images/blockly-icons/${category}.svg`;
                  iconImg.className = 'category-icon';
                  iconImg.alt = `${category} icon`;
                  iconImg.width = 20;
                  iconImg.height = 20;
                  
                  // Insert before the label
                  if (label.parentNode) {
                    label.parentNode.insertBefore(iconImg, label);
                  }
                }
              }
            }
          });
          
          // Improve the flyout appearance for better UX
          const flyoutBtns = document.querySelectorAll('.blocklyFlyoutButton');
          flyoutBtns.forEach(btn => {
            (btn as HTMLElement).style.filter = 'drop-shadow(0px 1px 3px rgba(0,0,0,0.3))';
          });
        };
        
        // Configure workspace
        const options: BlocklyOptions = {
          toolbox: getToolboxConfiguration(),
          grid: {
            spacing: 20,
            length: 3,
            colour: '#ccc',
            snap: true,
          },
          trashcan: true,
          zoom: {
            controls: true,
            wheel: true,
            startScale: 1.0,
            maxScale: 3,
            minScale: 0.3,
            scaleSpeed: 1.2,
          },
          move: {
            scrollbars: true,
            drag: true,
            wheel: true
          },
          comments: true,
          collapse: true,
          sounds: true,
          media: 'https://blockly-demo.appspot.com/static/media/',
          renderer: 'geras',
          // Removing theme property as it's causing TypeScript errors
        };
        
        // Clear any previous workspace
        if (blocklyDiv.current) {
          blocklyDiv.current.innerHTML = '';
        }
        
        // Create the Blockly workspace - Fix the null issue by asserting non-null
        const newWorkspace = Blockly.inject(blocklyDiv.current!, options);
        setWorkspace(newWorkspace);
        blocklyInstance = newWorkspace;
        
        // Apply our custom styling to the toolbox categories
        setTimeout(applyCustomStyles, 100);
        
        // Add change listener to generate code
        const updateCode = () => {
          try {
            const code = BlocklyJS.javascriptGenerator.workspaceToCode(newWorkspace);
            setGeneratedCode(code);
            console.log("Generated code:", code);
          } catch (err) {
            console.error("Error generating code:", err);
          }
        };
        
        // Register for changes to the workspace
        newWorkspace.addChangeListener((e: any) => {
          // Only update when changes are done (not during drags, etc)
          if (e.type === Blockly.Events.BLOCK_MOVE ||
              e.type === Blockly.Events.BLOCK_CHANGE ||
              e.type === Blockly.Events.BLOCK_CREATE ||
              e.type === Blockly.Events.BLOCK_DELETE) {
            updateCode();
          }
        });

        // Re-apply styles when toolbox changes are made
        newWorkspace.addChangeListener((e: any) => {
          if (e.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
            setTimeout(applyCustomStyles, 200); // Increased timeout for more reliable icon insertion
          }
        });
        
        // Also reapply styles on window resize to ensure icons stay in place
        window.addEventListener('resize', () => {
          setTimeout(applyCustomStyles, 200);
        });

        // Set up collaboration features after workspace is created
        try {
          setCollaborationStatus('Connecting to collaboration server...');
          setIsConnected(false);
          
          // Initialize collaboration
          const { ydoc, provider, awareness, connected } = await initCollaboration(roomId);
          
          // Set up Blockly synchronization 
          const cleanup = setupBlocklySync(newWorkspace, ydoc, {
            blockly: Blockly
          });
          
          // Set up cursor tracking if the provider is available
          if (blocklyDiv.current && awareness) {
            setupCursorTracking(
              blocklyDiv.current,
              newWorkspace,
              ydoc,
              awareness,
              { name: `User ${Math.floor(Math.random() * 1000)}` }
            );
          }
          
          // Update initial connection status
          setIsConnected(connected);
          if (connected) {
            setCollaborationStatus('Connected to collaboration server');
          } else if (provider === null) {
            setCollaborationStatus('Working in offline mode - WebSocket connection failed');
          } else {
            setCollaborationStatus('Partially connected - some features may be limited');
          }
          
          // Listen for provider status changes if available
          if (provider) {
            provider.on('status', (event: { status: string }) => {
              console.log('WebSocket connection status:', event.status);
              
              if (event.status === 'connected') {
                setCollaborationStatus('Connected! 🎉 You can now collaborate in real-time.');
                setIsConnected(true);
              } else if (event.status === 'connecting') {
                setCollaborationStatus('Connecting to collaboration server...');
                setIsConnected(false);
              } else if (event.status === 'disconnected') {
                setCollaborationStatus('Disconnected from collaboration server. Trying to reconnect...');
                setIsConnected(false);
              } else {
                setCollaborationStatus(`Connection status: ${event.status}`);
              }
            });
          }

          // Keep track of user counts
          if (awareness) {
            awareness.on('change', () => {
              // Count users with awareness states (indicating active users)
              const count = Array.from(awareness.getStates().keys()).length;
              setUserCount(Math.max(1, count)); // Ensure at least 1 user (self)
            });
          }

          // Setup cleanup function
          collaborationCleanup = () => {
            if (provider) provider.disconnect();
            if (ydoc) ydoc.destroy();
          };
          
        } catch (error) {
          console.error('Error setting up collaboration:', error);
          setCollaborationStatus('Failed to connect to collaboration server. Working in offline mode.');
          setIsConnected(false);
        }
      } catch (error) {
        console.error("Error initializing Blockly:", error);
        setCollaborationStatus('Error initializing Blockly workspace');
      }
    };

    initBlockly();
    
    // Clean up on unmount
    return () => {
      if (blocklyInstance) {
        blocklyInstance.dispose();
      }
      // Clean up collaboration resources
      if (collaborationCleanup) {
        collaborationCleanup();
      }
      // Remove resize listener
      window.removeEventListener('resize', () => {});
    };
  }, [roomId]);

  const clearWorkspace = () => {
    if (workspace) {
      workspace.clear();
    }
  };

  const toggleCodeVisibility = () => {
    setShowCode(!showCode);
  };

  const getToolboxConfiguration = () => {
    return {
      kind: 'categoryToolbox',
      contents: [
        {
          kind: 'category',
          name: 'Logic',
          colour: '#5b80a5',
          contents: [
            { kind: 'block', type: 'controls_if' },
            { kind: 'block', type: 'logic_compare' },
            { kind: 'block', type: 'logic_operation' },
            { kind: 'block', type: 'logic_negate' },
            { kind: 'block', type: 'logic_boolean' },
            { kind: 'block', type: 'logic_null' },
            { kind: 'block', type: 'logic_ternary' },
          ],
        },
        {
          kind: 'category',
          name: 'Loops',
          colour: '#5ba55b',
          contents: [
            { kind: 'block', type: 'controls_repeat_ext' },
            { kind: 'block', type: 'controls_whileUntil' },
            { kind: 'block', type: 'controls_for' },
            { kind: 'block', type: 'controls_forEach' },
            { kind: 'block', type: 'controls_flow_statements' },
          ],
        },
        {
          kind: 'category',
          name: 'Math',
          colour: '#5b67a5',
          contents: [
            { kind: 'block', type: 'math_number' },
            { kind: 'block', type: 'math_arithmetic' },
            { kind: 'block', type: 'math_single' },
            { kind: 'block', type: 'math_trig' },
            { kind: 'block', type: 'math_constant' },
            { kind: 'block', type: 'math_number_property' },
            { kind: 'block', type: 'math_round' },
            { kind: 'block', type: 'math_on_list' },
            { kind: 'block', type: 'math_modulo' },
            { kind: 'block', type: 'math_constrain' },
            { kind: 'block', type: 'math_random_int' },
            { kind: 'block', type: 'math_random_float' },
            { kind: 'block', type: 'math_atan2' },
          ],
        },
        {
          kind: 'category',
          name: 'Text',
          colour: '#5ba58c',
          contents: [
            { kind: 'block', type: 'text' },
            { kind: 'block', type: 'text_join' },
            { kind: 'block', type: 'text_append' },
            { kind: 'block', type: 'text_length' },
            { kind: 'block', type: 'text_isEmpty' },
            { kind: 'block', type: 'text_indexOf' },
            { kind: 'block', type: 'text_charAt' },
            { kind: 'block', type: 'text_getSubstring' },
            { kind: 'block', type: 'text_changeCase' },
            { kind: 'block', type: 'text_trim' },
            { kind: 'block', type: 'text_print' },
            { kind: 'block', type: 'text_prompt_ext' },
          ],
        },
        {
          kind: 'category',
          name: 'Lists',
          colour: '#745ba5',
          contents: [
            { kind: 'block', type: 'lists_create_with' },
            { kind: 'block', type: 'lists_create_empty' },
            { kind: 'block', type: 'lists_repeat' },
            { kind: 'block', type: 'lists_length' },
            { kind: 'block', type: 'lists_isEmpty' },
            { kind: 'block', type: 'lists_indexOf' },
            { kind: 'block', type: 'lists_getIndex' },
            { kind: 'block', type: 'lists_setIndex' },
            { kind: 'block', type: 'lists_getSublist' },
            { kind: 'block', type: 'lists_split' },
            { kind: 'block', type: 'lists_sort' },
          ],
        },
        {
          kind: 'category',
          name: 'Variables',
          colour: '#a55b80',
          custom: 'VARIABLE',
        },
        {
          kind: 'category',
          name: 'Functions',
          colour: '#995ba5',
          custom: 'PROCEDURE',
        },
      ],
    };
  };

  return (
    <div className={styles.blocklyContainer}>
      <div className={styles.toolbar}>
        <button className={styles.toolbarButton} onClick={clearWorkspace}>
          Clear Workspace
        </button>
        <button className={styles.toolbarButton} onClick={toggleCodeVisibility}>
          {showCode ? 'Hide' : 'Show'} Code
        </button>
        <div className={styles.collaborationStatus}>
          {collaborationStatus} {userCount > 1 ? `👥 ${userCount} users online` : ''}
        </div>
      </div>
      
      <div className={styles.workspaceContainer}>
        <div
          className={styles.blocklyDiv}
          ref={blocklyDiv}
        />
      </div>
      
      {showCode && (
        <div className={styles.codeOutput}>
          <h3>Generated JavaScript:</h3>
          <pre>
            <code>{generatedCode || '// No code generated yet'}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

export default BlocklyWorkspace;
