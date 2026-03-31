import { Spinner } from "react-bootstrap";
import { useFeatureRolloutAccess } from "../hooks/use-feature-rollout-access";
import { useAdminCheck } from "../hooks/use-admin-check";
import MaintenancePage from "../pages/maintenance/MaintenancePage";

interface MaintenanceGateProps {
  children: React.ReactNode;
}

export default function MaintenanceGate({ children }: MaintenanceGateProps) {
  const { access, loading: featureLoading } = useFeatureRolloutAccess();
  const { isDeveloper, loading: roleLoading } = useAdminCheck();

  if (featureLoading || roleLoading) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Spinner animation="border" size="sm" />
          <span>Loading</span>
        </div>
      </div>
    );
  }

  const maintenanceActive = access?.features.maintenanceMode.canUse === true;

  if (maintenanceActive && !isDeveloper) {
    return <MaintenancePage />;
  }

  return <>{children}</>;
}
