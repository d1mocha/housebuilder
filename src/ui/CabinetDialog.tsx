import { useUi } from '../store/uiStore';
import { Dialog } from './Dialog';

export function CabinetDialog() {
  return (
    <Dialog title="CabinetDialog" onClose={() => useUi.getState().setDialog(null)}>
      <p>…</p>
    </Dialog>
  );
}
