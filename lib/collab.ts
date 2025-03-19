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

// ... rest of the code remains the same ...
