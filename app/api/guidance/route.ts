import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";
import { rateLimited } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

const ZOHO_RECORDS_URL = "https://forms.zohopublic.in/onewindow/form/StudyAbroadApplicationForm/formperma/jGJIp30LCf30UXhfAyzC82bep7S1ZSGZNrIfqN28bJ4/records";
const EDUCATION_LEVELS = new Set(["School", "College", "Undergraduate", "Postgraduate", "Other"]);

type GuidanceBody = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  phone?: unknown;
  educationLevel?: unknown;
  school?: unknown;
  country?: unknown;
  university?: unknown;
  course?: unknown;
  referrer?: unknown;
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function referrerName(value: unknown) {
  const referrer = text(value, 1800);
  return /^https?:\/\//i.test(referrer) ? referrer : "";
}

export async function POST(request: NextRequest) {
  const limited = rateLimited(request, "guidance", 8, 60_000);
  if (limited) return limited;

  const raw = await request.text();
  if (raw.length > 8000) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  let body: GuidanceBody;
  try {
    body = JSON.parse(raw) as GuidanceBody;
  } catch {
    return NextResponse.json({ error: "Enter your name, email, mobile number, education level, and school." }, { status: 400 });
  }
  const firstName = text(body.firstName, 255);
  const lastName = text(body.lastName, 255);
  const email = text(body.email, 255);
  const phone = text(body.phone, 20);
  const educationLevel = text(body.educationLevel, 40);
  const school = text(body.school, 255);
  const country = text(body.country, 255);
  const university = text(body.university, 255);
  const course = text(body.course, 255);
  const referrer = referrerName(body.referrer);

  if (!firstName || !lastName || !email || !phone || !school || !EDUCATION_LEVELS.has(educationLevel) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter your name, email, mobile number, education level, and school." }, { status: 400 });
  }

  const record: Record<string, unknown> = {
    Name: { Name_First: firstName, Name_Last: lastName },
    Email: email,
    PhoneNumber: phone,
    Dropdown: educationLevel,
    SingleLine: school,
    SingleLine1: country,
    SingleLine2: university,
    SingleLine3: course,
  };
  if (referrer) record.REFERRER_NAME = referrer;

  let zohoOk = false;
  try {
    const zoho = await fetch(ZOHO_RECORDS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/zoho.forms-v1+json",
      },
      body: JSON.stringify(record),
      signal: AbortSignal.timeout(12_000),
    });
    zohoOk = zoho.ok;
  } catch {
    zohoOk = false;
  }

  if (zohoOk) return NextResponse.json({ ok: true });

  const admin = createAdminSupabase();
  const { error } = await admin.from("future_atlas_guidance_submissions").insert({
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    education_level: educationLevel,
    school,
    country,
    university,
    course,
  });
  if (error) return NextResponse.json({ error: "Could not submit the form. Please try again." }, { status: 502 });
  return NextResponse.json({ error: "We saved your details, but the form service did not accept them. Please try again in a moment." }, { status: 502 });
}
