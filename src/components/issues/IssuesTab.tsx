import React, { useState, useEffect, useCallback } from 'react';
import type { IssueWithDetails, IssueEntityType, IssueStatus } from '../../types/IssueTypes';
import { getIssuesForEntity, updateIssue } from '../../utils/issueService';
import { usePermissions } from '../../hooks/usePermissions';
import { IssuesList } from './IssuesList';
import { CreateIssueDialog } from './CreateIssueDialog';
import { IssueDetailDialog } from './IssueDetailDialog';

interface IssuesTabProps {
  entityType: IssueEntityType;
  entityId: string;
  entityName?: string;
}

export const IssuesTab: React.FC<IssuesTabProps> = ({ entityType, entityId, entityName }) => {
  const { permissions } = usePermissions();
  const [issues, setIssues] = useState<IssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<IssueWithDetails | null>(null);

  // Permission checks
  const canCreate = permissions?.create_training_issues ?? false;
  const canResolve = permissions?.resolve_training_issues ?? false;

  // Load issues
  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIssuesForEntity(entityType, entityId);
      setIssues(data);
    } catch (err: any) {
      console.error('Error loading issues:', err);
      // Handle Supabase errors which have a message property
      const message = err?.message || err?.error?.message || (typeof err === 'string' ? err : 'Failed to load issues');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    loadIssues();
  }, [loadIssues]);

  // Handle status toggle from list
  const handleStatusToggle = async (issue: IssueWithDetails, newStatus: IssueStatus) => {
    try {
      await updateIssue(issue.id, { status: newStatus });
      await loadIssues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update issue');
    }
  };

  // Handle issue click - open detail dialog
  const handleIssueClick = (issue: IssueWithDetails) => {
    setSelectedIssue(issue);
  };

  // Handle create dialog close
  const handleCreateClose = () => {
    setShowCreateDialog(false);
  };

  // Handle issue created
  const handleIssueCreated = () => {
    loadIssues();
    setShowCreateDialog(false);
  };

  // Handle issue updated in detail dialog
  const handleIssueUpdated = async () => {
    await loadIssues();
    // Find and update the selected issue with new data
    if (selectedIssue) {
      const updatedIssue = issues.find((i) => i.id === selectedIssue.id);
      if (updatedIssue) {
        setSelectedIssue(updatedIssue);
      }
    }
  };

  // Handle issue deleted
  const handleIssueDeleted = () => {
    setSelectedIssue(null);
    loadIssues();
  };

  return (
    <div>
      <IssuesList
        issues={issues}
        loading={loading}
        error={error}
        onIssueClick={handleIssueClick}
        onStatusToggle={canResolve ? handleStatusToggle : undefined}
        canCreate={canCreate}
        canResolve={canResolve}
        onCreateClick={() => setShowCreateDialog(true)}
        showFilters={true}
        emptyMessage="No issues have been reported yet"
      />

      {/* Create Issue Dialog */}
      <CreateIssueDialog
        isOpen={showCreateDialog}
        onClose={handleCreateClose}
        onIssueCreated={handleIssueCreated}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
      />

      {/* Issue Detail Dialog */}
      <IssueDetailDialog
        isOpen={selectedIssue !== null}
        issue={selectedIssue}
        onClose={() => setSelectedIssue(null)}
        onIssueUpdated={handleIssueUpdated}
        onIssueDeleted={handleIssueDeleted}
        canEdit={canCreate}
        canResolve={canResolve}
        canComment={canCreate}
      />
    </div>
  );
};

export default IssuesTab;
