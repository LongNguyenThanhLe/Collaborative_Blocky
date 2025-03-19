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
        if (localState && localState.user) {
          try {
            const userData = {
              name: localState.user.name || `User ${ydoc.clientID}`,
              color: localState.user.color || generateRandomColor(ydoc.clientID),
              lastActive: new Date().toISOString(),
              online: true
            };
            
            // Only send data if we have valid values
            if (userData.name && userData.color) {
              setDoc(userDocRef, userData, { merge: true }).catch(err => {
                console.warn("Non-critical error updating user state:", err);
              });
            }
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

/**
 * This function sets up synchronization between a Blockly workspace and a shared Yjs document
 * to enable real-time collaboration with per-block synchronization.
 */
export function setupBlocklySync(workspace: any, ydoc: Y.Doc, blocklyApi?: any) {
  try {
    // Get or create shared Yjs structures
    const sharedBlocks = ydoc.getMap('blocks'); // Map of block IDs to block data
    const sharedVariables = ydoc.getMap('variables'); // Map for variable data
    const sharedWorkspaceState = ydoc.getMap('workspaceState'); // General workspace state
    
    // Get awareness for cursor tracking
    const awareness = (ydoc as any).awareness || new Awareness(ydoc);
    const clientId = ydoc.clientID;
    
    // Reference to blockly - prefer passed reference, fall back to extraction
    let Blockly: any = blocklyApi?.blockly || null;
    
    if (!Blockly) {
      // Extract Blockly reference from workspace as fallback
      if (workspace?.constructor?.prototype?.constructor) {
        Blockly = workspace.constructor.prototype.constructor;
      } else if (typeof window !== 'undefined' && (window as any).Blockly) {
        // Fallback to global Blockly if available
        Blockly = (window as any).Blockly;
      } else {
        console.error('Could not find Blockly reference');
      }
    }
    
    // State tracking
    let applyingChanges = false;
    let isDragging = false;
    let draggingBlockId: string | null = null;
    
    // Store blockly event constants
    const EVENTS: Record<string, string> = {
      BLOCK_CHANGE: 'change',
      BLOCK_CREATE: 'create',
      BLOCK_DELETE: 'delete',
      BLOCK_DRAG: 'drag',
      BLOCK_MOVE: 'move',
      VAR_CREATE: 'var_create',
      VAR_DELETE: 'var_delete',
      VAR_RENAME: 'var_rename',
    };
    
    // Update event constants from Blockly.Events if available
    if (Blockly?.Events) {
      Object.keys(EVENTS).forEach(key => {
        if (Blockly.Events[key]) {
          EVENTS[key] = Blockly.Events[key];
        }
      });
    }
    
    // Function to serialize a single block to a JSON object
    const serializeBlock = (block: any) => {
      try {
        if (!block) return null;
        
        // Get position
        let position = block.getRelativeToSurfaceXY();
        if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
          console.warn('Invalid block position', block.id);
          position = { x: 0, y: 0 }; // Fallback position
        }
        
        // Get connections and linked blocks
        const connections: Record<string, string | null> = {};
        
        // Process all connections
        if (block.inputList && Array.isArray(block.inputList)) {
          block.inputList.forEach((input: any) => {
            if (input && input.connection && input.connection.targetConnection) {
              const targetBlock = input.connection.targetConnection.getSourceBlock();
              if (targetBlock && targetBlock.id) {
                connections[input.name] = targetBlock.id;
              }
            }
          });
        }
        
        // Get next block in sequence if any
        if (typeof block.getNextBlock === 'function') {
          const nextBlock = block.getNextBlock();
          if (nextBlock) {
            connections['next'] = nextBlock.id;
          }
        }
        
        // Get parent block if any
        if (typeof block.getParent === 'function') {
          const parentBlock = block.getParent();
          if (parentBlock) {
            connections['parent'] = parentBlock.id;
          }
        }
        
        // Serialize field values
        const fields: Record<string, any> = {};
        
        // Safely get field values
        if (typeof block.getFields === 'function') {
          // Use getFields if available
          const blockFields = block.getFields();
          for (const fieldName in blockFields) {
            const field = blockFields[fieldName];
            if (field && typeof field.getValue === 'function') {
              fields[fieldName] = field.getValue();
            }
          }
        } else if (block.inputList && Array.isArray(block.inputList)) {
          // Fallback: try to extract fields from inputList
          block.inputList.forEach((input: any) => {
            if (input && input.fieldRow && Array.isArray(input.fieldRow)) {
              input.fieldRow.forEach((field: any) => {
                if (field && field.name && typeof field.getValue === 'function') {
                  fields[field.name] = field.getValue();
                }
              });
            }
          });
        }
        
        // Return the serialized block data
        return {
          id: block.id,
          type: block.type,
          x: position.x,
          y: position.y,
          fields: fields,
          connections: connections,
          enabled: !block.disabled,
          collapsed: !!block.collapsed,
          deletable: block.deletable !== false,
          editable: block.editable !== false,
          movable: block.movable !== false,
          inputsInline: !!block.inputsInline
        };
      } catch (error) {
        console.error('Error serializing block:', error, block?.id || 'unknown');
        // Return a minimal valid block object to prevent further errors
        return block?.id ? {
          id: block.id,
          type: block.type || 'unknown',
          x: 0,
          y: 0,
          fields: {},
          connections: {},
          enabled: true,
          collapsed: false,
          deletable: true,
          editable: true,
          movable: true,
          inputsInline: false
        } : null;
      }
    };
    
    // Function to apply a block update from shared state
    const applyBlockFromSharedState = (blockData: any) => {
      if (applyingChanges) return null;
      
      try {
        applyingChanges = true;
        
        // Skip XML data - it should be an object not a string
        if (typeof blockData === 'string' && blockData.includes('xmlns="https://developers.google.com/blockly/xml"')) {
          console.warn('Invalid block data: XML format detected. Skipping.');
          return null;
        }
        
        if (!blockData || !blockData.id || !blockData.type) {
          console.warn('Invalid block data:', blockData);
          return null;
        }
        
        // First, find if this block already exists
        let block = workspace.getBlockById(blockData.id);
        
        // If block doesn't exist, create it
        if (!block) {
          try {
            block = workspace.newBlock(blockData.type, blockData.id);
            // Prevent events during initialization
            block.initSvg();
            block.render();
          } catch (error) {
            console.error(`Failed to create block of type: ${blockData.type}`, error);
            return null;
          }
        }
        
        // Update position
        if (typeof blockData.x === 'number' && typeof blockData.y === 'number') {
          try {
            block.moveBy(blockData.x - block.getRelativeToSurfaceXY().x, 
                          blockData.y - block.getRelativeToSurfaceXY().y);
          } catch (error) {
            console.warn('Error updating block position:', error);
          }
        }
        
        // Update collapsed state safely
        if (blockData.hasOwnProperty('collapsed')) {
          try {
            // Check if collapsed state is different
            if (!!blockData.collapsed !== !!block.collapsed) {
              block.setCollapsed(!!blockData.collapsed);
            }
          } catch (error) {
            console.warn(`Error setting collapsed state for block ${blockData.id}:`, error);
            // Don't throw error here, continue with other updates
          }
        }
        
        // Update fields
        if (blockData.fields) {
          try {
            for (const fieldName in blockData.fields) {
              const field = block.getField(fieldName);
              if (field && typeof field.getValue === 'function' && 
                  typeof field.setValue === 'function') {
                const newValue = blockData.fields[fieldName];
                if (newValue !== undefined && newValue !== field.getValue()) {
                  field.setValue(newValue);
                }
              }
            }
          } catch (error) {
            console.warn('Error updating block fields:', error);
          }
        }
        
        // Update enabled/disabled state
        if (blockData.hasOwnProperty('enabled')) {
          try {
            block.setEnabled(blockData.enabled);
          } catch (error) {
            console.warn(`Error setting enabled state for block ${blockData.id}:`, error);
          }
        }
        
        // Update editable state
        if (blockData.hasOwnProperty('editable')) {
          try {
            block.setEditable(blockData.editable);
          } catch (error) {
            console.warn(`Error setting editable state for block ${blockData.id}:`, error);
          }
        }
        
        // Update movable state
        if (blockData.hasOwnProperty('movable')) {
          try {
            block.setMovable(blockData.movable);
          } catch (error) {
            console.warn(`Error setting movable state for block ${blockData.id}:`, error);
          }
        }
        
        // Update deletable state
        if (blockData.hasOwnProperty('deletable')) {
          try {
            block.setDeletable(blockData.deletable);
          } catch (error) {
            console.warn(`Error setting deletable state for block ${blockData.id}:`, error);
          }
        }
        
        // Update inputs inline state
        if (blockData.hasOwnProperty('inputsInline')) {
          try {
            block.setInputsInline(blockData.inputsInline);
          } catch (error) {
            console.warn(`Error setting inputs inline for block ${blockData.id}:`, error);
          }
        }
        
        return block;
      } catch (error) {
        console.error('Error applying block from shared state:', error, blockData?.id);
        return null;
      } finally {
        applyingChanges = false;
      }
    };
    
    // Function to connect blocks according to their connection data
    const applyConnectionsFromSharedState = () => {
      if (applyingChanges) return;
      
      try {
        applyingChanges = true;
        
        // Process connections for each block
        sharedBlocks.forEach((blockData: any, blockId: string) => {
          // Skip if no connections defined
          if (!blockData.connections) return;
          
          const block = workspace.getBlockById(blockId);
          if (!block) return;
          
          // Process all connections
          for (const inputName in blockData.connections) {
            const targetBlockId = blockData.connections[inputName];
            if (!targetBlockId) continue;
            
            const targetBlock = workspace.getBlockById(targetBlockId);
            if (!targetBlock) continue;
            
            // Handle 'next' connection (sequence)
            if (inputName === 'next') {
              if (block.getNextBlock() !== targetBlock) {
                // Connect only if not already connected
                const connection = block.nextConnection;
                if (connection && connection.targetConnection !== targetBlock.previousConnection) {
                  connection.connect(targetBlock.previousConnection);
                }
              }
              continue;
            }
            
            // Handle input connections
            const input = block.getInput(inputName);
            if (input?.connection) {
              const currentTarget = input.connection.targetBlock();
              if (currentTarget !== targetBlock) {
                // Connect only if not already connected
                if (input.connection.targetConnection !== targetBlock.outputConnection) {
                  input.connection.connect(targetBlock.outputConnection);
                }
              }
            }
          }
        });
      } catch (error) {
        console.error('Error applying connections from shared state:', error);
      } finally {
        applyingChanges = false;
      }
    };
    
    // Function to sync all blocks in the workspace to shared state
    const syncAllBlocksToSharedState = () => {
      if (applyingChanges) return;
      
      try {
        applyingChanges = true;
        
        // Get all blocks in the workspace
        const allBlocks = workspace.getAllBlocks();
        
        // Sync each block
        allBlocks.forEach((block: any) => {
          const blockData = serializeBlock(block);
          if (blockData) {
            sharedBlocks.set(blockData.id, blockData);
          }
        });
        
        // Track block IDs to detect deleted blocks
        const blockIds = new Set(allBlocks.map((block: any) => block.id));
        
        // Find deleted blocks by comparing with shared state
        sharedBlocks.forEach((_: any, blockId: string) => {
          if (!blockIds.has(blockId)) {
            sharedBlocks.delete(blockId);
          }
        });
      } catch (error) {
        console.error('Error syncing all blocks:', error);
      } finally {
        applyingChanges = false;
      }
    };
    
    // Function to sync a single block to the shared state
    const syncBlockToSharedState = (block: any) => {
      if (!block || applyingChanges) return;
      
      try {
        const blockData = serializeBlock(block);
        if (blockData) {
          sharedBlocks.set(blockData.id, blockData);
        }
      } catch (error) {
        console.error('Error syncing block to shared state:', error);
      }
    };
    
    // Function to handle variables
    const syncVariablesToSharedState = () => {
      if (applyingChanges) return;
      
      try {
        applyingChanges = true;
        
        // Get all variables
        const variableMap = workspace.getVariableMap();
        const variables = variableMap.getAllVariables();
        
        // Convert to an object for easier handling
        const variableData: Record<string, any> = {};
        variables.forEach((variable: any) => {
          variableData[variable.getId()] = {
            id: variable.getId(),
            name: variable.name,
            type: variable.type
          };
        });
        
        // Update the shared state
        sharedVariables.set('variables', variableData);
      } catch (error) {
        console.error('Error syncing variables:', error);
      } finally {
        applyingChanges = false;
      }
    };
    
    // Function to apply variables from shared state
    const applyVariablesFromSharedState = () => {
      if (applyingChanges) return;
      
      try {
        applyingChanges = true;
        
        const variableData = sharedVariables.get('variables') as Record<string, any>;
        if (!variableData) return;
        
        const variableMap = workspace.getVariableMap();
        
        // Create or update variables
        for (const varId in variableData) {
          if (Object.prototype.hasOwnProperty.call(variableData, varId)) {
            const variable = variableData[varId];
            
            // Check if variable exists
            const existingVar = variableMap.getVariableById(varId);
            
            if (!existingVar) {
              // Create new variable
              workspace.createVariable(variable.name, variable.type, varId);
            } else if (existingVar.name !== variable.name) {
              // Rename variable if name changed
              workspace.renameVariableById(varId, variable.name);
            }
          }
        }
        
        // Remove variables not in shared state
        variableMap.getAllVariables().forEach((variable: any) => {
          const varId = variable.getId();
          if (varId && variableData && !variableData[varId]) {
            workspace.deleteVariableById(varId);
          }
        });
      } catch (error) {
        console.error('Error applying variables from shared state:', error);
      } finally {
        applyingChanges = false;
      }
    };
        
    // Set up a listener for changes to the Blockly workspace
    const changeListener = (event: any) => {
      // Skip during apply operations
      if (applyingChanges) return;
      
      // Skip if event has no type property
      if (!event || typeof event.type === 'undefined') return;
      
      // Ensure event.type is treated as a string
      const eventType = String(event.type || '');
      
      // Handle drag operations
      if (eventType === 'drag' || 
          (Blockly?.Events?.BLOCK_DRAG && eventType === Blockly.Events.BLOCK_DRAG)) {
        
        if (event.isStart) {
          isDragging = true;
          if (event.blockId) {
            draggingBlockId = event.blockId;
            
            // Update awareness to show other users that we're dragging this block
            const localState = awareness.getLocalState();
            if (localState) {
              const block = workspace.getBlockById(event.blockId);
              if (block) {
                const xy = block.getRelativeToSurfaceXY();
                awareness.setLocalState({
                  ...localState,
                  draggingBlock: {
                    id: event.blockId,
                    x: xy.x,
                    y: xy.y
                  }
                });
              }
            }
          }
        } else {
          // When drag ends
          isDragging = false;
          
          if (draggingBlockId) {
            // Sync the dragged block
            const block = workspace.getBlockById(draggingBlockId);
            if (block) {
              syncBlockToSharedState(block);
            }
            
            // Clear dragging state in awareness
            const localState = awareness.getLocalState();
            if (localState) {
              awareness.setLocalState({
                ...localState,
                draggingBlock: null
              });
            }
            
            draggingBlockId = null;
          }
        }
        return;
      }
      
      // Skip during drag operations (except for the end)
      if (isDragging && eventType !== 'endDrag') return;
      
      // Handle different event types
      switch (eventType) {
        case 'create':
        case Blockly?.Events?.BLOCK_CREATE:
          if (event.blockId) {
            const block = workspace.getBlockById(event.blockId);
            if (block) {
              setTimeout(() => syncBlockToSharedState(block), 10);
            }
          }
          break;
          
        case 'change':
        case Blockly?.Events?.BLOCK_CHANGE:
          if (event.blockId) {
            const block = workspace.getBlockById(event.blockId);
            if (block) {
              setTimeout(() => syncBlockToSharedState(block), 10);
            }
          }
          break;
          
        case 'move':
        case Blockly?.Events?.BLOCK_MOVE:
          if (event.blockId) {
            const block = workspace.getBlockById(event.blockId);
            if (block) {
              setTimeout(() => syncBlockToSharedState(block), 10);
            }
          }
          break;
          
        case 'delete':
        case Blockly?.Events?.BLOCK_DELETE:
          if (event.blockId && sharedBlocks.get(event.blockId)) {
            sharedBlocks.delete(event.blockId);
          }
          break;
          
        case 'var_create':
        case 'var_delete':
        case 'var_rename':
        case Blockly?.Events?.VAR_CREATE:
        case Blockly?.Events?.VAR_DELETE:
        case Blockly?.Events?.VAR_RENAME:
          setTimeout(() => syncVariablesToSharedState(), 10);
          break;
          
        default:
          // For other events, sync everything
          if (!isDragging) {
            setTimeout(() => {
              syncAllBlocksToSharedState();
              syncVariablesToSharedState();
            }, 10);
          }
          break;
      }
    };
    
    // Add the change listener to the workspace
    workspace.addChangeListener(changeListener);
    
    // Listen for changes to the shared blocks
    sharedBlocks.observe((event: any, transaction: any) => {
      if (applyingChanges || transaction.origin === ydoc.clientID) return;
      
      // If we're dragging, queue the updates for after we finish
      if (isDragging) return;
      
      // Apply each changed block
      event.keys.forEach((key: any, blockId: string) => {
        if (key.action === 'add' || key.action === 'update') {
          const blockData = sharedBlocks.get(blockId);
          if (blockData) {
            applyBlockFromSharedState(blockData);
          }
        } else if (key.action === 'delete') {
          // Delete the block if it exists
          const block = workspace.getBlockById(blockId);
          if (block) {
            applyingChanges = true;
            block.dispose(false);
            applyingChanges = false;
          }
        }
      });
      
      // After applying individual blocks, apply connections
      setTimeout(() => applyConnectionsFromSharedState(), 10);
    });
    
    // Listen for changes to the shared variables
    sharedVariables.observe((event: any, transaction: any) => {
      if (applyingChanges || transaction.origin === ydoc.clientID) return;
      applyVariablesFromSharedState();
    });
    
    // Initial synchronization
    if (sharedBlocks.size > 0) {
      // Apply blocks first
      sharedBlocks.forEach((blockData: any, blockId: string) => {
        applyBlockFromSharedState(blockData);
      });
      
      // Then apply connections
      setTimeout(() => applyConnectionsFromSharedState(), 50);
      
      // Apply variables
      applyVariablesFromSharedState();
    } else {
      // No existing blocks, sync current workspace to shared state
      syncAllBlocksToSharedState();
      syncVariablesToSharedState();
    }
    
    // Return cleanup function
    return () => {
      workspace.removeChangeListener(changeListener);
    };
  } catch (err) {
    console.error('Error setting up Blockly sync:', err);
    return () => {};
  }
}

/**
 * Sets up cursor tracking for collaborative editing, showing other users' cursors
 * in the workspace in real-time.
 */
export function setupCursorTracking(
  element: HTMLElement,
  workspace: any,
  ydoc: Y.Doc,
  awareness: Awareness,
  userInfo?: { name?: string; color?: string }
) {
  try {
    // Get the client ID
    const clientId = ydoc.clientID;
    
    // Set default user info if not provided
    const name = userInfo?.name || `User ${clientId}`;
    const color = userInfo?.color || generateRandomColor(clientId);
    
    // Set local state with user info
    awareness.setLocalState({
      user: { 
        name: name || `User ${clientId}`, 
        color: color || generateRandomColor(clientId), 
        clientId 
      },
      cursor: null,
      draggingBlock: null,
    });
    
    // Object to store cursor elements for other users
    const cursorElements: Record<number, HTMLElement> = {};
    
    // Create a cursor element for a user
    const createCursorElement = (state: any) => {
      const cursorEl = document.createElement('div');
      cursorEl.className = 'remote-cursor';
      cursorEl.style.position = 'absolute';
      cursorEl.style.width = '20px';
      cursorEl.style.height = '20px';
      cursorEl.style.zIndex = '1000';
      cursorEl.style.pointerEvents = 'none'; // Don't interfere with workspace interactions
      
      // Create the cursor shape (arrow pointer)
      const cursorShape = document.createElement('div');
      cursorShape.style.width = '0';
      cursorShape.style.height = '0';
      cursorShape.style.borderLeft = '8px solid transparent';
      cursorShape.style.borderRight = '8px solid transparent';
      cursorShape.style.borderBottom = '16px solid ' + state.user.color;
      cursorShape.style.transform = 'rotate(-135deg)';
      cursorShape.style.position = 'absolute';
      cursorShape.style.left = '0';
      cursorShape.style.top = '0';
      cursorEl.appendChild(cursorShape);
      
      // Add name label
      const nameEl = document.createElement('div');
      nameEl.className = 'remote-cursor-name';
      nameEl.textContent = state.user.name;
      nameEl.style.position = 'absolute';
      nameEl.style.top = '-25px';
      nameEl.style.left = '15px';
      nameEl.style.backgroundColor = state.user.color;
      nameEl.style.color = 'white';
      nameEl.style.padding = '2px 5px';
      nameEl.style.borderRadius = '4px';
      nameEl.style.fontSize = '12px';
      nameEl.style.whiteSpace = 'nowrap';
      nameEl.style.userSelect = 'none';
      cursorEl.appendChild(nameEl);
      
      return cursorEl;
    };
    
    // Update or create cursor for a user
    const updateCursor = (clientId: number, state: any) => {
      // Skip our own cursor
      if (clientId === ydoc.clientID) return;
      
      // Remove cursor if state is null or cursor position is null
      if (!state || !state.cursor) {
        if (cursorElements[clientId]) {
          cursorElements[clientId].remove();
          delete cursorElements[clientId];
        }
        return;
      }
      
      // Position relative to workspace
      const { x, y } = state.cursor;
      
      // Get or create cursor element
      let cursorEl = cursorElements[clientId];
      if (!cursorEl) {
        cursorEl = createCursorElement(state);
        element.appendChild(cursorEl);
        cursorElements[clientId] = cursorEl;
      }
      
      // Update cursor position
      cursorEl.style.left = `${x - 5}px`;
      cursorEl.style.top = `${y - 5}px`;
      
      // If the user is dragging a block, add highlight
      if (state.draggingBlock) {
        cursorEl.classList.add('dragging');
        // Could add more visual indicators here if needed
      } else {
        cursorEl.classList.remove('dragging');
      }
    };
    
    // Update all cursors from awareness
    const updateCursors = () => {
      const states = awareness.getStates() as Map<number, any>;
      
      // Get all client IDs with state
      const clientIds = Array.from(states.keys());
      
      // Update each cursor
      clientIds.forEach((clientId) => {
        const state = states.get(clientId);
        updateCursor(clientId, state);
      });
      
      // Remove cursors for clients that no longer have state
      Object.keys(cursorElements).forEach((clientIdStr) => {
        const clientId = parseInt(clientIdStr, 10);
        if (!states.has(clientId)) {
          cursorElements[clientId].remove();
          delete cursorElements[clientId];
        }
      });
    };
    
    // Track mouse position in the workspace
    const trackMousePosition = (e: MouseEvent) => {
      try {
        // Get position relative to workspace
        const rect = element.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Update awareness with new cursor position
        const state = awareness.getLocalState();
        if (state) {
          awareness.setLocalState({
            ...state,
            cursor: { x, y }
          });
        }
      } catch (err) {
        console.error('Error tracking mouse position:', err);
      }
    };
    
    // Add mouse move listener
    element.addEventListener('mousemove', trackMousePosition);
    
    // Add mouse leave listener
    element.addEventListener('mouseleave', () => {
      const localState = awareness.getLocalState();
      if (localState) {
        awareness.setLocalState({
          ...localState,
          cursor: null
        });
      }
    });
    
    // Listen for awareness changes
    awareness.on('change', updateCursors);
    
    // Initial update
    updateCursors();
    
    // Return cleanup function
    return () => {
      // Remove event listeners
      element.removeEventListener('mousemove', trackMousePosition);
      
      // Remove all cursor elements
      Object.values(cursorElements).forEach(el => el.remove());
      
      // Stop listening for awareness changes
      awareness.off('change', updateCursors);
      
      // Clear local state
      awareness.setLocalState(null);
    };
  } catch (error) {
    console.error('Error setting up cursor tracking:', error);
    return () => {};
  }
}

/**
 * Generates a random color based on the client ID for consistent color assignment
 */
function generateRandomColor(seed: number): string {
  // Simple hash function to get deterministic but random-appearing values
  const hash = seed % 360;
  return `hsl(${hash}, 80%, 60%)`;
}
