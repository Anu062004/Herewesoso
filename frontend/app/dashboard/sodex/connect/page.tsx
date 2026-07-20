import SodexConnection from '@/components/SodexConnection';
import { PageHeader, Pill } from '@/components/terminal/ui';

export default function SodexConnectPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Connect SoDEX"
        description="EIP-4361 Sign-In with Ethereum for isolated multi-user testnet and mainnet sessions, followed by optional SoDEX trading enablement."
        right={<Pill tone="green">No private key required</Pill>}
      />
      <SodexConnection />
    </div>
  );
}
