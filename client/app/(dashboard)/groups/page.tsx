const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);

// Handlers for AddMemberModal
const handleAddUser = async (userId: string) => {
    try {
        // Assume this API call updates group membership for the current Group context.
        await apiGet(`/groups/${group._id}/members/add?userId=${userId}`); 
        alert('Successfully added user.');
    } catch (error) {
        console.error("Error adding member:", error);
        alert('Failed to add user.');
    } finally {
        setIsMemberModalOpen(false);
    }
};

// Handlers for PermissionModal
const handleSavePermissions = async (scope: ResourceScope, isValid: boolean) => {
    if (!isValid) return;
    try {
        // Assume this API call updates the group's global policies.
        await apiGet(`/groups/${group._id}/permissions/update`); 
        alert('Successfully saved permissions.');
    } catch (error) {
        console.error("Error saving permissions:", error);
        alert('Failed to save permissions.');
    } finally {
        setIsPermissionModalOpen(false);
    }
};

// Define the structure of a Group object expected from the API
interface GroupModel {
  _id: string;
  name: string;
  description: string;
  users: string[]; // Array of User IDs belonging to this group
  createdAt: Date;
  updatedAt: Date;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<GroupModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGroups() {
      try {
        // Calls the GET /api/groups endpoint (protected by authorize('GROUP:READ'))
        const data = await apiGet('/groups'); 
        setGroups(data);
      } catch (err) {
        console.error("Failed to fetch groups:", err);
        setError('Failed to load groups. Ensure your API is running and you have GROUP:READ permissions.');
      } finally {
        setLoading(false);
      }
    }
    fetchGroups();
  }, []);

  if (loading) {
    return <div className="p-10 text-center">Loading Groups...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-6" role="alert">
          <p className="font-bold">Error Loading Groups</p>
          <p>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center border-b pb-4 mb-6">
        <h1 className="text-3xl font-extrabold text-gray-900">Group Management</h1>
        <button 
            // This button should trigger a modal or navigate to a creation form, requiring GROUP:CREATE permission.
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg shadow transition duration-150 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
            Create New Group
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="p-4 border-b flex justify-between items-center">
             <h2 className="text-xl font-semibold text-gray-900">Available Groups ({groups.length})</h2>
             {/* Placeholder for Group Filtering/Searching */}
            <input type="search" placeholder="Search groups by name or description..." className="p-2 border rounded-md w-72 focus:ring-indigo-500 focus:border-indigo-500"/>
        </div>

        <div className="overflow-hidden border-b">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              <tr>
                <th scope="col" className="px-6 py-3">Name</th>
                <th scope="col" className="px-6 py-3 max-w-[200px] truncate">Description</th>
                <th scope="col" className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900">Members</th>
                <th scope="col" className="px-6 py-3 whitespace-nowrap text-right text-sm font-medium text-gray-900">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {groups.map((group) => (
                <tr key={group._id} className="hover:bg-gray-50 transition duration-100 cursor-pointer">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">{group.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 max-w-[200px] truncate">{group.description || 'No description provided.'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {group.users && group.users.length > 0 ? `${group.users.length} Members` : 'No Members'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link href={`/groups/${group._id}`} className="text-indigo-600 hover:text-indigo-900">View</Link>
                    {/* Edit button placeholder */}
                    <button className="text-yellow-600 hover:text-yellow-900" title="Edit">Edit</button> 
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

       {/* Section to manage permissions/memberships - This would trigger a complex modal */}
       <div className="mt-10 p-6 bg-gray-50 rounded-xl shadow border border-gray-200">
           <h3 className="text-xl font-bold text-gray-800 mb-4">Advanced Permissions & Membership</h3>
           <p className='mb-4 text-gray-600'>This section manages the core RBAC policies: which Objects types this group can READ/WRITE/DELETE, and which specific users belong to the group.</p>

            <div className="flex gap-4">
                <AddMemberModal resourceType={"group"} />
                <PermissionModal resourceType={"group"} />
            </div>
       </div>
    </div>
  );
}