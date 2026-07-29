import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PermissionModal from '@/components/ui/PermissionModal';

// Mock dependencies if necessary.

describe('PermissionModal Component', () => {
  const mockOnUpdatePolicy = jest.fn();

  it('renders correctly with default props for Group resource', () => {
    render(<PermissionModal resourceType="group" isOpen={true} onClose={() => {}} onUpdatePolicy={mockOnUpdatePolicy} />);
    expect(screen.getByRole('heading', { name: /manage policies/i })).toBeInTheDocument();
    // Check for policy scopes elements (READ, WRITE, DELETE)
    const readScope = screen.queryByLabelText(/read access/i);
    expect(readScope).toBeInTheDocument(); 
  });

  it('renders correctly with default props for Object resource', () => {
    render(<PermissionModal resourceType="object" isOpen={true} onClose={() => {}} onUpdatePolicy={mockOnUpdatePolicy} />);
    expect(screen.getByRole('heading', { name: /manage policies/i })).toBeInTheDocument();
  });

  it('allows setting a new permission and calling onUpdatePolicy', async () => {
    const mockOnUpdatePolicy = jest.fn();
    render(<PermissionModal resourceType="group" isOpen={true} onClose={() => {}} onUpdatePolicy={mockOnUpdatePolicy} />);

    // Simulate interaction: Check the box for READ, change a scope, and submit
    const readCheckbox = screen.getByLabelText(/read access/i);
    fireEvent.click(readCheckbox); 

    // Assuming there is an input for defining the target resource (e.g., 'users')
    const targetInput = screen.getByPlaceholderText(/resource type/i);
    fireEvent.change(targetInput, { target: { value: 'User' } });


    // Simulate click on submit button 
    await fireEvent.click(screen.getByRole('button', { name: /save policies/i })); 

    // Assert the mock function was called with expected data structure
    expect(mockOnUpdatePolicy).toHaveBeenCalledWith({ resourceType: 'group', scopes: ['READ'], target: 'User' });
  });
});