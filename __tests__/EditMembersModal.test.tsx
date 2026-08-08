import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import EditMembersModal from '@/components/ui/EditMembersModal';

jest.mock('@/lib/apiUtils', () => ({
  apiGet: jest.fn(async () => ({
    items: [
      { _id: 'u1', username: 'alice', email: 'alice@example.com' },
      { _id: 'u2', username: 'bob', email: 'bob@example.com' },
      { _id: 'u3', username: 'carol', email: 'carol@test.com' },
    ],
  })),
}));

describe('EditMembersModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnSave = jest.fn(async () => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(<EditMembersModal isOpen={false} onClose={mockOnClose} onSave={mockOnSave} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows available users on the left and members on the right', async () => {
    render(
      <EditMembersModal
        isOpen={true}
        onClose={mockOnClose}
        groupName="editors"
        memberIds={['u1']}
        onSave={mockOnSave}
      />
    );

    expect(screen.getByRole('heading', { name: /edit members — editors/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(screen.getByRole('list', { name: /group members/i })).getByText('alice@example.com')
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('list', { name: /available users/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: /group members/i })).getByRole('button', {
        name: /remove member/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search by username or email/i)).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: /available users/i })).getByText('bob')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled();
  });

  it('keeps add/remove local until Save', async () => {
    render(
      <EditMembersModal
        isOpen={true}
        onClose={mockOnClose}
        memberIds={['u2']}
        onSave={mockOnSave}
      />
    );

    const available = () => screen.getByRole('list', { name: /available users/i });
    const members = () => screen.getByRole('list', { name: /group members/i });

    await waitFor(() =>
      expect(within(members()).getByText('bob')).toBeInTheDocument()
    );

    fireEvent.click(within(members()).getByRole('button', { name: /remove member/i }));
    fireEvent.click(
      within(within(available()).getByText('alice').closest('li') as HTMLElement).getByRole(
        'button',
        { name: /add member/i }
      )
    );

    expect(mockOnSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /^save$/i })).not.toBeDisabled();
    expect(within(members()).getByText('alice')).toBeInTheDocument();
    expect(within(members()).queryByText('bob')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith({
        addUserIds: ['u1'],
        removeUserIds: ['u2'],
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('removes a member immediately in the draft without confirmation', async () => {
    render(
      <EditMembersModal
        isOpen={true}
        onClose={mockOnClose}
        memberIds={['u2']}
        onSave={mockOnSave}
      />
    );

    const members = () => screen.getByRole('list', { name: /group members/i });
    const available = () => screen.getByRole('list', { name: /available users/i });

    await waitFor(() =>
      expect(within(members()).getByText('bob@example.com')).toBeInTheDocument()
    );
    fireEvent.click(within(members()).getByRole('button', { name: /remove member/i }));

    expect(screen.queryByRole('heading', { name: /^remove member$/i })).not.toBeInTheDocument();
    expect(within(members()).queryByText('bob@example.com')).not.toBeInTheDocument();
    expect(within(available()).getByText('bob@example.com')).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('closes via Cancel without saving', async () => {
    render(
      <EditMembersModal
        isOpen={true}
        onClose={mockOnClose}
        memberIds={[]}
        onSave={mockOnSave}
      />
    );

    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: /available users/i })).getByText('alice')
      ).toBeInTheDocument()
    );
    fireEvent.click(
      within(screen.getByRole('list', { name: /available users/i })).getAllByRole('button', {
        name: /add member/i,
      })[0]
    );
    fireEvent.click(screen.getByText(/^cancel$/i));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockOnSave).not.toHaveBeenCalled();
  });
});
