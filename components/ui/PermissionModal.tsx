import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// Define permission types and resource type
type PermissionLevel = 'READ' | 'WRITE' | 'DELETE';
type ResourceType = 'group' | 'object';

interface PermissionModalProps {
  resourceType: ResourceType;
}

const initialPermissions: Record<PermissionLevel, boolean> = {
  READ: false,
  WRITE: false,
  DELETE: false,
};

const PermissionModal: React.FC<PermissionModalProps> = ({ resourceType }) => {
  const [permissions, setPermissions] = useState(initialPermissions);

  const handleTogglePermission = (level: PermissionLevel) => {
    setPermissions(prev => ({ ...prev, [level]: !prev[level] }));
  };

  const onUpdatePolicy = async () => {
    // Placeholder for API call using provided utilities
    console.log(`Attempting to update policy for ${resourceType}:`, permissions);
    try {
      // Example: await apiGet(`/api/${resourceType}/policies/update`, { resourceId, policies: Object.fromEntries(Object.entries(permissions).map(([key, value]) => [key, value])) });
      alert('API call placeholder executed.');
    } catch (error) {
      console.error('Failed to update policy:', error);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* Button replacement logic will happen in parent components */}
        <Button variant="outline">Manage Policy</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} Policy Management</DialogTitle>
          <p className="text-muted-foreground">Set granular permissions (READ, WRITE, DELETE).</p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {Object.keys(initialPermissions).map((level) => {
            const permissionLevel = level as PermissionLevel;
            return (
              <div key={permissionLevel} className="flex items-center justify-between py-2">
                <span>{permissionLevel} Access</span>
                <button
                  type="button"
                  onClick={() => handleTogglePermission(permissionLevel)}
                  className={`p-1 rounded-full text-sm ${permissions[permissionLevel] ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'} transition-colors`}
                >
                  {permissions[permissionLevel] ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => {}}>Cancel</Button>
          <Button onClick={onUpdatePolicy}>Save Policy</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PermissionModal;