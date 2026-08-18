import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PermissionModal from '@/components/ui/PermissionModal';
import { clearGeoSessionCache } from '@/lib/geoSessionCache';

const catalog = {
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
      resourceType: 'COUNTY',
      label: 'Counties',
      objects: [],
    },
  ],
  principals: {
    users: [{ id: 'u1', name: 'alice', label: 'alice', principalType: 'USER' }],
    groups: [{ id: 'g1', name: 'editors', label: 'editors', principalType: 'GROUP' }],
  },
};

jest.mock('@/lib/apiUtils', () => ({
  apiGet: jest.fn(async (url: string) => {
    const href = String(url);
    if (href.includes('/permissions/acl')) {
      return { entries: [] };
    }
    if (href.startsWith('/regions')) {
      return { items: [{ _id: 'r1', name: 'Centro-Oeste', code: 'CO' }] };
    }
    if (href.startsWith('/states')) {
      return { items: [{ _id: 'st1', name: 'Goiás', code: 'GO' }] };
    }
    if (href.startsWith('/biomes') || href.startsWith('/microregions')) {
      return { items: [] };
    }
    if (href.startsWith('/counties?') || href.startsWith('/counties&')) {
      if (href.includes('q=')) {
        return {
          items: [{ _id: 'c2', name: 'Goiânia', IBGECode: '5208707' }],
        };
      }
      return {
        items: [
          { _id: 'c1', name: 'Abadia de Goiás', IBGECode: '5200050' },
          { _id: 'c2', name: 'Goiânia', IBGECode: '5208707' },
        ],
      };
    }
    if (href.startsWith('/counties/')) {
      return { _id: 'c1', name: 'Abadia de Goiás', IBGECode: '5200050' };
    }
    return catalog;
  }),
  apiPost: jest.fn(async (url: string) => {
    if (String(url).includes('/permissions/acl/query')) {
      return { entries: [] };
    }
    return { message: 'ok' };
  }),
}));

const { apiGet, apiPost } = jest.requireMock('@/lib/apiUtils');

function aclQueryCalls() {
  return apiPost.mock.calls.filter(([url]) => String(url).includes('/permissions/acl/query'));
}

function countyRegionCalls() {
  return apiGet.mock.calls.filter(([url]) => String(url).includes('regionId=r1'));
}

describe('PermissionModal Component', () => {
  const mockOnClose = jest.fn();
  const mockOnApplied = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    clearGeoSessionCache();
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
    expect(apiPost.mock.calls.some(([url]) => String(url) === '/permissions/acl')).toBe(false);
  });

  it('filters the asset checklist without changing selection', async () => {
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
    fireEvent.change(screen.getByPlaceholderText(/filter by name/i), { target: { value: 'NPS' } });

    expect(screen.queryByText('Pulse')).not.toBeInTheDocument();
    expect(screen.getByText('NPS')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/filter by name/i), { target: { value: '' } });
    expect(screen.getByLabelText(/pulse/i)).toBeChecked();
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
      expect(screen.getByRole('button', { name: /add user/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /add user/i }));
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

  it('removes multiple principals in bulk', async () => {
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
      expect(screen.getByRole('button', { name: /add user/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /add user/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^alice$/i }));
    fireEvent.click(screen.getByRole('button', { name: /add group/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^editors$/i }));

    expect(await screen.findByRole('option', { name: /alice/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /editors/i })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/select alice/i));
    fireEvent.click(screen.getByLabelText(/select editors/i));
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));

    expect(screen.queryByRole('option', { name: /alice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /editors/i })).not.toBeInTheDocument();
  });

  it('lists counties after selecting a region and applies those ids', async () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onApplied={mockOnApplied}
        initialResourceType="COUNTY"
      />
    );

    await waitFor(() => expect(screen.getByLabelText(/geography type/i)).toBeInTheDocument());
    expect(
      screen.getByText(/select a region, state, biome, microregion, or county to list assets/i)
    ).toBeInTheDocument();
    expect(screen.queryByText('Pulse')).not.toBeInTheDocument();

    const regionSelect = await screen.findByLabelText(/^region$/i);
    await waitFor(() => expect(screen.getByRole('option', { name: /centro-oeste/i })).toBeInTheDocument());
    fireEvent.change(regionSelect, { target: { value: 'r1' } });

    expect(await screen.findByText('Abadia de Goiás (5200050)')).toBeInTheDocument();
    expect(screen.getByText('Goiânia (5208707)')).toBeInTheDocument();
    expect(countyRegionCalls().length).toBe(1);
    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/permissions/acl/query',
        expect.objectContaining({
          resourceType: 'COUNTY',
          resourceIds: ['c1', 'c2'],
        })
      );
    });

    fireEvent.click(screen.getByLabelText(/abadia de goiás/i));
    expect(screen.getByText('Abadia de Goiás (5200050)')).toBeInTheDocument();
    expect(screen.getByLabelText(/abadia de goiás/i)).not.toBeChecked();
    expect(countyRegionCalls().length).toBe(1);
    expect(aclQueryCalls()).toHaveLength(1);

    fireEvent.change(screen.getByPlaceholderText(/filter by name/i), {
      target: { value: 'Goiânia' },
    });
    expect(screen.queryByText('Abadia de Goiás (5200050)')).not.toBeInTheDocument();
    expect(screen.getByText('Goiânia (5208707)')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/filter by name/i), { target: { value: '' } });
    expect(screen.getByText('Abadia de Goiás (5200050)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add user/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^alice$/i }));
    await screen.findByRole('option', { name: /alice/i });
    fireEvent.click(screen.getByRole('button', { name: /^apply$/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/permissions/acl',
        expect.objectContaining({
          resourceType: 'COUNTY',
          allObjects: false,
          objects: [expect.objectContaining({ id: 'c2', name: 'Goiânia' })],
          entries: [
            expect.objectContaining({
              principalType: 'USER',
              principalId: 'u1',
            }),
          ],
        })
      );
    });
  });

  it('adds an individual county from the county geography type', async () => {
    render(
      <PermissionModal
        isOpen={true}
        onClose={mockOnClose}
        onApplied={mockOnApplied}
        initialResourceType="COUNTY"
      />
    );

    const geoType = await screen.findByLabelText(/geography type/i);
    fireEvent.change(geoType, { target: { value: 'county' } });

    const search = screen.getByPlaceholderText(/filter counties/i);
    fireEvent.change(search, { target: { value: 'Goiânia' } });

    const countySelect = screen.getByLabelText(/^county$/i);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /goiânia/i })).toBeInTheDocument()
    );
    fireEvent.change(countySelect, { target: { value: 'c2' } });

    expect(await screen.findByText('Goiânia (5208707)')).toBeInTheDocument();
    expect(screen.getByLabelText(/goiânia/i)).toBeChecked();
    expect(
      apiGet.mock.calls.some(([url]) => decodeURIComponent(String(url)).includes('q=Goiânia'))
    ).toBe(true);
  });
});
