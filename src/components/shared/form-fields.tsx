"use client";

import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export const REGIONS = [
  ["US", "United States"], ["IN", "India"], ["GB", "United Kingdom"], ["CA", "Canada"],
  ["AU", "Australia"], ["BR", "Brazil"], ["DE", "Germany"], ["FR", "France"],
  ["ID", "Indonesia"], ["JP", "Japan"], ["KR", "South Korea"], ["MX", "Mexico"],
  ["NG", "Nigeria"], ["PK", "Pakistan"], ["BD", "Bangladesh"], ["AE", "United Arab Emirates"],
] as const;

export const LANGUAGES = [
  ["en", "English"], ["hi", "Hindi"], ["es", "Spanish"], ["pt", "Portuguese"],
  ["de", "German"], ["fr", "French"], ["id", "Indonesian"], ["ja", "Japanese"],
  ["ko", "Korean"], ["ar", "Arabic"], ["bn", "Bengali"], ["ur", "Urdu"],
] as const;

type FieldControlProps = { id?: string; "aria-describedby"?: string };

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  const generatedId = useId();
  const controlId = `field-${generatedId.replaceAll(":", "")}`;
  const hintId = `${controlId}-hint`;
  const control = isValidElement<FieldControlProps>(children)
    ? cloneElement(children as ReactElement<FieldControlProps>, {
        id: children.props.id ?? controlId,
        "aria-describedby": hint ? [children.props["aria-describedby"], hintId].filter(Boolean).join(" ") : children.props["aria-describedby"],
      })
    : children;
  const associatedId = isValidElement<FieldControlProps>(control) ? control.props.id ?? controlId : controlId;

  return (
    <div className={`block ${className}`}>
      <label className="field-label" htmlFor={associatedId}>{label}</label>
      {control}
      {hint ? <p className="field-help" id={hintId}>{hint}</p> : null}
    </div>
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input-base ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea-base ${className}`} {...props} />;
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={`select-base ${className}`} {...props}>{children}</select>
      <svg viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.51a.75.75 0 0 1-1.08 0l-4.25-4.51a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
      </svg>
    </span>
  );
}

export function RegionSelect(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children">) {
  return <Select {...props}>{REGIONS.map(([code, name]) => <option value={code} key={code}>{name} ({code})</option>)}</Select>;
}

export function LanguageSelect(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, "children">) {
  return <Select {...props}>{LANGUAGES.map(([code, name]) => <option value={code} key={code}>{name} ({code})</option>)}</Select>;
}
