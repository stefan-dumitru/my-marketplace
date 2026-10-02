"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Truck, MapPin, CheckCircle2 } from "lucide-react";

type Props = {
  trackingNumber: string;
  carrierStatus?: string | null;
  labelUrl?: string | null;
  lastTrackedAt?: Date | null;
};

const STATUS_DISPLAY: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  REGISTERED: {
    label: "Label Generated",
    color: "bg-blue-100 text-blue-800",
    icon: <Package className="h-4 w-4" />,
  },
  IN_TRANSIT: {
    label: "In Transit",
    color: "bg-amber-100 text-amber-800",
    icon: <Truck className="h-4 w-4" />,
  },
  OUT_FOR_DELIVERY: {
    label: "Out for Delivery",
    color: "bg-purple-100 text-purple-800",
    icon: <MapPin className="h-4 w-4" />,
  },
  DELIVERED: {
    label: "Delivered",
    color: "bg-green-100 text-green-800",
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
};

export function ShippingTracker({ trackingNumber, carrierStatus, labelUrl, lastTrackedAt }: Props) {
  const [status, setStatus] = useState<string>(carrierStatus ?? "REGISTERED");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(lastTrackedAt ?? null);

  useEffect(() => {
    if (carrierStatus) {
      setStatus(carrierStatus);
    }
    if (lastTrackedAt) {
      setLastUpdate(lastTrackedAt);
    }
  }, [carrierStatus, lastTrackedAt]);

  const statusDisplay = STATUS_DISPLAY[status] || {
    label: status,
    color: "bg-gray-100 text-gray-800",
    icon: <Package className="h-4 w-4" />,
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
            <div className="flex items-center gap-2">
              <Badge className={statusDisplay.color}>
                {statusDisplay.icon}
                <span className="ml-1.5">{statusDisplay.label}</span>
              </Badge>
            </div>
          </div>

          {lastUpdate && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">LAST UPDATE</p>
              <p className="text-sm">
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(lastUpdate)}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
          <p>
            Tracking updates are refreshed every 2 hours. You'll receive an email notification when your parcel
            changes status.
          </p>
        </div>
      </div>
    </Card>
  );
}
