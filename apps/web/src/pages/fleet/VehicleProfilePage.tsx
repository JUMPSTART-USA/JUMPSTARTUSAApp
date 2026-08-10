import { CHAPTER_NAMES, type ChapterState } from '@jumpstart/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AttachmentsCard } from '@/components/AttachmentsCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardHeaderRow, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DescriptionList, InfoItem } from '@/components/ui/description-list';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/utils';
import { MaintenanceFormDialog } from './MaintenanceFormDialog';
import { SeverityBadge, vehicleLabel } from './shared';
import { VehicleFormDialog } from './VehicleFormDialog';
import type { MaintenanceRecord, MaintenanceSummary, VehicleProfile } from './types';
import { BackLink } from '@/components/BackLink';

export function VehicleProfilePage() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);
  const [deletingRecord, setDeletingRecord] = useState<MaintenanceRecord | null>(null);
  const [receiptsRecord, setReceiptsRecord] = useState<MaintenanceRecord | null>(null);

  const query = useQuery({
    queryKey: ['fleet', 'vehicles', id, 'profile'],
    queryFn: () => api.get<VehicleProfile>(`/vehicles/${id}/profile`),
    enabled: !!id,
  });

  const summaryQuery = useQuery({
    queryKey: ['fleet', 'maintenance-summary', id],
    queryFn: () =>
      api.get<MaintenanceSummary>(`/vehicles/maintenance/summary${qs({ vehicleId: id })}`),
    enabled: !!id,
  });

  const deleteVehicle = useMutation({
    mutationFn: () => api.delete(`/vehicles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fleet'] });
      navigate('/vehicles');
    },
  });

  const deleteRecord = useMutation({
    mutationFn: (recordId: string) => api.delete(`/vehicles/maintenance/${recordId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['fleet'] });
      setDeletingRecord(null);
    },
  });

  if (query.isLoading) return <PageLoader />;
  if (query.isError) {
    return (
      <div className="space-y-4">
        <BackLink fallbackTo="/vehicles" fallbackLabel="Vehicles" />
        <ErrorState error={query.error} onRetry={query.refetch} />
      </div>
    );
  }
  if (!query.data) return null;

  const { vehicle, maintenanceRecords, alerts } = query.data;
  const summary = summaryQuery.data;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <BackLink fallbackTo="/vehicles" fallbackLabel="Vehicles" />
        <PageHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              {vehicleLabel(vehicle)}
              {vehicle.active ? (
                <Badge variant="success">Active</Badge>
              ) : (
                <Badge variant="outline">Inactive</Badge>
              )}
            </span>
          }
          description={
            [vehicle.licensePlate, vehicle.assignedLocation].filter(Boolean).join(' · ') || '—'
          }
          actions={
            <>
              {can('vehicles.create') ? (
                <Button onClick={() => setLogOpen(true)}>
                  <Wrench className="h-4 w-4" /> Log maintenance
                </Button>
              ) : null}
              {can('vehicles.update') ? (
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              ) : null}
              {can('vehicles.delete') ? (
                <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </Button>
              ) : null}
            </>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DescriptionList columns={3}>
              <InfoItem label="Color">{vehicle.color}</InfoItem>
              <InfoItem label="License plate">{vehicle.licensePlate}</InfoItem>
              <InfoItem label="Mileage">
                {vehicle.mileage != null ? vehicle.mileage.toLocaleString('en-US') : null}
              </InfoItem>
              <InfoItem label="VIN">{vehicle.vin}</InfoItem>
              <InfoItem label="Assigned location">{vehicle.assignedLocation}</InfoItem>
              {/* The vehicle's chapter (§7.2). */}
              <InfoItem label="Chapter">
                {CHAPTER_NAMES[vehicle.chapterState as ChapterState] ?? vehicle.chapterState}
              </InfoItem>
              <InfoItem label="Registration expires">
                {vehicle.registrationExpiration
                  ? formatDate(vehicle.registrationExpiration)
                  : null}
              </InfoItem>
              <InfoItem label="Insurance expires">
                {vehicle.insuranceExpiration ? formatDate(vehicle.insuranceExpiration) : null}
              </InfoItem>
            </DescriptionList>
            {vehicle.notes ? (
              <div className="border-t pt-3">
                <DescriptionList columns={1}>
                  <InfoItem label="Notes">
                    <span className="whitespace-pre-wrap">{vehicle.notes}</span>
                  </InfoItem>
                </DescriptionList>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No alerts — maintenance, registration and insurance are all current.
              </p>
            ) : (
              <ul className="space-y-2">
                {alerts.map((alert, i) => (
                  <li key={`${alert.type}-${i}`} className="flex items-start gap-2 text-sm">
                    <SeverityBadge severity={alert.severity} />
                    <span>{alert.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeaderRow title="Maintenance history">
            {can('vehicles.create') ? (
              <Button variant="outline" size="sm" onClick={() => setLogOpen(true)}>
                <Plus className="h-4 w-4" /> Log
              </Button>
            ) : null}
          </CardHeaderRow>
          <CardContent>
            {maintenanceRecords.length === 0 ? (
              <EmptyState
                title="No maintenance logged yet"
                hint="The latest service record sets the next-due schedule for alerts."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Mileage</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead>Next due</TableHead>
                    {/* Always rendered: the receipts affordance needs only read access. */}
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenanceRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{formatDate(record.maintenanceDate)}</TableCell>
                      <TableCell className="font-medium">{record.maintenanceType}</TableCell>
                      <TableCell className="text-right">
                        {record.mileageAtService != null
                          ? record.mileageAtService.toLocaleString('en-US')
                          : '—'}
                      </TableCell>
                      <TableCell>{record.vendor?.name ?? '—'}</TableCell>
                      <TableCell className="text-right">{formatMoney(record.cost)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[
                          record.nextServiceDueDate ? formatDate(record.nextServiceDueDate) : null,
                          record.nextServiceDueMileage != null
                            ? `${record.nextServiceDueMileage.toLocaleString('en-US')} mi`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="View receipts"
                          onClick={() => setReceiptsRecord(record)}
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                        {can('vehicles.update') ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit maintenance record"
                            onClick={() => setEditingRecord(record)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        ) : null}
                        {can('vehicles.delete') ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete maintenance record"
                            onClick={() => setDeletingRecord(record)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Maintenance cost</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summaryQuery.isError ? (
              <ErrorState error={summaryQuery.error} onRetry={summaryQuery.refetch} />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border bg-muted/30 p-3 text-center">
                  <div>
                    <p className="text-2xl font-semibold">{formatMoney(summary?.totalCost ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">Total cost</p>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold">{summary?.records ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Services</p>
                  </div>
                </div>
                {summary && summary.byType.length > 0 ? (
                  <ul className="space-y-1.5">
                    {summary.byType.map((row) => (
                      <li key={row.type} className="flex items-center justify-between text-sm">
                        <span>{row.type}</span>
                        <span className="font-medium">{formatMoney(row.total)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No costs recorded yet.</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <VehicleFormDialog open={editOpen} onOpenChange={setEditOpen} vehicle={vehicle} />
      <MaintenanceFormDialog open={logOpen} onOpenChange={setLogOpen} vehicleId={vehicle.id} />
      <MaintenanceFormDialog
        open={!!editingRecord}
        onOpenChange={(open) => {
          if (!open) setEditingRecord(null);
        }}
        vehicleId={vehicle.id}
        record={editingRecord ?? undefined}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete vehicle"
        description={`Delete ${vehicleLabel(vehicle)}? The record is retained for audit but removed from lists.`}
        confirmLabel="Delete vehicle"
        isPending={deleteVehicle.isPending}
        error={deleteVehicle.error ? deleteVehicle.error.message : null}
        onConfirm={() => deleteVehicle.mutate()}
      />
      {/* Receipts live on the profile (not the log/edit form): a record needs
          an id before files can attach, and the form dialog stays submit-only. */}
      <Dialog
        open={!!receiptsRecord}
        onOpenChange={(open) => {
          if (!open) setReceiptsRecord(null);
        }}
      >
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Receipts</DialogTitle>
            <DialogDescription>
              {receiptsRecord
                ? `${receiptsRecord.maintenanceType} — ${formatDate(receiptsRecord.maintenanceDate)}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {receiptsRecord ? (
            <AttachmentsCard
              compact
              entityType="vehicle_maintenance_record"
              entityId={receiptsRecord.id}
              title="Receipts"
              canUpload={can('vehicles.update')}
              canDelete={can('vehicles.update')}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={!!deletingRecord}
        onOpenChange={(open) => {
          if (!open) setDeletingRecord(null);
        }}
        title="Delete maintenance record"
        description={
          deletingRecord
            ? `Delete the ${deletingRecord.maintenanceType} record from ${formatDate(deletingRecord.maintenanceDate)}? This may change the vehicle's next-due alerts.`
            : ''
        }
        confirmLabel="Delete record"
        isPending={deleteRecord.isPending}
        error={deleteRecord.error ? deleteRecord.error.message : null}
        onConfirm={() => deletingRecord && deleteRecord.mutate(deletingRecord.id)}
      />
    </div>
  );
}
