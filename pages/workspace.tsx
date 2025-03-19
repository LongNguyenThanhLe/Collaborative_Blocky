import { useEffect } from 'react';
import Head from 'next/head';
import { UserButton, SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';
import styles from '../styles/Workspace.module.css';
import BlocklyWorkspace from '../components/BlocklyWorkspace';

export default function Workspace() {
  return (
    <>
      <SignedIn>
        <div className={styles.workspaceContainer}>
          <Head>
            <title>BlocklyCollab Workspace</title>
            <meta name="description" content="BlocklyCollab programming workspace - Build and collaborate on code" />
          </Head>

          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <h1 className={styles.title}>BlocklyCollab</h1>
              <span className={styles.divider}>|</span>
              <span className={styles.projectName}>My Project</span>
            </div>
            <div className={styles.headerRight}>
              <UserButton afterSignOutUrl="/" />
            </div>
          </header>

          <main className={styles.main}>
            <BlocklyWorkspace />
          </main>
        </div>
      </SignedIn>
      
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  );
}
