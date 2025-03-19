import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { getUserProjects, createProject, deleteProject, Project } from '../lib/projects';
import { auth } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import styles from '../styles/Projects.module.css';

const ProjectsPage: React.FC = () => {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Check authentication and load projects
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadProjects();
      } else {
        // Redirect to login if not authenticated
        router.push('/login');
      }
    });

    return () => unsubscribe();
  }, [router]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const userProjects = await getUserProjects();
      setProjects(userProjects);
      setError(null);
    } catch (err: any) {
      console.error('Error loading projects:', err);
      setError('Failed to load projects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setLoading(true);
      await createProject(newProjectName, newProjectDescription);
      setNewProjectName('');
      setNewProjectDescription('');
      setIsCreatingProject(false);
      loadProjects();
    } catch (err: any) {
      console.error('Error creating project:', err);
      setError('Failed to create project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      setLoading(true);
      await deleteProject(projectId);
      loadProjects();
      setShowDeleteConfirm(null);
    } catch (err: any) {
      console.error('Error deleting project:', err);
      setError('Failed to delete project. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getUserRole = (project: Project) => {
    if (!user) return null;
    const collaborator = project.collaborators.find(c => c.userId === user.uid);
    return collaborator?.role || null;
  };

  if (loading && !projects.length) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>My Projects</h1>
        <div className={styles.headerActions}>
          <button 
            className={styles.createButton}
            onClick={() => setIsCreatingProject(true)}
          >
            Create New Project
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.errorMessage}>
          {error}
          <button onClick={() => setError(null)} className={styles.closeError}>×</button>
        </div>
      )}

      {isCreatingProject && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Create New Project</h2>
            <form onSubmit={handleCreateProject}>
              <div className={styles.formGroup}>
                <label htmlFor="projectName">Project Name *</label>
                <input
                  id="projectName"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Enter project name"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="projectDescription">Description (optional)</label>
                <textarea
                  id="projectDescription"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Enter project description"
                  rows={3}
                />
              </div>
              <div className={styles.formActions}>
                <button 
                  type="button" 
                  className={styles.cancelButton}
                  onClick={() => {
                    setIsCreatingProject(false);
                    setNewProjectName('');
                    setNewProjectDescription('');
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.submitButton}>
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className={styles.modal}>
          <div className={styles.modalContent}>
            <h2>Delete Project</h2>
            <p>Are you sure you want to delete this project? This action cannot be undone.</p>
            <div className={styles.formActions}>
              <button 
                className={styles.cancelButton}
                onClick={() => setShowDeleteConfirm(null)}
              >
                Cancel
              </button>
              <button 
                className={styles.deleteButton}
                onClick={() => handleDeleteProject(showDeleteConfirm)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.projectGrid}>
        {projects.length === 0 ? (
          <div className={styles.emptyState}>
            <h2>No projects yet</h2>
            <p>Create your first project to get started!</p>
            <button 
              className={styles.createButton}
              onClick={() => setIsCreatingProject(true)}
            >
              Create New Project
            </button>
          </div>
        ) : (
          projects.map((project) => {
            const userRole = getUserRole(project);
            return (
              <div key={project.id} className={styles.projectCard}>
                <div className={styles.projectThumb}>
                  {project.thumbnail ? (
                    <img src={project.thumbnail} alt={project.name} />
                  ) : (
                    <div className={styles.placeholderThumb}>
                      {project.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className={styles.projectInfo}>
                  <h3>{project.name}</h3>
                  <p className={styles.projectDescription}>
                    {project.description || 'No description'}
                  </p>
                  <div className={styles.projectMeta}>
                    <span className={styles.lastEdited}>
                      Last edited {formatDate(project.updatedAt)}
                    </span>
                    <span className={styles.projectRole}>
                      {userRole || 'Viewer'}
                    </span>
                  </div>
                </div>
                <div className={styles.projectActions}>
                  <Link
                    href={`/workspace?projectId=${project.id}`}
                    className={styles.editButton}
                  >
                    Open
                  </Link>
                  {userRole === 'owner' && (
                    <button
                      className={styles.deleteButtonSmall}
                      onClick={() => setShowDeleteConfirm(project.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ProjectsPage;
