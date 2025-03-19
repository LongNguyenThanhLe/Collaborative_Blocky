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
