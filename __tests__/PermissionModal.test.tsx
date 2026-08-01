import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PermissionModal from '@/components/ui/PermissionModal';

jest.mock('@/lib/apiUtils', () => ({
  apiGet: jest.fn(async () => ({
    classes: [
      {
        resourceType: 'SURVEY',
        label: 'Surveys',
        objects: [
          { id: 's1', name: 'Pulse', label: 'Pulse' },
          { id: 's2', name: 'NPS', label: 'NPS' },
        ],
      },
      {
        resourceType: 'SURVEY_RESPONSE',
        label: 'Survey responses',
        objects: [{ id: 'r1', name: 'Response: Pulse', label: 'Response: Pulse' }],
      },
    ],
  })),
}));

describe('PermissionModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnUpdatePolicy = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders edit policy dialog with classes from the catalog', async () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
      />
    );

    expect(screen.getByRole('heading', { name: /edit group policy/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^read$/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/^class$/i)).toBeInTheDocument();
    });
  });

  it('requires at least one permission before saving', async () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
      />
    );

    await waitFor(() => expect(screen.getByLabelText(/^class$/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /save policy/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/at least one permission/i);
    expect(mockOnUpdatePolicy).not.toHaveBeenCalled();
  });

  it('saves class-wide access for selected scopes', async () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onUpdatePolicy={mockOnUpdatePolicy}
        initialResourceType="SURVEY"
      />
    );

    await waitFor(() => expect(screen.getByLabelText(/^class$/i)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/^read$/i));
    fireEvent.click(screen.getByRole('button', { name: /save policy/i }));

    expect(mockOnUpdatePolicy).toHaveBeenCalledWith({
      resourceType: 'SURVEY',
      scopes: ['READ'],
      allObjects: true,
      objects: [],
    });
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
