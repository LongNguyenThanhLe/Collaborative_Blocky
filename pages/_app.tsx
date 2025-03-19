import '@styles/globals.css';
import '../styles/blockly-custom.css'; // Import our custom Blockly styles
import type { AppProps } from 'next/app';
import { ClerkProvider } from '@clerk/nextjs';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider 
      {...pageProps}
      appearance={{
        layout: {
          logoPlacement: 'inside',
          socialButtonsPlacement: 'bottom',
          logoImageUrl: '/images/logo.svg',
        },
        variables: {
          colorPrimary: '#4285F4',
        },
      }}
      navigate={(to: string) => window.location.href = to}
    >
      <Component {...pageProps} />
    </ClerkProvider>
  );
}

export default MyApp;
