// Firebase configuration
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  DocumentData,
  QueryDocumentSnapshot,
  DocumentSnapshot,
} from "firebase/firestore";
import {
  getAuth,
  Auth,
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updateProfile,
  UserCredential,
} from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyCd5bfDfQdtkvLL7ggOU3oPT-2rcgIgNDQ",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "blockly-c9aca.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "blockly-c9aca",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "blockly-c9aca.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "551999513836",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:551999513836:web:fb8144d0a8765850e131c9",
};

// Initialize Firebase (only once)
let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let googleProvider: GoogleAuthProvider;

try {
  // Check if Firebase has been initialized
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  // Initialize Firestore
  db = getFirestore(app);

  // Initialize Authentication
  auth = getAuth(app);

  // Initialize Google Auth Provider
  googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({
    prompt: "select_account",
  });

  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase:", error);

  // We still need to define app and db to avoid errors
  // Just use the first app or initialize a new one
  try {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
  } catch (e) {
    // If we can't initialize Firebase at all, create app objects to prevent crashes
    console.error("Critical Firebase initialization failure:", e);
    app = {} as FirebaseApp;
    db = {} as Firestore;
    auth = {} as Auth;
    googleProvider = {} as GoogleAuthProvider;
  }
}

// Cache for user data to reduce Firestore reads
const userCache = new Map<string, { data: DocumentData; timestamp: number }>();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes cache expiry

// Check if data in cache is still valid
const isCacheValid = (cacheEntry: {
  data: DocumentData;
  timestamp: number;
}) => {
  return Date.now() - cacheEntry.timestamp < CACHE_EXPIRY;
};

// Update profile for the current user
export async function updateUserProfile(profileData: {
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("No user is currently signed in");
  }

  try {
    await updateProfile(user, profileData);
    console.log("User profile updated successfully");

    // Update cache if it exists
    const cacheKey = `user_${user.uid}`;
    if (userCache.has(cacheKey)) {
      const cachedData = userCache.get(cacheKey);
      if (cachedData) {
        userCache.set(cacheKey, {
          data: {
            ...cachedData.data,
            displayName: profileData.displayName || cachedData.data.displayName,
            photoURL: profileData.photoURL || cachedData.data.photoURL,
          },
          timestamp: Date.now(),
        });
      }
    }

    return;
  } catch (error) {
    console.error("Error updating user profile:", error);
    throw error;
  }
}

// Get user data with caching to reduce Firestore reads
export async function getUserData(
  userId: string
): Promise<DocumentData | null> {
  const cacheKey = `user_${userId}`;

  // Check if we have valid cached data
  if (userCache.has(cacheKey)) {
    const cachedData = userCache.get(cacheKey);
    if (cachedData && isCacheValid(cachedData)) {
      console.log("Using cached user data");
      return cachedData.data;
    }
  }

  try {
    // No valid cache, fetch from Firestore
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      // Cache the result
      const userData = userSnap.data();
      userCache.set(cacheKey, {
        data: userData,
        timestamp: Date.now(),
      });
      return userData;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error fetching user data:", error);
    return null;
  }
}

// Authentication helpers
export const signIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message || "Login failed" };
  }
};

export const signUp = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message || "Sign up failed" };
  }
};

// Google sign-in - using popup method as primary since it works
export const signInWithGoogle = async () => {
  try {
    console.log("Firebase signInWithGoogle called");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
    });
    console.log("Google provider configured:", provider);

    // Try popup method first (since it works for this user)
    try {
      console.log("Attempting popup method...");
      const result = await signInWithPopup(auth, provider);
      console.log("Popup sign-in successful:", result.user.email);
      return { user: result.user, error: null };
    } catch (popupError: any) {
      console.log("Popup failed, trying redirect method:", popupError.message);

      // If popup fails, fallback to redirect
      console.log("Calling signInWithRedirect as fallback...");
      await signInWithRedirect(auth, provider);
      console.log("signInWithRedirect call completed");

      // Note: The result will be processed in the component using getRedirectResult
      return { user: null, error: null };
    }
  } catch (error: any) {
    console.error("Google sign-in error:", error);
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    return { user: null, error: error.message || "Google sign in failed" };
  }
};

// Alternative Google sign-in using popup (for when COOP headers are properly configured)
export const signInWithGooglePopup = async () => {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
    });

    // Try popup method
    const result = await signInWithPopup(auth, provider);
    return { user: result.user, error: null };
  } catch (error: any) {
    console.error("Google popup sign-in error:", error);

    // If popup fails, automatically fallback to redirect
    console.log("Popup failed, falling back to redirect method");
    return await signInWithGoogle();
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
    return { error: null };
  } catch (error: any) {
    return { error: error.message || "Logout failed" };
  }
};

// Get current user
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

// Note: For security, set up Firebase security rules in the Firebase console or use the rules file
// in the firestore-rules directory. The rules should be:
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      // Allow read/write access to authenticated users only
      allow read, write: if request.auth != null;
    }
  }
}
*/

// Test function to verify Firebase configuration
export const testFirebaseConfig = () => {
  console.log("=== Firebase Configuration Test ===");
  console.log("API Key:", firebaseConfig.apiKey ? "Set" : "Missing");
  console.log("Auth Domain:", firebaseConfig.authDomain);
  console.log("Project ID:", firebaseConfig.projectId);
  console.log("Auth instance:", auth ? "Initialized" : "Not initialized");
  console.log("Current user:", auth?.currentUser?.email || "None");
  console.log("=== End Configuration Test ===");
  return firebaseConfig;
};

// Direct test function for debugging
export const testGoogleRedirect = async () => {
  try {
    console.log("=== Direct Google Redirect Test ===");
    console.log("Auth instance:", auth);
    console.log("Current user before:", auth.currentUser);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: "select_account",
    });

    console.log("Provider created:", provider);
    console.log("Calling signInWithRedirect directly...");

    await signInWithRedirect(auth, provider);
    console.log(
      "signInWithRedirect completed (this line might not be reached due to redirect)"
    );
  } catch (error: any) {
    console.error("Direct redirect test error:", error);
    console.error("Error details:", error.code, error.message);
  }
};

export { app, db, auth, googleProvider };
