import { Card } from "@/components/ui/card";

type Props = {
  label: string;
  value: string | number;
};

export function StatTile({ label, value }: Props) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </Card>
  );
}
