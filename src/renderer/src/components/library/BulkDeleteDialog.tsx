export interface BulkDeleteDialogProps {
  count: number;
  busy: boolean;
  onConfirm: (deleteFiles: boolean) => void;
  onClose: () => void;
}

export function BulkDeleteDialog({ count, busy, onConfirm, onClose }: BulkDeleteDialogProps) {
  return (
    <div className="modal-backdrop bulk-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="bulk-dialog bulk-delete-dialog" role="dialog" aria-modal="true" aria-label="删除所选曲目">
        <div className="bulk-dialog__heading"><div><p className="eyebrow">删除曲目</p><h2>如何处理这 {count} 首曲目？</h2></div><button type="button" aria-label="关闭" disabled={busy} onClick={onClose}>×</button></div>
        <p>从音乐库移除后无法撤销。你可以选择是否同时删除电脑上的音频文件。</p>
        <div className="bulk-delete-dialog__actions">
          <button type="button" className="button button--ghost" disabled={busy} onClick={() => onConfirm(false)}>保留硬盘文件</button>
          <button type="button" className="button bulk-delete-dialog__danger" disabled={busy} onClick={() => onConfirm(true)}>删除硬盘文件</button>
        </div>
      </section>
    </div>
  );
}
