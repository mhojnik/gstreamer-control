# Test Suite

This test suite ensures the rotation system works correctly and prevents infinite loops.

## Running Tests

```bash
# Run all tests
deno test --allow-read --allow-write

# Run specific test file
deno test tests/state.test.ts --allow-read --allow-write

# Run with coverage
deno test --coverage=coverage --allow-read --allow-write
```

## Test Files

### `state.test.ts`
Tests state management and event emission:
- ✅ `saveState()` emits events by default
- ✅ `saveState(false)` does NOT emit events (for operational state)
- ✅ Configuration changes emit events
- ✅ Operational state changes do NOT emit events
- ✅ Multiple listeners work correctly
- ✅ Listeners can be removed

### `rotation.test.ts`
Tests rotation logic and infinite loop prevention:
- ✅ Source switches do NOT trigger events (prevents infinite loops)
- ✅ Configuration changes DO trigger events
- ✅ Multiple source switches don't accumulate events
- ✅ Mixed configuration and source switches work correctly
- ✅ Event handlers don't cause infinite recursion
- ✅ Schedule index wrapping
- ✅ Source filtering logic

### `integration.test.ts`
Integration tests for the complete system:
- ✅ Complete rotation cycle without infinite loop
- ✅ State changes during rotation
- ✅ Rapid configuration changes
- ✅ Event emission timing
- ✅ Multiple handlers with source switches

## Key Test: Infinite Loop Prevention

The most critical test is ensuring that source switches (which update `currentSourceId` and `lastSwitchTime`) do NOT emit `stateChanged` events. This prevents the infinite loop where:

1. `processRotation()` calls `switchToSource()`
2. `switchToSource()` calls `saveState()` which emits event
3. Event handler calls `processRotation()` again
4. Loop repeats infinitely

The fix: `switchToSource()` calls `saveState(false)` to prevent event emission.

## Adding New Tests

When adding new features, ensure:
1. Configuration changes emit events
2. Operational state changes do NOT emit events
3. No infinite loops are introduced
4. Event handlers work correctly

