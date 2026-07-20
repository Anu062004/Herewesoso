# Shield on-chain automation

`ShieldAutomationExecutor` is a non-custodial rule coordinator. A user commits exact checker and execution calldata, an activation window, cooldown, execution cap, and gas-price ceiling. Any keeper can execute the rule, but only after the rule's checker returns eligible and only through a governor-allowlisted adapter.

The executor holds no user funds and cannot invent an action: adapters must use protocol-native delegation granted directly by the user. Removing an adapter immediately disables every rule that references it. Rules can also be cancelled by their owner at any time.

Compile from the repository root with `npm run contracts:compile`.

For a ValueChain testnet deployment, use a fresh testnet-only wallet and run:

```sh
SHIELD_AUTOMATION_DEPLOYER_PRIVATE_KEY=... npm run contracts:deploy:testnet
```

The deployment command refuses networks other than ValueChain testnet (`138565`) and checks the wallet's native SOSO balance before broadcasting. Set `SHIELD_AUTOMATION_GOVERNOR` to use a governor other than the deployer.

For production, deploy with a multisig as `initialGovernor`, audit each concrete checker/adapter, approve adapters through `setAdapterApproval`, and publish the deployed address as `SHIELD_AUTOMATION_CONTRACT_ADDRESS`.
