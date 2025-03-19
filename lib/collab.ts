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
  // Check cache first
  const cachedRooms = userRoomsCache.get(userId);
  if (cachedRooms && isCacheValid(cachedRooms)) {
    console.log('Using cached user rooms for', userId);
    return cachedRooms.data;
  }
  
  try {
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
    
    return roomId;
  } catch (error) {
    console.error('Error creating new room:', error);
    throw error;
  }
}

// Set up collaboration in the workspace
// Removed unused Blockly parameter to fix build error
export function setupBlocklySync(workspace: any, ydoc: Y.Doc, options?: {blockly: any}) {
  const Blockly = options?.blockly;
  if (!Blockly) {
    console.error('Blockly is required for setupBlocklySync');
    return () => {};
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
    const svgPoint = workspace.getInjectionDiv().createSVGPoint();
    svgPoint.x = screenPosition.x;
    svgPoint.y = screenPosition.y;
    
    try {
      // Get position in workspace coordinates
      const matrix = workspace.getCanvas().getScreenCTM().inverse();
      const workspacePosition = svgPoint.matrixTransform(matrix);
      
      // Update local state in awareness
      const localState = provider.awareness.getLocalState();
      if (localState) {
        provider.awareness.setLocalState({
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
    // Get all changes
    provider.awareness.getStates().forEach((state: any, clientId: number) => {
      if (clientId !== provider.awareness.clientID && state.cursor) {
        createCursor(clientId, state);
      }
    });
    
    // Remove cursors for disconnected users
    changes.forEach((change, clientId) => {
      if (change.user === null) removeCursor(clientId);
    });
  };
  
  // Set up awareness handler
  provider.awareness.on('change', awarenessChangeHandler);
  
  // Set up workspace event listeners if we have access to the DOM
  if (typeof window !== 'undefined') {
    workspace.getInjectionDiv().addEventListener('mousemove', onMouseMove);
    
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
    provider.awareness.off('change', awarenessChangeHandler);
    
    if (typeof window !== 'undefined') {
      workspace.getInjectionDiv().removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resizeHandler);
    }
  };
}

// Initialize collaboration for a specific room
export async function initCollaboration(roomId: string, userIdentifier: string, blocklyWorkspace: any, blockly: any): Promise<any> {
  // Create a new Yjs document
  const ydoc = new Y.Doc();
  
  // Create an awareness instance for this document
  const awareness = new Awareness(ydoc);
  
  // Set the local user state with a random name and color
  let userName = getRandomName();
  let userColor = getRandomColor();
  let userEmail = '';
  let currentUserId = '';
  
  // Get current auth user
  const currentUser = auth.currentUser;
  
  if (currentUser) {
    userEmail = currentUser.email || '';
    currentUserId = currentUser.uid;
    userName = currentUser.displayName || userEmail.split('@')[0] || userName;
    
    // Add this room to user's history without blocking
    addRoomToUserHistory(currentUserId, roomId, roomId).catch(console.error);
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
          updateUserRoomActivityThrottled(currentUserId, roomId).catch(console.error);
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
  
  // Register user presence in Firestore
  try {
    // Get user info from authentication
    const auth = getAuth();
    let displayName = 'Anonymous';
    let email = '';
    
    if (auth.currentUser) {
      displayName = auth.currentUser.displayName || getRandomName();
      email = auth.currentUser.email || '';
    }
    
    // Register user presence in the room
    registerUserPresence(roomId, userIdentifier, displayName, email);
    
    // Also update the userIds array to ensure the user is in the room's user list
    await updateRoomUserList(roomId, userIdentifier, true);
  } catch (error) {
    console.error('Error registering user presence:', error);
  }
  
  return { ydoc, provider: wsProvider, awareness, connected };
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
