import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import { WebsocketProvider } from 'y-websocket';
import { 
  doc, getDoc, setDoc, onSnapshot, updateDoc, 
  collection, getDocs, addDoc, serverTimestamp,
  writeBatch, query, limit, where, Timestamp 
} from "firebase/firestore";
import { db } from './firebase';
import { auth } from './firebase';
import { onAuthStateChanged, getAuth } from 'firebase/auth';
// These imports are dynamically loaded at runtime
// We're just declaring the types here for TypeScript
declare const Blockly: any;

// Cache for room data to reduce Firestore reads
const roomCache = new Map<string, {data: any, timestamp: number}>();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes cache expiry
const USER_UPDATE_INTERVAL = 30 * 1000; // Only update user status every 30 seconds

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

// Room management interface
export interface Room {
  id: string;
  name: string;
  createdBy: string;
  createdAt: any;
  lastAccessed: any;
  userCount: number;
  users?: { [uid: string]: { name: string, email: string, lastActive: any } };
}

/**
 * Get room data with caching to reduce Firestore reads
 */
export async function getCachedRoomData(roomId: string) {
  // Check cache first
  const cachedData = roomCache.get(roomId);
  const now = Date.now();
  
  if (cachedData && (now - cachedData.timestamp < CACHE_EXPIRY)) {
    console.log('Using cached room data');
    return cachedData.data;
  }
  
  // Cache miss, fetch from Firestore
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);
    
    if (roomSnapshot.exists()) {
      const data = roomSnapshot.data();
      // Update cache
      roomCache.set(roomId, {data, timestamp: now});
      return data;
    }
    return null;
  } catch (error) {
    console.error('Error fetching room data:', error);
    // Return cached data even if expired in case of error
    return cachedData?.data || null;
  }
}

// Initialize collaboration for a specific room
export async function initCollaboration(roomId: string): Promise<CollabSetup> {
  // Create a new Yjs document
  const ydoc = new Y.Doc();
  
  // Create an awareness instance for this document
  const awareness = new Awareness(ydoc);
  
  // Set the local user state with a random name and color
  let userName = getRandomName();
  let userColor = getRandomColor();
  let userEmail = '';
  let userId = '';
  
  // Get current auth user
  const auth = getAuth();
  const currentUser = auth.currentUser;
  
  if (currentUser) {
    userEmail = currentUser.email || '';
    userId = currentUser.uid;
    userName = currentUser.displayName || userEmail.split('@')[0] || userName;
    
    // Add this room to user's history without blocking
    addRoomToUserHistory(userId, roomId, roomId).catch(console.error);
  }
  
  // Set awareness state with user information
  awareness.setLocalState({
    name: userName,
    email: userEmail,
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
      process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'wss://collaborative-blockly-ws.onrender.com' :
      'ws://localhost:1234';
      
    // For local development, fallback to localhost
    if (process.env.NODE_ENV === 'development') {
      serverUrl = 'ws://localhost:1234';
    }
    
    console.log(`Using WebSocket server: ${serverUrl}`);
    
    // Create WebSocket provider
    wsProvider = new WebsocketProvider(serverUrl, roomId, ydoc);
    
    // Update connections to room with debouncing to reduce Firestore writes
    let lastUpdate = 0;
    wsProvider.on('status', (event: { status: 'connecting' | 'connected' | 'disconnected' }) => {
      const now = Date.now();
      console.log(`WebSocket status: ${event.status}`);
      
      // Only update room state at most once every 30 seconds
      if (now - lastUpdate > USER_UPDATE_INTERVAL) {
        if (event.status === 'connected' && currentUser) {
          connected = true;
          // Update room status when connected, but without blocking
          updateRoomUserList(roomId, currentUser.uid, true).catch(console.error);
          lastUpdate = now;
        } else if (event.status === 'disconnected') {
          connected = false;
        }
      }
    });
    
    // Handle window unload to cleanly remove user from room
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        if (currentUser) {
          // Use navigator.sendBeacon for more reliable cleanup on page unload
          const roomUserUrl = `${process.env.NEXT_PUBLIC_API_URL || ''}/api/room-leave?roomId=${roomId}&userId=${currentUser.uid}`;
          navigator.sendBeacon(roomUserUrl);
        }
      });
    }
  } catch (error) {
    console.error('Error connecting to WebSocket server:', error);
    console.log('Falling back to local-only collaboration');
  }
  
  return { ydoc, provider: wsProvider, awareness, connected };
}

// Debounce function to limit rate of Firestore calls
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  return function(...args: any[]) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Add room to user's history with optimized writes
export async function addRoomToUserHistory(userId: string, roomId: string, roomName: string) {
  if (!userId) return null;
  
  try {
    // Get room data using cached function
    const roomData = await getCachedRoomData(roomId);
    
    // Limit writes to Firebase by checking if the room is already in history
    const userRoomsRef = doc(db, 'users', userId, 'rooms', roomId);
    const roomDoc = await getDoc(userRoomsRef);
    
    // Only write if the room doesn't exist or was last accessed more than 1 hour ago
    if (!roomDoc.exists() || 
        (roomDoc.data().lastAccessed && 
         new Date().getTime() - roomDoc.data().lastAccessed.toDate().getTime() > 3600000)) {
      
      await setDoc(userRoomsRef, {
        roomId,
        roomName: roomData?.name || roomName,
        lastAccessed: serverTimestamp(),
        userCount: roomData?.userCount || 1
      }, { merge: true });
    }
    
    return roomId;
  } catch (error) {
    console.error('Error adding room to history:', error);
    return null;
  }
}

// Function to get rooms the user has joined with efficient querying
export async function getUserRooms(userId: string) {
  if (!userId) return [];
  
  try {
    const userRoomsRef = collection(db, 'users', userId, 'rooms');
    // Only fetch maximum 20 most recently accessed rooms to limit data transfer
    const roomsQuery = query(userRoomsRef, limit(20));
    const snapshot = await getDocs(roomsQuery);
    
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));
  } catch (error) {
    console.error('Error getting user rooms:', error);
    // Show friendly error message if it's quota exceeded
    if (error instanceof Error && error.message.includes('quota exceeded')) {
      throw new Error('Firebase usage limit reached. Please try again later.');
    }
    return [];
  }
}

// Create a new room with batched write
export async function createNewRoom(roomName: string, userId: string): Promise<string> {
  if (!roomName || !userId) {
    throw new Error('Room name and user ID are required');
  }
  
  try {
    // Generate a unique room ID (can be customized for readability)
    const roomId = `room-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Get user information
    const auth = getAuth();
    const user = auth.currentUser;
    const userName = user?.displayName || user?.email?.split('@')[0] || 'Anonymous';
    const userEmail = user?.email || '';
    
    // Use a batch write to create both the room and user history entry
    const batch = writeBatch(db);
    
    // Initialize the room document
    const roomRef = doc(db, 'rooms', roomId);
    batch.set(roomRef, {
      id: roomId,
      name: roomName,
      createdBy: userId,
      createdAt: serverTimestamp(),
      lastAccessed: serverTimestamp(),
      userCount: 1,
      users: {
        [userId]: {
          name: userName,
          email: userEmail,
          lastActive: serverTimestamp()
        }
      }
    });
    
    // Add to user's room history in the same batch
    const userRoomRef = doc(db, 'users', userId, 'rooms', roomId);
    batch.set(userRoomRef, {
      roomId,
      roomName: roomName,
      lastAccessed: serverTimestamp(),
      userCount: 1
    });
    
    // Commit the batch
    await batch.commit();
    
    // Update the cache
    roomCache.set(roomId, {
      data: {
        id: roomId,
        name: roomName,
        createdBy: userId,
        lastAccessed: new Date(),
        userCount: 1,
        users: {
          [userId]: {
            name: userName,
            email: userEmail,
            lastActive: new Date()
          }
        }
      },
      timestamp: Date.now()
    });
    
    return roomId;
  } catch (error) {
    console.error('Error creating room:', error);
    if (error instanceof Error && error.message.includes('quota exceeded')) {
      throw new Error('Firebase usage limit reached. Please try again later.');
    }
    throw error;
  }
}

// Throttled function to update room user counts
const throttledUserCountUpdate = debounce(async (roomId: string, changeAmount: number) => {
  if (!roomId) return;
  
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);
    
    if (roomSnapshot.exists()) {
      const roomData = roomSnapshot.data();
      // Only update if the change is significant
      await updateDoc(roomRef, {
        userCount: Math.max(0, (roomData.userCount || 0) + changeAmount)
      });
    }
  } catch (error) {
    console.warn('Error updating room user count:', error);
  }
}, 60000); // Throttle to once per minute

// Update room user list with better caching and batching
export async function updateRoomUserList(roomId: string, userId: string, isJoining: boolean = true) {
  if (!roomId || !userId) return;
  
  try {
    // Get room data from cache first
    let roomData = await getCachedRoomData(roomId);
    
    // If room doesn't exist in cache, try Firestore
    if (!roomData) {
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnapshot = await getDoc(roomRef);
      
      if (!roomSnapshot.exists()) {
        // Room doesn't exist
        if (isJoining) {
          // Create room if joining
          await createNewRoom('Untitled Room', userId);
        }
        return;
      }
      
      roomData = roomSnapshot.data();
    }
    
    const auth = getAuth();
    const user = auth.currentUser;
    
    // Use a single document update instead of multiple field updates
    let updates: any = {};
    
    if (isJoining && user) {
      // Add user to room but don't update count every time
      // It's better to have slightly inaccurate counts than exceed quota
      updates = {
        lastAccessed: serverTimestamp(),
        [`users.${userId}`]: {
          name: user.displayName || user.email?.split('@')[0] || 'Anonymous',
          email: user.email || '',
          lastActive: serverTimestamp()
        }
      };
      
      // Throttle the user count updates to reduce writes
      throttledUserCountUpdate(roomId, 1);
    } else if (!isJoining) {
      // Don't remove the user on every disconnection, as they might reconnect
      // Instead, just mark them as inactive after a significant period
      const lastActiveThreshold = 10 * 60 * 1000; // 10 minutes
      const lastActive = roomData.users?.[userId]?.lastActive;
      
      // Only remove user if they've been inactive for a while
      if (lastActive && 
          (new Date().getTime() - (lastActive.toDate?.() || lastActive).getTime() > lastActiveThreshold)) {
        // Throttle the user count updates to reduce writes
        throttledUserCountUpdate(roomId, -1);
      }
    }
    
    // Only update if we have changes to make
    if (Object.keys(updates).length > 0) {
      const roomRef = doc(db, 'rooms', roomId);
      await updateDoc(roomRef, updates);
      
      // Update cache with new data
      if (roomCache.has(roomId)) {
        const cachedData = roomCache.get(roomId)!;
        roomCache.set(roomId, {
          data: { ...cachedData.data, ...updates },
          timestamp: Date.now()
        });
      }
    }
  } catch (error) {
    console.warn('Error updating room user list:', error);
    // Don't throw on quota errors, just log and continue
  }
}

// Get active users in a room with caching
export async function getRoomUsers(roomId: string) {
  if (!roomId) return [];
  
  try {
    // Use cached room data first
    const roomData = await getCachedRoomData(roomId);
    
    if (!roomData || !roomData.users) return [];
    
    // Convert users object to array
    return Object.entries(roomData.users).map(([id, userData]: [string, any]) => ({
      id,
      name: userData.name,
      email: userData.email,
      lastActive: userData.lastActive
    }));
  } catch (error) {
    console.error('Error getting room users:', error);
    return [];
  }
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
  userInfo?: { name?: string; email?: string; color?: string }
) {
  try {
    // Get the client ID
    const clientId = ydoc.clientID;
    
    // Set default user info if not provided
    const name = userInfo?.name || `User ${clientId}`;
    const email = userInfo?.email || '';
    const color = userInfo?.color || generateRandomColor(clientId);
    
    // Set local state with user info
    awareness.setLocalState({
      user: { 
        name: name || `User ${clientId}`, 
        email: email || '',
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
      nameEl.style.padding = '3px 8px';
      nameEl.style.borderRadius = '4px';
      nameEl.style.fontSize = '12px';
      nameEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      nameEl.style.whiteSpace = 'nowrap';
      nameEl.style.userSelect = 'none';
      nameEl.style.maxWidth = '150px';
      nameEl.style.overflow = 'hidden';
      nameEl.style.textOverflow = 'ellipsis';
      cursorEl.appendChild(nameEl);
      
      // Add email label
      const emailEl = document.createElement('div');
      emailEl.className = 'remote-cursor-email';
      emailEl.textContent = state.user.email;
      emailEl.style.position = 'absolute';
      emailEl.style.top = '-50px';
      emailEl.style.left = '15px';
      emailEl.style.backgroundColor = state.user.color;
      emailEl.style.color = 'white';
      emailEl.style.padding = '3px 8px';
      emailEl.style.borderRadius = '4px';
      emailEl.style.fontSize = '12px';
      emailEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      emailEl.style.whiteSpace = 'nowrap';
      emailEl.style.userSelect = 'none';
      emailEl.style.maxWidth = '150px';
      emailEl.style.overflow = 'hidden';
      emailEl.style.textOverflow = 'ellipsis';
      cursorEl.appendChild(emailEl);
      
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
