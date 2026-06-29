import { forwardRef } from "react";

interface FormFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

interface FormTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: React.ReactNode;
}

const inputClasses =
  "w-full bg-surface-100 border border-hairline-strong rounded-[10px] px-4 py-3 text-primary placeholder-faint focus:outline-none focus:ring-2 focus:ring-accent-400/30 focus:border-accent-400/50 transition-all text-[13.5px]";

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  ({ label, className = "", ...props }, ref) => (
    <div>
      <label className="block text-[11px] font-medium text-muted mb-1.5">{label}</label>
      <input ref={ref} className={`${inputClasses} ${className}`} {...props} />
    </div>
  )
);
FormField.displayName = "FormField";

export function FormTextarea({ label, className = "", ...props }: FormTextareaProps) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted mb-1.5">{label}</label>
      <textarea className={`${inputClasses} resize-none ${className}`} {...props} />
    </div>
  );
}

export function FormSelect({ label, className = "", children, ...props }: FormSelectProps) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted mb-1.5">{label}</label>
      <select className={`${inputClasses} ${className}`} {...props}>
        {children}
      </select>
    </div>
  );
}
