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

## Environment Variables
- Firebase configuration variables for Firestore
  - NEXT_PUBLIC_FIREBASE_API_KEY
  - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  - NEXT_PUBLIC_FIREBASE_PROJECT_ID
  - NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  - NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  - NEXT_PUBLIC_FIREBASE_APP_ID

## Deployment
The application is deployed on Vercel with custom domain configuration. Firebase environment variables need to be set in the Vercel project settings.

## Project Goals
1. Create a supportive environment for collaboration
2. Provide clear visual boundaries and ownership of code sections
3. Enable self-paced integration into collaborative workflows
4. Reduce cognitive load during social interactions
5. Build confidence through structured collaborative experiences
