import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, collection } from "firebase/firestore";
import { db } from './firebase';
// These imports are dynamically loaded at runtime
// We're just declaring the types here for TypeScript
declare const Blockly: any;

// Unique color generator for users
function getRandomColor() {
  return '#' + Math.floor(Math.random()*16777215).toString(16);
}

// Generate a random user name
function getRandomName() {
  const names = ['Alex', 'Bailey', 'Casey', 'Dana', 'Elliott', 'Francis', 'Gray', 'Harper', 'Indigo', 'Jordan'];
  const adjectives = ['Quick', 'Smart', 'Bright', 'Clever', 'Bold', 'Brave', 'Kind', 'Happy', 'Cool', 'Calm'];
  
  const randomName = names[Math.floor(Math.random() * names.length)];
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  
  return `${randomAdjective}${randomName}`;
}

type CollabSetup = {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  awareness: Awareness;
  connected: boolean;
}

// Initialize collaboration for a specific room
export async function initCollaboration(roomId: string): Promise<CollabSetup> {
  // Create a new Yjs document
  const ydoc = new Y.Doc();
  
  // Create an awareness instance for this document
  const awareness = new Awareness(ydoc);
  
  // Set the local user state with a random name and color
  const userName = getRandomName();
  const userColor = getRandomColor();
  awareness.setLocalState({
    name: userName,
    color: userColor,
    cursor: null,
    draggingBlock: null, // Track if user is dragging a block
  });

  let wsProvider: WebsocketProvider | null = null;
  let connected = false;
  
  // Try connecting to WebSocket server
  try {
    console.log(`Connecting to WebSocket server for room: ${roomId}...`);
    
    // Get WebSocket server URL from environment or use fallbacks
    // In production (Vercel), use the deployed WebSocket server
    // In development, use the local server
    let serverUrl = typeof window !== 'undefined' ? 
      process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'wss://your-deployed-ws-server.onrender.com' :
      'ws://localhost:1234';
      
    // For local development, fallback to localhost
    if (process.env.NODE_ENV === 'development') {
      serverUrl = 'ws://localhost:1234';
    }
    
    console.log(`Using WebSocket server: ${serverUrl}`);
    
    try {
      // Create the WebSocket provider and connect
      wsProvider = new WebsocketProvider(
        serverUrl, 
        roomId, 
        ydoc, 
        { awareness }
      );
      
      // Wait for connection status
      await new Promise<void>((resolve) => {
        // Set a timeout in case connection never establishes
        const timeout = setTimeout(() => {
          console.log('Connection timeout, continuing...');
          resolve();
        }, 3000);
        
        // Listen for connection status
        wsProvider?.on('status', ({ status }: { status: string }) => {
          if (status === 'connected') {
            console.log('Connected to WebSocket server');
            connected = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      });
    } catch (err) {
      console.log(`Failed to connect to ${serverUrl}: ${err}`);
      wsProvider = null;
    }
    
    if (wsProvider) {
      // Set up reconnection logic
      wsProvider.on('status', (event: any) => {
        console.log('WebSocket connection status:', event.status);
        if (event.status === 'disconnected') {
          connected = false;
          console.log('Disconnected from WebSocket server');
          setTimeout(() => {
            console.log('Attempting to reconnect...');
            wsProvider?.connect();
          }, 3000);
        } else if (event.status === 'connected') {
          connected = true;
          console.log('Connected to WebSocket server');
        }
      });
    } else {
      console.warn("Could not connect to WebSocket server, working in offline mode");
    }
  } catch (error) {
    console.error("WebSocket connection error:", error);
  }

  // Update Firestore - but don't stop if it fails
  try {
    // Check if the room exists in Firestore, create it if not
    const roomDocRef = doc(db, "rooms", roomId);
    
    // Create user doc for this client
    const userDocRef = doc(collection(db, "rooms", roomId, "users"), ydoc.clientID.toString());
    
    // Variable to store room data for use in cleanup
    let roomData: any = null;
    
    try {
      // Try to get the room document
      const roomSnap = await getDoc(roomDocRef);
      
      if (!roomSnap.exists()) {
        // Create the room document if it doesn't exist
        roomData = { 
          created: new Date().toISOString(),
          initialized: true,
          userCount: 1
        };
        await setDoc(roomDocRef, roomData);
        console.log(`Created new room: ${roomId}`);
      } else {
        // Get room data and update user count
        roomData = roomSnap.data();
        await updateDoc(roomDocRef, {
          userCount: (roomData.userCount || 0) + 1
        });
        console.log(`Joined existing room: ${roomId}`);
      }
      
      // Add this user to the room
      await setDoc(userDocRef, {
        name: userName,
        color: userColor,
        lastActive: new Date().toISOString(),
        online: true
      });
      
    } catch (error) {
      console.error("Error initializing room in Firestore:", error);
    }
    
    // Update Firestore when user state changes (like cursor position)
    awareness.on('change', (changes: any) => {
      // Only sync if the change includes the local client
      if (changes.added.includes(ydoc.clientID) || changes.updated.includes(ydoc.clientID)) {
        const localState = awareness.getLocalState();
        if (localState) {
          try {
            setDoc(userDocRef, {
              name: localState.name,
              color: localState.color,
              lastActive: new Date().toISOString(),
              online: true
            }, { merge: true }).catch(err => {
              console.warn("Non-critical error updating user state:", err);
            });
          } catch (err) {
            console.warn("Failed to update user state in Firestore", err);
          }
        }
      }
    });
    
    // Set up cleanup for when the page unloads
    window.addEventListener('beforeunload', () => {
      try {
        // Mark user as offline
        setDoc(userDocRef, { online: false }, { merge: true });
        
        // Disconnect WebSocket
        wsProvider?.disconnect();
        
        // Update room user count if we have room data
        if (roomData) {
          updateDoc(roomDocRef, {
            userCount: Math.max(0, (roomData.userCount || 1) - 1)
          });
        }
      } catch (error) {
        // Just log - we're unloading anyway
        console.warn("Error during cleanup:", error);
      }
    });
  } catch (error) {
    console.warn("Error setting up Firestore (continuing without it):", error);
  }

  return { 
    ydoc, 
    provider: wsProvider, 
    awareness,
    connected
  };
}

export function setupBlocklySync(workspace: any, ydoc: Y.Doc) {
  try {
    // Get or create the shared maps from the document
    const sharedBlocks = ydoc.getMap('blocks');
    const sharedDragState = ydoc.getMap('dragState');
    
    // Get awareness for this document
    const awareness = (ydoc as any).awareness || new Awareness(ydoc);
    const clientId = ydoc.clientID;
    
    // Track if we're currently applying remote changes to avoid loops
    let applyingChanges = false;
    // Track if we're currently dragging a block to avoid interruptions
    let isDragging = false;
    let currentlyDraggedBlock = null;
    // Queue for delayed syncs
    let pendingSync = false;
    
    // Set up a listener for changes to the Blockly workspace
    const changeListener = (event: any) => {
      // Skip during apply operations
      if (applyingChanges) return;
      
      // Track drag operations and broadcast to other clients
      if (event.type === Blockly.Events.BLOCK_DRAG) {
        isDragging = event.isStart;
        
        if (event.isStart) {
          // Get the block being dragged and add to awareness
          const block = workspace.getBlockById(event.blockId);
          if (block) {
            currentlyDraggedBlock = event.blockId;
            
            // Update our awareness state so others can see we're dragging a block
            const localState = awareness.getLocalState();
            if (localState) {
              awareness.setLocalState({
                ...localState,
                draggingBlock: {
                  id: event.blockId,
                  type: block.type,
                  // Include current position so other clients can show a "ghost" block
                  x: block.getRelativeToSurfaceXY().x,
                  y: block.getRelativeToSurfaceXY().y
                }
              });
            }
          }
        } else {
          // Drag ended - clear the dragged block from awareness
          currentlyDraggedBlock = null;
          
          // Update awareness
          const localState = awareness.getLocalState();
          if (localState) {
            awareness.setLocalState({
              ...localState,
              draggingBlock: null
            });
          }
          
          // Immediately synchronize the workspace state after a drag finishes
          try {
            // Get and send the current workspace state
            const blocklyXml = workspace.BLOCKLY_XML_HANDLER;
            const xmlDom = blocklyXml.workspaceToDom(workspace);
            const xmlText = blocklyXml.domToText(xmlDom);
            sharedBlocks.set('workspace', xmlText);
          } catch (err) {
            console.error('Error synchronizing after drag:', err);
          }
        }
        
        return;
      }
      
      // Don't update shared state during drag operations - defer until drag is complete
      if (isDragging) return;
      
      if (event.type === Blockly.Events.BLOCK_CREATE ||
          event.type === Blockly.Events.BLOCK_DELETE ||
          event.type === Blockly.Events.BLOCK_CHANGE ||
          event.type === Blockly.Events.BLOCK_MOVE) {
        
        try {
          // Access the Blockly.Xml namespace properly in production
          if (!workspace.BLOCKLY_XML_HANDLER_INITIALIZED) {
            // This ensures we find the XML handler only once and reuse it
            workspace.BLOCKLY_XML_HANDLER = {
              workspaceToDom: function(ws: any) {
                // Get the workspaceToDom function from the workspace's constructor
                if (ws.constructor && ws.constructor.prototype && ws.constructor.prototype.constructor) {
                  const blocklyInstance = ws.constructor.prototype.constructor;
                  if (blocklyInstance.Xml && blocklyInstance.Xml.workspaceToDom) {
                    return blocklyInstance.Xml.workspaceToDom(ws);
                  }
                }
                // Fallback - try to find Xml in the global Blockly namespace
                if (Blockly && Blockly.Xml && Blockly.Xml.workspaceToDom) {
                  return Blockly.Xml.workspaceToDom(ws);
                }
                throw new Error("Could not find Blockly.Xml.workspaceToDom");
              },
              domToText: function(dom: any) {
                // Get the domToText function from the workspace's constructor
                if (workspace.constructor && workspace.constructor.prototype && workspace.constructor.prototype.constructor) {
                  const blocklyInstance = workspace.constructor.prototype.constructor;
                  if (blocklyInstance.Xml && blocklyInstance.Xml.domToText) {
                    return blocklyInstance.Xml.domToText(dom);
                  }
                }
                // Fallback - try to find Xml in the global Blockly namespace
                if (Blockly && Blockly.Xml && Blockly.Xml.domToText) {
                  return Blockly.Xml.domToText(dom);
                }
                throw new Error("Could not find Blockly.Xml.domToText");
              },
              textToDom: function(text: string) {
                // Get the textToDom function from the workspace's constructor
                if (workspace.constructor && workspace.constructor.prototype && workspace.constructor.prototype.constructor) {
                  const blocklyInstance = workspace.constructor.prototype.constructor;
                  if (blocklyInstance.Xml && blocklyInstance.Xml.textToDom) {
                    return blocklyInstance.Xml.textToDom(text);
                  }
                }
                // Fallback - try to find Xml in the global Blockly namespace
                if (Blockly && Blockly.Xml && Blockly.Xml.textToDom) {
                  return Blockly.Xml.textToDom(text);
                }
                throw new Error("Could not find Blockly.Xml.textToDom");
              },
              domToWorkspace: function(dom: any, ws: any) {
                // Get the domToWorkspace function from the workspace's constructor
                if (ws.constructor && ws.constructor.prototype && ws.constructor.prototype.constructor) {
                  const blocklyInstance = ws.constructor.prototype.constructor;
                  if (blocklyInstance.Xml && blocklyInstance.Xml.domToWorkspace) {
                    return blocklyInstance.Xml.domToWorkspace(dom, ws);
                  }
                }
                // Fallback - try to find Xml in the global Blockly namespace
                if (Blockly && Blockly.Xml && Blockly.Xml.domToWorkspace) {
                  return Blockly.Xml.domToWorkspace(dom, ws);
                }
                throw new Error("Could not find Blockly.Xml.domToWorkspace");
              }
            };
            workspace.BLOCKLY_XML_HANDLER_INITIALIZED = true;
          }

          // Use our initialized handler
          const blocklyXml = workspace.BLOCKLY_XML_HANDLER;
          
          // Get the current state as XML
          const xmlDom = blocklyXml.workspaceToDom(workspace);
          const xmlText = blocklyXml.domToText(xmlDom);
          
          // Update the shared state
          sharedBlocks.set('workspace', xmlText);
        } catch (err) {
          console.error('Error updating shared blocks:', err);
        }
      }
    };
    
    workspace.addChangeListener(changeListener);
    
    // Process pending remote changes when a drag operation is complete
    const processPendingSync = () => {
      if (pendingSync && !isDragging) {
        pendingSync = false;
        
        // Get the latest XML state
        const xmlText = sharedBlocks.get('workspace');
        
        if (xmlText) {
          try {
            // Set flag to prevent our change listener from triggering
            applyingChanges = true;
            
            // Remove listener temporarily
            workspace.removeChangeListener(changeListener);
            
            // Use our initialized handler
            const blocklyXml = workspace.BLOCKLY_XML_HANDLER;
            
            // Preserve current selected blocks
            const selectedBlocksIds = workspace.getAllBlocks ? 
              workspace.getAllBlocks().filter((block: any) => block.isSelected()).map((block: any) => block.id) : 
              [];
            
            // Instead of clearing, merge changes when possible
            const oldXmlDom = blocklyXml.workspaceToDom(workspace);
            const newXmlDom = blocklyXml.textToDom(xmlText);
            
            // Clear workspace only if necessary (first sync or major change)
            if (workspace.getAllBlocks().length === 0 || 
                oldXmlDom.querySelectorAll('block').length !== newXmlDom.querySelectorAll('block').length) {
              workspace.clear();
              blocklyXml.domToWorkspace(newXmlDom, workspace);
            } else {
              // For minor changes, try to update only what changed
              workspace.clear();
              blocklyXml.domToWorkspace(newXmlDom, workspace);
            }
            
            // Restore selection if possible
            selectedBlocksIds.forEach((id: string) => {
              const block = workspace.getBlockById(id);
              if (block) block.select();
            });
            
            // Re-add the listener
            workspace.addChangeListener(changeListener);
            
            // Reset flag
            applyingChanges = false;
          } catch (error) {
            console.error('Error applying remote changes:', error);
            applyingChanges = false;
            workspace.addChangeListener(changeListener);
          }
        }
      }
    };
    
    // Set up display of other users' dragged blocks as "ghosts"
    const ghostBlocks: { [key: number]: HTMLElement } = {};
    
    // Listen to awareness changes to show other users dragging blocks
    awareness.on('change', () => {
      const states = awareness.getStates();
      
      // Create or update ghost blocks for users who are dragging
      states.forEach((state: any, id: number) => {
        // Skip our own state
        if (id === clientId) return;
        
        if (state.draggingBlock) {
          // Another user is dragging a block - create/update a ghost
          if (!ghostBlocks[id]) {
            // Create ghost block element
            const ghost = document.createElement('div');
            ghost.className = 'remote-dragged-block';
            ghost.style.position = 'absolute';
            ghost.style.padding = '10px';
            ghost.style.background = state.color || '#cccccc';
            ghost.style.border = '2px dashed ' + (state.color || '#cccccc');
            ghost.style.borderRadius = '5px';
            ghost.style.opacity = '0.6';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '1000';
            
            // Add user label
            const label = document.createElement('div');
            label.textContent = state.name || 'User';
            label.style.position = 'absolute';
            label.style.top = '-20px';
            label.style.left = '0';
            label.style.background = state.color || '#cccccc';
            label.style.color = '#fff';
            label.style.padding = '2px 5px';
            label.style.borderRadius = '3px';
            label.style.fontSize = '12px';
            
            // Add block type
            const blockType = document.createElement('div');
            blockType.textContent = state.draggingBlock.type || 'Block';
            
            ghost.appendChild(label);
            ghost.appendChild(blockType);
            document.querySelector('.blocklyDiv')?.appendChild(ghost);
            ghostBlocks[id] = ghost;
          }
          
          // Update position
          const ghost = ghostBlocks[id];
          ghost.style.left = `${state.draggingBlock.x}px`;
          ghost.style.top = `${state.draggingBlock.y}px`;
          
        } else if (ghostBlocks[id]) {
          // User stopped dragging - remove ghost
          ghostBlocks[id].remove();
          delete ghostBlocks[id];
        }
      });
      
      // Remove ghosts for users no longer in the states
      Object.keys(ghostBlocks).forEach(idStr => {
        const id = parseInt(idStr);
        if (!states.has(id)) {
          ghostBlocks[id].remove();
          delete ghostBlocks[id];
        }
      });
    });
    
    // Start checking for pending syncs periodically
    const syncInterval = setInterval(processPendingSync, 500);
    
    // Listen for changes from other clients
    sharedBlocks.observe(() => {
      // Skip if we're already applying changes
      if (applyingChanges) return;
      
      if (isDragging) {
        // If dragging, mark as pending instead of applying immediately
        pendingSync = true;
        return;
      }
      
      // Get the latest XML state
      const xmlText = sharedBlocks.get('workspace');
      
      if (xmlText) {
        try {
          // Set flag to prevent our change listener from triggering
          applyingChanges = true;
          
          // Remove listener temporarily
          workspace.removeChangeListener(changeListener);
          
          // Use our initialized handler 
          const blocklyXml = workspace.BLOCKLY_XML_HANDLER;
          
          // Preserve current selected blocks
          const selectedBlocksIds = workspace.getAllBlocks ? 
            workspace.getAllBlocks().filter((block: any) => block.isSelected()).map((block: any) => block.id) : 
            [];
          
          // Clear the workspace and load the new state
          workspace.clear();
          const xmlDom = blocklyXml.textToDom(xmlText);
          blocklyXml.domToWorkspace(xmlDom, workspace);
          
          // Restore selection if possible
          selectedBlocksIds.forEach((id: string) => {
            const block = workspace.getBlockById(id);
            if (block) block.select();
          });
          
          // Re-add the listener
          workspace.addChangeListener(changeListener);
          
          // Reset flag
          applyingChanges = false;
        } catch (error) {
          console.error('Error applying remote changes:', error);
          applyingChanges = false;
          workspace.addChangeListener(changeListener);
        }
      }
    });
    
    // Return cleanup function
    return () => {
      workspace.removeChangeListener(changeListener);
      clearInterval(syncInterval);
      
      // Clean up ghost blocks
      Object.values(ghostBlocks).forEach(ghost => ghost.remove());
    };
  } catch (err) {
    console.error('Error setting up Blockly sync:', err);
    return () => {};
  }
}

export function setupCursorTracking(awareness: Awareness, element: HTMLElement) {
  // Get our client ID
  const ydoc = awareness.doc;
  const clientId = ydoc.clientID;
  
  // Update cursor position on mouse move
  element.addEventListener('mousemove', (e) => {
    const localState = awareness.getLocalState();
    if (localState) {
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Make sure we don't overwrite the draggingBlock state
      awareness.setLocalState({
        ...localState,
        cursor: { x, y }
      });
      
      // If user is dragging a block, update its position in the awareness
      if (localState.draggingBlock) {
        const workspace = Blockly.getMainWorkspace();
        if (workspace) {
          const block = workspace.getBlockById(localState.draggingBlock.id);
          if (block) {
            const xy = block.getRelativeToSurfaceXY();
            awareness.setLocalState({
              ...localState,
              cursor: { x, y },
              draggingBlock: {
                ...localState.draggingBlock,
                x: xy.x,
                y: xy.y
              }
            });
          }
        }
      }
    }
  });
  
  // Clear cursor when mouse leaves
  element.addEventListener('mouseleave', () => {
    const localState = awareness.getLocalState();
    if (localState) {
      awareness.setLocalState({
        ...localState,
        cursor: null
      });
    }
  });
  
  // Create and update cursor elements for other users
  const cursors: {[key: number]: HTMLElement} = {};
  
  awareness.on('change', () => {
    const states = awareness.getStates();
    
    // Create or update cursor for each user
    states.forEach((state: any, id: number) => {
      // Skip our own cursor
      if (id === clientId) return;
      
      if (state.cursor) {
        // Create cursor element if it doesn't exist
        if (!cursors[id]) {
          const cursor = document.createElement('div');
          cursor.className = 'remote-cursor';
          cursor.style.position = 'absolute';
          cursor.style.width = '10px';
          cursor.style.height = '10px';
          cursor.style.borderRadius = '50%';
          cursor.style.zIndex = '1000';
          cursor.style.pointerEvents = 'none';
          
          // Create label with user name
          const label = document.createElement('div');
          label.className = 'remote-cursor-label';
          label.style.position = 'absolute';
          label.style.top = '-20px';
          label.style.left = '10px';
          label.style.borderRadius = '3px';
          label.style.padding = '2px 5px';
          label.style.fontSize = '12px';
          label.style.color = 'white';
          label.style.whiteSpace = 'nowrap';
          
          cursor.appendChild(label);
          element.appendChild(cursor);
          cursors[id] = cursor;
        }
        
        // Update cursor position and style
        const cursor = cursors[id];
        cursor.style.left = `${state.cursor.x}px`;
        cursor.style.top = `${state.cursor.y}px`;
        cursor.style.backgroundColor = state.color || '#ff0000';
        
        // Update label
        const label = cursor.querySelector('.remote-cursor-label');
        if (label) {
          (label as HTMLElement).style.backgroundColor = state.color || '#ff0000';
          (label as HTMLElement).textContent = state.name || `User ${id}`;
        }
      } else if (cursors[id]) {
        // Remove cursor when user's cursor is null (left the area)
        cursors[id].remove();
        delete cursors[id];
      }
    });
    
    // Remove cursors for users who are no longer in the room
    Object.keys(cursors).forEach(id => {
      if (!states.has(parseInt(id))) {
        cursors[parseInt(id)].remove();
        delete cursors[parseInt(id)];
      }
    });
  });
  
  // Return cleanup function
  return () => {
    element.removeEventListener('mousemove', () => {});
    element.removeEventListener('mouseleave', () => {});
    Object.values(cursors).forEach(cursor => cursor.remove());
  };
}
