import { supabase } from "@/integrations/supabase/client";

const NON_COPYABLE_FIELDS = new Set<string>([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "created_by_email",
  "completed_at",
  "closed_at",
  "is_trashed",
  "trashed_at",
  "actual_start_date",
  "actual_end_date",
  "blocked_since",
  "blocked_days_total",
  "last_progress_stage_id",
]);

function stripFields(row: any) {
  const output: any = {};
  Object.keys(row).forEach((key) => {
    if (!NON_COPYABLE_FIELDS.has(key)) {
      output[key] = row[key];
    }
  });
  return output;
}

async function nextDisplayOrder(projectId: string, workflowStageId: string | null, parentId: string | null) {
  let query = supabase
    .from("activities")
    .select("display_order")
    .eq("project_id", projectId)
    .order("display_order", { ascending: false })
    .limit(1);

  if (workflowStageId) query = query.eq("workflow_stage_id", workflowStageId);
  if (parentId) query = query.eq("parent_id", parentId);

  const { data } = await query;
  const max = data?.[0]?.display_order ? Number(data[0].display_order) : 0;
  return (Number.isFinite(max) ? max : 0) + 1;
}

async function listChildrenIds(projectId: string, parentId: string) {
  const { data, error } = await supabase
    .from("activities")
    .select("id")
    .eq("project_id", projectId)
    .eq("parent_id", parentId)
    .or("is_trashed.is.false,is_trashed.is.null");

  if (!error) return data || [];

  // Fallback para ambientes legados sem coluna is_trashed.
  const fallback = await supabase
    .from("activities")
    .select("id")
    .eq("project_id", projectId)
    .eq("parent_id", parentId);

  if (fallback.error) throw fallback.error;
  return fallback.data || [];
}

async function duplicateActivityInternal(
  opts: {
    activityId: string;
    includeChildren: boolean;
    titleSuffix: string;
    overrideParentId?: string | null;
  },
  createdIds: string[],
): Promise<string> {
  const {
    activityId,
    includeChildren,
    titleSuffix,
    overrideParentId,
  } = opts;

  const { data: original, error: originalError } = await supabase
    .from("activities")
    .select("*")
    .eq("id", activityId)
    .maybeSingle();

  if (originalError || !original) {
    throw originalError || new Error("Atividade nao encontrada");
  }

  const base = stripFields(original);
  const parentId = overrideParentId !== undefined ? overrideParentId : base.parent_id ?? null;
  const order = await nextDisplayOrder(base.project_id, base.workflow_stage_id ?? null, parentId);

  const payload = {
    ...base,
    title: `${base.title || "Atividade"}${titleSuffix}`,
    status: "pending",
    parent_id: parentId,
    display_order: order,
  };

  const { data: created, error: createError } = await supabase
    .from("activities")
    .insert(payload)
    .select("id")
    .single();

  if (createError || !created) {
    throw createError || new Error("Falha ao duplicar");
  }

  createdIds.push(created.id);

  if (includeChildren) {
    const children = await listChildrenIds(base.project_id, activityId);

    for (const child of children) {
      await duplicateActivityInternal({
        activityId: child.id,
        includeChildren: true,
        titleSuffix: "",
        overrideParentId: created.id,
      }, createdIds);
    }
  }

  return created.id;
}

export async function duplicateActivity(opts: {
  activityId: string;
  includeChildren?: boolean;
  titleSuffix?: string;
  overrideParentId?: string | null;
}): Promise<string> {
  const {
    activityId,
    includeChildren = true,
    titleSuffix = " (copia)",
    overrideParentId,
  } = opts;

  const createdIds: string[] = [];
  try {
    return await duplicateActivityInternal(
      {
        activityId,
        includeChildren,
        titleSuffix,
        overrideParentId,
      },
      createdIds,
    );
  } catch (error) {
    if (createdIds.length > 0) {
      await supabase.from("activities").delete().in("id", createdIds);
    }
    throw error;
  }
}

export async function countChildren(activityId: string): Promise<number> {
  const { count, error } = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", activityId)
    .or("is_trashed.is.false,is_trashed.is.null");

  if (!error) return count ?? 0;

  // Fallback para ambientes legados sem coluna is_trashed.
  const fallback = await supabase
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", activityId);

  if (fallback.error) throw fallback.error;
  return fallback.count ?? 0;
}