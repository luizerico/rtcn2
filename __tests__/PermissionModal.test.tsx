import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PermissionModal from '@/components/ui/PermissionModal';

describe('PermissionModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnUpdatePolicy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders edit policy dialog', () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
      />
    );

    expect(screen.getByRole('heading', { name: /edit group policy/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^read$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/resource type/i)).toBeInTheDocument();
  });

  it('requires at least one permission before saving', () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/asset name/i), {
      target: { value: '*' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save policy/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/at least one permission/i);
    expect(mockOnUpdatePolicy).not.toHaveBeenCalled();
  });

  it('saves selected permissions and target', () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
        initialResourceType="GROUP"
        initialTarget="*"
      />
    );

    fireEvent.click(screen.getByLabelText(/^read$/i));
    fireEvent.change(screen.getByPlaceholderText(/asset name/i), {
      target: { value: '*' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save policy/i }));

    expect(mockOnUpdatePolicy).toHaveBeenCalledWith({
      resourceType: 'GROUP',
      scopes: ['READ'],
      target: '*',
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
