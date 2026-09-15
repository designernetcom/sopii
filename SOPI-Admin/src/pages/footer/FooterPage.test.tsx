import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';

import { store } from '@/store/store';
import { credentialsReceived } from '@/store/slices/authSlice';
import { ToastProvider } from '@/components/common/Toast';
import { adminUsers } from '@/data/admin';
import type { AuthUser } from '@/types';
import FooterPage from './FooterPage';

/*
 * The Footer screen, end to end against the in-memory mock API.
 * ===========================================================================
 * The API rules are pinned by the server's own tests; what is pinned here is
 * that the screen drives them — every button reaches the right endpoint and
 * the list reflects the saved footer afterwards — and that the form refuses a
 * link the API would refuse, before the round trip.
 */

vi.mock('@/store/api/baseQuery', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/baseQuery')>();
  // Whatever `.env` says, these tests run against the mock layer.
  return { ...actual, baseQuery: actual.mockBaseQuery };
});

const WAIT = { timeout: 5000 };

/* The mock layer simulates network latency on every call, and a test here
   makes several of them in sequence. */
vi.setConfig({ testTimeout: 30000 });

beforeAll(() => {
  const user = { ...adminUsers[0], roleKey: 'super_admin', permissions: {} } as unknown as AuthUser;
  store.dispatch(credentialsReceived({ token: 'test', user }));
});

function renderPage() {
  return render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter>
          <FooterPage />
        </MemoryRouter>
      </ToastProvider>
    </Provider>,
  );
}

/** The list row for a section, found by its title. */
const row = (title: string) => screen.getByText(title, { selector: 'span.truncate' }).closest('li')!;

describe('FooterPage', () => {
  it('lists the built-in footer, split into columns and bottom bar', async () => {
    renderPage();

    expect(await screen.findByText('Customer Care', { selector: 'span.truncate' }, WAIT)).toBeInTheDocument();
    expect(screen.getByText(/built-in footer the shop has always shown/)).toBeInTheDocument();
    expect(screen.getByText('Columns')).toBeInTheDocument();
    expect(screen.getByText('Bottom bar')).toBeInTheDocument();
    expect(within(row('Follow Us')).getByText('Hidden')).toBeInTheDocument();
    expect(within(row('Shop')).getByText('4 of 6 links shown')).toBeInTheDocument();
  });

  it('hides a section from its switch, and saves the footer as the store’s own', async () => {
    renderPage();
    await screen.findByText('Customer Care', { selector: 'span.truncate' }, WAIT);

    fireEvent.click(within(row('Customer Care')).getByRole('switch'));

    await waitFor(() => expect(within(row('Customer Care')).getByText('Hidden')).toBeInTheDocument(), WAIT);
    expect(screen.queryByText(/built-in footer the shop has always shown/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Restore defaults/ })).toBeInTheDocument();
  });

  it('adds a link column through the form, refusing an unsafe link first', async () => {
    renderPage();
    await screen.findByText('Shop', { selector: 'span.truncate' }, WAIT);

    fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
    const dialog = await screen.findByRole('dialog', {}, WAIT);

    // One-per-footer types already present cannot be added again.
    expect(within(dialog).getByRole('button', { name: /Copyright/ })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: /Link column/ }));

    fireEvent.change(within(dialog).getByPlaceholderText('e.g. Customer Care'), {
      target: { value: 'Help' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add link' }));
    fireEvent.change(within(dialog).getByLabelText('Label'), { target: { value: 'Size Guide' } });
    fireEvent.change(within(dialog).getByLabelText('Link'), {
      target: { value: 'javascript:alert(1)' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add section' }));
    expect(await within(dialog).findByText(/Use a site path/, {}, WAIT)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Link'), { target: { value: '/pages/size-guide' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add section' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), WAIT);
    await waitFor(() => expect(within(row('Help')).getByText('1 link')).toBeInTheDocument(), WAIT);
  });

  it('deletes a section after confirmation', async () => {
    renderPage();
    await screen.findByText('Credit', { selector: 'span.truncate' }, WAIT);

    fireEvent.click(within(row('Credit')).getByRole('button', { name: 'Delete Credit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }, WAIT));

    await waitFor(
      () => expect(screen.queryByText('Credit', { selector: 'span.truncate' })).not.toBeInTheDocument(),
      WAIT,
    );
  });

  it('restores the defaults', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Restore defaults/ }, WAIT));
    const dialog = await screen.findByRole('dialog', {}, WAIT);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore defaults' }));

    expect(await screen.findByText(/built-in footer the shop has always shown/, {}, WAIT)).toBeInTheDocument();
    expect(screen.getByText('Credit', { selector: 'span.truncate' })).toBeInTheDocument();
    expect(screen.queryByText('Help', { selector: 'span.truncate' })).not.toBeInTheDocument();
  });
});
