import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="w-10 h-10 rounded-lg mb-3" />
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-8 w-12" />
          </Card>
        ))}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-32 mb-3" />
            <Skeleton className="h-8 w-16 mb-1" />
            <Skeleton className="h-3 w-24" />
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} className="p-6">
            <Skeleton className="h-5 w-40 mb-4" />
            <Skeleton className="h-[280px] w-full rounded" />
          </Card>
        ))}
      </div>
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Status Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div>
                <Skeleton className="h-3 w-14 mb-2" />
                <Skeleton className="h-7 w-8" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            {Array.from({ length: Math.floor(Math.random() * 3) + 1 }).map((_, j) => (
              <Card key={j} className="p-4 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-12 rounded" />
                  <Skeleton className="h-5 w-16 rounded" />
                </div>
              </Card>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
