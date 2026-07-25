import { Route, Routes } from 'react-router-dom';
import { CampaignDetailPage } from './campaigns/CampaignDetailPage';
import { CampaignsListPage } from './campaigns/CampaignsListPage';
import { DonationsListPage } from './donors/DonationsListPage';
import { DonorProfilePage } from './donors/DonorProfilePage';
import { DonorsListPage } from './donors/DonorsListPage';
import { EventDetailPage } from './events/EventDetailPage';
import { EventsListPage } from './events/EventsListPage';
import { VendorsListPage } from './vendors/VendorsListPage';

export function DonorsRoutes() {
  return (
    <Routes>
      <Route index element={<DonorsListPage />} />
      <Route path="donations" element={<DonationsListPage />} />
      <Route path=":id" element={<DonorProfilePage />} />
    </Routes>
  );
}

export function CampaignsRoutes() {
  return (
    <Routes>
      <Route index element={<CampaignsListPage />} />
      <Route path=":id" element={<CampaignDetailPage />} />
    </Routes>
  );
}

export function EventsRoutes() {
  return (
    <Routes>
      <Route index element={<EventsListPage />} />
      <Route path=":id" element={<EventDetailPage />} />
    </Routes>
  );
}

export function VendorsRoutes() {
  return (
    <Routes>
      <Route index element={<VendorsListPage />} />
    </Routes>
  );
}
