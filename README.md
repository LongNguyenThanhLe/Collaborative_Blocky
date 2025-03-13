# 🧩 Collaborative Blockly

## 🚀 Vision

We're enhancing Google's Blockly programming environment to create virtual spaces where autistic youth can learn to code and collaborate through **scaffolded, supportive interactions**. Our mission is to make programming collaboration accessible, enjoyable, and growth-oriented for all learning styles.

## 🌟 Project Goals

- 🤝 Develop collaboration skills in **manageable stages**
- 🛡️ Allow coding in shared projects with **carefully scaffolded separation** of effort
- 🔄 Ease the coordination skills required for simultaneous code editing 
- 🌉 Create bridges between independent work and shared projects
- 💪 Build confidence through structured collaborative experiences

## 🧠 Why This Matters

Many autistic youth have natural talents for logical thinking and technology but may find traditional collaborative environments challenging. Our platform provides:

- 🔍 Clear visual boundaries and ownership of code sections
- 🕰️ Self-paced integration into collaborative workflows
- 📊 Reduced cognitive load during social interactions
- 🎯 Focused learning experiences that build on individual strengths

## 💻 Technology Stack

- **Next.js**: React framework for building the web application
- **TypeScript**: For type-safe code development
- **Blockly**: Google's library for visual block-based programming
- **Firebase**: For room persistence and user presence
- **Yjs**: Real-time collaboration and shared editing
- **WebSocket Server**: For synchronizing changes between users

## 🚦 Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Set up environment variables:
   - Create a `.env.local` file based on `.env.example`
   - Add your Firebase credentials

3. Start the WebSocket server:
   ```
   node y-websocket-server.js
   ```

4. Run the development server:
   ```
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## 🏗️ Project Structure

- `/pages`: Next.js pages including the main editor view
- `/components`: React components including our enhanced Blockly workspace
- `/styles`: CSS modules for styling the application
- `/lib`: Shared utilities and collaboration logic
- `/public`: Static assets and images

## 🌱 Current Features

- 🧩 Visual block-based programming interface
- 🔄 Real-time JavaScript code generation
- 📱 Responsive design for multiple devices
- 👥 Real-time collaborative editing with visual feedback
- 🏁 Basic scaffolding for collaborative interactions

## 🔮 Upcoming Features

- 🚦 Progressive collaboration levels (independent → guided → collaborative)
- 💬 Structured communication tools
- 💾 Project saving and sharing capabilities
- 🎨 Customizable workspace preferences for sensory needs

## 📦 Deployment

### Deploying to Vercel

1. **Set up your Vercel account**:
   - Create an account at [vercel.com](https://vercel.com)
   - Install the Vercel CLI: `npm i -g vercel`

2. **Configure environment variables**:
   - Go to your Vercel project dashboard
   - Navigate to Settings > Environment Variables
   - Add all variables from `.env.example` with your values

3. **Deploy the Next.js app**:
   ```
   vercel login
   vercel
   ```

4. **Follow the prompts**:
   - Select your account
   - Select or create a project
   - Use default settings for the remaining prompts

### Deploying the WebSocket Server (Required)

Since Vercel doesn't support WebSocket servers, deploy the WebSocket server separately:

1. **Copy the WebSocket server to a new repository**:
   - A minimal server is available in `/blockly-websocket-server`

2. **Deploy to a service that supports WebSockets**:
   - Recommend: [Render.com](https://render.com) (Web Service)
   - Alternatives: Heroku, Fly.io, or Railway

3. **Update your Vercel environment variables**:
   - Set `NEXT_PUBLIC_WEBSOCKET_URL` to your deployed WebSocket server URL
   - Format: `wss://your-server-url.com` (note the `wss://` protocol)

## 📚 Resources

- [Blockly Documentation](https://developers.google.com/blockly/guides/overview)
- [Next.js Documentation](https://nextjs.org/docs)
- [Yjs Documentation](https://docs.yjs.dev/)
- [Firebase Documentation](https://firebase.google.com/docs)

## 📝 License

MIT
