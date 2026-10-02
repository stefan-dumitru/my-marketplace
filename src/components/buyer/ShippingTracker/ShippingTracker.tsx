"use client";

import { Card } from "@/components/ui/card";

type Props = {
  trackingNumber: string;
  carrierStatus?: string | null;
  labelUrl?: string | null;
  lastTrackedAt?: Date | null;
};

const STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  REGISTERED: {
    label: "Label Generated",
    color: "bg-blue-100 text-blue-800",
  },
  IN_TRANSIT: {
    label: "In Transit",
    color: "bg-amber-100 text-amber-800",
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    color: "bg-purple-100 text-purple-800",
  },
  DELIVERED: {
    label: "Delivered",
    color: "bg-green-100 text-green-800",
  },
};

export function ShippingTracker({ trackingNumber, carrierStatus, labelUrl, lastTrackedAt }: Props) {
  const status = carrierStatus ?? "REGISTERED";
  const statusDisplay = STATUS_DISPLAY[status] || {
    label: status,
    color: "bg-gray-100 text-gray-800",
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="font-semibold">Shipping Status</h3>
          <p className="text-sm text-muted-foreground">Track your order with FanCourier</p>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">TRACKING NUMBER</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 font-mono text-sm font-semibold">
                {trackingNumber}
              </code>
              {labelUrl && (
                <a
                  href={labelUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  View Label
                </a>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-muted-foreground">CURRENT STATUS</p>
            <div className={`inline-block rounded-full px-3 py-1.5 text-sm font-medium ${statusDisplay.color}`}>
              {statusDisplay.label}
            </div>
          </div>

          {lastTrackedAt && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">LAST UPDATE</p>
              <p className="text-sm">
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(lastTrackedAt))}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
          <p>
            Tracking updates are refreshed every 2 hours. You&apos;ll receive an email notification when your parcel
            changes status.
          </p>
        </div>
      </div>
    </Card>
  );
}
