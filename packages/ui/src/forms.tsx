import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { Button, type ButtonProps } from "./primitives";
import { cn } from "./utils";

export type FormFieldProps = ComponentPropsWithoutRef<"div"> & {
  label: ReactNode;
  htmlFor?: string;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function FormField({
  label,
  htmlFor,
  helper,
  error,
  required,
  children,
  className,
  ...props
}: FormFieldProps) {
  return (
    <div className={cn("grid gap-1.5", className)} {...props}>
      <FormLabel htmlFor={htmlFor} required={required}>
        {label}
      </FormLabel>
      {children}
      {helper && !error ? <FormHelper>{helper}</FormHelper> : null}
      {error ? <FormError>{error}</FormError> : null}
    </div>
  );
}

export type FormLabelProps = ComponentPropsWithoutRef<"label"> & {
  required?: boolean;
};

export function FormLabel({
  required,
  className,
  children,
  ...props
}: FormLabelProps) {
  return (
    <label className={cn("text-sm font-medium text-slate-700", className)} {...props}>
      {children}
      {required ? <span className="ml-1 text-red-600">*</span> : null}
    </label>
  );
}

export type FormHelperProps = ComponentPropsWithoutRef<"p">;

export function FormHelper({ className, ...props }: FormHelperProps) {
  return <p className={cn("text-xs leading-5 text-slate-500", className)} {...props} />;
}

export type FormErrorProps = ComponentPropsWithoutRef<"p">;

export function FormError({ className, ...props }: FormErrorProps) {
  return <p className={cn("text-xs leading-5 text-red-700", className)} {...props} />;
}

export type FormSectionProps = Omit<ComponentPropsWithoutRef<"section">, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function FormSection({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: FormSectionProps) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white p-4", className)} {...props}>
      {title || description || actions ? (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            {title ? <h2 className="text-base font-semibold text-slate-950">{title}</h2> : null}
            {description ? (
              <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
            ) : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export type SubmitButtonProps = ButtonProps & {
  loadingLabel?: ReactNode;
};

export function SubmitButton({
  loading,
  loadingLabel = "Saving...",
  children,
  type = "submit",
  ...props
}: SubmitButtonProps) {
  return (
    <Button type={type} loading={loading} {...props}>
      {loading ? loadingLabel : children}
    </Button>
  );
}
