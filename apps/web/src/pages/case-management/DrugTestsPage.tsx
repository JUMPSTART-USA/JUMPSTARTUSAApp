import { useQuery } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DRUG_TEST_RESULT_LABELS, DRUG_TEST_RESULTS, DRUG_TEST_TYPE_LABELS } from '@jumpstart/shared';
import { backTo } from '@/components/BackLink';
import { ChapterFilterSelect } from '@/components/ChapterSelect';
import { DataTable, initialListState, type Column, type ListState } from '@/components/DataTable';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { SectionHeader } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/spinner';
import { ListToolbar, ToolbarDateField } from '@/components/ui/toolbar';
import { ParticipantPicker, type PickerOption } from '@/components/pickers';
import { api, qs, type Paged } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDate, fullName } from '@/lib/utils';
import { DrugTestFormDialog } from './drug-test-dialogs';
import { type DrugTestRow } from './shared';

export function DrugTestsPage() {
  const { can } = useAuth();
  const [listState, setListState] = useState<ListState>({ ...initialListState, sortDir: 'desc' });
  const [participant, setParticipant] = useState<PickerOption | null>(null);
  const [result, setResult] = useState('');
  const [state, setState] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dialogTest, setDialogTest] = useState<DrugTestRow | 'new' | null>(null);
  const canEdit = can('case_management.update');
  const canOpenParticipant = can('participants.read');

  const params = qs({
    page: listState.page,
    pageSize: listState.pageSize,
    sortBy: listState.sortBy,
    sortDir: listState.sortDir,
    participantProfileId: participant?.id,
    result,
    state,
    from,
    to,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['case-management', 'drug-tests', params],
    queryFn: () => api.get<Paged<DrugTestRow>>(`/drug-tests${params}`),
  });

  const columns: Column<DrugTestRow>[] = [
    {
      key: 'testDate',
      header: 'Date',
      sortKey: 'testDate',
      render: (t) => formatDate(t.testDate),
      className: 'whitespace-nowrap',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (t) =>
        canOpenParticipant ? (
          <Link
            to={`/participants/${t.participantProfileId}`}
            {...backTo('/case-management/drug-tests', 'Drug tests')}
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {fullName(t.participant.person)}
          </Link>
        ) : (
          fullName(t.participant.person)
        ),
    },
    {
      key: 'testType',
      header: 'Type',
      render: (t) => DRUG_TEST_TYPE_LABELS[t.testType],
    },
    {
      key: 'result',
      header: 'Result',
      render: (t) => <StatusBadge status={t.result} />,
    },
    {
      key: 'photo',
      header: 'Photo',
      render: (t) =>
        t.hasPhoto ? (
          <a
            href={`/api/drug-tests/${t.id}/photo`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            View
          </a>
        ) : (
          '—'
        ),
    },
    {
      key: 'notes',
      header: 'Notes',
      render: (t) =>
        t.notes ? <div className="max-w-xs truncate text-muted-foreground">{t.notes}</div> : '—',
    },
    ...(canEdit
      ? [
          {
            key: 'actions',
            header: '',
            className: 'w-10',
            render: (t: DrugTestRow) => (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Edit drug test"
                onClick={(e) => {
                  e.stopPropagation();
                  setDialogTest(t);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            ),
          } satisfies Column<DrugTestRow>,
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Drug tests"
        actions={
          can('case_management.create') ? (
            <Button onClick={() => setDialogTest('new')}>
              <Plus className="h-4 w-4" /> Record test
            </Button>
          ) : null
        }
      />

      <ListToolbar className="items-end">
        <div className="w-full sm:w-72">
          <ParticipantPicker
            value={participant}
            onChange={(p) => {
              setParticipant(p);
              setListState((s) => ({ ...s, page: 1 }));
            }}
          />
        </div>
        <FilterSelect
          aria-label="Result"
          className="w-full sm:w-44"
          value={result}
          onChange={(value) => {
            setResult(value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        >
          <option value="">All results</option>
          {DRUG_TEST_RESULTS.map((r) => (
            <option key={r} value={r}>
              {DRUG_TEST_RESULT_LABELS[r]}
            </option>
          ))}
        </FilterSelect>
        {/* Chapter scoping (§7.2): tests derive their chapter from the
            participant — hidden for scoped users, whom the API force-filters. */}
        <ChapterFilterSelect
          value={state}
          onChange={(v) => {
            setState(v);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <ToolbarDateField
          label="From"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
        <ToolbarDateField
          label="To"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setListState((s) => ({ ...s, page: 1 }));
          }}
        />
      </ListToolbar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        state={listState}
        onStateChange={setListState}
        emptyMessage="No drug tests recorded"
      />

      <DrugTestFormDialog
        test={dialogTest}
        initialParticipant={participant}
        onClose={() => setDialogTest(null)}
      />
    </div>
  );
}
