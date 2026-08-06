import { useState } from "react";
import { useWorkbench } from "../context/WorkbenchContext";
import type { ImputationMethod } from "../types";

const IMPUTATION_LABELS: Record<ImputationMethod, string> = {
  median: "中央値",
  most_frequent: "最頻値",
};

function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

export default function DataPage() {
  const { dataset, uploadDataset } = useWorkbench();
  const [dragging, setDragging] = useState(false);

  const submit = (file?: File) => {
    if (file) void uploadDataset(file);
  };

  const sourceMissing = dataset ? sumCounts(dataset.source_missing_counts) : 0;
  const imputed = dataset ? sumCounts(dataset.imputed_counts) : 0;
  const remainingMissing = dataset ? sumCounts(dataset.missing_counts) : 0;

  return (
    <>
      <header className="section-header">
        <div>
          <span className="eyebrow">STEP 01 · DATA</span>
          <h2>解析データを登録</h2>
          <p>CSVまたはExcelをFastAPIへ登録し、欠損値補完後のデータを因果探索へ引き継ぎます。</p>
        </div>
        <span className={`status-chip ${dataset ? "success" : ""}`}>
          {dataset ? "登録済み" : "未登録"}
        </span>
      </header>

      <section className="panel upload-panel data-file-panel">
        <div className="panel-title">
          <div>
            <span>DATA SOURCE</span>
            <h3>{dataset ? "データを入れ替える" : "データファイル"}</h3>
            <p>対応形式: CSV / XLSX</p>
          </div>
          {dataset && <span className="status-chip success">Loaded</span>}
        </div>
        <label
          className={`dropzone ${dragging ? "dragging" : ""}`}
          aria-label="CSVまたはXLSXファイルをドロップまたは選択"
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            submit(event.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => submit(event.target.files?.[0])}
          />
          <span className="upload-symbol">⇧</span>
          <strong>
            {dragging
              ? "ここにドロップして読み込む"
              : dataset
                ? "別のファイルをドロップまたは選択"
                : "CSVまたはExcelをドロップまたは選択"}
          </strong>
          <span>
            {dataset
              ? `読込中のファイル: ${dataset.filename}`
              : "FastAPIで読込と欠損値補完を行い、補完済みデータをプロセス内に保持します。"}
          </span>
        </label>
      </section>

      {dataset && (
        <section className="panel preprocessing-panel">
          <div className="panel-title">
            <div>
              <span>PREPROCESSING</span>
              <h3>欠損値補完</h3>
              <p>数値列は中央値、それ以外の列は最頻値でFastAPI側から補完します。</p>
            </div>
            <span className={`status-chip ${remainingMissing === 0 ? "success" : "warning"}`}>
              {dataset.preprocessing_applied ? `${imputed}件補完` : "補完対象なし"}
            </span>
          </div>
          <div className="dataset-metrics preprocessing-metrics">
            <div><small>読込時欠損</small><strong>{sourceMissing}</strong></div>
            <div><small>補完済み</small><strong>{imputed}</strong></div>
            <div><small>残存欠損</small><strong>{remainingMissing}</strong></div>
          </div>
        </section>
      )}

      {dataset && (
        <section className="panel dataset-panel">
          <div className="panel-title">
            <div><span>DATASET PROFILE</span><h3>{dataset.filename}</h3></div>
            <div className="dataset-metrics">
              <div><small>Rows</small><strong>{dataset.row_count.toLocaleString()}</strong></div>
              <div><small>Columns</small><strong>{dataset.columns.length}</strong></div>
              <div><small>Imputed</small><strong>{imputed}</strong></div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>カラム</th>
                  <th>型</th>
                  <th>読込時欠損</th>
                  <th>補完方法</th>
                  <th>残存欠損</th>
                  <th>状態</th>
                </tr>
              </thead>
              <tbody>
                {dataset.columns.map((column) => {
                  const method = dataset.imputation_methods[column];
                  const remaining = dataset.missing_counts[column];
                  return (
                    <tr key={column}>
                      <td><strong>{column}</strong></td>
                      <td><code>{dataset.dtypes[column]}</code></td>
                      <td>{dataset.source_missing_counts[column]}</td>
                      <td>{method ? IMPUTATION_LABELS[method] : "—"}</td>
                      <td>{remaining}</td>
                      <td>
                        <span className={`status-dot-label ${remaining ? "warning" : "success"}`}>
                          {remaining ? "要確認" : method ? "補完済み" : "Ready"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
