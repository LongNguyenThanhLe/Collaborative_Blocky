# BlocklyCollab Project Context

## Project Overview
BlocklyCollab is an enhanced version of Google's Blockly programming environment specifically designed to create virtual spaces where autistic youth can learn to code and collaborate through scaffolded, supportive interactions. The platform focuses on building collaboration skills in manageable stages, allowing users to code in shared projects while maintaining a carefully scaffolded separation of effort.

## Key Features
- Real-time collaboration with visual block-based programming
- User-specific cursor tracking and awareness
- Per-block synchronization for improved collaboration
- Scaffolded collaboration tools with clear boundaries
- Modern authentication system using Firebase
- Responsive design for different devices

## Technical Stack
- Frontend: Next.js 14.0.0 with TypeScript
- Block Programming: Blockly 10.4.3
- Real-time Collaboration: Yjs, Firebase
- Authentication: Firebase
- Deployment: Vercel

## Architecture
- **Pages**: React components for different routes (landing, login, workspace)
- **Components**: Reusable UI components including BlocklyWorkspace
- **Lib**: Utility functions including collaboration setup (collab.ts)
- **Styles**: CSS modules for component styling
- **Public**: Static assets

## Recent Changes
- **2025-03-18**: 
  - Added modern landing page with feature highlights
  - Created login and signup pages with UI/UX improvements
  - Implemented Firebase authentication system
  - Protected workspace route with Firebase authentication
  - Fixed collaboration issues: XML data errors, cursor appearance
  - Improved block serialization for better synchronization
  - Enhanced client-side rendering of Blockly workspace for production environment
  - Fixed provider null check in collaboration setup
  - Added debugging information and explicit workspace dimensions
  - Improved visibility of Blockly workspace in production environment
  - Converted from Clerk to Firebase Authentication for more reliable auth
  - Added native auth forms with Firebase integration
  - Implemented client-side auth state management
  - Updated UI for user identification and sign-out in workspace
- **2025-03-19**: 
  - Completely removed Clerk authentication from the application
  - Implemented Firebase authentication with email/password and Google sign-in
  - Updated login and signup pages with Google authentication buttons
  - Enhanced collaboration features with user identification
  - Added proper auth state management through Firebase
  - Updated middleware to handle Firebase authentication
  - Improved documentation for environment setup
  - Applied styling updates for authentication UI
  - Added room selection functionality with URL-based navigation
  - Enhanced workspace UI with modern dark header and status indicators
  - Improved real-time collaboration with better cursor tracking
  - Added user count and connection status display
  - Created new dashboard page for project management
  - Implemented advanced room management system
  - Added user avatars to display room participants
  - Optimized Firebase usage to prevent quota exceeded errors
  - Implemented caching system for Firestore reads
  - Reduced write operations with debouncing and batching
  - Added proper cleanup for user connections with navigator.sendBeacon
  - Created API endpoint for handling room leave events
  - Fixed COOP errors in authentication flow
  - Added missing collaboration functions (setupBlocklySync and setupCursorTracking) to fix build errors
  - Fixed function signatures to match component usage patterns
  - Enhanced error handling in collaboration setup
- **2025-03-20**:
  - Implemented file-based project management system
  - Created new projects.ts library for project handling
  - Added projects.tsx page for viewing and managing saved projects
  - Updated workspace.tsx to support loading projects by ID
  - Enhanced BlocklyWorkspace component to handle project XML loading
  - Added ability to save, load, and share projects
  - Created proper Firebase security rules for project collections
  - Fixed serverTimestamp issues in arrays for improved Firebase compatibility
  - Added links between dashboard and projects page
  - Fixed type errors related to Timestamp objects
  - Deployed project to Vercel production environment
  - Fixed WebSocket connection issues by updating the server URL from incorrect domain (blockly-collab-server) to the correct domain (blockly-websocket-server)
  - Updated server-side code to properly handle room IDs from URL paths
  - Added CORS support and improved error handling in WebSocket server
- **2025-03-21**:
  - Enhanced user signup flow to collect additional information (name and school)
  - Added updateUserProfile function to firebase.ts for proper profile management
  - Implemented comprehensive caching system in Firebase utility to reduce quota usage
  - Created an improved landing page with better feature descriptions and cleaner UI
  - Optimized Firebase reads and writes in collab.ts with advanced caching techniques
  - Implemented batch writes for related Firestore operations to improve performance
  - Added throttling and debouncing with lodash to minimize Firebase operations
  - Fixed various TypeScript errors throughout the application
- **2025-03-22**:
  - Fixed critical Blockly collaboration issues affecting production environment:
    - Enhanced setupBlocklySync to safely access Blockly.Xml methods with robust fallbacks
    - Implemented multiple safe access patterns to handle API differences between dev and production
    - Fixed awarenessChangeHandler to properly handle different types of awareness states and changes
    - Added robust SVG point creation in setupCursorTracking with multiple fallback methods
    - Improved cursor position calculation with workspace transformation fallbacks
    - Enhanced error handling throughout collaboration functions to provide better debugging
    - Fixed TypeScript type errors in the array handling for better type safety
    - Refactored initCollaboration for better error handling and to properly pass Blockly instance
  - Improved cache invalidation system for rooms and projects:
    - Fixed issue where newly created rooms wouldn't appear in user's room list until cache expired
    - Added cross-module cache invalidation between projects and rooms
    - Implemented Firestore-based cache invalidation markers to ensure UI consistency
    - Enhanced getUserRooms function to check for cache invalidation markers before using cached data
    - Added proper cleanup of cached state when creating new resources
    - Improved WebSocket connection handling with simplified room ID format

## Firebase Optimization
- Implemented in-memory cache for room data with 5-minute expiry
- Reduced Firestore reads by caching frequently accessed data
- Implemented debouncing for user status updates (30-second intervals)
- Throttled user count updates to once per minute 
- Used batch writes to create rooms and user history entries in one operation
- Consolidated room state in a single document structure
- Optimized error handling for quota exceeded errors
- Added navigator.sendBeacon for reliable cleanup when users leave
- Implemented comprehensive caching system in Firebase utility to reduce quota usage
- Optimized Firebase reads and writes in collab.ts with advanced caching techniques
- Implemented batch writes for related Firestore operations to improve performance
- Added throttling and debouncing with lodash to minimize Firebase operations
- Enhanced error handling for all Firestore operations
- Improved presence tracking to minimize Firebase database operations
- Updated user status tracking to be more bandwidth-efficient

## Project Management Features
- Dashboard page shows all projects a user has joined
- Each project has its own collaborative workspace (room)
- Projects display last access time and active user count
- Users can create new projects or join existing ones via room ID
- Room information is persisted in Firebase for each user
- Share functionality allows easy collaboration via URL
- User presence is tracked and displayed in real-time
- Room history is maintained for quick access to previous projects

## Room Selection Features
- Users can now create or join different collaboration rooms
- Room name is displayed in the workspace header
- Room IDs are used in the URL for easy sharing and bookmarking
- Each room is a separate collaboration space with its own set of blocks
- Real-time user count shows how many people are in the same room

## Environment Variables
- Firebase configuration variables for auth and Firestore:
  - NEXT_PUBLIC_FIREBASE_API_KEY
  - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  - NEXT_PUBLIC_FIREBASE_PROJECT_ID
  - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  - NEXT_PUBLIC_FIREBASE_APP_ID

## Google Authentication Setup
For Google authentication to work properly:
1. Enable Google as an authentication provider in Firebase Console
2. Configure OAuth consent screen in Google Cloud Console
3. Add authorized domains for authentication redirects
4. No additional environment variables are needed beyond the standard Firebase config

## Authentication Flow
1. Users can sign up/login with email/password or Google account
2. Authentication state is managed through Firebase Auth and React Context
3. Protected routes redirect unauthenticated users to login page
4. User information is used to identify collaborators in the workspace

## Deployment
The application is deployed on Vercel with custom domain configuration. Firebase environment variables need to be set in the Vercel project settings.

## Project Goals
1. Create a supportive environment for collaboration
2. Provide clear visual boundaries and ownership of code sections
3. Enable self-paced integration into collaborative workflows
4. Reduce cognitive load during social interactions
5. Build confidence through structured collaborative experiences
