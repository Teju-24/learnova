import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LearnerStatus = {
  path: unknown;
};

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ready: false }, { status: 401 });
  }

  const { data: rows } = await supabase
    .from("learners")
    .select("path")
    .eq("user_id", user.id)
    .limit(1)
    .returns<LearnerStatus[]>();

  const learner = rows?.[0] ?? null;
  const path = learner?.path;
  const ready = Boolean(
    learner && Array.isArray(path) && path.length > 0
  );

  return NextResponse.json({ ready });
}
