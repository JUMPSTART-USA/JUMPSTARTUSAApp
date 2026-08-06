import { Route, Routes } from 'react-router-dom';
import { CampaignDetailPage } from './campaigns/CampaignDetailPage';
import { CampaignsListPage } from './campaigns/CampaignsListPage';
import { AcknowledgmentsPage } from './donors/AcknowledgmentsPage';
import { DevelopmentSetupPage } from './donors/DevelopmentSetupPage';
import { DonationsListPage } from './donors/DonationsListPage';
import { DonorProfilePage } from './donors/DonorProfilePage';
import { DonorsListPage } from './donors/DonorsListPage';
import { DonorTasksPage } from './donors/DonorTasksPage';
import { PledgeDetailPage } from './donors/PledgeDetailPage';
import { PledgesListPage } from './donors/PledgesListPage';
import { RecurringGiftDetailPage } from './donors/RecurringGiftDetailPage';
import { RecurringGiftsPage } from './donors/RecurringGiftsPage';
import { EventDetailPage } from './events/EventDetailPage';
import { EventsListPage } from './events/EventsListPage';
import { VendorsListPage } from './vendors/VendorsListPage';

export function DonorsRoutes() {
  return (
    <Routes>
      <Route index element={<DonorsListPage />} />
      <Route path="donations" element={<DonationsListPage />} />
      <Route path="pledges" element={<PledgesListPage />} />
      <Route path="pledges/:id" element={<PledgeDetailPage />} />
      <Route path="recurring" element={<RecurringGiftsPage />} />
      <Route path="recurring/:id" element={<RecurringGiftDetailPage />} />
      <Route path="acknowledgments" element={<AcknowledgmentsPage />} />
      <Route path="tasks" element={<DonorTasksPage />} />
      <Route path="setup" element={<DevelopmentSetupPage />} />
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
