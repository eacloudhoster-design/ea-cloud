import { useRef, useState } from "react";
import { SiApple, SiAndroid } from "react-icons/si";
import { ArrowUpRight, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import "./AppInstallation.css";

export default function AppInstallation() {
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const appAddress = new URL("/ea-app/", window.location.origin).href;
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(appAddress);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  };
  return (
    <>
      <div className="public-install-buttons">
        <button
          type="button"
          className="public-cta public-cta-primary"
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setPlatform("ios");
          }}
        >
          <SiApple size={20} aria-hidden="true" />
          Get iOS Version
          <ArrowUpRight size={16} />
        </button>
        <button
          type="button"
          className="public-cta public-install-android"
          onClick={(event) => {
            trigger.current = event.currentTarget;
            setPlatform("android");
          }}
        >
          <SiAndroid size={20} aria-hidden="true" />
          Get Android Version
          <ArrowUpRight size={16} />
        </button>
      </div>
      <span className="public-small-note">
        Install the EA Cloud web app · Existing account access requirements
        apply
      </span>
      <Dialog
        open={platform !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPlatform(null);
            setCopied(false);
            setCopyError(false);
          }
        }}
      >
        <DialogContent
          className="public-install-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus({ preventScroll: true });
          }}
        >
          <p className="public-install-label">EA CLOUD / WEB APPLICATION</p>
          <DialogTitle>
            Install EA Cloud on{" "}
            {platform === "ios" ? "iPhone or iPad" : "Android"}
          </DialogTitle>
          <DialogDescription>
            EA Cloud installs from your browser. No App Store or Google Play
            download is required.
          </DialogDescription>
          {platform === "ios" ? (
            <ol>
              <li>
                <strong>Open the app in Safari.</strong> Use the button below.
                If you’re in another browser or an in-app browser, copy the app
                address and open it in Safari.
              </li>
              <li>
                <strong>Tap Share.</strong> You may need to open the browser’s
                More (•••) menu first. Select{" "}
                <strong>Add to Home Screen</strong>; scroll through the actions
                if necessary.
              </li>
              <li>
                <strong>Tap Add.</strong> Leave <strong>Open as Web App</strong>{" "}
                enabled if that option appears. Launch EA Cloud from its Home
                Screen icon.
              </li>
            </ol>
          ) : (
            <ol>
              <li>
                <strong>Open the app in Chrome</strong> or another browser that
                supports web app installation.
              </li>
              <li>
                <strong>Use the browser’s install option.</strong> If an
                installation prompt appears, follow it. Otherwise open the
                browser menu (⋮), then choose <strong>Install app</strong> or{" "}
                <strong>Add to Home screen</strong>.
              </li>
              <li>
                <strong>Confirm Install or Add.</strong> Launch EA Cloud from
                the new icon. The exact option depends on your browser and
                device.
              </li>
            </ol>
          )}
          <a
            href="/ea-app/"
            target="_blank"
            rel="noopener noreferrer"
            className="public-cta public-cta-primary"
          >
            Open EA Cloud
            <ArrowUpRight size={17} />
          </a>
          <label className="public-install-address">
            App address
            <input
              readOnly
              value={appAddress}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
          <button
            type="button"
            className="public-copy-address"
            onClick={copyAddress}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
            {copied ? "Address copied" : "Copy app address"}
          </button>
          <p className="public-install-note" role="status">
            {copyError
              ? "Copy the address from the field above, then open it in your browser."
              : "Installation availability depends on your browser. You can always use EA Cloud directly in the browser."}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
