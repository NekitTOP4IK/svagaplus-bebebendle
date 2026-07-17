"use client";

import { useAdmin } from "@/hooks/use-admin";
import { LoginForm } from "@/components/admin/login-form";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

export default function AdminPage() {
  const {
    isAuthenticated,
    role,
    scrans,
    loading,
    currentPage,
    totalItems,
    totalPages,
    sortField,
    sortOrder,
    view,
    subscriberOnly,
    subscriberCount,
    regularCount,
    searchQuery,
    statusFilter,
    authorTelegramId,
    login,
    logout,
    approveScran,
    rejectScran,
    banScran,
    banUser,
    deleteScran,
    recheckSubscriber,
    bulkAction,
    editScran,
    restoreScran,
    handleSort,
    setCurrentPage,
    setView,
    setSubscriberOnly,
    toggleSubscriberOnly,
    setSearchQuery,
    setStatusFilter,
    setAuthorTelegramId,
  } = useAdmin();

  if (!isAuthenticated) {
    return <LoginForm onLogin={login} />;
  }

  return (
    <AdminDashboard
      scrans={scrans}
      loading={loading}
      currentPage={currentPage}
      totalItems={totalItems}
      totalPages={totalPages}
      sortField={sortField}
      sortOrder={sortOrder}
      view={view}
      role={role}
      subscriberOnly={subscriberOnly}
      subscriberCount={subscriberCount}
      regularCount={regularCount}
      searchQuery={searchQuery}
      statusFilter={statusFilter}
      authorTelegramId={authorTelegramId}
      onSort={handleSort}
      onPageChange={setCurrentPage}
      onApprove={approveScran}
      onReject={rejectScran}
      onBan={banScran}
      onBanUser={banUser}
      onDelete={deleteScran}
      onRecheckSubscriber={recheckSubscriber}
      onBulk={bulkAction}
      onEdit={editScran}
      onRestore={restoreScran}
      onSetView={setView}
      onSetSubscriberOnly={setSubscriberOnly}
      onToggleSubscriberOnly={toggleSubscriberOnly}
      onSearchChange={setSearchQuery}
      onStatusFilterChange={setStatusFilter}
      onAuthorFilterChange={setAuthorTelegramId}
      onLogout={logout}
    />
  );
}
