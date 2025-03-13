// Firebase configuration
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCd5bfDfQdtkvLL7ggOU3oPT-2rcgIgNDQ",
  authDomain: "blockly-collab.firebaseapp.com",
  projectId: "blockly-collab",
  storageBucket: "blockly-collab.firebasestorage.app",
  messagingSenderId: "551999513836",
  appId: "1:551999513836:web:fb8144d0a8765850e131c9"
};

// Initialize Firebase (only once)
let app: FirebaseApp;
let db: Firestore;

try {
  // Check if Firebase has been initialized
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  
  // Initialize Firestore
  db = getFirestore(app);
  
  console.log("Firebase initialized successfully");
} catch (error) {
  console.error("Error initializing Firebase:", error);
  
  // We still need to define app and db to avoid errors
  // Just use the first app or initialize a new one
  try {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (e) {
    // If we can't initialize Firebase at all, create an app object to prevent crashes
    console.error("Critical Firebase initialization failure:", e);
    app = {} as FirebaseApp;
    db = {} as Firestore;
  }
}

// Note: For security, set up Firebase security rules in the Firebase console or use the rules file
// in the firestore-rules directory. The rules should be:
/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      allow read, write: if true;
      
      match /users/{userId} {
        allow read, write: if true;
      }
      
      match /cursors/{cursorId} {
        allow read, write: if true;
      }
    }
  }
}
*/

export { app, db };
