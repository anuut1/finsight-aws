import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import FriendsPage from '../pages/FriendsPage.jsx';
import api from '../api/axios.js';

vi.mock('../api/axios.js', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockQrCode'),
  },
}));

describe('FriendsPage Component', () => {
  const mockFriends = [
    {
      friendshipId: 'f1',
      userId: 'u2',
      name: 'Bob Martin',
      email: 'bob@example.com',
      avatarUrl: '',
      friendCode: 'FS-BOB1234',
      sharedGroupsCount: 2,
    },
  ];

  const mockRequests = {
    incoming: [
      {
        friendshipId: 'req1',
        requester: {
          userId: 'u3',
          name: 'Charlie Day',
          email: 'charlie@example.com',
          avatarUrl: '',
          friendCode: 'FS-CHARLIE',
        },
        createdAt: new Date().toISOString(),
      },
    ],
    outgoing: [
      {
        friendshipId: 'req2',
        recipient: {
          userId: 'u4',
          name: 'Dana Scully',
          email: 'dana@example.com',
          avatarUrl: '',
          friendCode: 'FS-DANA001',
        },
        createdAt: new Date().toISOString(),
      },
    ],
  };

  const mockMyCode = {
    friendCode: 'FS-ALICE999',
    inviteLink: 'http://localhost:5173/friends?code=FS-ALICE999',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((url) => {
      if (url === '/friends') return Promise.resolve({ data: { success: true, data: mockFriends } });
      if (url === '/friends/requests') return Promise.resolve({ data: { success: true, data: mockRequests } });
      if (url === '/friends/my-code') return Promise.resolve({ data: { success: true, data: mockMyCode } });
      return Promise.reject(new Error(`Unhandled GET: ${url}`));
    });
  });

  it('renders friends list and personal invite code', async () => {
    render(
      <MemoryRouter>
        <FriendsPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/Friends & Collaborators/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('FS-ALICE999')).toBeInTheDocument();
      expect(screen.getByText('Bob Martin')).toBeInTheDocument();
      expect(screen.getByText('bob@example.com')).toBeInTheDocument();
      expect(screen.getByText('2 shared trips')).toBeInTheDocument();
    });
  });

  it('switches to requests tab and accepts incoming request', async () => {
    api.post.mockResolvedValueOnce({
      data: { success: true, message: 'Friend request accepted' },
    });

    render(
      <MemoryRouter>
        <FriendsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Bob Martin')).toBeInTheDocument();
    });

    // Click Requests tab
    const requestsTab = screen.getByRole('button', { name: /Requests/i });
    fireEvent.click(requestsTab);

    // Verify incoming and outgoing requests
    expect(screen.getByText('Charlie Day')).toBeInTheDocument();
    expect(screen.getByText('charlie@example.com')).toBeInTheDocument();
    expect(screen.getByText('Dana Scully')).toBeInTheDocument();

    // Click Accept button on Charlie's request
    const acceptBtn = screen.getByRole('button', { name: /Accept/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/friends/req1/accept');
    });
  });

  it('declines an incoming request', async () => {
    api.post.mockResolvedValueOnce({
      data: { success: true, message: 'Friend request declined' },
    });

    render(
      <MemoryRouter>
        <FriendsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Bob Martin')).toBeInTheDocument();
    });

    // Click Requests tab
    fireEvent.click(screen.getByRole('button', { name: /Requests/i }));

    const declineBtn = screen.getByRole('button', { name: /Decline/i });
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/friends/req1/decline');
    });
  });

  it('sends a friend request by email', async () => {
    api.post.mockResolvedValueOnce({
      data: { success: true, message: 'Friend request sent' },
    });

    render(
      <MemoryRouter>
        <FriendsPage />
      </MemoryRouter>
    );

    // Click + Add Friend button to open add form
    const addFriendBtn = screen.getByRole('button', { name: /\+ Add Friend/i });
    fireEvent.click(addFriendBtn);

    expect(screen.getByLabelText(/Friend's Exact Email Address/i)).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/Friend's Exact Email Address/i);
    fireEvent.change(emailInput, { target: { value: 'newfriend@example.com' } });

    const submitBtn = screen.getByRole('button', { name: /Send Request/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/friends/request', {
        email: 'newfriend@example.com',
      });
      expect(screen.getByText(/Friend request sent/i)).toBeInTheDocument();
    });
  });

  it('opens and closes QR code modal', async () => {
    render(
      <MemoryRouter>
        <FriendsPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('FS-ALICE999')).toBeInTheDocument();
    });

    // Click Show QR
    const qrBtn = screen.getByRole('button', { name: /Show QR/i });
    fireEvent.click(qrBtn);

    expect(screen.getByText('Scan to Connect')).toBeInTheDocument();
    expect(screen.getByText(/Have your friend scan this QR code/i)).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Scan to Connect')).not.toBeInTheDocument();
    });
  });
});
