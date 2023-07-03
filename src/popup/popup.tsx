import React from 'react';
import ReactDOM from 'react-dom/client';

import {
  ChakraProvider, Heading, Button, Text, VStack,
} from '@chakra-ui/react';

import browser from 'webextension-polyfill';

import theme from '../lib/theme';
import MiscButtons from '../lib/components/MiscButtons';
import { dev, version } from '../lib/esbuilddefinitions';

import DevTools from './devtools';

function App(): React.ReactElement {
  return (
    <VStack>
      <Heading>Custom Bang Search</Heading>
      <Text>{`v${version}`}</Text>
      <MiscButtons />
      <Button variant="outline" onClick={() => { browser.runtime.openOptionsPage(); }}>Options</Button>
      {dev && <DevTools />}
    </VStack>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <ChakraProvider theme={theme}>
      <App />
    </ChakraProvider>
  </React.StrictMode>,
);
