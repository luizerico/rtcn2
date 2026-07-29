import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

// Define resource types and props structure
type ResourceType = 'group' | 'object';

interface AddMemberModalProps {
  resourceType: ResourceType;
}

const AddMemberModal: React.FC<AddMemberModalProps> = ({ resourceType }) => {
  const [userId, setUserId] = React.useState('');
  const onAddUser = async () => {
    if (!userId) return;
    // Placeholder for API call using provided utilities
    console.log(\`Attempting to add user \${userId} to a \${resourceType}.\`);
    try {
      // Example: await apiGet(`/api/${resourceType}/members/add`, { userId });
      alert('API call placeholder executed.');
    } catch (error) {
      console.error('Failed to add member:', error);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {/* Button replacement logic will happen in parent components */}
        <Button variant="outline">Add Member</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add User to {resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}</DialogTitle>
          <p className="text-muted-foreground">Enter the user ID to add this member.</p>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <label htmlFor="user-id" className="block text-sm font-medium">User ID</label>
          <input
            id="user-id"
            type="text"
            placeholder="Enter User ID (e.g., user-123)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full border p-2 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => {}}>Cancel</Button>
          <Button onClick={onAddUser} disabled={!userId}>
            Add User
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddMemberModal;