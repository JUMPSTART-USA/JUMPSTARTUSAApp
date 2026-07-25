import { Route, Routes } from 'react-router-dom';
import { FleetAlertsPage } from './FleetAlertsPage';
import { VehicleProfilePage } from './VehicleProfilePage';
import { VehiclesListPage } from './VehiclesListPage';

export function VehiclesRoutes() {
  return (
    <Routes>
      <Route index element={<VehiclesListPage />} />
      <Route path="alerts" element={<FleetAlertsPage />} />
      <Route path=":id" element={<VehicleProfilePage />} />
    </Routes>
  );
}
