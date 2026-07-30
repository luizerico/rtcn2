import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import AddMemberModal from '@/components/ui/AddMemberModal';

describe('AddMemberModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnAddUser = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render when closed', () => {
    render(
      <AddMemberModal
        resourceType="group"
        isOpen={false}
        onClose={mockOnClose}
        onAddUser={mockOnAddUser}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders correctly when open', () => {
    render(
      <AddMemberModal
        resourceType="group"
        isOpen={true}
        onClose={mockOnClose}
        onAddUser={mockOnAddUser}
      />
    );

    expect(screen.getByRole('heading', { name: /add member to group/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/user id/i)).toBeInTheDocument();
  });

  it('closes via Cancel button', () => {
    render(
      <AddMemberModal
        resourceType="group"
        isOpen={true}
        onClose={mockOnClose}
        onAddUser={mockOnAddUser}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('closes via Close icon button', () => {
    render(
      <AddMemberModal
        resourceType="group"
        isOpen={true}
        onClose={mockOnClose}
        onAddUser={mockOnAddUser}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('submits a trimmed user ID and calls onAddUser', () => {
    render(
      <AddMemberModal
        resourceType="group"
        isOpen={true}
        onClose={mockOnClose}
        onAddUser={mockOnAddUser}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/user id/i), {
      target: { value: '  test-user-123  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^add member$/i }));

    expect(mockOnAddUser).toHaveBeenCalledWith({ userId: 'test-user-123' });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('disables submit when user ID is empty', () => {
    render(
      <AddMemberModal
        resourceType="group"
        isOpen={true}
        onClose={mockOnClose}
        onAddUser={mockOnAddUser}
      />
    );

    expect(screen.getByRole('button', { name: /^add member$/i })).toBeDisabled();
  });
});
