"""cauchan FastAPIアプリケーション。"""

import os

from fastapi import FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from .inference_service import run_batch_inference, run_inference
from .schemas import (
    BatchInferenceRequest,
    BatchInferenceResponse,
    DatasetResponse,
    DiscoveryRequest,
    DiscoveryResponse,
    GraphValidationRequest,
    GraphValidationResponse,
    HealthResponse,
    InferenceRequest,
    InferenceResponse,
)
from .services import (
    ServiceError,
    matrix_to_edges,
    read_dataframe,
    resolve_inference_graph,
    run_discovery,
    validate_graph,
)
from .store import store


def _cors_origins() -> list[str]:
    """環境変数または開発用既定値からCORS許可元を取得する。"""
    value = os.getenv(
        "CAUCHAN_CORS_ORIGINS",
        "http://127.0.0.1:5175,http://localhost:5175",
    )
    return [origin.strip() for origin in value.split(",") if origin.strip()]


app = FastAPI(
    title="cauchan API",
    version="0.2.0",
    description="因果構造探索と因果効果推定を提供するAPI",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _bad_request(exc: ServiceError) -> HTTPException:
    """サービス例外をHTTP 422へ変換する。"""
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=str(exc),
    )


def _inference_error(exc: Exception, *, batch: bool = False) -> HTTPException:
    """未処理の推論例外をCORS付きJSON応答へ変換する。"""
    label = "一括因果効果推定" if batch else "因果効果推定"
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=(
            f"{label}中に予期しないエラーが発生しました: "
            f"{type(exc).__name__}: {exc}"
        ),
    )


@app.get("/api/v1/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """APIプロセスの稼働を確認する。"""
    return HealthResponse(status="ok", service="cauchan-api")


@app.post(
    "/api/v1/datasets",
    response_model=DatasetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(file: UploadFile = File(...)) -> DatasetResponse:
    """CSVまたはExcelをメモリへ登録する。"""
    filename = file.filename or "uploaded.csv"
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="アップロードファイルが空です。")

    try:
        dataframe = read_dataframe(filename, content)
    except ServiceError as exc:
        raise _bad_request(exc) from exc

    record = store.add_dataset(filename=filename, dataframe=dataframe)
    return DatasetResponse(
        dataset_id=record.dataset_id,
        filename=record.filename,
        row_count=len(dataframe),
        columns=dataframe.columns.tolist(),
        dtypes={column: str(dtype) for column, dtype in dataframe.dtypes.items()},
        missing_counts={
            column: int(count)
            for column, count in dataframe.isna().sum().items()
        },
    )


@app.delete(
    "/api/v1/datasets/{dataset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_dataset(dataset_id: str) -> Response:
    """登録したデータセットを削除する。"""
    if not store.delete_dataset(dataset_id):
        raise HTTPException(status_code=404, detail="データセットが見つかりません。")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/v1/discovery", response_model=DiscoveryResponse)
def discover(request: DiscoveryRequest) -> DiscoveryResponse:
    """指定した事前知識を使って因果構造を探索する。"""
    dataset = store.get_dataset(request.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="データセットが見つかりません。")

    try:
        backend, result_columns, causal_matrix = run_discovery(
            dataframe=dataset.dataframe,
            columns=request.columns,
            model_name=request.model_name,
            scale=request.scale,
            categorical_columns=request.categorical_columns,
            forbidden_parents=request.forbidden_parents,
            forbidden_children=request.forbidden_children,
            forbidden_edges=request.forbidden_edges,
            required_edges=request.required_edges,
        )
        edge_response = matrix_to_edges(result_columns, causal_matrix)
    except (ServiceError, KeyError, ValueError) as exc:
        raise _bad_request(ServiceError(str(exc))) from exc

    record = store.add_discovery(
        dataset_id=request.dataset_id,
        model_name=request.model_name,
        backend=backend,
        columns=result_columns,
        causal_matrix=causal_matrix,
    )
    return DiscoveryResponse(
        discovery_id=record.discovery_id,
        dataset_id=request.dataset_id,
        model_name=request.model_name,
        backend=backend,
        columns=result_columns,
        causal_matrix=causal_matrix.astype(float).tolist(),
        edges=edge_response,
    )


@app.post("/api/v1/inference", response_model=InferenceResponse)
def infer(request: InferenceRequest) -> InferenceResponse:
    """factor1からfactor2への平均因果効果を推定する。"""
    dataset = store.get_dataset(request.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="データセットが見つかりません。")

    try:
        discovery_id, columns, causal_matrix = resolve_inference_graph(
            store=store,
            dataset_id=request.dataset_id,
            discovery_id=request.discovery_id,
            columns=request.columns,
            causal_matrix=request.causal_matrix,
        )
        effect = run_inference(
            dataframe=dataset.dataframe,
            columns=columns,
            causal_matrix=causal_matrix,
            factor1=request.factor1,
            factor2=request.factor2,
            method=request.method,
        )
    except (ServiceError, ValueError) as exc:
        raise _bad_request(ServiceError(str(exc))) from exc
    except Exception as exc:
        raise _inference_error(exc) from exc

    return InferenceResponse(
        dataset_id=request.dataset_id,
        discovery_id=discovery_id,
        factor1=request.factor1,
        factor2=request.factor2,
        method=request.method,
        effect=effect,
        interpretation=(
            f"{request.factor1}を1単位増加させたとき、"
            f"{request.factor2}は平均で{effect:.6g}単位変化すると推定されます。"
        ),
    )


@app.post("/api/v1/inference/batch", response_model=BatchInferenceResponse)
def infer_batch(request: BatchInferenceRequest) -> BatchInferenceResponse:
    """最終構造に含まれる全有向エッジの効果を一括推定する。"""
    dataset = store.get_dataset(request.dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="データセットが見つかりません。")

    try:
        discovery_id, columns, causal_matrix = resolve_inference_graph(
            store=store,
            dataset_id=request.dataset_id,
            discovery_id=request.discovery_id,
            columns=request.columns,
            causal_matrix=request.causal_matrix,
        )
        results = run_batch_inference(
            dataframe=dataset.dataframe,
            columns=columns,
            causal_matrix=causal_matrix,
            method=request.method,
        )
    except (ServiceError, ValueError) as exc:
        raise _bad_request(ServiceError(str(exc))) from exc
    except Exception as exc:
        raise _inference_error(exc, batch=True) from exc

    success_count = sum(result.effect is not None for result in results)
    return BatchInferenceResponse(
        dataset_id=request.dataset_id,
        discovery_id=discovery_id,
        method=request.method,
        result_count=len(results),
        success_count=success_count,
        failure_count=len(results) - success_count,
        results=results,
    )


@app.post("/api/v1/graphs/validate", response_model=GraphValidationResponse)
def validate_graph_definition(
    request: GraphValidationRequest,
) -> GraphValidationResponse:
    """React上で編集した因果構造と制約の整合性を確認する。"""
    errors, warnings = validate_graph(request)
    return GraphValidationResponse(
        valid=not errors,
        errors=errors,
        warnings=warnings,
    )
