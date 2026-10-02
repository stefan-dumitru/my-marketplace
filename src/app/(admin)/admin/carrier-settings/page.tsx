import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAllCarrierConfigs } from "@/server/data/carrier-config";
import { Card } from "@/components/ui/card";
import { CarrierSettingsForm } from "@/components/admin/CarrierSettingsForm";

export default async function CarrierSettingsPage() {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/auth/login?callbackUrl=/admin/carrier-settings");

  const configs = await getAllCarrierConfigs();
  const fancourierTest = configs.find((c) => c.carrier === "fancourier" && c.environment === "test");
  const fancourierProd = configs.find((c) => c.carrier === "fancourier" && c.environment === "production");

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold">Carrier Settings</h1>
        <p className="text-sm text-muted-foreground">Configure FanCourier API credentials for shipping label generation.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Test Environment</h2>
          <CarrierSettingsForm
            carrier="fancourier"
            environment="test"
            initialConfig={fancourierTest}
          />
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-semibold">Production Environment</h2>
          <CarrierSettingsForm
            carrier="fancourier"
            environment="production"
            initialConfig={fancourierProd}
          />
        </Card>
      </div>

      <Card className="p-6 text-sm">
        <h3 className="mb-2 font-semibold">About FanCourier</h3>
        <ul className="list-inside list-disc space-y-1 text-muted-foreground">
          <li>FanCourier is Romania's largest parcel carrier, covering domestic and international shipments.</li>
          <li>You need a FanCourier business account with API access to use this feature.</li>
          <li>Test credentials are used in the test environment; production credentials are used live.</li>
          <li>Credentials are encrypted at rest and never exposed to the frontend.</li>
          <li>Once configured, sellers can generate real shipping labels from the order page.</li>
        </ul>
      </Card>
    </div>
  );
}
