import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditMembersModal from '@/components/ui/EditMembersModal';

jest.mock('@/lib/apiUtils', () => ({
  apiGet: jest.fn(async () => [
    { _id: 'u1', username: 'alice', email: 'alice@example.com' },
    { _id: 'u2', username: 'bob', email: 'bob@example.com' },
    { _id: 'u3', username: 'carol', email: 'carol@test.com' },
  ]),
}));

describe('EditMembersModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnAddUser = jest.fn(async () => undefined);
  const mockOnRemoveUser = jest.fn(async () => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(
      <EditMembersModal
        isOpen={false}
        onClose={mockOnClose}
        onAddUser={mockOnAddUser}
        onRemoveUser={mockOnRemoveUser}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows current members and search for new ones', async () => {
    render(
      <EditMembersModal
        isOpen={true}
        onClose={mockOnClose}
        groupName="editors"
        memberIds={['u1']}
        onAddUser={mockOnAddUser}
        onRemoveUser={mockOnRemoveUser}
      />
    );

    expect(screen.getByRole('heading', { name: /edit members — editors/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^remove$/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by username or email/i)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /alice/i })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /bob/i })).toBeInTheDocument();
  });

  it('adds a selected user', async () => {
    render(
      <EditMembersModal
        isOpen={true}
        onClose={mockOnClose}
        memberIds={[]}
        onAddUser={mockOnAddUser}
        onRemoveUser={mockOnRemoveUser}
      />
    );

    await waitFor(() => expect(screen.getByRole('option', { name: /alice/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('option', { name: /alice/i }));
    fireEvent.click(screen.getByRole('button', { name: /^add member$/i }));

    await waitFor(() => {
      expect(mockOnAddUser).toHaveBeenCalledWith({ userId: 'u1' });
    });
  });

  it('removes a current member', async () => {
    render(
      <EditMembersModal
        isOpen={true}
        onClose={mockOnClose}
        memberIds={['u2']}
        onAddUser={mockOnAddUser}
        onRemoveUser={mockOnRemoveUser}
      />
    );

    await waitFor(() => expect(screen.getByText('bob@example.com')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    await waitFor(() => {
      expect(mockOnRemoveUser).toHaveBeenCalledWith({ userId: 'u2' });
    });
  });

  it('closes via Close button', async () => {
    render(
      <EditMembersModal
        isOpen={true}
        onClose={mockOnClose}
        onAddUser={mockOnAddUser}
        onRemoveUser={mockOnRemoveUser}
      />
    );

    await waitFor(() => expect(screen.getByPlaceholderText(/search by username or email/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/^close$/i));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
