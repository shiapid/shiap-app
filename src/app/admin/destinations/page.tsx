import {requireAdmin} from '@/lib/admin/guard';
import {DestinationMaster} from '@/components/admin/destination-master';
export const dynamic='force-dynamic';
export default async function DestinationsAdminPage(){await requireAdmin();return <DestinationMaster/>;}
