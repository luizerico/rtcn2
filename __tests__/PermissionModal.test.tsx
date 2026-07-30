import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PermissionModal from '@/components/ui/PermissionModal';

describe('PermissionModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnUpdatePolicy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly for Group resource', () => {
    render(
      <PermissionModal
        resourceType="group"
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
      />
    );

    expect(screen.getByRole('heading', { name: /group policy management/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/read access/i)).toBeInTheDocument();
  });

  it('renders correctly for Object resource', () => {
    render(
      <PermissionModal
        resourceType="object"
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
      />
    );

    expect(screen.getByRole('heading', { name: /object policy management/i })).toBeInTheDocument();
  });

  it('requires at least one permission before saving', () => {
    render(
      <PermissionModal
        resourceType="group"
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/resource type/i), {
      target: { value: 'User' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save policy/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/at least one permission/i);
    expect(mockOnUpdatePolicy).not.toHaveBeenCalled();
  });

  it('saves selected permissions and target', () => {
    render(
      <PermissionModal
        resourceType="group"
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
      />
    );

    fireEvent.click(screen.getByLabelText(/read access/i));
    fireEvent.change(screen.getByPlaceholderText(/resource type/i), {
      target: { value: 'User' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save policy/i }));

    expect(mockOnUpdatePolicy).toHaveBeenCalledWith({
      resourceType: 'group',
      scopes: ['READ'],
      target: 'User',
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
