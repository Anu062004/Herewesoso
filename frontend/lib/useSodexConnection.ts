'use client';

import { useEffect, useState } from 'react';

import { getSodexConnection, subscribeSodexConnection } from '@/lib/sodexConnection';
import type { SodexConnection } from '@/lib/sodexConnection';

export function useSodexConnection() {
  const [connection, setConnection] = useState<SodexConnection | null>(null);

  useEffect(() => {
    const sync = () => setConnection(getSodexConnection());
    sync();
    return subscribeSodexConnection(sync);
  }, []);

  return connection;
}
