import Head from 'next/head';
import Layout from '@components/Layout';

export default function Home() {
  return (
    <>
      <Head>
        <title>Collaborative Blockly Editor</title>
        <meta name="description" content="A collaborative block-based programming environment" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Layout />
    </>
  );
}
