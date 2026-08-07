import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PermissionModal from '@/components/ui/PermissionModal';

jest.mock('@/lib/apiUtils', () => ({
  apiGet: jest.fn(async (url: string) => {
    if (String(url).includes('/permissions/acl')) {
      return { entries: [] };
    }
    return {
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
      principals: {
        users: [{ id: 'u1', name: 'alice', label: 'alice', principalType: 'USER' }],
        groups: [{ id: 'g1', name: 'editors', label: 'editors', principalType: 'GROUP' }],
      },
    };
  }),
  apiPost: jest.fn(async () => ({ message: 'ok' })),
}));

const { apiPost } = jest.requireMock('@/lib/apiUtils');

describe('PermissionModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnApplied = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Windows-style asset permission dialog', async () => {
    render(
      <PermissionModal isOpen={true} onClose={mockOnClose} onApplied={mockOnApplied} />
    );

    expect(screen.getByRole('heading', { name: /asset permissions/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/object type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^read$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/full control/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Pulse')).toBeInTheDocument();
    });
  });

  it('requires selecting assets before apply', async () => {
    render(
      <PermissionModal isOpen={true} onClose={mockOnClose} onApplied={mockOnApplied} />
    );

    await waitFor(() => expect(screen.getByText('Pulse')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/select one or more assets/i);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('applies ACL for selected assets and users', async () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onApplied={mockOnApplied}
        initialResourceType="SURVEY"
      />
    );

    await waitFor(() => expect(screen.getByText('Pulse')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/pulse/i));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /create user/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^alice$/i }));
    await screen.findByRole('option', { name: /alice/i });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/permissions/acl',
        expect.objectContaining({
          resourceType: 'SURVEY',
          allObjects: false,
          objects: [expect.objectContaining({ id: 's1' })],
          entries: [
            expect.objectContaining({
              principalType: 'USER',
              principalId: 'u1',
              scopes: ['READ'],
            }),
          ],
        })
      );
      expect(
        apiPost.mock.calls.every(([url]) => !/\/groups\/.+\/permissions/.test(String(url)))
      ).toBe(true);
    });
    expect(mockOnClose).toHaveBeenCalled();
    expect(mockOnApplied).toHaveBeenCalled();
  });
});
