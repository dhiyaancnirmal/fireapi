# @fireapi/recorder

Recorder-domain package for guided session recording and workflow draft generation.

## Exports

- `RecorderSessionStatus`
- `RecorderActionType`
- `RecorderSessionRecord`
- `RecorderActionInput`
- `RecorderActionRecord`
- `FinalizeRecordingResult`
- `RecorderError`
- `RecorderService`
- `WorkflowDraftBuilder`

## Usage

```ts
import { RecorderService } from '@fireapi/recorder';

const service = new RecorderService();
const finalized = service.finalize({
  session,
  actions,
});
```

## Notes

- This package contains deterministic action-to-workflow conversion logic.
- Browser execution and persistence are handled by `@fireapi/server`.
