export type PermissionLevel = 'ADMIN' | 'WRITE' | 'READ' | 'CREATE' | 'DELETE';
export type PrincipalType = 'USER' | 'GROUP';

export interface CatalogObject {
  id: string;
  name: string;
  label: string;
  detail?: string;
}

export interface CatalogClass {
  resourceType: string;
  label: string;
  objects: CatalogObject[];
}

export interface CatalogPrincipal {
  id: string;
  name: string;
  label: string;
  principalType: PrincipalType;
}

export interface AclEntry {
  principalType: PrincipalType;
  principalId: string;
  principalName: string;
  scopes: PermissionLevel[];
}

export interface UpdateAclPayload {
  resourceType: string;
  allObjects: boolean;
  objects: Array<{ id: string; label: string; name?: string }>;
  entries: Array<{
    principalType: PrincipalType;
    principalId: string;
    scopes: PermissionLevel[];
  }>;
}

export interface PermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplied?: () => void;
  initialResourceType?: string;
  /** Pre-select a specific asset when editing from a table row. */
  initialResourceId?: string | null;
  initialAllObjects?: boolean;
  initialPrincipalType?: PrincipalType | null;
  initialPrincipalId?: string | null;
}
