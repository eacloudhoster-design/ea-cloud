import { useId, useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "./ui/input";
import "./PasswordInput.css";

/** Presentation only: keep the input value and submission props with the form. */
export default function PasswordInput({
  id,
  native = false,
  confirmation = false,
  style,
  ...props
}: ComponentProps<"input"> & { native?: boolean; confirmation?: boolean }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [visible, setVisible] = useState(false);
  const Control = native ? "input" : Input;
  const field = confirmation ? "confirm password" : "password";
  return (
    <div className="ea-password-field">
      <Control
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        style={{ ...style, paddingRight: 52 }}
      />
      <button
        className="ea-password-toggle"
        type="button"
        aria-label={`${visible ? "Hide" : "Show"} ${field}`}
        aria-controls={inputId}
        aria-pressed={visible}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? (
          <EyeOff size={20} aria-hidden="true" />
        ) : (
          <Eye size={20} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
