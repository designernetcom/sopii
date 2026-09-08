import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/* jsdom is shared across tests in a file — unmount between them or a query
   matches a node the previous test rendered. */
afterEach(cleanup);
