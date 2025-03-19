import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { auth } from '../lib/firebase';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // User is signed in, redirect to dashboard
        router.replace('/dashboard');
      } else {
        // No user is signed in, redirect to login
        router.replace('/login');
      }
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [router]);

  // Return a loading state while determining where to redirect
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1>BlocklyCollab</h1>
        <p>Redirecting to the right place...</p>
      </div>
    </div>
  );
}
