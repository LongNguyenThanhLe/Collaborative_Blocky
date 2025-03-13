import '@styles/globals.css';
import '../styles/blockly-custom.css'; // Import our custom Blockly styles
import type { AppProps } from 'next/app';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;
