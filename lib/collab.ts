import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import { 
  doc, getDoc, setDoc, onSnapshot, updateDoc, 
  collection, getDocs, addDoc, serverTimestamp,
  writeBatch, query, limit, where, Timestamp, DocumentData, arrayUnion, arrayRemove 
} from "firebase/firestore";
import { db, auth } from './firebase';
import { onAuthStateChanged, getAuth } from 'firebase/auth';
import { debounce, throttle } from 'lodash';
// These imports are dynamically loaded at runtime
// We're just declaring the types here for TypeScript
declare const Blockly: any;

// Constants for caching and throttling
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes cache expiry
const USER_STATUS_DEBOUNCE = 30 * 1000; // 30 seconds debounce for user status updates
const USER_COUNT_UPDATE_INTERVAL = 60 * 1000; // Update user count once per minute
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Caches to reduce Firestore reads
interface CacheEntry {
  data: any;
  timestamp: number;
}
const roomDataCache = new Map<string, CacheEntry>();
const roomUsersCache = new Map<string, CacheEntry>();
const userRoomsCache = new Map<string, CacheEntry>();

// Check if cache is valid
const isCacheValid = (entry: CacheEntry | undefined): boolean => {
  if (!entry) return false;
  return Date.now() - entry.timestamp < CACHE_EXPIRY;
};

// Clear cache for a specific room
export function clearRoomCache(roomId: string) {
  roomDataCache.delete(roomId);
  roomUsersCache.delete(roomId);
}

// Get room data with caching to reduce Firestore reads
export async function getCachedRoomData(roomId: string) {
  const cachedData = roomDataCache.get(roomId);
  if (cachedData && isCacheValid(cachedData)) {
    console.log('Using cached room data for', roomId);
    return cachedData.data;
  }
  
  try {
    console.log('Fetching room data from Firestore for', roomId);
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    
    if (roomSnap.exists()) {
      const roomData = roomSnap.data();
      // Cache the room data
      roomDataCache.set(roomId, {
        data: roomData,
        timestamp: Date.now()
      });
      return roomData;
    } else {
      console.warn('Room not found:', roomId);
      return null;
    }
  } catch (error) {
    console.error('Error getting room data:', error);
    return null;
  }
}

// Get room users with caching
export async function getRoomUsers(roomId: string) {
  const cachedUsers = roomUsersCache.get(roomId);
  if (cachedUsers && isCacheValid(cachedUsers)) {
    console.log('Using cached room users for', roomId);
    return cachedUsers.data;
  }
  
  try {
    console.log('Fetching room users from Firestore for', roomId);
    
    // Get room document first to check if it exists
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) {
      console.log('Room not found');
      return [];
    }
    
    // Get userIds from the room document
    const roomData = roomDoc.data();
    const userIds = roomData?.userIds || [];
    
    if (userIds.length === 0) {
      return [];
    }
    
    // Get user details from the subcollection
    const usersCollectionRef = collection(db, 'rooms', roomId, 'users');
    const usersSnapshot = await getDocs(usersCollectionRef);
    
    const users = usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Cache the results
    roomUsersCache.set(roomId, {
      data: users,
      timestamp: Date.now()
    });
    
    return users;
  } catch (error) {
    console.error('Error getting room users:', error);
    return [];
  }
}

// Add room to user history with batched write
export async function addRoomToUserHistory(userId: string, roomId: string, roomName: string) {
  try {
    // Create a batch to combine operations
    const batch = writeBatch(db);
    
    // User's room reference
    const userRoomRef = doc(db, 'users', userId, 'rooms', roomId);
    
    // Add room to user's room history
    batch.set(userRoomRef, {
      roomId,
      roomName,
      lastAccessed: serverTimestamp(),
      joinedAt: serverTimestamp()
    });
    
    // Commit the batch
    await batch.commit();
    
    // Clear any related cache
    userRoomsCache.delete(userId);
    
    return true;
  } catch (error) {
    console.error('Error adding room to user history:', error);
    return false;
  }
}

// Throttled function to update user activity in room
// Only updates every 30 seconds to reduce write operations
const updateUserRoomActivityThrottled = throttle(async (userId: string, roomId: string) => {
  try {
    // Only update if the user is still connected
    const user = auth.currentUser;
    if (!user || user.uid !== userId) return;
    
    const userRoomRef = doc(db, 'users', userId, 'rooms', roomId);
    await updateDoc(userRoomRef, {
      lastAccessed: serverTimestamp()
    });
    
  } catch (error) {
    console.error('Error updating user room activity:', error);
  }
}, 30000); // Throttle to once every 30 seconds

// Get user rooms with caching
export async function getUserRooms(userId: string) {
  try {
    // First check if the user has a cache invalidation marker
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const cacheInvalidatedAt = userData?.cacheInvalidatedAt;
      
      // If we have a cached entry, check if it needs to be invalidated
      const cachedRooms = userRoomsCache.get(userId);
      if (cachedRooms && cacheInvalidatedAt) {
        // Convert Firestore timestamp to milliseconds for comparison
        const invalidationTime = 
          cacheInvalidatedAt instanceof Timestamp 
            ? cacheInvalidatedAt.toMillis() 
            : cacheInvalidatedAt?.seconds ? cacheInvalidatedAt.seconds * 1000 : 0;
            
        // If cache was created before invalidation, clear it
        if (invalidationTime > cachedRooms.timestamp) {
          console.log('Cache invalidated, clearing user rooms cache for', userId);
          userRoomsCache.delete(userId);
        }
      }
    }
  
    // Check cache after potential invalidation check
    const cachedRooms = userRoomsCache.get(userId);
    if (cachedRooms && isCacheValid(cachedRooms)) {
      console.log('Using cached user rooms for', userId);
      return cachedRooms.data;
    }
  
    console.log('Fetching user rooms from Firestore for', userId);
    const roomsRef = collection(db, 'users', userId, 'rooms');
    const roomsQuery = query(roomsRef);
    const querySnapshot = await getDocs(roomsQuery);
    
    const rooms: any[] = [];
    querySnapshot.forEach((doc) => {
      rooms.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Cache the results
    userRoomsCache.set(userId, {
      data: rooms,
      timestamp: Date.now()
    });
    
    return rooms;
  } catch (error) {
    console.error('Error getting user rooms:', error);
    return [];
  }
}

// Create a new room with optimized batched writes
export async function createNewRoom(roomName: string, userId: string): Promise<string> {
  if (!userId) {
    console.error('User ID is required to create a room');
    throw new Error('User ID is required');
  }
  
  try {
    // Generate a unique room ID using timestamp and random string
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const roomId = `room_${timestamp}_${randomSuffix}`;
    
    // Create a batch for multiple operations
    const batch = writeBatch(db);
    
    // Create the room document with userIds array instead of users array
    const roomRef = doc(db, 'rooms', roomId);
    batch.set(roomRef, {
      roomId,
      name: roomName,
      createdBy: userId,
      createdAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
      userIds: [userId], // Array of user IDs currently in the room
      isActive: true
    });
    
    // Add user details to the room's users subcollection
    const userRef = doc(db, 'rooms', roomId, 'users', userId);
    batch.set(userRef, {
      id: userId,
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      isCreator: true
    });
    
    // Also add room to user's rooms collection
    const userRoomRef = doc(db, 'users', userId, 'rooms', roomId);
    batch.set(userRoomRef, {
      roomId,
      name: roomName,
      joinedAt: serverTimestamp(),
      lastVisited: serverTimestamp(),
      isCreator: true
    });
    
    // Execute all operations as a batch
    await batch.commit();
    
    // Clear any cached room data
    clearRoomCache(roomId);
    
    // Also clear the user's rooms cache so they immediately see the new room
    userRoomsCache.delete(userId);
    
    return roomId;
  } catch (error) {
    console.error('Error creating new room:', error);
    throw error;
  }
}

// Set up collaboration in the workspace with per-block synchronization
export function setupBlocklySync(workspace: any, ydoc: Y.Doc, options?: {blockly: any}) {
  // Get the Blockly instance from options - make sure we access it safely
  const Blockly = options?.blockly;
  if (!Blockly) {
    console.error('Blockly is required for setupBlocklySync');
    return () => {};
  }
  
  console.log('Setting up per-block synchronization');
  
  // Create shared data structures
  const sharedBlocks = ydoc.getMap('blocks');
  const sharedBlocksData = ydoc.getMap('blocksData');
  const sharedConnections = ydoc.getMap('connections');
  const sharedWorkspaceState = ydoc.getMap('workspaceState');
  
  // Track local changes to avoid loops
  let isApplyingRemoteChanges = false;
  
  // Helper to serialize a block to a simple object
  const serializeBlock = (block: any) => {
    if (!block) return null;
    
    try {
      // Get basic block data
      const blockData: any = {
        id: block.id,
        type: block.type,
        x: block.getRelativeToSurfaceXY().x,
        y: block.getRelativeToSurfaceXY().y,
        fields: {},
        inputs: {},
        collapsed: block.isCollapsed(),
        disabled: block.disabled,
        deletable: block.isDeletable(),
        movable: block.isMovable(),
        editable: block.isEditable(),
      };
      
      // Get field values
      if (block.inputList) {
        block.inputList.forEach((input: any) => {
          if (input.fieldRow) {
            input.fieldRow.forEach((field: any) => {
              if (field.name && field.getValue) {
                blockData.fields[field.name] = field.getValue();
              }
            });
          }
        });
      }
      
      // Get connections
      if (block.previousConnection) {
        const targetBlock = block.previousConnection.targetBlock();
        if (targetBlock) {
          blockData.previousConnection = targetBlock.id;
        }
      }
      
      if (block.nextConnection) {
        const targetBlock = block.nextConnection.targetBlock();
        if (targetBlock) {
          blockData.nextConnection = targetBlock.id;
        }
      }
      
      // Handle input connections
      if (block.inputList) {
        block.inputList.forEach((input: any) => {
          if (input.connection && input.connection.targetBlock()) {
            blockData.inputs[input.name] = input.connection.targetBlock().id;
          }
        });
      }
      
      return blockData;
    } catch (error) {
      console.error('Error serializing block:', error);
      return null;
    }
  };
  
  // Helper to create a block from serialized data
  const deserializeBlock = (blockData: any) => {
    if (!blockData || !workspace) return null;
    
    try {
      // Check if block already exists
      let block = workspace.getBlockById(blockData.id);
      
      // If block doesn't exist, create it
      if (!block) {
        block = workspace.newBlock(blockData.type, blockData.id);
        block.initSvg();
        block.render();
      }
      
      // Set position
      block.moveBy(blockData.x - block.getRelativeToSurfaceXY().x, 
                  blockData.y - block.getRelativeToSurfaceXY().y);
      
      // Set fields
      for (const fieldName in blockData.fields) {
        const field = block.getField(fieldName);
        if (field && field.setValue) {
          field.setValue(blockData.fields[fieldName]);
        }
      }
      
      // Set state
      if (blockData.collapsed) block.setCollapsed(true);
      if (blockData.disabled) block.setDisabled(true);
      block.setDeletable(blockData.deletable);
      block.setMovable(blockData.movable);
      block.setEditable(blockData.editable);
      
      return block;
    } catch (error) {
      console.error('Error deserializing block:', error);
      return null;
    }
  };
  
  // Helper to connect blocks based on connection data
  const connectBlocks = () => {
    const connectionData = sharedConnections.toJSON();
    
    for (const blockId in connectionData) {
      const connections = connectionData[blockId];
      const block = workspace.getBlockById(blockId);
      
      if (!block) continue;
      
      // Handle previous connection
      if (connections.previous) {
        const targetBlock = workspace.getBlockById(connections.previous);
        if (targetBlock && block.previousConnection && targetBlock.nextConnection) {
          block.previousConnection.connect(targetBlock.nextConnection);
        }
      }
      
      // Handle next connection
      if (connections.next) {
        const targetBlock = workspace.getBlockById(connections.next);
        if (targetBlock && block.nextConnection && targetBlock.previousConnection) {
          block.nextConnection.connect(targetBlock.previousConnection);
        }
      }
      
      // Handle input connections
      for (const inputName in connections.inputs) {
        const targetBlockId = connections.inputs[inputName];
        const targetBlock = workspace.getBlockById(targetBlockId);
        const input = block.getInput(inputName);
        
        if (targetBlock && input && input.connection) {
          const targetConnection = targetBlock.outputConnection || 
                                  targetBlock.previousConnection;
          if (targetConnection) {
            input.connection.connect(targetConnection);
          }
        }
      }
    }
  };
  
  // Sync the entire workspace initially or when needed
  const syncFullWorkspace = () => {
    if (isApplyingRemoteChanges) return;
    
    try {
      isApplyingRemoteChanges = true;
      
      // Clear shared data
      sharedBlocks.clear();
      sharedBlocksData.clear();
      sharedConnections.clear();
      
      // Get all blocks
      const blocks = workspace.getAllBlocks(false);
      
      // First pass: serialize all blocks
      blocks.forEach((block: any) => {
        const blockData = serializeBlock(block);
        if (blockData) {
          sharedBlocks.set(block.id, true);
          sharedBlocksData.set(block.id, blockData);
        }
      });
      
      // Second pass: store connections
      blocks.forEach((block: any) => {
        const connections: any = { inputs: {} };
        
        // Previous connection
        if (block.previousConnection && block.previousConnection.targetBlock()) {
          connections.previous = block.previousConnection.targetBlock().id;
        }
        
        // Next connection
        if (block.nextConnection && block.nextConnection.targetBlock()) {
          connections.next = block.nextConnection.targetBlock().id;
        }
        
        // Input connections
        if (block.inputList) {
          block.inputList.forEach((input: any) => {
            if (input.connection && input.connection.targetBlock()) {
              connections.inputs[input.name] = input.connection.targetBlock().id;
            }
          });
        }
        
        sharedConnections.set(block.id, connections);
      });
      
      // Store workspace state (viewport, etc.)
      const metrics = workspace.getMetrics();
      if (metrics) {
        sharedWorkspaceState.set('viewportLeft', metrics.viewLeft);
        sharedWorkspaceState.set('viewportTop', metrics.viewTop);
        sharedWorkspaceState.set('scale', workspace.scale);
      }
      
      console.log('Synchronized full workspace with', blocks.length, 'blocks');
    } catch (error) {
      console.error('Error syncing full workspace:', error);
    } finally {
      isApplyingRemoteChanges = false;
    }
  };
  
  // Apply remote changes to the workspace
  const applyRemoteChanges = () => {
    if (isApplyingRemoteChanges) return;
    
    try {
      isApplyingRemoteChanges = true;
      
      // Temporarily disable events
      workspace.setResizesEnabled(false);
      Blockly.Events.disable();
      
      // Clear workspace
      workspace.clear();
      
      // Create all blocks first
      const blockIds = Array.from(sharedBlocksData.keys());
      blockIds.forEach(blockId => {
        const blockData = sharedBlocksData.get(blockId);
        if (blockData) {
          deserializeBlock(blockData);
        }
      });
      
      // Then connect blocks
      connectBlocks();
      
      // Apply workspace state
      const viewportLeft = sharedWorkspaceState.get('viewportLeft');
      const viewportTop = sharedWorkspaceState.get('viewportTop');
      const scale = sharedWorkspaceState.get('scale');
      
      if (viewportLeft !== undefined && viewportTop !== undefined) {
        workspace.scroll(viewportLeft, viewportTop);
      }
      
      if (scale !== undefined && typeof workspace.setScale === 'function') {
        workspace.setScale(scale);
      }
      
      console.log('Applied remote changes with', blockIds.length, 'blocks');
    } catch (error) {
      console.error('Error applying remote changes:', error);
    } finally {
      // Re-enable events
      workspace.setResizesEnabled(true);
      Blockly.Events.enable();
      isApplyingRemoteChanges = false;
    }
  };
  
  // Initialize workspace if shared data is empty
  if (sharedBlocks.size === 0) {
    console.log('Initializing shared workspace data');
    syncFullWorkspace();
  } else {
    console.log('Applying existing shared workspace data');
    applyRemoteChanges();
  }
  
  // Listen for changes to the workspace
  const changeListener = (event: any) => {
    if (isApplyingRemoteChanges) return;
    
    try {
      // Handle different types of events
      if (event.type === Blockly.Events.BLOCK_CREATE) {
        const block = workspace.getBlockById(event.blockId);
        if (block) {
          const blockData = serializeBlock(block);
          if (blockData) {
            sharedBlocks.set(block.id, true);
            sharedBlocksData.set(block.id, blockData);
          }
        }
      } else if (event.type === Blockly.Events.BLOCK_DELETE) {
        sharedBlocks.delete(event.blockId);
        sharedBlocksData.delete(event.blockId);
        sharedConnections.delete(event.blockId);
      } else if (event.type === Blockly.Events.BLOCK_CHANGE || 
                event.type === Blockly.Events.BLOCK_MOVE) {
        const block = workspace.getBlockById(event.blockId);
        if (block) {
          const blockData = serializeBlock(block);
          if (blockData) {
            sharedBlocksData.set(block.id, blockData);
            
            // Update connections
            const connections: any = { inputs: {} };
            
            if (block.previousConnection && block.previousConnection.targetBlock()) {
              connections.previous = block.previousConnection.targetBlock().id;
            }
            
            if (block.nextConnection && block.nextConnection.targetBlock()) {
              connections.next = block.nextConnection.targetBlock().id;
            }
            
            if (block.inputList) {
              block.inputList.forEach((input: any) => {
                if (input.connection && input.connection.targetBlock()) {
                  connections.inputs[input.name] = input.connection.targetBlock().id;
                }
              });
            }
            
            sharedConnections.set(block.id, connections);
          }
        }
      } else if (event.type === Blockly.Events.VIEWPORT_CHANGE) {
        const metrics = workspace.getMetrics();
        if (metrics) {
          sharedWorkspaceState.set('viewportLeft', metrics.viewLeft);
          sharedWorkspaceState.set('viewportTop', metrics.viewTop);
          sharedWorkspaceState.set('scale', workspace.scale);
        }
      }
    } catch (error) {
      console.error('Error handling workspace change:', error);
    }
  };
  
  // Observe changes to shared data
  const blocksObserver = (event: Y.YMapEvent<any>) => {
    if (event.transaction.local) return;
    applyRemoteChanges();
  };
  
  const blocksDataObserver = (event: Y.YMapEvent<any>) => {
    if (event.transaction.local) return;
    applyRemoteChanges();
  };
  
  const connectionsObserver = (event: Y.YMapEvent<any>) => {
    if (event.transaction.local) return;
    applyRemoteChanges();
  };
  
  const workspaceStateObserver = (event: Y.YMapEvent<any>) => {
    if (event.transaction.local) return;
    
    try {
      // Only update viewport if not editing
      if (!Blockly.draggingConnections_) {
        const viewportLeft = sharedWorkspaceState.get('viewportLeft');
        const viewportTop = sharedWorkspaceState.get('viewportTop');
        const scale = sharedWorkspaceState.get('scale');
        
        if (viewportLeft !== undefined && viewportTop !== undefined) {
          workspace.scroll(viewportLeft, viewportTop);
        }
        
        if (scale !== undefined && typeof workspace.setScale === 'function') {
          workspace.setScale(scale);
        }
      }
    } catch (error) {
      console.error('Error applying workspace state:', error);
    }
  };
  
  // Add observers and listeners
  sharedBlocks.observe(blocksObserver);
  sharedBlocksData.observe(blocksDataObserver);
  sharedConnections.observe(connectionsObserver);
  sharedWorkspaceState.observe(workspaceStateObserver);
  workspace.addChangeListener(changeListener);
  
  // Return cleanup function
  return () => {
    workspace.removeChangeListener(changeListener);
    sharedBlocks.unobserve(blocksObserver);
    sharedBlocksData.unobserve(blocksDataObserver);
    sharedConnections.unobserve(connectionsObserver);
    sharedWorkspaceState.unobserve(workspaceStateObserver);
  };
}

// Set up cursor tracking between users
export function setupCursorTracking(workspace: any, ydoc: Y.Doc, provider: any, user: any) {
  if (!workspace || !ydoc || !provider) {
    console.warn('Missing required parameters for cursor tracking');
    return () => {};
  }
  
  console.log('Setting up cursor tracking with user:', user);
  
  // Map to store cursor elements for each user
  const cursors = new Map();
  
  // Create a room status element to show who's in the room
  const createRoomStatusElement = () => {
    const statusDiv = document.createElement('div');
    statusDiv.id = 'blockly-room-status';
    statusDiv.style.position = 'absolute';
    statusDiv.style.top = '8px';
    statusDiv.style.right = '8px';
    statusDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    statusDiv.style.color = 'white';
    statusDiv.style.padding = '8px 12px';
    statusDiv.style.borderRadius = '4px';
    statusDiv.style.zIndex = '1000';
    statusDiv.style.maxWidth = '300px';
    statusDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    statusDiv.style.fontSize = '12px';
    statusDiv.innerHTML = '<div>Connected users:</div><div id="blockly-user-list"></div>';
    
    // Append to workspace container
    const injectionDiv = workspace.getInjectionDiv();
    if (injectionDiv) {
      injectionDiv.appendChild(statusDiv);
    } else {
      document.body.appendChild(statusDiv);
    }
    
    return statusDiv;
  };
  
  // Create the status element
  const statusElement = createRoomStatusElement();
  
  // Set local user information if provided
  if (user && provider.awareness) {
    const localState = provider.awareness.getLocalState() || {};
    console.log('Setting local awareness state for cursor tracking', user);
    
    // Ensure we have a valid color
    const userColor = user.color || getRandomColor();
    
    provider.awareness.setLocalState({
      ...localState,
      name: user.name || localState.name || 'Anonymous',
      email: user.email || localState.email || '',
      color: userColor,
      // Include cursor position if not already set
      cursor: localState.cursor || { x: 0, y: 0 }
    });
  }
  
  // Create and add a cursor element for a user
  const createCursor = (clientId: number, state: {
    name?: string;
    color?: string;
    cursor?: { x: number; y: number };
    email?: string;
  }) => {
    // Don't create cursor for current user
    if (clientId === provider.awareness.clientID) return;
    
    console.log(`Creating cursor for user ${state.name || 'Unknown'} (${clientId})`, state);
    
    // Remove existing cursor if any
    removeCursor(clientId);
    
    if (!state.cursor) {
      console.warn(`User ${clientId} has no cursor position`);
      return;
    }
    
    try {
      // Create cursor element
      const cursorEl = document.createElement('div');
      cursorEl.className = 'blockly-cursor';
      cursorEl.style.position = 'absolute';
      cursorEl.style.width = '12px';
      cursorEl.style.height = '24px';
      cursorEl.style.backgroundColor = state.color || '#ff0000';
      cursorEl.style.zIndex = '1000';
      cursorEl.style.pointerEvents = 'none';
      cursorEl.style.transition = 'transform 0.1s ease-out, left 0.1s ease-out, top 0.1s ease-out';
      
      // Make cursor more visible with a border
      cursorEl.style.border = '2px solid white';
      cursorEl.style.boxShadow = '0 0 4px rgba(0,0,0,0.5)';
      
      // Add user label
      const label = document.createElement('div');
      label.className = 'blockly-cursor-label';
      label.textContent = state.name || 'User';
      label.style.position = 'absolute';
      label.style.bottom = '24px';
      label.style.left = '-4px';
      label.style.backgroundColor = state.color || '#ff0000';
      label.style.color = '#ffffff';
      label.style.padding = '2px 8px';
      label.style.borderRadius = '4px';
      label.style.fontSize = '12px';
      label.style.fontWeight = 'bold';
      label.style.whiteSpace = 'nowrap';
      label.style.boxShadow = '0 0 4px rgba(0,0,0,0.3)';
      
      cursorEl.appendChild(label);
      
      // Find the appropriate container - try to use the injection div
      const injectionDiv = workspace.getInjectionDiv();
      if (!injectionDiv) {
        console.error('Could not find Blockly injection div');
        return;
      }
      
      // Add to workspace
      injectionDiv.appendChild(cursorEl);
      
      // Store cursor element
      cursors.set(clientId, { element: cursorEl, state });
      
      // Update cursor position based on state
      updateCursorPosition(clientId);
      
      console.log(`Cursor created for user ${state.name || 'Unknown'} (${clientId})`);
    } catch (error) {
      console.error('Error creating cursor:', error);
    }
  };
  
  // Remove a cursor element
  const removeCursor = (clientId: number) => {
    const cursor = cursors.get(clientId);
    if (cursor && cursor.element) {
      cursor.element.remove();
      console.log(`Removed cursor for client ${clientId}`);
    }
    cursors.delete(clientId);
  };
  
  // Update cursor position based on workspace coordinates
  const updateCursorPosition = (clientId: number) => {
    const cursor = cursors.get(clientId);
    if (!cursor || !cursor.state.cursor) return;
    
    try {
      // Get cursor position from state
      const workspaceCoordinate = {
        x: cursor.state.cursor.x,
        y: cursor.state.cursor.y
      };
      
      // Check if we can translate workspace coordinates to screen coordinates
      if (workspace && typeof workspace.workspaceToPixels === 'function') {
        try {
          // Convert workspace coordinates to screen coordinates
          const screenCoordinates = workspace.workspaceToPixels(workspaceCoordinate);
          
          if (screenCoordinates && cursor.element) {
            cursor.element.style.left = `${screenCoordinates.x}px`;
            cursor.element.style.top = `${screenCoordinates.y}px`;
          }
        } catch (error) {
          console.warn('Error converting coordinates:', error);
          
          // Fallback: display coordinates directly
          if (cursor.element) {
            cursor.element.style.left = `${workspaceCoordinate.x}px`;
            cursor.element.style.top = `${workspaceCoordinate.y}px`;
          }
        }
      } else {
        // Fallback if workspaceToPixels is not available
        const injectionDiv = workspace.getInjectionDiv();
        if (injectionDiv && cursor.element) {
          // Get workspace scale and offset
          const scale = workspace.scale || 1;
          const metrics = workspace.getMetrics && workspace.getMetrics();
          const offsetX = metrics ? metrics.viewLeft || 0 : 0;
          const offsetY = metrics ? metrics.viewTop || 0 : 0;
          
          // Apply scale and offset manually
          const screenX = workspaceCoordinate.x * scale + offsetX;
          const screenY = workspaceCoordinate.y * scale + offsetY;
          
          cursor.element.style.left = `${screenX}px`;
          cursor.element.style.top = `${screenY}px`;
        }
      }
    } catch (error) {
      console.error('Error updating cursor position:', error);
    }
  };
  
  // Update the user list in the room status display
  const updateUserList = () => {
    const userListEl = document.getElementById('blockly-user-list');
    if (!userListEl) return;
    
    // Clear current list
    userListEl.innerHTML = '';
    
    // Get all users from awareness
    const states = provider.awareness.getStates();
    const users: any[] = [];
    
    // Convert map to array for easier processing
    states.forEach((state: any, clientId: number) => {
      if (state && state.name) {
        users.push({
          id: clientId,
          name: state.name,
          color: state.color || '#cccccc',
          isCurrentUser: clientId === provider.awareness.clientID
        });
      }
    });
    
    // Don't show anything if no users (shouldn't happen)
    if (users.length === 0) {
      userListEl.innerHTML = '<div>No users connected</div>';
      return;
    }
    
    // Create user elements
    users.forEach(user => {
      const userEl = document.createElement('div');
      userEl.style.display = 'flex';
      userEl.style.alignItems = 'center';
      userEl.style.marginTop = '4px';
      
      const colorDot = document.createElement('span');
      colorDot.style.display = 'inline-block';
      colorDot.style.width = '10px';
      colorDot.style.height = '10px';
      colorDot.style.borderRadius = '50%';
      colorDot.style.backgroundColor = user.color;
      colorDot.style.marginRight = '6px';
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = user.name + (user.isCurrentUser ? ' (you)' : '');
      nameSpan.style.fontWeight = user.isCurrentUser ? 'bold' : 'normal';
      
      userEl.appendChild(colorDot);
      userEl.appendChild(nameSpan);
      userListEl.appendChild(userEl);
    });
    
    // Update the count
    const countEl = statusElement.querySelector('div:first-child');
    if (countEl) {
      countEl.textContent = `Connected users (${users.length}):`;
    }
  };
  
  // Throttled mouse move handler to reduce network traffic
  const mouseMoveThrottled = throttle((e: any) => {
    try {
      // Only track if we have a valid workspace and provider
      if (!workspace || !provider.awareness || !provider.wsconnected) {
        return;
      }
      
      // Get screen coordinates
      const mouseEvent = e.getBrowserEvent ? e.getBrowserEvent() : e;
      const mouseX = mouseEvent.clientX;
      const mouseY = mouseEvent.clientY;
      
      // Create a point that we can transform
      let workspacePosition;
      
      try {
        // Try to create SVG point using Blockly's injectionDiv
        const injectionDiv = workspace.getInjectionDiv();
        const svg = injectionDiv.querySelector('svg');
        
        if (svg && typeof svg.createSVGPoint === 'function') {
          // Use SVG API to get workspace coordinates
          const svgPoint = svg.createSVGPoint();
          svgPoint.x = mouseX;
          svgPoint.y = mouseY;
          
          const matrix = svg.getScreenCTM()?.inverse();
          if (matrix) {
            workspacePosition = svgPoint.matrixTransform(matrix);
          } else {
            throw new Error('Could not get SVG matrix');
          }
        } else {
          throw new Error('SVG point creation not available');
        }
      } catch (error) {
        // Fallback to basic coordinate conversion
        const injectionDiv = workspace.getInjectionDiv();
        const rect = injectionDiv.getBoundingClientRect();
        const scale = workspace.scale || 1;
        const viewMetrics = workspace.getMetrics && workspace.getMetrics();
        
        // Calculate workspace coordinates
        const scrollLeft = viewMetrics ? viewMetrics.viewLeft : 0;
        const scrollTop = viewMetrics ? viewMetrics.viewTop : 0;
        
        workspacePosition = {
          x: (mouseX - rect.left) / scale + scrollLeft,
          y: (mouseY - rect.top) / scale + scrollTop
        };
      }
      
      if (workspacePosition) {
        // Update awareness with new cursor position
        const currentState = provider.awareness.getLocalState() || {};
        provider.awareness.setLocalState({
          ...currentState,
          cursor: {
            x: workspacePosition.x,
            y: workspacePosition.y
          }
        });
      }
    } catch (error) {
      console.error('Error tracking mouse position:', error);
    }
  }, 50); // Throttle to 50ms (20 updates per second)
  
  // Set up mouse tracking
  const onMouseMove = (e: any) => {
    mouseMoveThrottled(e);
  };
  
  // Add mouse move listener to workspace
  const injectionDiv = workspace.getInjectionDiv();
  if (injectionDiv) {
    injectionDiv.addEventListener('mousemove', onMouseMove);
  } else {
    console.warn('No injection div found for mouse tracking');
  }
  
  // Handle awareness changes (cursors, user info)
  const awarenessChangeHandler = (changes: { added: number[]; updated: number[]; removed: number[]; }) => {
    console.log('Awareness change detected:', changes);
    
    try {
      // Handle new or updated users
      [...changes.added, ...changes.updated].forEach(clientId => {
        const state = provider.awareness.getStates().get(clientId);
        if (state) {
          createCursor(clientId, state);
        }
      });
      
      // Handle removed users
      changes.removed.forEach(clientId => {
        removeCursor(clientId);
      });
      
      // Update the user list
      updateUserList();
    } catch (error) {
      console.error('Error handling awareness change:', error);
    }
  };
  
  // Subscribe to awareness changes
  provider.awareness.on('change', awarenessChangeHandler);
  
  // Initialize cursors for existing users
  provider.awareness.getStates().forEach((state: any, clientId: number) => {
    if (clientId !== provider.awareness.clientID) {
      createCursor(clientId, state);
    }
  });
  
  // Initial user list update
  updateUserList();
  
  // Log connection status changes
  const connectionStatusHandler = (connected: boolean) => {
    console.log('WebSocket connection status changed:', connected ? 'connected' : 'disconnected');
    
    // Update connection status in UI
    if (statusElement) {
      statusElement.style.backgroundColor = connected 
        ? 'rgba(0, 128, 0, 0.7)' 
        : 'rgba(255, 0, 0, 0.7)';
    }
    
    // Refresh user list when connection is established
    if (connected) {
      updateUserList();
    }
  };
  
  // Listen for connection status changes
  if (provider.on) {
    provider.on('status', connectionStatusHandler);
  }
  
  // Return cleanup function
  return () => {
    // Clean up elements
    cursors.forEach((cursor, clientId) => {
      if (cursor.element) cursor.element.remove();
    });
    
    // Remove status element
    if (statusElement) statusElement.remove();
    
    // Remove listeners
    if (injectionDiv) {
      injectionDiv.removeEventListener('mousemove', onMouseMove);
    }
    
    // Remove awareness handler
    provider.awareness.off('change', awarenessChangeHandler);
    
    // Remove connection status handler
    if (provider.off) {
      provider.off('status', connectionStatusHandler);
    }
  };
}

// Initialize collaboration for a specific room
export async function initCollaboration(
  roomId: string, 
  userIdentifier: string, 
  blocklyWorkspace: any,
  blockly: any
): Promise<any> {
  try {
    // Validate required parameters
    if (!roomId || !userIdentifier || !blocklyWorkspace) {
      console.error('Missing required parameters for initCollaboration');
      return {
        ydoc: null,
        provider: null,
        awareness: null,
        connected: false
      };
    }

    // Get room data from Firestore
    const roomData = await getCachedRoomData(roomId);
    if (!roomData) {
      console.error('Room not found');
      return {
        ydoc: null,
        provider: null,
        awareness: null,
        connected: false
      };
    }

    // Create Yjs document
    const ydoc = new Y.Doc();
    
    // Determine WebSocket URL based on environment
    let websocketUrl = '';
    if (typeof window !== 'undefined') {
      const isProduction = process.env.NODE_ENV === 'production';
      websocketUrl = isProduction 
        ? 'wss://blockly-websocket-server.onrender.com' 
        : 'ws://localhost:1234';
      
      console.log(`Using WebSocket URL: ${websocketUrl}`);
    }

    // Create custom WebSocket provider with explicit URL construction
    console.log('Creating custom WebSocket provider');
    
    // Format the room ID to be compatible with the WebSocket server
    // Remove the room_ prefix if it exists as the server may not expect it
    const formattedRoomId = roomId.startsWith('room_') 
      ? roomId.substring(5) // Remove 'room_' prefix
      : roomId;
    
    let provider: WebsocketProvider | null = null;
    
    try {
      provider = new WebsocketProvider(
        websocketUrl, // Use base URL without any path
        formattedRoomId, // Set the room ID directly as the room name
        ydoc,
        { connect: true }
      );
      
      console.log('WebSocket connection attempt with room ID:', formattedRoomId);
      
      // Try to log the full URL that will be constructed
      console.log('Expected WebSocket URL:', websocketUrl + '/' + formattedRoomId);
      
      // Add enhanced debugging
      provider.on('status', (event: { status: "connected" | "disconnected" | "connecting" }) => {
        console.log(`WebSocket connection status: ${event.status}`);
      });
      
      provider.on('connection-error', (event: Event) => {
        console.error('WebSocket connection error', event);
        
        // Log the actual WebSocket URL used (most important debugging info)
        const wsInstance = (provider as any)._ws;
        if (wsInstance) {
          console.log('Actual WebSocket URL used:', wsInstance.url);
        }
      });
      
      provider.on('connection-close', (event: CloseEvent | null, provider: WebsocketProvider) => {
        if (event) {
          console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        } else {
          console.log('WebSocket connection closed (no event details)');
        }
      });
      
      // Ensure provider is connected before continuing
      if (!provider.wsconnected) {
        console.log('Explicitly connecting WebSocket provider');
        provider.connect();
      }
    } catch (error) {
      console.error('Error creating WebSocket provider:', error);
    }
    
    // Create user awareness with explicit association to the provider
    const awareness = provider ? provider.awareness : new Awareness(ydoc);
    
    // Set initial user state with color and name - always do this even if provider isn't available
    const userName = userIdentifier;
    const userColor = getRandomColor();
    
    awareness.setLocalState({
      name: userName,
      color: userColor,
      // Initialize with current cursor position to make it visible immediately
      cursor: { x: 0, y: 0 }
    });
    
    // Log awareness state for debugging
    console.log('Local awareness state set:', {
      name: userName,
      color: userColor,
      clientId: awareness.clientID
    });
    
    // Explicitly sync awareness state if connected
    if (provider && provider.wsconnected) {
      console.log('Syncing awareness states');
      provider.awareness.setLocalStateField('presence', { status: 'online' });
    }
    
    // Return the document, provider, and connection status
    return {
      ydoc,
      provider,
      awareness,
      connected: provider ? provider.wsconnected : false,
      blockly
    };
  } catch (error) {
    console.error('Error initializing collaboration:', error);
    return {
      ydoc: null,
      provider: null,
      awareness: null,
      connected: false
    };
  }
}

// Register user presence in a room
// Debounced to reduce Firestore writes 
export const registerUserPresence = debounce(async (roomId: string, userId: string, userName: string, userEmail: string) => {
  if (!roomId || !userId) return;
  
  try {
    // Check if room exists
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);
    
    if (!roomDoc.exists()) {
      console.error('Room not found');
      return;
    }
    
    // Update user's last accessed time for this room (throttled)
    updateUserRoomActivityThrottled(userId, roomId);
    
    // Add this user to the room's userIds array if not already there
    await updateDoc(roomRef, {
      userIds: arrayUnion(userId),
      lastActivity: serverTimestamp()
    });
    
    // Store user details in a separate users collection document
    // This avoids array field manipulation which is expensive in Firestore
    const userRef = doc(db, 'rooms', roomId, 'users', userId);
    await setDoc(userRef, {
      id: userId,
      name: userName || 'Anonymous',
      email: userEmail || '',
      joinedAt: serverTimestamp(),
      lastActive: serverTimestamp()
    }, { merge: true });
    
    // Clear cache to ensure fresh data
    clearRoomCache(roomId);
  } catch (error) {
    console.error('Error registering user presence:', error);
  }
}, 3000); // Debounce to reduce writes - only register once every 3 seconds

/**
 * Update room user list when a user joins or leaves
 * @param roomId Room ID
 * @param userId User ID
 * @param isPresent Boolean indicating if user is present (true) or left (false)
 */
export const updateRoomUserList = async (roomId: string, userId: string, isPresent: boolean): Promise<void> => {
  if (!roomId || !userId) return;

  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomDoc = await getDoc(roomRef);

    if (!roomDoc.exists()) {
      console.error(`Room ${roomId} does not exist`);
      return;
    }

    // Clear any cached data for this room
    clearRoomCache(roomId);

    if (isPresent) {
      // User is present, add to userIds if not already there
      await updateDoc(roomRef, {
        userIds: arrayUnion(userId),
        lastUpdated: serverTimestamp()
      });
    } else {
      // User has left, remove from userIds
      await updateDoc(roomRef, {
        userIds: arrayRemove(userId),
        lastUpdated: serverTimestamp()
      });
    }
  } catch (error) {
    console.error(`Error updating room user list for room ${roomId}:`, error);
    // Don't throw to avoid blocking the user from leaving
  }
};

// Helper to generate random name for anonymous users
function getRandomName() {
  const adjectives = ['Happy', 'Quick', 'Clever', 'Brave', 'Calm', 'Eager', 'Gentle', 'Jolly'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Wolf', 'Owl', 'Bear'];
  
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  
  return `${randomAdjective}${randomNoun}`;
}

// Helper to generate random color for user cursors
function getRandomColor() {
  const colors = [
    '#4285F4', // Google Blue
    '#EA4335', // Google Red
    '#FBBC05', // Google Yellow
    '#34A853', // Google Green
    '#8142FF', // Purple
    '#FF5722', // Deep Orange
    '#03A9F4', // Light Blue
    '#009688'  // Teal
  ];
  
  return colors[Math.floor(Math.random() * colors.length)];
}

// Type definitions for TypeScript
interface CollabSetup {
  ydoc: Y.Doc;
  provider: WebsocketProvider | null;
  awareness: Awareness;
  connected: boolean;
}
