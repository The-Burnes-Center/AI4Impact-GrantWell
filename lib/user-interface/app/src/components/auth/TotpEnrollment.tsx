import { useState } from "react";
import { Button } from "react-bootstrap";
import { QRCodeSVG } from "qrcode.react";
import "../../styles/totp.css";

interface TotpEnrollmentProps {
  setupUri: string;
  secret: string;
}

export default function TotpEnrollment({ setupUri, secret }: TotpEnrollmentProps) {
  const [copied, setCopied] = useState(false);

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="totp-enrollment">
      <ol className="totp-enrollment-steps">
        <li>
          Open an authenticator app such as Google Authenticator, Microsoft
          Authenticator, or 1Password.
        </li>
        <li>Scan this code, or enter the setup key by hand.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="totp-enrollment-qr">
        <QRCodeSVG
          value={setupUri}
          size={168}
          title="Two-step verification setup code"
        />
      </div>
      <div className="totp-enrollment-secret">
        <span className="totp-enrollment-secret-label" id="totp-secret-label">
          Setup key
        </span>
        <code aria-labelledby="totp-secret-label">{secret}</code>
        <Button variant="link" type="button" onClick={copySecret}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div aria-live="polite" className="visually-hidden">
        {copied ? "Setup key copied to clipboard." : ""}
      </div>
    </div>
  );
}
