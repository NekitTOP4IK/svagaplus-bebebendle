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
    totalPages,
    sortField,
    sortOrder,
    view,
    subscriberOnly,
    subscriberCount,
    regularCount,
    login,
    approveScran,
    rejectScran,
    banScran,
    deleteScran,
    recheckSubscriber,
    handleSort,
    setCurrentPage,
    setView,
    setSubscriberOnly,
    toggleSubscriberOnly,
  } = useAdmin();

  if (!isAuthenticated) {
    return <LoginForm onLogin={login} />;
  }

  return (
    <AdminDashboard
      scrans={scrans}
      loading={loading}
      currentPage={currentPage}
      totalPages={totalPages}
      sortField={sortField}
      sortOrder={sortOrder}
      view={view}
      role={role}
      subscriberOnly={subscriberOnly}
      subscriberCount={subscriberCount}
      regularCount={regularCount}
      onSort={handleSort}
      onPageChange={setCurrentPage}
      onApprove={approveScran}
      onReject={rejectScran}
      onBan={banScran}
      onDelete={deleteScran}
      onRecheckSubscriber={recheckSubscriber}
      onSetView={setView}
      onSetSubscriberOnly={setSubscriberOnly}
      onToggleSubscriberOnly={toggleSubscriberOnly}
    />
  );
}
