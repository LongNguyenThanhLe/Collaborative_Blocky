import { 
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, 
  query, where, orderBy, limit, getDocs, serverTimestamp, 
  Timestamp, writeBatch
} from "firebase/firestore";
import { db, auth } from './firebase';
import { v4 as uuidv4 } from 'uuid';

// Types for TypeScript
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
  lastModifiedBy: string;
  thumbnail?: string;
  blocklyXml?: string;
  isPublic: boolean;
  collaborators: Collaborator[];
  tags?: string[];
  roomId?: string; // Associated room ID for real-time collaboration
}

export interface Collaborator {
  userId: string;
  email: string;
  name?: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Timestamp;
}

// Constants
const PROJECTS_COLLECTION = 'projects';
const USER_PROJECTS_COLLECTION = 'userProjects';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes cache expiry

// Cache to reduce Firestore reads
const projectsCache = new Map<string, {data: Project, timestamp: number}>();
const userProjectsCache = new Map<string, {data: Project[], timestamp: number}>();

/**
 * Create a new project
 * @param name Project name
 * @param description Optional project description
 * @param blocklyXml Initial Blockly XML content
 * @param isPublic Whether project is public (default: false)
 * @param tags Optional tags for the project
 * @returns The newly created project
 */
export async function createProject(
  name: string, 
  description: string = '', 
  blocklyXml: string = '', 
  isPublic: boolean = false,
  tags: string[] = []
): Promise<Project> {
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to create a project');
  }

  // Generate unique ID for the project
  const projectId = uuidv4();
  
  // Create a new room ID for real-time collaboration
  const roomId = `project_${projectId}`;
  
  // Create project object
  const now = new Date();
  const timestamp = Timestamp.fromDate(now);
  const project: Project = {
    id: projectId,
    name,
    description,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: currentUser.uid,
    lastModifiedBy: currentUser.uid,
    blocklyXml,
    isPublic,
    collaborators: [{
      userId: currentUser.uid,
      email: currentUser.email || 'unknown',
      name: currentUser.displayName || undefined,
      role: 'owner',
      joinedAt: timestamp
    }],
    tags,
    roomId
  };
  
  try {
    // Add project to projects collection
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await setDoc(projectRef, project);
    
    // Add reference to user's projects collection
    const userProjectRef = doc(db, 'users', currentUser.uid, USER_PROJECTS_COLLECTION, projectId);
    await setDoc(userProjectRef, {
      projectId,
      role: 'owner',
      addedAt: serverTimestamp(),
      lastAccessed: serverTimestamp()
    });
    
    // Clear cache
    userProjectsCache.delete(currentUser.uid);
    
    // Return created project
    return project;
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
}

/**
 * Get a project by ID
 * @param projectId Project ID
 * @returns Project or null if not found
 */
export async function getProject(projectId: string): Promise<Project | null> {
  if (!projectId) return null;
  
  try {
    // Check cache first
    const cachedProject = projectsCache.get(projectId);
    const now = Date.now();
    
    if (cachedProject && (now - cachedProject.timestamp < CACHE_EXPIRY)) {
      return cachedProject.data;
    }
    
    // Get from Firestore
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    const projectSnapshot = await getDoc(projectRef);
    
    if (projectSnapshot.exists()) {
      const projectData = projectSnapshot.data() as Project;
      
      // Update cache
      projectsCache.set(projectId, {
        data: projectData,
        timestamp: now
      });
      
      // Update last accessed for current user
      const currentUser = auth.currentUser;
      if (currentUser) {
        const userProjectRef = doc(db, 'users', currentUser.uid, USER_PROJECTS_COLLECTION, projectId);
        await updateDoc(userProjectRef, {
          lastAccessed: serverTimestamp()
        }).catch(err => {
          // If document doesn't exist, create it (if user has access)
          if (projectData.isPublic || 
              projectData.collaborators.some(c => c.userId === currentUser.uid)) {
            setDoc(userProjectRef, {
              projectId,
              role: 'viewer', // Default to viewer if they weren't explicitly invited
              addedAt: serverTimestamp(),
              lastAccessed: serverTimestamp()
            }).catch(console.error);
          }
        });
      }
      
      return projectData;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting project:', error);
    return null;
  }
}

/**
 * Get all projects for a user
 * @param userId User ID (defaults to current user)
 * @returns Array of projects
 */
export async function getUserProjects(userId?: string): Promise<Project[]> {
  // Use current user if userId not provided
  const currentUser = auth.currentUser;
  if (!currentUser && !userId) {
    return [];
  }
  
  const targetUserId = userId || currentUser!.uid;
  
  try {
    // Check cache first
    const cachedProjects = userProjectsCache.get(targetUserId);
    const now = Date.now();
    
    if (cachedProjects && (now - cachedProjects.timestamp < CACHE_EXPIRY)) {
      return cachedProjects.data;
    }
    
    // Query user's projects
    const userProjectsRef = collection(db, 'users', targetUserId, USER_PROJECTS_COLLECTION);
    const userProjectsQuery = query(userProjectsRef, orderBy('lastAccessed', 'desc'), limit(50));
    const userProjectsSnapshot = await getDocs(userProjectsQuery);
    
    // Fetch full project data for each project reference
    const projectPromises = userProjectsSnapshot.docs.map(async (doc) => {
      const { projectId } = doc.data();
      return getProject(projectId);
    });
    
    const projects = (await Promise.all(projectPromises)).filter(Boolean) as Project[];
    
    // Update cache
    userProjectsCache.set(targetUserId, {
      data: projects,
      timestamp: now
    });
    
    return projects;
  } catch (error) {
    console.error('Error getting user projects:', error);
    return [];
  }
}

/**
 * Update a project
 * @param projectId Project ID
 * @param updates Partial project data to update
 * @returns Updated project
 */
export async function updateProject(
  projectId: string, 
  updates: Partial<Omit<Project, 'id' | 'createdAt' | 'createdBy' | 'collaborators'>>
): Promise<Project | null> {
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to update a project');
  }
  
  try {
    // Get current project data
    const project = await getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Check permissions
    const userRole = project.collaborators.find(c => c.userId === currentUser.uid)?.role;
    if (!userRole || userRole === 'viewer') {
      throw new Error('You do not have permission to update this project');
    }
    
    // Prepare update data
    const updateData = {
      ...updates,
      updatedAt: serverTimestamp(),
      lastModifiedBy: currentUser.uid
    };
    
    // Update project
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, updateData);
    
    // Clear cache
    projectsCache.delete(projectId);
    
    // Get updated project
    return getProject(projectId);
  } catch (error) {
    console.error('Error updating project:', error);
    throw error;
  }
}

/**
 * Update project content (Blockly XML)
 * @param projectId Project ID
 * @param blocklyXml New Blockly XML content
 * @returns Updated project
 */
export async function updateProjectContent(
  projectId: string, 
  blocklyXml: string
): Promise<Project | null> {
  return updateProject(projectId, { blocklyXml });
}

/**
 * Delete a project
 * @param projectId Project ID
 */
export async function deleteProject(projectId: string): Promise<void> {
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to delete a project');
  }
  
  try {
    // Get current project data
    const project = await getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Check permissions (only owner can delete)
    const userRole = project.collaborators.find(c => c.userId === currentUser.uid)?.role;
    if (userRole !== 'owner') {
      throw new Error('Only the project owner can delete this project');
    }
    
    // Delete project and all user project references
    const batch = writeBatch(db);
    
    // Delete project document
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    batch.delete(projectRef);
    
    // Delete all user references to this project
    for (const collaborator of project.collaborators) {
      const userProjectRef = doc(db, 'users', collaborator.userId, USER_PROJECTS_COLLECTION, projectId);
      batch.delete(userProjectRef);
    }
    
    // Commit batch
    await batch.commit();
    
    // Clear caches
    projectsCache.delete(projectId);
    for (const collaborator of project.collaborators) {
      userProjectsCache.delete(collaborator.userId);
    }
  } catch (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
}

/**
 * Add a collaborator to a project
 * @param projectId Project ID
 * @param email Collaborator's email
 * @param role Collaborator's role (default: 'editor')
 */
export async function addCollaborator(
  projectId: string, 
  email: string, 
  role: 'editor' | 'viewer' = 'editor'
): Promise<void> {
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to add collaborators');
  }
  
  try {
    // Get current project data
    const project = await getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Check permissions (only owner or editor can add collaborators)
    const userRole = project.collaborators.find(c => c.userId === currentUser.uid)?.role;
    if (!userRole || (userRole !== 'owner' && userRole !== 'editor')) {
      throw new Error('You do not have permission to add collaborators');
    }
    
    // Check if user already exists as collaborator
    if (project.collaborators.some(c => c.email === email)) {
      throw new Error('User is already a collaborator');
    }
    
    // Query for user by email
    const usersQuery = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const usersSnapshot = await getDocs(usersQuery);
    
    if (usersSnapshot.empty) {
      // User doesn't exist yet, add placeholder
      const newCollaborator: Collaborator = {
        userId: '', // Empty for now
        email,
        role,
        joinedAt: Timestamp.fromDate(new Date())
      };
      
      // Update project with new collaborator
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        collaborators: [...project.collaborators, newCollaborator]
      });
    } else {
      // User exists, add them as collaborator
      const userData = usersSnapshot.docs[0].data();
      const userId = usersSnapshot.docs[0].id;
      
      const newCollaborator: Collaborator = {
        userId,
        email,
        name: userData.displayName,
        role,
        joinedAt: Timestamp.fromDate(new Date())
      };
      
      // Update project with new collaborator
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        collaborators: [...project.collaborators, newCollaborator]
      });
      
      // Add reference to user's projects collection
      const userProjectRef = doc(db, 'users', userId, USER_PROJECTS_COLLECTION, projectId);
      await setDoc(userProjectRef, {
        projectId,
        role,
        addedAt: serverTimestamp(),
        lastAccessed: serverTimestamp()
      });
      
      // Clear caches
      projectsCache.delete(projectId);
      userProjectsCache.delete(userId);
    }
  } catch (error) {
    console.error('Error adding collaborator:', error);
    throw error;
  }
}

/**
 * Remove a collaborator from a project
 * @param projectId Project ID
 * @param collaboratorId User ID of collaborator to remove
 */
export async function removeCollaborator(
  projectId: string, 
  collaboratorId: string
): Promise<void> {
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to remove collaborators');
  }
  
  try {
    // Get current project data
    const project = await getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Check permissions (only owner can remove collaborators, or users can remove themselves)
    const userRole = project.collaborators.find(c => c.userId === currentUser.uid)?.role;
    if (!userRole || (userRole !== 'owner' && currentUser.uid !== collaboratorId)) {
      throw new Error('You do not have permission to remove this collaborator');
    }
    
    // Cannot remove the owner
    const targetCollaborator = project.collaborators.find(c => c.userId === collaboratorId);
    if (!targetCollaborator) {
      throw new Error('Collaborator not found');
    }
    
    if (targetCollaborator.role === 'owner') {
      throw new Error('Cannot remove the project owner');
    }
    
    // Update project by filtering out the collaborator
    const updatedCollaborators = project.collaborators.filter(
      c => c.userId !== collaboratorId
    );
    
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      collaborators: updatedCollaborators
    });
    
    // Remove project from user's projects collection
    const userProjectRef = doc(db, 'users', collaboratorId, USER_PROJECTS_COLLECTION, projectId);
    await deleteDoc(userProjectRef);
    
    // Clear caches
    projectsCache.delete(projectId);
    userProjectsCache.delete(collaboratorId);
  } catch (error) {
    console.error('Error removing collaborator:', error);
    throw error;
  }
}

/**
 * Update collaborator role
 * @param projectId Project ID
 * @param collaboratorId User ID of collaborator
 * @param newRole New role for collaborator
 */
export async function updateCollaboratorRole(
  projectId: string, 
  collaboratorId: string, 
  newRole: 'owner' | 'editor' | 'viewer'
): Promise<void> {
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to update collaborator roles');
  }
  
  try {
    // Get current project data
    const project = await getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Check permissions (only owner can change roles)
    const userRole = project.collaborators.find(c => c.userId === currentUser.uid)?.role;
    if (userRole !== 'owner') {
      throw new Error('Only the project owner can update collaborator roles');
    }
    
    // Cannot change owner role unless transferring ownership
    if (newRole === 'owner') {
      // This is ownership transfer - current user will become 'editor'
      const updatedCollaborators = project.collaborators.map(c => {
        if (c.userId === collaboratorId) {
          return { ...c, role: 'owner' };
        } else if (c.userId === currentUser.uid) {
          return { ...c, role: 'editor' };
        }
        return c;
      });
      
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        collaborators: updatedCollaborators
      });
      
      // Update user project references
      const batch = writeBatch(db);
      
      const newOwnerProjectRef = doc(db, 'users', collaboratorId, USER_PROJECTS_COLLECTION, projectId);
      batch.update(newOwnerProjectRef, { role: 'owner' });
      
      const previousOwnerProjectRef = doc(db, 'users', currentUser.uid, USER_PROJECTS_COLLECTION, projectId);
      batch.update(previousOwnerProjectRef, { role: 'editor' });
      
      await batch.commit();
    } else {
      // Normal role update
      const targetIndex = project.collaborators.findIndex(c => c.userId === collaboratorId);
      if (targetIndex === -1) {
        throw new Error('Collaborator not found');
      }
      
      // Cannot change the owner's role to non-owner
      if (project.collaborators[targetIndex].role === 'owner') {
        throw new Error('Cannot change the owner role. Transfer ownership instead.');
      }
      
      // Update the role
      const updatedCollaborators = [...project.collaborators];
      updatedCollaborators[targetIndex] = {
        ...updatedCollaborators[targetIndex],
        role: newRole
      };
      
      const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
      await updateDoc(projectRef, {
        collaborators: updatedCollaborators
      });
      
      // Update user project reference
      const userProjectRef = doc(db, 'users', collaboratorId, USER_PROJECTS_COLLECTION, projectId);
      await updateDoc(userProjectRef, { role: newRole });
    }
    
    // Clear caches
    projectsCache.delete(projectId);
    userProjectsCache.delete(collaboratorId);
    userProjectsCache.delete(currentUser.uid);
  } catch (error) {
    console.error('Error updating collaborator role:', error);
    throw error;
  }
}

/**
 * Generate a shareable link for a project
 * @param projectId Project ID
 * @param makePublic Whether to make the project public
 * @returns Shareable URL
 */
export async function generateShareableLink(
  projectId: string, 
  makePublic: boolean = false
): Promise<string> {
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to generate shareable links');
  }
  
  try {
    // Get current project data
    const project = await getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Check permissions (only owner or editor can generate links)
    const userRole = project.collaborators.find(c => c.userId === currentUser.uid)?.role;
    if (!userRole || (userRole !== 'owner' && userRole !== 'editor')) {
      throw new Error('You do not have permission to generate shareable links');
    }
    
    // If makePublic is true, update project visibility
    if (makePublic && !project.isPublic) {
      await updateProject(projectId, { isPublic: true });
    }
    
    // Generate URL
    const baseUrl = window.location.origin;
    return `${baseUrl}/project/${projectId}`;
  } catch (error) {
    console.error('Error generating shareable link:', error);
    throw error;
  }
}

/**
 * Join project from a shared link
 * @param projectId Project ID
 */
export async function joinProjectFromLink(projectId: string): Promise<Project | null> {
  // Check if user is authenticated
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('User must be authenticated to join a project');
  }
  
  try {
    // Get current project data
    const project = await getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    
    // Check if user is already a collaborator
    if (project.collaborators.some(c => c.userId === currentUser.uid)) {
      // User is already a collaborator, just return the project
      return project;
    }
    
    // Check if project is public
    if (!project.isPublic) {
      throw new Error('This project is private. Ask the owner for an invitation.');
    }
    
    // Add user as a viewer
    const newCollaborator: Collaborator = {
      userId: currentUser.uid,
      email: currentUser.email || 'unknown',
      name: currentUser.displayName || undefined,
      role: 'viewer',
      joinedAt: Timestamp.fromDate(new Date())
    };
    
    // Update project with new collaborator
    const projectRef = doc(db, PROJECTS_COLLECTION, projectId);
    await updateDoc(projectRef, {
      collaborators: [...project.collaborators, newCollaborator]
    });
    
    // Add reference to user's projects collection
    const userProjectRef = doc(db, 'users', currentUser.uid, USER_PROJECTS_COLLECTION, projectId);
    await setDoc(userProjectRef, {
      projectId,
      role: 'viewer',
      addedAt: serverTimestamp(),
      lastAccessed: serverTimestamp()
    });
    
    // Clear caches
    projectsCache.delete(projectId);
    userProjectsCache.delete(currentUser.uid);
    
    // Return updated project
    return getProject(projectId);
  } catch (error) {
    console.error('Error joining project:', error);
    throw error;
  }
}
