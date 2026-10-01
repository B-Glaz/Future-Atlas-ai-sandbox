"use client";

import { FormEvent, useRef, useState } from "react";

const EDUCATION_LEVELS = ["School", "College", "Undergraduate", "Postgraduate", "Other"] as const;

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  educationLevel: string;
  school: string;
  country: string;
  university: string;
  course: string;
};

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  educationLevel: "",
  school: "",
  country: "",
  university: "",
  course: "",
};

function pageReferrer() {
  const referrer = window.top === window.self ? window.location.href : document.referrer;
  if (!referrer || !/^https?:\/\//i.test(referrer)) return "";
  if (referrer.length <= 1800) return referrer;
  const queryIndex = referrer.indexOf("?");
  const withoutQuery = queryIndex > -1 ? referrer.slice(0, queryIndex) : referrer;
  return withoutQuery.slice(0, 1800);
}

export default function ZohoGuidanceForm() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitForm() {
    if (sending.current) return;
    sending.current = true;
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, referrer: pageReferrer() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not submit the form. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not submit the form. Please try again.");
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  function submitIfValid(formElement: HTMLFormElement | null) {
    if (formElement && !formElement.reportValidity()) return;
    void submitForm();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitIfValid(event.currentTarget);
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900">Thank you</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Your details have been submitted. We will use them to follow up on your study plans.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.target instanceof HTMLTextAreaElement) return;
        event.preventDefault();
        submitIfValid(event.currentTarget);
      }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required value={form.firstName} autoComplete="given-name" onChange={(value) => update("firstName", value)} />
        <Field label="Last name" required value={form.lastName} autoComplete="family-name" onChange={(value) => update("lastName", value)} />
        <Field label="Email address" required type="email" value={form.email} autoComplete="email" onChange={(value) => update("email", value)} className="sm:col-span-2" />
        <Field label="Mobile number" required type="tel" value={form.phone} autoComplete="tel" maxLength={20} onChange={(value) => update("phone", value)} className="sm:col-span-2" />
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium text-slate-800">Current education level <span className="text-rose-600">*</span></span>
          <select
            required
            value={form.educationLevel}
            onChange={(event) => update("educationLevel", event.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900"
          >
            <option value="">Select</option>
            {EDUCATION_LEVELS.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
        </label>
        <Field label="Current or most recent school or college" required value={form.school} onChange={(value) => update("school", value)} className="sm:col-span-2" />
        <Field label="Country you are interested in studying in" value={form.country} onChange={(value) => update("country", value)} />
        <Field label="University you are interested in" value={form.university} onChange={(value) => update("university", value)} />
        <Field label="Course or field of study" value={form.course} onChange={(value) => update("course", value)} className="sm:col-span-2" />
      </div>
      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        onClick={(event) => submitIfValid(event.currentTarget.form)}
        className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {pending ? "Submitting…" : "Submit"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  autoComplete,
  maxLength = 255,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-800">
        {label} {required ? <span className="text-rose-600">*</span> : null}
      </span>
      <input
        required={required}
        type={type}
        value={value}
        autoComplete={autoComplete}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-900"
      />
    </label>
  );
}
