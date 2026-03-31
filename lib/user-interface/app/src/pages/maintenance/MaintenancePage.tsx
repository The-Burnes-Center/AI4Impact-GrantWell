import "../../styles/maintenance.css";

export default function MaintenancePage() {
  return (
    <main id="main-content" role="main" tabIndex={-1} className="maintenance-page">
      <div className="maintenance-container">
        <div className="maintenance-icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#14558F"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>

        <h1 className="maintenance-title">GrantWell is Under Maintenance</h1>

        <p className="maintenance-message">
          We are currently performing scheduled maintenance to improve your
          experience. The site will be back online shortly.
        </p>

        <p className="maintenance-submessage">
          Thank you for your patience. If you need immediate assistance, please
          contact your administrator.
        </p>
      </div>
    </main>
  );
}
