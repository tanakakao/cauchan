import { useRef, useState } from "react";
import { useWorkbench } from "../context/WorkbenchContext";

export default function DataPage() {
  const { dataset, uploadDataset } = useWorkbench();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const submit = (file?: File) => {
    if (file) void uploadDataset(file);
  };

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 01 · DATA</span>
          <h2>解析データを登録</h2>
          <p>CSVまたはExcelをFastAPIへ登録し、因果探索に使用するカラムを確認します。</p>
        </div>
        <span className={`status-chip ${dataset ? "success" : ""}`}>
          {dataset ? "登録済み" : "未登録"}
        </span>
      </header>

      <section className="panel upload-panel">
        <div
          className={`dropzone ${dragging ? "dragging" : ""}`}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            submit(event.dataTransfer.files[0]);
          }}
        >
          <div className="dropzone-icon">▦</div>
          <div>
            <strong>ファイルをドロップ</strong>
            <p>.csv / .xlsx に対応しています。データはFastAPIプロセス内に一時保存されます。</p>
          </div>
          <button type="button" onClick={() => inputRef.current?.click()}>ファイルを選択</button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            hidden
            onChange={(event) => submit(event.target.files?.[0])}
          />
        </div>
      </section>

      {dataset && (
        <section className="panel dataset-panel">
          <div className="panel-title">
            <div><span>DATASET PROFILE</span><h3>{dataset.filename}</h3></div>
            <div className="dataset-metrics">
              <div><small>Rows</small><strong>{dataset.row_count.toLocaleString()}</strong></div>
              <div><small>Columns</small><strong>{dataset.columns.length}</strong></div>
              <div><small>Missing</small><strong>{Object.values(dataset.missing_counts).reduce((a, b) => a + b, 0)}</strong></div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>カラム</th><th>型</th><th>欠損</th><th>状態</th></tr></thead>
              <tbody>
                {dataset.columns.map((column) => (
                  <tr key={column}>
                    <td><strong>{column}</strong></td>
                    <td><code>{dataset.dtypes[column]}</code></td>
                    <td>{dataset.missing_counts[column]}</td>
                    <td><span className={`status-dot-label ${dataset.missing_counts[column] ? "warning" : "success"}`}>
                      {dataset.missing_counts[column] ? "要確認" : "Ready"}
                    </span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
