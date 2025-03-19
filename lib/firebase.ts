// Firebase configuration
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getAuth, Auth, onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyCd5bfDfQdtkvLL7ggOU3oPT-2rcgIgNDQ",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "blockly-collab.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "blockly-collab",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "blockly-collab.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "551999513836",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:551999513836:web:fb8144d0a8765850e131c9"
};

// Initialize Firebase (only once)
let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

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
  
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase:", error);
  
  // We still need to define app and db to avoid errors
  // Just use the first app or initialize a new one
  try {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (e) {
    // If we can't initialize Firebase at all, create app objects to prevent crashes
    console.error("Critical Firebase initialization failure:", e);
    app = {} as FirebaseApp;
    db = {} as Firestore;
    auth = {} as Auth;
  }
}

// Authentication helpers
export const signIn = async (email: string, password: string) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message || 'Login failed' };
  }
};

export const signUp = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message || 'Sign up failed' };
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
    return { error: null };
  } catch (error: any) {
    return { error: error.message || 'Logout failed' };
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

export { app, db, auth };
