# BlocklyCollab Project Context

## Project Overview
BlocklyCollab is an enhanced version of Google's Blockly programming environment specifically designed to create virtual spaces where autistic youth can learn to code and collaborate through scaffolded, supportive interactions. The platform focuses on building collaboration skills in manageable stages, allowing users to code in shared projects while maintaining a carefully scaffolded separation of effort.

## Key Features
- Real-time collaboration with visual block-based programming
- User-specific cursor tracking and awareness
- Per-block synchronization for improved collaboration
- Scaffolded collaboration tools with clear boundaries
- Modern authentication system using Clerk
- Responsive design for different devices

## Technical Stack
- Frontend: Next.js 14.0.0 with TypeScript
- Block Programming: Blockly 10.4.3
- Real-time Collaboration: Yjs, Firebase
- Authentication: Clerk
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
  - Implemented Clerk authentication using official components and middleware
  - Protected workspace route with Clerk authentication
  - Fixed collaboration issues: XML data errors, cursor appearance
  - Improved block serialization for better synchronization

## Environment Variables
- Firebase configuration variables for Firestore
- Clerk authentication credentials:
  - NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  - CLERK_SECRET_KEY

## Deployment
The application is deployed on Vercel with custom domain configuration. Firebase environment variables need to be set in the Vercel project settings.

## Project Goals
1. Create a supportive environment for collaboration
2. Provide clear visual boundaries and ownership of code sections
3. Enable self-paced integration into collaborative workflows
4. Reduce cognitive load during social interactions
5. Build confidence through structured collaborative experiences
