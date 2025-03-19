import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import styles from '../styles/LandingPage.module.css';
import { FaCode, FaPuzzlePiece, FaUsers, FaLightbulb } from 'react-icons/fa';

export default function Home() {
  const router = useRouter();

  return (
    <div className={styles.landingContainer}>
      <Head>
        <title>BlocklyCollab | Collaborative Programming for Autistic Youth</title>
        <meta name="description" content="An inclusive collaborative programming environment that helps autistic youth learn to code together through scaffolded, supportive interactions." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {/* Decorative background shapes */}
      <div className={`${styles.decorativeShape} ${styles.shape1}`}></div>
      <div className={`${styles.decorativeShape} ${styles.shape2}`}></div>
      <div className={`${styles.decorativeShape} ${styles.shape3}`}></div>
      <div className={`${styles.decorativeShape} ${styles.shape4}`}></div>

      {/* Navigation */}
      <nav className={styles.navbar}>
        <div className={styles.logo}>
          <FaPuzzlePiece className={styles.logoIcon} /> BlocklyCollab
        </div>
        <div className={styles.navActions}>
          <Link href="/login">
            <button className={styles.loginButton}>Login</button>
          </Link>
          <Link href="/signup">
            <button className={styles.signupButton}>Sign up free</button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <h1 className={styles.headline}>
          Learning to code together, at your own pace
        </h1>
        <p className={styles.subHeadline}>
          BlocklyCollab enhances Google's Blockly programming environment with features 
          designed to help autistic youth build coding and collaboration skills through 
          scaffolded, supportive interactions.
        </p>
        <button 
          className={styles.ctaButton}
          onClick={() => router.push('/signup')}
        >
          Start your free trial
        </button>
      </section>

      {/* Features Section */}
      <section className={styles.featuresSection}>
        <div className={styles.featureCard}>
          <FaPuzzlePiece className={styles.featureIcon} />
          <h3 className={styles.featureTitle}>Visual Block Programming</h3>
          <p className={styles.featureDescription}>
            Build programs by dragging and connecting blocks, making coding accessible 
            and removing the barriers of syntax errors.
          </p>
        </div>

        <div className={styles.featureCard}>
          <FaUsers className={styles.featureIcon} />
          <h3 className={styles.featureTitle}>Scaffolded Collaboration</h3>
          <p className={styles.featureDescription}>
            Work together in stages, with clear boundaries and ownership that build 
            confidence and reduce the stress of coordination.
          </p>
        </div>

        <div className={styles.featureCard}>
          <FaLightbulb className={styles.featureIcon} />
          <h3 className={styles.featureTitle}>Supportive Learning</h3>
          <p className={styles.featureDescription}>
            Progress at your own pace with guided exercises and real-time feedback 
            designed for different learning styles.
          </p>
        </div>
      </section>
    </div>
  );
}
