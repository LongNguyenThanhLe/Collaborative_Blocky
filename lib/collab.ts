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

// Set up collaboration in the workspace
export function setupBlocklySync(workspace: any, ydoc: Y.Doc, options?: {blockly: any}) {
  // Get the Blockly instance from options - make sure we access it safely
  const Blockly = options?.blockly;
  if (!Blockly) {
    console.error('Blockly is required for setupBlocklySync');
    return () => {};
  }
  
  // Safely access Blockly methods
  const getBlocklyXml = (blockly: any) => {
    if (!blockly) return null;
    
    // Try different ways to access Blockly.Xml
    // This handles various ways Blockly might be bundled in production
    if (blockly.Xml && typeof blockly.Xml.workspaceToDom === 'function') {
      return blockly.Xml;
    } else if ((blockly as any).Xml && typeof (blockly as any).Xml.workspaceToDom === 'function') {
      return (blockly as any).Xml;
    } else if (typeof window !== 'undefined' && (window as any).Blockly && (window as any).Blockly.Xml) {
      return (window as any).Blockly.Xml;
    } else if (blockly.module && blockly.module.exports && blockly.module.exports.Xml) {
      // Handle CommonJS pattern
      return blockly.module.exports.Xml;
    }
    
    console.error('Unable to find Blockly.Xml methods in any expected location');
    return null;
  };

  const BlocklyXml = getBlocklyXml(Blockly);
  if (!BlocklyXml || typeof BlocklyXml.workspaceToDom !== 'function' || typeof BlocklyXml.domToText !== 'function') {
    console.error('Blockly.Xml methods not found. This can happen in production builds if Blockly is not properly imported.');
    return () => {};
  }
  
  // Create a shared XML map in the Yjs document
  const sharedBlocks = ydoc.getMap('blocks');
  
  // Initialize with current workspace if the shared document is empty
  if (sharedBlocks.size === 0 && workspace) {
    try {
      const xml = BlocklyXml.workspaceToDom(workspace);
      const xmlString = BlocklyXml.domToText(xml);
      sharedBlocks.set('current', xmlString);
    } catch (error) {
      console.error('Error initializing shared blocks:', error);
    }
  }
  
  // Observable for changes in the shared blocks
  const blockObserver = (event: Y.YMapEvent<any>) => {
    // Skip if we're the one making the change
    if (event.transaction.local) return;

    // Get the new XML content from the event
    if (event.changes.keys.has('current')) {
      try {
        const xmlString = sharedBlocks.get('current');
        if (!xmlString || !workspace) return;

        // Safely access Blockly XML methods with multiple fallbacks
        if (BlocklyXml && typeof BlocklyXml.textToDom === 'function') {
          const dom = BlocklyXml.textToDom(xmlString);
          
          // Carefully apply the changes to avoid disrupting the workspace
          workspace.setResizesEnabled(false); // temporarily disable resizes
          
          try {
            // Clear the workspace and load new content
            workspace.clear();
            if (typeof BlocklyXml.domToWorkspace === 'function') {
              BlocklyXml.domToWorkspace(dom, workspace);
            }
          } finally {
            workspace.setResizesEnabled(true); // re-enable resizes
          }
        } else if (typeof window !== 'undefined' && 
                   (window as any).Blockly && 
                   (window as any).Blockly.Xml) {
          // Alternative: try using global Blockly object if available
          const dom = (window as any).Blockly.Xml.textToDom(xmlString);
          workspace.setResizesEnabled(false);
          try {
            workspace.clear();
            (window as any).Blockly.Xml.domToWorkspace(dom, workspace);
          } finally {
            workspace.setResizesEnabled(true);
          }
        } else {
          console.error('Cannot apply changes: Blockly.Xml methods not available');
        }
      } catch (error) {
        console.error('Error applying workspace changes:', error);
      }
    }
  };
  
  // Observe changes to the shared blocks
  sharedBlocks.observe(blockObserver);
  
  // Update shared state when the workspace changes
  const workspaceChangeListener = (event: any) => {
    // Skip UI events and those caused by workspace loading
    if (event.type === 'ui' || event.isUiEvent || workspace.isDragging()) {
      return;
    }

    try {
      // Only update if BlocklyXml is available and workspace exists
      if (BlocklyXml && typeof BlocklyXml.workspaceToDom === 'function' && workspace) {
        const dom = BlocklyXml.workspaceToDom(workspace);
        
        // Make sure we can convert DOM to text
        if (typeof BlocklyXml.domToText === 'function') {
          const text = BlocklyXml.domToText(dom);
          // Update shared state without triggering our own observer
          sharedBlocks.set('current', text);
        } else if (typeof window !== 'undefined' && 
                  (window as any).Blockly && 
                  (window as any).Blockly.Xml && 
                  typeof (window as any).Blockly.Xml.domToText === 'function') {
          // Try using global Blockly if available
          const text = (window as any).Blockly.Xml.domToText(dom);
          sharedBlocks.set('current', text);
        } else {
          console.warn('Cannot update shared blocks: Blockly.Xml.domToText not available');
        }
      } else {
        console.warn('Cannot update shared blocks: Blockly.Xml.workspaceToDom not available');
      }
    } catch (error) {
      console.error('Error updating shared blocks:', error);
    }
  };
  
  // Set up change listener on the workspace
  workspace.addChangeListener(workspaceChangeListener);
  
  // Return cleanup function
  return () => {
    workspace.removeChangeListener(workspaceChangeListener);
    sharedBlocks.unobserve(blockObserver);
  };
}

// Set up cursor tracking between users
export function setupCursorTracking(workspace: any, ydoc: Y.Doc, provider: any, user: any) {
  if (!provider || !workspace || !user) {
    console.warn('Missing required parameters for cursor tracking');
    return () => {};
  }
  
  // Map to store cursor elements for each user
  const cursors = new Map();
  
  // Set local user information if provided
  if (user && provider.awareness) {
    const localState = provider.awareness.getLocalState() || {};
    provider.awareness.setLocalState({
      ...localState,
      name: user.name || localState.name || 'Anonymous',
      email: user.email || localState.email || '',
      color: user.color || localState.color || getRandomColor()
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
    
    // Remove existing cursor if any
    removeCursor(clientId);
    
    if (!state.cursor) return;
    
    try {
      // Create cursor element
      const cursorEl = document.createElement('div');
      cursorEl.className = 'blockly-cursor';
      cursorEl.style.position = 'absolute';
      cursorEl.style.width = '8px';
      cursorEl.style.height = '16px';
      cursorEl.style.backgroundColor = state.color || '#ff0000';
      cursorEl.style.zIndex = '100';
      cursorEl.style.pointerEvents = 'none';
      
      // Add user label
      const label = document.createElement('div');
      label.className = 'blockly-cursor-label';
      label.textContent = state.name || 'User';
      label.style.position = 'absolute';
      label.style.bottom = '16px';
      label.style.left = '0';
      label.style.backgroundColor = state.color || '#ff0000';
      label.style.color = '#ffffff';
      label.style.padding = '2px 4px';
      label.style.borderRadius = '2px';
      label.style.fontSize = '12px';
      label.style.whiteSpace = 'nowrap';
      
      cursorEl.appendChild(label);
      
      // Add to workspace
      workspace.getInjectionDiv().appendChild(cursorEl);
      
      // Store cursor element
      cursors.set(clientId, { element: cursorEl, state });
      
      // Update cursor position based on state
      updateCursorPosition(clientId);
    } catch (error) {
      console.error('Error creating cursor:', error);
    }
  };
  
  // Remove a cursor element
  const removeCursor = (clientId: number) => {
    const cursor = cursors.get(clientId);
    if (cursor && cursor.element) {
      cursor.element.remove();
    }
    cursors.delete(clientId);
  };
  
  // Update cursor position based on workspace coordinates
  const updateCursorPosition = (clientId: number) => {
    const cursor = cursors.get(clientId);
    if (!cursor || !cursor.state.cursor) return;
    
    try {
      // Safely create workspace coordinate
      let workspaceCoordinate;
      
      // Create a simple coordinate object as fallback
      workspaceCoordinate = {
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
          const { x: offsetX, y: offsetY } = workspace.getMetrics() || { x: 0, y: 0 };
          
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
  
  // Set up mouse tracking
  const onMouseMove = (e: any) => {
    try {
      // Only track if we have a valid workspace and provider
      if (!workspace || !provider.awareness) return;
      
      // Get screen coordinates
      const mouseEvent = e.getBrowserEvent ? e.getBrowserEvent() : e;
      const mouseX = mouseEvent.clientX;
      const mouseY = mouseEvent.clientY;
      
      // Create an SVG point safely
      let svgPoint;
      let matrix;
      let workspacePosition;
      
      try {
        // Try to create SVG point using Blockly's injectionDiv
        const injectionDiv = workspace.getInjectionDiv();
        const svg = injectionDiv.querySelector('svg');
        
        if (svg && typeof svg.createSVGPoint === 'function') {
          // Use SVG API to get workspace coordinates
          svgPoint = svg.createSVGPoint();
          svgPoint.x = mouseX;
          svgPoint.y = mouseY;
          
          matrix = svg.getScreenCTM().inverse();
          workspacePosition = svgPoint.matrixTransform(matrix);
        } else {
          // Fallback: calculate position manually
          const rect = injectionDiv.getBoundingClientRect();
          const scale = workspace.scale || 1;
          
          // Convert client coordinates to workspace coordinates
          workspacePosition = {
            x: (mouseX - rect.left) / scale,
            y: (mouseY - rect.top) / scale
          };
        }
      } catch (error) {
        console.warn('Error creating SVG point, using fallback:', error);
        
        // Fallback to basic coordinate conversion
        const injectionDiv = workspace.getInjectionDiv();
        const rect = injectionDiv.getBoundingClientRect();
        const scale = workspace.scale || 1;
        
        workspacePosition = {
          x: (mouseX - rect.left) / scale,
          y: (mouseY - rect.top) / scale
        };
      }
      
      // Update local user state with the cursor position
      const localState = provider.awareness.getLocalState() || {};
      provider.awareness.setLocalState({
        ...localState,
        cursor: workspacePosition
      });
    } catch (error) {
      console.error('Error in mouse move handler:', error);
    }
  };
  
  // Update dragging state
  const onStartDrag = (e: any) => {
    const localState = provider.awareness.getLocalState();
    if (localState) {
      provider.awareness.setLocalState({
        ...localState,
        draggingBlock: true
      });
    }
  };
  
  const onStopDrag = (e: any) => {
    const localState = provider.awareness.getLocalState();
    if (localState) {
      provider.awareness.setLocalState({
        ...localState,
        draggingBlock: false
      });
    }
  };
  
  // Handle awareness changes to update cursors
  const awarenessChangeHandler = (changes: Map<number, any>) => {
    try {
      // Get all states - safely handle it whether it's iterable or not
      const states = provider.awareness.getStates();
      
      // Handle states - try different approaches based on what's available
      if (states) {
        if (typeof states.forEach === 'function') {
          // If states has a forEach method, use it
          states.forEach((state: any, clientId: number) => {
            if (clientId !== provider.awareness.clientID && state && state.cursor) {
              createCursor(clientId, state);
            }
          });
        } else if (typeof states.entries === 'function') {
          // If states has entries method, convert to array and use forEach
          const entries = Array.from(states.entries()) as Array<[number, any]>;
          for (const entry of entries) {
            const clientId = entry[0];
            const state = entry[1];
            if (clientId !== provider.awareness.clientID && state && state.cursor) {
              createCursor(clientId, state);
            }
          }
        } else if (states instanceof Object) {
          // Fallback: try to treat states as a plain object
          Object.entries(states).forEach(([clientIdStr, state]) => {
            const clientId = parseInt(clientIdStr, 10);
            if (clientId !== provider.awareness.clientID && state && (state as any).cursor) {
              createCursor(clientId, state as any);
            }
          });
        } else {
          console.warn('Unable to iterate through awareness states');
        }
      }
      
      // Safely handle changes for disconnected users
      if (changes) {
        if (typeof changes.forEach === 'function') {
          // If changes has forEach method
          changes.forEach((change, clientId) => {
            if (change && change.user === null) removeCursor(clientId);
          });
        } else if (typeof changes.entries === 'function') {
          // If changes has entries method
          const entries = Array.from(changes.entries()) as Array<[number, any]>;
          for (const entry of entries) {
            const clientId = entry[0];
            const change = entry[1];
            if (change && change.user === null) removeCursor(clientId);
          }
        } else if (changes instanceof Object) {
          // Fallback: try to iterate through it as an object
          Object.entries(changes).forEach(([clientIdStr, change]) => {
            const clientId = parseInt(clientIdStr, 10);
            if (change && (change as any).user === null) removeCursor(clientId);
          });
        } else {
          console.warn('Changes object is not iterable with any known method');
        }
      }
    } catch (error) {
      console.error('Error in awareness change handler:', error);
    }
  };
  
  // Set up awareness handler
  provider.awareness.on('change', awarenessChangeHandler);
  
  // Set up workspace event listeners if we have access to the DOM
  if (typeof window !== 'undefined') {
    workspace.getInjectionDiv().addEventListener('mousemove', onMouseMove);
    
    // Listen for block drag events
    workspace.addChangeListener((e: any) => {
      // Check if Blockly.Events and BLOCK_DRAG exist before accessing
      if (Blockly?.Events?.BLOCK_DRAG && e.type === Blockly.Events.BLOCK_DRAG) {
        if (e.isStart) {
          onStartDrag(e);
        } else {
          onStopDrag(e);
        }
      }
    });
  }
  
  // Add window resize handler to update cursor positions
  const resizeHandler = () => {
    cursors.forEach((_, clientId) => {
      updateCursorPosition(clientId);
    });
  };
  
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', resizeHandler);
  }
  
  // Return cleanup function
  return () => {
    // Remove all cursors
    cursors.forEach((_, clientId) => {
      removeCursor(clientId);
    });
    
    // Remove event listeners
    provider.awareness.off('change', awarenessChangeHandler);
    
    if (typeof window !== 'undefined') {
      workspace.getInjectionDiv().removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resizeHandler);
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
        ? 'wss://blockly-collab-server.onrender.com' 
        : 'ws://localhost:1234';
      
      console.log(`Using WebSocket URL: ${websocketUrl}`);
    }

    // Create Yjs WebSocket provider with the room ID as the document name
    let provider: WebsocketProvider | null = null;
    
    try {
      // Format the room ID to be compatible with the WebSocket server
      // Remove the room_ prefix if it exists as the server may not expect it
      const formattedRoomId = roomId.startsWith('room_') 
        ? roomId.substring(5) // Remove 'room_' prefix
        : roomId;
        
      // For production, the WebSocketProvider may ignore paths in the base URL 
      // and simply append the room ID to the domain
      // Instead, we'll use the room name format that includes the path
      const isProduction = process.env.NODE_ENV === 'production';
      const finalRoomId = isProduction ? `yjs/${formattedRoomId}` : formattedRoomId;
        
      provider = new WebsocketProvider(
        websocketUrl,
        finalRoomId, // Include the path in the room ID if needed
        ydoc,
        { connect: true }
      );
      
      console.log('WebSocket provider initialized with room ID:', finalRoomId);
    } catch (error) {
      console.error('Error creating WebSocket provider:', error);
    }

    // Create user awareness
    const awareness = provider ? provider.awareness : new Awareness(ydoc);
    
    // Set initial user state with color and name
    const userName = userIdentifier;
    const userColor = getRandomColor();
    
    awareness.setLocalState({
      name: userName,
      color: userColor,
    });
    
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
