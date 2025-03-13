# Collaborative Blockly Editor

A collaborative block-based programming environment built with Next.js and Blockly.

## Project Overview

This project allows users to create programs using Google's Blockly visual programming editor. It's built with a modern tech stack including:

- **Next.js**: React framework for building the web application
- **TypeScript**: For type-safe code
- **Blockly**: Google's library for creating block-based programming interfaces

## Project Structure

The project is organized in a beginner-friendly way:

- `/pages`: Contains the Next.js pages
  - `index.tsx`: The main homepage
  - `_app.tsx`: The main application wrapper
  - `_document.tsx`: Custom document structure
  
- `/components`: Reusable React components
  - `BlocklyWorkspace.tsx`: The main Blockly editor component
  
- `/styles`: CSS files for styling
  - `globals.css`: Global styles
  - `Home.module.css`: Styles for the homepage
  - `BlocklyWorkspace.module.css`: Styles for the Blockly editor
  
- `/public`: Static assets (images, favicon, etc.)

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Run the development server:
   ```
   npm run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Features

- Visual block-based programming interface
- Real-time JavaScript code generation
- Responsive design for desktop and mobile devices

## Next Steps

- Add real-time collaboration features
- Implement project saving and loading
- Add custom blocks for specific domains
