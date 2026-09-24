import type { User } from '../lib/types';
import AdminDashboard from './AdminDashboard';
import BuyerDashboard from './BuyerDashboard';
import FarmerDashboard from './FarmerDashboard';

export default function Dashboard({ user, tab }: { user: User; tab: string }) {
  if (user.role === 'ADMIN') return <AdminDashboard user={user} tab={tab} />;
  if (user.role === 'FARMER') return <FarmerDashboard user={user} tab={tab} />;
  return <BuyerDashboard user={user} tab={tab} />;
}
