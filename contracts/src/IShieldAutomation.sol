// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A checker is read-only and must independently verify that a rule's risk trigger is active.
interface IShieldAutomationChecker {
    function canExecute(address account, bytes calldata checkData)
        external
        view
        returns (bool eligible, bytes32 reason);
}

/// @notice An adapter performs the protocol-specific action using delegation previously granted by `account`.
interface IShieldAutomationAdapter {
    function execute(address account, bytes calldata executionData) external returns (bytes32 receipt);
}
