import SodexConnection from '@/components/SodexConnection';
import { PageHeader, Pill } from '@/components/terminal/ui';

export default function SodexConnectPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Connect SoDEX"
        description="A guided wallet login for testnet and mainnet. Select the environment, prove wallet ownership, then finish trading enablement on the official SoDEX app."
        right={<Pill tone="green">No private key required</Pill>}
      />
      <SodexConnection />
    </div>
  );
}
