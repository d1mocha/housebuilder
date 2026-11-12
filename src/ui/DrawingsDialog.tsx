import { useUi } from '../store/uiStore';
import { Dialog } from './Dialog';

export function DrawingsDialog() {
  return (
    <Dialog title="DrawingsDialog" onClose={() => useUi.getState().setDialog(null)}>
      <p>…</p>
    </Dialog>
  );
}
