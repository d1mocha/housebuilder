import { useUi } from '../store/uiStore';
import { Dialog } from './Dialog';

export function EstimateDialog() {
  return (
    <Dialog title="EstimateDialog" onClose={() => useUi.getState().setDialog(null)}>
      <p>…</p>
    </Dialog>
  );
}
