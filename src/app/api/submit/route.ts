import { NextResponse } from "next/server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { writeSubmission } from "@/lib/store";

const schema = z.object({
  name: z.string().trim().min(3, "Please add the hackathon name.").max(160),
  organizer: z.string().trim().min(2, "Please add the organizer.").max(120),
  officialUrl: z
    .string()
    .trim()
    .url("Please add a valid link.")
    .max(500)
    .refine((value) => /^https?:\/\//i.test(value), "The link must start with http."),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please add a start date."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please add an end date."),
  prizePool: z.string().trim().max(120).optional().default(""),
  mode: z.enum(["online", "in-person", "hybrid"]),
  email: z
    .string()
    .trim()
    .max(160)
    .refine((value) => value === "" || z.string().email().safeParse(value).success, {
      message: "Please add a valid email or leave it empty.",
    })
    .optional()
    .default(""),
  notes: z.string().trim().max(1000).optional().default(""),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: parsed.error.issues[0]?.message ?? "Please check the form." },
      { status: 400 },
    );
  }

  const data = parsed.data;
  if (data.endDate < data.startDate) {
    return NextResponse.json(
      { message: "The end date must be after the start date." },
      { status: 400 },
    );
  }

  let storage: string;
  try {
    storage = await writeSubmission({
      name: data.name,
      organizer: data.organizer,
      officialUrl: data.officialUrl,
      startDate: data.startDate,
      endDate: data.endDate,
      prizePool: data.prizePool,
      mode: data.mode,
      email: data.email || undefined,
      notes: data.notes || undefined,
      submittedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[submit] failed", error);
    return NextResponse.json(
      { message: "We could not save that right now. Please try again." },
      { status: 500 },
    );
  }

  if (storage === "none") {
    return NextResponse.json(
      { message: "Submissions are unavailable right now. Please try again later." },
      { status: 503 },
    );
  }

  // Let the next collector run pick it up, then show it fast.
  revalidatePath("/");
  revalidatePath("/hackathons");
  revalidatePath("/upcoming");

  return NextResponse.json(
    { message: "Thank you. We will read your link and add the hackathon." },
    { status: 201 },
  );
}

export async function GET() {
  return NextResponse.json(
    { message: "Send a POST request with the hackathon details. No login needed." },
    { status: 405, headers: { Allow: "POST" } },
  );
}
