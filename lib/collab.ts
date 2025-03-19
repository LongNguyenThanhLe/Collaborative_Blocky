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

// Constants for caching and throttling
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes cache expiry
const USER_STATUS_DEBOUNCE = 30 * 1000; // 30 seconds debounce for user status updates
const USER_COUNT_UPDATE_INTERVAL = 60 * 1000; // Update user count once per minute
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Caches to reduce Firestore reads
const roomCache = new Map();
const userRoomsCache = new Map();

// Last update timestamps to reduce writes
const lastUserStatusUpdate = new Map();
const lastUserCountUpdate = new Map();

// Flag to track quota exceeded errors
let quotaExceeded = false;
let lastQuotaExceededTime = 0;

// Helper to check if we recently hit quota limits
const isQuotaExceeded = () => {
  const now = Date.now();
  // If quota was exceeded in the last 5 minutes, consider it still exceeded
  if (quotaExceeded && now - lastQuotaExceededTime < 5 * 60 * 1000) {
    return true;
  }
  quotaExceeded = false;
  return false;
};

// Helper to handle Firestore errors
const handleFirestoreError = (error: any, errorMessage: string) => {
  console.error(errorMessage, error);
  
  // Check for quota exceeded errors
  if (error.code === 'resource-exhausted') {
    quotaExceeded = true;
    lastQuotaExceededTime = Date.now();
    console.warn('Firebase quota exceeded. Using cached data where possible.');
    return 'quota-exceeded';
  }
  
  // Check for permission errors
  if (error.code === 'permission-denied') {
    console.warn('Firebase permission denied. User may not be authorized.');
    return 'permission-denied';
  }
  
  return 'error';
};

// Cache for room data to reduce Firestore reads
const roomDataCache = new Map<string, {data: any, timestamp: number}>();

/**
 * Get room data with caching to reduce Firestore reads
 */
export async function getCachedRoomData(roomId: string) {
  // Check cache first
  const cachedData = roomDataCache.get(roomId);
  const now = Date.now();
  
  // If we have valid cached data or quota is exceeded, use cache
  if ((cachedData && (now - cachedData.timestamp < CACHE_EXPIRY)) || isQuotaExceeded()) {
    console.log('Using cached room data');
    return cachedData?.data || null;
  }
  
  // Cache miss, fetch from Firestore
  try {
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);
    
    if (roomSnapshot.exists()) {
      const data = roomSnapshot.data();
      // Update cache with a longer expiry when quota is exceeded
      const expiry = isQuotaExceeded() ? CACHE_EXPIRY * 2 : CACHE_EXPIRY;
      roomDataCache.set(roomId, {data, timestamp: now, expiry});
      return data;
    }
    return null;
  } catch (error) {
    const errorType = handleFirestoreError(error, 'Error fetching room data:');
    
    // Return cached data even if expired in case of error
    if (errorType === 'quota-exceeded' && cachedData) {
      console.log('Using expired cache due to quota limit');
      return cachedData.data;
    }
    
    return null;
  }
}

/**
 * Get user rooms with caching to reduce Firestore reads
 */
export async function getUserRooms(userId: string) {
  if (!userId) return [];
  
  // Check cache first
  const cachedRooms = userRoomsCache.get(userId);
  const now = Date.now();
  
  // If we have valid cached data or quota is exceeded, use cache
  if ((cachedRooms && (now - cachedRooms.timestamp < CACHE_EXPIRY)) || isQuotaExceeded()) {
    console.log('Using cached user rooms');
    return cachedRooms?.data || [];
  }
  
  try {
    const userRoomsRef = collection(db, 'users', userId, 'rooms');
    // Only fetch maximum 20 most recently accessed rooms to limit data transfer
    const roomsQuery = query(userRoomsRef, limit(20));
    const snapshot = await getDocs(roomsQuery);
    
    const rooms = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));
    
    // Update cache
    userRoomsCache.set(userId, {data: rooms, timestamp: now});
    return rooms;
  } catch (error) {
    const errorType = handleFirestoreError(error, 'Error getting user rooms:');
    
    // Return cached data even if expired in case of error
    if (errorType === 'quota-exceeded' && cachedRooms) {
      return cachedRooms.data;
    }
    
    if (errorType === 'permission-denied') {
      console.warn('User may not be logged in or lacks permission to access rooms');
    }
    
    return [];
  }
}

/**
 * Update room user list with throttling to reduce writes
 */
export async function updateRoomUserList(roomId: string, userId: string, isJoining: boolean, userName: string = 'Anonymous User') {
  if (!roomId || !userId) return;
  
  const cacheKey = `${roomId}:${userId}`;
  const now = Date.now();
  const lastUpdate = lastUserStatusUpdate.get(cacheKey) || 0;
  
  // Throttle updates unless user is leaving (isJoining = false)
  if (isJoining && now - lastUpdate < USER_STATUS_DEBOUNCE) {
    console.log('Throttling user status update');
    return;
  }
  
  // Skip updates if quota is exceeded unless user is leaving
  if (isQuotaExceeded() && isJoining) {
    console.log('Skipping user status update due to quota limit');
    return;
  }
  
  try {
    // Update the timestamp
    lastUserStatusUpdate.set(cacheKey, now);
    
    const roomRef = doc(db, 'rooms', roomId);
    
    if (isJoining) {
      // User is joining - add them to the users object
      await updateDoc(roomRef, {
        [`users.${userId}`]: {
          name: userName,
          email: '',
          lastActive: serverTimestamp()
        }
      });
    } else {
      // User is leaving - mark them as inactive after a significant period
      const lastActiveThreshold = 10 * 60 * 1000; // 10 minutes
      const roomData = await getCachedRoomData(roomId);
      const lastActive = roomData?.users?.[userId]?.lastActive;
      
      // Only remove user if they've been inactive for a while
      if (lastActive && 
          (new Date().getTime() - (lastActive.toDate?.() || lastActive).getTime() > lastActiveThreshold)) {
        await updateDoc(roomRef, {
          [`users.${userId}`]: null
        });
      }
    }
    
    // Only update user count if needed
    await updateRoomUserCount(roomId);
  } catch (error) {
    handleFirestoreError(error, 'Error updating room user list:');
  }
}

/**
 * Update room user count with throttling
 */
async function updateRoomUserCount(roomId: string) {
  if (!roomId) return;
  
  const now = Date.now();
  const lastUpdate = lastUserCountUpdate.get(roomId) || 0;
  
  // Throttle updates to once per minute
  if (now - lastUpdate < USER_COUNT_UPDATE_INTERVAL) {
    console.log('Throttling user count update');
    return;
  }
  
  // Skip updates if quota is exceeded
  if (isQuotaExceeded()) {
    console.log('Skipping user count update due to quota limit');
    return;
  }
  
  try {
    // Update the timestamp
    lastUserCountUpdate.set(roomId, now);
    
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnapshot = await getDoc(roomRef);
    
    if (roomSnapshot.exists()) {
      const roomData = roomSnapshot.data();
      const users = roomData.users || {};
      
      // Count active users (seen in the last 5 minutes)
      const activeUsers = Object.values(users).filter((user: any) => 
        user.lastActive
      ).length;
      
      // Only update if count has changed significantly
      if (roomData.userCount !== activeUsers) {
        await updateDoc(roomRef, {
          userCount: activeUsers,
          lastUpdated: serverTimestamp()
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, 'Error updating room user count:');
  }
}

/**
 * Add a room to user history with checking to reduce writes
 */
export async function addRoomToUserHistory(userId: string, roomId: string, roomName: string) {
  if (!userId || !roomId) return;
  
  // Skip updates if quota is exceeded
  if (isQuotaExceeded()) {
    console.log('Skipping add to history due to quota limit');
    return;
  }
  
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
    
    // Clear user rooms cache to ensure fresh data on next request
    userRoomsCache.delete(userId);
  } catch (error) {
    handleFirestoreError(error, 'Error adding room to history:');
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
      if (now - lastUpdate > USER_STATUS_DEBOUNCE) {
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

/**
 * Sets up Blockly workspace synchronization with Yjs
 * @param workspace Blockly workspace instance
 * @param ydoc Yjs document
 * @param options Optional configuration with Blockly instance
 * @returns Cleanup function
 */
export function setupBlocklySync(workspace: any, ydoc: Y.Doc, options?: {blockly: any}) {
  // Get Blockly instance from options, required for operation
  const Blockly = options?.blockly;
  
  if (!Blockly) {
    console.error('Blockly is required for setupBlocklySync');
    return () => {}; // Return empty cleanup function
  }
  
  // Create a shared XML map in the Yjs document
  const sharedBlocks = ydoc.getMap('blocks');
  
  // Initialize with current workspace if the shared document is empty
  if (sharedBlocks.size === 0 && workspace) {
    try {
      const xml = Blockly.Xml.workspaceToDom(workspace);
      const xmlString = Blockly.Xml.domToText(xml);
      sharedBlocks.set('current', xmlString);
    } catch (error) {
      console.error('Error initializing shared blocks:', error);
    }
  }
  
  // Apply initial shared state if it exists
  if (sharedBlocks.get('current') && workspace) {
    try {
      const xml = Blockly.Xml.textToDom(sharedBlocks.get('current'));
      Blockly.Xml.clearWorkspaceAndLoadFromXml(xml, workspace);
    } catch (error) {
      console.error('Error applying initial shared state:', error);
    }
  }
  
  // Set up change listener on the workspace
  const changeListener = function(event: any) {
    // Only sync when we have events that change the workspace content
    if (event.type === Blockly.Events.BLOCK_CREATE ||
        event.type === Blockly.Events.BLOCK_DELETE ||
        event.type === Blockly.Events.BLOCK_CHANGE ||
        event.type === Blockly.Events.BLOCK_MOVE) {
      try {
        // Get current workspace as XML and update the shared doc
        const xml = Blockly.Xml.workspaceToDom(workspace);
        const xmlString = Blockly.Xml.domToText(xml);
        sharedBlocks.set('current', xmlString);
      } catch (error) {
        console.error('Error syncing workspace:', error);
      }
    }
  };
  
  // Listen for changes in the workspace
  workspace.addChangeListener(changeListener);
  
  // Listen for changes in the shared doc
  const observer = (event: Y.YMapEvent<any>) => {
    // Only apply changes from other users, not our own changes
    if (event.transaction.local) return;
    
    try {
      // Get the XML from the shared doc and apply to workspace
      const xmlString = sharedBlocks.get('current');
      if (xmlString) {
        const xml = Blockly.Xml.textToDom(xmlString);
        
        // Temporarily disable the change listener to prevent looping
        workspace.removeChangeListener(changeListener);
        
        // Clear and load the workspace
        Blockly.Xml.clearWorkspaceAndLoadFromXml(xml, workspace);
        
        // Re-enable the change listener
        workspace.addChangeListener(changeListener);
      }
    } catch (error) {
      console.error('Error applying shared changes:', error);
    }
  };
  
  // Observe changes to the shared blocks
  sharedBlocks.observe(observer);
  
  // Return cleanup function
  return () => {
    workspace.removeChangeListener(changeListener);
    sharedBlocks.unobserve(observer);
  };
}

/**
 * Sets up cursor tracking and visualization between users
 * @param workspace Blockly workspace instance
 * @param awareness Y.js awareness instance for presence
 * @returns Cleanup function
 */
export function setupCursorTracking(workspace: any, awareness: Awareness) {
  // Map to store cursor elements for each user
  const cursors = new Map();
  
  // Create and add a cursor element for a user
  const createCursor = (clientId: number, state: any) => {
    // Don't create cursor for current user
    if (clientId === awareness.clientID) return;
    
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
      const blocklyDiv = workspace.getInjectionDiv();
      blocklyDiv.appendChild(cursorEl);
      
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
      const workspaceCoordinate = new Blockly.utils.Coordinate(
        cursor.state.cursor.x,
        cursor.state.cursor.y
      );
      
      // Convert from workspace coordinates to screen coordinates
      const screenCoordinate = workspace.workspaceToPixels(workspaceCoordinate);
      
      // Update cursor position
      cursor.element.style.left = `${screenCoordinate.x}px`;
      cursor.element.style.top = `${screenCoordinate.y}px`;
      
      // If the user is dragging a block, show visual indicator
      if (cursor.state.draggingBlock) {
        cursor.element.classList.add('dragging-block');
      } else {
        cursor.element.classList.remove('dragging-block');
      }
    } catch (error) {
      console.error('Error updating cursor position:', error);
    }
  };
  
  // Track local mouse movements and update awareness
  const onMouseMove = (e: any) => {
    // Convert screen position to workspace coordinates
    const screenPosition = new Blockly.utils.Coordinate(e.clientX, e.clientY);
    const svgPoint = workspace.getinjectionDiv().createSVGPoint();
    svgPoint.x = screenPosition.x;
    svgPoint.y = screenPosition.y;
    
    try {
      // Get position in workspace coordinates
      const matrix = workspace.getCanvas().getScreenCTM().inverse();
      const workspacePosition = svgPoint.matrixTransform(matrix);
      
      // Update local state in awareness
      const localState = awareness.getLocalState();
      if (localState) {
        awareness.setLocalState({
          ...localState,
          cursor: {
            x: workspacePosition.x,
            y: workspacePosition.y
          }
        });
      }
    } catch (error) {
      // Silently ignore errors during mouse tracking
    }
  };
  
  // Update dragging state
  const onStartDrag = (e: any) => {
    const localState = awareness.getLocalState();
    if (localState) {
      awareness.setLocalState({
        ...localState,
        draggingBlock: true
      });
    }
  };
  
  const onStopDrag = (e: any) => {
    const localState = awareness.getLocalState();
    if (localState) {
      awareness.setLocalState({
        ...localState,
        draggingBlock: false
      });
    }
  };
  
  // Handle awareness changes to update cursors
  const awarenessChangeHandler = (changes: any) => {
    // Get all changes
    awareness.getStates().forEach((state, clientId) => {
      if (clientId !== awareness.clientID && state.cursor) {
        createCursor(clientId, state);
      }
    });
    
    // Handle removed users
    changes.removed.forEach((clientId: number) => {
      removeCursor(clientId);
    });
  };
  
  // Set up awareness handler
  awareness.on('change', awarenessChangeHandler);
  
  // Set up workspace event listeners if we have access to the DOM
  if (typeof window !== 'undefined') {
    const blocklyDiv = workspace.getInjectionDiv();
    blocklyDiv.addEventListener('mousemove', onMouseMove);
    
    // Listen for block drag events
    workspace.addChangeListener((e: any) => {
      if (e.type === Blockly.Events.BLOCK_DRAG) {
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
    awareness.off('change', awarenessChangeHandler);
    
    if (typeof window !== 'undefined') {
      const blocklyDiv = workspace.getInjectionDiv();
      if (blocklyDiv) {
        blocklyDiv.removeEventListener('mousemove', onMouseMove);
      }
      window.removeEventListener('resize', resizeHandler);
    }
  };
}

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
